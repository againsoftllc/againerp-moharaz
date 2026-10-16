"""AI provider abstraction — Step 6 of the AI OS integration.

Every LLM call in the ERP goes through an `AIProvider`, never a bare SDK
client. That keeps a specific vendor (Claude today, others later) out of
business code and gives the AI gateway one place to add retries, audit
logging, and a health check per provider.

This module intentionally mirrors the shape sketched in
docs/AI_OS_INTEGRATION_AUDIT.md §9 — `generate / stream / tool_call /
structured_output / health_check` — adapted to Python (ABC, not an
interface) and to what the installed Anthropic SDK actually supports
(verified against the container, not assumed).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Callable, Iterator, Literal, Optional, Union


class ProviderError(Exception):
    """Base class for provider failures the gateway should show the user."""


class ProviderCapabilityError(ProviderError):
    """Raised when a provider is asked for something it cannot do.

    e.g. `CenterProvider.tool_call()` — the Center conversation endpoint is
    text-only. Callers catch this and either pick a different provider or
    surface a clear "not supported" message, instead of the request silently
    degrading to a plain-text answer that ignores the tools it was given.
    """

    def __init__(self, provider: str, capability: str):
        self.provider = provider
        self.capability = capability
        super().__init__(f"Provider '{provider}' does not support {capability}")


@dataclass(frozen=True)
class AIMessage:
    """One turn in a conversation. `content` mirrors the Anthropic content-block
    shape (str, or a list of block dicts) so provider adapters can pass it
    through with minimal translation."""

    role: Literal["user", "assistant"]
    content: Any


@dataclass(frozen=True)
class AIToolDefinition:
    """A tool exposed to the model. `handler` is intentionally absent here —
    this is the wire schema only; execution belongs to the tool gateway
    (Step 8), not the provider."""

    name: str
    description: str
    input_schema: dict[str, Any]


@dataclass(frozen=True)
class AIToolCall:
    id: str
    name: str
    input: dict[str, Any]


@dataclass(frozen=True)
class AIResponse:
    """Normalized result of one provider turn — enough for the orchestrator to
    decide whether to execute tools, stop, or continue, without knowing which
    provider produced it.

    `server_tool_calls` is distinct from `tool_calls`: a server tool (e.g. web
    search) is executed by the provider itself inside this same turn — there is
    no local handler to run and no tool_result to send back. It's populated
    here purely so the caller can log/display that it happened (§24 audit,
    §21 progress visibility); the orchestrator never "executes" these."""

    text: str
    stop_reason: str
    tool_calls: list[AIToolCall] = field(default_factory=list)
    server_tool_calls: list[dict] = field(default_factory=list)
    provider_id: str = ""
    model_id: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    # STEP 14 — 0 for a provider/call that doesn't cache; verified live that Claude
    # populates these correctly (cache_creation_input_tokens on the write, then
    # cache_read_input_tokens on a repeated identical prefix).
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0
    raw: Any = None


@dataclass(frozen=True)
class ProviderHealth:
    healthy: bool
    provider_id: str
    detail: str = ""


class AIProvider(ABC):
    """Port every concrete provider implements. See ClaudeProvider and
    CenterProvider for the two adapters currently registered."""

    #: Stable id used in ai_audit_log rows and provider selection ("claude", "center").
    provider_id: str = "base"
    supports_tools: bool = False
    supports_streaming: bool = False

    @abstractmethod
    def generate(
        self,
        messages: list[AIMessage],
        *,
        system: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 4096,
    ) -> AIResponse:
        """One-shot text generation, no tools."""

    def stream(
        self,
        messages: list[AIMessage],
        *,
        system: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 4096,
    ) -> Iterator[str]:
        """Yield text deltas. Default falls back to one non-streamed call —
        override when the provider has a real streaming transport."""
        response = self.generate(messages, system=system, model=model, max_tokens=max_tokens)
        yield response.text

    def tool_call(
        self,
        messages: list[AIMessage],
        tools: list[AIToolDefinition],
        *,
        system: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 4096,
        server_tools: Optional[list[dict]] = None,
    ) -> AIResponse:
        """One turn with tools available. Raises ProviderCapabilityError if
        `supports_tools` is False — never silently ignores the tool list.

        `server_tools` are raw Anthropic server-tool definitions (e.g.
        {"type": "web_search_20260209", "name": "web_search", "max_uses": 3})
        — opt-in per call, never included unless the caller explicitly passes
        them (§16: web search must not be a standing capability)."""
        raise ProviderCapabilityError(self.provider_id, "tool_call")

    def tool_call_stream(
        self,
        messages: list[AIMessage],
        tools: list[AIToolDefinition],
        *,
        system: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 4096,
        server_tools: Optional[list[dict]] = None,
    ) -> Iterator[tuple[str, Union[str, "AIResponse"]]]:
        """Like tool_call(), but yields text as it's generated instead of returning it all
        at once. Contract: yields ("delta", str) for each text chunk during generation, then
        exactly one final ("final", AIResponse) — the same AIResponse tool_call() would have
        returned (stop_reason, tool_calls, usage all included), so a caller that only cares
        about the end result can drain the generator and take the last item.

        Raises ProviderCapabilityError if unsupported (default here) — same reasoning as
        tool_call() and structured_output(): a provider that can't stream should say so
        loudly, not silently return everything in one chunk while claiming to stream.
        """
        raise ProviderCapabilityError(self.provider_id, "tool_call_stream")
        yield  # pragma: no cover — unreachable; makes this a generator function's signature match subclasses

    def structured_output(
        self,
        messages: list[AIMessage],
        json_schema: dict[str, Any],
        *,
        system: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 4096,
    ) -> dict[str, Any]:
        """One turn constrained to return JSON matching `json_schema`."""
        raise ProviderCapabilityError(self.provider_id, "structured_output")

    @abstractmethod
    def health_check(self) -> ProviderHealth:
        """Cheap, side-effect-free check of whether this provider is usable
        right now (key configured, endpoint reachable) — not a real LLM call."""
