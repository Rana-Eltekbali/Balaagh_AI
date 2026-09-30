import { Router, type IRouter } from "express";
import {
  GetDashboardSummaryResponse,
  GetAnalyticsSummaryResponse,
  GetLocationsSummaryResponse,
} from "@workspace/api-zod";
import * as store from "../lib/store";

const router: IRouter = Router();

function countBy(items: string[]) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

router.get("/reports/edits", async (_req, res): Promise<void> => {
  const edits = store.getEdits();
  const reports = store.getAll();
  const enriched = edits.map((e) => {
    const report = reports.find((r) => r.id === e.reportId);
    return {
      ...e,
      originalText: report?.originalText ?? '',
      incidentClass: report?.incidentClass ?? '',
    };
  }).reverse(); // أحدث أولاً
  res.json(enriched);
});

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const reports = store.getAll();
  const now = new Date().toDateString();
  const reportsToday = reports.filter((r) => new Date(r.createdAt).toDateString() === now).length;

  res.json(GetDashboardSummaryResponse.parse({
    totalReports: reports.length,
    criticalReports: reports.filter((r) => r.priority === "Critical").length,
    highPriority: reports.filter((r) => r.priority === "High").length,
    reportsToday,
    recentReports: reports.slice(0, 6),
    byIncidentClass: countBy(reports.map((r) => r.incidentClass)),
    byPriority: countBy(reports.map((r) => r.priority)),
  }));
});

router.get("/locations/summary", async (_req, res): Promise<void> => {
  const reports = store.getAll();
  const locations = [...new Set(reports.map((r) => r.location).filter(Boolean))].map((location) => {
    const loc = reports.filter((r) => r.location === location);
    return {
      location,
      reports: loc.length,
      criticalReports: loc.filter((r) => r.priority === "Critical").length,
      peopleAtRisk: loc.filter((r) => r.peopleAtRisk).length,
    };
  }).sort((a, b) => b.reports - a.reports);

  res.json(GetLocationsSummaryResponse.parse({ locations }));
});

router.get("/analytics/summary", async (_req, res): Promise<void> => {
  const reports = store.getAll();
  res.json(GetAnalyticsSummaryResponse.parse({
    byIncidentClass: countBy(reports.map((r) => r.incidentClass)),
    byPriority: countBy(reports.map((r) => r.priority)),
    byLocation: countBy(reports.map((r) => r.location).filter(Boolean)),
    bySupport: countBy(reports.map((r) => r.requiredSupport)),
    peopleAtRisk: reports.filter((r) => r.peopleAtRisk).length,
    evaluation: null,
  }));
});

export default router;
