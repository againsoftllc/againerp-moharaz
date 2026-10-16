"""Default OpenCart-style options for workspace_sites.options_json."""

from __future__ import annotations

import json
from typing import Any


DEFAULT_SITE_OPTIONS: dict[str, Any] = {
    "template": "default",
    "default_layout": "common/home",
    "country": "Bangladesh",
    "region": "Dhaka Division",
    "entry_region": "dropdown",
    "language": "English",
    "admin_language": "English",
    "auto_update_currency": True,
    "length_class": "Centimeter",
    "weight_class": "Kilogram",
    "category_product_count": True,
    "catalog_items_per_page": "16",
    "list_description_limit": "100",
    "admin_items_per_page": "100",
    "allow_reviews": True,
    "allow_guest_reviews": False,
    "new_review_alert_mail": True,
    "voucher_min": "1",
    "voucher_max": "1000",
    "display_prices_with_tax": True,
    "use_store_tax_address": "Shipping Address",
    "use_customer_tax_address": "Shipping Address",
    "customers_online": True,
    "otp_verification": True,
    "default_customer_group": "Default",
    "login_display_prices": False,
    "max_login_attempts": "5",
    "account_terms": "--- None ---",
    "new_account_alert_mail": True,
    "invoice_prefix": "AGC-",
    "api_user": "",
    "display_weight_on_cart": False,
    "guest_checkout": True,
    "checkout_terms": "--- None ---",
    "order_status": "Pending",
    "order_print_status": "Pending",
    "processing_order_statuses": ["Processing", "Processed"],
    "complete_order_statuses": ["Complete", "Shipped"],
    "new_order_alert_message": True,
    "display_stock": True,
    "show_out_of_stock_warning": True,
    "stock_checkout": False,
    "affiliate_requires_approval": True,
    "automatic_commission": False,
    "affiliate_commission": "5",
    "affiliate_terms": "--- None ---",
    "new_affiliate_alert_mail": True,
    "return_terms": "--- None ---",
    "return_status": "Pending",
    "watermark_text": "",
    "ftp_host": "",
    "ftp_port": "21",
    "ftp_user": "",
    "ftp_password": "",
    "ftp_root": "",
    "smtp_host": "",
    "smtp_port": "587",
    "smtp_user": "",
    "smtp_password": "",
    "sms_gateway": "BulkSMS BD",
    "sms_api_key": "",
    "maintenance_mode": False,
    "seo_urls": True,
    "compression": True,
}


def dump_site_options(options: dict[str, Any] | None) -> str:
    merged = {**DEFAULT_SITE_OPTIONS, **(options or {})}
    return json.dumps(merged, ensure_ascii=False)


def load_site_options(raw: str | None) -> dict[str, Any]:
    data: dict[str, Any] = {}
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                data = parsed
        except Exception:
            data = {}
    return {**DEFAULT_SITE_OPTIONS, **data}
