def test_quick_test_compares_models_and_grades(client):
    r = client.post("/api/playground", json={
        "prompt": "Summarize this complaint in one sentence:\n{{input}}",
        "input": "My order arrived broken. I want a refund.",
        "expected": "Customer wants a refund for a broken order.",
        "models": ["mock-good", "mock-sloppy"],
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["judge_model"] == "mock-judge"
    assert "My order arrived broken" in body["rendered_prompt"]
    by_model = {x["model"]: x for x in body["results"]}
    assert set(by_model) == {"mock-good", "mock-sloppy"}
    assert by_model["mock-good"]["score"] > by_model["mock-sloppy"]["score"]
    assert all(x["judge_reasoning"] and x["latency_ms"] > 0 for x in body["results"])


def test_quick_test_without_input_and_without_grading(client):
    r = client.post("/api/playground", json={"prompt": "Explain what an API is in one sentence.",
                                             "models": ["mock-good"], "judge": False})
    assert r.status_code == 200, r.text
    result = r.json()["results"][0]
    assert r.json()["judge_model"] is None and result["score"] is None and result["output"]


def test_quick_test_validation(client):
    base = {"prompt": "hi", "models": ["mock-good"]}
    assert client.post("/api/playground", json={**base, "models": ["nope"]}).status_code == 422
    assert client.post("/api/playground", json={**base, "models": ["mock-judge"]}).status_code == 422
    assert client.post("/api/playground", json={**base, "judge_model": "nope"}).status_code == 422
    assert client.post("/api/playground", json={**base, "prompt": ""}).status_code == 422
    assert client.post("/api/playground", json={**base, "input": "x" * 30_000}).status_code == 422


def test_quick_test_has_its_own_rate_limit(client, monkeypatch):
    from app.config import get_settings
    from app.security import playground_rate_limit
    playground_rate_limit.hits.clear()
    monkeypatch.setattr(get_settings(), "playground_rate_limit_per_minute", 1)
    body = {"prompt": "hi", "models": ["mock-good"], "judge": False}
    assert client.post("/api/playground", json=body).status_code == 200
    r = client.post("/api/playground", json=body)
    assert r.status_code == 429 and "quick tests" in r.json()["detail"]
    playground_rate_limit.hits.clear()
