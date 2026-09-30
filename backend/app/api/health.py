from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_session

router = APIRouter()


@router.get("/healthz", operation_id="healthCheck")
async def health(request: Request, session: AsyncSession = Depends(get_session)):
    await session.execute(text("SELECT 1"))
    return {
        "status": "ok",
        "database": "ok",
        "modelsLoaded": request.app.state.models_loaded,
        "llmEnabled": request.app.state.settings.llm_enabled,
    }
