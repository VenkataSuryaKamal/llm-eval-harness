"""Deterministic offline models, so the app (and the tests) run with zero API keys.

- mock-good:   follows a "summarize / one sentence" instruction by returning the
               first sentence of the input; without that instruction it rambles.
               So editing the prompt really changes its scores (great for demos).
- mock-sloppy: rambles, shouts, and ignores instructions on some inputs. Usually "wrong".
- mock-judge:  scores by key-word overlap with the expected answer, penalising
               answers far longer than expected (or by brevity if no expected answer).
"""
import asyncio
import hashlib
import json
import re

from .base import Completion, ModelInfo, Provider

_WORD = re.compile(r"[a-z0-9']+")
_STOP = {"the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "is", "it", "i", "my", "me",
         "was", "with", "that", "this", "but", "not", "be", "are", "they", "their", "has", "have",
         "customer", "customer's", "wants", "want", "every", "time", "when", "after", "its", "please"}


def _words(text: str) -> set[str]:
    return {w for w in _WORD.findall(text.lower()) if w not in _STOP}


def _stable_int(text: str) -> int:
    return int(hashlib.sha256(text.encode()).hexdigest()[:8], 16)


def _extract(tag: str, text: str) -> str:
    m = re.search(rf"<{tag}>\n?(.*?)\n?</{tag}>", text, re.S)
    return m.group(1).strip() if m else ""


class MockProvider(Provider):
    name = "mock"

    async def complete(self, model: ModelInfo, system: str, user: str, max_tokens: int,
                       json_schema: dict | None = None) -> Completion:
        seed = _stable_int(model.id + user)
        await asyncio.sleep(0.01 + (seed % 40) / 1000)  # pretend network latency
        latency_ms = 40 + seed % 400

        if model.id == "mock-judge":
            text = self._judge(user)
        elif model.id == "mock-sloppy":
            text = self._sloppy(user, seed)
        else:
            text = self._good(user) if re.search(r"summar|one sentence", user, re.I) else self._ramble(user)

        return Completion(
            text=text,
            input_tokens=max(1, len(user) // 4),
            output_tokens=max(1, len(text) // 4),
            latency_ms=latency_ms,
        )

    @staticmethod
    def _good(prompt: str) -> str:
        body = prompt.strip().splitlines()[-1] if prompt.strip() else ""
        first = re.split(r"(?<=[.!?])\s", body, maxsplit=1)[0]
        return first[:200]

    @staticmethod
    def _ramble(prompt: str) -> str:
        body = prompt.strip().splitlines()[-1] if prompt.strip() else ""
        return f"Thank you for reaching out! We hear you. {body} We value your feedback and will look into it."

    @staticmethod
    def _sloppy(prompt: str, seed: int) -> str:
        if seed % 3 == 0:
            return "Sure! Here is a very long answer that does not really address the task at all."
        return MockProvider._good(prompt).upper() + " ALSO, MANY OTHER THINGS HAPPENED."

    @staticmethod
    def _judge(prompt: str) -> str:
        output = _extract("candidate_output", prompt)
        expected = _extract("expected_output", prompt)
        if not output:
            score, why = 1, "The output is empty."
        elif expected:
            exp = _words(expected)
            overlap = len(_words(output) & exp) / max(1, len(exp))
            score = max(1, min(10, round(overlap * 16)))
            why = f"About {round(overlap * 100)}% of the expected answer's key words appear in the output."
            if len(output) > 2 * len(expected):
                score, why = max(1, score - 4), why + " It is much longer than needed."
        else:
            score = 8 if len(output) <= 200 else 4
            why = "Output is concise." if score == 8 else "Output is long and unfocused."
        if output.isupper() and len(output) > 20:
            score, why = max(1, score - 3), why + " It is written in all caps."
        return json.dumps({"score": score, "reasoning": why})
