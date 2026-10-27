"""Quick test: one prompt (and optionally one input) on several models, graded on the spot.

Nothing is saved. To keep results and track regressions, turn it into a dataset run.
"""
import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from ..config import get_settings
from ..judge import judge
from ..providers.base import ModelInfo, ProviderError
from ..providers.registry import complete, default_judge, get_model
from ..security import playground_rate_limit
from ..templating import render

log = logging.getLogger(__name__)
router = APIRouter(prefix="/playground", tags=["playground"])


class PlaygroundRequest(BaseModel):
    prompt: str = Field(min_length=1)
    input: str = ""
    system_prompt: str = ""
    expected: str = ""
    models: list[str] = Field(min_length=1)
    judge: bool = True
    judge_model: str | None = None
    judge_criteria: str = Field(default="", max_length=4000)

    @field_validator("prompt", "system_prompt")
    @classmethod
    def _limit_prompt(cls, v: str) -> str:
        if len(v) > get_settings().max_prompt_chars:
            raise ValueError(f"must be at most {get_settings().max_prompt_chars} characters")
        return v

    @field_validator("input", "expected")
    @classmethod
    def _limit_field(cls, v: str) -> str:
        if len(v) > get_settings().max_field_chars:
            raise ValueError(f"must be at most {get_settings().max_field_chars} characters")
        return v

    @field_validator("models")
    @classmethod
    def _limit_models(cls, v: list[str]) -> list[str]:
        v = list(dict.fromkeys(v))
        if len(v) > get_settings().max_models_per_run:
            raise ValueError(f"pick at most {get_settings().max_models_per_run} models")
        return v


class PlaygroundResult(BaseModel):
    model: str
    label: str
    provider: str
    free_tier: bool
    output: str = ""
    error: str | None = None
    latency_ms: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    score: int | None = None
    judge_reasoning: str = ""
    judge_cost_usd: float = 0.0


class PlaygroundResponse(BaseModel):
    rendered_prompt: str
    judge_model: str | None
    results: list[PlaygroundResult]


@router.post("", response_model=PlaygroundResponse, dependencies=[Depends(playground_rate_limit)])
async def quick_test(body: PlaygroundRequest):
    s = get_settings()
    models: list[ModelInfo] = []
    for model_id in body.models:
        m = get_model(model_id)
        if m is None or m.judge_only:
            raise HTTPException(422, f"Unknown or unavailable model: {model_id}")
        models.append(m)

    judge_model = None
    if body.judge:
        judge_model = get_model(body.judge_model) if body.judge_model else default_judge()
        if judge_model is None:
            raise HTTPException(422, "No judge model is available. Turn grading off or configure a provider.")

    prompt = render(body.prompt, {"input": body.input, "expected": body.expected})

    async def one(m: ModelInfo) -> PlaygroundResult:
        r = PlaygroundResult(model=m.id, label=m.label, provider=m.provider, free_tier=m.free_tier)
        try:
            c = await complete(m, body.system_prompt, prompt, s.max_output_tokens)
            r.output, r.error = c.text, c.error
            r.latency_ms, r.input_tokens, r.output_tokens = c.latency_ms, c.input_tokens, c.output_tokens
            r.cost_usd = m.cost(c.input_tokens, c.output_tokens)
        except ProviderError as e:
            r.error = str(e)
        except Exception:
            log.exception("Unexpected error calling %s", m.id)
            r.error = "Unexpected error while calling the model."
        if judge_model is not None and r.output:
            v = await judge(judge_model, body.prompt, body.input or "(no separate input)", r.output,
                            body.expected or None, body.judge_criteria)
            r.score, r.judge_reasoning, r.judge_cost_usd = v.score, v.reasoning, v.cost_usd
        return r

    results = await asyncio.gather(*(one(m) for m in models))
    return PlaygroundResponse(rendered_prompt=prompt, judge_model=judge_model.id if judge_model else None,
                              results=list(results))
