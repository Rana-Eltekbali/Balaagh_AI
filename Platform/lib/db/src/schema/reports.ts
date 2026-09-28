import { createInsertSchema } from "drizzle-zod";
import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const reportsTable = pgTable("reports", {
  id: serial("id").primaryKey(),
  originalText: text("original_text").notNull(),
  incidentClass: text("incident_class").notNull(),
  priority: text("priority").notNull(),
  location: text("location").notNull(),
  peopleAtRisk: boolean("people_at_risk").notNull(),
  requiredSupport: text("required_support").notNull(),
  relevance: text("relevance").notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  analysisTime: text("analysis_time").notNull().default("2.4s"),
});

export const insertReportSchema = createInsertSchema(reportsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reportsTable.$inferSelect;