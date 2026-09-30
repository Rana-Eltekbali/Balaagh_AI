from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class IncidentClass(StrEnum):
    FIRE = "Fire / Explosion"
    FLOOD = "Flood / Severe Weather"
    INFRASTRUCTURE = "Infrastructure / Utilities"
    ROAD = "Road / Transportation"
    MEDICAL = "People at Risk / Medical"
    OTHER = "Other"


class Priority(StrEnum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"
    CRITICAL = "Critical"


ReportText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=5000)]
ShortText = Annotated[str, StringConstraints(max_length=500)]
LocationText = Annotated[str, StringConstraints(max_length=5000)]
SummaryText = Annotated[str, StringConstraints(max_length=5000)]
Confidence = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]


class AnalysisInput(ApiModel):
    text: ReportText


class ExtractedLocation(ApiModel):
    name: str
    start: int = Field(ge=0)
    end: int = Field(ge=0)
    confidence: Confidence


class AnalysisFields(ApiModel):
    incident_class: IncidentClass
    priority: Priority
    location: LocationText
    people_at_risk: bool
    required_support: ShortText
    summary: SummaryText


class AnalysisResult(AnalysisFields):
    # Opaque, signed metadata receipt, carried through the frontend's existing object spread.
    analysis_token: str | None = None


class ReportInput(AnalysisFields):
    original_text: ReportText
    analysis_token: str | None = Field(default=None, max_length=200000)


class ReportUpdate(ApiModel):
    incident_class: IncidentClass | None = None
    priority: Priority | None = None
    location: LocationText | None = None
    people_at_risk: bool | None = None
    required_support: ShortText | None = None
    summary: SummaryText | None = None

    @field_validator(
        "incident_class",
        "priority",
        "location",
        "people_at_risk",
        "required_support",
        "summary",
        mode="before",
    )
    @classmethod
    def reject_explicit_null(cls, value):
        if value is None:
            raise ValueError("Omit unchanged fields; null is not an editable value")
        return value


class Report(AnalysisFields):
    id: int
    original_text: str
    created_at: datetime
    updated_at: datetime
    analysis_time: str


class ReportEdit(ApiModel):
    report_id: int
    edited_at: datetime
    field: str
    before: str
    after: str
    original_text: str
    incident_class: IncidentClass


class AnalysisMetadata(ApiModel):
    incident_class_confidence: Confidence | None = None
    priority_confidence: Confidence | None = None
    location_confidence: Confidence | None = None
    extracted_locations: list[ExtractedLocation] = Field(default_factory=list)
    analysis_time_ms: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    summary_source: Literal["llm", "fallback", "manual"] = "manual"
    # Retains the original model labels when analysts later correct display fields.
    model_predictions: dict[str, str] = Field(default_factory=dict)
