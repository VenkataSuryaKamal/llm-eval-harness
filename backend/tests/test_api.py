def _run(client, dataset_id, prompt, models=("mock-good", "mock-sloppy"), **extra):
    r = client.post("/api/runs", json={"dataset_id": dataset_id, "prompt_template": prompt,
                                       "models": list(models), **extra})
    assert r.status_code == 201, r.text
    return client.get(f"/api/runs/{r.json()['id']}").json()


def test_health_and_models(client):
    assert client.get("/health").json() == {"status": "ok"}
    ids = {m["id"] for m in client.get("/api/models").json()}
    assert {"mock-good", "mock-sloppy"} <= ids
    assert "mock-judge" not in ids            # judge-only models can't be run as candidates
    assert not any(i.startswith("claude") or i.startswith("gpt") for i in ids)  # no keys -> hidden


def test_full_run_scores_every_case_and_model(client, dataset_id):
    run = _run(client, dataset_id, "Summarize this complaint in one sentence:\n{{input}}")
    assert run["status"] == "completed"
    assert run["completed_calls"] == run["total_calls"] == 6
    assert len(run["results"]) == 6
    summary = run["summary"]
    assert summary["mock-good"]["avg_score"] > summary["mock-sloppy"]["avg_score"]
    for r in run["results"]:
        assert 1 <= r["score"] <= 10 and r["judge_reasoning"]


def test_regression_report(client, dataset_id):
    first = _run(client, dataset_id, "Summarize:\n{{input}}", models=("mock-good",))
    second = _run(client, dataset_id, "Reply with nothing useful. {{missing}}", models=("mock-good",))
    assert second["previous_run_id"] == first["id"]
    report = client.get(f"/api/runs/{second['id']}/compare").json()
    t = report["totals"]
    assert sum(t.values()) == 3
    assert report["headline"].startswith("Your change made")
    assert {row["change"] for row in report["rows"]} <= {"improved", "regressed", "still_passing", "still_failing"}


def test_compare_explicit_base_and_mismatched_dataset(client, dataset_id):
    a = _run(client, dataset_id, "{{input}}", models=("mock-good",))
    other = client.post("/api/datasets", data={"pasted": "hello\nworld"}).json()["id"]
    b = _run(client, other, "{{input}}", models=("mock-good",))
    r = client.get(f"/api/runs/{b['id']}/compare", params={"base": a["id"]})
    assert r.status_code == 422


def test_rejects_unknown_model(client, dataset_id):
    r = client.post("/api/runs", json={"dataset_id": dataset_id, "prompt_template": "x",
                                       "models": ["evil-model"]})
    assert r.status_code == 422
    r = client.post("/api/runs", json={"dataset_id": dataset_id, "prompt_template": "x",
                                       "models": ["mock-judge"]})
    assert r.status_code == 422


def test_export_csv_neutralises_formulas(client):
    ds = client.post("/api/datasets", data={"pasted": "=HYPERLINK(\"http://evil\")"}).json()["id"]
    run = _run(client, ds, "{{input}}", models=("mock-good",))
    body = client.get(f"/api/runs/{run['id']}/export.csv").text
    assert "'=HYPERLINK" in body
    assert "\n1,=HYPERLINK" not in body


def test_security_headers(client):
    h = client.get("/api/models").headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"


def test_api_key_enforced(client, monkeypatch):
    from pydantic import SecretStr

    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "app_api_key", SecretStr("s3cret"))
    assert client.get("/api/models").status_code == 401
    assert client.get("/api/models", headers={"X-API-Key": "wrong"}).status_code == 401
    assert client.get("/api/models", headers={"X-API-Key": "s3cret"}).status_code == 200
    assert client.get("/health").status_code == 200


def test_rate_limit(client, dataset_id, monkeypatch):
    from app.config import get_settings
    from app.security import rate_limit
    rate_limit.hits.clear()
    monkeypatch.setattr(get_settings(), "rate_limit_per_minute", 1)
    body = {"dataset_id": dataset_id, "prompt_template": "{{input}}", "models": ["mock-good"]}
    assert client.post("/api/runs", json=body).status_code == 201
    assert client.post("/api/runs", json=body).status_code == 429
    rate_limit.hits.clear()


def test_rejects_oversized_body(client):
    r = client.post("/api/datasets", content=b"x" * 3_000_000,
                    headers={"content-type": "application/octet-stream"})
    assert r.status_code == 413


def test_upload_validation_errors_are_422(client):
    r = client.post("/api/datasets", files={"file": ("evil.exe", b"MZ", "application/octet-stream")})
    assert r.status_code == 422
    r = client.post("/api/datasets", data={"pasted": "   "})
    assert r.status_code == 422


def test_delete_dataset_blocked_while_running(client, dataset_id):
    from app.db import SessionLocal
    from app.models import Run
    with SessionLocal() as db:
        db.add(Run(dataset_id=dataset_id, prompt_template="x", models=["mock-good"],
                   judge_model="mock-judge", status="running"))
        db.commit()
    assert client.delete(f"/api/datasets/{dataset_id}").status_code == 409


def test_secrets_never_exposed(client):
    text = client.get("/api/config").text + client.get("/api/models").text
    assert "api_key" not in text.lower() and "sk-" not in text


def test_outages_are_not_graded_and_not_regressions(client, dataset_id, monkeypatch):
    """A judge or provider outage must not show up as a broken case."""
    from app import judge as judge_mod
    from app.providers.base import ProviderError

    first = _run(client, dataset_id, "Summarize:\n{{input}}", models=("mock-good",))

    async def broken(*args, **kwargs):
        raise ProviderError("Google Gemini API error (503).")

    calls = []

    async def counted(*args, **kwargs):
        calls.append(1)
        return await broken()

    monkeypatch.setattr(judge_mod, "complete", counted)
    monkeypatch.setattr(judge_mod, "RETRY_DELAY_SECONDS", 0)
    second = _run(client, dataset_id, "Summarize:\n{{input}}", models=("mock-good",))
    assert all(r["score"] is None and not r["passed"] for r in second["results"])
    assert all(r["judge_reasoning"].startswith("Not graded") for r in second["results"])
    assert second["summary"]["mock-good"]["ungraded"] == 3
    assert len(calls) == 3 * judge_mod.JUDGE_ATTEMPTS  # each grade was retried
    report = client.get(f"/api/runs/{second['id']}/compare", params={"base": first["id"]}).json()
    assert report["skipped"] == 3 and report["totals"]["regressed"] == 0
    assert "could not be compared" in report["headline"]
