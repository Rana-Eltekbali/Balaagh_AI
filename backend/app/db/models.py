from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow():
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class ReportRow(Base):
    __tablename__ = "reports"
    __table_args__ = (
        # Hash indexing supports equality filtering even for unusually long NER spans.
        Index("ix_reports_location", "location", postgresql_using="hash"),
        CheckConstraint(
            "incident_class IN ('Fire / Explosion', 'Flood / Severe Weather', 'Infrastructure / Utilities', 'Road / Transportation', 'People at Risk / Medical', 'Other')",
            name="ck_reports_incident",
        ),
        CheckConstraint(
            "priority IN ('Low', 'Medium', 'High', 'Critical')", name="ck_reports_priority"
        ),
        CheckConstraint(
            "summary_source IN ('llm', 'fallback', 'manual')", name="ck_reports_summary_source"
        ),
        CheckConstraint(
            "analysis_time_ms IS NULL OR analysis_time_ms >= 0", name="ck_reports_duration"
        ),
        *(
            CheckConstraint(
                f"{name} IS NULL OR ({name} >= 0 AND {name} <= 1)", name=f"ck_reports_{name}"
            )
            for name in ("incident_class_confidence", "priority_confidence", "location_confidence")
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    original_text: Mapped[str] = mapped_column(Text)
    incident_class: Mapped[str] = mapped_column(String(80), index=True)
    incident_class_confidence: Mapped[float | None] = mapped_column(Float)
    priority: Mapped[str] = mapped_column(String(20), index=True)
    priority_confidence: Mapped[float | None] = mapped_column(Float)
    location: Mapped[str] = mapped_column(Text)
    location_confidence: Mapped[float | None] = mapped_column(Float)
    extracted_locations: Mapped[list] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"), default=list
    )
    model_predictions: Mapped[dict] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"), default=dict
    )
    people_at_risk: Mapped[bool] = mapped_column(Boolean)
    required_support: Mapped[str] = mapped_column(String(500))
    summary: Mapped[str] = mapped_column(Text)
    summary_source: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    analysis_time_ms: Mapped[float | None] = mapped_column(Float)


class ReportEditRow(Base):
    __tablename__ = "report_edits"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), index=True)
    edited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    field: Mapped[str] = mapped_column(String(80))
    before: Mapped[str] = mapped_column(Text)
    after: Mapped[str] = mapped_column(Text)
