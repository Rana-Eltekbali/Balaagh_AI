import json
import sqlite3

import pytest
from sqlalchemy import select

from app.db.models import ReportRow
from app.schemas.reports import AnalysisMetadata, ExtractedLocation


def test_health(client):
    response = client.get("/api/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["modelsLoaded"] is True
    assert response.headers["x-request-id"]


@pytest.mark.parametrize(
    "text",
    ["", "   ", "نار", "ا" * 5001, None, 12],
    ids=["empty", "whitespace", "short", "long", "null", "number"],
)
def test_analysis_validation(client, text):
    response = client.post("/api/reports/analyze", json={"text": text})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_analysis_save_preserves_metadata_and_corrections(client):
    text = "حريق في طرابلس"
    analysis = client.post("/api/reports/analyze", json={"text": "  " + text + "  "})
    assert analysis.status_code == 200
    result = analysis.json()
    assert result["incidentClass"] == "Fire / Explosion"
    assert result["priority"] == "High"
    assert result["peopleAtRisk"] is False
    assert result["requiredSupport"] == ""
    assert result["summary"] == text
    assert set(result) == {
        "incidentClass",
        "priority",
        "location",
        "peopleAtRisk",
        "requiredSupport",
        "summary",
        "analysisToken",
    }
    saved = client.post("/api/reports", json={"originalText": text, **result})
    assert saved.status_code == 201
    report = saved.json()
    assert report["analysisTime"].endswith("s")
    assert report["createdAt"].endswith("Z")
    assert report["updatedAt"] == report["createdAt"] or report["updatedAt"] >= report["createdAt"]
    corrected = client.patch(
        f"/api/reports/{report['id']}", json={"incidentClass": "Other", "peopleAtRisk": True}
    )
    assert corrected.status_code == 200
    with sqlite3.connect(client.database_path) as db:
        row = db.execute(
            "SELECT incident_class_confidence, priority_confidence, location_confidence, extracted_locations, model_predictions, summary_source, analysis_time_ms FROM reports"
        ).fetchone()
    assert row[:3] == (0.91, 0.82, 0.94)
    assert json.loads(row[3])[0]["name"] == "طرابلس"
    assert json.loads(row[4])["incidentClass"] == "Fire / Explosion"
    assert row[5] == "fallback" and row[6] > 0


def test_receipt_cannot_be_tampered_or_reused_for_other_text(client):
    result = client.post("/api/reports/analyze", json={"text": "حريق في طرابلس"}).json()
    response = client.post("/api/reports", json={"originalText": "حريق في بنغازي", **result})
    assert response.status_code == 422
    result["analysisToken"] += "x"
    assert (
        client.post("/api/reports", json={"originalText": "حريق في طرابلس", **result}).status_code
        == 422
    )


def test_crud_and_edit_history(client, report_input):
    created = client.post("/api/reports", json=report_input)
    assert created.status_code == 201
    original = created.json()
    path = f"/api/reports/{original['id']}"
    assert client.get(path).json() == original
    assert client.get("/api/reports").json() == [original]
    assert client.get("/api/reports/edits").json() == []
    patch = {
        "priority": "Critical",
        "peopleAtRisk": True,
        "requiredSupport": "Medical",
        "location": "بنغازي",
    }
    updated = client.patch(path, json=patch).json()
    assert updated["peopleAtRisk"] is True
    assert updated["originalText"] == original["originalText"]
    assert updated["createdAt"] == original["createdAt"]
    edits = client.get("/api/reports/edits").json()
    assert len(edits) == 4
    risk_edit = next(e for e in edits if e["field"] == "peopleAtRisk")
    assert (risk_edit["before"], risk_edit["after"]) == ("false", "true")
    assert client.patch(path, json=patch).status_code == 200
    assert len(client.get("/api/reports/edits").json()) == 4
    assert client.patch(path, json={"originalText": "تغيير النص"}).status_code == 422
    assert client.patch(path, json={"priority": None}).status_code == 422
    assert client.delete(path).status_code == 204
    assert client.get(path).status_code == 404
    assert client.get("/api/reports/edits").json() == []


@pytest.mark.parametrize("method", ["get", "patch", "delete"])
def test_not_found(client, method):
    kwargs = {"json": {"priority": "High"}} if method == "patch" else {}
    response = getattr(client, method)("/api/reports/999", **kwargs)
    assert response.status_code == 404


def test_aggregations_and_filters(client, report_input):
    for priority, location, risk in [
        ("Low", "طرابلس", False),
        ("Critical", "طرابلس", True),
        ("High", "بنغازي", True),
    ]:
        assert (
            client.post(
                "/api/reports",
                json={
                    **report_input,
                    "priority": priority,
                    "location": location,
                    "peopleAtRisk": risk,
                },
            ).status_code
            == 201
        )
    data = client.get("/api/dashboard/summary").json()
    assert (
        data["totalReports"],
        data["criticalReports"],
        data["highPriority"],
        data["reportsToday"],
    ) == (3, 1, 1, 3)
    assert [r["id"] for r in data["recentReports"]] == [3, 2, 1]
    locations = client.get("/api/locations/summary").json()["locations"]
    assert locations[0] == {
        "location": "طرابلس",
        "reports": 2,
        "criticalReports": 1,
        "peopleAtRisk": 1,
    }
    analytics = client.get("/api/analytics/summary").json()
    assert analytics["peopleAtRisk"] == 2
    assert analytics["evaluation"] is None
    assert analytics["bySupport"] == []
    assert len(client.get("/api/reports", params={"search": "Fire"}).json()) == 3
    assert client.get("/api/reports", params={"search": "%"}).json() == []
    assert len(client.get("/api/reports", params={"location": "طرابلس"}).json()) == 2
    assert len(client.get("/api/reports", params={"priority": "Critical"}).json()) == 1
    assert [
        r["priority"] for r in client.get("/api/reports", params={"sort": "priority"}).json()
    ] == ["Critical", "High", "Low"]


def test_unknown_report_fields_rejected_and_evaluation_not_fabricated(client, report_input):
    assert (
        client.post("/api/reports", json={**report_input, "unknownField": "unused"}).status_code
        == 422
    )
    assert client.get("/api/analytics/summary").json()["evaluation"] is None


def test_request_size_cors_and_safe_error(client):
    response = client.post("/api/reports/analyze", content=b"x" * 300000)
    assert response.status_code == 413
    response = client.options(
        "/api/reports",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    response = client.options(
        "/api/reports",
        headers={"Origin": "https://untrusted.invalid", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in response.headers


def test_data_survives_new_session(client, report_input):
    client.post("/api/reports", json=report_input)

    async def read_in_new_session():
        async with client.app.state.sessions() as session:
            return (await session.scalar(select(ReportRow))).original_text

    assert client.portal.call(read_in_new_session) == report_input["originalText"]


def test_maximum_text_can_preserve_dense_location_metadata(client, report_input):
    import random

    rng = random.Random(7)
    text = "ا" * 5000
    metadata = AnalysisMetadata(
        extracted_locations=[
            ExtractedLocation(name="ا", start=i, end=i + 1, confidence=rng.random())
            for i in range(len(text))
        ]
    )
    receipt = client.app.state.receipt.issue(text, metadata)
    assert len(receipt) <= 200000
    response = client.post(
        "/api/reports",
        json={**report_input, "originalText": text, "location": text, "analysisToken": receipt},
    )
    assert response.status_code == 201
    with sqlite3.connect(client.database_path) as db:
        entities = json.loads(db.execute("SELECT extracted_locations FROM reports").fetchone()[0])
    assert len(entities) == 5000
