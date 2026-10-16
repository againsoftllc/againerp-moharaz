"""Resolves an AIProvider by id. One place to add a provider — nowhere else in
the codebase should construct ClaudeProvider / CenterProvider directly.

Providers are cheap to construct (no network I/O in __init__) and are not
cached across requests: each carries only config read at construction time,
so a settings change (e.g. a key rotated in Workspace → AI Providers) takes
effect on the next call without a restart.
"""

from __future__ import annotations

from app.config import get_settings
from app.services.ai.providers.base import AIProvider, ProviderError
from app.services.ai.providers.center_provider import CenterProvider
from app.services.ai.providers.claude_provider import ClaudeProvider
from app.services.ai.providers.openai_provider import OpenAIProvider

_FACTORIES = {
    "openai": OpenAIProvider,
    "claude": ClaudeProvider,
    "center": CenterProvider,
}


def available_providers() -> list[str]:
    return sorted(_FACTORIES)


def get_provider(provider_id: str | None = None) -> AIProvider:
    """Provider for `provider_id`, or the company/app default when omitted."""
    resolved = (provider_id or get_settings().ai_default_provider or "openai").strip().lower()
    factory = _FACTORIES.get(resolved)
    if factory is None:
        raise ProviderError(
            f"Unknown AI provider '{resolved}'. Available: {', '.join(available_providers())}"
        )
    return factory()
