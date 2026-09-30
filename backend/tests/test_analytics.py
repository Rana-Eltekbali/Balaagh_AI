import sqlite3
from collections import Counter

import pytest


@pytest.fixture
def analytics_reports(client, report_input):
    # Tripoli midnight is 22:00 UTC on the preceding date.
    cases = [
        ("Fire / Explosion", "High", "طرابلس", True, "Medical", "2026-09-29 22:00:00.000000"),
        ("Fire / Explosion", "Low", "طرابلس", False, "", "2026-09-30 21:59:59.999999"),
        ("Fire / Explosion", "High", "بنغازي", False, "", "2026-09-29 21:59:59.999999"),
        (
            "People at Risk / Medical",
            "Critical",
            "طرابلس",
            True,
            "Medical",
            "2026-09-30 22:00:00.000000",
        ),
        ("Other", "Medium", "", False, "", "2026-09-30 10:00:00.000000"),
        ("Fire / Explosion", "High", "طرابلس", False, "Shelter", "2026-09-30 10:00:00.000000"),
    ]
    reports = []
    for incident, priority, location, risk, support, created in cases:
        response = client.post(
            "/api/reports",
            json={
                **report_input,
                "incidentClass": incident,
                "priority": priority,
                "location": location,
                "peopleAtRisk": risk,
                "requiredSupport": support,
            },
        )
        assert response.status_code == 201
        report = response.json()
        with sqlite3.connect(client.database_path) as db:
            db.execute("UPDATE reports SET created_at=? WHERE id=?", (created, report["id"]))
        reports.append(report)
    return reports


@pytest.mark.parametrize(
    "params,indices",
    [
        ({}, [0, 1, 2, 3, 4, 5]),
        ({"incidentClass": "Other"}, [4]),
        ({"priority": "High"}, [0, 2, 5]),
        ({"location": "طرابلس"}, [0, 1, 3, 5]),
        ({"peopleAtRisk": "true"}, [0, 3]),
        ({"peopleAtRisk": "false"}, [1, 2, 4, 5]),
        ({"dateFrom": "2026-09-30"}, [0, 1, 3, 4, 5]),
        ({"dateTo": "2026-09-30"}, [0, 1, 2, 4, 5]),
        ({"dateFrom": "2026-09-30", "dateTo": "2026-09-30"}, [0, 1, 4, 5]),
        (
            {
                "incidentClass": "Fire / Explosion",
                "priority": "High",
                "location": "طرابلس",
                "peopleAtRisk": "false",
                "dateFrom": "2026-09-30",
                "dateTo": "2026-09-30",
            },
            [5],
        ),
        ({"priority": "Critical", "peopleAtRisk": "false"}, []),
    ],
)
def test_filters_apply_to_every_aggregation(client, analytics_reports, params, indices):
    response = client.get("/api/analytics/summary", params=params)
    assert response.status_code == 200
    data = response.json()
    selected = [analytics_reports[i] for i in indices]
    assert data["totalFiltered"] == len(selected)
    assert data["peopleAtRisk"] == sum(r["peopleAtRisk"] for r in selected)
    assert data["evaluation"] is None
    for section, field in [
        ("byIncidentClass", "incidentClass"),
        ("byPriority", "priority"),
        ("byLocation", "location"),
        ("bySupport", "requiredSupport"),
    ]:
        expected = Counter(r[field] for r in selected if r[field])
        assert {item["label"]: item["count"] for item in data[section]} == expected
    # An unfiltered request restores the full dataset after any filtered request.
    assert client.get("/api/analytics/summary").json()["totalFiltered"] == len(analytics_reports)


@pytest.mark.parametrize(
    "params",
    [
        {"incidentClass": "unknown"},
        {"priority": "urgent"},
        {"peopleAtRisk": "yes"},
        {"dateFrom": "2026-02-30"},
        {"dateTo": "not-a-date"},
        {"dateFrom": "2026-10-01", "dateTo": "2026-09-30"},
        {"dateTo": "9999-12-31"},
    ],
)
def test_invalid_analytics_filters_are_rejected(client, params):
    assert client.get("/api/analytics/summary", params=params).status_code == 422


def test_analytics_openapi_query_contract(client):
    query = client.app.openapi()["paths"]["/api/analytics/summary"]["get"]["parameters"]
    assert {p["name"] for p in query} == {
        "incidentClass",
        "priority",
        "location",
        "peopleAtRisk",
        "dateFrom",
        "dateTo",
    }
