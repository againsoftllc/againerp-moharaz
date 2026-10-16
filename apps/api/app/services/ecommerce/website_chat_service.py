"""Storefront live chat service — website_chat_conversations / messages."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.commerce_customer import CommerceCustomer
from app.models.website_chat import WebsiteChatConversation, WebsiteChatMessage


class ChatError(ValueError):
    pass


WELCOME_TEXT = "Welcome to Monarch IT! How can we help you today?"


class WebsiteChatService:
    def __init__(self, db: Session) -> None:
        self._db = db

    def get_or_create_for_customer(self, customer: CommerceCustomer) -> WebsiteChatConversation:
        email = (customer.email or customer.phone or customer.id).strip().lower()
        name = (customer.name or "Customer").strip() or "Customer"

        row = None
        if customer.id:
            row = (
                self._db.query(WebsiteChatConversation)
                .filter(WebsiteChatConversation.customer_id == customer.id)
                .order_by(WebsiteChatConversation.updated_at.desc())
                .first()
            )
        if not row and email:
            row = (
                self._db.query(WebsiteChatConversation)
                .filter(WebsiteChatConversation.customer_email == email)
                .order_by(WebsiteChatConversation.updated_at.desc())
                .first()
            )
            if row and not row.customer_id:
                row.customer_id = customer.id

        if row:
            if name and row.customer_name != name:
                row.customer_name = name
            if email and row.customer_email != email:
                row.customer_email = email
            self._db.commit()
            self._db.refresh(row)
            return row

        row = WebsiteChatConversation(
            customer_id=customer.id,
            customer_email=email,
            customer_name=name,
            status="open",
        )
        self._db.add(row)
        self._db.flush()
        welcome = WebsiteChatMessage(
            conversation_id=row.id,
            sender="admin",
            message_type="text",
            text=WELCOME_TEXT,
            read=True,
        )
        self._db.add(welcome)
        self._db.commit()
        self._db.refresh(row)
        return row

    def get_owned(self, conversation_id: str, customer: CommerceCustomer) -> WebsiteChatConversation:
        row = self._db.get(WebsiteChatConversation, conversation_id)
        if not row:
            # allow lookup by email key used in legacy UI
            email = (customer.email or "").strip().lower()
            if email and conversation_id.lower() == email:
                row = self.get_or_create_for_customer(customer)
            else:
                raise ChatError("Conversation not found")
        if row.customer_id and row.customer_id != customer.id:
            raise ChatError("Conversation not found")
        email = (customer.email or "").strip().lower()
        if not row.customer_id and email and row.customer_email != email:
            raise ChatError("Conversation not found")
        if not row.customer_id:
            row.customer_id = customer.id
            self._db.commit()
            self._db.refresh(row)
        return row

    def add_customer_message(
        self,
        conversation: WebsiteChatConversation,
        *,
        text: str,
        message_type: str = "text",
        product_id: Optional[str] = None,
        file_name: Optional[str] = None,
        file_url: Optional[str] = None,
        file_mime: Optional[str] = None,
        file_size: Optional[int] = None,
        file_kind: Optional[str] = None,
    ) -> WebsiteChatMessage:
        message_type = (message_type or "text").strip().lower()
        if message_type not in ("text", "product", "file"):
            raise ChatError("Invalid message type")
        body = (text or "").strip()
        if message_type == "text" and not body:
            raise ChatError("Message text is required")
        if message_type == "product" and not product_id:
            raise ChatError("product_id is required for product messages")
        if message_type == "file" and not file_url:
            raise ChatError("file_url is required for file messages")

        msg = WebsiteChatMessage(
            conversation_id=conversation.id,
            sender="customer",
            message_type=message_type,
            text=body or (file_name or "Attachment"),
            product_id=product_id,
            file_name=file_name,
            file_url=file_url,
            file_mime=file_mime,
            file_size=file_size,
            file_kind=file_kind,
            read=False,
        )
        self._db.add(msg)
        conversation.updated_at = datetime.utcnow()
        self._db.commit()
        self._db.refresh(msg)
        return msg

    def mark_read(self, conversation: WebsiteChatConversation, reader: str) -> int:
        other = "admin" if reader == "customer" else "customer"
        updated = 0
        for msg in conversation.messages:
            if msg.sender == other and not msg.read:
                msg.read = True
                updated += 1
        if updated:
            self._db.commit()
        return updated

    def toggle_star(self, conversation: WebsiteChatConversation) -> WebsiteChatConversation:
        conversation.starred = not conversation.starred
        self._db.commit()
        self._db.refresh(conversation)
        return conversation

    def to_dict(self, conversation: WebsiteChatConversation) -> Dict[str, Any]:
        messages: List[Dict[str, Any]] = []
        for m in conversation.messages:
            messages.append(
                {
                    "id": m.id,
                    "sender": m.sender,
                    "type": m.message_type,
                    "text": m.text or "",
                    "product_id": m.product_id,
                    "file_name": m.file_name,
                    "file_url": m.file_url,
                    "file_mime": m.file_mime,
                    "file_size": m.file_size,
                    "file_kind": m.file_kind,
                    "time": (m.created_at or datetime.utcnow()).isoformat(),
                    "read": bool(m.read),
                }
            )
        return {
            "id": conversation.id,
            "client_key": (conversation.customer_email or "").lower(),
            "customer_name": conversation.customer_name,
            "customer_email": conversation.customer_email,
            "starred": bool(conversation.starred),
            "status": conversation.status,
            "messages": messages,
            "updated_at": (conversation.updated_at or datetime.utcnow()).isoformat(),
        }
