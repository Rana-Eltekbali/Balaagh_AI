from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ReportEditRow, ReportRow
from app.dependencies import get_session
from app.schemas.reports import (
    AnalysisInput,
    AnalysisResult,
    IncidentClass,
    Priority,
    Report,
    ReportEdit,
    ReportInput,
    ReportUpdate,
)
from app.services import report_service as service

router = APIRouter(prefix="/reports", tags=["reports"])
Session = Annotated[AsyncSession, Depends(get_session)]
ReportId = Annotated[int, Path(ge=1)]


@router.post("/analyze", response_model=AnalysisResult, operation_id="analyzeReport")
async def analyze_report(data: AnalysisInput, request: Request):
    return await request.app.state.inference.analyze(data.text)


# Static routes MUST precede the numeric-ID route.
@router.get("/edits", response_model=list[ReportEdit], operation_id="listReportEdits")
async def edits(session: Session):
    rows = await session.execute(
        select(ReportEditRow, ReportRow)
        .join(ReportRow)
        .order_by(ReportEditRow.edited_at.desc(), ReportEditRow.id.desc())
    )
    return [
        ReportEdit(
            report_id=e.report_id,
            edited_at=service.as_utc(e.edited_at),
            field=e.field,
            before=e.before,
            after=e.after,
            original_text=r.original_text,
            incident_class=r.incident_class,
        )
        for e, r in rows
    ]


@router.get("", response_model=list[Report], operation_id="listReports")
async def list_reports(
    session: Session,
    search: Annotated[str | None, Query(max_length=500)] = None,
    incident_class: Annotated[IncidentClass | None, Query(alias="incidentClass")] = None,
    priority: Priority | None = None,
    location: Annotated[str | None, Query(max_length=5000)] = None,
    sort: Literal["date", "priority", "incidentClass"] = "date",
):
    return await service.list_reports(session, search, incident_class, priority, location, sort)


@router.post("", response_model=Report, status_code=201, operation_id="createReport")
async def create_report(data: ReportInput, request: Request, session: Session):
    try:
        metadata = request.app.state.receipt.verify(data.analysis_token, data.original_text)
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
    return await service.create_report(session, data, metadata)


@router.get("/{id}", response_model=Report, operation_id="getReport")
async def get_report(id: ReportId, session: Session):
    return service.serialize_report(await service.get_report(session, id))


@router.patch("/{id}", response_model=Report, operation_id="updateReport")
async def update_report(id: ReportId, data: ReportUpdate, session: Session):
    return await service.update_report(session, id, data)


@router.delete("/{id}", status_code=204, operation_id="deleteReport")
async def delete_report(id: ReportId, session: Session):
    row = await service.get_report(session, id, lock=True)
    await session.delete(row)
    await session.commit()
    return Response(status_code=204)
