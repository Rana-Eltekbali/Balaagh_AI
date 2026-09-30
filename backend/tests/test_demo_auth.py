import pytest
from pydantic import ValidationError

from app.config import Settings

PROTECTED = [
    ("POST", "/api/reports/analyze"),
    ("POST", "/api/reports"),
    ("GET", "/api/reports"),
    ("GET", "/api/reports/1"),
    ("PATCH", "/api/reports/1"),
    ("DELETE", "/api/reports/1"),
    ("GET", "/api/reports/edits"),
    ("GET", "/api/dashboard/summary"),
    ("GET", "/api/locations/summary"),
    ("GET", "/api/analytics/summary"),
]


@pytest.mark.parametrize("method,path", PROTECTED)
def test_every_data_operation_requires_auth(client, method, path):
    client.headers.pop("Authorization")
    response = client.request(method, path)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "header", ["", "Bearer", "Basic wrong", "Bearer wrong", "Bearer  wrong", "Bearer wrong extra"]
)
def test_invalid_auth_is_401(client, header):
    assert client.get("/api/reports", headers={"Authorization": header}).status_code == 401


def test_duplicate_headers_are_rejected(client, demo_token):
    client.headers.pop("Authorization")
    assert (
        client.get(
            "/api/reports", headers=[("Authorization", f"Bearer {demo_token}")] * 2
        ).status_code
        == 401
    )


def test_public_health_and_authorized_access(client):
    assert client.get("/api/reports").status_code == 200
    client.headers.pop("Authorization")
    assert client.get("/api/healthz").status_code == 200
    assert client.get("/api/reports?token=not-a-header").status_code == 401


def test_token_is_not_returned_documented_or_logged(client, demo_token, capfd, caplog):
    for path in ["/api/healthz", "/api/reports", "/openapi.json"]:
        assert demo_token not in client.get(path).text
    wrong = demo_token + "invalid"
    response = client.get("/api/reports", headers={"Authorization": f"Bearer {wrong}"})
    assert response.status_code == 401
    captured = capfd.readouterr()
    for content in [response.text, str(response.headers), captured.out, captured.err, caplog.text]:
        assert demo_token not in content


def test_openapi_marks_data_routes_protected(client):
    schema = client.app.openapi()
    assert not schema["paths"]["/api/healthz"]["get"].get("security")
    for method, path in PROTECTED:
        path = path.replace("/1", "/{id}")
        assert schema["paths"][path][method.lower()]["security"] == [{"DemoBearer": []}]


@pytest.mark.parametrize("token", ["", "short", "x" * 31, "x" * 513, "x" * 32 + " ", "ع" * 32])
def test_enabled_auth_rejects_missing_or_invalid_key(token):
    with pytest.raises(ValidationError) as error:
        Settings(_env_file=None, demo_auth_enabled=True, demo_api_token=token)
    if token:
        assert token not in str(error.value)


def test_auth_defaults_on_and_production_cannot_disable(monkeypatch):
    monkeypatch.delenv("DEMO_AUTH_ENABLED")
    assert Settings(_env_file=None).demo_auth_enabled is True
    with pytest.raises(ValidationError, match="Production requires DEMO_AUTH_ENABLED=true"):
        Settings(_env_file=None, app_env="production", demo_auth_enabled=False)


def test_explicit_local_disable(client):
    client.app.state.settings.demo_auth_enabled = False
    client.headers.pop("Authorization")
    assert client.get("/api/reports").status_code == 200


def test_cors_preflight_allows_authorization_without_token(client):
    client.headers.pop("Authorization")
    response = client.options(
        "/api/reports",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert response.status_code == 200
    assert "Authorization" in response.headers["access-control-allow-headers"]
