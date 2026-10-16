"""How every ERP tool reaches business data — STEP 05.

A tool handler never imports a router function or a service and calls it
directly. Reason: several router functions in this codebase (e.g.
`commerce_customers.list_customers`) take `Query(...)` / `Depends(...)` as
their actual Python default values — those are FastAPI sentinels, only
unwrapped into real values by FastAPI's own request handling. Call such a
function directly with an argument omitted and you get the sentinel object
itself, not `None`; worse, a bare `Depends(require_permission(...))` used as
a default is inert outside of FastAPI's dependency injection — the
permission check inside it never runs. Reimplementing each tool against
router internals would mean re-deriving that specific pitfall correctly, for
every tool, forever.

Instead every tool calls the ERP's own public API over HTTP, forwarding the
*same bearer token* the end user's request carried. This makes the
non-negotiable rule in docs/AGAINERP_AI_OS_MASTER_PLAN.md §11 — "AI
permission can never exceed the calling user's permission" — true by
construction: the call is authenticated as that user, hits the exact same
`require_permission` dependency, the exact same tenant filter, the exact
same validation and serialization as if the user had called the endpoint
themselves. There is no second permission model to keep in sync.
"""

from __future__ import annotations

import os

import httpx

from app.config import get_settings


class InternalApiError(Exception):
    """Wraps a non-2xx response from an internal call — message is safe to
    return to the model as a tool error (no headers, no stack trace)."""

    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"HTTP {status_code}: {detail}")


def _base_url() -> str:
    # Same-container loopback — this runs inside the FastAPI process itself.
    # Hosted runtimes (Railway, Render, Fly) start uvicorn on the platform's $PORT
    # rather than the configured api_port, so prefer that when present.
    port = (os.environ.get("PORT") or "").strip()
    if not port.isdigit():
        port = str(get_settings().api_port)
    return f"http://127.0.0.1:{port}"


def internal_get(path: str, *, bearer_token: str, params: dict | None = None) -> dict:
    return _call("GET", path, bearer_token=bearer_token, params=params)


def internal_post(path: str, *, bearer_token: str, json: dict | None = None) -> dict:
    return _call("POST", path, bearer_token=bearer_token, json=json)


def _call(
    method: str,
    path: str,
    *,
    bearer_token: str,
    params: dict | None = None,
    json: dict | None = None,
) -> dict:
    try:
        with httpx.Client(timeout=15.0) as client:
            res = client.request(
                method,
                f"{_base_url()}{path}",
                headers={"Authorization": f"Bearer {bearer_token}"},
                params=params,
                json=json,
            )
    except httpx.HTTPError as exc:
        raise InternalApiError(0, f"Internal request failed: {exc}") from exc

    if res.status_code >= 400:
        detail = res.text
        try:
            body = res.json()
            detail = body.get("detail", detail) if isinstance(body, dict) else detail
        except ValueError:
            pass
        raise InternalApiError(res.status_code, str(detail)[:500])

    return res.json() if res.content else {}
