from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class StorefrontChatMessageIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class StorefrontChatProduct(BaseModel):
    id: str
    name: str
    slug: str
    brand: str = ""
    price_bdt: float
    stock: int
    in_stock: bool


class StorefrontChatLink(BaseModel):
    label: str
    href: str


class StorefrontChatCheckoutIn(BaseModel):
    email: str = ""
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(default=".", max_length=100)
    phone: str = Field(min_length=3, max_length=50)
    address: str = Field(min_length=3, max_length=500)
    district: str = Field(default="", max_length=100)
    payment_method: str = Field(default="cod", max_length=50)
    shipping_method: str = Field(default="standard", max_length=50)
    notes: Optional[str] = None


class StorefrontChatRequest(BaseModel):
    message: str = Field(default="", max_length=2000)
    history: List[StorefrontChatMessageIn] = Field(default_factory=list, max_length=20)
    cart_token: Optional[str] = Field(default=None, max_length=128)
    action: Optional[Literal["search", "add_to_cart", "view_cart", "place_order"]] = None
    product_id: Optional[str] = None
    query: Optional[str] = None
    quantity: int = Field(default=1, ge=1, le=99)
    checkout: Optional[StorefrontChatCheckoutIn] = None


class StorefrontChatRead(BaseModel):
    content: str
    mode: Literal["live", "fallback", "action"]
    provider: Optional[str] = None
    cart_token: Optional[str] = None
    order_number: Optional[str] = None
    links: Optional[List[StorefrontChatLink]] = None
    products: Optional[List[StorefrontChatProduct]] = None


class StorefrontChatResponse(BaseModel):
    data: StorefrontChatRead


class StorefrontChatStatusRead(BaseModel):
    live: bool
    provider: Optional[str] = None
    model: Optional[str] = None
    can_order: bool = False


class StorefrontChatStatusResponse(BaseModel):
    data: StorefrontChatStatusRead
