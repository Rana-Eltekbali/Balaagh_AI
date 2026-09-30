from pydantic import Field, model_validator

from app.schemas.reports import ApiModel, Confidence, Report


class CountItem(ApiModel):
    label: str
    count: int


class DashboardSummary(ApiModel):
    total_reports: int
    critical_reports: int
    high_priority: int
    reports_today: int
    recent_reports: list[Report]
    by_incident_class: list[CountItem]
    by_priority: list[CountItem]


class LocationSummary(ApiModel):
    location: str
    reports: int
    critical_reports: int
    people_at_risk: int


class LocationsSummary(ApiModel):
    locations: list[LocationSummary]


class ModelEvaluation(ApiModel):
    accuracy: Confidence
    precision: Confidence
    recall: Confidence
    macro_f1: Confidence
    confusion_matrix: list[list[int]] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_matrix(self):
        size = len(self.confusion_matrix)
        if any(len(row) != size or any(n < 0 for n in row) for row in self.confusion_matrix):
            raise ValueError("confusionMatrix must be a square matrix of nonnegative counts")
        return self


class AnalyticsSummary(ApiModel):
    by_incident_class: list[CountItem]
    by_priority: list[CountItem]
    by_location: list[CountItem]
    by_support: list[CountItem]
    people_at_risk: int
    evaluation: ModelEvaluation | None
