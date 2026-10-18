# AI evaluation set

`cases.jsonl` - one admin sentence per line, with what Aladin must do (docs/AI/ai.md, step 0.4). The runner (step 0.5) sends each
`say` (with its `context`) to the model with the real tool definitions, **executes nothing**, and compares the first tool call.

| Field | Meaning |
|-------|---------|
| `id`, `module` | e.g. `sales-07`, `sales` / `customers` / `inventory` / `catalog` / `finance` / `purchase` / `crm` / `hrm` / `context` / `safety` |
| `say` | what the admin types (Bangla, Banglish, English) |
| `context` | earlier turns (`role`, `content`, and `tool` = the tool the assistant used) - the follow-up is judged against them |
| `scope`, `product_id` | `product_fill` = the product drawer (restricted tool set + the drawer prompt) |
| `expect.tool` | the first tool call must be this one |
| `expect.any_of` | any one of these tools is acceptable |
| `expect.no_tool` | no tool call: the AI answers in words / asks a question / refuses |
| `expect.args` | these arguments must be present with exactly these values (nested objects are matched key by key) |
| `expect.args_contains` | the argument's text must contain this (case-insensitive) |
| `expect.not_args` | these argument names must NOT be set (e.g. `confirm` - a write is previewed first) |
| `expect.sql_contains` | for `query_database`: every fragment must appear in the SQL |
| `expect.forbid`, `forbid_args`, `forbid_sql_contains` | tools / argument values / SQL fragments that must never appear |
| `expect.note` | why - for the human reading a failure |

Add a case whenever an admin sentence goes wrong in real use (the audit log shows them). Keep ids unique.
