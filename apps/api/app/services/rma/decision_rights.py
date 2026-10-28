"""Who may decide an RMA document (docs/approval.md).

The five RMA documents (complaint, customer delivery, supplier claim, supplier receipt, settlement) each have an own privileged
right (`rma_approve`, `rma_delivery_approve`, ...). The approval system adds the plain **Approve** permission on the RMA
module on top: a role that has it decides every RMA document, exactly as it finalizes a purchase or a sale, so nobody has to
tick five extra boxes. Holding the privileged right alone keeps working too, so no existing right is lost.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.auth_user import AuthUser
from app.services import rbac


def may_decide(db: Session, user: AuthUser, privileged_module: str) -> bool:
    return rbac.has_permission(db, user, privileged_module, "write") or rbac.has_permission(db, user, "rma", "approve")


def need_to_decide(db: Session, user: AuthUser, privileged_module: str, what: str) -> None:
    if not may_decide(db, user, privileged_module):
        raise HTTPException(status_code=403, detail=f"You need the RMA permission to {what}.")
