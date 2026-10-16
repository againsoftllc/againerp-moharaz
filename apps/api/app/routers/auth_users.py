from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import (
    get_current_company_id,
    get_current_user,
    require_admin_user,
    require_system_manager,
)
from app.models.auth_activity_log import AuthActivityLog
from app.models.auth_role import AuthRole
from app.models.auth_session import AuthSession
from app.models.auth_user import AuthUser
from app.schemas.auth import (
    MentionableUserListResponse,
    MentionableUserRead,
    UserCreate,
    UserListMeta,
    UserListResponse,
    UserRead,
    UserResponse,
    UserUpdate,
)
from app.security import hash_password
from app.services import rbac as rbac_service
from app.services.auth_user_read import user_read as _user_read

router = APIRouter(prefix="/users", tags=["auth-users"])


def _scoped_user(db: Session, user_id: str, company_id: str) -> AuthUser:
    row = db.get(AuthUser, user_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="User not found")
    return row


def _resolve_role_ids(
    db: Session,
    role_ids: Optional[list[str]],
    legacy_role: Optional[str],
    company_id: str,
) -> list[str]:
    """Role ids to assign, restricted to what this company may use.

    Slug lookups go through the company-visible set so a custom role belonging
    to another tenant can never be resolved by name.
    """
    visible = lambda: rbac_service.visible_roles_query(db, company_id)  # noqa: E731

    if role_ids:
        wanted = list(dict.fromkeys(role_ids))
        allowed = {r.id for r in visible().filter(AuthRole.id.in_(wanted)).all()}
        missing = [rid for rid in wanted if rid not in allowed]
        if missing:
            raise HTTPException(status_code=400, detail="One or more roles are invalid")
        return wanted

    if legacy_role:
        slug = rbac_service.LEGACY_ROLE_TO_SLUG.get(legacy_role, legacy_role)
        role = visible().filter(AuthRole.slug == slug).first()
        if role:
            return [role.id]
        # treat as custom slug
        role = visible().filter(AuthRole.slug == legacy_role).first()
        if role:
            return [role.id]

    # default staff
    staff = visible().filter(AuthRole.slug == "staff").first()
    if not staff:
        raise HTTPException(status_code=500, detail="Staff role is not seeded")
    return [staff.id]


def _log(
    db: Session,
    *,
    user_id: str,
    action: str,
    detail: Optional[str] = None,
    actor: Optional[AuthUser] = None,
) -> None:
    db.add(AuthActivityLog(
        id=str(uuid.uuid4()),
        user_id=user_id,
        actor_id=actor.id if actor else None,
        actor_name=actor.name if actor else None,
        action=action,
        detail=detail,
    ))


def _dual_log(
    db: Session,
    *,
    target: AuthUser,
    actor: AuthUser,
    target_action: str,
    actor_action: str,
    target_detail: str,
    actor_detail: str,
) -> None:
    _log(db, user_id=target.id, action=target_action, detail=target_detail, actor=actor)
    if actor.id != target.id:
        _log(db, user_id=actor.id, action=actor_action, detail=actor_detail, actor=actor)


@router.post("", response_model=UserResponse, status_code=201)
def create_user(
    payload: UserCreate,
    actor: AuthUser = Depends(require_system_manager),
    db: Session = Depends(get_db),
) -> UserResponse:
    if db.query(AuthUser).filter(AuthUser.email == payload.email.lower()).first():
        raise HTTPException(status_code=409, detail="Email already in use")
    if db.query(AuthUser).filter(AuthUser.username == payload.username.lower()).first():
        raise HTTPException(status_code=409, detail="Username already taken")

    try:
        role_ids = _resolve_role_ids(db, payload.role_ids, payload.role, actor.company_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    user = AuthUser(
        company_id=actor.company_id,
        email=payload.email.lower().strip(),
        username=payload.username.lower().strip(),
        name=payload.name.strip(),
        role="staff",
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    db.add(user)
    db.flush()
    try:
        roles = rbac_service.set_user_roles(db, user, role_ids)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    _dual_log(
        db,
        target=user, actor=actor,
        target_action="account_created",
        actor_action="created_account",
        target_detail=f"Account created by {actor.name}",
        actor_detail=f"Created account for {user.name} ({', '.join(r.slug for r in roles)})",
    )
    db.commit()
    db.refresh(user)
    return UserResponse(data=_user_read(db, user))


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: str,
    actor: AuthUser = Depends(require_system_manager),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> None:
    row = _scoped_user(db, user_id, company_id)
    if row.id == actor.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    _log(db, user_id=actor.id, action="deleted_account",
         detail=f"Removed {row.name} ({row.email}) from the team", actor=actor)
    db.commit()
    db.delete(row)
    db.commit()


@router.get("/mentionable", response_model=MentionableUserListResponse)
def list_mentionable_users(
    _: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> MentionableUserListResponse:
    rows = (
        db.query(AuthUser)
        .filter(AuthUser.is_active.is_(True), AuthUser.company_id == company_id)
        .order_by(AuthUser.name)
        .all()
    )
    return MentionableUserListResponse(
        data=[
            MentionableUserRead(
                id=row.id,
                username=row.username,
                name=row.name,
                role=row.role,
            )
            for row in rows
        ]
    )


@router.get("", response_model=UserListResponse)
def list_users(
    _: AuthUser = Depends(require_admin_user),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> UserListResponse:
    rows = db.query(AuthUser).filter(AuthUser.company_id == company_id).order_by(AuthUser.name).all()
    return UserListResponse(
        data=[_user_read(db, row) for row in rows],
        meta=UserListMeta(count=len(rows)),
    )


@router.get("/{user_id}/activity")
def get_user_activity(
    user_id: str,
    limit: int = 50,
    _: AuthUser = Depends(require_admin_user),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> dict:
    row = _scoped_user(db, user_id, company_id)
    logs = (
        db.query(AuthActivityLog)
        .filter(AuthActivityLog.user_id == user_id)
        .order_by(AuthActivityLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return {
        "data": [
            {
                "id": log.id,
                "action": log.action,
                "detail": log.detail,
                "actor_id": log.actor_id,
                "actor_name": log.actor_name,
                "created_at": log.created_at.isoformat(),
            }
            for log in logs
        ]
    }


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: str,
    _: AuthUser = Depends(require_admin_user),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> UserResponse:
    row = _scoped_user(db, user_id, company_id)
    return UserResponse(data=_user_read(db, row))


@router.patch("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: str,
    payload: UserUpdate,
    actor: AuthUser = Depends(require_system_manager),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> UserResponse:
    row = _scoped_user(db, user_id, company_id)
    if row.id == actor.id and payload.is_active is False:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return UserResponse(data=_user_read(db, row))

    if "email" in changes:
        taken = db.query(AuthUser).filter(
            AuthUser.email == changes["email"].lower(),
            AuthUser.id != row.id,
        ).first()
        if taken:
            raise HTTPException(status_code=409, detail="Email already in use")
        changes["email"] = changes["email"].lower().strip()

    if "username" in changes:
        taken = db.query(AuthUser).filter(
            AuthUser.username == changes["username"].lower(),
            AuthUser.id != row.id,
        ).first()
        if taken:
            raise HTTPException(status_code=409, detail="Username already taken")
        changes["username"] = changes["username"].lower().strip()

    isSelf = actor.id == row.id

    if "is_active" in changes:
        activating = changes["is_active"]
        action_word = "Reactivated" if activating else "Deactivated"
        _dual_log(
            db,
            target=row, actor=actor,
            target_action="reactivated" if activating else "deactivated",
            actor_action="reactivated_user" if activating else "deactivated_user",
            target_detail=f"{action_word} by {actor.name}",
            actor_detail=f"{action_word} {row.name}",
        )

    role_ids = changes.pop("role_ids", None)
    legacy_role = changes.pop("role", None)
    if role_ids is not None or legacy_role is not None:
        try:
            resolved = _resolve_role_ids(db, role_ids, legacy_role, actor.company_id)
            roles = rbac_service.set_user_roles(db, row, resolved)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        _dual_log(
            db,
            target=row, actor=actor,
            target_action="role_changed",
            actor_action="changed_role",
            target_detail=f"Roles set to {', '.join(r.name for r in roles)} by {actor.name}",
            actor_detail=f"Changed {row.name}'s roles to {', '.join(r.name for r in roles)}",
        )

    info_parts_target: list[str] = []
    info_parts_actor: list[str] = []
    for field in ("name", "email", "username"):
        if field not in changes:
            continue
        new_val = changes[field]
        if field == "name":
            info_parts_target.append(f"Name changed to {new_val}")
            info_parts_actor.append(f"Changed {row.name}'s name to {new_val}")
        elif field == "email":
            info_parts_target.append(f"Email changed to {new_val}")
            info_parts_actor.append(f"Changed {row.name}'s email to {new_val}")
        elif field == "username":
            info_parts_target.append(f"Username changed to @{new_val}")
            info_parts_actor.append(f"Changed {row.name}'s username to @{new_val}")

    if "password" in changes:
        info_parts_target.append("Password changed by " + (actor.name if not isSelf else "you"))
        if not isSelf:
            info_parts_actor.append(f"Changed {row.name}'s password")

    if info_parts_target:
        _dual_log(
            db,
            target=row, actor=actor,
            target_action="profile_updated",
            actor_action="updated_profile",
            target_detail="; ".join(info_parts_target),
            actor_detail="; ".join(info_parts_actor) if info_parts_actor else "; ".join(info_parts_target),
        )

    if "password" in changes:
        row.password_hash = hash_password(changes.pop("password"))
        if not isSelf:
            # Old tokens must stop working, otherwise the member stays signed in
            # with the password an admin just replaced. Self-changes keep their
            # session so the admin is not logged out mid-edit.
            db.query(AuthSession).filter(AuthSession.user_id == row.id).delete(
                synchronize_session=False
            )

    for key, value in changes.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    return UserResponse(data=_user_read(db, row))
