import sqlite3

from alembic import command
from alembic.config import Config

from app.config import get_settings


def test_migration_roundtrip_matches_models(tmp_path, monkeypatch):
    database = tmp_path / "migration.sqlite"
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{database.as_posix()}")
    get_settings.cache_clear()
    config = Config("alembic.ini")
    try:
        command.upgrade(config, "head")
        command.check(config)
        with sqlite3.connect(database) as connection:
            names = [
                r[0]
                for r in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
            ]
        assert {"reports", "report_edits"} <= set(names)
        command.downgrade(config, "base")
        command.upgrade(config, "head")
    finally:
        get_settings.cache_clear()
