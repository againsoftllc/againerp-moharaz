"""A tiny in-process cache with a time limit, for public storefront responses that are slow to build and change rarely.

Each API worker process keeps its own copy, so an entry is at most `ttl` seconds old in every worker; `clear()`
empties the calling worker's copy at once (the others expire on their own)."""

from __future__ import annotations

import threading
import time
from typing import Any, Hashable


class TTLCache:
    def __init__(self, ttl: float, max_entries: int = 200) -> None:
        self.ttl = ttl
        self.max_entries = max_entries
        self._lock = threading.Lock()
        self._data: dict[Hashable, tuple[float, Any]] = {}

    def get(self, key: Hashable) -> Any | None:
        with self._lock:
            hit = self._data.get(key)
            if hit and time.monotonic() - hit[0] < self.ttl:
                return hit[1]
            if hit:
                del self._data[key]
        return None

    def set(self, key: Hashable, value: Any) -> None:
        with self._lock:
            if len(self._data) >= self.max_entries:
                self._data.clear()
            self._data[key] = (time.monotonic(), value)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()
