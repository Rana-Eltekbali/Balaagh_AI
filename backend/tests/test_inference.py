import asyncio
from types import SimpleNamespace

import httpx
import pytest

from app.config import Settings
from app.ml.category import normalize_category, validate_labels
from app.ml.location import primary_location, reconstruct_bio
from app.ml.priority import normalize_priority
from app.schemas.reports import IncidentClass
from app.services.analysis_receipt import AnalysisReceipt
from app.services.inference import InferenceService, people_at_risk
from app.services.summary_service import SummaryService


@pytest.mark.parametrize(
    "label, expected",
    [("Fire/Explosion", "Fire / Explosion"), (" Road/Transportation ", "Road / Transportation")],
)
def test_category_labels(label, expected):
    assert normalize_category(label) == expected


def test_unknown_category_and_incomplete_maps_rejected():
    with pytest.raises(ValueError):
        normalize_category("LABEL_0")
    with pytest.raises(ValueError):
        validate_labels({0: "Other"}, normalize_category, set(IncidentClass))


@pytest.mark.parametrize(
    "label, expected", [("critical", "Critical"), (" HIGH ", "High"), ("Low", "Low")]
)
def test_priority_labels(label, expected):
    assert normalize_priority(label) == expected


def test_unknown_priority_rejected():
    with pytest.raises(ValueError):
        normalize_priority("urgent")


@pytest.mark.parametrize("category", list(IncidentClass))
def test_people_at_risk_initial_rule(category):
    assert people_at_risk(category) is (category == IncidentClass.MEDICAL)


def test_bio_reconstruction_and_primary_ties():
    text = "سوق الجمعة ثم طرابلس"
    entities = reconstruct_bio(
        text,
        [(0, 3, "B-LOC", 0.8), (4, 10, "I-LOC", 1.0), (11, 13, "O", 0.9), (14, 20, "B-LOC", 0.9)],
    )
    assert [e.name for e in entities] == ["سوق الجمعة", "طرابلس"]
    assert entities[0].confidence == 0.9
    assert primary_location(entities).name == "سوق الجمعة"
    assert primary_location([]) is None
    assert reconstruct_bio("طرابلس", [(0, 6, "I-LOC", 0.8)])[0].name == "طرابلس"


@pytest.mark.parametrize("failure", ["timeout", "server", "empty", "malformed"])
async def test_llm_failure_fallback(failure):
    def respond(request):
        if failure == "timeout":
            raise httpx.ReadTimeout("unavailable")
        if failure == "server":
            return httpx.Response(500)
        return httpx.Response(
            200, json={"choices": [{"message": {"content": ""}}]} if failure == "empty" else {}
        )

    settings = Settings(
        _env_file=None,
        llm_enabled=True,
        llm_api_key="secret",
        llm_model="configured-model",
        llm_base_url="https://provider.invalid/v1",
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        service = SummaryService(settings, client)
        assert await service.summarize("بلاغ أصلي", "Other", "Low", "") == ("بلاغ أصلي", "fallback")
        models = SimpleNamespace(
            category=SimpleNamespace(predict=lambda _: ("Other", 0.7)),
            priority=SimpleNamespace(predict=lambda _: ("Low", 0.8)),
            location=SimpleNamespace(predict=lambda _: []),
        )
        inference = InferenceService(models, service, AnalysisReceipt("key", 3600), settings)
        result = await inference.analyze("بلاغ أصلي")
        assert result.summary == "بلاغ أصلي" and result.location == ""


async def test_llm_success_and_model_fields_unchanged():
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda _: httpx.Response(200, json={"choices": [{"message": {"content": "ملخص موجز"}}]})
        )
    ) as client:
        settings = Settings(
            _env_file=None,
            llm_enabled=True,
            llm_api_key="secret",
            llm_model="model",
            llm_base_url="https://provider.invalid/v1",
        )
        assert await SummaryService(settings, client).summarize(
            "النص الأصلي", "Other", "Low", ""
        ) == ("ملخص موجز", "llm")


async def test_inference_serializes_workers():
    import threading
    import time

    active = 0
    peak = 0
    lock = threading.Lock()

    def category(_):
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
        time.sleep(0.02)
        with lock:
            active -= 1
        return "Other", 0.7

    models = SimpleNamespace(
        category=SimpleNamespace(predict=category),
        priority=SimpleNamespace(predict=lambda _: ("Low", 0.8)),
        location=SimpleNamespace(predict=lambda _: []),
    )
    settings = Settings(_env_file=None)
    async with httpx.AsyncClient() as client:
        inference = InferenceService(
            models, SummaryService(settings, client), AnalysisReceipt("key", 3600), settings
        )
        await asyncio.gather(*(inference.analyze("نص بلاغ تجريبي") for _ in range(4)))
    assert peak == 1
