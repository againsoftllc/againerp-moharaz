AI_PROVIDER_SEED = [
    {
        "id": "openai",
        "name": "OpenAI",
        "models": ["gpt-4o", "gpt-4o-mini"],
        "status": "healthy",
        "latency_ms": 420,
        "spend_pct": 58,
    },
    {
        "id": "anthropic",
        "name": "Anthropic",
        "models": ["claude-sonnet", "claude-haiku"],
        "status": "healthy",
        "latency_ms": 510,
        "spend_pct": 32,
    },
    {
        "id": "google",
        "name": "Google Gemini",
        "models": ["gemini-2.0-flash"],
        "status": "degraded",
        "latency_ms": 890,
        "spend_pct": 8,
    },
    {
        "id": "local",
        "name": "Local (Ollama)",
        "models": ["llama3.2"],
        "status": "offline",
        "latency_ms": 0,
        "spend_pct": 2,
    },
]
