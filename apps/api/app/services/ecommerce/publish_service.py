"""Ecommerce publish workflow — draft → review → published → archived."""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.ecommerce_item import EcommerceItem
from app.services.ecommerce.constants import PUBLISH_TRANSITIONS, PUBLISH_TO_CATALOG_STATUS


class PublishWorkflowError(ValueError):
    """Invalid publish state transition."""


class EcommercePublishService:
    def __init__(self, db: Session) -> None:
        self._db = db

    def _get(self, item_id: str) -> EcommerceItem:
        row = (
            self._db.query(EcommerceItem)
            .filter(EcommerceItem.item_id == item_id)
            .first()
        )
        if not row:
            raise PublishWorkflowError("Ecommerce item not found")
        return row

    def _assert_transition(self, row: EcommerceItem, target: str) -> None:
        allowed = PUBLISH_TRANSITIONS.get(row.publish_status, frozenset())
        if target not in allowed:
            raise PublishWorkflowError(
                f"Cannot move from '{row.publish_status}' to '{target}'",
            )

    def _apply_status(self, row: EcommerceItem, status: str) -> EcommerceItem:
        row.publish_status = status
        row.is_active = status == "published"
        if row.catalog_product_id:
            product = self._db.get(CatalogProduct, row.catalog_product_id)
            if product:
                product.status = PUBLISH_TO_CATALOG_STATUS.get(status, "draft")
                if status == "published":
                    product.visibility = row.visibility
        self._db.flush()
        return row

    def submit_for_review(self, item_id: str) -> EcommerceItem:
        row = self._get(item_id)
        self._assert_transition(row, "review")
        if not row.slug:
            raise PublishWorkflowError("Slug is required before review")
        return self._apply_status(row, "review")

    def reject_review(self, item_id: str) -> EcommerceItem:
        row = self._get(item_id)
        self._assert_transition(row, "draft")
        return self._apply_status(row, "draft")

    def publish(self, item_id: str) -> EcommerceItem:
        row = self._get(item_id)
        if row.publish_status not in {"review", "hidden"}:
            self._assert_transition(row, "published")
        if row.visibility != "public":
            raise PublishWorkflowError("Set visibility to public before publishing")
        if not row.slug:
            raise PublishWorkflowError("Slug is required before publishing")
        return self._apply_status(row, "published")

    def unpublish(self, item_id: str, *, hidden: bool = False) -> EcommerceItem:
        row = self._get(item_id)
        target = "hidden" if hidden else "draft"
        if row.publish_status == "published":
            return self._apply_status(row, target)
        self._assert_transition(row, target)
        return self._apply_status(row, target)

    def archive(self, item_id: str) -> EcommerceItem:
        row = self._get(item_id)
        self._assert_transition(row, "archived")
        return self._apply_status(row, "archived")

    def restore(self, item_id: str) -> EcommerceItem:
        row = self._get(item_id)
        self._assert_transition(row, "draft")
        return self._apply_status(row, "draft")

    def get_published_by_catalog_product_id(self, product_id: str) -> Optional[EcommerceItem]:
        return (
            self._db.query(EcommerceItem)
            .filter(
                EcommerceItem.catalog_product_id == product_id,
                EcommerceItem.publish_status == "published",
                EcommerceItem.visibility == "public",
            )
            .first()
        )

    def is_storefront_live(self, ec: EcommerceItem) -> bool:
        return ec.publish_status == "published" and ec.visibility == "public"

    def is_reachable_by_url(self, ec: EcommerceItem) -> bool:
        """Live, or unlisted ("hidden" / private — e.g. discontinued) but still served at its own URL."""
        return ec.publish_status in ("published", "hidden") and ec.visibility in ("public", "private")
