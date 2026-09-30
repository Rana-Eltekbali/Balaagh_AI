from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_session
from app.schemas.summaries import AnalyticsSummary
from app.services.report_service import analytics

router = APIRouter()


@router.get(
    "/analytics/summary", response_model=AnalyticsSummary, operation_id="getAnalyticsSummary"
)
async def summary(request: Request, session: AsyncSession = Depends(get_session)):
    return await analytics(session, request.app.state.evaluation)
