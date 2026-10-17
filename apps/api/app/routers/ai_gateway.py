"""AI Gateway — the HTTP surface of the AI OS (STEP 05/06/08/09/11/12).

`POST /api/v1/ai/chat` / `/chat/stream` — user text in, orchestrator result
out (blocking or SSE). Everything downstream (which tools are available,
what they're allowed to touch) is scoped to the calling user's own bearer
token, forwarded verbatim into every tool call — see
app/services/ai/tools/internal_api.py for why that's the authorization model
rather than re-checking permissions in this router. `conversation_id` is
optional; omit it to start a new conversation, pass a prior response's id
back to continue one (STEP 08).

`GET /tools` — the tool catalog. `GET /usage/me` / `/usage` — token/cost
summaries (STEP 12), self-scoped vs. company-wide.

Only the customer read tools (STEP 05's first slice) are registered here —
still not the finished gateway; write/approval-tier tools are future work.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps.auth import get_current_company_id, get_current_user, require_permission
from app.models.ai_approval import AiApproval
from app.models.ai_conversation import AiConversation, AiMessage
from app.models.auth_user import AuthUser
from app.schemas.ai_approval import (
    AiApprovalListMeta,
    AiApprovalListResponse,
    AiApprovalRead,
    AiApprovalResponse,
    AiApprovalUpdate,
)
from app.services.ai.attachments import AttachmentIn, build_user_content
from app.services.ai.audit_service import record_chat_turn, record_tool_call
from app.services.ai.conversation_service import append_turn, get_or_create_conversation, load_history
from app.services.ai.confirm_guard import apply_confirm_guard, apply_user_value_guard
from app.services.ai.entitlements import ai_access_allowed
from app.services.ai import billing_service
from app.services.ai import memory_service
from app.services.ai import preset_service
from app.services.ai.orchestrator import (
    Orchestrator,
    OrchestratorResult,
    OrchestratorStep,
    StreamDone,
    StreamTextDelta,
    StreamTextReset,
    StreamToolResult,
    StreamToolStart,
)
from app.services.ai.ai_key_service import (
    clear_openai_key,
    get_openai_connection,
    resolve_openai_key,
    set_openai_key,
)
from app.services.ai.providers.center_provider import CenterProvider
from app.services.ai.providers.claude_provider import ClaudeProvider
from app.services.ai.providers.openai_provider import OpenAIProvider
from app.services.ai.providers.base import ProviderError
from app.services.ai.tools.database_tools import data_map_text
from app.services.ai.tools.registry import build_tools, tool_catalog
from app.services.ai.usage_service import usage_summary

router = APIRouter(prefix="/ai", tags=["ai"])


def _require_package_allowance(db: Session, company_id: str) -> None:
    allowed, reason = billing_service.check_package_usage_allowed(db, company_id)
    db.commit()
    if allowed:
        return
    if reason == "unpaid_invoice":
        raise HTTPException(status_code=402, detail="You have an unpaid AI usage invoice. Pay it to continue.")
    raise HTTPException(
        status_code=402,
        detail="This period's included AI usage is used up. Upgrade your plan or enable on-demand usage to continue.",
    )

SYSTEM_PROMPT = (
    "Your name is Aladin, the AI assistant built into AgainERP. You are always Aladin: never "
    "mention or confirm any underlying model vendor or model name (OpenAI, GPT, ChatGPT, Claude, "
    "Anthropic and the like) — if asked which model or company powers you, answer that you are "
    "Aladin, part of AgainERP. If asked who built/made/developed you or AgainERP, answer that you "
    "were built by Againsoft (website againsoft.com) — the software company behind AgainERP — and "
    "share that info plainly; this is the one company name you should always give, never a model "
    "vendor. You can look up customers and their "
    "orders, stock levels and reorder suggestions, and the company's finance reports "
    "(overdue receivables and payables, financial summary, sales this period vs last, "
    "top suppliers) using the tools provided. For forward-looking questions use the forecast tools "
    "(forecast_sales, predict_stockouts, forecast_cash_flow, forecast_item_demand, forecast_collections, "
    "forecast_expenses_profit, forecast_pipeline, detect_dead_stock) — they compute projections from history; "
    "present them as estimates, name the method and caveats they return, and never extrapolate beyond "
    "what they give. You can also create and edit images (generate_product_image, edit_product_image) and put "
    "them on a product's gallery (attach_image_to_product) — generation/editing never touches a product by "
    "itself; only attach does, and only after the user says which product. Show every generated/edited image "
    "inline with ![short description](url) — copy the url string from the tool result byte for byte, even if "
    "it is a relative path like /uploads/media/...; never add a domain, never guess or shorten it. "
    "If the user attaches an image and asks you to change/edit it (e.g. 'make the background of this white'), "
    "use the media_id given right after that image in their message as source_media_id for edit_product_image — "
    "do not try to resolve a product from the filename. "
    "For anything else those tools do not cover — any module: "
    "sales, purchase, inventory, catalog, CRM, HR, finance, POS, RMA, service, website — use the "
    "ERP data map below, search_records to resolve names into ids, describe_table for tables not in "
    "the map, and run read-only SQL with query_database. Prefer the curated tools first, always filter "
    "company_id, aggregate in SQL, and state which table the figures came from. You only see modules "
    "the current user may read; if a tool says access is denied, say the user lacks that module's "
    "permission. Credentials, "
    "password hashes, API keys, tokens and other secrets are never accessible — if asked, say so "
    "plainly in one sentence. Actions: you can create drafts and move records with the action tools "
    "(create_sales_quotation, create_sales_order, create_purchase_order, create_crm_task, create_crm_lead, "
    "update_lead_status, schedule_lead_follow_up, update_deal_stage, create_expense) and commit with "
    "confirm_sales_order / confirm_purchase_order / approve_expense. Every action is two-step. Step 1: the "
    "moment the user asks to create or change something, CALL the matching tool WITHOUT confirm — this is "
    "mandatory, because you do not know customer/supplier/item ids, prices, costs, warehouses or approval "
    "limits; a preview you write yourself without calling the tool is wrong and forbidden. You can also import "
    "a product straight from another website's product page URL (import_product_from_url) — it creates a "
    "missing brand or category automatically on confirm, exactly like the other action tools; after it creates a product, ask the user (plain text, no tool call) whether to generate SEO (Focus Keyphrase, Meta title, Meta description). The moment they say yes, CALL add_product_seo WITHOUT confirm — this is mandatory, the same as every other action tool; never type out the Focus Keyphrase/Meta title/Meta description preview yourself, only the tool's own preview counts, and only call it again with confirm=true after the user confirms that exact tool preview (their earlier 'yes' to wanting SEO is not itself a confirm). To add or fill a product's specifications "
    "(\"specification add koro\", \"specs fill koro\") CALL add_product_specs WITHOUT confirm — it reads the "
    "product's source page and fills its specification profile, and if no profile exists it proposes one that "
    "needs the user's approval. To save a company rule for how the AI writes a field, use save_ai_preset. "
    "To change anything else on an existing product (name, price, descriptions, tags, warranty, categories, "
    "brand, publish/draft status) use update_product — put fields the user wants you to write or rewrite in "
    "its `rewrite` list (the tool writes them following the company rules), and only values the user typed in "
    "`changes`. "
    "Product tools (add_product_seo, add_product_specs, attach_image_to_product) take the product's name, SKU "
    "or id and find it themselves — when the user names a product that is already in the catalog, call the "
    "tool with that name right away; only ask for a URL when they want to import a new product. "
    "Do exactly what the user asked: pick the tool that matches their request (specifications → "
    "add_product_specs, SEO → add_product_seo, and so on) — never run a different action in its place, and "
    "never treat 'yes'/'confirm' as approval for anything other than the preview it answers. If no tool can do "
    "what they asked, say so plainly in one sentence and name the ERP screen where they can do it. Show the user "
    "the preview the tool returns (who, what, quantities, prices, total) and ask 'Confirm?'. Step 2: call "
    "again with confirm=true only after the user explicitly says yes in "
    "this conversation. Never chain create and confirm in one turn, never invent prices — if a price is "
    "missing ask for it, and if a tool answers 'pending_approval' tell the user it was routed for approval. "
    "After creating or changing something, write the document number as a link to the tool's 'doc_link' "
    "(e.g. [SO-2026-0274](doc://sales_order/abc) — it opens the record right here in the chat) and add "
    "'Open in <module>' as a link to the tool's 'path' (e.g. [Open in Sales](/sales?open=abc)). Use those "
    "two values exactly as returned — never invent a domain or URL. "
    "For anything else that changes data, point the user to the right ERP screen. "
    "Attached images and files are context the user gave you: read them directly (describe images, "
    "extract figures from sheets/PDFs, answer questions about them, and use their contents as input to "
    "tools such as creating an order from a list). Apart from that, only use information the tools return — "
    "never invent customer data, order numbers, or amounts. Amounts are in BDT unless a "
    "tool says otherwise; write amounts as 'BDT 1,234.00' with thousands separators — never a currency "
    "symbol (no ৳, ₳, $). Lead with the "
    "answer, then the supporting figures. If a tool returns an error, tell the user "
    "plainly; do not guess at what the data might have been."
)


def _system_prompt(
    db: Session, *, company_id: str, user: AuthUser, language: Optional[str] = None, message: str = ""
) -> str:
    """Base prompt + the ERP data map filtered to the modules this user may read (so the model
    can write correct queries first time) + remembered facts/preferences (STEP 30,
    app/services/ai/memory_service.py). Long-term memory across separate conversations;
    short-term (within one conversation) is the load_history() the call sites already do."""
    lang = (language or "auto").lower()
    if lang not in ("bn", "en", "banglish"):
        lang = _detect_language(message)
    parts = [SYSTEM_PROMPT, LANGUAGE_RULES[lang]]
    data_map = data_map_text(db, user)
    if data_map:
        parts.append(data_map)
    memories = memory_service.list_memories(db, company_id=company_id, user_id=user.id)
    if memories:
        notes = "\n".join(f"- {m}" for m in memories)
        parts.append(f"Things you've been asked to remember:\n{notes}")
    preset_rules = preset_service.chat_rules_block(db, company_id, _readable_preset_modules(db, user))
    if preset_rules:
        parts.append(preset_rules)
    return "\n\n".join(parts)


_SCOPE_TOOLS = {"product_fill": {"fill_product_from_source", "add_product_seo", "add_product_specs", "update_product"}}
_SCOPE_PROMPT = (
    "You are Aladin, the AI assistant of AgainERP, working on ONE catalog product in the product drawer. Do what the user "
    "asks with the tools given; never invent data. To fill a draft product from its source link CALL "
    "fill_product_from_source (product id given) WITHOUT confirm - it does the whole job; only when it returns "
    "status=preview (a new brand/category must be created) show what it says and ask the user to approve, then call it "
    "again with confirm=true after they say yes. For SEO use add_product_seo, for specifications add_product_specs, for "
    "any other change update_product - each WITHOUT confirm first, then confirm=true only after the user agrees to that "
    "preview. After a tool succeeds reply in 3-6 short lines (what was filled, anything that needs a look) and link the "
    "product with the tool's doc_link, e.g. [Open product](doc://product/ID) - use that value exactly. Amounts are BDT."
)


def _scoped_tools(tools: list, scope: Optional[str]) -> list:
    names = _SCOPE_TOOLS.get(scope or "")
    return [t for t in tools if t.definition.name in names] if names else tools


def _system_for(db: Session, *, company_id: str, user: AuthUser, payload: "ChatRequest") -> str:
    if payload.scope in _SCOPE_TOOLS:
        lang = (payload.reply_language or "auto").lower()
        if lang not in ("bn", "en", "banglish"):
            lang = _detect_language(payload.message)
        return f"{_SCOPE_PROMPT}\n\n{LANGUAGE_RULES[lang]}"
    return _system_prompt(db, company_id=company_id, user=user, language=payload.reply_language, message=payload.message)


def _readable_preset_modules(db: Session, user: AuthUser) -> set[str]:
    """Module presets only reach the prompt of users who may read that module."""
    from app.services.rbac import has_permission, is_system_manager

    modules = {t.module for t in preset_service.PRESET_TARGETS if t.module != "general"}
    try:
        if is_system_manager(db, user):
            return modules
        return {m for m in modules if has_permission(db, user, m, "read")}
    except Exception:  # noqa: BLE001 — fall back to no module presets rather than failing the chat
        return set()


_IMAGE_TOOL_NAMES = {"generate_product_image", "edit_product_image", "attach_image_to_product"}


def _collect_image_urls(tool_name: str, output: Any) -> list[str]:
    """URLs an image tool actually produced — the ones the model must quote verbatim."""
    if tool_name not in _IMAGE_TOOL_NAMES or not isinstance(output, dict):
        return []
    urls = []
    if isinstance(output.get("url"), str):
        urls.append(output["url"])
    for img in output.get("images") or []:
        if isinstance(img, dict) and isinstance(img.get("url"), str):
            urls.append(img["url"])
    return urls


def _fix_generated_image_urls(text: str, correct_urls: list[str]) -> str:
    """Small/cheap models sometimes 'complete' a relative path like /uploads/media/x.png into
    a plausible-looking but wrong absolute URL (e.g. https://uploads/media/x.png) when writing
    the markdown image. Rather than trust that, rewrite any ![...](...) or [...](...) whose
    href names the same file (by basename) back to the exact URL the tool returned."""
    if not correct_urls or not text:
        return text
    for url in correct_urls:
        base = url.rsplit("/", 1)[-1]
        if not base:
            continue
        pattern = re.compile(r"(!?\[[^\]]*\]\()([^)]*" + re.escape(base) + r"[^)]*)(\))")
        text = pattern.sub(lambda m: m.group(1) + url + m.group(3), text)
    return text


# Claude can end a turn with stop_reason "refusal" and no content at all (safety classifier).
# An empty assistant bubble reads like an outage, so substitute a plain one-liner instead.
EMPTY_REPLY_FALLBACK = (
    "I can't help with that request — it may involve restricted or sensitive data. "
    "Ask me about customers, orders, stock, purchases or finance instead."
)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: Optional[str] = None
    # Opt-in, per request — never a standing capability (master plan §16).
    enable_web_search: bool = False
    # "auto" (mirror the user's language), "bn" (বাংলা), "en" (English), "banglish" (romanised Bangla).
    reply_language: Optional[str] = Field(default=None, pattern="^(auto|bn|en|banglish)$")
    # Images (vision) and documents (PDF / Excel / CSV / text → extracted text), base64 inline.
    attachments: list[AttachmentIn] = Field(default_factory=list)
    # A narrow chat (the product drawer): only the few tools that job needs and a short prompt, instead of all ~47 tools
    # and the full ERP data map on every model call (~13k input tokens per call).
    scope: Optional[str] = Field(default=None, pattern="^product_fill$")


LANGUAGE_RULES = {
    "auto": (
        "Language: reply in the same language and script the user writes in. Bangla script → reply in "
        "Bangla; English → English; Banglish (Bangla written in Latin letters, e.g. 'ei mashe sales koto') → "
        "reply in Banglish the same way. Keep product names, SKUs, order numbers and amounts unchanged."
    ),
    "bn": (
        "Language: always reply in Bangla (বাংলা script), regardless of the language the user writes in. "
        "Use Latin digits (0-9) for all numbers and amounts, e.g. 'BDT 26,350.00', never Bangla numerals. "
        "Keep product names, SKUs and order numbers unchanged."
    ),
    "en": "Language: always reply in English, regardless of the language the user writes in.",
    "banglish": (
        "Language: always reply in Banglish — Bangla written with Latin letters, the way people type in chat "
        "(e.g. 'Ei mashe total sales BDT 56,675, gato mash theke 12% kom.'). Do not use Bangla script."
    ),
}


_BANGLISH_HINTS = {
    "ami", "amar", "amader", "amra", "apni", "apnar", "tumi", "koto", "kotha", "ki", "kon", "kobe", "kothay", "keno",
    "ache", "achhe", "nai", "nei", "hobe", "hoy", "hoyeche", "kore", "koro", "korbo", "korte", "kora", "dao", "daw",
    "deo", "dekhao", "dekhun", "bolo", "bolen", "janao", "theke", "diye", "jonno", "sathe", "modde", "moddhe",
    "ei", "oi", "ekhon", "aaj", "aj", "kal", "gato", "mash", "mashe", "bochor", "shoptaho", "soptaho", "din",
    "taka", "koto", "kichu", "sob", "onek", "beshi", "kom", "valo", "bhalo", "thik", "chai", "lagbe", "parbe",
    "pare", "gulo", "gula", "ta", "te", "er", "ke", "je", "jodi", "tahole", "naki", "ekta", "kono",
}


def _detect_language(message: str) -> str:
    """Which reply language 'auto' resolves to: Bangla script → bn; Latin text with enough
    Banglish function words → banglish; otherwise en. Deterministic on purpose — smaller
    models otherwise answer Banglish questions in Bangla script."""
    if re.search(r"[ঀ-৿]", message):
        return "bn"
    words = re.findall(r"[a-z]+", message.lower())
    if not words:
        return "en"
    hits = sum(1 for w in words if w in _BANGLISH_HINTS)
    return "banglish" if hits >= 2 or (hits >= 1 and len(words) <= 4) else "en"


class ChatStep(BaseModel):
    tool_name: str
    tool_input: dict[str, Any]
    output: Optional[Any] = None
    error: Optional[str] = None
    latency_ms: int
    risk_tier: Optional[str] = None
    module: str = ""


class ChatResponse(BaseModel):
    conversation_id: str
    text: str
    stop_reason: str
    truncated: bool
    steps: list[ChatStep]
    input_tokens: int
    output_tokens: int
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0


class ToolCatalogEntry(BaseModel):
    name: str
    description: str
    risk_tier: str
    module: str


class ToolCatalogResponse(BaseModel):
    data: list[ToolCatalogEntry]


def _chat_provider(db: Session, company_id: str):
    """The engine behind Aladin for this company, in order of preference:

    1. OpenAI with the workspace-stored key (AI → Settings) or OPENAI_API_KEY — native tools
       and streaming;
    2. AgainERP Center when it is bound (its OpenAI key; tools via the text protocol);
    3. Claude when an Anthropic key is present;
    4. otherwise the unconfigured OpenAI provider, whose error tells the admin exactly what to
       set — never a silent text-only fallback that ignores the tools.
    Entitlement checks (ai_access_allowed) are unaffected."""
    key, _source = resolve_openai_key(db, company_id)
    if key:
        return OpenAIProvider(api_key=key)
    center = CenterProvider()
    if center.is_configured:
        return center
    claude = ClaudeProvider()
    if getattr(claude, "_api_key", ""):
        return claude
    return OpenAIProvider()


def _bearer_token(authorization: Optional[str] = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    return authorization.removeprefix("Bearer ").strip()


@router.post("/chat", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    user: AuthUser = Depends(get_current_user),
    token: str = Depends(_bearer_token),
    db: Session = Depends(get_db),
) -> ChatResponse:
    allowed, status = ai_access_allowed()
    if not allowed:
        raise HTTPException(status_code=403, detail=f"AI access is not enabled for this workspace ({status})")
    _require_package_allowance(db, user.company_id)

    convo = get_or_create_conversation(
        db,
        company_id=user.company_id,
        user_id=user.id,
        conversation_id=payload.conversation_id,
        first_message=payload.message,
    )
    user_content, stored_text, _attachment_summaries = build_user_content(
        payload.message, payload.attachments, db=db, company_id=user.company_id, uploaded_by=user.name
    )
    history = load_history(db, convo.id)

    provider = _chat_provider(db, user.company_id)
    model_id = getattr(provider, "default_model", None) or get_settings().ai_default_model
    tools = _scoped_tools(build_tools(token, db=db, company_id=user.company_id, user=user), payload.scope)
    tools = apply_user_value_guard(
        tools, user_texts=[m.content for m in history if m.role == "user" and isinstance(m.content, str)][-10:] + [payload.message]
    )
    tools = apply_confirm_guard(db, tools, conversation_id=payload.conversation_id, user_message=payload.message)
    orchestrator = Orchestrator(
        provider,
        tools,
        system=_system_for(db, company_id=user.company_id, user=user, payload=payload),
        max_steps=6,
        enable_web_search=payload.enable_web_search,
    )
    try:
        result: OrchestratorResult = orchestrator.run(user_content, history=history)
    except ProviderError as exc:
        # A provider-level failure (bad key, outage, network error to Anthropic) is not the
        # user's fault and not a tool failure — surface it plainly instead of a raw 500.
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if not (result.text or "").strip():
        result.text = EMPTY_REPLY_FALLBACK
    image_urls = [u for step in result.steps for u in _collect_image_urls(step.tool_name, step.output)]
    result.text = _fix_generated_image_urls(result.text, image_urls)
    append_turn(db, convo.id, user_text=stored_text, assistant_text=result.text)
    for step in result.steps:
        record_tool_call(
            db,
            company_id=user.company_id,
            user_id=user.id,
            user_label=user.name,
            conversation_id=convo.id,
            provider_id=provider.provider_id,
            model_id=model_id,
            step=step,
        )
    record_chat_turn(
        db,
        company_id=user.company_id,
        user_id=user.id,
        user_label=user.name,
        conversation_id=convo.id,
        provider_id=provider.provider_id,
        model_id=model_id,
        user_message=payload.message,
        stop_reason=result.stop_reason,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cache_creation_input_tokens=result.cache_creation_input_tokens,
        cache_read_input_tokens=result.cache_read_input_tokens,
    )
    db.commit()

    return ChatResponse(
        conversation_id=convo.id,
        text=result.text,
        stop_reason=result.stop_reason,
        truncated=result.truncated,
        cache_creation_input_tokens=result.cache_creation_input_tokens,
        cache_read_input_tokens=result.cache_read_input_tokens,
        steps=[
            ChatStep(
                tool_name=s.tool_name,
                tool_input=s.tool_input,
                output=s.output,
                error=s.error,
                latency_ms=s.latency_ms,
                risk_tier=s.risk_tier.value if s.risk_tier else None,
                module=s.module,
            )
            for s in result.steps
        ],
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
    )


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/chat/stream")
def chat_stream(
    payload: ChatRequest,
    user: AuthUser = Depends(get_current_user),
    token: str = Depends(_bearer_token),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Server-Sent Events version of /chat (STEP 09). Event types: conversation (once, at
    the start), text_delta (assistant text as it's generated), tool_start / tool_result
    (visible progress on each tool call, per master plan §21 — never the model's internal
    reasoning, which is never requested from the provider in the first place), and done
    (final stats). The conversation is persisted the same way /chat does it, once the stream
    completes — see conversation_service.append_turn.
    """
    allowed, status = ai_access_allowed()
    if not allowed:
        raise HTTPException(status_code=403, detail=f"AI access is not enabled for this workspace ({status})")
    _require_package_allowance(db, user.company_id)

    convo = get_or_create_conversation(
        db,
        company_id=user.company_id,
        user_id=user.id,
        conversation_id=payload.conversation_id,
        first_message=payload.message,
    )
    user_content, stored_text, _attachment_summaries = build_user_content(
        payload.message, payload.attachments, db=db, company_id=user.company_id, uploaded_by=user.name
    )
    history = load_history(db, convo.id)
    provider = _chat_provider(db, user.company_id)
    model_id = getattr(provider, "default_model", None) or get_settings().ai_default_model
    tools = _scoped_tools(build_tools(token, db=db, company_id=user.company_id, user=user), payload.scope)
    tools = apply_user_value_guard(
        tools, user_texts=[m.content for m in history if m.role == "user" and isinstance(m.content, str)][-10:] + [payload.message]
    )
    tools = apply_confirm_guard(db, tools, conversation_id=payload.conversation_id, user_message=payload.message)
    orchestrator = Orchestrator(
        provider,
        tools,
        system=_system_for(db, company_id=user.company_id, user=user, payload=payload),
        max_steps=6,
        enable_web_search=payload.enable_web_search,
    )

    def event_stream():
        text_parts: list[str] = []
        pending_inputs: dict[str, dict[str, Any]] = {}
        yield _sse("conversation", {"conversation_id": convo.id})
        try:
            yield from _drive_stream(text_parts, pending_inputs)
        except ProviderError as exc:
            # Headers are already sent (200) by this point — an HTTP status change isn't
            # possible mid-stream, so a provider failure becomes an explicit SSE event
            # instead of a silently truncated response or a mid-stream 500.
            # Nothing from this turn is kept: a conversation created for this request was
            # only flushed, so it disappears with the rollback — tell the client so it does
            # not keep pointing at an id that no longer exists ("Conversation not found").
            db.rollback()
            yield _sse(
                "error",
                {"detail": str(exc), "conversation_discarded": payload.conversation_id is None},
            )

    def _drive_stream(text_parts: list[str], pending_inputs: dict[str, dict[str, Any]]):
        image_urls: list[str] = []
        for event in orchestrator.run_stream(user_content, history=history):
            if isinstance(event, StreamTextDelta):
                text_parts.append(event.text)
                yield _sse("text_delta", {"text": event.text})
            elif isinstance(event, StreamTextReset):
                # The model's self-written preview was withdrawn (orchestrator nudge) — clear it.
                text_parts.clear()
                yield _sse("text_correction", {"text": ""})
            elif isinstance(event, StreamToolStart):
                # StreamToolResult doesn't carry the input it was called with — remember it
                # here so the audit row below has the real arguments, not a blank dict.
                pending_inputs[event.tool_name] = event.tool_input
                yield _sse("tool_start", {"tool_name": event.tool_name, "tool_input": event.tool_input})
            elif isinstance(event, StreamToolResult):
                image_urls.extend(_collect_image_urls(event.tool_name, event.output))
                yield _sse(
                    "tool_result",
                    {
                        "tool_name": event.tool_name,
                        "output": event.output,
                        "error": event.error,
                        "latency_ms": event.latency_ms,
                        "risk_tier": event.risk_tier.value if event.risk_tier else None,
                        "module": event.module,
                    },
                )
                record_tool_call(
                    db,
                    company_id=user.company_id,
                    user_id=user.id,
                    user_label=user.name,
                    conversation_id=convo.id,
                    provider_id=provider.provider_id,
                    model_id=model_id,
                    step=OrchestratorStep(
                        tool_name=event.tool_name,
                        tool_input=pending_inputs.pop(event.tool_name, {}),
                        output=event.output,
                        error=event.error,
                        latency_ms=event.latency_ms,
                        risk_tier=event.risk_tier,
                        module=event.module,
                    ),
                )
            elif isinstance(event, StreamDone):
                if not "".join(text_parts).strip():
                    text_parts.append(EMPTY_REPLY_FALLBACK)
                    yield _sse("text_delta", {"text": EMPTY_REPLY_FALLBACK})
                final_text = "".join(text_parts)
                corrected_text = _fix_generated_image_urls(final_text, image_urls)
                if corrected_text != final_text:
                    # The streamed deltas already reached the client with the wrong URL(s) —
                    # this event tells it to replace the whole message with the corrected text.
                    final_text = corrected_text
                    yield _sse("text_correction", {"text": final_text})
                append_turn(db, convo.id, user_text=stored_text, assistant_text=final_text)
                record_chat_turn(
                    db,
                    company_id=user.company_id,
                    user_id=user.id,
                    user_label=user.name,
                    conversation_id=convo.id,
                    provider_id=provider.provider_id,
                    model_id=model_id,
                    user_message=payload.message,
                    stop_reason=event.stop_reason,
                    input_tokens=event.input_tokens,
                    output_tokens=event.output_tokens,
                    cache_creation_input_tokens=event.cache_creation_input_tokens,
                    cache_read_input_tokens=event.cache_read_input_tokens,
                )
                db.commit()
                yield _sse(
                    "done",
                    {
                        "stop_reason": event.stop_reason,
                        "truncated": event.truncated,
                        "input_tokens": event.input_tokens,
                        "output_tokens": event.output_tokens,
                        "cache_creation_input_tokens": event.cache_creation_input_tokens,
                        "cache_read_input_tokens": event.cache_read_input_tokens,
                    },
                )

    return StreamingResponse(event_stream(), media_type="text/event-stream")


class UsageSummaryResponse(BaseModel):
    chat_turns: int
    tool_calls: int
    tool_errors: int
    total_input_tokens: int
    total_output_tokens: int
    total_cache_creation_tokens: int = 0
    total_cache_read_tokens: int = 0
    estimated_cost_usd: float
    estimated_cost_is_partial: bool
    by_provider: dict[str, Any]
    by_model: dict[str, Any]
    by_tool: dict[str, Any]


class ConversationSummary(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int
    preview: str


class ConversationListResponse(BaseModel):
    data: list[ConversationSummary]


class ConversationMessage(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime


class ConversationDetailResponse(BaseModel):
    data: ConversationSummary
    messages: list[ConversationMessage]


class ConversationRename(BaseModel):
    title: str = Field(min_length=1, max_length=200)


def _own_conversation(db: Session, user: AuthUser, conversation_id: str) -> AiConversation:
    convo = db.get(AiConversation, conversation_id)
    if not convo or convo.company_id != user.company_id or convo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return convo


def _summary(db: Session, convo: AiConversation) -> ConversationSummary:
    count = db.query(func.count(AiMessage.id)).filter(AiMessage.conversation_id == convo.id).scalar() or 0
    last = (
        db.query(AiMessage.content)
        .filter(AiMessage.conversation_id == convo.id, AiMessage.role == "assistant")
        .order_by(desc(AiMessage.created_at))
        .first()
    )
    preview = (last[0] if last else "").strip().replace("\n", " ")
    return ConversationSummary(
        id=convo.id,
        title=convo.title or "New chat",
        created_at=convo.created_at,
        updated_at=convo.updated_at or convo.created_at,
        message_count=int(count),
        preview=preview[:140],
    )


@router.get("/conversations", response_model=ConversationListResponse)
def list_conversations(
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    q: Optional[str] = None,
    limit: int = 200,
) -> ConversationListResponse:
    """The signed-in user's chat history (newest activity first) for the AI module sidebar."""
    query = db.query(AiConversation).filter(AiConversation.company_id == user.company_id, AiConversation.user_id == user.id)
    if q:
        query = query.filter(AiConversation.title.ilike(f"%{q.strip()}%"))
    rows = query.order_by(desc(AiConversation.updated_at), desc(AiConversation.created_at)).limit(min(max(limit, 1), 500)).all()
    return ConversationListResponse(data=[_summary(db, c) for c in rows])


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailResponse)
def get_conversation(
    conversation_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationDetailResponse:
    convo = _own_conversation(db, user, conversation_id)
    rows = db.query(AiMessage).filter(AiMessage.conversation_id == convo.id).order_by(AiMessage.created_at, AiMessage.id).all()
    return ConversationDetailResponse(
        data=_summary(db, convo),
        messages=[ConversationMessage(id=m.id, role=m.role, content=m.content, created_at=m.created_at) for m in rows],
    )


@router.patch("/conversations/{conversation_id}", response_model=ConversationDetailResponse)
def rename_conversation(
    conversation_id: str,
    payload: ConversationRename,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationDetailResponse:
    convo = _own_conversation(db, user, conversation_id)
    convo.title = payload.title.strip()
    db.commit()
    db.refresh(convo)
    return get_conversation(conversation_id, user, db)


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    convo = _own_conversation(db, user, conversation_id)
    db.query(AiMessage).filter(AiMessage.conversation_id == convo.id).delete(synchronize_session=False)
    db.delete(convo)
    db.commit()


@router.get("/usage/me", response_model=UsageSummaryResponse)
def my_usage(
    days: int = 30,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UsageSummaryResponse:
    """Any authenticated user may see their own AI usage — no extra permission needed,
    the way seeing your own activity never requires elevated rights elsewhere in this app."""
    since = datetime.utcnow() - timedelta(days=max(1, min(days, 365)))
    return UsageSummaryResponse(
        **usage_summary(db, company_id=user.company_id, user_id=user.id, since=since)
    )


@router.get("/usage", response_model=UsageSummaryResponse)
def company_usage(
    days: int = 30,
    _: AuthUser = Depends(require_permission("workspace", "read")),
    company_id: str = Depends(get_current_company_id),
    db: Session = Depends(get_db),
) -> UsageSummaryResponse:
    """Company-wide AI usage across every user — this exposes other people's activity and
    estimated spend, so it sits behind workspace:read (same gate as approval limits and
    document numbering, both similarly org-wide-visibility settings) rather than being
    open to any authenticated user like /usage/me is."""
    since = datetime.utcnow() - timedelta(days=max(1, min(days, 365)))
    return UsageSummaryResponse(**usage_summary(db, company_id=company_id, since=since))


@router.get("/tools", response_model=ToolCatalogResponse)
def list_tools(user: AuthUser = Depends(get_current_user)) -> ToolCatalogResponse:
    """What the AI can currently do — for Workspace UI and STEP 15's approval routing.
    Metadata only; a tool listed here still enforces the caller's own permission at
    execution time via the forwarded bearer token (see internal_api.py)."""
    return ToolCatalogResponse(
        data=[
            ToolCatalogEntry(
                name=t.definition.name,
                description=t.definition.description,
                risk_tier=t.risk_tier.value,
                module=t.module,
            )
            for t in tool_catalog()
        ]
    )


@router.get("/approvals", response_model=AiApprovalListResponse)
def list_approvals(
    status_filter: Optional[str] = None,
    _: AuthUser = Depends(require_permission("workspace", "read")),
    company_id: str = Depends(get_current_company_id),
    db: Session = Depends(get_db),
) -> AiApprovalListResponse:
    """Pending/resolved AI actions awaiting a human decision (STEP 15) — company-wide,
    same workspace:read gate as /usage and approval_limits (§23) since this exposes
    every user's blocked AI actions, not just the caller's own."""
    query = db.query(AiApproval).filter(AiApproval.company_id == company_id)
    if status_filter:
        query = query.filter(AiApproval.status == status_filter)
    rows = query.order_by(AiApproval.requested_at.desc()).all()
    pending_count = sum(1 for r in rows if r.status == "pending")
    return AiApprovalListResponse(
        data=[AiApprovalRead.model_validate(r, from_attributes=True) for r in rows],
        meta=AiApprovalListMeta(count=len(rows), pending_count=pending_count),
    )


@router.post("/approvals/{approval_id}/resolve", response_model=AiApprovalResponse)
def resolve_approval(
    approval_id: str,
    payload: AiApprovalUpdate,
    user: AuthUser = Depends(require_permission("workspace", "write")),
    company_id: str = Depends(get_current_company_id),
    db: Session = Depends(get_db),
) -> AiApprovalResponse:
    """Record a human decision on a pending AI action. Status-transition only — does not
    re-execute the original tool call (see approval_gate.py's docstring for why)."""
    approval = (
        db.query(AiApproval)
        .filter(AiApproval.id == approval_id, AiApproval.company_id == company_id)
        .first()
    )
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")
    if approval.status != "pending":
        raise HTTPException(status_code=409, detail=f"Already {approval.status}")

    approval.status = payload.status
    approval.resolved_at = datetime.utcnow()
    approval.resolved_by = user.name
    db.commit()
    db.refresh(approval)
    return AiApprovalResponse(data=AiApprovalRead.model_validate(approval, from_attributes=True))


# ----------------------------------------------------------------------------- settings
# Aladin engine key — administrators (workspace:write) manage it from the AI screen so a
# tenant can switch Aladin on without a redeploy. The key itself never leaves the server:
# responses carry only a 4-character hint and where the key came from.


class AiSettingsResponse(BaseModel):
    configured: bool
    source: str = Field(default="", description="'workspace' (AI → Settings), 'env' (OPENAI_API_KEY) or ''")
    key_hint: str = ""
    model: str = ""
    provider_label: str = "Aladin"
    updated_at: Optional[datetime] = None


class AiKeyUpdate(BaseModel):
    api_key: str = Field(min_length=8, max_length=512)


def _settings_response(db: Session, company_id: str) -> AiSettingsResponse:
    key, source = resolve_openai_key(db, company_id)
    row = get_openai_connection(db, company_id)
    hint = row.api_key_hint if (row and source == "workspace") else (key[-4:] if key else "")
    return AiSettingsResponse(
        configured=bool(key),
        source=source,
        key_hint=hint,
        model=get_settings().openai_model,
        updated_at=row.updated_at if (row and source == "workspace") else None,
    )


@router.get("/settings", response_model=AiSettingsResponse)
def get_ai_settings(
    _: AuthUser = Depends(require_permission("workspace", "write")),
    company_id: str = Depends(get_current_company_id),
    db: Session = Depends(get_db),
) -> AiSettingsResponse:
    return _settings_response(db, company_id)


@router.put("/settings/key", response_model=AiSettingsResponse)
def set_ai_key(
    payload: AiKeyUpdate,
    _: AuthUser = Depends(require_permission("workspace", "write")),
    company_id: str = Depends(get_current_company_id),
    db: Session = Depends(get_db),
) -> AiSettingsResponse:
    """Verify the key against the engine before storing it — a bad key fails here with a clear
    422 instead of surfacing later as a broken chat."""
    health = OpenAIProvider(api_key=payload.api_key).health_check()
    if not health.healthy:
        raise HTTPException(status_code=422, detail=f"Aladin key check failed: {health.detail}")
    set_openai_key(db, company_id, payload.api_key)
    return _settings_response(db, company_id)


@router.delete("/settings/key", response_model=AiSettingsResponse)
def delete_ai_key(
    _: AuthUser = Depends(require_permission("workspace", "write")),
    company_id: str = Depends(get_current_company_id),
    db: Session = Depends(get_db),
) -> AiSettingsResponse:
    clear_openai_key(db, company_id)
    return _settings_response(db, company_id)


# ------------------------------------------------------------------------------- voice
# Server-side speech (transcribe / speak) lives in ai_voice.py and mounts here so it shares
# the /ai prefix without touching main.py.
from app.routers.ai_voice import router as _voice_router  # noqa: E402

router.include_router(_voice_router)

# Admin-authored AI presets (company rules per field/job) — ai_presets.py, same /ai prefix.
from app.routers.ai_presets import router as _presets_router  # noqa: E402

router.include_router(_presets_router)
