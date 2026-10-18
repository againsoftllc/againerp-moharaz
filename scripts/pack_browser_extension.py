"""Pack apps/browser-extension into apps/web/public/downloads/send-to-againerp-extension.zip.

The admin (Settings -> Plugins -> Price Compare, and the Price Compare page) offers this file as the download of the "Send to AgainERP"
Chrome extension. Run it again after ANY change in apps/browser-extension and commit the zip:

    python scripts/pack_browser_extension.py
"""
from __future__ import annotations

import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "apps" / "browser-extension"
OUT = ROOT / "apps" / "web" / "public" / "downloads" / "send-to-againerp-extension.zip"


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    version = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))["version"]
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        for path in sorted(SRC.rglob("*")):
            if path.is_file():
                z.write(path, Path("send-to-againerp-extension") / path.relative_to(SRC))
    print(f"{OUT.relative_to(ROOT)}  v{version}  {OUT.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
