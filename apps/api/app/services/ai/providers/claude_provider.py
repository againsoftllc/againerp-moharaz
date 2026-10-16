"""Claude provider — Step 7.

Talks to the Anthropic Messages API directly (no platform gateway in between),
the same way `app/services/catalog_ai/llm_extractor.py` already does for
product-from-URL import. That file is the proof this pattern works against the
SDK version actually installed here; this provider generalizes it instead of
introducing a second, divergent way of calling Anthropic.

Deliberately built on the stable, non-beta surface (`messages.create`, plain
`tools` + `tool_choice`, `output_config.format` for structured output) rather
than the beta tool runner or adaptive-thinking betas — this runs inside a
FastAPI request path serving business data, where a beta-flag mismatch on a
pinned SDK version is a worse failure mode than not using the newest knob.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

import anthropic

from app.config import get_settings
from app.services.ai.providers.base import (
    AIMessage,
    AIProvider,
    AIResponse,
    AIToolCall,
    AIToolDefinition,
    ProviderError,
    ProviderHealth,
)

logger = logging.getLogger(__name__)


def _cached_system(system: Optional[str]):
    if not system:
        return anthropic.NOT_GIVEN
    return [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]


def _to_anthropic_messages(messages: list[AIMessage]) -> list[dict[str, Any]]:
    return [{"role": m.role, "content": m.content} for m in messages]


def _extract_server_tool_calls(content: list) -> list[dict]:
    calls = []
    pending_query = None
    for block in content:
        if block.type == "server_tool_use" and block.name == "web_search":
            pending_query = block.input.get("query")
        elif block.type == "web_search_tool_result":
            results = block.content
            if isinstance(results, list):
                summary = [
                    {"title": getattr(r, "title", None), "url": getattr(r, "url", None)}
                    for r in results
                ]
                calls.append({"query": pending_query, "result_count": len(results), "results": summary})
            else:
                # Server-tool error shape — HTTP 200 with an error object, not a raised
                # exception (Claude API skill's own documented pitfall).
                calls.append({"query": pending_query, "error": getattr(results, "error_code", str(results))})
            pending_query = None
    return calls


class ClaudeProvider(AIProvider):
    provider_id = "claude"
    supports_tools = True
    supports_streaming = True

    def __init__(self, api_key: Optional[str] = None, default_model: Optional[str] = None):
        settings = get_settings()
        self._api_key = (api_key or settings.anthropic_api_key or "").strip()
        self._default_model = default_model or settings.ai_default_model
        self._client: Optional[anthropic.Anthropic] = None

    def _require_client(self) -> anthropic.Anthropic:
        if not self._api_key:
            raise ProviderError(
                "Claude provider has no ANTHROPIC_API_KEY configured. "
                "Set it in Workspace → AI Providers, or the ANTHROPIC_API_KEY env var."
            )
        if self._client is None:
            self._client = anthropic.Anthropic(api_key=self._api_key)
        return self._client

    def _model(self, model: Optional[str]) -> str:
        return model or self._default_model

    def _handle_api_error(self, exc: anthropic.APIError) -> ProviderError:
        # Don't leak the raw exception (may include request internals) —
        # normalize into ProviderError with a message safe to show the user.
        return ProviderError(f"Claude request failed: {exc.message if hasattr(exc, 'message') else exc}")

    # ---------------------------------------------------------------- generate

    def generate(
        self,
        messages: list[AIMessage],
        *,
        system: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 4096,
    ) -> AIResponse:
        client = self._require_client()
        try:
            response = client.messages.create(
                model=self._model(model),
                max_tokens=max_tokens,
                system=_cached_system(system),
                messages=_to_anthropic_messages(messages),
            )
        except anthropic.APIError as exc:
            raise self._handle_api_error(exc) from exc
        text = "".join(b.text for b in response.content if b.type == "text")
        return AIResponse(
            text=text,
            stop_reason=response.stop_reason or "end_turn",
            provider_id=self.provider_id,
            model_id=response.model,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            cache_creation_input_tokens=response.usage.cache_creation_input_tokens or 0,
            cache_read_input_tokens=response.usage.cache_read_input_tokens or 0,
            raw=response,
        )

    # ------------------------------------------------------------------ stream

    def stream(
        self,
        messages: list[AIMessage],
        *,
        system: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 4096,
    ):
        client = self._require_client()
        try:
            with client.messages.stream(
                model=self._model(model),
                max_tokens=max_tokens,
                system=_cached_system(system),
                messages=_to_anthropic_messages(messages),
            ) as stream:
                yield from stream.text_stream
        except anthropic.APIError as exc:
            raise self._handle_api_error(exc) from exc

    # --------------------------------------------------------------- tool_call

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
        client = self._require_client()
        anthropic_tools = [
            {"name": t.name, "description": t.description, "input_schema": t.input_schema}
            for t in tools
        ] + list(server_tools or [])
        try:
            response = client.messages.create(
                model=self._model(model),
                max_tokens=max_tokens,
                system=_cached_system(system),
                messages=_to_anthropic_messages(messages),
                tools=anthropic_tools,
            )
        except anthropic.APIError as exc:
            raise self._handle_api_error(exc) from exc

        text = "".join(b.text for b in response.content if b.type == "text")
        tool_calls = [
            AIToolCall(id=b.id, name=b.name, input=b.input)
            for b in response.content
            if b.type == "tool_use"
        ]
        return AIResponse(
            text=text,
            stop_reason=response.stop_reason or "end_turn",
            tool_calls=tool_calls,
            server_tool_calls=_extract_server_tool_calls(response.content),
            provider_id=self.provider_id,
            model_id=response.model,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            cache_creation_input_tokens=response.usage.cache_creation_input_tokens or 0,
            cache_read_input_tokens=response.usage.cache_read_input_tokens or 0,
            raw=response,
        )

    # ------------------------------------------------------- tool_call_stream

    def tool_call_stream(
        self,
        messages: list[AIMessage],
        tools: list[AIToolDefinition],
        *,
        system: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 4096,
        server_tools: Optional[list[dict]] = None,
    ):
        """messages.stream() + tools, accumulated via get_final_message() — verified live
        against the real API before writing this: a turn that ends in tool_use streams no
        text (expected — Claude decided to call a tool instead of talking), and a turn that
        ends in end_turn streams real token-by-token text deltas. Both were confirmed with
        the actual SDK, not assumed from documentation. Web search was verified the same
        way (§16/STEP 13): text_delta events fire normally around the server-tool blocks,
        no special handling needed on the streaming side beyond forwarding server_tools."""
        client = self._require_client()
        anthropic_tools = [
            {"name": t.name, "description": t.description, "input_schema": t.input_schema}
            for t in tools
        ] + list(server_tools or [])
        try:
            with client.messages.stream(
                model=self._model(model),
                max_tokens=max_tokens,
                system=_cached_system(system),
                messages=_to_anthropic_messages(messages),
                tools=anthropic_tools,
            ) as stream:
                for event in stream:
                    if event.type == "content_block_delta" and event.delta.type == "text_delta":
                        yield ("delta", event.delta.text)
                response = stream.get_final_message()
        except anthropic.APIError as exc:
            raise self._handle_api_error(exc) from exc

        text = "".join(b.text for b in response.content if b.type == "text")
        tool_calls = [
            AIToolCall(id=b.id, name=b.name, input=b.input)
            for b in response.content
            if b.type == "tool_use"
        ]
        yield (
            "final",
            AIResponse(
                text=text,
                stop_reason=response.stop_reason or "end_turn",
                tool_calls=tool_calls,
                server_tool_calls=_extract_server_tool_calls(response.content),
                provider_id=self.provider_id,
                model_id=response.model,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
                cache_creation_input_tokens=response.usage.cache_creation_input_tokens or 0,
                cache_read_input_tokens=response.usage.cache_read_input_tokens or 0,
                raw=response,
            ),
        )

    # ------------------------------------------------------------ structured

    def structured_output(
        self,
        messages: list[AIMessage],
        json_schema: dict[str, Any],
        *,
        system: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 4096,
    ) -> dict[str, Any]:
        client = self._require_client()
        try:
            response = client.messages.create(
                model=self._model(model),
                max_tokens=max_tokens,
                system=_cached_system(system),
                messages=_to_anthropic_messages(messages),
                output_config={"format": {"type": "json_schema", "schema": json_schema}},
            )
        except anthropic.APIError as exc:
            raise self._handle_api_error(exc) from exc
        text = next((b.text for b in response.content if b.type == "text"), "")
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            raise ProviderError(f"Claude returned invalid JSON for the requested schema: {exc}") from exc

    # ----------------------------------------------------------- health_check

    def health_check(self) -> ProviderHealth:
        if not self._api_key:
            return ProviderHealth(healthy=False, provider_id=self.provider_id, detail="No API key configured")
        try:
            client = self._require_client()
            # Cheapest real call that proves the key + network path both work.
            client.messages.create(
                model=self._default_model,
                max_tokens=1,
                messages=[{"role": "user", "content": "ping"}],
            )
            return ProviderHealth(healthy=True, provider_id=self.provider_id, detail=self._default_model)
        except anthropic.AuthenticationError:
            return ProviderHealth(healthy=False, provider_id=self.provider_id, detail="Invalid API key")
        except anthropic.APIError as exc:
            return ProviderHealth(healthy=False, provider_id=self.provider_id, detail=str(exc))
