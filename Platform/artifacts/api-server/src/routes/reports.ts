import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import {
  AnalyzeReportBody,
  AnalyzeReportResponse,
  CreateReportBody,
  CreateReportResponse,
  DeleteReportParams,
  GetReportParams,
  GetReportResponse,
  ListReportsQueryParams,
  ListReportsResponse,
} from "@workspace/api-zod";
import { db, reportsTable, type Report } from "@workspace/db";
import { analyzeReportText } from "../lib/report-analysis";
import { demoReports } from "../lib/demo-reports";

const router: IRouter = Router();
let seedPromise: Promise<void> | undefined;

function toApiReport(report: Report) {
  return {
    ...report,
    createdAt: report.createdAt.toISOString(),
  };
}

async function ensureDemoReports(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const existing = await db.select({ id: reportsTable.id }).from(reportsTable).limit(1);
      if (existing.length === 0) {
        await db.insert(reportsTable).values(demoReports);
      }
    })();
  }
  await seedPromise;
}

router.post("/reports/analyze", async (req, res): Promise<void> => {
  const parsed = AnalyzeReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json(AnalyzeReportResponse.parse(analyzeReportText(parsed.data.text)));
});

router.get("/reports", async (req, res): Promise<void> => {
  await ensureDemoReports();
  const parsed = ListReportsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, incidentClass, priority, location, relevance, sort } = parsed.data;
  const filters = [];
  if (search) {
    filters.push(or(ilike(reportsTable.originalText, `%${search}%`), ilike(reportsTable.summary, `%${search}%`)));
  }
  if (incidentClass) filters.push(eq(reportsTable.incidentClass, incidentClass));
  if (priority) filters.push(eq(reportsTable.priority, priority));
  if (location) filters.push(eq(reportsTable.location, location));
  if (relevance) filters.push(eq(reportsTable.relevance, relevance));

  const query = db.select().from(reportsTable);
  const reports = await (filters.length ? query.where(and(...filters)) : query).orderBy(
    sort === "incidentClass"
      ? asc(reportsTable.incidentClass)
      : sort === "priority"
        ? asc(reportsTable.priority)
        : desc(reportsTable.createdAt),
  );
  res.json(ListReportsResponse.parse(reports.map(toApiReport)));
});

router.post("/reports", async (req, res): Promise<void> => {
  const parsed = CreateReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db.insert(reportsTable).values(parsed.data).returning();
  res.status(201).json(CreateReportResponse.parse(toApiReport(created)));
});

router.get("/reports/:id", async (req, res): Promise<void> => {
  const parsed = GetReportParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await ensureDemoReports();
  const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, parsed.data.id));
  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  res.json(GetReportResponse.parse(toApiReport(report)));
});

router.delete("/reports/:id", async (req, res): Promise<void> => {
  const parsed = DeleteReportParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await ensureDemoReports();
  const deleted = await db.delete(reportsTable).where(eq(reportsTable.id, parsed.data.id)).returning({ id: reportsTable.id });
  if (deleted.length === 0) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  res.sendStatus(204);
});

export { ensureDemoReports, toApiReport };
export default router;