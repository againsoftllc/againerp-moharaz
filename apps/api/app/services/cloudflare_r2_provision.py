"""Auto-configure R2 after Cloudflare OAuth / token connect."""

from __future__ import annotations

from datetime import datetime

import httpx
from sqlalchemy.orm import Session

from app.models.cloudflare_plugin import CloudflarePlugin
from app.services.cloudflare_client import CF_API, verify_r2_bucket

DEFAULT_R2_BUCKET = "againerp-media"


async def ensure_r2_bucket(row: CloudflarePlugin, bucket: str) -> str:
    """Create the R2 bucket if missing (OAuth workers-r2.write / Admin token)."""
    name = bucket.strip() or DEFAULT_R2_BUCKET
    token = row.api_token.strip()
    account_id = row.account_id.strip()
    if not token or not account_id:
        return name

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        listed = await client.get(f"{CF_API}/accounts/{account_id}/r2/buckets", headers=headers)
        body = listed.json()
        if listed.status_code < 400 and body.get("success"):
            names = [b.get("name") for b in (body.get("result") or {}).get("buckets", [])]
            if name in names:
                return name

        created = await client.post(
            f"{CF_API}/accounts/{account_id}/r2/buckets",
            headers=headers,
            json={"name": name},
        )
        created_body = created.json() if created.headers.get("content-type", "").startswith("application/json") else {}
        if created.status_code < 400 and created_body.get("success") is not False:
            return name
        # Bucket may already exist under another list shape — keep requested name.
        return name


async def provision_r2_after_connect(db: Session, row: CloudflarePlugin) -> str:
    """
    After a successful Cloudflare connect, wire R2 for media uploads.
    Returns a short status message for logs / UI.
    """
    if not row.api_token.strip() or not row.account_id.strip():
        return "skipped: missing token or account"

    if not row.r2_bucket.strip():
        row.r2_bucket = DEFAULT_R2_BUCKET

    row.r2_bucket = await ensure_r2_bucket(row, row.r2_bucket)
    # Keep existing public base URL if the user already configured one.
    if not row.r2_public_base_url.strip():
        # Leave empty — public_r2_url falls back to account endpoint until custom domain/r2.dev is set.
        pass

    result = await verify_r2_bucket(row)
    row.r2_status = result.status
    if result.status == "connected":
        row.media_storage = "r2"
        row.enabled = True
        row.installed = True
        row.verified_at = datetime.utcnow()
        db.commit()
        db.refresh(row)
        return f"R2 ready: bucket={row.r2_bucket} ({result.message})"

    db.commit()
    return f"R2 not ready: {result.message}"
