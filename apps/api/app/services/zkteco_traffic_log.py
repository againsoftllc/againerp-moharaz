"""Appends every raw device request to a text dump file."""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("zkteco.traffic")

_lock = threading.Lock()

DEFAULT_TRAFFIC_FILE = Path(__file__).resolve().parents[2] / "uploads" / "zkteco_push_received.txt"


def append_raw_traffic(file_path: str | Path, method: str, url: str, body: str) -> None:
    path = Path(file_path)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    entry = f"[{stamp}] {method} {url}\n{body}\n{'-' * 60}\n"
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with _lock:
            with open(path, "a", encoding="utf-8", errors="replace") as fh:
                fh.write(entry)
    except OSError:
        logger.exception("Failed to append raw traffic to %s", path)
