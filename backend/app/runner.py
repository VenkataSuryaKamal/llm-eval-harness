"""Execute a run: every test case x every model, then grade each output."""
import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from .config import get_settings
from .db import SessionLocal
from .judge import judge
from .models import Result, Run, TestCase
from .providers.base import ProviderError
from .providers.registry import complete, default_judge, get_model
from .templating import render

log = logging.getLogger(__name__)


async def _one(run: Run, case: TestCase, model_id: str, sem: asyncio.Semaphore) -> Result:
    s = get_settings()
    model = get_model(model_id)
    judge_model = get_model(run.judge_model) or default_judge()
    variables = {**case.variables, "input": case.input, "expected": case.expected or ""}
    prompt = render(run.prompt_template, variables)
    result = Result(run_id=run.id, case_id=case.id, model=model_id)

    async with sem:
        if model is None:
            result.error = "Model is no longer available (provider key removed?)."
        else:
            try:
                c = await complete(model, run.system_prompt, prompt, s.max_output_tokens)
                result.output, result.error = c.text, c.error
                result.latency_ms, result.input_tokens, result.output_tokens = c.latency_ms, c.input_tokens, c.output_tokens
                result.cost_usd = model.cost(c.input_tokens, c.output_tokens)
            except ProviderError as e:
                result.error = str(e)
            except Exception:  # never let one bad call kill the run
                log.exception("Unexpected error calling %s", model_id)
                result.error = "Unexpected error while calling the model."

        if judge_model is None:
            result.score, result.judge_reasoning = None, "No judge model available."
        elif result.error and not result.output:
            result.score, result.judge_reasoning = None, "Not graded: the model call failed."
        else:
            v = await judge(judge_model, run.prompt_template, case.input, result.output,
                            case.expected, run.judge_criteria)
            result.score, result.judge_reasoning, result.judge_cost_usd = v.score, v.reasoning, v.cost_usd
        result.passed = result.score is not None and result.score >= run.pass_threshold and not result.error
    return result


async def execute_run(run_id: int) -> None:
    s = get_settings()
    with SessionLocal() as db:
        run = db.get(Run, run_id)
        if run is None:
            return
        run.status = "running"
        db.commit()
        cases = list(db.scalars(select(TestCase).where(TestCase.dataset_id == run.dataset_id)
                                .order_by(TestCase.position)))
        db.expunge_all()

    sem = asyncio.Semaphore(s.concurrency)
    tasks = [asyncio.create_task(_one(run, c, m, sem)) for c in cases for m in run.models]
    try:
        for fut in asyncio.as_completed(tasks):
            result = await fut
            with SessionLocal() as db:
                db.add(result)
                db_run = db.get(Run, run_id)
                db_run.completed_calls += 1
                db.commit()
        status, error = "completed", None
    except Exception as e:  # pragma: no cover - defensive
        log.exception("Run %s failed", run_id)
        status, error = "failed", f"Run failed: {type(e).__name__}"
        for t in tasks:
            t.cancel()

    with SessionLocal() as db:
        db_run = db.get(Run, run_id)
        db_run.status, db_run.error = status, error
        db_run.finished_at = datetime.now(timezone.utc)
        db.commit()


def recover_interrupted_runs() -> None:
    """Runs left 'running' by a crash/restart are marked failed on startup."""
    with SessionLocal() as db:
        for run in db.scalars(select(Run).where(Run.status.in_(["queued", "running"]))):
            run.status, run.error = "failed", "Server restarted before the run finished. Re-run it."
        db.commit()
