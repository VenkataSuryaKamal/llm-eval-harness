"""Claude models through the official Anthropic Python SDK."""
import time

import anthropic

from .base import Completion, ModelInfo, Provider, ProviderError

# `fallbacks: "default"` lets the API re-run a request that a safety classifier
# declines on Anthropic's recommended fallback model, inside the same call.
FALLBACK_BETA = "server-side-fallback-2026-07-01"


class AnthropicProvider(Provider):
    name = "anthropic"

    def __init__(self, api_key: str, timeout: float):
        # max_retries: the SDK already retries 408/409/429/5xx with backoff.
        self.client = anthropic.AsyncAnthropic(api_key=api_key, timeout=timeout, max_retries=3)

    async def complete(self, model: ModelInfo, system: str, user: str, max_tokens: int,
                       json_schema: dict | None = None) -> Completion:
        kwargs: dict = {
            "model": model.id,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": user}],
        }
        if system:
            kwargs["system"] = system
        if json_schema:
            kwargs["output_config"] = {"format": {"type": "json_schema", "schema": json_schema}}

        start = time.perf_counter()
        try:
            if model.server_fallback:
                resp = await self.client.beta.messages.create(
                    betas=[FALLBACK_BETA], fallbacks="default", **kwargs
                )
            else:
                resp = await self.client.messages.create(**kwargs)
        except anthropic.AuthenticationError as e:
            raise ProviderError("Anthropic rejected the API key (401).") from e
        except anthropic.PermissionDeniedError as e:
            raise ProviderError("Anthropic API key lacks permission for this model (403).") from e
        except anthropic.NotFoundError as e:
            raise ProviderError(f"Model '{model.id}' was not found (404).") from e
        except anthropic.RateLimitError as e:
            raise ProviderError("Anthropic rate limit hit (429) after retries.") from e
        except anthropic.BadRequestError as e:
            raise ProviderError(f"Anthropic rejected the request (400): {e.message[:300]}") from e
        except anthropic.APIStatusError as e:
            raise ProviderError(f"Anthropic API error ({e.status_code}).") from e
        except anthropic.APIConnectionError as e:
            raise ProviderError("Could not reach the Anthropic API (network or timeout).") from e
        latency_ms = int((time.perf_counter() - start) * 1000)

        usage = resp.usage
        completion = Completion(
            text="".join(b.text for b in resp.content if b.type == "text").strip(),
            input_tokens=getattr(usage, "input_tokens", 0) or 0,
            output_tokens=getattr(usage, "output_tokens", 0) or 0,
            latency_ms=latency_ms,
        )
        # Always check stop_reason before trusting the content.
        if resp.stop_reason == "refusal":
            category = getattr(getattr(resp, "stop_details", None), "category", None)
            completion.error = f"Model declined the request (refusal{f': {category}' if category else ''})."
        elif resp.stop_reason == "max_tokens":
            completion.error = "Output was cut off at the max token limit."
        return completion
