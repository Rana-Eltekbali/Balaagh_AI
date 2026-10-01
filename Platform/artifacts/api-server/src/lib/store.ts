/**
 * In-memory store — replaces the database for local development.
 * Data resets on server restart.
 */
import type { InsertReport } from "@workspace/db";
import { demoReports } from "./demo-reports";
import { csvSeedReports } from "./csv-seed-reports";

export interface ReportRow {
  id: number;
  originalText: string;
  incidentClass: string;
  priority: string;
  location: string;
  peopleAtRisk: boolean;
  requiredSupport: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  analysisTime: string;
}

let nextId = 1;
let rows: ReportRow[] = [];
let seeded = false;

function seed() {
  if (seeded) return;
  seeded = true;

  const now = new Date();

  // 20 demo reports — timestamps driven by each entry's _offsetHours
  demoReports.forEach((r) => {
    const offsetMs = (r._offsetHours ?? 0) * 60 * 60 * 1000;
    const d = new Date(now.getTime() - offsetMs);
    rows.push({
      id: nextId++,
      originalText: r.originalText,
      incidentClass: r.incidentClass,
      priority: r.priority,
      location: r.location,
      peopleAtRisk: r.peopleAtRisk,
      requiredSupport: r.requiredSupport,
      summary: r.summary,
      createdAt: d.toISOString(),
      updatedAt: d.toISOString(),
      analysisTime: r.analysisTime ?? "2.0s",
    });
  });

  // 236 CSV test-set rows spread across the past 7 days
  // oldest entry lands ~7 days ago, newest ~5 hours ago
  const totalCsv = csvSeedReports.length;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const fiveHoursMs = 5 * 60 * 60 * 1000;
  const windowMs = sevenDaysMs - fiveHoursMs;

  csvSeedReports.forEach((r, i) => {
    // evenly distribute oldest→newest, then add a small jitter (±10 min)
    const fraction = i / (totalCsv - 1);
    const offsetMs = sevenDaysMs - Math.round(fraction * windowMs);
    const jitterMs = (Math.sin(i * 1.618) * 10 * 60 * 1000); // deterministic ±10 min
    const d = new Date(now.getTime() - offsetMs + jitterMs);
    rows.push({
      id: nextId++,
      originalText: r.originalText,
      incidentClass: r.incidentClass,
      priority: r.priority,
      location: r.location ?? "",
      peopleAtRisk: r.peopleAtRisk ?? false,
      requiredSupport: r.requiredSupport ?? "",
      summary: r.summary,
      createdAt: d.toISOString(),
      updatedAt: d.toISOString(),
      analysisTime: r.analysisTime ?? "2.0s",
    });
  });
}

export function getAll(): ReportRow[] {
  seed();
  return [...rows].reverse();
}

export function getById(id: number): ReportRow | undefined {
  seed();
  return rows.find((r) => r.id === id);
}

export function insert(data: Omit<InsertReport, "id" | "createdAt"> & { analysisTime?: string }): ReportRow {
  seed();
  const row: ReportRow = {
    id: nextId++,
    originalText: data.originalText,
    incidentClass: data.incidentClass,
    priority: data.priority,
    location: data.location ?? "",
    peopleAtRisk: data.peopleAtRisk ?? false,
    requiredSupport: data.requiredSupport ?? "",
    summary: data.summary,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    analysisTime: data.analysisTime ?? "2.0s",
  };
  rows.push(row);
  return row;
}

export interface EditRecord {
  reportId: number;
  editedAt: string;
  field: string;
  before: string;
  after: string;
}

let edits: EditRecord[] = [];

export function getEdits(): EditRecord[] {
  return [...edits];
}

export function update(id: number, data: Partial<Omit<ReportRow, "id" | "createdAt">>): ReportRow | undefined {
  seed();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return undefined;

  const before = rows[idx];
  const now = new Date().toISOString();

  // تسجيل كل حقل تغيّر
  const trackFields: (keyof typeof data)[] = ['incidentClass', 'priority', 'location', 'peopleAtRisk', 'requiredSupport', 'summary'];
  for (const field of trackFields) {
    if (data[field] !== undefined && String(data[field]) !== String(before[field as keyof ReportRow])) {
      edits.push({
        reportId: id,
        editedAt: now,
        field,
        before: String(before[field as keyof ReportRow]),
        after: String(data[field]),
      });
    }
  }

  rows[idx] = { ...rows[idx], ...data, updatedAt: now };
  return rows[idx];
}

export function remove(id: number): boolean {
  seed();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  rows.splice(idx, 1);
  return true;
}
