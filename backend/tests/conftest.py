import os
import tempfile

# Configure BEFORE the app is imported: isolated DB, mock models only, no real keys.
_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["OPENAI_API_KEY"] = ""
# Ignore whatever the developer has in backend/.env: tests never call real providers.
for _var in ("GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "OLLAMA_BASE_URL", "APP_API_KEY"):
    os.environ[_var] = ""
os.environ["ENABLE_MOCK_MODELS"] = "true"
os.environ["JUDGE_MODEL"] = "mock-judge"
os.environ["RATE_LIMIT_PER_MINUTE"] = "1000"
os.environ["PLAYGROUND_RATE_LIMIT_PER_MINUTE"] = "1000"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def dataset_id(client):
    csv_text = (
        "input,expected\n"
        "My order arrived broken. I want a refund.,Customer wants a refund for a broken order.\n"
        "The app crashes when I log in. Please fix it.,The app crashes at login.\n"
        "I was charged twice this month. That is not okay.,Customer was charged twice.\n"
    )
    r = client.post("/api/datasets", data={"name": "complaints"},
                    files={"file": ("complaints.csv", csv_text, "text/csv")})
    assert r.status_code == 201, r.text
    return r.json()["id"]
