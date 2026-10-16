from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ConfiguratorChipsetLookup(Base):
    """Chipset → Socket (+ supported/BIOS-update CPU generations) reference
    table. A motherboard product only has to carry its chipset name (e.g.
    "B650") in the catalog; the socket the rule engine actually compares gets
    derived from this table rather than requiring every motherboard's spec
    sheet to spell out the socket explicitly.

    supported_generations / bios_update_generations are comma-separated CPU
    generation labels (e.g. "Ryzen 7000, Ryzen 8000") — not yet consumed by
    any rule, reserved for a future generation/BIOS-update compatibility
    check on top of the socket derivation this table already powers.
    """

    __tablename__ = "configurator_chipset_lookup"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    chipset: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    socket: Mapped[str] = mapped_column(String(100), nullable=False)
    supported_generations: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    bios_update_generations: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now(),
    )
