"""Universal Collaboration Framework services."""

from app.services.collaboration.collaboration_service import (
    CollaborationService,
    on_item_archived,
    on_item_created,
    on_item_price_change,
    on_item_published,
    on_item_stock_change,
    on_item_updated,
)

__all__ = [
    "CollaborationService",
    "on_item_archived",
    "on_item_created",
    "on_item_price_change",
    "on_item_published",
    "on_item_stock_change",
    "on_item_updated",
]
