import { pgTable, text, timestamp, uuid, jsonb, integer, index } from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { baseIADocumentsTable } from "./baseIADocuments.js";

// Requires CREATE EXTENSION IF NOT EXISTS vector;
// Custom type for vector since drizzle-orm might need custom config in some cases,
// but usually `import { vector } from "drizzle-orm/pg-core"` works if pgvector is installed.
import { customType } from "drizzle-orm/pg-core";

// Define a custom vector type for pgvector
const vector = customType<{ data: number[] }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return JSON.stringify(value);
  },
  fromDriver(value: unknown): number[] {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch (e) {
        // Fallback for cases where it might already be an array or string-formatted array
        return value.replace(/[\[\]]/g, "").split(",").map(Number);
      }
    }
    return value as number[];
  },
});

export const baseIAEmbeddingsTable = pgTable("base_ia_embeddings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: uuid("document_id").notNull().references(() => baseIADocumentsTable.id, { onDelete: "cascade" }),
  municipalityId: text("municipality_id").notNull(), // Fast filtering (INSEE or Municipality ID)
  chunkIndex: integer("chunk_index").notNull().default(0),
  pageNumber: integer("page_number"),
  content: text("content").notNull(), // The text chunk
  embedding: text("embedding").array().notNull(), // FALLBACK: stored as float-strings or jsonb-like 
  metadata: jsonb("metadata").default({}), // Stores doc type (plu, oap), pool_id, status, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    municipalityIdx: index("municipality_idx").on(table.municipalityId),
    metadataIdx: index("metadata_idx").on(table.metadata),
  };
});

export const selectBaseIAEmbeddingSchema = createSelectSchema(baseIAEmbeddingsTable);
export const insertBaseIAEmbeddingSchema = createInsertSchema(baseIAEmbeddingsTable);
