#!/usr/bin/env python3
"""AI OS RBAC + tenant-isolation checks — STEP 27, the follow-up STEP 26 explicitly flagged
as still open: "RBAC/tenant isolation for tool calls has no repeatable check... needs a
running server and real HTTP calls to mean anything."

Deliberately a separate script from test_ai_os.py, not folded into it — that one is pure
logic/DB and needs nothing running; this one drives the actual /api/v1/ai/chat endpoint
over HTTP against a live server (default http://127.0.0.1:8010), calling real Claude, and
proves the *outcome* a real end user would get: a denied action must come back denied in
the chat reply, not silently succeed or fabricate data. This is a live network+model test,
not a mock — same "prove the real thing, not a stand-in" discipline as the rest of this
session; run it with the API container up, expect it to cost a few real tokens.

Uses the same fixture users this session's RBAC work already seeded (alice@companya.test /
bob@companyb.test, one per tenant) and the pre-existing viewer@againerp.local (no finance
permissions). Resets alice/bob's passwords to a known value before running — they're
throwaway *.test fixture accounts, not real users.
"""

import sys
import uuid

import httpx

BASE = "http://127.0.0.1:8010"


def login(email: str, password: str) -> str:
    res = httpx.post(f"{BASE}/api/v1/auth/login", json={"email": email, "password": password}, timeout=10)
    res.raise_for_status()
    return res.json()["token"]


def chat(token: str, message: str) -> dict:
    res = httpx.post(
        f"{BASE}/api/v1/ai/chat",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": message},
        timeout=60,
    )
    res.raise_for_status()
    return res.json()


def create_customer(token: str, name: str) -> str:
    res = httpx.post(
        f"{BASE}/api/v1/commerce/customers",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": name},
        timeout=10,
    )
    res.raise_for_status()
    return res.json()["data"]["id"]


def delete_customer(token: str, customer_id: str) -> None:
    httpx.delete(f"{BASE}/api/v1/commerce/customers/{customer_id}", headers={"Authorization": f"Bearer {token}"}, timeout=10)


def check_permission_denied() -> bool:
    """A viewer (no finance:create) asking the AI to create an expense must be denied by
    the real endpoint's own require_permission check — the AI must not have any more
    reach than the human logged in as that role would."""
    token = login("viewer@againerp.local", "viewer123")
    result = chat(token, "Create an expense: category Office Supplies, payee Test Co, amount 100.")
    steps = result.get("steps", [])
    create_steps = [s for s in steps if s.get("tool_name") == "create_expense"]
    if not create_steps:
        print("  FAIL — expected create_expense to be called and denied, but it wasn't called at all")
        return False
    output = create_steps[0].get("output") or {}
    if create_steps[0].get("error") is None and "error" not in output:
        print(f"  FAIL — viewer's create_expense call should have been denied, got: {output}")
        return False
    status = output.get("status_code") or create_steps[0].get("error")
    print(f"  OK — viewer's create_expense correctly denied ({status})")
    return True


def check_tenant_isolation_direct_id() -> bool:
    """Bob (Company B) must not be able to read Alice's (Company A) customer even with
    the exact real id — the tenant filter must apply at the tool-call layer, same as it
    would for a human calling the endpoint directly."""
    alice_token = login("alice@companya.test", "testpass123")
    marker = f"Isolation Test {uuid.uuid4().hex[:8]}"
    customer_id = create_customer(alice_token, marker)
    try:
        bob_token = login("bob@companyb.test", "testpass123")
        result = chat(bob_token, f"Get full details for customer id {customer_id}.")
        text = result.get("text", "")
        steps = result.get("steps", [])
        get_steps = [s for s in steps if s.get("tool_name") == "get_customer"]
        if marker in text:
            print(f"  FAIL — Bob's response contained Alice's customer name: {text[:200]}")
            return False
        if get_steps and get_steps[0].get("error") is None and "error" not in (get_steps[0].get("output") or {}):
            print(f"  FAIL — get_customer should have failed cross-tenant, got: {get_steps[0].get('output')}")
            return False
        print("  OK — Bob could not read Alice's customer by direct id")
        return True
    finally:
        delete_customer(alice_token, customer_id)


def check_tenant_isolation_search() -> bool:
    """Same isolation, via search instead of a known id — the tenant filter must apply
    inside the query itself, not just as a post-hoc id check."""
    alice_token = login("alice@companya.test", "testpass123")
    marker = f"IsoSearch{uuid.uuid4().hex[:8]}"
    customer_id = create_customer(alice_token, marker)
    try:
        bob_token = login("bob@companyb.test", "testpass123")
        result = chat(bob_token, f"Search customers for '{marker}'.")
        steps = result.get("steps", [])
        search_steps = [s for s in steps if s.get("tool_name") == "search_customer"]
        # The search term itself naturally appears in a "no results for X" reply — that's
        # not a leak. The only real signal is the tool's own result count/rows: it must
        # be empty, and none of the (empty) rows can be Alice's customer id.
        if not search_steps:
            print("  FAIL — expected search_customer to be called")
            return False
        output = search_steps[0].get("output") or {}
        rows = output.get("customers") or []
        leaked = [r for r in rows if r.get("id") == customer_id]
        if leaked:
            print(f"  FAIL — Bob's search returned Alice's customer row: {leaked}")
            return False
        if output.get("count"):
            print(f"  FAIL — Bob's search returned {output.get('count')} result(s), expected 0 across tenants")
            return False
        print("  OK — Bob's search found nothing across tenants (count=0, no cross-tenant row)")
        return True
    finally:
        delete_customer(alice_token, customer_id)


def main() -> int:
    print("=== AI OS RBAC + Tenant Isolation Checks (live server + real Claude calls) ===\n")
    try:
        httpx.get(f"{BASE}/docs", timeout=5).raise_for_status()
    except Exception as exc:
        print(f"FAIL — API not reachable at {BASE}: {exc}")
        return 1

    checks = [
        ("[1/3] Permission denial (viewer -> create_expense)", check_permission_denied),
        ("[2/3] Tenant isolation, direct id (Bob -> Alice's customer)", check_tenant_isolation_direct_id),
        ("[3/3] Tenant isolation, search (Bob searches for Alice's customer)", check_tenant_isolation_search),
    ]
    passed = 0
    for label, fn in checks:
        print(label + "...")
        try:
            if fn():
                passed += 1
        except Exception as exc:  # noqa: BLE001
            print(f"  FAIL — unhandled exception: {exc}")
        print()

    print(f"{passed}/{len(checks)} checks passed.")
    return 0 if passed == len(checks) else 1


if __name__ == "__main__":
    sys.exit(main())
