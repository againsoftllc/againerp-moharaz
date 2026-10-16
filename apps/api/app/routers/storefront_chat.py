"""Public storefront live chat API — website_chat_*."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.storefront_customer_auth import (
    CustomerAuthContext,
    get_current_storefront_customer,
)
from app.services.ecommerce.website_chat_service import ChatError, WebsiteChatService

router = APIRouter(prefix="/chat", tags=["storefront-chat"])
STOREFRONT_CACHE = "private, no-store"


class ChatMessageRead(BaseModel):
    id: str
    sender: str
    type: str
    text: str
    product_id: Optional[str] = None
    file_name: Optional[str] = None
    file_url: Optional[str] = None
    file_mime: Optional[str] = None
    file_size: Optional[int] = None
    file_kind: Optional[str] = None
    time: str
    read: bool


class ChatConversationRead(BaseModel):
    id: str
    client_key: str
    customer_name: str
    customer_email: str
    starred: bool
    status: str = "open"
    messages: List[ChatMessageRead]
    updated_at: str


class ChatConversationResponse(BaseModel):
    data: ChatConversationRead


class ChatMessageCreate(BaseModel):
    text: str = Field(default="", max_length=8000)
    type: str = Field(default="text", max_length=16)
    product_id: Optional[str] = Field(default=None, max_length=36)
    file_name: Optional[str] = Field(default=None, max_length=255)
    file_url: Optional[str] = None
    file_mime: Optional[str] = Field(default=None, max_length=120)
    file_size: Optional[int] = None
    file_kind: Optional[str] = Field(default=None, max_length=32)


class ChatReadRequest(BaseModel):
    reader: str = Field(default="customer", max_length=16)


def _svc(db: Session) -> WebsiteChatService:
    return WebsiteChatService(db)


def _customer(ctx: CustomerAuthContext):
    return ctx[2]


@router.get("", response_model=ChatConversationResponse)
def get_or_create_chat(
    response: Response,
    db: Session = Depends(get_db),
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
) -> ChatConversationResponse:
    response.headers["Cache-Control"] = STOREFRONT_CACHE
    convo = _svc(db).get_or_create_for_customer(_customer(ctx))
    return ChatConversationResponse(data=ChatConversationRead(**_svc(db).to_dict(convo)))


@router.post("/messages", response_model=ChatConversationResponse)
def post_chat_message(
    payload: ChatMessageCreate,
    response: Response,
    db: Session = Depends(get_db),
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
) -> ChatConversationResponse:
    response.headers["Cache-Control"] = STOREFRONT_CACHE
    try:
        convo = _svc(db).get_or_create_for_customer(_customer(ctx))
        _svc(db).add_customer_message(
            convo,
            text=payload.text,
            message_type=payload.type,
            product_id=payload.product_id,
            file_name=payload.file_name,
            file_url=payload.file_url,
            file_mime=payload.file_mime,
            file_size=payload.file_size,
            file_kind=payload.file_kind,
        )
        db.refresh(convo)
    except ChatError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ChatConversationResponse(data=ChatConversationRead(**_svc(db).to_dict(convo)))


@router.post("/read", response_model=ChatConversationResponse)
def mark_chat_read(
    payload: ChatReadRequest,
    response: Response,
    db: Session = Depends(get_db),
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
) -> ChatConversationResponse:
    response.headers["Cache-Control"] = STOREFRONT_CACHE
    reader = (payload.reader or "customer").strip().lower()
    if reader not in ("customer", "admin"):
        raise HTTPException(status_code=400, detail="Invalid reader")
    # Public API: customers can only mark as customer
    reader = "customer"
    convo = _svc(db).get_or_create_for_customer(_customer(ctx))
    _svc(db).mark_read(convo, reader)
    db.refresh(convo)
    return ChatConversationResponse(data=ChatConversationRead(**_svc(db).to_dict(convo)))


@router.post("/star", response_model=ChatConversationResponse)
def toggle_chat_star(
    response: Response,
    db: Session = Depends(get_db),
    ctx: CustomerAuthContext = Depends(get_current_storefront_customer),
) -> ChatConversationResponse:
    response.headers["Cache-Control"] = STOREFRONT_CACHE
    convo = _svc(db).get_or_create_for_customer(_customer(ctx))
    convo = _svc(db).toggle_star(convo)
    return ChatConversationResponse(data=ChatConversationRead(**_svc(db).to_dict(convo)))
