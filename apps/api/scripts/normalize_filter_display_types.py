"""One-off: every filterable attribute is either single-select (radio) or multi-select (checkboxes).

The attribute's kind (field_type multi_select = several values, anything else = one) decides it; its filter row on the
storefront follows. Old values (range / boolean / color / dynamic) on attribute filters become single-select; the
built-in filters (price range, availability ...) are left alone. Safe to run again.

    python -m scripts.normalize_filter_display_types
"""
from sqlalchemy import text

import scripts.init_db  # noqa: F401
from app.database import SessionLocal


def main() -> None:
    db = SessionLocal()
    a = db.execute(text(
        "UPDATE catalog_attributes SET filter_display_type = CASE WHEN field_type = 'multi_select' THEN 'multi_select' ELSE 'single_select' END "
        "WHERE filter_display_type IS DISTINCT FROM CASE WHEN field_type = 'multi_select' THEN 'multi_select' ELSE 'single_select' END"
    )).rowcount
    f = db.execute(text(
        "UPDATE catalog_filters f SET display_type = CASE WHEN a.field_type = 'multi_select' THEN 'multi_select' ELSE 'single_select' END "
        "FROM catalog_attributes a WHERE f.source = 'attribute' AND f.attribute_id = a.id "
        "AND f.display_type IS DISTINCT FROM CASE WHEN a.field_type = 'multi_select' THEN 'multi_select' ELSE 'single_select' END"
    )).rowcount
    g = db.execute(text(
        "UPDATE catalog_filters SET display_type = 'single_select' WHERE source = 'attribute' AND attribute_id IS NULL "
        "AND display_type NOT IN ('single_select', 'multi_select')"
    )).rowcount
    db.commit()
    print(f"attributes updated {a} · attribute filters updated {f} (+{g} without an attribute)")
    db.close()


if __name__ == "__main__":
    main()
