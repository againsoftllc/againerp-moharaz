"""Generate line-art product images for the IT demo catalog.

The demo catalog has no photography, so every product fell back to
`placeholder.svg` and the storefront grid looked empty. This draws one SVG per
product from a category-specific silhouette (same 48x48 line-art language as
`public/images/categories/it/*.svg`) with the brand and product name baked in,
writes it to both public folders (storefront on :3010, admin on :3210 resolve
`/images/...` against their own origin) and points the product thumbnail at it.

Run: docker compose exec api python scripts/seed_it_demo_images.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from xml.sax.saxutils import escape

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text

from app.database import SessionLocal

API_ROOT = Path(__file__).resolve().parents[1]
URL_PREFIX = "/images/products/it"


def output_dirs() -> tuple[Path, ...]:
    """Public folders when running on the host; a staging dir inside the container.

    The API container only mounts `apps/api`, so when the web public folders are
    not visible we write next to the API and let the caller copy the files out.
    """
    if len(API_ROOT.parents) < 2:  # inside the container, mounted at /app
        return (API_ROOT / "_generated_product_images",)
    repo_root = API_ROOT.parents[1]
    candidates = (
        repo_root.parent / "againerp-frontend" / "public" / "images" / "products" / "it",
        repo_root / "apps" / "web" / "public" / "images" / "products" / "it",
    )
    visible = tuple(path for path in candidates if path.parent.parent.exists())
    return visible or (API_ROOT / "_generated_product_images",)

# Silhouettes are authored on a 48x48 grid so they can be scaled as a group.
SHAPES: dict[str, str] = {
    "laptop": """
      <rect x="9" y="12" width="30" height="19" />
      <path d="M4 36h40" />
      <path d="M18 36l1.5 4h9L30 36" />
      <path d="M14 17h20M14 22h14" />
    """,
    "gaming-laptop": """
      <rect x="9" y="12" width="30" height="19" />
      <path d="M4 36h40" />
      <path d="M18 36l1.5 4h9L30 36" />
      <path d="M14 17h20M14 22h20M14 26h12" />
      <path d="M31 26h3" />
    """,
    "desktop": """
      <rect x="13" y="6" width="16" height="36" />
      <path d="M17 12h8M17 17h8" />
      <circle cx="21" cy="26" r="3" />
      <path d="M33 20h8M33 26h8M33 32h8" />
    """,
    "monitor": """
      <rect x="6" y="9" width="36" height="23" />
      <path d="M20 32v5h8v-5" />
      <path d="M14 42h20" />
      <path d="M11 14h26" />
    """,
    "keyboard": """
      <rect x="4" y="16" width="40" height="18" />
      <path d="M9 21h4M16 21h4M23 21h4M30 21h4M37 21h2" />
      <path d="M9 27h4M16 27h16M35 27h4" />
    """,
    "mouse": """
      <path d="M24 8c8 0 12 6 12 14v10c0 5-5 8-12 8s-12-3-12-8V22C12 14 16 8 24 8z" />
      <path d="M24 8v12" />
      <path d="M12 20h24" />
    """,
    "ssd": """
      <rect x="8" y="14" width="32" height="20" />
      <path d="M14 20h10M14 26h6" />
      <path d="M34 14v20" />
      <path d="M8 22h-4M8 28h-4" />
    """,
    "ram": """
      <rect x="4" y="15" width="40" height="16" />
      <path d="M10 20h6M20 20h6M30 20h6" />
      <path d="M8 31v5M16 31v5M24 31v5M32 31v5M40 31v5" />
    """,
    "cpu": """
      <rect x="13" y="13" width="22" height="22" />
      <rect x="20" y="20" width="8" height="8" />
      <path d="M18 13V7M24 13V7M30 13V7M18 35v6M24 35v6M30 35v6" />
      <path d="M13 18H7M13 24H7M13 30H7M35 18h6M35 24h6M35 30h6" />
    """,
    "graphics-card": """
      <rect x="5" y="14" width="38" height="20" />
      <circle cx="17" cy="24" r="6" />
      <circle cx="32" cy="24" r="6" />
      <path d="M10 34v5M20 34v5M30 34v5M40 34v5" />
    """,
    "motherboard": """
      <rect x="7" y="7" width="34" height="34" />
      <rect x="13" y="13" width="10" height="10" />
      <path d="M29 13h8M29 18h8M29 23h8" />
      <path d="M13 30h24M13 35h16" />
    """,
    "headphone": """
      <path d="M10 28V22a14 14 0 0 1 28 0v6" />
      <rect x="5" y="26" width="8" height="14" />
      <rect x="35" y="26" width="8" height="14" />
    """,
    "printer": """
      <rect x="11" y="7" width="26" height="10" />
      <rect x="6" y="17" width="36" height="15" />
      <rect x="14" y="32" width="20" height="9" />
      <path d="M12 23h6" />
    """,
    "router": """
      <rect x="6" y="26" width="36" height="12" />
      <path d="M12 32h4M20 32h4" />
      <path d="M34 20v6M14 20v6" />
      <path d="M28 16a10 10 0 0 1 14 0M32 21a5 5 0 0 1 6 0" />
    """,
    "camera": """
      <path d="M6 16h22v16H6z" />
      <path d="M28 21l10-5v20l-10-5" />
      <path d="M12 21h6" />
      <path d="M14 32v8" />
    """,
    "ups": """
      <rect x="10" y="8" width="28" height="32" />
      <path d="M24 14l-5 9h10l-5 9" />
      <path d="M16 36h16" />
    """,
    "smartwatch": """
      <rect x="14" y="13" width="20" height="22" />
      <path d="M19 13V6h10v7M19 35v7h10v-7" />
      <path d="M24 20v5h4" />
    """,
    "tablet": """
      <rect x="12" y="5" width="24" height="38" />
      <path d="M20 39h8" />
      <path d="M16 11h16" />
    """,
}

# Longest matching category slug wins, so "gaming-laptop" beats "laptop".
CATEGORY_SHAPES: tuple[tuple[str, str], ...] = (
    ("gaming-laptop", "gaming-laptop"),
    ("all-laptop", "laptop"),
    ("ultrabook", "laptop"),
    ("laptop", "laptop"),
    ("gaming-pc", "desktop"),
    ("brand-pc", "desktop"),
    ("desktop", "desktop"),
    ("gaming-monitor", "monitor"),
    ("monitor", "monitor"),
    ("keyboard", "keyboard"),
    ("mouse", "mouse"),
    ("ssd-storage", "ssd"),
    ("desktop-ram", "ram"),
    ("processor-cpu", "cpu"),
    ("graphics-card", "graphics-card"),
    ("motherboard", "motherboard"),
    ("headphone", "headphone"),
    ("office-printer", "printer"),
    ("router", "router"),
    ("network", "router"),
    ("cc-camera", "camera"),
    ("security-system", "camera"),
    ("offline-ups", "ups"),
    ("ups", "ups"),
    ("smartwatch-gadget", "smartwatch"),
    ("it-gadget", "smartwatch"),
    ("android-tablet", "tablet"),
    ("tablet-pc", "tablet"),
)

# Each accent keeps the card recognisable per family without leaving the palette.
ACCENTS: dict[str, str] = {
    "laptop": "#1d4ed8",
    "gaming-laptop": "#b91c1c",
    "desktop": "#0f766e",
    "monitor": "#4338ca",
    "keyboard": "#475569",
    "mouse": "#475569",
    "ssd": "#0369a1",
    "ram": "#7c3aed",
    "cpu": "#c2410c",
    "graphics-card": "#166534",
    "motherboard": "#0f766e",
    "headphone": "#be185d",
    "printer": "#334155",
    "router": "#0284c7",
    "camera": "#334155",
    "ups": "#a16207",
    "smartwatch": "#7c3aed",
    "tablet": "#1d4ed8",
}

CANVAS = 640
SHAPE_SCALE = 6.4  # 48 * 6.4 = 307px of artwork
MAX_LINE_CHARS = 30
MAX_LINES = 2


def shape_key(category_slug: str) -> str:
    best: tuple[int, str] | None = None
    slug = (category_slug or "").lower()
    for prefix, key in CATEGORY_SHAPES:
        if prefix in slug and (best is None or len(prefix) > best[0]):
            best = (len(prefix), key)
    return best[1] if best else "desktop"


def wrap_name(name: str) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in name.split():
        candidate = f"{current} {word}".strip()
        if len(candidate) <= MAX_LINE_CHARS:
            current = candidate
            continue
        lines.append(current)
        current = word
        if len(lines) == MAX_LINES:
            break
    if current and len(lines) < MAX_LINES:
        lines.append(current)
    if not lines:
        return [name[:MAX_LINE_CHARS]]
    consumed = sum(len(line) for line in lines) + len(lines) - 1
    if consumed < len(name.strip()):
        lines[-1] = lines[-1][: MAX_LINE_CHARS - 1].rstrip() + "…"
    return lines


def build_svg(*, name: str, brand: str, category: str, key: str) -> str:
    accent = ACCENTS.get(key, "#1f2937")
    shape = SHAPES[key].strip()
    offset = (CANVAS - 48 * SHAPE_SCALE) / 2
    name_lines = wrap_name(name)
    text_y = 520 if len(name_lines) == 2 else 532
    name_svg = "\n".join(
        f'    <text x="{CANVAS / 2:.0f}" y="{text_y + index * 30}" text-anchor="middle"'
        f' font-family="Arial, Helvetica, sans-serif" font-size="23" font-weight="600"'
        f' fill="#1f2937">{escape(line)}</text>'
        for index, line in enumerate(name_lines)
    )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS} {CANVAS}" role="img" aria-label="{escape(name)}">
  <rect width="{CANVAS}" height="{CANVAS}" fill="#ffffff"/>
  <rect x="24" y="24" width="{CANVAS - 48}" height="{CANVAS - 48}" fill="#f6f8fb" stroke="#e5e9f0" stroke-width="2"/>
  <rect x="24" y="24" width="{CANVAS - 48}" height="6" fill="{accent}"/>
  <text x="48" y="82" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" letter-spacing="2" fill="{accent}">{escape(brand.upper())}</text>
  <text x="{CANVAS - 48}" y="82" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="19" fill="#8a93a3">{escape(category)}</text>
  <g transform="translate({offset:.0f}, 120) scale({SHAPE_SCALE})" fill="none" stroke="{accent}" stroke-width="2.2" stroke-linecap="square" stroke-linejoin="miter">
{shape}
  </g>
  <path d="M48 470h{CANVAS - 96}" stroke="#e5e9f0" stroke-width="2"/>
{name_svg}
</svg>
"""


def refresh_homepage_images(db) -> int:
    """Point homepage CMS cards at the product thumbnails they were snapshotted from.

    `workspace_sites.storefront_cms_json` stores an image URL per card, so the
    homepage keeps serving the old placeholder until those snapshots are rewritten.
    """
    updated = 0
    rows = db.execute(
        text("SELECT id, storefront_cms_json FROM workspace_sites WHERE storefront_cms_json IS NOT NULL")
    ).mappings().all()
    thumbnails = {
        str(row["id"]): row["thumbnail"]
        for row in db.execute(
            text("SELECT id, thumbnail FROM catalog_products WHERE thumbnail IS NOT NULL")
        ).mappings()
    }
    def retarget(node) -> bool:
        touched = False
        if isinstance(node, dict):
            thumbnail = thumbnails.get(str(node.get("productId") or ""))
            if thumbnail and node.get("image") != thumbnail:
                node["image"] = thumbnail
                touched = True
            for value in node.values():
                touched = retarget(value) or touched
        elif isinstance(node, list):
            for value in node:
                touched = retarget(value) or touched
        return touched

    for row in rows:
        try:
            cms = json.loads(row["storefront_cms_json"])
        except (TypeError, ValueError):
            continue
        if not retarget(cms):
            continue
        db.execute(
            text("UPDATE workspace_sites SET storefront_cms_json = :cms WHERE id = :id"),
            {"cms": json.dumps(cms), "id": row["id"]},
        )
        updated += 1
    return updated


def main() -> None:
    targets = output_dirs()
    for directory in targets:
        directory.mkdir(parents=True, exist_ok=True)

    db = SessionLocal()
    try:
        rows = db.execute(
            text(
                """
                SELECT p.id, p.slug, p.name, coalesce(b.name, '') AS brand,
                       coalesce(c.name, '') AS category, coalesce(c.slug, '') AS category_slug
                FROM catalog_products p
                LEFT JOIN catalog_brands b ON b.id = p.brand_id
                LEFT JOIN catalog_categories c ON c.id = p.category_id
                ORDER BY p.name
                """
            )
        ).mappings().all()

        written = 0
        for row in rows:
            slug = row["slug"] or row["id"]
            key = shape_key(row["category_slug"])
            svg = build_svg(
                name=row["name"],
                brand=row["brand"] or "Againcart",
                category=row["category"] or "IT",
                key=key,
            )
            for directory in targets:
                (directory / f"{slug}.svg").write_text(svg, encoding="utf-8")
            url = f"{URL_PREFIX}/{slug}.svg"
            db.execute(
                text("UPDATE catalog_products SET thumbnail = :url WHERE id = :id"),
                {"url": url, "id": row["id"]},
            )
            # The storefront reads the mirrored ecommerce item, not the catalog row.
            db.execute(
                text(
                    "UPDATE ecommerce_items SET thumbnail_url = :url "
                    "WHERE catalog_product_id = :id"
                ),
                {"url": url, "id": row["id"]},
            )
            written += 1

        sites = refresh_homepage_images(db)
        db.commit()
        print(f"Refreshed homepage cards on {sites} site(s).")
        print(f"Generated {written} product images into:")
        for directory in targets:
            print(f"  {directory}")

        for table, column in (("catalog_products", "thumbnail"), ("ecommerce_items", "thumbnail_url")):
            remaining = db.execute(
                text(
                    f"SELECT count(*) FROM {table} "
                    f"WHERE {column} IS NULL OR {column} LIKE '%placeholder%'"
                )
            ).scalar()
            print(f"{table}: {remaining} row(s) still on the placeholder")
    finally:
        db.close()


if __name__ == "__main__":
    main()
