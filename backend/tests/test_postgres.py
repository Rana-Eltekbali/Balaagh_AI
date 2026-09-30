"""Optional integration against an EMPTY disposable database; no production data."""

import asyncio
import os

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import Settings, get_settings
from app.db.session import create_database
from app.main import create_app


async def assert_private_report_storage(settings):
    engine, _ = create_database(settings)
    try:
        async with engine.connect() as connection:
            tables = (
                await connection.execute(
                    text(
                        "SELECT relname, relrowsecurity, relforcerowsecurity "
                        "FROM pg_class JOIN pg_namespace ON pg_namespace.oid = relnamespace "
                        "WHERE nspname = 'public' "
                        "AND relname IN ('reports', 'report_edits', 'alembic_version')"
                    )
                )
            ).all()
            assert len(tables) == 3
            assert all(rls and not forced for _, rls, forced in tables)
            # ACL grantee 0 means PUBLIC. Direct client grants and PUBLIC grants
            # must be gone even when Supabase's default grants were present.
            exposed_grants = await connection.scalar(
                text(
                    "SELECT count(*) FROM pg_class c "
                    "JOIN pg_namespace n ON n.oid = c.relnamespace "
                    "CROSS JOIN LATERAL aclexplode(c.relacl) acl "
                    "LEFT JOIN pg_roles r ON r.oid = acl.grantee "
                    "WHERE n.nspname = 'public' AND ("
                    "c.relname IN ('reports', 'report_edits', 'alembic_version') OR "
                    "c.oid IN (pg_get_serial_sequence('public.reports', 'id')::regclass, "
                    "pg_get_serial_sequence('public.report_edits', 'id')::regclass)) "
                    "AND (acl.grantee = 0 OR r.rolname IN ('anon', 'authenticated'))"
                )
            )
            assert exposed_grants == 0
            assert (
                await connection.scalar(
                    text(
                        "SELECT count(*) FROM pg_policies WHERE schemaname = 'public' "
                        "AND tablename IN ('reports', 'report_edits', 'alembic_version')"
                    )
                )
                == 0
            )
    finally:
        await engine.dispose()


@pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL not configured"
)
def test_postgres_migration_crud_and_cascade(monkeypatch, report_input, demo_token):
    url = os.environ["TEST_DATABASE_URL"]
    assert url.startswith("postgresql+asyncpg://")
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    command.upgrade(Config("alembic.ini"), "head")
    cfg = Settings(_env_file=None, app_env="test", database_url=url, inference_mode="disabled")
    asyncio.run(assert_private_report_storage(cfg))
    with TestClient(create_app(cfg), headers={"Authorization": f"Bearer {demo_token}"}) as client:
        response = client.post("/api/reports", json=report_input)
        assert response.status_code == 201
        report_id = response.json()["id"]
        try:
            assert (
                client.patch(f"/api/reports/{report_id}", json={"priority": "Critical"}).status_code
                == 200
            )
            assert any(e["reportId"] == report_id for e in client.get("/api/reports/edits").json())
            assert client.get("/api/dashboard/summary").status_code == 200
        finally:
            assert client.delete(f"/api/reports/{report_id}").status_code == 204
        assert not any(e["reportId"] == report_id for e in client.get("/api/reports/edits").json())
    get_settings.cache_clear()
