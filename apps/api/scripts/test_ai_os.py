#!/usr/bin/env python3
"""AI OS regression checks — STEP 26, extended in STEP 30 (memory scoping).

Formalizes the adversarial tests already proven live by hand across STEP 04/11/15/24/25/30
into a repeatable script, matching this repo's existing scripts/test_*.py convention
(plain asserts, no new framework/dependency) rather than introducing pytest for the first
time in this codebase — that would be a project-wide convention change, not an AI OS one.

Deliberately does NOT call the real Claude API: the orchestrator checks use a stub
provider (the same technique STEP 04 proved the loop with, before any real tool existed),
so this stays fast, free, and deterministic. Only pure logic and real-DB checks are
covered — RBAC/tenant isolation for tool calls still has no repeatable script (see the
printed summary at the end), since that needs a running server + real HTTP calls, closer
to an integration test than what this file does.
"""

import sys
from types import SimpleNamespace

sys.path.insert(0, ".")

from app.database import SessionLocal
from app.models.approval_limit import ApprovalLimit
from app.models.ai_approval import AiApproval
from app.models.ai_memory import AiMemory
from app.models.auth_user import AuthUser
from app.services.ai import memory_service
from app.services.ai.approval_gate import check_or_create_approval
from app.services.ai.audit_service import _step_failed
from app.services.ai.orchestrator import Orchestrator, OrchestratorStep, OrchestratorTool
from app.services.ai.providers.base import AIProvider, AIResponse, AIToolCall, AIToolDefinition, ProviderHealth


class StubProvider(AIProvider):
    """Returns a scripted sequence of responses instead of calling any real API."""

    provider_id = "stub"
    supports_tools = True

    def __init__(self, responses: list[AIResponse]):
        self._responses = responses
        self._calls = 0

    def generate(self, messages, *, system=None, model=None, max_tokens=4096) -> AIResponse:
        raise NotImplementedError

    def tool_call(self, messages, tools, *, system=None, model=None, max_tokens=4096, server_tools=None) -> AIResponse:
        response = self._responses[min(self._calls, len(self._responses) - 1)]
        self._calls += 1
        return response

    def health_check(self) -> ProviderHealth:
        return ProviderHealth(healthy=True, provider_id=self.provider_id)


def check_step_ceiling() -> bool:
    """A provider that always wants another tool call must not run forever."""
    always_tool_use = AIResponse(
        text="",
        stop_reason="tool_use",
        tool_calls=[AIToolCall(id="1", name="noop", input={})],
        raw=SimpleNamespace(content=[]),
    )
    tool = OrchestratorTool(
        definition=AIToolDefinition(name="noop", description="", input_schema={"type": "object", "properties": {}}),
        handler=lambda inp: {"ok": True},
    )
    orchestrator = Orchestrator(StubProvider([always_tool_use]), [tool], max_steps=4)
    result = orchestrator.run("go")
    if not result.truncated or result.stop_reason != "max_steps":
        print(f"  FAIL — expected truncated max_steps, got stop_reason={result.stop_reason!r} truncated={result.truncated}")
        return False
    call_count = sum(1 for s in result.steps if s.tool_name == "noop")
    if call_count != 4:
        print(f"  FAIL — expected exactly 4 tool calls (max_steps), got {call_count}")
        return False
    print(f"  OK — stopped at exactly max_steps=4, truncated=True")
    return True


def check_tool_exception_safety() -> bool:
    """A tool that raises must become a tool_result error, never crash the run."""
    def boom(inp: dict):
        raise ValueError("simulated failure: customer not found")

    tool = OrchestratorTool(
        definition=AIToolDefinition(name="boom", description="", input_schema={"type": "object", "properties": {}}),
        handler=boom,
    )
    call_boom = AIResponse(
        text="", stop_reason="tool_use", tool_calls=[AIToolCall(id="1", name="boom", input={})],
        raw=SimpleNamespace(content=[]),
    )
    then_stop = AIResponse(text="I couldn't look that up.", stop_reason="end_turn")
    orchestrator = Orchestrator(StubProvider([call_boom, then_stop]), [tool], max_steps=4)
    result = orchestrator.run("go")

    if result.stop_reason != "end_turn" or result.truncated:
        print(f"  FAIL — expected a clean end_turn after the tool error, got {result.stop_reason!r}")
        return False
    boom_steps = [s for s in result.steps if s.tool_name == "boom"]
    if len(boom_steps) != 1 or not boom_steps[0].error or "customer not found" not in boom_steps[0].error:
        print(f"  FAIL — expected one boom step with the exception message as its error, got {boom_steps}")
        return False
    print("  OK — tool exception captured as step.error, run completed normally")
    return True


def check_step_failed_classification() -> bool:
    """audit_service._step_failed() must catch both failure shapes, not just step.error."""
    raised = OrchestratorStep(tool_name="x", tool_input={}, error="boom")
    denied = OrchestratorStep(tool_name="x", tool_input={}, output={"error": "Forbidden", "status_code": 403})
    succeeded = OrchestratorStep(tool_name="x", tool_input={}, output={"count": 0, "customers": []})

    if not _step_failed(raised):
        print("  FAIL — a step with .error set must be classified as failed")
        return False
    if not _step_failed(denied):
        print("  FAIL — a step whose output dict contains 'error' must be classified as failed (STEP 11's bug)")
        return False
    if _step_failed(succeeded):
        print("  FAIL — a normal successful output must not be classified as failed")
        return False
    print("  OK — both failure shapes detected, success not misclassified")
    return True


def check_approval_gate() -> bool:
    """Under a limit: allowed, no row. Over a limit: blocked, a real ai_approvals row."""
    db = SessionLocal()
    company_id = "default"
    role_slug = "system_manager"
    document_type = "ai_os_test.doc"
    ok = True
    limit_row = None
    approval_id = None
    try:
        user = db.query(AuthUser).filter(AuthUser.email == "admin@againerp.local").first()
        if not user:
            print("  FAIL — seeded admin@againerp.local not found; cannot run this check")
            return False

        limit_row = ApprovalLimit(
            company_id=company_id, role_slug=role_slug, document_type=document_type,
            max_amount=5000, is_active=True,
        )
        db.add(limit_row)
        db.flush()

        under = check_or_create_approval(
            db, company_id=company_id, user=user, tool_name="test_tool",
            document_type=document_type, amount=1000, summary="under-limit test",
        )
        if not under.allowed or under.approval_id is not None:
            print(f"  FAIL — under-limit amount should be allowed with no approval row, got {under}")
            ok = False

        over = check_or_create_approval(
            db, company_id=company_id, user=user, tool_name="test_tool",
            document_type=document_type, amount=25000, summary="over-limit test",
        )
        if over.allowed or not over.approval_id:
            print(f"  FAIL — over-limit amount should be blocked with a real approval id, got {over}")
            ok = False
        else:
            approval_id = over.approval_id
            row = db.query(AiApproval).filter(AiApproval.id == approval_id).first()
            if not row or row.status != "pending" or row.tool != "test_tool":
                print(f"  FAIL — expected a real pending ai_approvals row, got {row}")
                ok = False

        if ok:
            print("  OK — under-limit allowed with no row, over-limit blocked with a real pending row")
        return ok
    finally:
        if approval_id:
            db.query(AiApproval).filter(AiApproval.id == approval_id).delete()
        if limit_row is not None:
            db.query(ApprovalLimit).filter(ApprovalLimit.id == limit_row.id).delete()
        db.commit()
        db.close()


def check_memory_scoping() -> bool:
    """STEP 30. A personal memory must be visible only to its own user; a company-scoped
    one must be visible to everyone at that company — list_memories() must apply that
    filter itself, not just save_memory() label rows correctly and hope."""
    db = SessionLocal()
    company_id = "default"
    ids: list[str] = []
    ok = True
    try:
        admin = db.query(AuthUser).filter(AuthUser.email == "admin@againerp.local").first()
        staff = db.query(AuthUser).filter(AuthUser.email == "staff@againerp.local").first()
        if not admin or not staff:
            print("  FAIL — seeded admin@againerp.local / staff@againerp.local not found")
            return False

        personal = memory_service.save_memory(
            db, company_id=company_id, user_id=admin.id, content="admin-only test memory", scope="personal",
        )
        company_wide = memory_service.save_memory(
            db, company_id=company_id, user_id=admin.id, content="company-wide test memory", scope="company",
        )
        ids = [personal.id, company_wide.id]

        if company_wide.user_id is not None:
            print(f"  FAIL — company-scoped memory should have user_id=None, got {company_wide.user_id!r}")
            ok = False

        admin_view = memory_service.list_memories(db, company_id=company_id, user_id=admin.id)
        staff_view = memory_service.list_memories(db, company_id=company_id, user_id=staff.id)

        if "admin-only test memory" not in admin_view:
            print("  FAIL — admin should see their own personal memory")
            ok = False
        if "company-wide test memory" not in admin_view:
            print("  FAIL — admin should see the company-wide memory")
            ok = False
        if "admin-only test memory" in staff_view:
            print("  FAIL — staff should NOT see admin's personal memory")
            ok = False
        if "company-wide test memory" not in staff_view:
            print("  FAIL — staff should see the company-wide memory too")
            ok = False

        if ok:
            print("  OK — personal memory isolated per-user, company-wide memory shared")
        return ok
    finally:
        if ids:
            db.query(AiMemory).filter(AiMemory.id.in_(ids)).delete(synchronize_session=False)
        db.commit()
        db.close()


def main() -> int:
    print("=== AI OS Regression Checks ===\n")
    checks = [
        ("[1/5] Orchestrator step ceiling", check_step_ceiling),
        ("[2/5] Orchestrator tool-exception safety", check_tool_exception_safety),
        ("[3/5] Audit failure classification", check_step_failed_classification),
        ("[4/5] Approval gate (real DB)", check_approval_gate),
        ("[5/5] Memory scoping (real DB)", check_memory_scoping),
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
    print(
        "\nNot covered here (needs a running server + real HTTP calls, not just pure "
        "logic/DB): RBAC permission enforcement and cross-tenant isolation for tool calls "
        "(STEP 11/12), and anything requiring a real Claude response (web search, prompt "
        "caching, live token/cost figures) — those stay manual/live per the master plan's "
        "own testing discipline, not because they're untested, but because a mocked "
        "Claude response would test the mock, not the integration."
    )
    return 0 if passed == len(checks) else 1


if __name__ == "__main__":
    sys.exit(main())
