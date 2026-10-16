#!/usr/bin/env python3
"""Smoke verification for storefront customer auth + account isolation."""

from __future__ import annotations

import sys
import uuid

from fastapi.testclient import TestClient

from main import app


def _assert(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def main() -> int:
    phone_a = "0171000" + str(uuid.uuid4().int % 10000).zfill(4)
    phone_b = "0181000" + str(uuid.uuid4().int % 10000).zfill(4)
    pin = "5678"

    with TestClient(app) as client:
        # Method for new identity -> otp
        r = client.post("/api/v1/storefront/auth/method", json={"identifier": phone_a})
        _assert(r.status_code == 200, f"method failed: {r.text}")
        _assert(r.json()["method"] == "otp", "expected otp method for new user")

        # Wrong OTP fails
        r = client.post(
            "/api/v1/storefront/auth/request-otp",
            json={"identifier": phone_a},
        )
        _assert(r.status_code == 200, f"request-otp failed: {r.text}")
        r = client.post(
            "/api/v1/storefront/auth/verify-otp",
            json={"identifier": phone_a, "otp": "0000"},
        )
        _assert(r.status_code in (400, 401), "wrong otp should fail")

        # Correct OTP creates customer + session
        r = client.post(
            "/api/v1/storefront/auth/verify-otp",
            json={"identifier": phone_a, "otp": "1234"},
        )
        _assert(r.status_code == 200, f"verify-otp failed: {r.text}")
        body = r.json()
        token_a = body["token"]
        customer_a = body["customer"]["id"]
        _assert(bool(token_a), "missing token")
        _assert(not body["customer"]["has_pin"], "new customer should not have pin")

        # Repeated OTP reuses same customer
        r = client.post(
            "/api/v1/storefront/auth/request-otp",
            json={"identifier": phone_a},
        )
        _assert(r.status_code == 200, r.text)
        r = client.post(
            "/api/v1/storefront/auth/verify-otp",
            json={"identifier": phone_a, "otp": "1234"},
        )
        _assert(r.status_code == 200, r.text)
        _assert(r.json()["customer"]["id"] == customer_a, "otp should reuse customer")
        token_a = r.json()["token"]

        headers_a = {"Authorization": f"Bearer {token_a}"}

        # Set PIN (hashed server-side)
        r = client.put(
            "/api/v1/storefront/auth/pin",
            headers=headers_a,
            json={"pin": pin, "confirm_pin": pin},
        )
        _assert(r.status_code == 200, f"set pin failed: {r.text}")
        _assert(r.json()["data"]["has_pin"] is True, "has_pin should be true")

        # Method now reports pin
        r = client.post("/api/v1/storefront/auth/method", json={"identifier": phone_a})
        _assert(r.json()["method"] == "pin", "expected pin method")

        # Wrong PIN fails
        r = client.post(
            "/api/v1/storefront/auth/login-pin",
            json={"identifier": phone_a, "pin": "1111"},
        )
        _assert(r.status_code == 401 or r.status_code == 400, "wrong pin should fail")

        # Correct PIN issues session
        r = client.post(
            "/api/v1/storefront/auth/login-pin",
            json={"identifier": phone_a, "pin": pin},
        )
        _assert(r.status_code == 200, f"login-pin failed: {r.text}")
        token_a = r.json()["token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # Me + account summary
        r = client.get("/api/v1/storefront/auth/me", headers=headers_a)
        _assert(r.status_code == 200, r.text)
        r = client.get("/api/v1/storefront/account/summary", headers=headers_a)
        _assert(r.status_code == 200, r.text)

        # Create case for A
        r = client.post(
            "/api/v1/storefront/account/cases",
            headers=headers_a,
            json={
                "case_type": "support",
                "subject": "Help",
                "message": "Need help with account",
            },
        )
        _assert(r.status_code == 200, f"create case failed: {r.text}")
        case_id = r.json()["data"]["id"]

        # Customer B
        r = client.post("/api/v1/storefront/auth/request-otp", json={"identifier": phone_b})
        _assert(r.status_code == 200, r.text)
        r = client.post(
            "/api/v1/storefront/auth/verify-otp",
            json={"identifier": phone_b, "otp": "1234"},
        )
        _assert(r.status_code == 200, r.text)
        token_b = r.json()["token"]
        customer_b = r.json()["customer"]["id"]
        _assert(customer_b != customer_a, "customers must differ")
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # B cannot see A's cases
        r = client.get("/api/v1/storefront/account/cases?case_type=support", headers=headers_b)
        _assert(r.status_code == 200, r.text)
        ids = {c["id"] for c in r.json()["data"]}
        _assert(case_id not in ids, "customer B must not see A's case")

        # Checkout without cart/auth returns validation or empty-cart errors (guest OK)
        r = client.post("/api/v1/storefront/checkout", json={})
        _assert(r.status_code in (400, 401, 403, 422), "checkout without cart must not succeed")

        # Logout revokes session
        r = client.post("/api/v1/storefront/auth/logout", headers=headers_a)
        _assert(r.status_code == 200, r.text)
        r = client.get("/api/v1/storefront/auth/me", headers=headers_a)
        _assert(r.status_code == 401, "revoked session must fail")

    print("OK: storefront customer auth verification passed")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL: {exc}", file=sys.stderr)
        raise SystemExit(1)
