# AI OS Integration Audit — againerp-center → againerp-dev

**Date:** 2026-09-09 · **Branch:** `feature/ai-os-integration` · **Status:** audit complete, implementation not started

This document records what both repositories actually contain, before any code is
moved. Nothing here is assumed; every claim is traceable to a file named below.

---

## 1. AgainERP Center architecture

`againerp-center` is **not an ERP**. Its own README states it is the *Again Platform*
— twelve shared-services products, of which AgainERP is one **consumer among many**.

Two layers coexist:

| Layer | Path | Language | State |
|---|---|---|---|
| Platform design | `packages/ai-platform/runtime` | TypeScript | Hexagonal ports + domain types (~38 files): `execution-pipeline.port`, `execution-policy.port`, `session-manager.port`, `checkpoint-store.port`, `execution-tracer.port`, agent/session/policy/event domain types. **Ports and docs — no adapters.** |
| Running control plane | `apps/api` | Python / FastAPI | `routers/agent.py`, `ai_gateway.py`, `ai_commerce.py`, `ai.py`, `ai_registry.py`, `agents.py`, `services/conversation_service.py`, `services/openai_platform_service.py` |

**Governance constraints (BRAIN.md, ADR-000 "Platform Architecture v1.0 LOCKED"):**

- *Never place AI Core inside a consumer app.*
- *Never duplicate Platform packages.*
- *Never write AgainERP-specific logic in platform core.*
- Changing the twelve core products requires an ADR + executive approval.

These are binding on this integration and rule out bulk-copying `packages/ai-platform`
into `againerp-dev`.

### Center's live AI surface

```
POST /agent/v1/conversation      auth: Bearer <fleet api_key|gateway JWT> + X-Client-Id
```

- Tenant identity = `Client` (fleet client), gated by `ClientAiAccess`
- Provider: **OpenAI only** — `openai_platform_service.chat_completion`, default `gpt-4o-mini`,
  key held in Center's platform settings
- Returns `{ explanation, providerId, modelId, tokensUsed }` — **text only, no tool calling**
- Also `POST /ai/gateway/validate`, and an `ai_commerce` flow (URL → product) with
  preview → approve → resume → progress: an existing approval-gated job pattern

**No Anthropic/Claude anywhere in Center.** `requirements.txt` has no `anthropic`.

---

## 2. AgainERP Dev architecture

FastAPI (`apps/api`) + Next.js 16 admin (`apps/web`), Postgres, Docker.

- **Service layer is strong and already the right seam for tools**: `app/services/**`
  (sales, purchase, inventory, finance, crm, vendor, hrm) wraps business rules; routers
  are thin.
- **AuthZ**: `require_permission(module, action)` over 18 modules × read/create/write/delete
  (`app/services/rbac.py`), roles → `auth_role_permissions`, `get_current_company_id()`
  supplies tenant scope on every request.
- **Recent integrity work (commit `5b973f4`)**: `core_sequences` (row-locked document
  numbering), `finance_periods` (posting lock at the single journal choke point),
  `approval_limits` (amount ceilings per role × document).
- **Audit**: `auth_activity_log`, plus `collab_activity`.

---

## 3. Existing AI architecture in both projects

### Dev — scaffolding exists, unwired

| Asset | Path | State |
|---|---|---|
| AI tables | `app/models/ai_provider.py`, `ai_agent.py`, `ai_tool.py`, `ai_approval.py`, `ai_audit_log.py`, `ai_api_connection.py` | Models + Pydantic schemas + seed scripts exist. **No routers, no services reference them.** |
| AI OS UI mock | `apps/web/src/lib/mock-data/ai-os.ts` | KPIs, agents, tool catalog, approvals, audit logs. **No page imports it.** |
| Assistant drawer | `apps/web/src/components/ai-assistant-drawer.tsx` | Calls `POST /api/center/ai/conversation`. **Not mounted anywhere.** |
| Center client | `apps/web/src/lib/center/center-ai-conversation-server.ts`, `center-bind-server.ts` | Working. Bind from `.data/center-bind.json` or `AGAINERP_CENTER_URL` / `AGAINERP_CLIENT_ID` / `AGAINERP_CLIENT_API_KEY`. |
| Real LLM call | `app/services/catalog_ai/llm_extractor.py` | Anthropic **tool-use with forced tool choice** → structured `ProductDraft`. The only production LLM path in dev, and a good precedent. |
| SDK | `requirements.txt` → `anthropic>=0.40.0,<1.0`; `app/config.py` → `anthropic_api_key`, `ai_catalog_import_model` | Installed and configured. No `openai` package. |

**Conclusion:** dev has the *database shape* of an AI OS (providers, agents, tools,
approvals, audit) with nothing behind it, and a Claude SDK already proven on one flow.

### Center — control plane exists, no tools

Conversation is metered, tenant-gated and OpenAI-backed, but cannot call ERP tools and
has no Claude provider.

---

## 4. What should be reused

| From | Reuse as |
|---|---|
| Dev `ai_provider` / `ai_agent` / `ai_tool` / `ai_approval` / `ai_audit_log` tables | The AI OS persistence layer — wire them, do not redesign |
| Dev `app/services/**` | Tool implementations; tools call services, never SQL |
| Dev `require_permission` + `get_current_company_id` | Tool authorization and tenant scoping |
| Dev `approval_limits` + `assert_can_approve` | Money ceiling for AI-initiated approvals |
| Dev `llm_extractor.py` tool-use pattern | Template for the Claude provider's tool calling |
| Center `/agent/v1/conversation` + `center-bind-server.ts` | Keep as one provider behind the abstraction (metered platform path) |
| Center `packages/ai-platform/runtime` port names | **Interface vocabulary only** — read, do not copy |

## 5. What should NOT be copied

- `packages/ai-platform/**` — platform core; copying breaks Center's architecture lock and
  creates a second, drifting copy. It is also TypeScript, while dev's AI must run beside
  the Python services it drives.
- `modules/ai-commerce-agent/**` — dev already has `catalog_ai` doing the same job.
- Center `conversation_service.py` / `openai_platform_service.py` — provider keys belong to
  the platform; dev talks to it over HTTP.
- Center's `Client` / `ClientAiAccess` tenancy — dev has its own `company_id` model.

## 6. What needs to be merged

Only the **contract**: dev gains an AI gateway whose provider abstraction includes a
`center` provider speaking the existing `/agent/v1/conversation` contract, so today's
metered path keeps working while Claude runs locally for tool-calling work.

## 7. What stays independent

- Center keeps provider keys, entitlements, metering, fleet identity.
- Dev keeps ERP data, RBAC, tenant scope, business rules, and the tool layer.
- Neither reaches into the other's database.

## 8. API communication architecture

```
Browser → Next.js route (server-side, credentials never in browser)
        → Dev FastAPI  /api/v1/ai/*        ← new AI gateway
        → Orchestrator → Provider (claude | center)
                       → Tool Gateway → dev services → Postgres
```

Center is reached only from the dev server, with the existing fleet bind headers.

## 9. AI provider architecture

```
AIProvider (port)
├── generate()
├── stream()
├── tool_call()
├── structured_output()
└── health_check()
    ├── ClaudeProvider  — Anthropic SDK, key from dev config, supports tool calling
    └── CenterProvider  — POST {center}/agent/v1/conversation, text only
```

Selection resolves per request: explicit override → company `ai_provider` row → default.
`tool_call()` on a provider that cannot do tools raises a typed capability error rather
than silently degrading.

## 10. Tool architecture

Tools are declared, not improvised:

```
name, description, json schema, module, action, risk tier, handler
```

- `module`/`action` map onto existing RBAC, so a tool cannot exceed the caller's own rights.
- Risk tier: `READ | WRITE | APPROVE | DELETE | FINANCIAL | EXTERNAL | SENSITIVE`.
- Handlers call `app/services/**`. **No direct SQL from a tool.**
- Registry rows live in the existing `ai_tools` table.

## 11. Authentication architecture

The AI gateway uses the same `require_permission` dependencies as every other dev router.
There is no AI service account: the AI acts strictly as the calling user, and every tool
re-checks that user's permission. Center calls carry the fleet bind, which authenticates
the *installation*, not the end user.

## 12. Tenant architecture

`company_id` comes from the authenticated session (`get_current_company_id`) and is passed
into every tool call. Tools never accept a caller-supplied company id. Conversations,
approvals and audit rows are all company-stamped.

## 13. Database boundaries

| Store | Owner | AI access |
|---|---|---|
| Dev Postgres — business tables | Dev services | Through tools only |
| Dev Postgres — `ai_*` tables | AI gateway | Direct (it owns them) |
| Center Postgres | Center | None — HTTP only |

## 14. Security concerns

1. **Prompt injection through business data** — scraped/customer text can carry instructions.
   Tool results are returned as data, never merged into the system prompt.
2. **Confused deputy** — mitigated by executing as the calling user with per-tool permission checks.
3. **Silent spend** — high-risk tools require an `ai_approvals` row before executing.
4. **Secret leakage** — audit rows record tool name and arguments minus any field marked
   secret; provider keys never leave server config.
5. **Runaway loops** — orchestrator has a hard step ceiling and per-conversation token budget.

## 15. Proposed final architecture — **Option C (hybrid)**

Chosen because Center's governance forbids AI Core inside a consumer, while tool execution
must sit next to the services and RBAC it drives.

```
Center (control plane)          Dev (tenant runtime)
├── provider keys               ├── AI Gateway   /api/v1/ai/*
├── entitlements / AI access    ├── Orchestrator (plan → tool → observe → verify)
├── metering                    ├── Providers: Claude | Center
└── /agent/v1/conversation ◄────┤ Tool Gateway → services → Postgres
                                └── ai_* tables: agents, tools, approvals, audit
```

## 16. Migration plan

1. Provider abstraction + Claude provider + `health_check` (no behaviour change elsewhere).
2. Tool registry + first read-only tools over existing services.
3. Orchestrator loop with step ceiling.
4. AI gateway routers; wire `ai_audit_log`.
5. Approval gate on write/financial tools using `ai_approvals` + `approval_limits`.
6. Center provider adapter over the existing conversation client.
7. Replace `mock-data/ai-os.ts` with live data; mount the assistant drawer.

## 17. Risks

| Risk | Mitigation |
|---|---|
| Duplicating Center's AI core | Copy no platform package; integrate over HTTP |
| AI writing bad ERP data | Tools call services, so every business rule and validation still runs |
| Cross-tenant leakage | `company_id` from session only, asserted in every tool |
| Cost blowout | Step ceiling, token budget, provider metering retained in Center |
| Scaffolding drift | Wire the existing `ai_*` tables rather than adding parallel ones |

## 18. Recommended implementation sequence

Matches §16. Each step ships independently and leaves the ERP working if the next never lands.

---

## Appendix — evidence index

- Center governance: `BRAIN.md`, `docs/ADR/000-platform-architecture-locked.md`
- Center conversation: `apps/api/app/routers/agent.py:199`, `app/services/conversation_service.py`
- Dev → Center client: `apps/web/src/lib/center/center-ai-conversation-server.ts`
- Dev Claude precedent: `apps/api/app/services/catalog_ai/llm_extractor.py`
- Dev AI tables: `apps/api/app/models/ai_*.py`
- Dev RBAC: `apps/api/app/services/rbac.py`, `app/deps/auth.py`
