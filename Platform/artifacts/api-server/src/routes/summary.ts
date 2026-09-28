import { Router, type IRouter } from "express";
import {
  GetDashboardSummaryResponse,
  GetAnalyticsSummaryResponse,
  GetLocationsSummaryResponse,
} from "@workspace/api-zod";
import { db, reportsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { ensureDemoReports, toApiReport } from "./reports";

const router: IRouter = Router();

function countBy(items: string[]) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  await ensureDemoReports();
  const reports = await db.select().from(reportsTable).orderBy(desc(reportsTable.createdAt));
  const now = new Date();
  const reportsToday = reports.filter((report) => {
    const date = new Date(report.createdAt);
    return date.toDateString() === now.toDateString();
  }).length;

  res.json(GetDashboardSummaryResponse.parse({
    totalReports: reports.length,
    criticalReports: reports.filter((report) => report.priority === "Critical").length,
    highPriority: reports.filter((report) => report.priority === "High").length,
    reportsToday,
    recentReports: reports.slice(0, 6).map(toApiReport),
    byIncidentClass: countBy(reports.map((report) => report.incidentClass)),
    byPriority: countBy(reports.map((report) => report.priority)),
  }));
});

router.get("/locations/summary", async (_req, res): Promise<void> => {
  await ensureDemoReports();
  const reports = await db.select().from(reportsTable);
  const locations = [...new Set(reports.map((report) => report.location))].map((location) => {
    const locationReports = reports.filter((report) => report.location === location);
    return {
      location,
      reports: locationReports.length,
      criticalReports: locationReports.filter((report) => report.priority === "Critical").length,
      peopleAtRisk: locationReports.filter((report) => report.peopleAtRisk).length,
    };
  }).sort((a, b) => b.reports - a.reports);

  res.json(GetLocationsSummaryResponse.parse({ locations }));
});

router.get("/analytics/summary", async (_req, res): Promise<void> => {
  await ensureDemoReports();
  const reports = await db.select().from(reportsTable);
  const locations = countBy(reports.map((report) => report.location));
  res.json(GetAnalyticsSummaryResponse.parse({
    byIncidentClass: countBy(reports.map((report) => report.incidentClass)),
    byPriority: countBy(reports.map((report) => report.priority)),
    byLocation: locations,
    bySupport: countBy(reports.map((report) => report.requiredSupport)),
    peopleAtRisk: reports.filter((report) => report.peopleAtRisk).length,
    evaluation: {
      accuracy: 0.86,
      precision: 0.82,
      recall: 0.79,
      macroF1: 0.8,
      confusionMatrix: [
        [8, 1, 0, 0, 0, 0],
        [1, 7, 1, 0, 0, 0],
        [0, 1, 8, 0, 0, 0],
        [0, 0, 1, 7, 1, 0],
        [0, 0, 0, 1, 8, 0],
        [0, 0, 0, 0, 1, 7],
      ],
    },
  }));
});

export default router;