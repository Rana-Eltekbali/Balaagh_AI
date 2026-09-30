import { Router, type IRouter } from "express";
import {
  GetDashboardSummaryResponse,
  GetAnalyticsSummaryResponse,
  GetLocationsSummaryResponse,
  GetAnalyticsSummaryQueryParams,
} from "@workspace/api-zod";
import * as store from "../lib/store";

const router: IRouter = Router();

function countBy(items: string[]) {
  const counts = new Map<string, number>();

  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Report edit history
 */
router.get("/reports/edits", async (_req, res): Promise<void> => {
  const edits = store.getEdits();
  const reports = store.getAll();

  const enriched = edits
    .map((edit) => {
      const report = reports.find((r) => r.id === edit.reportId);

      return {
        ...edit,
        originalText: report?.originalText ?? "",
        incidentClass: report?.incidentClass ?? "",
      };
    })
    .reverse(); // الأحدث أولاً

  res.json(enriched);
});

/**
 * Dashboard summary
 */
router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const reports = store.getAll();

  const today = new Date().toDateString();

  const reportsToday = reports.filter(
    (report) =>
      new Date(report.createdAt).toDateString() === today,
  ).length;

  res.json(
    GetDashboardSummaryResponse.parse({
      totalReports: reports.length,

      criticalReports: reports.filter(
        (report) => report.priority === "Critical",
      ).length,

      highPriority: reports.filter(
        (report) => report.priority === "High",
      ).length,

      reportsToday,

      recentReports: reports.slice(0, 6),

      byIncidentClass: countBy(
        reports.map((report) => report.incidentClass),
      ),

      byPriority: countBy(
        reports.map((report) => report.priority),
      ),
    }),
  );
});

/**
 * Location summary
 */
router.get("/locations/summary", async (_req, res): Promise<void> => {
  const reports = store.getAll();

  const uniqueLocations = [
    ...new Set(
      reports
        .map((report) => report.location)
        .filter(Boolean),
    ),
  ];

  const locations = uniqueLocations
    .map((location) => {
      const locationReports = reports.filter(
        (report) => report.location === location,
      );

      return {
        location,

        reports: locationReports.length,

        criticalReports: locationReports.filter(
          (report) => report.priority === "Critical",
        ).length,

        peopleAtRisk: locationReports.filter(
          (report) => report.peopleAtRisk,
        ).length,
      };
    })
    .sort((a, b) => b.reports - a.reports);

  res.json(
    GetLocationsSummaryResponse.parse({
      locations,
    }),
  );
});

/**
 * Analytics summary
 *
 * This Express implementation is retained for compatibility/dev use.
 * Production analytics are provided by the FastAPI backend.
 */
router.get("/analytics/summary", async (req, res): Promise<void> => {
  const parsed = GetAnalyticsSummaryQueryParams.safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.message,
    });
    return;
  }

  const {
    incidentClass,
    priority,
    location,
    peopleAtRisk,
    dateFrom,
    dateTo,
  } = parsed.data;

  let reports = store.getAll();

  // Incident class filter
  if (incidentClass) {
    reports = reports.filter(
      (report) => report.incidentClass === incidentClass,
    );
  }

  // Priority filter
  if (priority) {
    reports = reports.filter(
      (report) => report.priority === priority,
    );
  }

  // Location filter
  if (location) {
    reports = reports.filter(
      (report) =>
        report.location.toLowerCase() === location.toLowerCase(),
    );
  }

  // People-at-risk filter
  if (peopleAtRisk === "true") {
    reports = reports.filter(
      (report) => report.peopleAtRisk === true,
    );
  }

  if (peopleAtRisk === "false") {
    reports = reports.filter(
      (report) => report.peopleAtRisk === false,
    );
  }

  // Date-from filter
  if (dateFrom) {
    const from = new Date(dateFrom);

    reports = reports.filter(
      (report) => new Date(report.createdAt) >= from,
    );
  }

  // Date-to filter
  if (dateTo) {
    const to = new Date(dateTo);

    to.setHours(23, 59, 59, 999);

    reports = reports.filter(
      (report) => new Date(report.createdAt) <= to,
    );
  }

  res.json(
    GetAnalyticsSummaryResponse.parse({
      byIncidentClass: countBy(
        reports.map((report) => report.incidentClass),
      ),

      byPriority: countBy(
        reports.map((report) => report.priority),
      ),

      byLocation: countBy(
        reports
          .map((report) => report.location)
          .filter(Boolean),
      ),

      bySupport: countBy(
        reports.map((report) => report.requiredSupport),
      ),

      peopleAtRisk: reports.filter(
        (report) => report.peopleAtRisk,
      ).length,

      totalFiltered: reports.length,

      // Never expose fabricated evaluation metrics.
      // Real evaluation metrics are served by the production
      // FastAPI backend when MODEL_EVALUATION_JSON is configured.
      evaluation: null,
    }),
  );
});

export default router;