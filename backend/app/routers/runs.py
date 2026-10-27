import csv
import io

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import Dataset, Result, Run, TestCase
from ..providers.registry import default_judge, get_model
from ..regression import compare, previous_run, summarize
from ..runner import execute_run
from ..schemas import CaseOut, ResultOut, RunCreate, RunDetail, RunOut
from ..security import csv_safe, rate_limit

router = APIRouter(prefix="/runs", tags=["runs"])


def _get_run(db: Session, run_id: int) -> Run:
    run = db.get(Run, run_id)
    if run is None:
        raise HTTPException(404, "Run not found.")
    return run


@router.post("", response_model=RunOut, status_code=201, dependencies=[Depends(rate_limit)])
def create_run(body: RunCreate, background: BackgroundTasks, db: Session = Depends(get_db)):
    s = get_settings()
    dataset = db.get(Dataset, body.dataset_id)
    if dataset is None:
        raise HTTPException(404, "Dataset not found.")

    # Allow-list: only models from the catalog whose provider is configured.
    unknown = [m for m in body.models if get_model(m) is None or get_model(m).judge_only]
    if unknown:
        raise HTTPException(422, f"Unknown or unavailable model(s): {', '.join(unknown)}")
    if body.judge_model:
        if get_model(body.judge_model) is None:
            raise HTTPException(422, f"Judge model '{body.judge_model}' is not available.")
        judge_id = body.judge_model
    else:
        judge = default_judge()
        if judge is None:
            raise HTTPException(422, "No judge model is available. Configure an API key or enable mock models.")
        judge_id = judge.id

    n_cases = db.scalar(select(func.count(TestCase.id)).where(TestCase.dataset_id == dataset.id)) or 0
    total = n_cases * len(body.models)
    if total > s.max_calls_per_run:
        raise HTTPException(422, f"This run needs {total} model calls; the limit is {s.max_calls_per_run}.")

    run = Run(dataset_id=dataset.id, label=body.label, prompt_template=body.prompt_template,
              system_prompt=body.system_prompt, models=body.models, judge_model=judge_id,
              judge_criteria=body.judge_criteria, pass_threshold=body.pass_threshold,
              status="queued", total_calls=total)
    db.add(run)
    db.commit()
    db.refresh(run)
    background.add_task(execute_run, run.id)
    return run


@router.get("", response_model=list[RunOut])
def list_runs(dataset_id: int | None = None, limit: int = Query(default=50, le=200),
              db: Session = Depends(get_db)):
    q = select(Run).order_by(Run.id.desc()).limit(limit)
    if dataset_id is not None:
        q = q.where(Run.dataset_id == dataset_id)
    return list(db.scalars(q))


@router.get("/{run_id}", response_model=RunDetail)
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = _get_run(db, run_id)
    results = list(db.scalars(select(Result).where(Result.run_id == run.id)))
    cases = list(db.scalars(select(TestCase).where(TestCase.dataset_id == run.dataset_id).order_by(TestCase.position)))
    prev = previous_run(db, run)
    return RunDetail(
        **RunOut.model_validate(run).model_dump(),
        summary=summarize(results),
        results=[ResultOut.model_validate(r) for r in results],
        cases=[CaseOut.model_validate(c) for c in cases],
        previous_run_id=prev.id if prev else None,
    )


@router.get("/{run_id}/compare")
def compare_runs(run_id: int, base: int | None = None, db: Session = Depends(get_db)):
    """Regression report. `base` defaults to the previous completed run on the same dataset."""
    head = _get_run(db, run_id)
    base_run = _get_run(db, base) if base is not None else previous_run(db, head)
    if base_run is None:
        raise HTTPException(404, "No earlier completed run on this dataset to compare with.")
    try:
        return compare(db, base_run, head)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


@router.get("/{run_id}/export.csv")
def export_csv(run_id: int, db: Session = Depends(get_db)):
    run = _get_run(db, run_id)
    rows = db.execute(select(Result, TestCase).join(TestCase, Result.case_id == TestCase.id)
                      .where(Result.run_id == run.id).order_by(TestCase.position, Result.model)).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["case", "input", "expected", "model", "output", "score", "passed",
                "judge_reasoning", "latency_ms", "input_tokens", "output_tokens", "cost_usd", "error"])
    for r, c in rows:
        w.writerow([c.position, *map(csv_safe, [c.input, c.expected, r.model, r.output]), r.score, r.passed,
                    csv_safe(r.judge_reasoning), r.latency_ms, r.input_tokens, r.output_tokens,
                    f"{r.cost_usd:.6f}", csv_safe(r.error)])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="run-{run.id}.csv"'})


@router.delete("/{run_id}", status_code=204)
def delete_run(run_id: int, db: Session = Depends(get_db)):
    run = _get_run(db, run_id)
    if run.status in ("queued", "running"):
        raise HTTPException(409, "Wait for the run to finish before deleting it.")
    db.delete(run)
    db.commit()
