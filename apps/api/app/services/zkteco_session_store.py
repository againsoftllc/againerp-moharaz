"""In-memory per-device session store for ZKTeco ADMS ACC handshake."""

from __future__ import annotations

import hashlib
import secrets
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

_REGISTRY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_REGISTRY_CODE_LENGTH = 10


def _new_registry_code() -> str:
    return "".join(secrets.choice(_REGISTRY_ALPHABET) for _ in range(_REGISTRY_CODE_LENGTH))


def _new_session_id() -> str:
    return uuid.uuid4().hex.upper()


@dataclass
class DeviceSession:
    serial_number: str
    registry_code: str = field(default_factory=_new_registry_code)
    session_id: str = field(default_factory=_new_session_id)
    registered: bool = False
    device_type: str | None = None
    push_version: str | None = None
    last_registry_body: str | None = None
    last_seen_utc: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def token(self) -> str:
        raw = f"{self.registry_code}{self.serial_number}{self.session_id}"
        return hashlib.md5(raw.encode("utf-8")).hexdigest()

    def touch(self) -> None:
        self.last_seen_utc = datetime.now(timezone.utc)


class SessionStore:
    """Thread-safe dict of DeviceSession keyed by SN (case-insensitive)."""

    def __init__(self) -> None:
        self._sessions: dict[str, DeviceSession] = {}
        self._lock = threading.Lock()

    def get_or_create(self, serial_number: str) -> DeviceSession:
        key = serial_number.strip().upper()
        with self._lock:
            session = self._sessions.get(key)
            if session is None:
                session = DeviceSession(serial_number=serial_number.strip())
                self._sessions[key] = session
            return session

    def get(self, serial_number: str) -> DeviceSession | None:
        return self._sessions.get(serial_number.strip().upper())

    def clear(self) -> None:
        with self._lock:
            self._sessions.clear()


store = SessionStore()
