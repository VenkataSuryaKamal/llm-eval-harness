"""Free-tier providers, tested against a local fake OpenAI-compatible server (no network, no keys)."""
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
from pydantic import SecretStr

from app.config import get_settings
from app.providers import registry

SEEN: list[dict] = []


class FakeOpenAI(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["content-length"])))
        SEEN.append(body)
        system = next((m["content"] for m in body["messages"] if m["role"] == "system"), "")
        text = ('Here you go: {"score": 9, "reasoning": "Clear and correct."}' if "evaluator" in system
                else "Customer wants a refund for a broken order.")
        out = {"id": "c1", "object": "chat.completion", "created": 0, "model": body["model"],
               "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": text}}],
               "usage": {"prompt_tokens": 20, "completion_tokens": 8, "total_tokens": 28}}
        data = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


@pytest.fixture
def fake_ollama(monkeypatch):
    server = HTTPServer(("127.0.0.1", 0), FakeOpenAI)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    s = get_settings()
    monkeypatch.setattr(s, "ollama_base_url", f"http://127.0.0.1:{server.server_port}/v1")
    registry.reset_caches()
    SEEN.clear()
    yield
    server.shutdown()
    monkeypatch.undo()
    registry.reset_caches()


def test_free_providers_hidden_without_keys(client):
    providers = {m["provider"] for m in client.get("/api/models").json()}
    assert providers == {"mock"}


def test_keys_enable_free_providers(client, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "gemini_api_key", SecretStr("g-test"))
    monkeypatch.setattr(s, "groq_api_key", SecretStr("gsk-test"))
    monkeypatch.setattr(s, "openrouter_api_key", SecretStr("or-test"))
    monkeypatch.setattr(s, "judge_model", "claude-opus-5-5")  # the real default; no Anthropic key here
    registry.reset_caches()
    try:
        models = {m["id"]: m for m in client.get("/api/models").json()}
        assert {"gemini-3.8-flash", "openai/gpt-oss-120b", "google/gemma-4-31b-it:free"} <= set(models)
        assert models["gemini-3.8-flash"]["free_tier"] is True
        # With no Claude/OpenAI key, the judge falls back to the first free model in the chain (Groq).
        assert client.get("/api/config").json()["judge_model"] == "openai/gpt-oss-120b"
        assert "sk-" not in client.get("/api/config").text and "gsk-test" not in client.get("/api/config").text
    finally:
        monkeypatch.undo()
        registry.reset_caches()


def test_full_run_on_local_ollama_with_non_structured_judge(client, dataset_id, fake_ollama):
    r = client.post("/api/runs", json={"dataset_id": dataset_id, "prompt_template": "Summarize: {{input}}",
                                       "models": ["llama3.2"], "judge_model": "qwen3:8b"})
    assert r.status_code == 201, r.text
    run = client.get(f"/api/runs/{r.json()['id']}").json()
    assert run["status"] == "completed"
    assert all(res["score"] == 9 and res["passed"] and not res["error"] for res in run["results"])
    assert run["summary"]["llama3.2"]["total_cost_usd"] == 0
    judge_calls = [b for b in SEEN if b["model"] == "qwen3:8b"]
    assert judge_calls and all("response_format" not in b for b in judge_calls)  # no schema for Ollama
    assert any("Output exactly one JSON object" in b["messages"][0]["content"] for b in judge_calls)


def test_unknown_judge_rejected(client, dataset_id):
    r = client.post("/api/runs", json={"dataset_id": dataset_id, "prompt_template": "x",
                                       "models": ["mock-good"], "judge_model": "gpt-9000"})
    assert r.status_code == 422
