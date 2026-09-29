/**
 * In-memory store — replaces the database for local development.
 * Data resets on server restart.
 */
import type { InsertReport } from "@workspace/db";
import { demoReports } from "./demo-reports";

export interface ReportRow {
  id: number;
  originalText: string;
  incidentClass: string;
  priority: string;
  location: string;
  peopleAtRisk: boolean;
  requiredSupport: string;
  relevance: string;
  summary: string;
  createdAt: string;
  analysisTime: string;
}

let nextId = 1;
let rows: ReportRow[] = [];
let seeded = false;

function seed() {
  if (seeded) return;
  seeded = true;
  const base = new Date();
  demoReports.forEach((r, i) => {
    const d = new Date(base);
    d.setMinutes(d.getMinutes() - i * 30);
    rows.push({
      id: nextId++,
      originalText: r.originalText,
      incidentClass: r.incidentClass,
      priority: r.priority,
      location: r.location,
      peopleAtRisk: r.peopleAtRisk,
      requiredSupport: r.requiredSupport,
      relevance: r.relevance,
      summary: r.summary,
      createdAt: d.toISOString(),
      analysisTime: (r as any).analysisTime ?? "2.0s",
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
    relevance: data.relevance,
    summary: data.summary,
    createdAt: new Date().toISOString(),
    analysisTime: data.analysisTime ?? "2.0s",
  };
  rows.push(row);
  return row;
}

export function update(id: number, data: Partial<Omit<ReportRow, "id" | "createdAt">>): ReportRow | undefined {
  seed();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return undefined;
  rows[idx] = { ...rows[idx], ...data };
  return rows[idx];
}

export function remove(id: number): boolean {
  seed();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  rows.splice(idx, 1);
  return true;
}
