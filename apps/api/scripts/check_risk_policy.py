"""Fail when an AI tool breaks the risk policy (docs/AI/ai.md, step 1.4).

Every tool that changes data must be two-step (preview, then confirm=true) unless it is on the explicit exemption list, and bulk arrays
are capped. Run it in CI / before a deploy:

    python -m scripts.check_risk_policy        # exit code 1 on any violation
"""
from __future__ import annotations

import sys

import scripts.init_db  # noqa: F401
from app.database import SessionLocal
from app.models.auth_user import AuthUser
from app.services.ai.risk_policy import EXEMPT_ONE_STEP, MAX_LINES, RISKY, has_confirm, violations
from app.services.ai.tools.registry import build_tools, build_tools_unpoliced


def main() -> int:
    db = SessionLocal()
    user = db.query(AuthUser).filter(AuthUser.role == "admin").first() or db.query(AuthUser).first()
    raw = build_tools_unpoliced("check", db=db, company_id=user.company_id, user=user)
    generic = sorted(t.definition.name for t in raw if t.risk_tier in RISKY and t.definition.name not in EXEMPT_ONE_STEP and not has_confirm(t))
    tools = build_tools("check", db=db, company_id=user.company_id, user=user)
    bad = violations(tools)
    risky = [t for t in tools if t.risk_tier in RISKY]
    capped = [t.definition.name for t in tools if t.risk_tier in RISKY and any(
        ((t.definition.input_schema.get("properties") or {}).get(k) or {}).get("type") == "array" for k in ("lines", "items"))]
    print(f"{len(tools)} tools, {len(risky)} change data, {sum(has_confirm(t) for t in risky)} are two-step, exempt: {sorted(EXEMPT_ONE_STEP)}")
    print(f"tools that had no preview of their own (now get the generic echo preview - give them a real one when you touch them): {generic}")
    print(f"bulk limit {MAX_LINES} lines applies to: {capped}")
    for line in bad:
        print("VIOLATION:", line)
    db.close()
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
