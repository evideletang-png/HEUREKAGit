import { pgTable, text, timestamp, uuid, integer, boolean, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const regulatoryThemeTaxonomyTable = pgTable("regulatory_theme_taxonomy", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  articleHint: text("article_hint"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  sortIdx: index("regulatory_theme_taxonomy_sort_idx").on(table.sortOrder),
}));

export const selectRegulatoryThemeTaxonomySchema = createSelectSchema(regulatoryThemeTaxonomyTable);
export const insertRegulatoryThemeTaxonomySchema = createInsertSchema(regulatoryThemeTaxonomyTable);

export type RegulatoryThemeTaxonomy = typeof regulatoryThemeTaxonomyTable.$inferSelect;
export type InsertRegulatoryThemeTaxonomy = typeof regulatoryThemeTaxonomyTable.$inferInsert;
