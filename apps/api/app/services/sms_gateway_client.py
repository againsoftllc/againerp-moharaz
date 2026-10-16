"""SMS gateway HTTP clients — BulkSMS BD, SSL Wireless, Zaman IT, Alpha SMS."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import urlencode

import httpx

from app.models.sms_gateway_plugin import SMS_PROVIDER_DEFAULTS, SmsGatewayPlugin


@dataclass
class SmsSendResult:
    ok: bool
    message: str
    provider: str
    raw: Optional[dict[str, Any]] = None


class SmsGatewayError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


def _normalize_bd_msisdn(phone: str) -> str:
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if digits.startswith("880") and len(digits) >= 13:
        return digits
    if digits.startswith("0") and len(digits) == 11:
        return f"880{digits[1:]}"
    if len(digits) == 10 and digits.startswith("1"):
        return f"880{digits}"
    return digits


def _base_url(row: SmsGatewayPlugin) -> str:
    custom = (row.base_url or "").strip().rstrip("/")
    if custom:
        return custom
    defaults = SMS_PROVIDER_DEFAULTS.get(row.provider) or {}
    return str(defaults.get("base_url") or "").rstrip("/")


def send_sms(row: SmsGatewayPlugin, *, phone: str, message: str) -> SmsSendResult:
    """Send SMS via the configured provider. Raises SmsGatewayError on hard failures."""
    api_key = (row.api_key or "").strip()
    if not api_key:
        raise SmsGatewayError("API key is required")
    msisdn = _normalize_bd_msisdn(phone)
    if len(msisdn) < 11:
        raise SmsGatewayError("Enter a valid Bangladesh mobile number")
    text = (message or "").strip()
    if not text:
        raise SmsGatewayError("Message is empty")

    provider = row.provider
    if provider == "bulksms_bd":
        return _send_bulksms(row, msisdn=msisdn, message=text)
    if provider == "ssl_wireless":
        return _send_ssl_wireless(row, msisdn=msisdn, message=text)
    if provider == "zaman_it":
        return _send_zaman(row, msisdn=msisdn, message=text)
    if provider == "alpha_sms":
        return _send_alpha_sms(row, msisdn=msisdn, message=text)
    raise SmsGatewayError(f"Unknown SMS provider: {provider}")


def verify_credentials(row: SmsGatewayPlugin, *, test_phone: Optional[str] = None) -> SmsSendResult:
    """Validate credentials; optionally send a Check-now SMS when test_phone is set."""
    if not (row.api_key or "").strip():
        return SmsSendResult(ok=False, message="API key is required", provider=row.provider)
    # Alpha SMS + Zaman IT can send with API key only (sender optional).
    if (
        not (row.sender_id or "").strip()
        and row.provider not in {"zaman_it", "alpha_sms"}
    ):
        return SmsSendResult(ok=False, message="Sender ID is required", provider=row.provider)
    if not test_phone:
        return SmsSendResult(
            ok=True,
            message="Credentials saved — send a Check now SMS to verify delivery",
            provider=row.provider,
        )
    try:
        return send_sms(
            row,
            phone=test_phone,
            message="AgainERP SMS gateway test — credentials OK.",
        )
    except SmsGatewayError as exc:
        return SmsSendResult(ok=False, message=exc.message, provider=row.provider)


def _send_bulksms(row: SmsGatewayPlugin, *, msisdn: str, message: str) -> SmsSendResult:
    url = _base_url(row) or SMS_PROVIDER_DEFAULTS["bulksms_bd"]["base_url"]
    params = {
        "api_key": row.api_key.strip(),
        "type": "text",
        "number": msisdn,
        "senderid": (row.sender_id or "").strip() or "8809601000000",
        "message": message,
    }
    if (row.api_secret or "").strip():
        params["secret"] = row.api_secret.strip()
    try:
        with httpx.Client(timeout=12.0) as client:
            res = client.get(url, params=params)
            body_text = res.text.strip()
            raw: dict[str, Any]
            try:
                raw = res.json() if res.content else {"raw": body_text}
            except Exception:
                raw = {"raw": body_text}
    except httpx.HTTPError as exc:
        raise SmsGatewayError(f"BulkSMS BD unreachable: {exc}") from exc

    # BulkSMS BD returns response_code 202 on success (or plain "SMS Submitted").
    code = str(raw.get("response_code") or raw.get("responseCode") or "")
    ok = res.status_code < 400 and (
        code in {"202", "200", ""} or "success" in body_text.lower() or "submitted" in body_text.lower()
    )
    if not ok and code and code not in {"202", "200"}:
        msg = str(raw.get("error_message") or raw.get("message") or body_text or "BulkSMS BD rejected the request")
        return SmsSendResult(ok=False, message=msg, provider=row.provider, raw=raw)
    if not ok:
        return SmsSendResult(
            ok=False,
            message=body_text or f"BulkSMS BD HTTP {res.status_code}",
            provider=row.provider,
            raw=raw,
        )
    return SmsSendResult(ok=True, message="SMS sent via BulkSMS BD", provider=row.provider, raw=raw)


def _send_ssl_wireless(row: SmsGatewayPlugin, *, msisdn: str, message: str) -> SmsSendResult:
    url = _base_url(row) or SMS_PROVIDER_DEFAULTS["ssl_wireless"]["base_url"]
    payload = {
        "api_token": row.api_key.strip(),
        "sid": (row.sender_id or "").strip(),
        "msisdn": msisdn,
        "sms": message,
        "csms_id": f"ae{msisdn[-8:]}",
    }
    if (row.api_secret or "").strip():
        payload["secret"] = row.api_secret.strip()
    try:
        with httpx.Client(timeout=12.0) as client:
            res = client.post(url, json=payload)
            try:
                raw = res.json() if res.content else {"raw": res.text}
            except Exception:
                raw = {"raw": res.text}
    except httpx.HTTPError as exc:
        raise SmsGatewayError(f"SSL Wireless unreachable: {exc}") from exc

    status = str(raw.get("status") or raw.get("status_code") or "").lower()
    ok = res.status_code < 400 and status in {"success", "200", "ok", ""}
    if not ok:
        msg = str(raw.get("error_message") or raw.get("message") or raw.get("raw") or f"HTTP {res.status_code}")
        return SmsSendResult(ok=False, message=msg, provider=row.provider, raw=raw if isinstance(raw, dict) else None)
    return SmsSendResult(ok=True, message="SMS sent via SSL Wireless", provider=row.provider, raw=raw if isinstance(raw, dict) else None)


def _send_zaman(row: SmsGatewayPlugin, *, msisdn: str, message: str) -> SmsSendResult:
    url = _base_url(row) or SMS_PROVIDER_DEFAULTS["zaman_it"]["base_url"]
    payload = {
        "api_key": row.api_key.strip(),
        "api_secret": (row.api_secret or "").strip(),
        "sender_id": (row.sender_id or "").strip(),
        "to": msisdn,
        "message": message,
    }
    # Support both JSON POST and form POST depending on provider docs.
    try:
        with httpx.Client(timeout=12.0) as client:
            res = client.post(url, json=payload)
            if res.status_code >= 400:
                res = client.post(url, data=urlencode(payload), headers={"Content-Type": "application/x-www-form-urlencoded"})
            try:
                raw = res.json() if res.content else {"raw": res.text}
            except Exception:
                raw = {"raw": res.text}
    except httpx.HTTPError as exc:
        raise SmsGatewayError(f"Zaman IT unreachable: {exc}") from exc

    ok = res.status_code < 400
    status = str((raw or {}).get("status") or (raw or {}).get("success") or "").lower()
    if status in {"0", "false", "error", "failed"}:
        ok = False
    if not ok:
        msg = str((raw or {}).get("message") or (raw or {}).get("raw") or f"HTTP {res.status_code}")
        return SmsSendResult(ok=False, message=msg, provider=row.provider, raw=raw if isinstance(raw, dict) else None)
    return SmsSendResult(ok=True, message="SMS sent via Zaman IT", provider=row.provider, raw=raw if isinstance(raw, dict) else None)


def _send_alpha_sms(row: SmsGatewayPlugin, *, msisdn: str, message: str) -> SmsSendResult:
    """Alpha SMS (sms.net.bd) — GET /sendsms?api_key=&msg=&to=8801…"""
    url = _base_url(row) or SMS_PROVIDER_DEFAULTS["alpha_sms"]["base_url"]
    params: dict[str, str] = {
        "api_key": row.api_key.strip(),
        "msg": message,
        "to": msisdn,
    }
    sender = (row.sender_id or "").strip()
    if sender:
        params["sender_id"] = sender
    try:
        with httpx.Client(timeout=12.0) as client:
            res = client.get(url, params=params)
            body_text = res.text.strip()
            try:
                raw: dict[str, Any] = res.json() if res.content else {"raw": body_text}
            except Exception:
                raw = {"raw": body_text}
    except httpx.HTTPError as exc:
        raise SmsGatewayError(f"Alpha SMS unreachable: {exc}") from exc

    # Error shape: {"error":405,"msg":"Authorization required"} — success typically error=0.
    err_code = raw.get("error")
    err_num: Optional[int]
    try:
        err_num = int(err_code) if err_code is not None and str(err_code).strip() != "" else None
    except (TypeError, ValueError):
        err_num = None
    msg = str(raw.get("msg") or raw.get("message") or body_text or "")
    ok = res.status_code < 400 and (err_num in {0, None} or "success" in msg.lower())
    if err_num not in {None, 0}:
        ok = False
    if not ok:
        return SmsSendResult(
            ok=False,
            message=msg or f"Alpha SMS HTTP {res.status_code}",
            provider=row.provider,
            raw=raw,
        )
    return SmsSendResult(ok=True, message="SMS sent via Alpha SMS", provider=row.provider, raw=raw)
