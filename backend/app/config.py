"""Application settings.

Every setting is read from environment variables (or a local `.env` file).
Secrets such as API keys are NEVER hard-coded and NEVER returned by the API.
"""
from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- General -------------------------------------------------------------
    app_env: str = Field(default="development", description="development | production")
    # Public demo: the site shows a notice asking visitors not to enter private data.
    demo_mode: bool = False
    database_url: str = "sqlite:///./data/eval_harness.db"

    # --- Provider credentials (optional: a provider without a key is hidden) --
    anthropic_api_key: SecretStr | None = None
    openai_api_key: SecretStr | None = None
    # Providers with a free tier (see README section 8). All optional.
    gemini_api_key: SecretStr | None = None       # https://aistudio.google.com/apikey
    groq_api_key: SecretStr | None = None         # https://console.groq.com/keys
    openrouter_api_key: SecretStr | None = None   # https://openrouter.ai/settings/keys
    ollama_base_url: str = ""                     # e.g. http://127.0.0.1:11434/v1 (local, no key)

    # Offline "mock" models let you try the whole app with zero API keys.
    enable_mock_models: bool = True

    # --- LLM-as-a-judge ---------------------------------------------------------
    judge_model: str = "claude-opus-5-5"
    # Tried in order when the configured judge is unavailable (for example no Anthropic key).
    judge_fallback_model: str = "gpt-4.1,openai/gpt-oss-120b,gemini-3.8-flash,gemini-3.5-flash-lite,qwen3:8b,mock-judge"

    # --- Security ---------------------------------------------------------------
    # If set, every /api request must send header `X-API-Key: <value>`.
    app_api_key: SecretStr | None = None
    cors_origins: str = "http://localhost:3000"
    # Requests per minute, per client IP, for endpoints that spend money.
    rate_limit_per_minute: int = 10
    # Quick-test (single prompt) calls per minute per client IP. One call per model.
    playground_rate_limit_per_minute: int = 60

    # --- Abuse / cost guard-rails ----------------------------------------------
    max_upload_bytes: int = 1_000_000          # 1 MB per dataset file
    max_cases_per_dataset: int = 500
    max_field_chars: int = 20_000               # per cell in a dataset
    max_prompt_chars: int = 20_000
    max_models_per_run: int = 6
    max_calls_per_run: int = 1_000              # cases x models
    max_output_tokens: int = 4_096
    request_timeout_seconds: float = 60.0
    concurrency: int = 5                        # parallel model calls per run
    free_tier_concurrency: int = 2              # parallel calls per free-tier provider (all runs)

    @property
    def judge_candidates(self) -> list[str]:
        return [self.judge_model] + [m.strip() for m in self.judge_fallback_model.split(",") if m.strip()]

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
