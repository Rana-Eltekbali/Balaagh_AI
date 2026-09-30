from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import create_app
from app.schemas.reports import ExtractedLocation


class FixedModel:
    def __init__(self, value):
        self.value = value

    def predict(self, _text):
        return self.value


@pytest.fixture
def client(tmp_path, monkeypatch):
    database = tmp_path / "reports.sqlite"
    url = f"sqlite+aiosqlite:///{database.as_posix()}"
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("INFERENCE_MODE", "disabled")
    get_settings.cache_clear()
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    command.upgrade(config, "head")
    settings = Settings(
        _env_file=None,
        app_env="test",
        database_url=url,
        inference_mode="disabled",
        llm_enabled=False,
        analysis_signing_key="test-key-with-at-least-32-characters",
    )
    models = SimpleNamespace(
        category=FixedModel(("Fire / Explosion", 0.91)),
        priority=FixedModel(("High", 0.82)),
        location=FixedModel([ExtractedLocation(name="طرابلس", start=8, end=14, confidence=0.94)]),
    )
    app = create_app(settings, models=models)
    with TestClient(app, raise_server_exceptions=False) as test_client:
        test_client.database_path = database
        yield test_client
    get_settings.cache_clear()


@pytest.fixture
def report_input():
    return {
        "originalText": "حريق في طرابلس",
        "incidentClass": "Fire / Explosion",
        "priority": "High",
        "location": "طرابلس",
        "peopleAtRisk": False,
        "requiredSupport": "",
        "summary": "حريق في طرابلس",
    }
