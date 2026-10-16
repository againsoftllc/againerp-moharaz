"""OpenAI provider — the default engine behind "Aladin".

Talks to the OpenAI Chat Completions API directly over httpx (no SDK dependency) with
native function calling and streaming. Everything user-facing is branded Aladin: error
text never names the vendor, and the key is resolved by `app/services/ai/ai_key_service.py`
(Workspace-stored key first, `OPENAI_API_KEY` env second) so an administrator can configure
it from the AI screen without touching the deployment.

Message and tool shapes are the provider-neutral Anthropic-style blocks used across the
orchestrator (`text`, `tool_use`, `tool_result`); this adapter translates both ways so the
same conversation history replays on any provider.
"""

from __future__ import annotations

import json
import logging
from types import SimpleNamespace
from typing import Any, Iterator, Optional

import httpx

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

DEFAULT_BASE_URL = "https://api.openai.com/v1"
DEFAULT_MODEL = "gpt-4o-mini"
NOT_CONFIGURED = (
    "Aladin is not configured yet. An administrator can add the Aladin API key from "
    "AI → Settings (gear icon), or set OPENAI_API_KEY on the server."
)
MAX_TOOL_RESULT_CHARS = 24_000


def _brand(message: str) -> str:
    """Vendor names never reach the user — the product is Aladin."""
    return (
        message.replace("OpenAI", "Aladin")
        .replace("openai", "Aladin")
        .replace("ChatGPT", "Aladin")
    )


def _text_of(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            str(b.get("text", ""))
            for b in content
            if isinstance(b, dict) and b.get("type") == "text" and b.get("text")
        )
    return "" if content is None else str(content)


def _result_text(block: dict) -> str:
    content = block.get("content")
    if isinstance(content, list):
        content = _text_of(content)
    text = "" if content is None else str(content)
    if len(text) > MAX_TOOL_RESULT_CHARS:
        text = text[:MAX_TOOL_RESULT_CHARS] + "\n…[truncated]"
    if block.get("is_error"):
        return f"ERROR: {text}" if text else "ERROR"
    return text


def _to_openai_messages(system: Optional[str], messages: list[AIMessage]) -> list[dict]:
    """Neutral blocks → chat messages. Every assistant tool_use must be answered by a `tool`
    message before the next turn or the API rejects the request; a missing result (client
    crashed mid-loop) is filled with a placeholder so old history stays replayable."""
    out: list[dict] = []
    if system:
        out.append({"role": "system", "content": system})
    pending: list[str] = []

    def flush() -> None:
        for tid in pending:
            out.append({"role": "tool", "tool_call_id": tid, "content": "(no result returned)"})
        pending.clear()

    for msg in messages:
        content = msg.content
        if msg.role == "assistant":
            flush()
            text = _text_of(content)
            tool_calls = []
            if isinstance(content, list):
                for b in content:
                    if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("id"):
                        tool_calls.append(
                            {
                                "id": str(b["id"]),
                                "type": "function",
                                "function": {
                                    "name": str(b.get("name") or ""),
                                    "arguments": json.dumps(b.get("input") or {}, ensure_ascii=False),
                                },
                            }
                        )
                        pending.append(str(b["id"]))
            if not text and not tool_calls:
                continue
            entry: dict[str, Any] = {"role": "assistant", "content": text or None}
            if tool_calls:
                entry["tool_calls"] = tool_calls
            out.append(entry)
            continue

        if isinstance(content, list):
            for b in content:
                if isinstance(b, dict) and b.get("type") == "tool_result":
                    tid = str(b.get("tool_use_id") or "")
                    if tid in pending:
                        pending.remove(tid)
                    if tid:
                        out.append({"role": "tool", "tool_call_id": tid, "content": _result_text(b)})
            flush()
            text = _text_of(content)
            images = [b for b in content if isinstance(b, dict) and b.get("type") == "image"]
            if images:
                # Vision turn: text part + one image_url part per image (base64 data URL).
                parts: list[dict] = [{"type": "text", "text": text or "Please look at the attached image(s)."}]
                for b in images:
                    src = b.get("source") or {}
                    if src.get("type") == "base64" and src.get("data"):
                        parts.append({"type": "image_url", "image_url": {"url": f"data:{src.get('media_type', 'image/png')};base64,{src['data']}", "detail": "auto"}})
                    elif src.get("type") == "url" and src.get("url"):
                        parts.append({"type": "image_url", "image_url": {"url": src["url"]}})
                out.append({"role": "user", "content": parts})
            elif text:
                out.append({"role": "user", "content": text})
        else:
            flush()
            text = _text_of(content)
            if text:
                out.append({"role": "user", "content": text})
    flush()
    return out


def _to_openai_tools(tools: list[AIToolDefinition]) -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": t.name,
                "description": (t.description or "")[:1024],
                "parameters": t.input_schema or {"type": "object", "properties": {}},
            },
        }
        for t in tools
    ]


def _parse_args(raw: Any) -> dict:
    if isinstance(raw, dict):
        return raw
    try:
        parsed = json.loads(raw or "{}")
    except (json.JSONDecodeError, TypeError):
        return {"_raw_arguments": raw}
    return parsed if isinstance(parsed, dict) else {"value": parsed}


def _wants_web_search(server_tools: Optional[list[dict]]) -> bool:
    return any(t.get("name") == "web_search" for t in (server_tools or []))


def _to_responses_input(system: Optional[str], messages: list[AIMessage]) -> list[dict]:
    """Neutral blocks → Responses API `input` items. Mirrors `_to_openai_messages` above,
    but function-call round trips are separate `function_call`/`function_call_output` items
    here rather than an assistant `tool_calls` array plus `role: tool` messages — that's the
    Responses API's own history shape (verified live: replaying `function_call` +
    `function_call_output` items, and a plain-string assistant message, both work)."""
    out: list[dict] = []
    if system:
        out.append({"role": "system", "content": system})
    pending: list[str] = []

    def flush() -> None:
        for cid in pending:
            out.append({"type": "function_call_output", "call_id": cid, "output": "(no result returned)"})
        pending.clear()

    for msg in messages:
        content = msg.content
        if msg.role == "assistant":
            flush()
            text = _text_of(content)
            calls_in_msg = []
            if isinstance(content, list):
                for b in content:
                    if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("id"):
                        calls_in_msg.append(b)
            if not text and not calls_in_msg:
                continue
            if text:
                out.append({"role": "assistant", "content": text})
            for b in calls_in_msg:
                cid = str(b["id"])
                out.append(
                    {
                        "type": "function_call",
                        "call_id": cid,
                        "name": str(b.get("name") or ""),
                        "arguments": json.dumps(b.get("input") or {}, ensure_ascii=False),
                    }
                )
                pending.append(cid)
            continue

        if isinstance(content, list):
            for b in content:
                if isinstance(b, dict) and b.get("type") == "tool_result":
                    cid = str(b.get("tool_use_id") or "")
                    if cid in pending:
                        pending.remove(cid)
                    if cid:
                        out.append({"type": "function_call_output", "call_id": cid, "output": _result_text(b)})
            flush()
            text = _text_of(content)
            images = [b for b in content if isinstance(b, dict) and b.get("type") == "image"]
            if images:
                parts: list[dict] = [{"type": "input_text", "text": text or "Please look at the attached image(s)."}]
                for b in images:
                    src = b.get("source") or {}
                    if src.get("type") == "base64" and src.get("data"):
                        parts.append(
                            {"type": "input_image", "image_url": f"data:{src.get('media_type', 'image/png')};base64,{src['data']}"}
                        )
                    elif src.get("type") == "url" and src.get("url"):
                        parts.append({"type": "input_image", "image_url": src["url"]})
                out.append({"role": "user", "content": parts})
            elif text:
                out.append({"role": "user", "content": text})
        else:
            flush()
            text = _text_of(content)
            if text:
                out.append({"role": "user", "content": text})
    flush()
    return out


def _to_responses_tools(tools: list[AIToolDefinition]) -> list[dict]:
    # Flat shape (no nested "function" key) — distinct from Chat Completions' _to_openai_tools.
    return [
        {
            "type": "function",
            "name": t.name,
            "description": (t.description or "")[:1024],
            "parameters": t.input_schema or {"type": "object", "properties": {}},
        }
        for t in tools
    ]


def _responses_result(data: dict, model: str) -> AIResponse:
    output = data.get("output") or []
    blocks: list[dict] = []
    tool_calls: list[AIToolCall] = []
    server_tool_calls: list[dict] = []
    text_parts: list[str] = []
    for item in output:
        itype = item.get("type")
        if itype == "message":
            msg_text = "\n".join(
                part.get("text", "")
                for part in (item.get("content") or [])
                if part.get("type") == "output_text" and part.get("text")
            )
            if msg_text:
                text_parts.append(msg_text)
                blocks.append({"type": "text", "text": msg_text})
        elif itype == "function_call":
            call = AIToolCall(
                id=str(item.get("call_id") or item.get("id") or ""),
                name=str(item.get("name") or ""),
                input=_parse_args(item.get("arguments")),
            )
            tool_calls.append(call)
            blocks.append({"type": "tool_use", "id": call.id, "name": call.name, "input": call.input})
        elif itype == "web_search_call":
            action = item.get("action") or {}
            server_tool_calls.append(
                {
                    "query": action.get("query"),
                    "error": None if item.get("status") == "completed" else item.get("status"),
                }
            )
    text = "\n".join(text_parts)
    status = data.get("status") or "completed"
    stop = "tool_use" if tool_calls else ("max_tokens" if status == "incomplete" else "end_turn")
    usage = data.get("usage") or {}
    cached = int(((usage.get("input_tokens_details") or {}).get("cached_tokens")) or 0)
    return AIResponse(
        text=text,
        stop_reason=stop,
        tool_calls=tool_calls,
        server_tool_calls=server_tool_calls,
        provider_id="openai",
        model_id=data.get("model") or model,
        input_tokens=int(usage.get("input_tokens") or 0),
        output_tokens=int(usage.get("output_tokens") or 0),
        cache_read_input_tokens=cached,
        raw=SimpleNamespace(content=blocks, data=data),
    )


class OpenAIProvider(AIProvider):
    provider_id = "openai"
    supports_tools = True
    supports_streaming = True

    def __init__(
        self,
        api_key: Optional[str] = None,
        default_model: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        settings = get_settings()
        self._api_key = (api_key or settings.openai_api_key or "").strip()
        self._default_model = (default_model or settings.openai_model or DEFAULT_MODEL).strip()
        self._base = (base_url or settings.openai_base_url or DEFAULT_BASE_URL).strip().rstrip("/")

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key)

    @property
    def default_model(self) -> str:
        return self._default_model

    def _model(self, model: Optional[str]) -> str:
        wanted = (model or "").strip()
        # Only honour ids that look like ours; a Claude id from ai_default_model must not leak in.
        if wanted and (wanted.startswith("gpt-") or wanted[:2] in ("o1", "o3", "o4")):
            return wanted
        return self._default_model

    def _headers(self) -> dict[str, str]:
        if not self._api_key:
            raise ProviderError(NOT_CONFIGURED)
        return {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}

    @staticmethod
    def _error_from(res: httpx.Response) -> ProviderError:
        detail = res.text[:300]
        try:
            detail = res.json().get("error", {}).get("message", detail)
        except Exception:  # noqa: BLE001 — any body shape; raw text is the fallback
            pass
        if res.status_code == 401:
            return ProviderError("The Aladin API key was rejected. Check it in AI → Settings.")
        if res.status_code == 429:
            return ProviderError("Aladin is busy or the AI quota is exhausted — please try again shortly.")
        return ProviderError(f"Aladin request failed: {_brand(str(detail))}")

    def _payload(
        self,
        messages: list[AIMessage],
        *,
        system: Optional[str],
        model: Optional[str],
        max_tokens: int,
        tools: Optional[list[AIToolDefinition]] = None,
    ) -> dict:
        payload: dict[str, Any] = {
            "model": self._model(model),
            "messages": _to_openai_messages(system, messages),
            "max_completion_tokens": max(64, min(int(max_tokens), 16384)),
        }
        if tools:
            payload["tools"] = _to_openai_tools(tools)
            payload["tool_choice"] = "auto"
        return payload

    def _post(self, payload: dict, *, timeout: float = 120.0) -> dict:
        try:
            with httpx.Client(transport=httpx.HTTPTransport(retries=3), timeout=timeout) as client:
                res = client.post(f"{self._base}/chat/completions", headers=self._headers(), json=payload)
        except httpx.HTTPError as exc:
            raise ProviderError(f"Aladin is unreachable right now ({exc.__class__.__name__}).") from exc
        if res.status_code >= 400:
            raise self._error_from(res)
        return res.json()

    # ------------------------------------------------------- responses (web search)

    def _responses_payload(
        self,
        messages: list[AIMessage],
        *,
        system: Optional[str],
        model: Optional[str],
        max_tokens: int,
        tools: Optional[list[AIToolDefinition]] = None,
    ) -> dict:
        payload: dict[str, Any] = {
            "model": self._model(model),
            "input": _to_responses_input(system, messages),
            "max_output_tokens": max(64, min(int(max_tokens), 16384)),
        }
        responses_tools: list[dict] = [{"type": "web_search_preview"}]
        if tools:
            responses_tools.extend(_to_responses_tools(tools))
        payload["tools"] = responses_tools
        payload["tool_choice"] = "auto"
        return payload

    def _post_responses(self, payload: dict, *, timeout: float = 120.0) -> dict:
        try:
            with httpx.Client(transport=httpx.HTTPTransport(retries=3), timeout=timeout) as client:
                res = client.post(f"{self._base}/responses", headers=self._headers(), json=payload)
        except httpx.HTTPError as exc:
            raise ProviderError(f"Aladin is unreachable right now ({exc.__class__.__name__}).") from exc
        if res.status_code >= 400:
            raise self._error_from(res)
        return res.json()

    def _responses_stream(
        self,
        messages: list[AIMessage],
        tools: list[AIToolDefinition],
        *,
        system: Optional[str],
        model: Optional[str],
        max_tokens: int,
    ) -> Iterator[tuple[str, Any]]:
        """Only reached when web search is on (§16: opt-in per call) — the default Chat
        Completions path above is untouched for every other turn. Verified live: text still
        streams token-by-token via `response.output_text.delta`; the search itself and any
        function calls only show up in the `response.completed` event's full payload, same as
        Chat Completions only exposes finished tool calls, never partial ones, to this stream."""
        payload = self._responses_payload(messages, system=system, model=model, max_tokens=max_tokens, tools=tools)
        payload["stream"] = True
        model_id = payload["model"]
        final_data: Optional[dict] = None
        try:
            with httpx.Client(transport=httpx.HTTPTransport(retries=3), timeout=httpx.Timeout(120.0, connect=15.0)) as client:
                with client.stream("POST", f"{self._base}/responses", headers=self._headers(), json=payload) as res:
                    if res.status_code >= 400:
                        res.read()
                        raise self._error_from(res)
                    for line in res.iter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        raw = line[5:].strip()
                        if not raw:
                            continue
                        try:
                            chunk = json.loads(raw)
                        except json.JSONDecodeError:
                            continue
                        ctype = chunk.get("type")
                        if ctype == "response.output_text.delta":
                            delta = chunk.get("delta") or ""
                            if delta:
                                yield ("delta", delta)
                        elif ctype in ("response.completed", "response.failed", "response.incomplete"):
                            final_data = chunk.get("response") or {}
        except httpx.HTTPError as exc:
            raise ProviderError(f"Aladin is unreachable right now ({exc.__class__.__name__}).") from exc

        if final_data is None:
            raise ProviderError("Aladin web search stream ended without a final response.")
        if final_data.get("status") == "failed":
            detail = (final_data.get("error") or {}).get("message") or "web search request failed"
            raise ProviderError(_brand(str(detail)))
        yield ("final", _responses_result(final_data, model_id))

    @staticmethod
    def _response(data: dict, model: str) -> AIResponse:
        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        text = message.get("content") or ""
        blocks: list[dict] = []
        calls: list[AIToolCall] = []
        if text:
            blocks.append({"type": "text", "text": text})
        for tc in message.get("tool_calls") or []:
            fn = tc.get("function") or {}
            call = AIToolCall(id=str(tc.get("id") or ""), name=str(fn.get("name") or ""), input=_parse_args(fn.get("arguments")))
            calls.append(call)
            blocks.append({"type": "tool_use", "id": call.id, "name": call.name, "input": call.input})
        finish = choice.get("finish_reason") or "stop"
        stop = "tool_use" if calls else ("max_tokens" if finish == "length" else "end_turn")
        usage = data.get("usage") or {}
        cached = int(((usage.get("prompt_tokens_details") or {}).get("cached_tokens")) or 0)
        return AIResponse(
            text=text,
            stop_reason=stop,
            tool_calls=calls,
            provider_id="openai",
            model_id=data.get("model") or model,
            input_tokens=int(usage.get("prompt_tokens") or 0),
            output_tokens=int(usage.get("completion_tokens") or 0),
            cache_read_input_tokens=cached,
            raw=SimpleNamespace(content=blocks, data=data),
        )

    # ----------------------------------------------------------------- generate

    def generate(
        self,
        messages: list[AIMessage],
        *,
        system: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 4096,
    ) -> AIResponse:
        payload = self._payload(messages, system=system, model=model, max_tokens=max_tokens)
        return self._response(self._post(payload), payload["model"])

    def stream(
        self,
        messages: list[AIMessage],
        *,
        system: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 4096,
    ) -> Iterator[str]:
        for kind, payload in self.tool_call_stream(messages, [], system=system, model=model, max_tokens=max_tokens):
            if kind == "delta":
                yield payload

    # ---------------------------------------------------------------- tool_call

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
        if _wants_web_search(server_tools):
            # Chat Completions has no built-in web search — only the Responses API does
            # (verified live against the real endpoint: `web_search_preview` tool actually
            # searches and returns current, cited results). Opt-in only (§16): every other
            # turn still goes through the Chat Completions path below, unchanged.
            payload = self._responses_payload(messages, system=system, model=model, max_tokens=max_tokens, tools=tools)
            return _responses_result(self._post_responses(payload), payload["model"])
        payload = self._payload(messages, system=system, model=model, max_tokens=max_tokens, tools=tools)
        return self._response(self._post(payload), payload["model"])

    def tool_call_stream(
        self,
        messages: list[AIMessage],
        tools: list[AIToolDefinition],
        *,
        system: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 4096,
        server_tools: Optional[list[dict]] = None,
    ) -> Iterator[tuple[str, Any]]:
        """Chat Completions SSE: text arrives as `delta.content`, tool calls as `delta.tool_calls`
        fragments keyed by index (id/name on the first fragment, arguments appended after),
        usage on the last chunk when `stream_options.include_usage` is set."""
        if _wants_web_search(server_tools):
            yield from self._responses_stream(messages, tools, system=system, model=model, max_tokens=max_tokens)
            return
        payload = self._payload(messages, system=system, model=model, max_tokens=max_tokens, tools=tools)
        payload["stream"] = True
        payload["stream_options"] = {"include_usage": True}

        text_parts: list[str] = []
        calls: dict[int, dict[str, Any]] = {}
        finish_reason = "stop"
        usage: dict = {}
        model_id = payload["model"]
        try:
            with httpx.Client(transport=httpx.HTTPTransport(retries=3), timeout=httpx.Timeout(120.0, connect=15.0)) as client:
                with client.stream("POST", f"{self._base}/chat/completions", headers=self._headers(), json=payload) as res:
                    if res.status_code >= 400:
                        res.read()
                        raise self._error_from(res)
                    for line in res.iter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        raw = line[5:].strip()
                        if raw == "[DONE]":
                            break
                        try:
                            chunk = json.loads(raw)
                        except json.JSONDecodeError:
                            continue
                        if chunk.get("usage"):
                            usage = chunk["usage"]
                        if chunk.get("model"):
                            model_id = chunk["model"]
                        for choice in chunk.get("choices") or []:
                            delta = choice.get("delta") or {}
                            piece = delta.get("content")
                            if piece:
                                text_parts.append(piece)
                                yield ("delta", piece)
                            for tc in delta.get("tool_calls") or []:
                                idx = int(tc.get("index") or 0)
                                slot = calls.setdefault(idx, {"id": "", "name": "", "arguments": ""})
                                if tc.get("id"):
                                    slot["id"] = str(tc["id"])
                                fn = tc.get("function") or {}
                                if fn.get("name"):
                                    slot["name"] = str(fn["name"])
                                if fn.get("arguments"):
                                    slot["arguments"] += str(fn["arguments"])
                            if choice.get("finish_reason"):
                                finish_reason = choice["finish_reason"]
        except httpx.HTTPError as exc:
            raise ProviderError(f"Aladin is unreachable right now ({exc.__class__.__name__}).") from exc

        text = "".join(text_parts)
        blocks: list[dict] = []
        tool_calls: list[AIToolCall] = []
        if text:
            blocks.append({"type": "text", "text": text})
        for idx in sorted(calls):
            slot = calls[idx]
            if not slot["id"] or not slot["name"]:
                continue
            call = AIToolCall(id=slot["id"], name=slot["name"], input=_parse_args(slot["arguments"]))
            tool_calls.append(call)
            blocks.append({"type": "tool_use", "id": call.id, "name": call.name, "input": call.input})
        stop = "tool_use" if tool_calls else ("max_tokens" if finish_reason == "length" else "end_turn")
        cached = int(((usage.get("prompt_tokens_details") or {}).get("cached_tokens")) or 0)
        yield (
            "final",
            AIResponse(
                text=text,
                stop_reason=stop,
                tool_calls=tool_calls,
                provider_id="openai",
                model_id=model_id,
                input_tokens=int(usage.get("prompt_tokens") or 0),
                output_tokens=int(usage.get("completion_tokens") or 0),
                cache_read_input_tokens=cached,
                raw=SimpleNamespace(content=blocks, data=usage),
            ),
        )

    # ------------------------------------------------------------- structured

    def structured_output(
        self,
        messages: list[AIMessage],
        json_schema: dict[str, Any],
        *,
        system: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 4096,
    ) -> dict[str, Any]:
        payload = self._payload(messages, system=system, model=model, max_tokens=max_tokens)
        payload["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": "result", "schema": json_schema},
        }
        data = self._post(payload)
        text = (((data.get("choices") or [{}])[0]).get("message") or {}).get("content") or ""
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            raise ProviderError("Aladin returned invalid JSON for the requested schema.") from exc

    # ----------------------------------------------------------- health_check

    def health_check(self) -> ProviderHealth:
        if not self._api_key:
            return ProviderHealth(healthy=False, provider_id=self.provider_id, detail="No API key configured")
        try:
            with httpx.Client(transport=httpx.HTTPTransport(retries=3), timeout=8.0) as client:
                res = client.get(f"{self._base}/models/{self._default_model}", headers=self._headers())
            if res.status_code == 401:
                return ProviderHealth(healthy=False, provider_id=self.provider_id, detail="Invalid API key")
            if res.status_code >= 400:
                return ProviderHealth(healthy=False, provider_id=self.provider_id, detail=f"HTTP {res.status_code}")
            return ProviderHealth(healthy=True, provider_id=self.provider_id, detail=self._default_model)
        except httpx.HTTPError as exc:
            return ProviderHealth(healthy=False, provider_id=self.provider_id, detail=str(exc))
