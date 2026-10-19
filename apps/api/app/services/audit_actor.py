"""Stamp who made a change.

`deps.auth.get_current_user` puts the signed-in user on the request's database session (`session.info["actor"]`); this hook copies it
onto every catalog product that is created or changed in that session - the product form, the AI chat, the import, a bulk action.
A session with no actor (scripts, background jobs) leaves the columns as they are.
"""
from __future__ import annotations

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.models.catalog_category import CatalogCategory
from app.models.catalog_product import CatalogProduct


@event.listens_for(Session, "before_flush")
def _stamp_actor(session: Session, _ctx, _instances) -> None:
    actor = session.info.get("actor")
    if not actor:
        return
    user_id, name = actor
    for obj in list(session.new) + list(session.dirty):
        if isinstance(obj, (CatalogProduct, CatalogCategory)) and (obj in session.new or session.is_modified(obj, include_collections=False)):
            if obj.updated_by_id != user_id:
                obj.updated_by_id = user_id
            if obj.updated_by_name != name:
                obj.updated_by_name = name
