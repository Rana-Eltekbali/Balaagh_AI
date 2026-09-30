import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

demo_bearer = HTTPBearer(auto_error=False, scheme_name="DemoBearer")


async def require_demo_access(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(demo_bearer)],
):
    settings = request.app.state.settings
    if not settings.demo_auth_enabled:
        return
    headers = request.headers.getlist("authorization")
    supplied = credentials.credentials if credentials else ""
    valid_header = (
        len(headers) == 1
        and credentials is not None
        and headers[0].lower().startswith("bearer ")
        and bool(supplied)
        and not any(c.isspace() for c in supplied)
    )
    if not valid_header or not secrets.compare_digest(
        supplied.encode("utf-8"), settings.demo_api_token.get_secret_value().encode("utf-8")
    ):
        raise HTTPException(
            status_code=401,
            detail="Demo access key required or invalid",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_session(request: Request):
    async with request.app.state.sessions() as session:
        yield session
