from __future__ import annotations

import json
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional, Tuple

JOB_STATUSES = frozenset({"pending", "running", "completed", "failed", "cancelled"})
ITEM_STATUSES = frozenset(
    {"pending", "mapped", "validated", "warning", "error", "approved", "rejected"}
)


def dumps_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def loads_json(value: Optional[str]) -> Any:
    if not value:
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None


def _price_ok(value: Any) -> bool:
    if value is None or value == "":
        return False
    try:
        return Decimal(str(value)) >= 0
    except (InvalidOperation, ValueError):
        return False


def validate_staging_item(
  universal: Dict[str, Any],
  raw: Optional[Dict[str, Any]] = None,
  existing_skus: Optional[set[str]] = None,
  existing_product_ids: Optional[set[str]] = None,
) -> Tuple[str, Dict[str, Any], List[Dict[str, Any]]]:
    """Return (item_status, validation_payload, error_rows)."""
    issues: List[Dict[str, Any]] = []
    warnings: List[Dict[str, Any]] = []

    title = str(universal.get("title") or "").strip()
    if not title:
        issues.append({"kind": "missing_title", "field": "title", "message": "Missing title", "severity": "error"})

    images = universal.get("images") or []
    if not images:
        issues.append({"kind": "image_missing", "field": "images", "message": "No images", "severity": "error"})
    else:
        for i, img in enumerate(images):
            url = img.get("url") if isinstance(img, dict) else None
            if not url or not str(url).startswith("http"):
                issues.append(
                    {
                        "kind": "invalid_image",
                        "field": f"images[{i}]",
                        "message": "Invalid image URL",
                        "severity": "error",
                    }
                )
            w = img.get("width") if isinstance(img, dict) else None
            if w is not None and isinstance(w, int) and w < 200:
                warnings.append(
                    {
                        "kind": "low_resolution_image",
                        "field": f"images[{i}]",
                        "message": "Low resolution image",
                        "severity": "warning",
                    }
                )

    base_price = universal.get("basePrice")
    if not _price_ok(base_price):
        issues.append({"kind": "price_missing", "field": "basePrice", "message": "Invalid or missing price", "severity": "error"})

    variants = universal.get("variants") or []
    if not variants:
        issues.append({"kind": "no_variant", "field": "variants", "message": "No variants", "severity": "error"})

    sku_seen: set[str] = set()
    for i, v in enumerate(variants):
        if not isinstance(v, dict):
            continue
        sku = str(v.get("sku") or "").strip()
        if not sku:
            issues.append(
                {"kind": "invalid_variant", "field": f"variants[{i}].sku", "message": "Variant missing SKU", "severity": "error"}
            )
            continue
        if sku in sku_seen:
            issues.append(
                {"kind": "duplicate_sku", "field": f"variants[{i}].sku", "message": f"Duplicate SKU {sku}", "severity": "error"}
            )
        sku_seen.add(sku)
        if existing_skus and sku in existing_skus:
            issues.append(
                {"kind": "duplicate_sku", "field": f"variants[{i}].sku", "message": f"SKU already staged: {sku}", "severity": "error"}
            )
        if not _price_ok(v.get("price")):
            issues.append(
                {"kind": "invalid_variant", "field": f"variants[{i}].price", "message": "Invalid variant price", "severity": "warning"}
            )

    provider_product_id = str(universal.get("providerProductId") or "")
    if existing_product_ids and provider_product_id and provider_product_id in existing_product_ids:
        issues.append(
            {
                "kind": "duplicate_product",
                "field": "providerProductId",
                "message": f"Product already staged: {provider_product_id}",
                "severity": "error",
            }
        )

    if not universal.get("category"):
        warnings.append(
            {"kind": "missing_category", "field": "category", "message": "Missing category", "severity": "warning"}
        )
    if not universal.get("brand"):
        warnings.append({"kind": "missing_brand", "field": "brand", "message": "Missing brand", "severity": "warning"})
    elif isinstance(universal.get("brand"), dict) and not universal["brand"].get("logo"):
        warnings.append(
            {"kind": "missing_brand_logo", "field": "brand.logo", "message": "Missing brand logo", "severity": "warning"}
        )
    if not universal.get("description"):
        warnings.append(
            {"kind": "missing_description", "field": "description", "message": "Missing description", "severity": "warning"}
        )
    if universal.get("weight") in (None, "", 0):
        warnings.append(
            {"kind": "missing_weight", "field": "weight", "message": "Missing weight", "severity": "warning"}
        )

    if raw is None:
        issues.append({"kind": "invalid_json", "field": "rawData", "message": "Missing raw provider JSON", "severity": "error"})

    validation = {
        "valid": not any(i["severity"] == "error" for i in issues),
        "issues": issues + warnings,
        "errors": issues,
        "warnings": warnings,
        "checked_at": datetime.utcnow().isoformat(),
    }

    if any(i["severity"] == "error" for i in issues):
        status = "error"
    elif warnings:
        status = "warning"
    else:
        status = "validated"

    return status, validation, issues + warnings
