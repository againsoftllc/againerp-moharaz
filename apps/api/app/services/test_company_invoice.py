from app.services.company_invoice import format_invoice_number, parse_invoice_layout


def test_blank_scheme_matches_againpos():
    assert format_invoice_number(prefix="", include_year=False, padding=4, sequence=42) == "0042"
    assert format_invoice_number(prefix="", include_year=False, padding=4, sequence=1018) == "1018"


def test_year_scheme_matches_againpos():
    assert (
        format_invoice_number(prefix="", include_year=True, padding=4, sequence=14, year=2024)
        == "2024/0014"
    )


def test_optional_prefix_is_concatenated():
    assert format_invoice_number(prefix="INV", include_year=False, padding=4, sequence=1) == "INV0001"
    assert (
        format_invoice_number(prefix="A", include_year=True, padding=4, sequence=1, year=2026)
        == "A2026/0001"
    )


def test_layout_defaults_fill_missing_keys():
    layout = parse_invoice_layout({"heading": "Tax Invoice", "show_sku": True})
    assert layout["heading"] == "Tax Invoice"
    assert layout["show_sku"] is True
    assert layout["number_label"] == "Invoice No."
    assert layout["show_logo"] is False
    assert layout["logo_url"] == ""
    assert layout["authorised_signature_url"] == ""
    assert layout["show_customer_company"] is True


def test_layout_keeps_media_urls():
    layout = parse_invoice_layout(
        {
            "logo_url": "/uploads/media/logo.png",
            "customer_signature_url": " /uploads/media/cust-sign.png ",
            "authorised_signature_url": "/uploads/media/auth-sign.png",
            "show_logo": True,
        }
    )
    assert layout["logo_url"] == "/uploads/media/logo.png"
    assert layout["customer_signature_url"] == "/uploads/media/cust-sign.png"
    assert layout["authorised_signature_url"] == "/uploads/media/auth-sign.png"
    assert layout["show_logo"] is True
    assert layout["show_customer_signature"] is True
    assert layout["customer_signature_label"] == "Customer Signature"


def test_packing_layout_defaults_and_heading():
    from app.services.company_invoice import parse_packing_layout

    layout = parse_packing_layout({"heading": "Delivery Note", "show_serial": True, "prefix": "ch"})
    assert layout["heading"] == "Delivery Note"
    assert layout["show_serial"] is True
    assert layout["prefix"] == "ch"
    assert layout["number_label"] == "Chalan No."
    assert layout["ordered_label"] == "Ordered"
    assert layout["delivered_label"] == "Delivered"
    assert layout["show_order"] is True
    assert "show_tax" not in layout or layout.get("show_payments") is None
    assert layout["padding"] == 4
    assert layout["next_sequence"] == 1


def test_purchase_layout_defaults_and_heading():
    from app.services.company_invoice import parse_purchase_layout

    layout = parse_purchase_layout({"heading": "Purchase Indent", "show_sku": False, "prefix": "po"})
    assert layout["heading"] == "Purchase Indent"
    assert layout["show_sku"] is False
    assert layout["prefix"] == "po"
    assert layout["number_label"] == "PO No."
    assert layout["vendor_label"] == "Vendor"
    assert layout["show_vendor"] is True
    assert layout["padding"] == 4
    assert layout["next_sequence"] == 1


def test_payment_layout_defaults_and_heading():
    from app.services.company_invoice import parse_payment_layout

    layout = parse_payment_layout({"heading": "Money Receipt", "show_memo": False, "prefix": "ps"})
    assert layout["heading"] == "Money Receipt"
    assert layout["show_memo"] is False
    assert layout["prefix"] == "ps"
    assert layout["number_label"] == "Slip No."
    assert layout["partner_label"] == "Received from"
    assert layout["show_invoices"] is True
    assert layout["show_logo"] is True
    assert layout["padding"] == 4
    assert layout["next_sequence"] == 1


def test_peel_legacy_signature_footer():
    from app.services.company_invoice import DEFAULT_LAYOUT, peel_legacy_signature_footer

    notes, layout = peel_legacy_signature_footer(
        "Customer Signature\nAuthorised Signature\nAdditional Text",
        dict(DEFAULT_LAYOUT),
    )
    assert notes == "Additional Text"
    assert layout["customer_signature_label"] == "Customer Signature"
    assert layout["authorised_signature_label"] == "Authorised Signature"
    assert layout["show_customer_signature"] is True
    assert layout["show_authorised_signature"] is True
