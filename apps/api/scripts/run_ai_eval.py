"""Evaluation runner for Aladin (docs/AI/ai.md, step 0.5).

Sends every admin sentence in tests/ai_eval/cases.jsonl (with its context) to the company's real model, with the real system
prompt and the real tool definitions - and executes NOTHING. It scores the model's first tool call (or "no tool") against what
the case expects, prints a pass-rate per module and writes tests/ai_eval/last_run.json.

Run it before and after every change to the prompt, the glossary, the tools or the model.

Usage (api container, from /app):
    python -m scripts.run_ai_eval                      # all cases
    python -m scripts.run_ai_eval --module sales       # one module
    python -m scripts.run_ai_eval --id ctx-04 --id cat-02 --verbose
    python -m scripts.run_ai_eval --workers 4
"""
from __future__ import annotations

import argparse
import json
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import scripts.init_db  # noqa: F401 - registers every model
from app.database import SessionLocal
from app.models.auth_user import AuthUser
from app.routers.ai_gateway import ChatRequest, _chat_provider, _scoped_tools, _system_for
from app.services.ai.intent_guard import block_reason
from app.services.ai.pending_action import render as render_pending
from app.services.ai import tool_router
from app.services.ai.providers.base import AIMessage
from app.services.ai.tools.finance_report_tools import _PERIOD_ALIASES
from app.services.ai.tools.registry import build_tools

CASES = Path(__file__).resolve().parents[1] / "tests" / "ai_eval" / "cases.jsonl"
REPORT = CASES.with_name("last_run.json")


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _match_args(actual, expected, path="") -> list[str]:
    """Every expected key must be in `actual` with this value (nested objects key by key; numbers numerically)."""
    out: list[str] = []
    for k, want in expected.items():
        have = (actual or {}).get(k)
        if k == "period" and have is not None:  # the tool maps known words (gotomas ...) to its value
            have = _PERIOD_ALIASES.get(str(have).strip().lower(), have)
        where = f"{path}{k}"
        if isinstance(want, dict):
            out += _match_args(have if isinstance(have, dict) else {}, want, where + ".")
        elif have is None:
            out.append(f"{where} missing")
        elif _num(want) is not None and not isinstance(want, bool):
            if _num(have) != _num(want):
                out.append(f"{where} = {have!r}, expected {want!r}")
        elif isinstance(want, bool):
            if bool(have) is not want:
                out.append(f"{where} = {have!r}, expected {want!r}")
        elif str(have).strip().lower() != str(want).strip().lower():
            out.append(f"{where} = {have!r}, expected {want!r}")
    return out


def _contains(value, fragment: str) -> bool:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    return fragment.lower() in text.lower()


def _has_pair(obj, key: str, value) -> bool:
    if isinstance(obj, dict):
        return any((k == key and str(v).lower() == str(value).lower()) or _has_pair(v, key, value) for k, v in obj.items())
    if isinstance(obj, list):
        return any(_has_pair(x, key, value) for x in obj)
    return False


def judge(case: dict, calls: list, text: str) -> list[str]:
    """Problems found (empty = pass)."""
    exp = case.get("expect") or {}
    probs: list[str] = []
    names = [c.name for c in calls]
    first = calls[0] if calls else None
    if exp.get("no_tool") and calls:
        probs.append(f"expected no tool call, got {names}")
    if exp.get("tool"):
        if not first:
            probs.append(f"expected {exp['tool']}, got no tool call")
        elif first.name != exp["tool"]:
            probs.append(f"expected {exp['tool']}, got {first.name}")
    if exp.get("any_of"):
        if not first or first.name not in exp["any_of"]:
            probs.append(f"expected one of {exp['any_of']}, got {names or 'no tool call'}")
    if first and exp.get("tool") == first.name or (first and exp.get("any_of") and first.name in exp["any_of"]):
        args = first.input or {}
        probs += _match_args(args, exp.get("args") or {})
        for k, frag in (exp.get("args_contains") or {}).items():
            if k not in args or not _contains(args[k], str(frag)):
                probs.append(f"{k} should contain {frag!r}, got {args.get(k)!r}")
        for k in exp.get("not_args") or []:
            if args.get(k) not in (None, False, "", [], {}):
                probs.append(f"{k} must not be set on the first call (preview first), got {args.get(k)!r}")
        if exp.get("sql_contains"):
            sql = str(args.get("sql") or "")
            for frag in exp["sql_contains"]:
                if frag.lower() not in sql.lower():
                    probs.append(f"SQL should mention {frag!r}")
    for c in calls:
        if c.name in (exp.get("forbid") or []):
            probs.append(f"forbidden tool {c.name} was called")
        for k, v in (exp.get("forbid_args") or {}).items():
            if _has_pair(c.input, k, v):
                probs.append(f"forbidden {k}={v} in {c.name}")
        for frag in exp.get("forbid_sql_contains") or []:
            if c.name == "query_database" and frag.lower() in str((c.input or {}).get("sql", "")).lower():
                probs.append(f"SQL must not touch {frag!r}")
    return probs


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default="cases.jsonl", help="cases.jsonl (tuned on) or holdout.jsonl (never tuned on - the honest score)")
    ap.add_argument("--module", action="append")
    ap.add_argument("--id", action="append")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--no-routing", action="store_true", help="send every tool and the whole prompt (how it was before step 5.2)")
    ap.add_argument("--repeat", type=int, default=1, help="run every case N times and report the mean pass-rate + the flaky cases (the model is not deterministic)")
    ap.add_argument("--ignore-pending", action="store_true", help="do not add the pending-action / recent-records block (to measure what it is worth)")
    args = ap.parse_args()

    cases_path = CASES.with_name(args.file)
    cases = [json.loads(line) for line in cases_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if args.module:
        cases = [c for c in cases if c["module"] in args.module]
    if args.id:
        cases = [c for c in cases if c["id"] in args.id]
    if args.limit:
        cases = cases[: args.limit]

    db = SessionLocal()
    user = db.query(AuthUser).filter(AuthUser.role == "admin").first() or db.query(AuthUser).first()
    company_id = user.company_id
    provider = _chat_provider(db, company_id)
    model = getattr(provider, "default_model", "?")
    print(f"{len(cases)} cases · model {model} · user {user.email if hasattr(user, 'email') else user.id}")

    all_tools = build_tools("eval", db=db, company_id=company_id, user=user)
    jobs = []
    for case in cases:
        scope = case.get("scope")
        payload = ChatRequest(message=case["say"], scope=scope)
        scoped = _scoped_tools(all_tools, scope)
        modules = None
        if not scope and not args.no_routing:
            # what production does: only the modules this message (and the last reply) is about
            ctx = case.get("context") or []
            prev = [m["tool"] for m in ctx[-1:] if m.get("role") == "assistant" and m.get("tool")] + [p["tool"] for p in case.get("pending") or []]
            modules = tool_router.detect_modules(case["say"], [m["content"] for m in ctx if m.get("role") == "user"], prev, scoped)
            scoped = tool_router.route_tools(scoped, modules, prev)
        system = _system_for(db, company_id=company_id, user=user, payload=payload, modules=modules, tool_names=({t.definition.name for t in scoped} if modules is not None else None))
        if case.get("product_id"):
            system += f"\n\nThe product open in this drawer: id {case['product_id']} (a draft imported from its source link)."
        if (case.get("pending") or case.get("records")) and not args.ignore_pending:
            # what production adds from the audit log: the previous turn's unanswered preview + the records it touched
            block = render_pending(
                [(p["tool"], p["args"], p.get("preview")) for p in case.get("pending") or []],
                [(r["id"], r["name"]) for r in case.get("records") or []],
            )
            system += chr(10) * 2 + block
        tools = [t.definition for t in scoped]
        msgs = [AIMessage(role=m["role"], content=m["content"]) for m in case.get("context") or []]
        msgs.append(AIMessage(role="user", content=case["say"]))
        jobs.append((case, system, tools, msgs, {t.definition.name: t for t in _scoped_tools(all_tools, scope)}))
    db.rollback()

    def run(job):
        case, system, tools, msgs, tmap = job
        t0 = time.time()
        blocked = ""
        tok = [0, 0, 0]  # input, output, calls
        try:
            resp = provider.tool_call(msgs, tools, system=system, max_tokens=1024)
            tok[0] += resp.input_tokens; tok[1] += resp.output_tokens; tok[2] += 1
            calls, text, err = list(resp.tool_calls), resp.text, ""
            # the intent guard refuses a write tool for a "show me" request: give the model that error once, as production does
            first = calls[0] if calls else None
            reason = block_reason(case["say"], tmap[first.name]) if first and first.name in tmap else None
            if reason:
                blocked = first.name
                again = list(msgs) + [
                    AIMessage(role="assistant", content=[{"type": "tool_use", "id": first.id, "name": first.name, "input": first.input}]),
                    AIMessage(role="user", content=[{"type": "tool_result", "tool_use_id": first.id, "content": json.dumps({"error": reason}), "is_error": True}]),
                ]
                resp = provider.tool_call(again, tools, system=system, max_tokens=1024)
                tok[0] += resp.input_tokens; tok[1] += resp.output_tokens; tok[2] += 1
                calls, text = list(resp.tool_calls), resp.text
        except Exception as exc:  # noqa: BLE001 - one failing call must not stop the run
            calls, text, err = [], "", f"{type(exc).__name__}: {exc}"
        return case, calls, text, err, time.time() - t0, blocked, tok

    jobs = [j for _ in range(max(1, args.repeat)) for j in jobs]
    results = []
    used = [0, 0, 0]  # input tokens, output tokens, model calls
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        for case, calls, text, err, secs, blocked, tok in pool.map(run, jobs):
            used[0] += tok[0]; used[1] += tok[1]; used[2] += tok[2]
            probs = [f"provider error: {err}"] if err else judge(case, calls, text)
            results.append({
                "id": case["id"], "module": case["module"], "say": case["say"], "pass": not probs, "problems": probs,
                "tools": [{"name": c.name, "input": c.input} for c in calls], "text": text[:300], "seconds": round(secs, 1),
                "guard_blocked": blocked,
            })
            mark = "PASS" if not probs else "FAIL"
            if (args.verbose or probs) and args.repeat <= 1:
                got = ", ".join(c.name for c in calls) or "(no tool)"
                if blocked:
                    got = f"[guard blocked {blocked}] -> {got}"
                print(f"[{mark}] {case['id']:9} {case['say'][:60]!r} -> {got}")
                for p in probs:
                    print(f"         - {p}")
            elif not args.verbose and args.repeat <= 1:
                print(f"[{mark}] {case['id']}")

    by = defaultdict(lambda: [0, 0])
    for r in results:
        by[r["module"]][1] += 1
        by[r["module"]][0] += int(r["pass"])
    total_ok = sum(v[0] for v in by.values())
    total = sum(v[1] for v in by.values())
    if args.repeat > 1:
        per_case: dict[str, list] = defaultdict(list)
        for r in results:
            per_case[r["id"]].append(r)
        flaky = {k: v for k, v in per_case.items() if 0 < sum(x["pass"] for x in v) < len(v)}
        broken = {k: v for k, v in per_case.items() if not any(x["pass"] for x in v)}
        print(f"{args.repeat} runs per case.")
        for k, v in broken.items():
            print(f"[ALWAYS FAILS] {k:10} {v[0]['say'][:55]!r}: {'; '.join(v[0]['problems'])[:120]}")
        for k, v in flaky.items():
            print(f"[FLAKY {sum(x['pass'] for x in v)}/{len(v)}] {k:10} {v[0]['say'][:55]!r}: {'; '.join(next(x for x in v if not x['pass'])['problems'])[:110]}")
    print("\nmodule        pass / total")
    for m, (ok, n) in sorted(by.items()):
        print(f"{m:13} {ok:3} / {n:<3} {100 * ok // n:3d}%")
    print(f"{'ALL':13} {total_ok:3} / {total:<3} {100 * total_ok // max(total, 1):3d}%")
    print(f"tokens used by this run: {used[0]:,} input + {used[1]:,} output in {used[2]} model calls (about {used[0] // max(used[2], 1):,} input tokens per call)")
    REPORT.with_name("last_run_" + args.file.replace(".jsonl", "") + ".json").write_text(json.dumps({"model": model, "pass": total_ok, "total": total, "results": results}, ensure_ascii=False, indent=1), encoding="utf-8")
    print("report written next to the cases file")
    db.close()


if __name__ == "__main__":
    main()
