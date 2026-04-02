import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const communesTable = pgTable("communes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  inseeCode: text("insee_code").notNull().unique(), // Stable INSEE 5-digit code
  jurisdictionId: text("jurisdiction_id").notNull(), // Link to owning Planning Authority (EPCI)
  zipCode: text("zip_code"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Commune = typeof communesTable.$inferSelect;
export type InsertCommune = typeof communesTable.$inferInsert;
