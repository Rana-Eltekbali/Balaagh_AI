from fastapi import Request


async def get_session(request: Request):
    async with request.app.state.sessions() as session:
        yield session
