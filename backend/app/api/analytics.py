from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_session
from app.schemas.reports import IncidentClass, Priority
from app.schemas.summaries import AnalyticsSummary
from app.services.report_service import analytics

router = APIRouter()


@router.get(
    "/analytics/summary", response_model=AnalyticsSummary, operation_id="getAnalyticsSummary"
)
async def summary(
    request: Request,
    session: AsyncSession = Depends(get_session),
    incident_class: Annotated[IncidentClass | None, Query(alias="incidentClass")] = None,
    priority: Priority | None = None,
    location: Annotated[str | None, Query(max_length=5000)] = None,
    people_at_risk: Annotated[Literal["true", "false"] | None, Query(alias="peopleAtRisk")] = None,
    date_from: Annotated[date | None, Query(alias="dateFrom")] = None,
    date_to: Annotated[date | None, Query(alias="dateTo")] = None,
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "dateFrom must be on or before dateTo")
    try:
        return await analytics(
            session,
            request.app.state.evaluation,
            timezone=request.app.state.settings.reports_timezone,
            incident_class=incident_class,
            priority=priority,
            location=location,
            people_at_risk=people_at_risk,
            date_from=date_from,
            date_to=date_to,
        )
    except OverflowError:
        raise HTTPException(422, "Date range is outside supported timestamp bounds") from None
