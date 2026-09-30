from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_session
from app.schemas.summaries import LocationsSummary
from app.services.report_service import location_summary

router = APIRouter()


@router.get(
    "/locations/summary", response_model=LocationsSummary, operation_id="getLocationsSummary"
)
async def summary(session: AsyncSession = Depends(get_session)):
    return await location_summary(session)
