"""Request/response shapes, validated by Pydantic."""
from datetime import datetime, timezone
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator

from .config import get_settings

# SQLite drops timezone info; every timestamp we store is UTC, so re-attach it.
UtcDatetime = Annotated[datetime, AfterValidator(lambda d: d if d.tzinfo else d.replace(tzinfo=timezone.utc))]


class ModelOut(BaseModel):
    id: str
    provider: str
    label: str
    input_per_mtok: float
    output_per_mtok: float
    free_tier: bool = False


class CaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    position: int
    input: str
    expected: str | None
    variables: dict


class DatasetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    created_at: UtcDatetime
    case_count: int = 0


class DatasetDetail(DatasetOut):
    cases: list[CaseOut]


class RunCreate(BaseModel):
    dataset_id: int
    label: str = Field(default="", max_length=200)
    prompt_template: str = Field(min_length=1)
    system_prompt: str = ""
    models: list[str] = Field(min_length=1)
    judge_model: str | None = None
    judge_criteria: str = Field(default="", max_length=4000)
    pass_threshold: int = Field(default=7, ge=1, le=10)

    @field_validator("prompt_template", "system_prompt")
    @classmethod
    def _limit_prompt(cls, v: str) -> str:
        limit = get_settings().max_prompt_chars
        if len(v) > limit:
            raise ValueError(f"must be at most {limit} characters")
        return v

    @field_validator("models")
    @classmethod
    def _dedupe(cls, v: list[str]) -> list[str]:
        v = list(dict.fromkeys(v))
        limit = get_settings().max_models_per_run
        if len(v) > limit:
            raise ValueError(f"pick at most {limit} models")
        return v


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    dataset_id: int
    label: str
    prompt_template: str
    system_prompt: str
    models: list[str]
    judge_model: str
    judge_criteria: str
    pass_threshold: int
    status: str
    error: str | None
    total_calls: int
    completed_calls: int
    created_at: UtcDatetime
    finished_at: UtcDatetime | None


class ResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    case_id: int
    model: str
    output: str
    error: str | None
    latency_ms: int
    input_tokens: int
    output_tokens: int
    cost_usd: float
    score: int | None
    passed: bool
    judge_reasoning: str


class RunDetail(RunOut):
    summary: dict
    results: list[ResultOut]
    cases: list[CaseOut]
    previous_run_id: int | None
