import { Router, type IRouter } from "express";
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
  UpdateReportBody,
  UpdateReportParams,
  UpdateReportResponse,
} from "@workspace/api-zod";
import { analyzeReportText } from "../lib/report-analysis";
import * as store from "../lib/store";

const router: IRouter = Router();

router.post("/reports/analyze", async (req, res): Promise<void> => {
  const parsed = AnalyzeReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json(AnalyzeReportResponse.parse(analyzeReportText(parsed.data.text)));
});

router.get("/reports", async (req, res): Promise<void> => {
  const parsed = ListReportsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, incidentClass, priority, location, relevance, sort } = parsed.data;

  let reports = store.getAll();

  if (search) {
    const q = search.toLowerCase();
    reports = reports.filter(
      (r) =>
        r.originalText.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q),
    );
  }
  if (incidentClass) reports = reports.filter((r) => r.incidentClass === incidentClass);
  if (priority) reports = reports.filter((r) => r.priority === priority);
  if (location) reports = reports.filter((r) => r.location.toLowerCase() === location.toLowerCase());
  if (relevance) reports = reports.filter((r) => r.relevance === relevance);

  if (sort === "incidentClass") reports.sort((a, b) => a.incidentClass.localeCompare(b.incidentClass));
  else if (sort === "priority") {
    const order = ["Critical", "High", "Medium", "Low"];
    reports.sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority));
  } else {
    reports.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  res.json(ListReportsResponse.parse(reports));
});

router.post("/reports", async (req, res): Promise<void> => {
  const parsed = CreateReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const created = store.insert(parsed.data);
  res.status(201).json(CreateReportResponse.parse(created));
});

router.get("/reports/:id", async (req, res): Promise<void> => {
  const parsed = GetReportParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const report = store.getById(parsed.data.id);
  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  res.json(GetReportResponse.parse(report));
});

router.patch("/reports/:id", async (req, res): Promise<void> => {
  const idParsed = UpdateReportParams.safeParse(req.params);
  if (!idParsed.success) {
    res.status(400).json({ error: idParsed.error.message });
    return;
  }
  const bodyParsed = UpdateReportBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }
  const updated = store.update(idParsed.data.id, bodyParsed.data);
  if (!updated) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  res.json(UpdateReportResponse.parse(updated));
});


router.delete("/reports/:id", async (req, res): Promise<void> => {
  const parsed = DeleteReportParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const deleted = store.remove(parsed.data.id);
  if (!deleted) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
