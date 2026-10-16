"""Public AI search for the storefront (see app/services/ecommerce/storefront_ai_search.py)."""
from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.platform_setting import PlatformSetting
from app.services.ai.ai_key_service import resolve_openai_key
from app.services.ecommerce.storefront_ai_assistant import ai_assistant
from app.services.ecommerce.storefront_ai_search import ai_search
from app.services.site_resolver import resolve_site

router = APIRouter(prefix="/ai-search", tags=["storefront-ai-search"])

# each answer costs an OpenAI call: 20 questions a minute per shopper IP
RATE = 20
_hits: dict[str, deque] = defaultdict(deque)
_hits_lock = Lock()


class AiSearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=200)


class AssistantMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=2000)


class AssistantRequest(BaseModel):
    messages: list[AssistantMessage] = Field(min_length=1, max_length=20)


def _company(db: Session, request: Request) -> str:
    site = resolve_site(db, request)
    return (site.company_id if site else None) or "default"


def _ai_on(db: Session) -> bool:
    """The AI Search plugin is installed and switched on (Workspace → Plugins → AI Search)."""
    flags = dict(
        db.query(PlatformSetting.key, PlatformSetting.value)
        .filter(PlatformSetting.key.in_(["plugin.ai_search.installed", "plugin.ai_search.enabled"]))
        .all()
    )
    installed = str(flags.get("plugin.ai_search.installed") or "").lower() == "true"
    enabled = str(flags.get("plugin.ai_search.enabled") or "true").lower() != "false"
    return installed and enabled


def _ip(request: Request) -> str:
    return (request.headers.get("x-real-ip") or (request.headers.get("x-forwarded-for") or "").split(",")[0]).strip() or (
        request.client.host if request.client else "")


@router.get("/status")
def ai_search_status(request: Request, response: Response, db: Session = Depends(get_db)):
    """Whether AI search is available (plugin on and an OpenAI key set) — never the key."""
    response.headers["Cache-Control"] = "public, max-age=60, s-maxage=120"
    key, _ = resolve_openai_key(db, _company(db, request))
    return {"data": {"enabled": bool(key) and _ai_on(db)}}


def _limit(request: Request, bucket: str, rate: int) -> None:
    key = f"{bucket}:{_ip(request)}"
    now = time.time()
    with _hits_lock:
        q = _hits[key]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= rate:
            raise HTTPException(status_code=429, detail="Too many questions — try again in a minute")
        q.append(now)


@router.post("")
def post_ai_search(payload: AiSearchRequest, request: Request, db: Session = Depends(get_db)):
    if not _ai_on(db):
        return {"data": None}
    _limit(request, "search", RATE)
    result = ai_search(db, _company(db, request), payload.query)
    return {"data": result}


@router.post("/assistant")
def post_ai_assistant(payload: AssistantRequest, request: Request, db: Session = Depends(get_db)):
    """The shopping assistant's answer from the catalogue; the last message must be the shopper's."""
    if payload.messages[-1].role != "user":
        raise HTTPException(status_code=422, detail="The last message must be the shopper's question")
    if not _ai_on(db):
        return {"data": None}
    # several OpenAI calls per answer: 10 a minute per shopper IP
    _limit(request, "assistant", 10)
    result = ai_assistant(db, _company(db, request), [m.model_dump() for m in payload.messages])
    return {"data": result}
