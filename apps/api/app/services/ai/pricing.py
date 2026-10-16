"""Rough cost estimation for AI usage — STEP 12, cache-aware since STEP 14.

Deliberately not exact: pricing is a per-model rate table (USD per million
tokens, cached snapshot below) applied to the token counts already in
ai_audit_logs. Accounts for prompt-cache discounts using Anthropic's standard
multipliers (cache write ~1.25x base input price, cache read ~0.1x — a 90%
discount) applied on top of the same per-model input rate; this is the
documented general-purpose ratio, not fetched per-model, so treat it as an
estimate for trend/budget visibility, not an invoice. Still does not account
for batch pricing or rate changes after this snapshot.

An unrecognized model_id returns None rather than guessing — a missing
number is honest; a wrong one looks precise and isn't.
"""

from __future__ import annotations

from typing import Optional

# Cache pricing is a fixed multiplier on the model's own input rate, not a
# separate rate table (documented across Claude's current model family).
_CACHE_WRITE_MULTIPLIER = 1.25
_CACHE_READ_MULTIPLIER = 0.10

# USD per 1,000,000 tokens — (input, output). Snapshot, not live-fetched (no
# public pricing API exists to query instead). Update when models table changes.
_RATES_PER_MTOK: dict[str, tuple[float, float]] = {
    "claude-fable-5-1": (10.00, 50.00),
    "claude-fable-5": (10.00, 50.00),
    "claude-opus-5": (5.00, 25.00),
    "claude-opus-4-8": (5.00, 25.00),
    "claude-opus-4-7": (5.00, 25.00),
    "claude-opus-4-6": (5.00, 25.00),
    "claude-sonnet-5": (2.00, 10.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-haiku-4-5": (1.00, 5.00),
}


def estimate_cost_usd(
    model_id: Optional[str],
    input_tokens: int,
    output_tokens: int,
    *,
    cache_creation_tokens: int = 0,
    cache_read_tokens: int = 0,
) -> Optional[float]:
    """None for an unpriced/unknown model (e.g. Center's OpenAI models, which
    Center meters and bills on its own side — not this ERP's concern) rather
    than a fabricated number. `input_tokens` here is the non-cached portion —
    Anthropic's own usage fields already separate them (verified live, STEP
    14), so no need to subtract cache tokens out of input_tokens ourselves."""
    if not model_id:
        return None
    rates = _RATES_PER_MTOK.get(model_id)
    if rates is None:
        return None
    input_rate, output_rate = rates
    cost = (input_tokens / 1_000_000) * input_rate + (output_tokens / 1_000_000) * output_rate
    cost += (cache_creation_tokens / 1_000_000) * input_rate * _CACHE_WRITE_MULTIPLIER
    cost += (cache_read_tokens / 1_000_000) * input_rate * _CACHE_READ_MULTIPLIER
    return round(cost, 6)
