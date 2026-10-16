#!/usr/bin/env python3
"""Backward-compatible wrapper — prefer scripts/seed_builder_catalog.py."""

from __future__ import annotations

import runpy
import sys
from pathlib import Path

# Delegate to the unified builder seed (PC pack only by default for this wrapper).
script = Path(__file__).with_name("seed_builder_catalog.py")
sys.argv = [str(script), "--pack", "pc", *sys.argv[1:]]
runpy.run_path(str(script), run_name="__main__")
