from pathlib import Path

import yaml

from app.main import create_app
from app.schemas.reports import AnalysisInput, AnalysisResult, Report, ReportInput, ReportUpdate
from app.schemas.summaries import AnalyticsSummary, DashboardSummary, LocationsSummary


def test_checked_in_openapi_matches_backend_fields_and_operations():
    spec = yaml.safe_load(
        (Path(__file__).parents[2] / "Platform/lib/api-spec/openapi.yaml").read_text(
            encoding="utf-8"
        )
    )
    runtime = create_app().openapi()
    assert {
        ("/api" + path, method)
        for path, operations in spec["paths"].items()
        for method in operations
    } == {(path, method) for path, operations in runtime["paths"].items() for method in operations}
    for path, operations in spec["paths"].items():
        for method, operation in operations.items():
            assert (
                runtime["paths"]["/api" + path][method]["operationId"] == operation["operationId"]
            )
    for model in (
        AnalysisInput,
        AnalysisResult,
        Report,
        ReportInput,
        ReportUpdate,
        AnalyticsSummary,
        DashboardSummary,
        LocationsSummary,
    ):
        expected = spec["components"]["schemas"][model.__name__]
        actual = model.model_json_schema(by_alias=True)
        assert set(expected["properties"]) == set(actual["properties"])
    evaluation = spec["components"]["schemas"]["AnalyticsSummary"]["properties"]["evaluation"]
    assert {"type": "null"} in evaluation["anyOf"]
