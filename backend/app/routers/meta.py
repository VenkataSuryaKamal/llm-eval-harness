from fastapi import APIRouter

from ..config import get_settings
from ..providers.registry import available_models, configured_providers, default_judge
from ..schemas import ModelOut

router = APIRouter(tags=["meta"])


@router.get("/models", response_model=list[ModelOut])
def list_models():
    return [ModelOut(**m.__dict__) for m in available_models()]


@router.get("/config")
def public_config() -> dict:
    """Non-secret settings the UI needs. Never include keys here."""
    s = get_settings()
    judge = default_judge()
    return {
        "judge_model": judge.id if judge else None,
        "judge_options": [m.id for m in available_models(include_judge_only=True)],
        "providers": configured_providers(),
        "demo_mode": s.demo_mode,
        "max_models_per_run": s.max_models_per_run,
        "max_calls_per_run": s.max_calls_per_run,
        "max_cases_per_dataset": s.max_cases_per_dataset,
        "max_upload_bytes": s.max_upload_bytes,
    }
