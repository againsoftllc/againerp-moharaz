"""Text messages to customers (login codes …) through the SMS gateway set up in the admin.

Where the settings live: the site's Option tab (Workspace → Sites → Option: SMS gateway, SMS API key) and
the platform settings (SMS API key, SMS sender ID) — the site's key wins. Supported gateway: BulkSMS BD
(bulksmsbd.net), the default. An SMS gateway plugin turned on under Settings → Plugins (Alpha SMS, BulkSMS BD,
SSL Wireless, Zaman IT) takes over from both.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class SmsError(Exception):
    pass


@dataclass(frozen=True)
class SmsConfig:
    gateway: str
    api_key: str
    sender_id: str
    # the SmsGatewayPlugin row when an installed plugin does the sending
    plugin: Optional[Any] = field(default=None, compare=False)


def sms_config(db: Session, site_options: Optional[dict] = None) -> Optional[SmsConfig]:
    """The gateway to send through, or None when no API key is set."""
    from app.routers.platform_settings import get_platform_setting

    plugin = active_sms_plugin(db)
    if plugin is not None:
        return SmsConfig(gateway=plugin.provider, api_key=plugin.api_key, sender_id=plugin.sender_id or "", plugin=plugin)
    opts = site_options or {}
    api_key = (opts.get("sms_api_key") or get_platform_setting(db, "sms_api_key") or "").strip()
    if not api_key:
        return None
    sender = (opts.get("sms_sender_id") or get_platform_setting(db, "sms_sender_id") or "").strip()
    gateway = (opts.get("sms_gateway") or "BulkSMS BD").strip()
    return SmsConfig(gateway=gateway, api_key=api_key, sender_id=sender)


def active_sms_plugin(db: Session):
    """The installed + enabled SMS gateway plugin with an API key — a connected one first — or None."""
    from app.models.sms_gateway_plugin import SmsGatewayPlugin

    rows = (
        db.query(SmsGatewayPlugin)
        .filter(SmsGatewayPlugin.installed.is_(True), SmsGatewayPlugin.enabled.is_(True))
        .order_by(SmsGatewayPlugin.updated_at.desc())
        .all()
    )
    keyed = [r for r in rows if (r.api_key or "").strip()]
    connected = [r for r in keyed if r.connection_status == "connected"]
    return (connected or keyed or [None])[0]


def _intl(local_number: str) -> str:
    """01XXXXXXXXX → 8801XXXXXXXXX"""
    digits = "".join(ch for ch in local_number if ch.isdigit())
    if digits.startswith("880"):
        return digits
    if digits.startswith("0"):
        return "88" + digits
    return digits


def send_sms(config: SmsConfig, number: str, message: str) -> None:
    """Send one text; raises SmsError when the gateway refuses it."""
    if config.plugin is not None:
        from app.services.sms_gateway_client import SmsGatewayError, send_sms as plugin_send

        try:
            result = plugin_send(config.plugin, phone=number, message=message)
        except SmsGatewayError as exc:
            logger.warning("SMS plugin %s failed: %s", config.gateway, exc.message)
            raise SmsError("Couldn't send the SMS — please try again") from exc
        if not result.ok:
            logger.warning("SMS refused by %s: %s", config.gateway, result.message)
            raise SmsError("Couldn't send the SMS — please try again")
        return
    gateway = config.gateway.lower().replace(" ", "")
    if gateway in ("bulksmsbd", "bulksms", "bulksmsbd.net"):
        params = {"api_key": config.api_key, "type": "text", "number": _intl(number), "message": message}
        if config.sender_id:
            params["senderid"] = config.sender_id
        try:
            res = httpx.get("https://bulksmsbd.net/api/smsapi", params=params, timeout=15)
            data = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("SMS gateway unreachable: %s", exc)
            raise SmsError("Couldn't send the SMS — please try again") from exc
        code = data.get("response_code")
        if res.status_code >= 400 or (code is not None and int(code) != 202):
            logger.warning("SMS refused (%s): %s", res.status_code, data or res.text[:200])
            raise SmsError("Couldn't send the SMS — please try again")
        return
    raise SmsError(f"SMS gateway '{config.gateway}' is not supported")
