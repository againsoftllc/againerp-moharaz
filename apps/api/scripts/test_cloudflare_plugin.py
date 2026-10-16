#!/usr/bin/env python3
"""Smoke test for Cloudflare plugin API."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

import httpx

BASE = "http://127.0.0.1:8002"
EMAIL = "admin@againerp.local"
PASSWORD = "admin123"


def pretty(data: object) -> str:
    return json.dumps(data, indent=2, default=str)


def main() -> int:
    client = httpx.Client(base_url=BASE, timeout=20.0)
    results: list[tuple[str, bool, str]] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        results.append((name, ok, detail))
        mark = "PASS" if ok else "FAIL"
        print(f"[{mark}] {name}" + (f" — {detail}" if detail else ""))

    # Health
    health = client.get("/health")
    check("health", health.status_code == 200, f"status={health.status_code}")

    # Login
    login = client.post("/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD})
    check("login", login.status_code == 200, f"status={login.status_code}")
    if login.status_code != 200:
        print(pretty(login.json() if login.content else {}))
        return 1
    token = login.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Initial state
    get0 = client.get("/api/v1/plugins/cloudflare", headers=headers)
    check("get plugin", get0.status_code == 200)
    data0 = get0.json()["data"]
    check("default not installed", data0["installed"] is False)
    check("default local storage", data0["media_storage"] == "local")

    # Install
    install = client.post("/api/v1/plugins/cloudflare/install", headers=headers)
    check("install", install.status_code == 200)
    data1 = install.json()["data"]
    check("installed true", data1["installed"] is True)
    check("enabled true", data1["enabled"] is True)

    # Save credentials without verify
    save = client.patch(
        "/api/v1/plugins/cloudflare",
        headers=headers,
        json={"account_id": "test-account-id", "api_token": "test-token-12345678"},
    )
    check("save account creds", save.status_code == 200)
    data2 = save.json()["data"]
    check("api token set", data2["api_token_set"] is True)
    check("account id saved", data2["account_id"] == "test-account-id")

    # Verify with fake token should fail
    verify_bad = client.patch(
        "/api/v1/plugins/cloudflare",
        headers=headers,
        json={"verify_account": True},
    )
    check("verify fake token fails", verify_bad.status_code == 400, f"status={verify_bad.status_code}")

    # Local storage OK
    local = client.patch(
        "/api/v1/plugins/cloudflare",
        headers=headers,
        json={"media_storage": "local"},
    )
    check("set local storage", local.status_code == 200)

    # R2 without verify should fail
    r2_bad = client.patch(
        "/api/v1/plugins/cloudflare",
        headers=headers,
        json={"media_storage": "r2"},
    )
    check("r2 without verify blocked", r2_bad.status_code == 400, f"status={r2_bad.status_code}")

    # Media upload still works (local)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp.write(b"\x89PNG\r\n\x1a\n" + b"\x00" * 32)
        tmp_path = Path(tmp.name)
    try:
        with tmp_path.open("rb") as fh:
            upload = client.post(
                "/api/v1/media/upload",
                headers=headers,
                files={"files": ("test-cloudflare-plugin.png", fh, "image/png")},
            )
        check("media upload local", upload.status_code == 201, f"status={upload.status_code}")
        if upload.status_code == 201:
            item = upload.json()["data"][0]
            check("upload provider direct", item.get("provider") == "direct")
            check("upload url local", "/uploads/media/" in item.get("url", ""))
    finally:
        tmp_path.unlink(missing_ok=True)

    # Uninstall
    uninstall = client.delete("/api/v1/plugins/cloudflare/install", headers=headers)
    check("uninstall", uninstall.status_code == 200)
    data3 = uninstall.json()["data"]
    check("installed false after uninstall", data3["installed"] is False)
    check("media storage reset local", data3["media_storage"] == "local")

    # Patch after uninstall blocked
    patch_after = client.patch(
        "/api/v1/plugins/cloudflare",
        headers=headers,
        json={"media_storage": "local"},
    )
    check("patch after uninstall blocked", patch_after.status_code == 400)

    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"\n{passed}/{total} checks passed")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
