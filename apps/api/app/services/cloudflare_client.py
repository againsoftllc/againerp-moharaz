from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Optional

import httpx

from app.models.cloudflare_plugin import CloudflarePlugin

CF_API = "https://api.cloudflare.com/client/v4"

# api_token → (access_key_id, secret) for S3-compatible R2 uploads
_derived_s3_cache: dict[str, tuple[str, str]] = {}


class CloudflareError(Exception):
    pass


@dataclass
class CloudflareVerifyResult:
    status: str
    message: str = ""


def _mask_hint(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 4:
        return "****"
    return f"…{value[-4:]}"


def _cf_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token.strip()}",
        "Content-Type": "application/json",
    }


def _s3_client(row: CloudflarePlugin, access_key_id: str, secret_access_key: str):
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=f"https://{row.account_id.strip()}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        region_name="auto",
        config=Config(connect_timeout=5, read_timeout=60, retries={"max_attempts": 2}),
    )


def derive_r2_s3_credentials(api_token: str) -> tuple[str, str]:
    """Map a Cloudflare API token to R2 S3 credentials.

    Access Key ID = token id; Secret Access Key = SHA-256(token value).
    See: https://developers.cloudflare.com/r2/api/tokens/
    Object-scoped R2 tokens must use the S3 API — REST returns "Authentication error".
    """
    token = api_token.strip()
    if len(token) < 8:
        raise CloudflareError("Cloudflare API token is required for R2")

    cached = _derived_s3_cache.get(token)
    if cached:
        return cached

    with httpx.Client(timeout=20.0) as client:
        res = client.get(f"{CF_API}/user/tokens/verify", headers=_cf_headers(token))
        body = res.json() if "application/json" in (res.headers.get("content-type") or "") else {}
        if not body.get("success"):
            raise CloudflareError(
                "Could not derive R2 S3 keys from API token. "
                "In Cloudflare → R2 → Manage R2 API Tokens, create Object Read & Write keys "
                "and paste Access Key ID + Secret into Settings → Plugins → Cloudflare."
            )
        token_id = str((body.get("result") or {}).get("id") or "").strip()
        if not token_id:
            raise CloudflareError("Cloudflare token verify returned no token id")

    secret = hashlib.sha256(token.encode("utf-8")).hexdigest()
    _derived_s3_cache[token] = (token_id, secret)
    return token_id, secret


def resolve_r2_s3_credentials(row: CloudflarePlugin) -> tuple[str, str]:
    if row.r2_access_key_id.strip() and row.r2_secret_access_key.strip():
        return row.r2_access_key_id.strip(), row.r2_secret_access_key.strip()
    if row.api_token.strip():
        return derive_r2_s3_credentials(row.api_token)
    raise CloudflareError(
        "R2 credentials missing. Add R2 Access Key ID + Secret Access Key "
        "(Cloudflare → R2 → Manage R2 API Tokens) in Settings → Plugins → Cloudflare."
    )


async def resolve_account_from_token(api_token: str) -> tuple[str, str]:
    """Return (account_id, account_name) for the first account visible to this token."""
    token = api_token.strip()
    if len(token) < 8:
        return "", ""
    async with httpx.AsyncClient(timeout=20.0) as client:
        res = await client.get(f"{CF_API}/accounts", headers=_cf_headers(token))
        body = res.json()
        if not body.get("success"):
            return "", ""
        accounts = body.get("result") or []
        if not accounts:
            return "", ""
        account = accounts[0]
        return str(account.get("id") or ""), str(account.get("name") or "Cloudflare Account")


async def verify_account_token(account_id: str, api_token: str) -> CloudflareVerifyResult:
    token = api_token.strip()
    if len(token) < 8:
        return CloudflareVerifyResult("disconnected", "API token is required")

    async with httpx.AsyncClient(timeout=20.0) as client:
        aid = account_id.strip()
        if not aid:
            resolved_id, _name = await resolve_account_from_token(token)
            if not resolved_id:
                return CloudflareVerifyResult(
                    "disconnected",
                    "Account ID is required (or token must allow listing accounts)",
                )
            aid = resolved_id

        account_res = await client.get(
            f"{CF_API}/accounts/{aid}",
            headers=_cf_headers(token),
        )
        account_body = account_res.json()
        if account_res.status_code == 200 and account_body.get("success"):
            return CloudflareVerifyResult("connected", "Cloudflare account verified")

        verify_res = await client.get(f"{CF_API}/user/tokens/verify", headers=_cf_headers(token))
        verify_body = verify_res.json()
        if verify_body.get("success"):
            return CloudflareVerifyResult("connected", "Cloudflare account verified")

        errors = account_body.get("errors", [])
        msg = errors[0].get("message", "Invalid token or Account ID") if errors else "Invalid token or Account ID"
        return CloudflareVerifyResult("error", msg)


async def verify_r2_bucket(row: CloudflarePlugin) -> CloudflareVerifyResult:
    if row.account_status != "connected":
        return CloudflareVerifyResult("disconnected", "Verify account first")
    if not row.r2_bucket.strip():
        return CloudflareVerifyResult("disconnected", "R2 bucket name is required")
    if not row.account_id.strip():
        return CloudflareVerifyResult("disconnected", "Account ID is required")

    has_s3 = bool(row.r2_access_key_id.strip() and row.r2_secret_access_key.strip())
    has_token = bool(row.api_token.strip())
    if not has_s3 and not has_token:
        return CloudflareVerifyResult(
            "disconnected",
            "Add R2 Access Key ID + Secret, or a Cloudflare API token",
        )

    s3_error = ""
    try:
        access_key, secret = resolve_r2_s3_credentials(row)
        s3 = _s3_client(row, access_key, secret)
        probe_key = "_againerp/r2-verify.txt"
        s3.put_object(
            Bucket=row.r2_bucket.strip(),
            Key=probe_key,
            Body=b"ok",
            ContentType="text/plain",
        )
        try:
            s3.delete_object(Bucket=row.r2_bucket.strip(), Key=probe_key)
        except Exception:
            pass
        via = "S3 keys" if has_s3 else "API token → S3"
        return CloudflareVerifyResult("connected", f"R2 storage connected ({via})")
    except Exception as exc:
        s3_error = str(exc)

    if has_token:
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.get(
                f"{CF_API}/accounts/{row.account_id.strip()}/r2/buckets",
                headers=_cf_headers(row.api_token),
            )
            body = res.json()
            if body.get("success"):
                buckets = [b.get("name") for b in body.get("result", {}).get("buckets", [])]
                if row.r2_bucket.strip() not in buckets:
                    return CloudflareVerifyResult("error", f"Bucket '{row.r2_bucket}' not found")
                probe_key = "_againerp/r2-verify.txt"
                put = await client.put(
                    f"{CF_API}/accounts/{row.account_id.strip()}/r2/buckets/{row.r2_bucket.strip()}/objects/{probe_key}",
                    headers={
                        "Authorization": f"Bearer {row.api_token.strip()}",
                        "Content-Type": "text/plain",
                    },
                    content=b"ok",
                )
                put_body: dict = {}
                try:
                    put_body = put.json()
                except Exception:
                    put_body = {}
                if put.status_code < 400 and put_body.get("success") is not False:
                    return CloudflareVerifyResult("connected", "R2 storage connected (API token REST)")

                errors = put_body.get("errors") or []
                rest_msg = errors[0].get("message", "") if errors else ""
                if "Authentication" in rest_msg or put.status_code in {401, 403}:
                    return CloudflareVerifyResult(
                        "error",
                        "Object-scoped R2 tokens cannot use REST upload. "
                        "Paste R2 Access Key ID + Secret Access Key from "
                        "Cloudflare → R2 → Manage R2 API Tokens.",
                    )

    return CloudflareVerifyResult(
        "error",
        f"R2 connection failed ({s3_error[:160]}). "
        "Use Access Key ID + Secret from Cloudflare → R2 → Manage R2 API Tokens.",
    )


async def verify_images(row: CloudflarePlugin) -> CloudflareVerifyResult:
    if row.account_status != "connected":
        return CloudflareVerifyResult("disconnected", "Verify account first")
    token = (row.images_api_token or row.api_token).strip()
    account_hash = row.images_account_hash.strip()
    if not account_hash:
        return CloudflareVerifyResult("disconnected", "Images account hash is required")
    if len(token) < 8:
        return CloudflareVerifyResult("disconnected", "Images API token is required")

    async with httpx.AsyncClient(timeout=20.0) as client:
        res = await client.get(
            f"{CF_API}/accounts/{row.account_id.strip()}/images/v1/stats",
            headers=_cf_headers(token),
        )
        body = res.json()
        if not body.get("success"):
            return CloudflareVerifyResult("error", "Cloudflare Images API check failed")

    return CloudflareVerifyResult("connected", "Cloudflare Images connected")


def _upload_to_r2_via_api(row: CloudflarePlugin, key: str, content: bytes, mime: str) -> None:
    """Upload via Cloudflare REST (Admin token). Object-scoped tokens will fail auth."""
    token = row.api_token.strip()
    url = (
        f"{CF_API}/accounts/{row.account_id.strip()}/r2/buckets/"
        f"{row.r2_bucket.strip()}/objects/{key}"
    )
    with httpx.Client(timeout=60.0) as client:
        res = client.put(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": mime or "application/octet-stream",
            },
            content=content,
        )
        if res.status_code >= 400:
            detail = res.text[:200]
            try:
                body = res.json()
                errors = body.get("errors") or []
                if errors:
                    detail = errors[0].get("message", detail)
            except Exception:
                pass
            if "Authentication" in str(detail) or res.status_code in {401, 403}:
                raise CloudflareError(
                    "R2 upload failed: Authentication error. "
                    "Object Read & Write tokens need the S3 API — add Access Key ID + Secret "
                    "in Settings → Plugins → Cloudflare (from Cloudflare → R2 → Manage R2 API Tokens)."
                )
            raise CloudflareError(f"R2 upload failed: {detail}")


def _delete_from_r2_via_api(row: CloudflarePlugin, key: str) -> None:
    token = row.api_token.strip()
    url = (
        f"{CF_API}/accounts/{row.account_id.strip()}/r2/buckets/"
        f"{row.r2_bucket.strip()}/objects/{key}"
    )
    with httpx.Client(timeout=30.0) as client:
        res = client.delete(url, headers={"Authorization": f"Bearer {token}"})
        if res.status_code >= 400 and res.status_code != 404:
            raise CloudflareError(f"R2 delete failed: {res.status_code}")


def upload_to_r2(row: CloudflarePlugin, key: str, content: bytes, mime: str) -> None:
    """Upload via S3 when keys exist; OAuth / API-token uses REST (workers-r2.write)."""
    has_s3 = bool(row.r2_access_key_id.strip() and row.r2_secret_access_key.strip())
    auth_method = (row.auth_method or "manual").strip().lower()

    # 1) Explicit R2 Access Key ID + Secret → S3 API (preferred for object tokens).
    if has_s3:
        try:
            access_key, secret = resolve_r2_s3_credentials(row)
            s3 = _s3_client(row, access_key, secret)
            s3.put_object(
                Bucket=row.r2_bucket.strip(),
                Key=key,
                Body=content,
                ContentType=mime,
            )
            return
        except Exception as s3_exc:
            if not row.api_token.strip():
                raise CloudflareError(f"R2 upload failed: {s3_exc}") from s3_exc

    # 2) OAuth / Admin Bearer token → Cloudflare REST (Object-scoped tokens fail here).
    if row.api_token.strip() and (auth_method == "oauth" or not has_s3):
        try:
            _upload_to_r2_via_api(row, key, content, mime)
            return
        except CloudflareError as rest_exc:
            if has_s3:
                raise
            # 3) Last resort: derive S3 credentials from a classic API token value.
            try:
                access_key, secret = derive_r2_s3_credentials(row.api_token)
                s3 = _s3_client(row, access_key, secret)
                s3.put_object(
                    Bucket=row.r2_bucket.strip(),
                    Key=key,
                    Body=content,
                    ContentType=mime,
                )
                return
            except Exception:
                raise rest_exc from None

    raise CloudflareError(
        "R2 credentials missing. Reconnect Cloudflare OAuth or add Access Key ID + Secret "
        "in Settings → Plugins → Cloudflare."
    )


def delete_from_r2(row: CloudflarePlugin, key: str) -> None:
    try:
        access_key, secret = resolve_r2_s3_credentials(row)
        s3 = _s3_client(row, access_key, secret)
        s3.delete_object(Bucket=row.r2_bucket.strip(), Key=key)
        return
    except Exception:
        if row.api_token.strip():
            _delete_from_r2_via_api(row, key)
            return
        raise


def public_r2_url(row: CloudflarePlugin, key: str) -> str:
    """Build a browser-safe public object URL (path-encode each key segment)."""
    from urllib.parse import quote

    encoded = "/".join(quote(part, safe="") for part in key.strip("/").split("/"))
    base = row.r2_public_base_url.strip().rstrip("/")
    if base:
        return f"{base}/{encoded}"
    return (
        f"https://{row.account_id.strip()}.r2.cloudflarestorage.com/"
        f"{row.r2_bucket.strip()}/{encoded}"
    )


def is_r2_connected(row: Optional[CloudflarePlugin]) -> bool:
    """R2 bucket is usable for migrate/upload (ignores media_storage preference)."""
    if not row:
        return False
    return (
        row.installed
        and row.enabled
        and row.account_status == "connected"
        and row.r2_status == "connected"
        and bool(row.r2_bucket.strip())
        and bool(
            row.api_token.strip()
            or (row.r2_access_key_id.strip() and row.r2_secret_access_key.strip())
        )
    )


def should_use_r2(row: Optional[CloudflarePlugin]) -> bool:
    if not is_r2_connected(row):
        return False
    assert row is not None
    return row.media_storage == "r2"


def _download_from_r2_via_api(row: CloudflarePlugin, key: str) -> bytes:
    token = row.api_token.strip()
    if not token:
        raise CloudflareError("R2 download requires Cloudflare API token")
    url = (
        f"{CF_API}/accounts/{row.account_id.strip()}/r2/buckets/"
        f"{row.r2_bucket.strip()}/objects/{key}"
    )
    with httpx.Client(timeout=60.0) as client:
        res = client.get(url, headers={"Authorization": f"Bearer {token}"})
        if res.status_code >= 400:
            raise CloudflareError(f"R2 download failed: {res.status_code}")
        return res.content


def download_from_r2(
    row: CloudflarePlugin,
    key: str,
    *,
    fallback_url: str | None = None,
) -> bytes:
    if fallback_url:
        try:
            with httpx.Client(timeout=60.0, follow_redirects=True) as client:
                res = client.get(fallback_url)
                if res.status_code == 200 and res.content:
                    return res.content
        except Exception:
            pass

    try:
        access_key, secret = resolve_r2_s3_credentials(row)
        s3 = _s3_client(row, access_key, secret)
        obj = s3.get_object(Bucket=row.r2_bucket.strip(), Key=key)
        return obj["Body"].read()
    except Exception:
        if row.api_token.strip():
            return _download_from_r2_via_api(row, key)
        raise
