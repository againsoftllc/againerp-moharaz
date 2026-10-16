"""Shared, read-only Party-link auditing logic — Phase 1.

Used by both audit_party_links.py (report-only) and backfill_party_links.py
(which runs this same counting logic before and after a backfill to prove
what actually changed). No function in this module writes to the database.

Terminology, defined once here so both scripts agree:
  - unlinked        party_id IS NULL — no Party link exists at all.
  - dangling        party_id IS NOT NULL but no Party row with that id
                     exists — a broken reference. (This is what the Phase
                     spec calls both "invalid_party_links" and "missing
                     Party records" — they describe the same condition.)
  - cross_company   party_id points at a real Party row, but that Party's
                     company_id does not match the entity's own company_id.
                     Classified CRITICAL_INVALID_LINK per the Phase 1 spec.
  - missing_role    party_id points at a real, same-company Party, but no
                     PartyRole(party_id, role=<this entity's role>) exists.

Note on `entity.id == entity.party_id`: this holds for every record created
through the natural ensure_party_for_* path (commerce_party_bridge.py sets
party_id = the source row's own id, always). It is *legitimately* broken
for records manually linked to a different, existing Party via the "Also a
customer/supplier/vendor" UI (party_commerce_links.py's `_retarget`), which
re-points party_id at another party's id on purpose — that is a correct
dual-role link, not a bug. This module never treats id != party_id as an
error; it only checks existence, company match, and role presence.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Type

from sqlalchemy.orm import Session

from app.models.commerce_customer import CommerceCustomer
from app.models.commerce_supplier import CommerceSupplier
from app.models.party import Party
from app.models.party_role import PartyRole
from app.models.vendor.vendor import Vendor
from app.services.parties.party_commerce_links import _digits, _email_key

ENTITY_ROLE = {
    "customer": "customer",
    "supplier": "supplier",
    "vendor": "vendor",
}

ENTITY_MODEL: dict[str, Type] = {
    "customer": CommerceCustomer,
    "supplier": CommerceSupplier,
    "vendor": Vendor,
}


@dataclass
class LinkIssue:
    entity_type: str
    entity_id: str
    company_id: str
    party_id: Optional[str]
    reason: str


@dataclass
class EntityAuditResult:
    entity_type: str
    total: int = 0
    linked: int = 0
    unlinked: int = 0
    dangling: int = 0
    cross_company: int = 0
    missing_role: int = 0
    by_company_unlinked: dict[str, int] = field(default_factory=dict)
    issues: list[LinkIssue] = field(default_factory=list)


def audit_entity(db: Session, entity_type: str, *, company_id: Optional[str] = None) -> EntityAuditResult:
    """Read-only. Never writes. Never calls db.flush()/db.commit()."""
    model = ENTITY_MODEL[entity_type]
    role = ENTITY_ROLE[entity_type]

    query = db.query(model)
    if company_id:
        query = query.filter(model.company_id == company_id)
    rows = query.all()

    result = EntityAuditResult(entity_type=entity_type, total=len(rows))

    # Batch-load every referenced Party in one query instead of N+1.
    party_ids = {row.party_id for row in rows if row.party_id}
    parties_by_id: dict[str, Party] = {}
    if party_ids:
        for party in db.query(Party).filter(Party.id.in_(party_ids)).all():
            parties_by_id[party.id] = party

    role_pairs = set()
    if party_ids:
        role_pairs = {
            (r.party_id, r.role)
            for r in db.query(PartyRole.party_id, PartyRole.role)
            .filter(PartyRole.party_id.in_(party_ids), PartyRole.role == role)
            .all()
        }

    for row in rows:
        if not row.party_id:
            result.unlinked += 1
            result.by_company_unlinked[row.company_id] = result.by_company_unlinked.get(row.company_id, 0) + 1
            continue

        result.linked += 1
        party = parties_by_id.get(row.party_id)
        if party is None:
            result.dangling += 1
            result.issues.append(
                LinkIssue(
                    entity_type=entity_type,
                    entity_id=row.id,
                    company_id=row.company_id,
                    party_id=row.party_id,
                    reason=f"party_id={row.party_id!r} does not reference any existing Party row",
                )
            )
            continue

        if party.company_id != row.company_id:
            result.cross_company += 1
            result.issues.append(
                LinkIssue(
                    entity_type=entity_type,
                    entity_id=row.id,
                    company_id=row.company_id,
                    party_id=row.party_id,
                    reason=(
                        f"CRITICAL_INVALID_LINK: entity.company_id={row.company_id!r} but "
                        f"Party({row.party_id}).company_id={party.company_id!r}"
                    ),
                )
            )
            continue

        if (row.party_id, role) not in role_pairs:
            result.missing_role += 1
            result.issues.append(
                LinkIssue(
                    entity_type=entity_type,
                    entity_id=row.id,
                    company_id=row.company_id,
                    party_id=row.party_id,
                    reason=f"Party({row.party_id}) exists and is same-company, but has no {role!r} PartyRole",
                )
            )

    return result


def audit_all(db: Session, *, company_id: Optional[str] = None) -> dict[str, EntityAuditResult]:
    return {entity: audit_entity(db, entity, company_id=company_id) for entity in ENTITY_MODEL}


# --------------------------------------------------------------------------
# Duplicate candidate detection (cross-role only — e.g. a customer row and a
# supplier row that look like the same real-world party but aren't linked to
# the same Party yet). Same-type duplicates (two customer rows for the same
# person) are a related but separate concern, out of scope for Phase 1.
# --------------------------------------------------------------------------


@dataclass
class DuplicateCandidate:
    confidence: str  # "EXACT" | "STRONG" | "POSSIBLE"
    reason: str
    a_type: str
    a_id: str
    a_code: str
    a_name: str
    b_type: str
    b_id: str
    b_code: str
    b_name: str
    company_id: str


def _normalized_name(value: Optional[str]) -> str:
    return " ".join((value or "").strip().lower().split())


def _tax_id(entity_type: str, row) -> str:
    if entity_type == "supplier":
        return (row.tax_id or "").strip().upper()
    if entity_type == "vendor":
        return (row.vat_tax_id or row.bin_tin or "").strip().upper()
    return ""


def _entity_code(entity_type: str, row) -> str:
    if entity_type == "customer":
        return row.customer_code
    if entity_type == "supplier":
        return row.vendor_code
    return row.vendor_code


def _entity_name(entity_type: str, row) -> str:
    if entity_type == "vendor":
        return row.display_name or row.company_name
    return row.name


_COMMON_VALUE_THRESHOLD = 3  # a phone/email/tax_id shared by this many+ distinct
# records within a company is treated as a shared placeholder (e.g. everyone's
# demo data seeded with the same setup-person's phone number), not a real
# duplicate signal. Verified against real data during Phase 1 testing: one
# phone number ("01642324294") was found on 7 unrelated demo/seed records
# across all three entity types — matching on it naively would have produced
# 13+ false "STRONG" duplicate candidates from that one shared value alone.


def find_duplicate_candidates(
    db: Session, *, company_id: Optional[str] = None
) -> list[DuplicateCandidate]:
    """Read-only. Compares customer/supplier/vendor rows pairwise, within the
    same company, across different entity types, and reports — never merges —
    likely-same-party candidates that are not already linked to one Party."""
    records: list[dict] = []
    for entity_type in ENTITY_MODEL:
        model = ENTITY_MODEL[entity_type]
        query = db.query(model)
        if company_id:
            query = query.filter(model.company_id == company_id)
        for row in query.all():
            records.append(
                {
                    "entity_type": entity_type,
                    "id": row.id,
                    "code": _entity_code(entity_type, row),
                    "name": _entity_name(entity_type, row),
                    "phone_digits": _digits(row.phone),
                    "email_key": _email_key(row.email),
                    "tax_id": _tax_id(entity_type, row),
                    "company_id": row.company_id,
                    "party_id": row.party_id,
                }
            )

    by_company: dict[str, list[dict]] = {}
    for rec in records:
        by_company.setdefault(rec["company_id"], []).append(rec)

    candidates: list[DuplicateCandidate] = []
    for company, recs in by_company.items():
        phone_counts: dict[str, int] = {}
        email_counts: dict[str, int] = {}
        tax_counts: dict[str, int] = {}
        for rec in recs:
            if rec["phone_digits"]:
                phone_counts[rec["phone_digits"]] = phone_counts.get(rec["phone_digits"], 0) + 1
            if rec["email_key"]:
                email_counts[rec["email_key"]] = email_counts.get(rec["email_key"], 0) + 1
            if rec["tax_id"]:
                tax_counts[rec["tax_id"]] = tax_counts.get(rec["tax_id"], 0) + 1

        common_phones = {v for v, n in phone_counts.items() if n >= _COMMON_VALUE_THRESHOLD}
        common_emails = {v for v, n in email_counts.items() if n >= _COMMON_VALUE_THRESHOLD}
        common_tax_ids = {v for v, n in tax_counts.items() if n >= _COMMON_VALUE_THRESHOLD}

        for i in range(len(recs)):
            for j in range(i + 1, len(recs)):
                a, b = recs[i], recs[j]
                if a["entity_type"] == b["entity_type"]:
                    continue  # cross-role matching only, see module docstring
                if a["party_id"] and b["party_id"] and a["party_id"] == b["party_id"]:
                    continue  # already correctly linked as one Party — not a candidate

                phone_matches = (
                    a["phone_digits"]
                    and a["phone_digits"] == b["phone_digits"]
                    and a["phone_digits"] not in common_phones
                )
                email_matches = (
                    a["email_key"]
                    and a["email_key"] == b["email_key"]
                    and a["email_key"] not in common_emails
                )
                tax_matches = (
                    a["tax_id"] and b["tax_id"] and a["tax_id"] == b["tax_id"] and a["tax_id"] not in common_tax_ids
                )

                confidence: Optional[str] = None
                reason = ""
                if tax_matches:
                    confidence, reason = "EXACT", f"tax/registration id match ({a['tax_id']})"
                elif phone_matches and email_matches:
                    confidence, reason = "EXACT", "phone and email both match"
                elif phone_matches:
                    confidence, reason = "STRONG", "phone match"
                elif email_matches:
                    confidence, reason = "STRONG", "email match"
                elif (
                    _normalized_name(a["name"])
                    and _normalized_name(a["name"]) == _normalized_name(b["name"])
                ):
                    confidence, reason = "POSSIBLE", "normalized name match only"

                if confidence:
                    candidates.append(
                        DuplicateCandidate(
                            confidence=confidence,
                            reason=reason,
                            a_type=a["entity_type"],
                            a_id=a["id"],
                            a_code=a["code"],
                            a_name=a["name"],
                            b_type=b["entity_type"],
                            b_id=b["id"],
                            b_code=b["code"],
                            b_name=b["name"],
                            company_id=company,
                        )
                    )

    order = {"EXACT": 0, "STRONG": 1, "POSSIBLE": 2}
    candidates.sort(key=lambda c: order[c.confidence])
    return candidates
