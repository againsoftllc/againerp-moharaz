"""Shared inventory stock status computation."""

from __future__ import annotations


def compute_stock_status(on_hand: int, min_qty: int, max_qty: int = 0) -> str:
    if on_hand <= 0:
        return "out_of_stock"
    reorder = min_qty
    if on_hand < reorder:
        return "low_stock"
    if max_qty > 0 and on_hand > max_qty:
        return "overstock"
    return "in_stock"
