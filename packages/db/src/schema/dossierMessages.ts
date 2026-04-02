import { pgTable, serial, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

export const dossierMessagesTable = pgTable("dossier_messages", {
  id: serial("id").primaryKey(),
  dossierId: text("dossier_id").notNull(),
  fromUserId: text("from_user_id").notNull(),
  fromRole: text("from_role").notNull(),
  documentId: text("document_id"),
  content: text("content").notNull(),
  
  // Nouveaux champs pour Phase 6-12 (Collaboration)
  parentId: integer("parent_id"), // pour le threading
  mentions: jsonb("mentions").default([]), // ["@ABF", "@Metropole"]
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DossierMessage = typeof dossierMessagesTable.$inferSelect;
