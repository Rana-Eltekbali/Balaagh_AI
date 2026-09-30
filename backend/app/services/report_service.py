from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from pydantic.alias_generators import to_camel
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ReportEditRow, ReportRow, utcnow
from app.schemas.reports import AnalysisMetadata, Report, ReportInput, ReportUpdate


def as_utc(value):
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def serialize_report(row: ReportRow) -> Report:
    return Report(
        id=row.id,
        original_text=row.original_text,
        incident_class=row.incident_class,
        priority=row.priority,
        location=row.location,
        people_at_risk=row.people_at_risk,
        required_support=row.required_support,
        summary=row.summary,
        created_at=as_utc(row.created_at),
        updated_at=as_utc(row.updated_at),
        analysis_time=f"{row.analysis_time_ms / 1000:.2f}s"
        if row.analysis_time_ms is not None
        else "",
    )


async def get_report(session: AsyncSession, report_id: int, lock=False):
    query = select(ReportRow).where(ReportRow.id == report_id)
    if lock:
        query = query.with_for_update()
    row = await session.scalar(query)
    if row is None:
        raise HTTPException(404, "Report not found")
    return row


async def create_report(session: AsyncSession, data: ReportInput, metadata: AnalysisMetadata):
    fields = data.model_dump(exclude={"analysis_token"})
    row = ReportRow(**fields, **metadata.model_dump(mode="json"))
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return serialize_report(row)


def edit_value(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


async def update_report(session: AsyncSession, report_id: int, data: ReportUpdate):
    row = await get_report(session, report_id, lock=True)
    timestamp = utcnow()
    changed = False
    for field, after in data.model_dump(exclude_unset=True).items():
        before = getattr(row, field)
        if before == after:
            continue
        session.add(
            ReportEditRow(
                report_id=row.id,
                edited_at=timestamp,
                field=to_camel(field),
                before=edit_value(before),
                after=edit_value(after),
            )
        )
        setattr(row, field, after)
        changed = True
    if changed:
        row.updated_at = timestamp
    await session.commit()
    await session.refresh(row)
    return serialize_report(row)


async def counts(session, column, nonempty=False):
    query = select(column.label("label"), func.count().label("count")).group_by(column)
    if nonempty:
        query = query.where(column != "")
    result = await session.execute(query.order_by(func.count().desc(), column.asc()))
    return [dict(row._mapping) for row in result]


async def list_reports(
    session, search=None, incident_class=None, priority=None, location=None, sort="date"
):
    query = select(ReportRow)
    if search:
        pattern = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.where(
            ReportRow.original_text.icontains(pattern, escape="\\")
            | ReportRow.summary.icontains(pattern, escape="\\")
            | ReportRow.location.icontains(pattern, escape="\\")
            | ReportRow.incident_class.icontains(pattern, escape="\\")
        )
    for column, value in (
        (ReportRow.incident_class, incident_class),
        (ReportRow.priority, priority),
        (ReportRow.location, location),
    ):
        if value:
            query = query.where(column == value)
    if sort == "priority":
        query = query.order_by(
            case({"Critical": 0, "High": 1, "Medium": 2, "Low": 3}, value=ReportRow.priority)
        )
    elif sort == "incidentClass":
        query = query.order_by(ReportRow.incident_class)
    rows = await session.scalars(query.order_by(ReportRow.created_at.desc(), ReportRow.id.desc()))
    return [serialize_report(row) for row in rows]


async def dashboard(session, timezone):
    zone = ZoneInfo(timezone)
    today = datetime.now(zone).date()
    start = datetime.combine(today, time.min, tzinfo=zone).astimezone(UTC)
    end = datetime.combine(today + timedelta(days=1), time.min, tzinfo=zone).astimezone(UTC)
    values = (
        await session.execute(
            select(
                func.count(ReportRow.id),
                func.count(case((ReportRow.priority == "Critical", 1))),
                func.count(case((ReportRow.priority == "High", 1))),
                func.count(
                    case(((ReportRow.created_at >= start) & (ReportRow.created_at < end), 1))
                ),
            )
        )
    ).one()
    recent = await session.scalars(
        select(ReportRow).order_by(ReportRow.created_at.desc(), ReportRow.id.desc()).limit(6)
    )
    return dict(
        total_reports=values[0],
        critical_reports=values[1],
        high_priority=values[2],
        reports_today=values[3],
        recent_reports=[serialize_report(r) for r in recent],
        by_incident_class=await counts(session, ReportRow.incident_class),
        by_priority=await counts(session, ReportRow.priority),
    )


async def location_summary(session):
    rows = await session.execute(
        select(
            ReportRow.location.label("location"),
            func.count().label("reports"),
            func.count(case((ReportRow.priority == "Critical", 1))).label("critical_reports"),
            func.count(case((ReportRow.people_at_risk.is_(True), 1))).label("people_at_risk"),
        )
        .where(ReportRow.location != "")
        .group_by(ReportRow.location)
        .order_by(func.count().desc(), ReportRow.location)
    )
    return {"locations": [dict(r._mapping) for r in rows]}


async def analytics(session, evaluation):
    return dict(
        by_incident_class=await counts(session, ReportRow.incident_class),
        by_priority=await counts(session, ReportRow.priority),
        by_location=await counts(session, ReportRow.location, True),
        by_support=await counts(session, ReportRow.required_support, True),
        people_at_risk=await session.scalar(
            select(func.count()).select_from(ReportRow).where(ReportRow.people_at_risk.is_(True))
        ),
        evaluation=evaluation,
    )
