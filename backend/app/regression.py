"""Regression tracking: what changed between two runs of the same dataset?"""
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Result, Run, TestCase


def summarize(results: list[Result]) -> dict[str, dict]:
    """Per-model report card."""
    by_model: dict[str, list[Result]] = defaultdict(list)
    for r in results:
        by_model[r.model].append(r)
    out = {}
    for model, rs in by_model.items():
        scored = [r.score for r in rs if r.score is not None]
        n = len(rs)
        out[model] = {
            "model": model,
            "cases": n,
            "passed": sum(r.passed for r in rs),
            "pass_rate": round(sum(r.passed for r in rs) / n, 4) if n else 0,
            "avg_score": round(sum(scored) / len(scored), 2) if scored else None,
            "avg_latency_ms": round(sum(r.latency_ms for r in rs) / n) if n else 0,
            "p95_latency_ms": sorted(r.latency_ms for r in rs)[max(0, int(n * 0.95) - 1)] if n else 0,
            "total_cost_usd": round(sum(r.cost_usd for r in rs), 6),
            "judge_cost_usd": round(sum(r.judge_cost_usd for r in rs), 6),
            "errors": sum(1 for r in rs if r.error),
            "ungraded": sum(1 for r in rs if r.score is None),
        }
    return out


def previous_run(db: Session, run: Run) -> Run | None:
    """Most recent completed run on the same dataset before this one."""
    return db.scalars(
        select(Run).where(Run.dataset_id == run.dataset_id, Run.id < run.id, Run.status == "completed")
        .order_by(Run.id.desc()).limit(1)
    ).first()


def _answers(n: int) -> str:
    return "answer" if n == 1 else "answers"


def compare(db: Session, base: Run, head: Run) -> dict:
    if base.dataset_id != head.dataset_id:
        raise ValueError("Runs use different datasets, so their cases cannot be matched.")

    def index(run: Run) -> dict[tuple[int, str], Result]:
        return {(r.case_id, r.model): r for r in db.scalars(select(Result).where(Result.run_id == run.id))}

    a, b = index(base), index(head)
    cases = {c.id: c for c in db.scalars(select(TestCase).where(TestCase.dataset_id == head.dataset_id))}
    rows, counts = [], defaultdict(lambda: {"improved": 0, "regressed": 0, "still_passing": 0,
                                            "still_failing": 0, "score_up": 0, "score_down": 0})
    skipped = 0
    for key in sorted(set(a) & set(b)):
        ra, rb = a[key], b[key]
        if ra.score is None or rb.score is None:
            skipped += 1  # a provider or judge outage, not a change caused by the prompt
            continue
        if ra.passed and not rb.passed:
            change = "regressed"
        elif not ra.passed and rb.passed:
            change = "improved"
        else:
            change = "still_passing" if rb.passed else "still_failing"
        delta = (rb.score or 0) - (ra.score or 0)
        c = counts[key[1]]
        c[change] += 1
        c["score_up"] += delta > 0
        c["score_down"] += delta < 0
        case = cases.get(key[0])
        rows.append({
            "case_id": key[0], "position": case.position if case else None,
            "input": case.input if case else "", "model": key[1], "change": change,
            "base_score": ra.score, "head_score": rb.score, "score_delta": delta,
            "base_output": ra.output, "head_output": rb.output,
            "base_reasoning": ra.judge_reasoning, "head_reasoning": rb.judge_reasoning,
        })
    totals = {k: sum(c[k] for c in counts.values()) for k in
              ("improved", "regressed", "still_passing", "still_failing")}
    return {
        "base_run_id": base.id, "head_run_id": head.id,
        "models_compared": sorted(counts),
        "totals": totals, "per_model": dict(counts), "skipped": skipped,
        "headline": (f"Your change made {totals['improved']} {_answers(totals['improved'])} better "
                     f"and {totals['regressed']} worse.")
                    + (f" {skipped} {_answers(skipped)} could not be compared because an AI call failed." if skipped else ""),
        "rows": rows,
    }
