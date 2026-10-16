#!/usr/bin/env python3
"""
Compare AgainERP China APIs:
  1) Elim (existing production proxy) — unchanged
  2) Alibaba 1688 official Open Platform (GGS / crossborder)

Usage (from apps/api):
  ALIBABA_1688_APP_KEY=... ALIBABA_1688_APP_SECRET=... python scripts/test_china_apis.py

Optional for official API after OAuth:
  ALIBABA_1688_ACCESS_TOKEN=...
  ALIBABA_1688_REFRESH_TOKEN=...
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
import time
from typing import Any

import httpx

# Allow `python scripts/test_china_apis.py` from apps/api
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import get_settings
from app.services.elim_client import ElimClientError, search_products

GATEWAY_1688 = "https://gw.open.1688.com/openapi"
GATEWAY_TOP = "https://eco.taobao.com/router/rest"


def _clip(text: str, limit: int = 500) -> str:
    text = text.strip()
    return text if len(text) <= limit else text[:limit] + "…"


def sign_aop(url_path: str, params: dict[str, Any], app_secret: str) -> str:
    """1688 param2 HMAC-SHA1: sign = HMAC-SHA1(secret, url_path + sorted key+value).hex upper."""
    items = sorted((str(k), str(v)) for k, v in params.items() if v is not None and k != "_aop_signature")
    param_str = "".join(f"{k}{v}" for k, v in items)
    sign_str = f"{url_path}{param_str}"
    return hmac.new(app_secret.encode(), sign_str.encode(), hashlib.sha1).hexdigest().upper()


def post_aop(
    namespace_api: str,
    *,
    app_key: str,
    app_secret: str,
    params: dict[str, Any],
    timeout: float = 20.0,
) -> tuple[int, Any]:
    url_path = f"param2/1/{namespace_api}/{app_key}"
    payload = dict(params)
    payload["_aop_timestamp"] = str(int(time.time() * 1000))
    payload["_aop_signature"] = sign_aop(url_path, payload, app_secret)
    url = f"{GATEWAY_1688}/{url_path}"
    with httpx.Client(timeout=timeout) as client:
        res = client.post(url, data=payload)
    try:
        body = res.json()
    except Exception:
        body = {"raw": _clip(res.text, 1200)}
    return res.status_code, body


def test_elim() -> dict[str, Any]:
    settings = get_settings()
    key = (settings.elim_api_key or "").strip()
    if not key:
        return {"ok": False, "error": "ELIM_API_KEY not set in apps/api/.env"}

    try:
        data = search_products(q="phone case", platform="alibaba", page=1, size=2, lang="en")
    except ElimClientError as exc:
        return {"ok": False, "error": str(exc), "status_code": exc.status_code}

    items = data.get("items") or []
    sample = []
    for row in items[:2]:
        if isinstance(row, dict):
            sample.append(
                {
                    "id": row.get("id"),
                    "title": _clip(str(row.get("titleEn") or row.get("title") or ""), 80),
                }
            )
    paginate = data.get("paginate") or {}
    return {
        "ok": True,
        "provider": "elim",
        "base_url": settings.elim_base_url,
        "total": paginate.get("total") if isinstance(paginate, dict) else len(items),
        "sample": sample,
    }


def test_alibaba_oauth_refresh(app_key: str, app_secret: str, refresh_token: str) -> dict[str, Any]:
    url = f"{GATEWAY_1688}/param2/1/system.oauth2/getToken/{app_key}"
    data = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": app_key,
        "client_secret": app_secret,
    }
    with httpx.Client(timeout=15.0) as client:
        res = client.post(url, data=data)
    try:
        body = res.json()
    except Exception:
        body = {"raw": _clip(res.text, 800)}
    ok = res.status_code == 200 and isinstance(body, dict) and body.get("access_token")
    return {"ok": bool(ok), "http": res.status_code, "body": body}


def test_alibaba_keyword(
    app_key: str,
    app_secret: str,
    access_token: str | None,
) -> dict[str, Any]:
    if not access_token:
        return {
            "ok": False,
            "skipped": True,
            "reason": "No ALIBABA_1688_ACCESS_TOKEN or refresh token — OAuth required for crossborder search",
        }

    offer_query = json.dumps(
        {"keyword": "phone case", "country": "en", "beginPage": 1, "pageSize": 2},
        separators=(",", ":"),
    )
    status, body = post_aop(
        "com.alibaba.fenxiao.crossborder/product.search.keywordQuery",
        app_key=app_key,
        app_secret=app_secret,
        params={"access_token": access_token, "offerQueryParam": offer_query},
    )
    ok = status == 200 and isinstance(body, dict) and not body.get("error_message") and not body.get("error_code")
    return {"ok": ok, "http": status, "body": body}


def test_alibaba_category(
    app_key: str,
    app_secret: str,
    access_token: str | None,
) -> dict[str, Any]:
    if not access_token:
        return {"ok": False, "skipped": True, "reason": "OAuth token required"}

    status, body = post_aop(
        "com.alibaba.fenxiao.crossborder/category.translation.getById",
        app_key=app_key,
        app_secret=app_secret,
        params={"access_token": access_token, "categoryId": "0", "language": "en"},
    )
    ok = status == 200 and isinstance(body, dict) and not body.get("error_message")
    return {"ok": ok, "http": status, "body": body}


def test_alibaba_com_icbu(
    app_key: str,
    app_secret: str,
    session: str | None = None,
) -> dict[str, Any]:
    """Alibaba.com (ICBU / GGS-ISV) — TOP gateway product APIs."""
    from datetime import datetime, timedelta, timezone

    tz = timezone(timedelta(hours=8))
    ts = datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
    gateway = GATEWAY_TOP

    def call(method: str, extra: dict[str, str] | None = None) -> dict[str, Any]:
        params: dict[str, str] = {
            "method": method,
            "app_key": app_key,
            "timestamp": ts,
            "format": "json",
            "v": "2.0",
            "sign_method": "hmac",
        }
        if session:
            params["session"] = session
        if extra:
            params.update(extra)
        items = sorted((k, str(v)) for k, v in params.items())
        sign_str = "".join(f"{k}{v}" for k, v in items)
        params["sign"] = hmac.new(app_secret.encode(), sign_str.encode(), hashlib.md5).hexdigest().upper()
        with httpx.Client(timeout=25.0) as client:
            res = client.post(gateway, data=params)
        try:
            body = res.json()
        except Exception:
            body = {"raw": _clip(res.text, 800)}
        err = body.get("error_response") if isinstance(body, dict) else None
        ok = isinstance(body, dict) and any(
            k.endswith("_response") and k != "error_response" for k in body.keys()
        )
        return {"ok": ok, "http": res.status_code, "method": method, "error": err, "body": body}

    results = {
        "gateway": gateway,
        "platform": "alibaba.com (ICBU / GGS-ISV)",
        "ping": call("taobao.time.get"),
        "product_list": call(
            "alibaba.icbu.product.list",
            {"language": "ENGLISH", "subject": "phone", "current_page": "1", "page_size": "2"},
        ),
    }
    results["ok"] = any(r.get("ok") for r in results.values() if isinstance(r, dict) and "method" in r)
    return results


def test_alibaba_signature_only(app_key: str, app_secret: str) -> dict[str, Any]:
    """Call without token — shows whether app exists / permissions pending."""
    offer_query = json.dumps(
        {"keyword": "phone", "country": "en", "beginPage": 1, "pageSize": 1},
        separators=(",", ":"),
    )
    status, body = post_aop(
        "com.alibaba.fenxiao.crossborder/product.search.keywordQuery",
        app_key=app_key,
        app_secret=app_secret,
        params={"offerQueryParam": offer_query},
    )
    return {
        "ok": False,
        "http": status,
        "body": body,
        "note": "Expected to fail without access_token; error text confirms gateway + appKey reachability",
    }


def main() -> int:
    app_key = (os.getenv("ALIBABA_1688_APP_KEY") or "").strip()
    app_secret = (os.getenv("ALIBABA_1688_APP_SECRET") or "").strip()
    access_token = (os.getenv("ALIBABA_1688_ACCESS_TOKEN") or "").strip() or None
    refresh_token = (os.getenv("ALIBABA_1688_REFRESH_TOKEN") or "").strip() or None

    print("=" * 60)
    print("1) ELIM API (existing — should stay working)")
    print("=" * 60)
    elim = test_elim()
    print(json.dumps(elim, ensure_ascii=False, indent=2))

    print("\n" + "=" * 60)
    print("2) ALIBABA.COM OFFICIAL (ICBU / GGS-ISV — eco.taobao.com)")
    print("=" * 60)
    if not app_key or not app_secret:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "Set ALIBABA_1688_APP_KEY and ALIBABA_1688_APP_SECRET env vars to test official API",
                },
                indent=2,
            )
        )
        return 0 if elim.get("ok") else 1

    print(f"AppKey: {app_key}  (console: Test, TestAPI/SystemAPI Pending)")

    session = access_token
    icbu = test_alibaba_com_icbu(app_key, app_secret, session=session)
    print(json.dumps(icbu, ensure_ascii=False, indent=2))

    if refresh_token and not access_token:
        print("\n— OAuth refresh token test —")
        oauth = test_alibaba_oauth_refresh(app_key, app_secret, refresh_token)
        print(json.dumps(oauth, ensure_ascii=False, indent=2))
        if oauth.get("ok") and isinstance(oauth.get("body"), dict):
            access_token = oauth["body"].get("access_token")

    print("\n— 1688 crossborder gateway (gw.open.1688.com) —")
    sig = test_alibaba_signature_only(app_key, app_secret)
    print(json.dumps(sig, ensure_ascii=False, indent=2))

    print("\n— Category API (needs access_token) —")
    cat = test_alibaba_category(app_key, app_secret, access_token)
    print(json.dumps(cat, ensure_ascii=False, indent=2))

    print("\n— Keyword search API (needs access_token + API permission) —")
    kw = test_alibaba_keyword(app_key, app_secret, access_token)
    print(json.dumps(kw, ensure_ascii=False, indent=2))

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    if elim.get("ok"):
        print("✓ Elim API: WORKING (unchanged)")
    else:
        print("✗ Elim API: FAILED")

    icbu_ping = icbu.get("ping") if isinstance(icbu.get("ping"), dict) else {}
    icbu_err = icbu_ping.get("error") if isinstance(icbu_ping.get("error"), dict) else {}

    if access_token and icbu.get("product_list", {}).get("ok"):
        print("✓ Alibaba.com ICBU product.list: WORKING")
    elif icbu.get("ok"):
        print("✓ Alibaba.com TOP gateway: WORKING")
    elif icbu_err.get("sub_code") == "isv.appkey-not-exists":
        print("✗ Alibaba.com AppKey — gateway says appkey-not-exists (Test + Pending permissions)")
        print("  → TestAPI/SystemAPI approve → OAuth → session token")
    elif access_token and kw.get("ok"):
        print("✓ Alibaba 1688 crossborder keyword search: WORKING")
    else:
        err = str(
            icbu_err.get("msg")
            or icbu_err.get("sub_code")
            or (sig.get("body") or {}).get("error_message")
            or (sig.get("body") or {}).get("error_code")
            or "see body above"
        )
        print(f"✗ Alibaba official: not ready yet ({_clip(err, 120)})")
        print("  → Approve TestAPI/SystemAPI, OAuth session, then re-run test")

    return 0 if elim.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
