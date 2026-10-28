"""Holds the finalizing calls of docs/approval.md for an approver when the caller may not finalize them alone.

Sits next to the RBAC guard (same shape: path table, bearer lookup in a worker thread). The RBAC guard runs first, so a
caller without the base grant is refused there; this layer only ever sees callers who are allowed to *try*.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.middleware.base import BaseHTTPMiddleware

from app.database import SessionLocal
from app.models.auth_session import AuthSession
from app.models.auth_user import AuthUser
from app.services.core import approval_gate as gate
from app.services.core.access_scope import scope_held_call
from app.services.core.approval_actions import ACTIONS, COMPILED

logger = logging.getLogger(__name__)

MUTATION_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


class ApprovalGateMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method not in MUTATION_METHODS:
            return await call_next(request)

        authorization = request.headers.get("authorization") or ""
        if not authorization.startswith("Bearer "):
            return await call_next(request)

        # cheap pre-check on the path alone, so the body is only read for the few endpoints that can be held
        tail = gate.tail_of(request.url.path)
        if tail is None or not any(
            a.method == request.method and COMPILED[a.key].fullmatch(tail) for a in ACTIONS
        ):
            return await call_next(request)

        body_raw = await request.body()
        action, params = gate.match_action(ACTIONS, COMPILED, request.method, request.url.path, gate.parse_body(body_raw))
        if action is None:
            return await call_next(request)

        token = authorization.removeprefix("Bearer ").strip()
        method, path, query = request.method, request.url.path, request.url.query

        def decide() -> tuple[JSONResponse | None, str | None]:
            """(answer, approver id). No answer = let the call run; the approver id is set when an approver finalizes it directly.
            Otherwise the call was stored and the answer is the 'sent for approval' reply. Runs in a worker thread."""
            db = SessionLocal()
            try:
                session = (
                    db.query(AuthSession)
                    .filter(AuthSession.token == token, AuthSession.expires_at > datetime.utcnow())
                    .first()
                )
                if not session:
                    return None, None  # the route answers 401 itself
                user = db.get(AuthUser, session.user_id)
                if not user or not user.is_active:
                    return None, None
                rights = gate.Rights(db, user)
                if rights.can_approve(action):
                    return None, user.id  # may finalize without asking
                if not rights.can_submit(action):
                    return None, None  # not even allowed to try: the endpoint answers 403 as it always did
                # the approver replays the call as themselves: the maker's own cash / bank and warehouse limits apply now
                held_body = gate.parse_body(body_raw)
                try:
                    scoped = scope_held_call(db, user, action.key, params, dict(held_body))
                except HTTPException as exc:
                    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}), None
                stored_body = json.dumps(scoped).encode() if scoped != held_body else body_raw
                row = gate.hold_call(
                    db,
                    user,
                    action,
                    method=method,
                    path=path,
                    query_string=query,
                    body_raw=stored_body,
                    path_params=params,
                )
                return (
                    JSONResponse(
                        status_code=202,
                        content={
                            "approval_pending": True,
                            "request_id": row.id,
                            "label": action.label,
                            "message": gate.pending_message(action.label),
                        },
                    ),
                    None,
                )
            except Exception:
                db.rollback()
                logger.exception("Approval gate failed for %s %s", method, path)
                raise
            finally:
                db.close()

        held, approver_id = await run_in_threadpool(decide)
        if held is not None:
            return held
        response = await call_next(request)
        if approver_id and action.closes_on_direct and response.status_code < 300:

            def close() -> None:
                db = SessionLocal()
                try:
                    user = db.get(AuthUser, approver_id)
                    if user is not None:
                        gate.close_requests_finalized_directly(db, user, action, params)
                except Exception:  # closing a request is bookkeeping: the finalize already succeeded
                    db.rollback()
                    logger.exception("Could not close the approval request for %s %s", method, path)
                finally:
                    db.close()

            await run_in_threadpool(close)
        return response
