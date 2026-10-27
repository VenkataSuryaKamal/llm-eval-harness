"""Which models exist, what they cost, and which provider serves them."""
import asyncio
import json
from functools import lru_cache
from pathlib import Path

from ..config import get_settings
from .anthropic_provider import AnthropicProvider
from .base import ModelInfo, Provider
from .mock_provider import MockProvider
from .openai_provider import OpenAIProvider

CATALOG_PATH = Path(__file__).resolve().parent.parent / "model_catalog.json"

# OpenAI-compatible providers: (setting name, base URL, label, has a free tier)
COMPATIBLE = {
    "gemini": ("gemini_api_key", "https://generativelanguage.googleapis.com/v1beta/openai/", "Google Gemini", True),
    "groq": ("groq_api_key", "https://api.groq.com/openai/v1", "Groq", True),
    "openrouter": ("openrouter_api_key", "https://openrouter.ai/api/v1", "OpenRouter", True),
}
FREE_PROVIDERS = {"gemini", "groq", "openrouter", "ollama"}


@lru_cache
def _catalog() -> dict[str, ModelInfo]:
    raw = json.loads(CATALOG_PATH.read_text())
    return {m["id"]: ModelInfo(**{k: v for k, v in m.items() if not k.startswith("_")}) for m in raw["models"]}


def _key(secret) -> str:
    return secret.get_secret_value().strip() if secret else ""


@lru_cache
def _providers() -> dict[str, Provider]:
    s = get_settings()
    t = s.request_timeout_seconds
    providers: dict[str, Provider] = {}
    if _key(s.anthropic_api_key):
        providers["anthropic"] = AnthropicProvider(_key(s.anthropic_api_key), t)
    if _key(s.openai_api_key):
        providers["openai"] = OpenAIProvider(_key(s.openai_api_key), t)
    for name, (setting, url, label, _) in COMPATIBLE.items():
        if key := _key(getattr(s, setting)):
            providers[name] = OpenAIProvider(key, t, name=name, base_url=url, label=label)
    if s.ollama_base_url.strip():
        # Ollama ignores the key, but the SDK requires a non-empty one.
        providers["ollama"] = OpenAIProvider("ollama", max(t, 180), name="ollama",
                                             base_url=s.ollama_base_url.strip(), label="Ollama")
    if s.enable_mock_models:
        providers["mock"] = MockProvider()
    return providers


@lru_cache
def _provider_limits() -> dict[str, asyncio.Semaphore]:
    n = max(1, get_settings().free_tier_concurrency)
    return {name: asyncio.Semaphore(n) for name in FREE_PROVIDERS}


def provider_slot(model: ModelInfo) -> asyncio.Semaphore | None:
    """Shared limit for free-tier providers, so several runs can't burst past their rate limits."""
    return _provider_limits().get(model.provider)


def configured_providers() -> list[str]:
    return sorted(_providers())


def available_models(include_judge_only: bool = False) -> list[ModelInfo]:
    """Models whose provider is configured. This is the allow-list for runs."""
    providers = _providers()
    return [m for m in _catalog().values()
            if m.provider in providers and (include_judge_only or not m.judge_only)]


def get_model(model_id: str) -> ModelInfo | None:
    m = _catalog().get(model_id)
    return m if m and m.provider in _providers() else None


def default_judge() -> ModelInfo | None:
    """First available model from JUDGE_MODEL, then JUDGE_FALLBACK_MODEL (in order)."""
    for model_id in get_settings().judge_candidates:
        if m := get_model(model_id):
            return m
    return None


def provider_for(model: ModelInfo) -> Provider:
    return _providers()[model.provider]


async def complete(model: ModelInfo, system: str, user: str, max_tokens: int, json_schema: dict | None = None):
    """Call a model, waiting for a free-tier slot first when the provider needs one."""
    slot = provider_slot(model)
    if slot is None:
        return await provider_for(model).complete(model, system, user, max_tokens, json_schema)
    async with slot:
        return await provider_for(model).complete(model, system, user, max_tokens, json_schema)


def reset_caches() -> None:
    """Used by tests after changing settings."""
    _catalog.cache_clear()
    _providers.cache_clear()
    _provider_limits.cache_clear()
