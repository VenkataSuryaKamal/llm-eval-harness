"""OpenAI GPT models, plus any OpenAI-compatible API, through the official OpenAI SDK.

The same class serves OpenAI, Google Gemini, Groq, OpenRouter and a local Ollama:
they all accept the OpenAI chat-completions request format at their own base URL.
"""
import time

import openai

from .base import Completion, ModelInfo, Provider, ProviderError


class OpenAIProvider(Provider):
    def __init__(self, api_key: str, timeout: float, name: str = "openai", base_url: str | None = None,
                 label: str = "OpenAI"):
        self.name, self.label = name, label
        self.client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url, timeout=timeout, max_retries=4)

    async def complete(self, model: ModelInfo, system: str, user: str, max_tokens: int,
                       json_schema: dict | None = None) -> Completion:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": user})
        kwargs: dict = {"model": model.id, "messages": messages, "max_completion_tokens": max_tokens}
        if json_schema and model.structured_output:
            kwargs["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "verdict", "schema": json_schema, "strict": True},
            }

        start = time.perf_counter()
        try:
            resp = await self.client.chat.completions.create(**kwargs)
        except openai.AuthenticationError as e:
            raise ProviderError(f"{self.label} rejected the API key (401).") from e
        except openai.PermissionDeniedError as e:
            raise ProviderError(f"{self.label} API key lacks access to this model (403).") from e
        except openai.NotFoundError as e:
            raise ProviderError(f"Model '{model.id}' was not found on {self.label} (404).") from e
        except openai.RateLimitError as e:
            raise ProviderError(f"{self.label} rate limit or free-tier quota hit (429) after retries. "
                                "Lower CONCURRENCY or wait.") from e
        except openai.BadRequestError as e:
            raise ProviderError(f"{self.label} rejected the request (400): {str(e.message)[:300]}") from e
        except openai.APIStatusError as e:
            raise ProviderError(f"{self.label} API error ({e.status_code}).") from e
        except openai.APIConnectionError as e:
            raise ProviderError(f"Could not reach the {self.label} API (network, timeout, or server not running).") from e
        latency_ms = int((time.perf_counter() - start) * 1000)

        if not resp.choices:
            raise ProviderError(f"{self.label} returned no answer.")
        choice = resp.choices[0]
        completion = Completion(
            text=(choice.message.content or "").strip(),
            input_tokens=resp.usage.prompt_tokens if resp.usage else 0,
            output_tokens=resp.usage.completion_tokens if resp.usage else 0,
            latency_ms=latency_ms,
        )
        if getattr(choice.message, "refusal", None):
            completion.error = "Model declined the request (refusal)."
        elif choice.finish_reason == "length":
            completion.error = "Output was cut off at the max token limit."
        return completion
