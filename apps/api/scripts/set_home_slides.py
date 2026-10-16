"""Set the storefront's home slider (the homepage hero) to images from the media library.

Upload the slide images in the admin (Media → Upload; on a Cloudflare-connected site they go to R2), then:

    python -m scripts.set_home_slides "alienware|/monitor|Alienware AW3426DW curved gaming monitor" \\
        "onimusha|/processor?brand=AMD|Onimusha bundle with AMD Ryzen" "logitech|/brand/logitech|Logitech gear"

Each slide is "<part of the media file name>|<link>|<alt text>"; the newest matching upload is used. The slides
replace the hero's current ones (dry run by default, --apply to write). The storefront takes the slider's
proportions from the first image.
"""

from __future__ import annotations

import argparse
import struct
import urllib.request
from pathlib import Path
from typing import Optional, Tuple

from app.database import SessionLocal
from app.models.media import Media
from app.models.website_homepage import dump_json
from app.services.website_homepage_service import ensure_homepage_category_pins, load_homepage_raw

UPLOADS = Path(__file__).resolve().parents[1] / "uploads" / "media"


def image_size(data: bytes) -> Optional[Tuple[int, int]]:
    """Width and height from a WebP, PNG or JPEG header."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        chunk = data[12:16]
        if chunk == b"VP8X":
            return 1 + int.from_bytes(data[24:27], "little"), 1 + int.from_bytes(data[27:30], "little")
        if chunk == b"VP8 ":
            w, h = struct.unpack("<HH", data[26:30])
            return w & 0x3FFF, h & 0x3FFF
        if chunk == b"VP8L":
            b = int.from_bytes(data[21:25], "little")
            return (b & 0x3FFF) + 1, ((b >> 14) & 0x3FFF) + 1
    if data[:2] == b"\xff\xd8":
        i = 2
        while i < len(data) - 9:
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            length = struct.unpack(">H", data[i + 2:i + 4])[0]
            if marker in (0xC0, 0xC1, 0xC2):
                h, w = struct.unpack(">HH", data[i + 5:i + 9])
                return w, h
            i += 2 + length
    return None


def read_bytes(m: Media) -> bytes:
    if m.url.startswith("http"):
        req = urllib.request.Request(m.url, headers={"User-Agent": "AgainERP/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read(200_000)
    return (UPLOADS / Path(m.url).name).read_bytes()[:200_000]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("slides", nargs="+", help='"<name part>|<link>|<alt>"')
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    db = SessionLocal()
    slides = []
    for n, spec in enumerate(args.slides, start=1):
        part, href, alt = (spec.split("|") + ["", ""])[:3]
        m = (
            db.query(Media)
            .filter(Media.name.ilike(f"%{part.strip()}%"), Media.media_type == "image")
            .order_by(Media.created_at.desc())
            .first()
        )
        if m is None:
            raise SystemExit(f'no uploaded image whose name contains "{part}" — upload it in the admin first')
        size = image_size(read_bytes(m)) or (2828, 1052)
        slides.append({
            "id": f"s{n}", "image_url": m.url, "href": href.strip() or "/", "alt": alt.strip() or m.alt or m.title or "",
            "object_fit": "fill", "image_width": size[0], "image_height": size[1], "hidden": False,
        })
        print(f"slide {n}: {m.name} → {m.url} ({size[0]}×{size[1]}) → {href or '/'}")

    row = ensure_homepage_category_pins(db)
    raw = load_homepage_raw(row)
    hero = raw.get("hero") if isinstance(raw.get("hero"), dict) else {}
    raw["hero"] = {**hero, "hidden": False, "slides": slides}
    if args.apply:
        row.content_json = dump_json(raw)
        db.commit()
        print(f"applied: {len(slides)} slide(s)")
    else:
        db.rollback()
        print("dry run — run with --apply to write")


if __name__ == "__main__":
    main()
