from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserUiPreference(Base):
    """Per-user screen layout (grid column order/widths, toggles…) saved on the server, so it
    follows the admin to any browser or device — like a spreadsheet remembering its layout."""

    __tablename__ = "user_ui_preferences"
    __table_args__ = (UniqueConstraint("user_id", "pref_key", name="uq_user_ui_preference"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("auth_users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    pref_key: Mapped[str] = mapped_column(String(120), nullable=False)
    value_json: Mapped[str] = mapped_column(Text, nullable=False, default="null")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now(),
    )
