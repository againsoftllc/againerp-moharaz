"""Token bench: what a REAL chat turn costs (docs/AI/ai.md, step 5.2).

The evaluation runner measures one model call. Real cost is per TURN: several model calls (plan -> tool -> answer), the growing conversation
history, big tool results. This sends a fixed script of messages through the real HTTP endpoint (/api/v1/ai/chat) with a throw-away
session and prints, per message, the input tokens, how many of them came from OpenAI's prompt cache, output tokens and the number of tool
calls. Nothing is changed in the ERP (read questions only). Run it before and after any change meant to save tokens.

    python -m scripts.run_token_bench              # the default script
    python -m scripts.run_token_bench --long       # + a 10-message conversation to see the history growing
"""
from __future__ import annotations

import argparse
import secrets
from datetime import datetime, timedelta

import httpx
import scripts.init_db  # noqa: F401

from app.database import SessionLocal
from app.models.auth_session import AuthSession
from app.models.auth_user import AuthUser

SINGLE = [
    "ei mas koto bikri holo?",
    "Vivobook 15 er stock koto?",
    "ke ke amader taka dei nai?",
    "top 10 customer by spend",
    "supplier der koto dena ache?",
    "koto jon customer ache?",
    "SO-00001 er details dekhao",
    "kon product er stock kom?",
]
LONG = [
    "ei mas koto bikri holo?",
    "ar last month e?",
    "top selling product koyta?",
    "Vivobook 15 er stock koto?",
    "ke ke amader taka dei nai?",
    "supplier der koto dena ache?",
    "koto jon customer ache?",
    "kon product er stock kom?",
    "ei year er total bikri?",
    "ar gato year e?",
]


def ask(client: httpx.Client, token: str, message: str, conversation_id: str | None) -> dict:
    body = {"message": message, "reply_language": "banglish"}
    if conversation_id:
        body["conversation_id"] = conversation_id
    r = client.post("http://127.0.0.1:8010/api/v1/ai/chat", headers={"Authorization": f"Bearer {token}"}, json=body, timeout=180)
    r.raise_for_status()
    return r.json()


def row(label: str, j: dict) -> tuple[int, int, int, int]:
    inp, out = int(j.get("input_tokens") or 0), int(j.get("output_tokens") or 0)
    cached = int(j.get("cache_read_input_tokens") or 0)
    calls = len(j.get("tool_calls") or [])
    print(f"{label[:44]:44} input {inp:7,} (cached {cached:7,}) output {out:5} tool calls {calls}")
    return inp, cached, out, calls


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--long", action="store_true", help="also run a 10-message conversation in ONE chat (history grows)")
    args = ap.parse_args()
    db = SessionLocal()
    user = db.query(AuthUser).filter(AuthUser.role == "admin").first()
    token = "bench-" + secrets.token_hex(16)
    db.add(AuthSession(user_id=user.id, token=token, expires_at=datetime.utcnow() + timedelta(minutes=40)))
    db.commit()
    try:
        with httpx.Client() as client:
            tot = [0, 0, 0, 0]
            print("== single questions (a fresh chat each) ==")
            for m in SINGLE:
                v = row(m, ask(client, token, m, None))
                tot = [a + b for a, b in zip(tot, v)]
            n = len(SINGLE)
            print(f"{'AVERAGE per question':44} input {tot[0] // n:7,} (cached {tot[1] // n:7,}) output {tot[2] // n:5}\n")
            if args.long:
                print("== one conversation, 10 messages ==")
                cid, series = None, []
                for i, m in enumerate(LONG, 1):
                    j = ask(client, token, m, cid)
                    cid = j.get("conversation_id") or cid
                    series.append(row(f"{i:2}. {m}", j)[0])
                print(f"first message {series[0]:,} -> last message {series[-1]:,} input tokens; the whole conversation {sum(series):,}")
    finally:
        db.query(AuthSession).filter(AuthSession.token == token).delete()
        db.commit()


if __name__ == "__main__":
    main()
