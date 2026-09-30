import asyncio
import logging
import threading
from time import perf_counter

import anyio
from fastapi import HTTPException

from app.ml.location import primary_location
from app.schemas.reports import AnalysisMetadata, AnalysisResult, IncidentClass

logger = logging.getLogger(__name__)


def people_at_risk(incident_class: str) -> bool:
    return incident_class == IncidentClass.MEDICAL


class InferenceService:
    def __init__(self, models, summary, receipt, settings):
        self.models, self.summary, self.receipt = models, summary, receipt
        self.semaphore = asyncio.Semaphore(settings.inference_max_concurrency)
        self.worker_slots = threading.BoundedSemaphore(settings.inference_max_concurrency)
        self.queue_timeout = settings.inference_queue_timeout_seconds

    def predict(self, text):
        # Protect actual workers even if a disconnected caller cancels its asyncio task.
        with self.worker_slots:
            return self._predict(text)

    def _predict(self, text):
        outputs = []
        for stage in ("category", "priority", "location"):
            start = perf_counter()
            outputs.append(getattr(self.models, stage).predict(text))
            logger.info(
                "model_stage stage=%s duration_ms=%.2f", stage, (perf_counter() - start) * 1000
            )
        return outputs

    async def analyze(self, text: str) -> AnalysisResult:
        if self.models is None:
            raise HTTPException(503, "Model inference is disabled; configure trained models")
        start = perf_counter()
        try:
            await asyncio.wait_for(self.semaphore.acquire(), timeout=self.queue_timeout)
        except TimeoutError:
            raise HTTPException(503, "Inference capacity busy; retry later") from None
        try:
            # Non-abandoned threads keep the concurrency slot until inference finishes.
            category, priority, entities = await anyio.to_thread.run_sync(self.predict, text)
        finally:
            self.semaphore.release()
        incident, incident_confidence = category
        priority_label, priority_confidence = priority
        primary = primary_location(entities)
        location = primary.name if primary else ""
        summary, source = await self.summary.summarize(text, incident, priority_label, location)
        metadata = AnalysisMetadata(
            incident_class_confidence=incident_confidence,
            priority_confidence=priority_confidence,
            location_confidence=primary.confidence if primary else None,
            extracted_locations=entities,
            analysis_time_ms=(perf_counter() - start) * 1000,
            summary_source=source,
            model_predictions={
                "incidentClass": incident,
                "priority": priority_label,
                "location": location,
            },
        )
        return AnalysisResult(
            incident_class=incident,
            priority=priority_label,
            location=location,
            people_at_risk=people_at_risk(incident),
            required_support="",
            summary=summary,
            analysis_token=self.receipt.issue(text, metadata),
        )
