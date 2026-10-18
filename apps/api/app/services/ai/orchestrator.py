"""AI Orchestrator — STEP 04.

The loop described in docs/AGAINERP_AI_OS_MASTER_PLAN.md §9:

    request -> plan -> select tools -> execute -> observe -> continue/retry -> verify -> respond

Deliberately provider- and tool-agnostic: it only knows the `AIProvider` port (§7) and a
list of `OrchestratorTool`, never a concrete provider class or a concrete ERP tool. Real
ERP tools are wired in by the Tool Gateway (STEP 05); this module has no ERP-specific code
and is fully testable with a fake tool, which is how it was verified before any real tool
existed (see §8/§30's evidence pattern — prove the mechanism, then attach real handlers).

Safety properties enforced here, not left to callers:
- `max_steps` bounds the loop — no request can spin forever or run up unbounded cost (§26).
- A tool's return value is always wrapped as a `tool_result` content block — it is data
  Claude reads, never text spliced into the system prompt (blocks prompt injection via
  tool output, §26).
- A tool exception becomes `is_error: true` in the tool_result, not a crashed request —
  Claude sees the failure and can decide to retry, use another tool, or give up.
- Every step (tool name, input, output/error, latency) is collected into `OrchestratorResult
.steps`, which is exactly the shape STEP 11 (audit log) needs — building the trace now
  avoids re-deriving it later.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Iterator, Optional, Union

from app.services.ai.providers.base import (
    AIMessage,
    AIProvider,
    AIResponse,
    AIToolCall,
    AIToolDefinition,
)


class RiskTier(str, Enum):
    """Master plan §11. Metadata only — the actual permission enforcement already happens
    because every tool forwards the caller's real bearer token into a real API call (§10);
    this tier does not grant or restrict anything by itself. It exists so the tool catalog
    is visible (GET /api/v1/ai/tools), so audit rows (STEP 11) are queryable by risk, and
    so STEP 15's approval routing has something typed to key off instead of sniffing a 403
    or guessing from the tool name."""

    READ = "read"
    WRITE = "write"
    APPROVE = "approve"
    DELETE = "delete"
    FINANCIAL = "financial"
    SENSITIVE = "sensitive"
    EXTERNAL = "external"


@dataclass(frozen=True)
class OrchestratorTool:
    """A tool the orchestrator can call. `handler` receives the parsed tool input (already
    JSON-decoded by the provider — see the Claude API skill's tool-call parsing warning)
    and returns any JSON-serializable value, or raises.

    `risk_tier` and `module` are ours, not Claude's — they never go into the wire schema
    (`definition` is what Claude actually sees). `module` names the RBAC module this tool
    reads/writes (e.g. "customers"), for display and audit only; the token forwarded in
    `handler` is what actually gets checked against it."""

    definition: AIToolDefinition
    handler: Callable[[dict[str, Any]], Any]
    risk_tier: RiskTier = RiskTier.READ
    module: str = ""


@dataclass
class OrchestratorStep:
    tool_name: str
    tool_input: dict[str, Any]
    output: Any = None
    error: Optional[str] = None
    latency_ms: int = 0
    risk_tier: Optional[RiskTier] = None
    module: str = ""


@dataclass
class OrchestratorResult:
    text: str
    steps: list[OrchestratorStep] = field(default_factory=list)
    stop_reason: str = "end_turn"
    truncated: bool = False  # hit max_steps before Claude reached end_turn
    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0


@dataclass(frozen=True)
class StreamTextDelta:
    text: str


@dataclass(frozen=True)
class StreamToolStart:
    tool_name: str
    tool_input: dict[str, Any]


@dataclass(frozen=True)
class StreamToolResult:
    tool_name: str
    output: Any
    error: Optional[str]
    latency_ms: int
    risk_tier: Optional[RiskTier]
    module: str


@dataclass(frozen=True)
class StreamDone:
    stop_reason: str
    truncated: bool
    input_tokens: int
    output_tokens: int
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0


@dataclass(frozen=True)
class StreamTextReset:
    """The text streamed so far this turn was withdrawn (self-written preview, see
    _SELF_PREVIEW_NUDGE) — the client clears the message; new deltas follow."""


StreamEvent = Union[StreamTextDelta, StreamToolStart, StreamToolResult, StreamTextReset, StreamDone]

# Smaller models sometimes answer "add SEO" / "create an order" by typing the would-be values
# themselves and asking "Confirm?" — without calling the tool. Confirming that saves nothing
# (or something different), and it bypasses the tool's own checks. When a turn ends asking for
# confirmation and no action tool ran, the model gets one corrective turn.
# Results of a confirmed (confirm=true) action that wrote something.
_COMMITTED_STATUSES = {"created", "updated", "saved", "confirmed", "approved", "scheduled", "drafted", "pending_approval"}
# …of which these only ever come from a save (the confirm guard may run it without `confirm`
# in the model's own call).
_SAVE_ONLY_STATUSES = {"updated", "saved", "confirmed", "approved", "scheduled", "pending_approval"}
_ASKS_CONFIRM = re.compile(r"confirm|কনফার্ম|নিশ্চিত", re.I)
_SELF_PREVIEW_NUDGE = (
    "[system check] Your reply asks the user to confirm, but you did not call any action tool in "
    "this turn — a preview you write yourself is not allowed. If the user asked you to create, change "
    "or add something, call the matching tool now WITHOUT confirm and show only its preview. If you "
    "really need more information first, ask only for that information and do not present values to "
    "confirm. Do not mention this check."
)


class Orchestrator:
    def __init__(
        self,
        provider: AIProvider,
        tools: list[OrchestratorTool],
        *,
        system: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 4096,
        max_steps: int = 8,
        enable_web_search: bool = False,
        web_search_max_uses: int = 3,
        followup=None,
    ):
        # After the first tool call the model only has to read the result and answer: `followup(names of the tools used)` returns the
        # (smaller) system prompt and tool list for the remaining steps - the first step carries the full routed set (ai.md 5.2).
        self._followup = followup
        self._provider = provider
        self._tools = {t.definition.name: t for t in tools}
        self._committed = False  # a confirmed action already wrote something in this run
        self._tool_defs = [t.definition for t in tools]
        self._system = system
        self._model = model
        self._max_tokens = max_tokens
        self._max_steps = max_steps
        # Opt-in, never a standing capability (master plan §16) — a caller must construct
        # the orchestrator with enable_web_search=True; there is no global default-on path.
        self._server_tools: list[dict] = (
            [{"type": "web_search_20260209", "name": "web_search", "max_uses": web_search_max_uses}]
            if enable_web_search
            else []
        )

    @staticmethod
    def _server_tool_steps(response: AIResponse) -> list[OrchestratorStep]:
        """Web search runs on Anthropic's own infrastructure inside the same turn — there is
        no local handler to execute (contrast with _execute(), which runs OUR tools). This
        only turns what already happened into the same OrchestratorStep shape a client tool
        call would produce, so audit logging and the SSE UI don't need a separate code path
        for "the AI looked something up externally" vs. "the AI called an ERP tool"."""
        steps = []
        for call in response.server_tool_calls:
            steps.append(
                OrchestratorStep(
                    tool_name="web_search",
                    tool_input={"query": call.get("query")},
                    output=None if call.get("error") else call,
                    error=call.get("error"),
                    latency_ms=0,  # not measured server-side by the API
                    risk_tier=RiskTier.EXTERNAL,
                    module="web_search",
                )
            )
        return steps

    def _execute(self, call: AIToolCall) -> OrchestratorStep:
        tool = self._tools.get(call.name)
        start = time.monotonic()
        if tool is None:
            # Claude asked for a tool that isn't in this run's registry — report it as a
            # tool error so the model can correct itself, rather than raising in our code.
            return OrchestratorStep(
                tool_name=call.name,
                tool_input=call.input,
                error=f"Unknown tool '{call.name}'",
                latency_ms=0,
            )
        if self._committed and tool.risk_tier != RiskTier.READ:
            # Something was already saved this turn. Starting another action (even a preview) the
            # user never asked for is how "yes, confirm" for a price change turned into an
            # unrequested SEO preview (verified live) — the next action needs the user's word.
            return OrchestratorStep(
                tool_name=call.name,
                tool_input=call.input,
                output={
                    "error": "An action was already saved in this reply. Do not start another action now — "
                    "report what was saved; if a follow-up makes sense, ask the user in plain text."
                },
                latency_ms=0,
                risk_tier=tool.risk_tier,
                module=tool.module,
            )
        try:
            output = tool.handler(call.input)
            status = output.get("status") if isinstance(output, dict) else None
            if tool.risk_tier != RiskTier.READ and (
                status in _SAVE_ONLY_STATUSES
                # image generation also says "created" with no confirm step — only count it
                # when it answered a confirm call
                or (status in _COMMITTED_STATUSES and (call.input or {}).get("confirm"))
            ):
                self._committed = True
            return OrchestratorStep(
                tool_name=call.name,
                tool_input=call.input,
                output=output,
                latency_ms=int((time.monotonic() - start) * 1000),
                risk_tier=tool.risk_tier,
                module=tool.module,
            )
        except Exception as exc:  # noqa: BLE001 — any tool failure must become a tool_result, never a crash
            return OrchestratorStep(
                tool_name=call.name,
                tool_input=call.input,
                error=str(exc),
                latency_ms=int((time.monotonic() - start) * 1000),
                risk_tier=tool.risk_tier,
                module=tool.module,
            )

    def _needs_preview_nudge(self, text: str, steps: list[OrchestratorStep], nudged: bool) -> bool:
        if nudged or not _ASKS_CONFIRM.search(text or ""):
            return False
        if not any(t.risk_tier != RiskTier.READ for t in self._tools.values()):
            return False
        return not any(s.risk_tier not in (None, RiskTier.READ) for s in steps)

    def run(self, user_message: str, history: Optional[list[AIMessage]] = None) -> OrchestratorResult:
        messages: list[AIMessage] = list(history or [])
        messages.append(AIMessage(role="user", content=user_message))
        all_steps: list[OrchestratorStep] = []
        input_tokens = output_tokens = 0
        cache_creation_tokens = cache_read_tokens = 0
        nudged = False

        if not self._provider.supports_tools:
            # Text-only provider (e.g. CenterProvider → Center AI brain → OpenAI): there is
            # no tool contract, so run a single plain turn instead of the tool loop. ERP
            # tools are simply not offered on this path — never silently faked.
            response = self._provider.generate(
                messages, system=self._system, model=self._model, max_tokens=self._max_tokens
            )
            return OrchestratorResult(
                text=response.text,
                steps=[],
                stop_reason=response.stop_reason or "end_turn",
                input_tokens=response.input_tokens,
                output_tokens=response.output_tokens,
            )

        cur_system, cur_defs, used = self._system, self._tool_defs, set()
        for step_no in range(self._max_steps):
            response: AIResponse = self._provider.tool_call(
                messages,
                cur_defs,
                system=cur_system,
                model=self._model,
                max_tokens=self._max_tokens,
                server_tools=self._server_tools,
            )
            input_tokens += response.input_tokens
            output_tokens += response.output_tokens
            cache_creation_tokens += response.cache_creation_input_tokens
            cache_read_tokens += response.cache_read_input_tokens
            all_steps.extend(self._server_tool_steps(response))

            if response.stop_reason != "tool_use" or not response.tool_calls:
                if self._needs_preview_nudge(response.text, all_steps, nudged):
                    nudged = True
                    messages.append(AIMessage(role="assistant", content=response.text or "…"))
                    messages.append(AIMessage(role="user", content=_SELF_PREVIEW_NUDGE))
                    continue
                return OrchestratorResult(
                    text=response.text,
                    steps=all_steps,
                    stop_reason=response.stop_reason,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    cache_creation_input_tokens=cache_creation_tokens,
                    cache_read_input_tokens=cache_read_tokens,
                )

            # Preserve the raw content (text + tool_use blocks) exactly as returned —
            # required so the next request's history is valid per the tool-use contract.
            messages.append(AIMessage(role="assistant", content=response.raw.content))

            tool_results = []
            for call in response.tool_calls:
                result = self._execute(call)
                all_steps.append(result)
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": call.id,
                        "content": str(result.error) if result.error else _stringify(result.output),
                        "is_error": result.error is not None,
                    }
                )
            messages.append(AIMessage(role="user", content=tool_results))
            used |= {c.name for c in response.tool_calls}
            if self._followup:
                cur_system, cur_defs = self._followup(used)

        # Exhausted max_steps without reaching end_turn — stop, don't loop forever.
        return OrchestratorResult(
            text="I stopped after too many steps without finishing — please rephrase or narrow the request.",
            steps=all_steps,
            stop_reason="max_steps",
            truncated=True,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_creation_input_tokens=cache_creation_tokens,
            cache_read_input_tokens=cache_read_tokens,
        )

    def run_stream(
        self, user_message: str, history: Optional[list[AIMessage]] = None
    ) -> Iterator[StreamEvent]:
        """Same loop and the same _execute() safety handling as run() — text arrives as it's
        generated (StreamTextDelta), each tool call is visible as it happens (StreamToolStart
        / StreamToolResult) rather than only after the whole run finishes, and StreamDone
        carries exactly what OrchestratorResult would have. No chain-of-thought is ever
        requested from the provider, so there is nothing of that kind to leak here (§26)."""
        messages: list[AIMessage] = list(history or [])
        messages.append(AIMessage(role="user", content=user_message))
        input_tokens = output_tokens = 0
        cache_creation_tokens = cache_read_tokens = 0
        stream_steps: list[OrchestratorStep] = []
        nudged = False

        if not self._provider.supports_tools:
            # See run(): text-only provider → one plain turn, no tool loop. Providers on this
            # path have no real streaming transport, so a single generate() keeps the usage
            # numbers that a fake delta stream would lose.
            response = self._provider.generate(
                messages, system=self._system, model=self._model, max_tokens=self._max_tokens
            )
            if response.text:
                yield StreamTextDelta(text=response.text)
            yield StreamDone(
                stop_reason=response.stop_reason or "end_turn",
                truncated=False,
                input_tokens=response.input_tokens,
                output_tokens=response.output_tokens,
            )
            return

        cur_system, cur_defs, used = self._system, self._tool_defs, set()
        for _step_no in range(self._max_steps):
            response: Optional[AIResponse] = None
            for kind, payload in self._provider.tool_call_stream(
                messages,
                cur_defs,
                system=cur_system,
                model=self._model,
                max_tokens=self._max_tokens,
                server_tools=self._server_tools,
            ):
                if kind == "delta":
                    yield StreamTextDelta(text=payload)
                else:
                    response = payload
            assert response is not None, "provider stream ended without a final AIResponse"

            input_tokens += response.input_tokens
            output_tokens += response.output_tokens
            cache_creation_tokens += response.cache_creation_input_tokens
            cache_read_tokens += response.cache_read_input_tokens

            # Only known after get_final_message() resolves, so — unlike text — these can't
            # appear positionally mid-stream; they surface once, right after this turn's
            # text has finished streaming. Documented simplification, not a bug: true
            # positional accuracy would need per-block stream events, not just text deltas.
            for server_step in self._server_tool_steps(response):
                yield StreamToolStart(tool_name=server_step.tool_name, tool_input=server_step.tool_input)
                yield StreamToolResult(
                    tool_name=server_step.tool_name,
                    output=server_step.output,
                    error=server_step.error,
                    latency_ms=server_step.latency_ms,
                    risk_tier=server_step.risk_tier,
                    module=server_step.module,
                )

            if response.stop_reason != "tool_use" or not response.tool_calls:
                if self._needs_preview_nudge(response.text, stream_steps, nudged):
                    nudged = True
                    yield StreamTextReset()
                    messages.append(AIMessage(role="assistant", content=response.text or "…"))
                    messages.append(AIMessage(role="user", content=_SELF_PREVIEW_NUDGE))
                    continue
                yield StreamDone(
                    stop_reason=response.stop_reason,
                    truncated=False,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    cache_creation_input_tokens=cache_creation_tokens,
                    cache_read_input_tokens=cache_read_tokens,
                )
                return

            messages.append(AIMessage(role="assistant", content=response.raw.content))

            tool_results = []
            for call in response.tool_calls:
                yield StreamToolStart(tool_name=call.name, tool_input=call.input)
                result = self._execute(call)
                stream_steps.append(result)
                yield StreamToolResult(
                    tool_name=result.tool_name,
                    output=result.output,
                    error=result.error,
                    latency_ms=result.latency_ms,
                    risk_tier=result.risk_tier,
                    module=result.module,
                )
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": call.id,
                        "content": str(result.error) if result.error else _stringify(result.output),
                        "is_error": result.error is not None,
                    }
                )
            messages.append(AIMessage(role="user", content=tool_results))
            used |= {c.name for c in response.tool_calls}
            if self._followup:
                cur_system, cur_defs = self._followup(used)

        yield StreamDone(
            stop_reason="max_steps",
            truncated=True,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_creation_input_tokens=cache_creation_tokens,
            cache_read_input_tokens=cache_read_tokens,
        )


MAX_RESULT_ROWS = 40      # a list longer than this is cut, with a note telling the model to narrow the query
MAX_RESULT_TEXT = 1500    # one long text value (a description, an HTML body) is cut


def _compact(value: Any, depth: int = 0) -> Any:
    """Tool output without what the model cannot use: null / empty fields, very long lists and texts."""
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            c = _compact(v, depth + 1)
            if c is None or c == "" or c == [] or c == {}:
                continue
            out[k] = c
        return out
    if isinstance(value, list):
        rows = [_compact(v, depth + 1) for v in value[:MAX_RESULT_ROWS]]
        if len(value) > MAX_RESULT_ROWS:
            rows.append(f"... {len(value) - MAX_RESULT_ROWS} more rows not shown - narrow the query (filter / aggregate / limit) if they are needed")
        return rows
    if isinstance(value, str) and len(value) > MAX_RESULT_TEXT:
        return value[:MAX_RESULT_TEXT] + "..."
    return value


def _stringify(value: Any) -> str:
    if isinstance(value, str):
        return value
    import json

    try:
        return json.dumps(_compact(value), default=str, ensure_ascii=False, separators=(",", ":"))
    except TypeError:
        return str(value)
