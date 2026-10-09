from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_session
from app.schemas.summaries import DashboardSummary
from app.services.report_service import dashboard

router = APIRouter()


@router.get(
    "/dashboard/summary", response_model=DashboardSummary, operation_id="getDashboardSummary"
)
async def summary(
    request: Request,
    session: AsyncSession = Depends(get_session),
    filter: str = Query(default="today", pattern="^(today|all)$"),
):
    return await dashboard(session, request.app.state.settings.reports_timezone, filter)
