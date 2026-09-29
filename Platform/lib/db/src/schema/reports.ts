import { createInsertSchema } from "drizzle-zod";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { z } from "zod/v4";

export const reportsTable = sqliteTable("reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  originalText: text("original_text").notNull(),
  incidentClass: text("incident_class").notNull(),
  priority: text("priority").notNull(),
  location: text("location").notNull(),
  peopleAtRisk: integer("people_at_risk", { mode: "boolean" }).notNull(),
  requiredSupport: text("required_support").notNull(),
  relevance: text("relevance").notNull(),
  summary: text("summary").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  analysisTime: text("analysis_time").notNull().default("2.4s"),
});

export const insertReportSchema = createInsertSchema(reportsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reportsTable.$inferSelect;
