"""Admin CRUD for the PC Builder attribute-resolution layer: product
overrides, value aliases, and the chipset→socket lookup table. See
app/services/configurator_attribute_resolver.py for how these get applied."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_write_access
from app.models.configurator_attribute_alias import ConfiguratorAttributeAlias
from app.models.configurator_category import ConfiguratorCategory
from app.models.configurator_category_product_override import ConfiguratorCategoryProductOverride
from app.models.configurator_chipset_lookup import ConfiguratorChipsetLookup
from app.models.configurator_product_override import ConfiguratorProductOverride

router = APIRouter(prefix="", tags=["configurator-lookups"])


# ---------------------------------------------------------------- aliases --
class AttributeAliasWrite(BaseModel):
    field_code: str = Field(min_length=1, max_length=100)
    raw_pattern: str = Field(min_length=1, max_length=255)
    normalized_value: str = Field(min_length=1, max_length=255)


class AttributeAliasRead(AttributeAliasWrite):
    id: str
    # How many catalog products currently carry this raw value (case-insensitive).
    product_count: int = 0


@router.get("/attribute-aliases", response_model=list[AttributeAliasRead])
def list_attribute_aliases(db: Session = Depends(get_db)) -> list[AttributeAliasRead]:
    from sqlalchemy import func

    from app.models.catalog_attribute import CatalogAttribute
    from app.models.catalog_product_attribute_value import CatalogProductAttributeValue
    from app.services.configurator_lookup_defaults import ensure_lookup_defaults

    ensure_lookup_defaults(db)
    rows = db.query(ConfiguratorAttributeAlias).order_by(ConfiguratorAttributeAlias.field_code).all()
    out = []
    for r in rows:
        count = (
            db.query(func.count(CatalogProductAttributeValue.id))
            .join(CatalogAttribute, CatalogAttribute.id == CatalogProductAttributeValue.attribute_id)
            .filter(
                CatalogAttribute.code == r.field_code,
                func.lower(func.trim(CatalogProductAttributeValue.value)) == r.raw_pattern.strip().lower(),
            )
            .scalar()
            or 0
        )
        out.append(
            AttributeAliasRead(
                id=r.id,
                field_code=r.field_code,
                raw_pattern=r.raw_pattern,
                normalized_value=r.normalized_value,
                product_count=count,
            )
        )
    return out


@router.post("/attribute-aliases", response_model=AttributeAliasRead, status_code=201)
def create_attribute_alias(
    payload: AttributeAliasWrite,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> AttributeAliasRead:
    row = ConfiguratorAttributeAlias(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return AttributeAliasRead(id=row.id, field_code=row.field_code, raw_pattern=row.raw_pattern, normalized_value=row.normalized_value)


@router.patch("/attribute-aliases/{alias_id}", response_model=AttributeAliasRead)
def update_attribute_alias(
    alias_id: str,
    payload: AttributeAliasWrite,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> AttributeAliasRead:
    row = db.get(ConfiguratorAttributeAlias, alias_id)
    if not row:
        raise HTTPException(status_code=404, detail="Alias not found")
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return AttributeAliasRead(id=row.id, field_code=row.field_code, raw_pattern=row.raw_pattern, normalized_value=row.normalized_value)


@router.delete("/attribute-aliases/{alias_id}", status_code=204)
def delete_attribute_alias(
    alias_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    row = db.get(ConfiguratorAttributeAlias, alias_id)
    if not row:
        raise HTTPException(status_code=404, detail="Alias not found")
    db.delete(row)
    db.commit()


# --------------------------------------------------------------- overrides --
class ProductOverrideWrite(BaseModel):
    product_id: str = Field(min_length=1, max_length=36)
    field_code: str = Field(min_length=1, max_length=100)
    value: str = Field(min_length=1, max_length=255)


class ProductOverrideRead(ProductOverrideWrite):
    id: str
    product_name: Optional[str] = None
    # Display helpers for the Overrides table: the field's catalog name/type and the
    # value the product itself carries ("" when its own spec is empty).
    field_name: Optional[str] = None
    field_type: Optional[str] = None
    product_value: str = ""


def _override_read(db: Session, row: ConfiguratorProductOverride) -> ProductOverrideRead:
    from app.models.catalog_product import CatalogProduct

    from app.models.catalog_attribute import CatalogAttribute
    from app.models.catalog_product_attribute_value import CatalogProductAttributeValue

    product = db.get(CatalogProduct, row.product_id)
    attr = db.query(CatalogAttribute).filter(CatalogAttribute.code == row.field_code).first()
    stored = ""
    if attr:
        found = (
            db.query(CatalogProductAttributeValue)
            .filter(
                CatalogProductAttributeValue.product_id == row.product_id,
                CatalogProductAttributeValue.attribute_id == attr.id,
            )
            .first()
        )
        stored = (found.value or "").strip() if found else ""
    return ProductOverrideRead(
        id=row.id,
        product_id=row.product_id,
        field_code=row.field_code,
        value=row.value,
        product_name=product.name if product else None,
        field_name=attr.name if attr else None,
        field_type=attr.field_type if attr else None,
        product_value=stored,
    )


@router.get("/override-product-info")
def override_product_info(product_id: str, db: Session = Depends(get_db)) -> dict:
    """For the "Override দিন" drawer: the spec fields that apply to this product (by the
    catalog category it sits in) and what the product itself carries for each."""
    from app.models.catalog_attribute import CatalogAttribute
    from app.models.catalog_category import CatalogCategory
    from app.models.catalog_product import CatalogProduct
    from app.models.catalog_product_attribute_value import CatalogProductAttributeValue
    from app.services import configurator_filters

    product = db.get(CatalogProduct, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    category = db.get(CatalogCategory, product.category_id) if product.category_id else None
    fields = []
    if category:
        fields = configurator_filters.list_filters_for_catalog_slug(db, category.slug, include_special=False)
    if not fields:
        # Product isn't in a builder-mapped category: offer every builder spec field.
        seen: set[str] = set()
        # (the attribute profiles of the builder's slots, from Tabs & Slots)
        from app.services import configurator_field_sources as _fs

        for profile_id in _fs.slot_profile_ids(db):
            for f in configurator_filters.list_filters_for_profile(db, profile_id, include_special=False) or []:
                if f["code"] not in seen and f.get("source") == "attribute":
                    seen.add(f["code"])
                    fields.append(f)
    stored: dict[str, str] = {}
    rows = (
        db.query(CatalogProductAttributeValue, CatalogAttribute)
        .join(CatalogAttribute, CatalogAttribute.id == CatalogProductAttributeValue.attribute_id)
        .filter(CatalogProductAttributeValue.product_id == product_id)
        .all()
    )
    for pav, attr in rows:
        if (pav.value or "").strip():
            stored[attr.code] = pav.value.strip()
    return {
        "data": {
            "product": {"id": product.id, "name": product.name},
            "fields": [
                {
                    "code": f["code"],
                    "name": f["name"],
                    "field_type": f.get("field_type"),
                    "source": f.get("source"),
                    "stored_value": stored.get(f["code"], ""),
                }
                for f in fields
            ],
        }
    }


@router.get("/product-overrides", response_model=list[ProductOverrideRead])
def list_product_overrides(db: Session = Depends(get_db)) -> list[ProductOverrideRead]:
    rows = db.query(ConfiguratorProductOverride).order_by(ConfiguratorProductOverride.field_code).all()
    return [_override_read(db, r) for r in rows]


@router.post("/product-overrides", response_model=ProductOverrideRead, status_code=201)
def create_product_override(
    payload: ProductOverrideWrite,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ProductOverrideRead:
    row = ConfiguratorProductOverride(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return _override_read(db, row)


@router.patch("/product-overrides/{override_id}", response_model=ProductOverrideRead)
def update_product_override(
    override_id: str,
    payload: ProductOverrideWrite,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ProductOverrideRead:
    row = db.get(ConfiguratorProductOverride, override_id)
    if not row:
        raise HTTPException(status_code=404, detail="Override not found")
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return _override_read(db, row)


@router.delete("/product-overrides/{override_id}", status_code=204)
def delete_product_override(
    override_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    row = db.get(ConfiguratorProductOverride, override_id)
    if not row:
        raise HTTPException(status_code=404, detail="Override not found")
    db.delete(row)
    db.commit()


# ----------------------------------------------------------- chipset lookup --
class ChipsetLookupWrite(BaseModel):
    chipset: str = Field(min_length=1, max_length=100)
    socket: str = Field(min_length=1, max_length=100)
    supported_generations: str = Field(default="", max_length=500)
    bios_update_generations: str = Field(default="", max_length=500)


class ChipsetLookupRead(ChipsetLookupWrite):
    id: str


@router.get("/chipset-lookup", response_model=list[ChipsetLookupRead])
def list_chipset_lookup(db: Session = Depends(get_db)) -> list[ChipsetLookupRead]:
    from app.services.configurator_lookup_defaults import ensure_lookup_defaults

    ensure_lookup_defaults(db)
    rows = db.query(ConfiguratorChipsetLookup).order_by(ConfiguratorChipsetLookup.chipset).all()
    return [ChipsetLookupRead(id=r.id, chipset=r.chipset, socket=r.socket, supported_generations=r.supported_generations, bios_update_generations=r.bios_update_generations) for r in rows]


@router.post("/chipset-lookup", response_model=ChipsetLookupRead, status_code=201)
def create_chipset_lookup(
    payload: ChipsetLookupWrite,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ChipsetLookupRead:
    existing = db.query(ConfiguratorChipsetLookup).filter(ConfiguratorChipsetLookup.chipset.ilike(payload.chipset)).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Chipset {payload.chipset} already has a lookup row")
    row = ConfiguratorChipsetLookup(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return ChipsetLookupRead(id=row.id, chipset=row.chipset, socket=row.socket, supported_generations=row.supported_generations, bios_update_generations=row.bios_update_generations)


@router.patch("/chipset-lookup/{lookup_id}", response_model=ChipsetLookupRead)
def update_chipset_lookup(
    lookup_id: str,
    payload: ChipsetLookupWrite,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ChipsetLookupRead:
    row = db.get(ConfiguratorChipsetLookup, lookup_id)
    if not row:
        raise HTTPException(status_code=404, detail="Chipset lookup row not found")
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return ChipsetLookupRead(id=row.id, chipset=row.chipset, socket=row.socket, supported_generations=row.supported_generations, bios_update_generations=row.bios_update_generations)


@router.delete("/chipset-lookup/{lookup_id}", status_code=204)
def delete_chipset_lookup(
    lookup_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    row = db.get(ConfiguratorChipsetLookup, lookup_id)
    if not row:
        raise HTTPException(status_code=404, detail="Chipset lookup row not found")
    db.delete(row)
    db.commit()


# ---------------------------------------------------- category include/exclude --
class CategoryProductOverrideWrite(BaseModel):
    category_id: str = Field(min_length=1, max_length=36)
    product_id: str = Field(min_length=1, max_length=36)
    # "ignore" only silences a product in the Overview issue list; the slot's
    # product list ignores it (see _apply_category_overrides).
    action: str = Field(pattern="^(include|exclude|ignore)$")


class CategoryProductOverrideRead(CategoryProductOverrideWrite):
    id: str
    category_name: Optional[str] = None
    product_name: Optional[str] = None


def _category_override_read(db: Session, row: ConfiguratorCategoryProductOverride) -> CategoryProductOverrideRead:
    from app.models.catalog_product import CatalogProduct

    category = db.get(ConfiguratorCategory, row.category_id)
    product = db.get(CatalogProduct, row.product_id)
    return CategoryProductOverrideRead(
        id=row.id,
        category_id=row.category_id,
        product_id=row.product_id,
        action=row.action,
        category_name=category.name if category else None,
        product_name=product.name if product else None,
    )


@router.get("/category-overrides", response_model=list[CategoryProductOverrideRead])
def list_category_overrides(
    category_id: Optional[str] = None,
    db: Session = Depends(get_db),
) -> list[CategoryProductOverrideRead]:
    query = db.query(ConfiguratorCategoryProductOverride)
    if category_id:
        query = query.filter(ConfiguratorCategoryProductOverride.category_id == category_id)
    rows = query.order_by(ConfiguratorCategoryProductOverride.created_at.desc()).all()
    return [_category_override_read(db, r) for r in rows]


@router.post("/category-overrides", response_model=CategoryProductOverrideRead, status_code=201)
def create_category_override(
    payload: CategoryProductOverrideWrite,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> CategoryProductOverrideRead:
    existing = (
        db.query(ConfiguratorCategoryProductOverride)
        .filter(
            ConfiguratorCategoryProductOverride.category_id == payload.category_id,
            ConfiguratorCategoryProductOverride.product_id == payload.product_id,
        )
        .first()
    )
    if existing and existing.action != "ignore":
        raise HTTPException(status_code=400, detail="This product already has an override for this slot")
    if existing:
        # An "ignore" is just a dismissed Overview issue — replace it rather than fail.
        existing.action = payload.action
        db.commit()
        db.refresh(existing)
        return _category_override_read(db, existing)
    row = ConfiguratorCategoryProductOverride(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return _category_override_read(db, row)


@router.patch("/category-overrides/{override_id}", response_model=CategoryProductOverrideRead)
def update_category_override(
    override_id: str,
    payload: CategoryProductOverrideWrite,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> CategoryProductOverrideRead:
    row = db.get(ConfiguratorCategoryProductOverride, override_id)
    if not row:
        raise HTTPException(status_code=404, detail="Override not found")
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return _category_override_read(db, row)


@router.delete("/category-overrides/{override_id}", status_code=204)
def delete_category_override(
    override_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    row = db.get(ConfiguratorCategoryProductOverride, override_id)
    if not row:
        raise HTTPException(status_code=404, detail="Override not found")
    db.delete(row)
    db.commit()


# ------------------------------------------------------------ lookup options --
# Slot slug -> where its values come from. Used to offer real values in the
# Lookup & Alias dropdowns (so spellings come from the catalog, not typing).
@router.get("/lookup-options")
def lookup_options(db: Session = Depends(get_db)) -> dict:
    """Distinct values real products carry, resolved the way the builder reads
    them: motherboard chipsets, CPU sockets and generations, plus every
    dropdown-type field's values (for the alias form)."""
    from app.models.configurator_profile import ConfiguratorProfile
    from app.services import configurator_filters

    from app.services import configurator_field_sources as field_sources

    profile = db.query(ConfiguratorProfile).filter(ConfiguratorProfile.slug == "pc-builder").first()
    if not profile:
        return {
            "data": {
                "chipsets": [],
                "sockets": [],
                "generations": [],
                "known_chipsets": [],
                "known_sockets": [],
                "known_generations": [],
                "alias_fields": [],
                "field_values": {},
            }
        }

    # The Alias "field" list: every dropdown attribute of the attribute profiles the builder's slots use (Tabs &
    # Slots), labelled with its profile. Nothing is listed here by hand.
    alias_fields: dict[str, str] = {}
    for attr, profile_name in field_sources.dropdown_attributes(db):
        alias_fields.setdefault(attr.code, f"{profile_name} › {attr.name}")

    # Chipset / Socket / Generation dropdowns offer the values of the attribute feeding each field, and only those.
    chipset_values = field_sources.attribute_values(db, "chipset")
    chipsets = chipset_values["values"]
    sockets = field_sources.attribute_values(db, "socket")["values"]
    generations = field_sources.attribute_values(db, "generation")["values"]
    # Alias "correct value" options: the values of that field's attribute, nothing else.
    field_values = {code: v for code in alias_fields if (v := field_sources.values_for_field(db, code))}
    # Known chipsets / sockets (the lookup table's own rows plus the starter list), so the dropdowns can
    # still offer them when no product carries that chipset or socket yet.
    from app.services.configurator_lookup_defaults import DEFAULT_CHIPSETS

    table = db.query(ConfiguratorChipsetLookup).all()
    known_chipsets = sorted({c for c, _s, _g, _b in DEFAULT_CHIPSETS} | {r.chipset for r in table})
    known_sockets = sorted({sk for _c, sk, _g, _b in DEFAULT_CHIPSETS} | {r.socket for r in table if r.socket})
    known_generations = sorted(
        {g.strip() for _c, _s, gens, _b in DEFAULT_CHIPSETS for g in gens.split(",") if g.strip()}
        | {g.strip() for r in table for g in (r.supported_generations or "").split(",") if g.strip()}
    )
    return {
        "data": {
            "chipsets": chipsets,
            "chipsets_in_use": chipset_values["in_use"],
            "sockets": sockets,
            "generations": generations,
            "known_chipsets": known_chipsets,
            "known_sockets": known_sockets,
            "known_generations": known_generations,
            "alias_fields": [{"code": c, "name": n} for c, n in sorted(alias_fields.items(), key=lambda x: x[1])],
            "field_values": field_values,
        }
    }
