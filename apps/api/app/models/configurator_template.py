from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def dump_components(value: Any) -> str:
    return json.dumps(value if value is not None else [])


def load_components(value: Optional[str]) -> List[Any]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except json.JSONDecodeError:
        return []


class ConfiguratorTemplate(Base):
    """Pre-configured starter build for a configurator profile."""

    __tablename__ = "configurator_templates"
    __table_args__ = (UniqueConstraint("profile_id", "slug", name="uq_configurator_template_profile_slug"),)

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    profile_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("configurator_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    components_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    use_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    @property
    def components(self) -> List[Any]:
        return load_components(self.components_json)

    @components.setter
    def components(self, value: Any) -> None:
        self.components_json = dump_components(value)
