"""Persistent reports, prediction provenance and analyst corrections."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0001_reports"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("original_text", sa.Text(), nullable=False),
        sa.Column("incident_class", sa.String(80), nullable=False),
        sa.Column("incident_class_confidence", sa.Float()),
        sa.Column("priority", sa.String(20), nullable=False),
        sa.Column("priority_confidence", sa.Float()),
        sa.Column("location", sa.Text(), nullable=False),
        sa.Column("location_confidence", sa.Float()),
        sa.Column(
            "extracted_locations", sa.JSON().with_variant(JSONB(), "postgresql"), nullable=False
        ),
        sa.Column(
            "model_predictions", sa.JSON().with_variant(JSONB(), "postgresql"), nullable=False
        ),
        sa.Column("people_at_risk", sa.Boolean(), nullable=False),
        sa.Column("required_support", sa.String(500), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("summary_source", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("analysis_time_ms", sa.Float()),
        sa.CheckConstraint(
            "incident_class IN ('Fire / Explosion', 'Flood / Severe Weather', 'Infrastructure / Utilities', 'Road / Transportation', 'People at Risk / Medical', 'Other')",
            name="ck_reports_incident",
        ),
        sa.CheckConstraint(
            "priority IN ('Low', 'Medium', 'High', 'Critical')", name="ck_reports_priority"
        ),
        sa.CheckConstraint(
            "summary_source IN ('llm', 'fallback', 'manual')", name="ck_reports_summary_source"
        ),
        sa.CheckConstraint(
            "analysis_time_ms IS NULL OR analysis_time_ms >= 0", name="ck_reports_duration"
        ),
        *(
            sa.CheckConstraint(
                f"{name} IS NULL OR ({name} >= 0 AND {name} <= 1)", name=f"ck_reports_{name}"
            )
            for name in ("incident_class_confidence", "priority_confidence", "location_confidence")
        ),
    )
    for name in ("created_at", "incident_class", "priority"):
        op.create_index(f"ix_reports_{name}", "reports", [name])
    op.create_index("ix_reports_location", "reports", ["location"], postgresql_using="hash")
    op.create_table(
        "report_edits",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "report_id",
            sa.Integer(),
            sa.ForeignKey("reports.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("field", sa.String(80), nullable=False),
        sa.Column("before", sa.Text(), nullable=False),
        sa.Column("after", sa.Text(), nullable=False),
    )
    op.create_index("ix_report_edits_report_id", "report_edits", ["report_id"])
    op.create_index("ix_report_edits_edited_at", "report_edits", ["edited_at"])


def downgrade():
    op.drop_table("report_edits")
    op.drop_table("reports")
