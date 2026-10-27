"""Provider interface shared by every model backend."""
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class ModelInfo:
    id: str
    provider: str
    label: str
    input_per_mtok: float
    output_per_mtok: float
    server_fallback: bool = False
    judge_only: bool = False
    structured_output: bool = True   # supports a JSON-schema response format
    free_tier: bool = False          # usable on a provider's free tier (rate limited)

    def cost(self, input_tokens: int, output_tokens: int) -> float:
        return (input_tokens * self.input_per_mtok + output_tokens * self.output_per_mtok) / 1_000_000


@dataclass
class Completion:
    text: str
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0
    error: str | None = None


class ProviderError(Exception):
    """A provider call failed. The message is safe to show to users (no secrets)."""


class Provider(ABC):
    name: str

    @abstractmethod
    async def complete(
        self,
        model: ModelInfo,
        system: str,
        user: str,
        max_tokens: int,
        json_schema: dict | None = None,
    ) -> Completion:
        """Send one prompt and return the text plus token usage."""
