import ssl

from sqlalchemy import event
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import Settings


def create_database(settings: Settings):
    raw = settings.database_url.get_secret_value()
    if not raw:
        raise ValueError("DATABASE_URL is required")
    try:
        url = make_url(raw)
    except Exception:
        raise ValueError("DATABASE_URL must be a valid SQLAlchemy PostgreSQL URL") from None
    kwargs = {"pool_pre_ping": True, "echo": False, "hide_parameters": True}
    if url.drivername == "sqlite+aiosqlite" and settings.app_env == "test":
        engine = create_async_engine(url, **kwargs)

        @event.listens_for(engine.sync_engine, "connect")
        def sqlite_foreign_keys(dbapi_connection, _):
            dbapi_connection.execute("PRAGMA foreign_keys=ON")
    else:
        if url.drivername != "postgresql+asyncpg":
            raise ValueError("DATABASE_URL must use postgresql+asyncpg://")
        connect_args = {"command_timeout": 30}
        if settings.database_ssl:
            context = ssl.create_default_context()
            if settings.database_ssl_ca_file:
                context.load_verify_locations(cafile=settings.database_ssl_ca_file)
            connect_args["ssl"] = context
        engine = create_async_engine(
            url,
            **kwargs,
            pool_size=settings.database_pool_size,
            max_overflow=0,
            connect_args=connect_args,
        )
    return engine, async_sessionmaker(engine, expire_on_commit=False)
