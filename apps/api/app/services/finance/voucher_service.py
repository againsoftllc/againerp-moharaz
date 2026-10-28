"""Hand-entered vouchers (OnerERP Debit / Credit / Contra / Journal) and voucher templates.

A voucher is a draft until it is approved. Approving posts one journal entry through `FinanceService._post_journal` (so the period
lock applies) and, for a voucher that moves money, the cash / bank payment rows that payment-account balances are built from.
Cancelling an approved voucher posts the mirror entry and mirror payments; nothing posted is edited or deleted.

Lines may not touch the heads other screens own: cash / bank heads (the voucher's own account field moves those), the customer and
supplier control accounts (Collection / Payment keep the party ledgers in step) and the cheque heads (the cheque register).
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.finance import FinanceAccount, FinanceJournalEntry, FinancePayment, FinancePaymentAccount
from app.models.finance_voucher import (
    VOUCHER_TYPES,
    FinanceVoucher,
    FinanceVoucherLine,
    FinanceVoucherTemplate,
    FinanceVoucherTemplateLine,
)
from app.services.core.sequence_service import next_number as allocate_number
from app.services.finance.constants import (
    AP_CODE,
    AR_CODE,
    CHEQUES_IN_HAND_CODE,
    CHEQUES_ISSUED_CODE,
    CHEQUES_UNDER_COLLECTION_CODE,
)
from app.services.finance.finance_service import FinanceService
from app.services.finance.posting import money

ZERO = Decimal("0")
SOURCE_TYPE = "voucher"
REVERSAL_SOURCE_TYPE = "voucher_reversal"
TYPE_LABELS = {"debit": "Debit voucher", "credit": "Credit voucher", "contra": "Contra voucher", "journal": "Journal voucher"}
OWNED_HEADS = {
    AR_CODE: "customer balances go through Collection or the customer ledger",
    AP_CODE: "supplier balances go through Payment or the supplier ledger",
    CHEQUES_IN_HAND_CODE: "cheques go through the cheque register",
    CHEQUES_UNDER_COLLECTION_CODE: "cheques go through the cheque register",
    CHEQUES_ISSUED_CODE: "cheques go through the cheque register",
}


def check_line_sides(voucher_type: str, lines: list[dict], *, allow_zero: bool = False) -> tuple[Decimal, Decimal]:
    """Pure rule check on (debit, credit) per line. Returns the debit and credit totals."""
    if voucher_type not in VOUCHER_TYPES:
        raise HTTPException(status_code=400, detail="Unknown voucher type")
    total_dr = total_cr = ZERO
    for index, line in enumerate(lines, start=1):
        dr, cr = money(line.get("debit")), money(line.get("credit"))
        if dr > 0 and cr > 0:
            raise HTTPException(status_code=400, detail=f"Line {index}: enter a debit or a credit, not both")
        if voucher_type == "debit" and cr > 0:
            raise HTTPException(status_code=400, detail=f"Line {index}: a debit voucher only debits heads; the cash / bank account is credited")
        if voucher_type == "credit" and dr > 0:
            raise HTTPException(status_code=400, detail=f"Line {index}: a credit voucher only credits heads; the cash / bank account is debited")
        total_dr += dr
        total_cr += cr
    if allow_zero:
        return total_dr, total_cr
    if voucher_type in ("debit", "credit"):
        if not lines or (total_dr + total_cr) <= 0:
            raise HTTPException(status_code=400, detail="Add at least one line with an amount")
    if voucher_type == "journal":
        if len(lines) < 2:
            raise HTTPException(status_code=400, detail="A journal needs at least two lines")
        if total_dr <= 0 or total_dr != total_cr:
            raise HTTPException(
                status_code=400, detail=f"Debits ({total_dr}) and credits ({total_cr}) must be equal and more than zero"
            )
    return total_dr, total_cr


class VoucherService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._finance = FinanceService(db)

    # ── checks ───────────────────────────────────────────────────────────────

    def _payment_account(self, company_id: str, account_id: Optional[str], label: str) -> FinancePaymentAccount:
        if not account_id:
            raise HTTPException(status_code=400, detail=f"Choose the {label}")
        account = self._finance.get_payment_account(account_id, company_id=company_id)
        if not account.is_active:
            raise HTTPException(status_code=400, detail=f"{account.name} is inactive")
        return account

    def _clean_lines(self, company_id: str, voucher_type: str, raw_lines: list, *, allow_zero: bool = False) -> list[dict]:
        if voucher_type == "contra":
            return []
        lines = [
            {
                "account_id": line.account_id,
                "description": (line.description or "").strip() or None,
                "debit": money(line.debit),
                "credit": money(line.credit),
                "cost_center_id": line.cost_center_id or None,
            }
            for line in raw_lines
            if allow_zero or money(line.debit) > 0 or money(line.credit) > 0
        ]
        cash_gl_ids = {
            row.gl_account_id
            for row in self._db.query(FinancePaymentAccount).filter(FinancePaymentAccount.company_id == company_id).all()
        }
        for index, line in enumerate(lines, start=1):
            account = self._db.get(FinanceAccount, line["account_id"])
            if not account or account.company_id != company_id:
                raise HTTPException(status_code=400, detail=f"Line {index}: account not found")
            if not account.is_active:
                raise HTTPException(status_code=400, detail=f"Line {index}: {account.code} {account.name} is inactive")
            if account.id in cash_gl_ids:
                raise HTTPException(
                    status_code=400,
                    detail=f"Line {index}: {account.code} {account.name} is a cash / bank head; use a debit, credit or contra voucher's account field",
                )
            if getattr(account, "is_postable", True) is False:
                raise HTTPException(status_code=400, detail=f"Line {index}: {account.code} {account.name} is a group account; pick one of its accounts")
            if account.code in OWNED_HEADS:
                raise HTTPException(
                    status_code=400, detail=f"Line {index}: {account.code} {account.name} cannot be used here: {OWNED_HEADS[account.code]}"
                )
        check_line_sides(voucher_type, lines, allow_zero=allow_zero)
        return lines

    def _check_accounts(self, company_id: str, voucher_type: str, from_id: Optional[str], to_id: Optional[str]) -> None:
        if voucher_type == "debit":
            self._payment_account(company_id, from_id, "account the money is paid from")
        elif voucher_type == "credit":
            self._payment_account(company_id, from_id, "account the money is received into")
        elif voucher_type == "contra":
            self._payment_account(company_id, from_id, "account the money leaves")
            self._payment_account(company_id, to_id, "account the money goes to")
            if from_id == to_id:
                raise HTTPException(status_code=400, detail="Choose two different accounts")

    # ── vouchers ─────────────────────────────────────────────────────────────

    def get(self, voucher_id: str, *, company_id: str) -> FinanceVoucher:
        voucher = self._db.get(FinanceVoucher, voucher_id)
        if not voucher or voucher.company_id != company_id:
            raise HTTPException(status_code=404, detail="Voucher not found")
        return voucher

    def lines(self, voucher_id: str) -> list[FinanceVoucherLine]:
        return (
            self._db.query(FinanceVoucherLine)
            .filter(FinanceVoucherLine.voucher_id == voucher_id)
            .order_by(FinanceVoucherLine.line_no)
            .all()
        )

    def list_vouchers(
        self,
        *,
        company_id: str,
        voucher_type: Optional[str] = None,
        status: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        search: Optional[str] = None,
        limit: int = 500,
        offset: int = 0,
    ) -> tuple[list[FinanceVoucher], int]:
        query = self._db.query(FinanceVoucher).filter(FinanceVoucher.company_id == company_id)
        if voucher_type:
            query = query.filter(FinanceVoucher.voucher_type == voucher_type)
        if status:
            query = query.filter(FinanceVoucher.status == status)
        if date_from:
            query = query.filter(FinanceVoucher.voucher_date >= date_from)
        if date_to:
            query = query.filter(FinanceVoucher.voucher_date <= date_to)
        if search and search.strip():
            like = f"%{search.strip()}%"
            query = query.filter(
                or_(FinanceVoucher.voucher_number.ilike(like), FinanceVoucher.description.ilike(like), FinanceVoucher.reference.ilike(like))
            )
        total = query.count()
        rows = (
            query.order_by(FinanceVoucher.voucher_date.desc(), FinanceVoucher.created_at.desc()).offset(offset).limit(limit).all()
        )
        return rows, total

    def _replace_lines(self, voucher: FinanceVoucher, lines: list[dict]) -> None:
        self._db.query(FinanceVoucherLine).filter(FinanceVoucherLine.voucher_id == voucher.id).delete()
        for index, line in enumerate(lines):
            self._db.add(FinanceVoucherLine(voucher_id=voucher.id, line_no=index, **line))

    def _amount(self, voucher_type: str, lines: list[dict], contra_amount) -> Decimal:
        if voucher_type == "contra":
            amount = money(contra_amount)
            if amount <= 0:
                raise HTTPException(status_code=400, detail="Enter the amount to move")
            return amount
        dr, cr = check_line_sides(voucher_type, lines)
        return cr if voucher_type == "credit" else dr

    def create(self, payload, *, company_id: str, actor: Optional[str]) -> FinanceVoucher:
        voucher_type = payload.voucher_type
        self._check_accounts(company_id, voucher_type, payload.payment_account_id, payload.to_payment_account_id)
        lines = self._clean_lines(company_id, voucher_type, payload.lines)
        voucher_date = payload.voucher_date or date.today()
        voucher = FinanceVoucher(
            company_id=company_id,
            voucher_number=allocate_number(self._db, company_id, f"finance.voucher.{voucher_type}", at=voucher_date),
            voucher_type=voucher_type,
            voucher_date=voucher_date,
            description=(payload.description or "").strip(),
            reference=(payload.reference or "").strip() or None,
            payment_account_id=payload.payment_account_id if voucher_type != "journal" else None,
            to_payment_account_id=payload.to_payment_account_id if voucher_type == "contra" else None,
            amount=self._amount(voucher_type, lines, payload.amount),
            status="draft",
            template_id=payload.template_id,
            created_by=actor,
        )
        self._db.add(voucher)
        self._db.flush()
        self._replace_lines(voucher, lines)
        self._db.flush()
        return voucher

    def update(self, voucher: FinanceVoucher, payload) -> FinanceVoucher:
        if voucher.status != "draft":
            raise HTTPException(status_code=400, detail="Only a draft voucher can be edited; cancel it and enter a new one")
        patch = payload.model_dump(exclude_unset=True)
        from_id = patch.get("payment_account_id", voucher.payment_account_id)
        to_id = patch.get("to_payment_account_id", voucher.to_payment_account_id)
        self._check_accounts(voucher.company_id, voucher.voucher_type, from_id, to_id)
        if payload.lines is not None:
            lines = self._clean_lines(voucher.company_id, voucher.voucher_type, payload.lines)
        else:
            lines = [
                {"account_id": l.account_id, "description": l.description, "debit": l.debit, "credit": l.credit, "cost_center_id": l.cost_center_id}
                for l in self.lines(voucher.id)
            ]
        if "voucher_date" in patch and patch["voucher_date"]:
            voucher.voucher_date = patch["voucher_date"]
        if "description" in patch:
            voucher.description = (patch["description"] or "").strip()
        if "reference" in patch:
            voucher.reference = (patch["reference"] or "").strip() or None
        if voucher.voucher_type != "journal":
            voucher.payment_account_id = from_id
        if voucher.voucher_type == "contra":
            voucher.to_payment_account_id = to_id
        voucher.amount = self._amount(voucher.voucher_type, lines, patch.get("amount", voucher.amount))
        if payload.lines is not None:
            self._replace_lines(voucher, lines)
        self._db.flush()
        return voucher

    def delete(self, voucher: FinanceVoucher) -> None:
        if voucher.status != "draft":
            raise HTTPException(status_code=400, detail="Only a draft voucher can be deleted; cancel an approved one")
        self._db.query(FinanceVoucherLine).filter(FinanceVoucherLine.voucher_id == voucher.id).delete()
        self._db.delete(voucher)
        self._db.flush()

    def _payment(self, voucher: FinanceVoucher, account: FinancePaymentAccount, direction: str, entry_id: str, *, source_type: str, transfer: bool) -> FinancePayment:
        payment = FinancePayment(
            company_id=voucher.company_id,
            payment_number=self._finance._next_payment_number(voucher.company_id),
            payment_date=voucher.voucher_date if source_type == SOURCE_TYPE else date.today(),
            amount=voucher.amount,
            payment_method=account.kind,
            payment_account_id=account.id,
            direction=direction,
            source_type=source_type,
            source_id=voucher.id,
            is_transfer=transfer,
            reference=voucher.voucher_number,
            notes=voucher.description or None,
            journal_entry_id=entry_id,
        )
        self._db.add(payment)
        return payment

    def approve(self, voucher: FinanceVoucher, *, actor: Optional[str]) -> FinanceVoucher:
        if voucher.status != "draft":
            raise HTTPException(status_code=400, detail=f"This voucher is already {voucher.status}")
        company_id = voucher.company_id
        vtype = voucher.voucher_type
        self._check_accounts(company_id, vtype, voucher.payment_account_id, voucher.to_payment_account_id)
        desc = voucher.description or TYPE_LABELS[vtype]
        specs: list[tuple] = []
        for line in self.lines(voucher.id):
            account = self._db.get(FinanceAccount, line.account_id)
            specs.append((account.code, line.debit, line.credit, line.description or desc, None, None, ZERO, line.cost_center_id))
        amount = money(voucher.amount)
        cash = self._db.get(FinancePaymentAccount, voucher.payment_account_id) if voucher.payment_account_id else None
        if vtype in ("debit", "contra"):  # money leaves this account
            from app.services.finance.master_service import assert_can_pay_out

            assert_can_pay_out(self._finance, cash, amount)
        if vtype == "debit":
            specs.append((self._finance._payment_account_gl_code(cash), ZERO, amount, desc, None, None, ZERO))
        elif vtype == "credit":
            specs.insert(0, (self._finance._payment_account_gl_code(cash), amount, ZERO, desc, None, None, ZERO))
        elif vtype == "contra":
            to = self._db.get(FinancePaymentAccount, voucher.to_payment_account_id)
            specs = [
                (self._finance._payment_account_gl_code(to), amount, ZERO, desc, None, None, ZERO),
                (self._finance._payment_account_gl_code(cash), ZERO, amount, desc, None, None, ZERO),
            ]
        entry = self._finance._post_journal(
            company_id=company_id,
            entry_date=voucher.voucher_date,
            description=f"{voucher.voucher_number} — {desc}"[:255],
            source_type=SOURCE_TYPE,
            source_id=voucher.id,
            lines=specs,
        )
        if vtype == "debit":
            self._payment(voucher, cash, "outbound", entry.id, source_type=SOURCE_TYPE, transfer=False)
        elif vtype == "credit":
            self._payment(voucher, cash, "inbound", entry.id, source_type=SOURCE_TYPE, transfer=False)
        elif vtype == "contra":
            self._payment(voucher, cash, "outbound", entry.id, source_type=SOURCE_TYPE, transfer=True)
            self._payment(voucher, to, "inbound", entry.id, source_type=SOURCE_TYPE, transfer=True)
        voucher.status = "approved"
        voucher.journal_entry_id = entry.id
        voucher.approved_by = actor
        voucher.approved_at = datetime.utcnow()
        self._db.flush()
        return voucher

    def cancel(self, voucher: FinanceVoucher, *, actor: Optional[str], reason: str) -> FinanceVoucher:
        if voucher.status != "approved":
            raise HTTPException(status_code=400, detail="Only an approved voucher can be cancelled; delete a draft instead")
        entry = self._finance.reverse_journal_entry(
            voucher.journal_entry_id,
            company_id=voucher.company_id,
            source_type=REVERSAL_SOURCE_TYPE,
            source_id=voucher.id,
            description=f"{voucher.voucher_number} cancelled — {reason}"[:255],
        )
        posted = (
            self._db.query(FinancePayment)
            .filter(
                FinancePayment.company_id == voucher.company_id,
                FinancePayment.source_type == SOURCE_TYPE,
                FinancePayment.source_id == voucher.id,
            )
            .all()
        )
        for payment in posted:
            account = self._db.get(FinancePaymentAccount, payment.payment_account_id)
            mirror = "inbound" if payment.direction == "outbound" else "outbound"
            self._payment(voucher, account, mirror, entry.id, source_type=REVERSAL_SOURCE_TYPE, transfer=payment.is_transfer)
        voucher.status = "cancelled"
        voucher.reversal_entry_id = entry.id
        voucher.cancelled_by = actor
        voucher.cancelled_at = datetime.utcnow()
        voucher.cancel_reason = reason.strip()
        self._db.flush()
        return voucher

    def entry_numbers(self, entry_ids: list[str]) -> dict[str, str]:
        ids = [i for i in entry_ids if i]
        if not ids:
            return {}
        rows = self._db.query(FinanceJournalEntry.id, FinanceJournalEntry.entry_number).filter(FinanceJournalEntry.id.in_(ids)).all()
        return dict(rows)

    # ── templates ────────────────────────────────────────────────────────────

    def get_template(self, template_id: str, *, company_id: str) -> FinanceVoucherTemplate:
        row = self._db.get(FinanceVoucherTemplate, template_id)
        if not row or row.company_id != company_id:
            raise HTTPException(status_code=404, detail="Voucher template not found")
        return row

    def template_lines(self, template_id: str) -> list[FinanceVoucherTemplateLine]:
        return (
            self._db.query(FinanceVoucherTemplateLine)
            .filter(FinanceVoucherTemplateLine.template_id == template_id)
            .order_by(FinanceVoucherTemplateLine.line_no)
            .all()
        )

    def list_templates(self, *, company_id: str, voucher_type: Optional[str] = None, include_inactive: bool = True) -> list[FinanceVoucherTemplate]:
        query = self._db.query(FinanceVoucherTemplate).filter(FinanceVoucherTemplate.company_id == company_id)
        if voucher_type:
            query = query.filter(FinanceVoucherTemplate.voucher_type == voucher_type)
        if not include_inactive:
            query = query.filter(FinanceVoucherTemplate.is_active.is_(True))
        return query.order_by(func.lower(FinanceVoucherTemplate.name)).all()

    def _unique_name(self, company_id: str, name: str, exclude_id: Optional[str] = None) -> str:
        clean = name.strip()
        query = self._db.query(FinanceVoucherTemplate.id).filter(
            FinanceVoucherTemplate.company_id == company_id, func.lower(FinanceVoucherTemplate.name) == clean.lower()
        )
        if exclude_id:
            query = query.filter(FinanceVoucherTemplate.id != exclude_id)
        if query.first():
            raise HTTPException(status_code=400, detail=f"A template named {clean} already exists")
        return clean

    def _replace_template_lines(self, template: FinanceVoucherTemplate, lines: list[dict]) -> None:
        self._db.query(FinanceVoucherTemplateLine).filter(FinanceVoucherTemplateLine.template_id == template.id).delete()
        for index, line in enumerate(lines):
            self._db.add(FinanceVoucherTemplateLine(template_id=template.id, line_no=index, **line))

    def create_template(self, payload, *, company_id: str) -> FinanceVoucherTemplate:
        vtype = payload.voucher_type
        lines = self._clean_lines(company_id, vtype, payload.lines, allow_zero=True)
        template = FinanceVoucherTemplate(
            company_id=company_id,
            name=self._unique_name(company_id, payload.name),
            voucher_type=vtype,
            description=(payload.description or "").strip(),
            payment_account_id=payload.payment_account_id if vtype != "journal" else None,
            to_payment_account_id=payload.to_payment_account_id if vtype == "contra" else None,
            amount=money(payload.amount) if vtype == "contra" else ZERO,
            is_active=payload.is_active,
        )
        self._db.add(template)
        self._db.flush()
        self._replace_template_lines(template, lines)
        self._db.flush()
        return template

    def update_template(self, template: FinanceVoucherTemplate, payload) -> FinanceVoucherTemplate:
        patch = payload.model_dump(exclude_unset=True)
        if "name" in patch and patch["name"]:
            template.name = self._unique_name(template.company_id, patch["name"], exclude_id=template.id)
        if "description" in patch:
            template.description = (patch["description"] or "").strip()
        if "is_active" in patch and patch["is_active"] is not None:
            template.is_active = patch["is_active"]
        if template.voucher_type != "journal" and "payment_account_id" in patch:
            template.payment_account_id = patch["payment_account_id"]
        if template.voucher_type == "contra":
            if "to_payment_account_id" in patch:
                template.to_payment_account_id = patch["to_payment_account_id"]
            if patch.get("amount") is not None:
                template.amount = money(patch["amount"])
        if payload.lines is not None:
            self._replace_template_lines(
                template, self._clean_lines(template.company_id, template.voucher_type, payload.lines, allow_zero=True)
            )
        self._db.flush()
        return template

    def delete_template(self, template: FinanceVoucherTemplate) -> None:
        self._db.query(FinanceVoucherTemplateLine).filter(FinanceVoucherTemplateLine.template_id == template.id).delete()
        self._db.delete(template)
        self._db.flush()
