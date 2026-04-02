import { pgTable, text, timestamp, uuid, doublePrecision, integer, jsonb } from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";

export const municipalitySettingsTable = pgTable("municipality_settings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  commune: text("commune").notNull().unique(), // Matching analysis.city or user.communes
  inseeCode: text("insee_code"), // Added for DVF/Stat APIs
  
  // Fiscalité locale
  taRateCommunal: doublePrecision("ta_rate_communal").default(0.05),
  taRateDept: doublePrecision("ta_rate_dept").default(0.025),
  taxeFonciereRate: doublePrecision("taxe_fonciere_rate").default(0.40),
  teomRate: doublePrecision("teom_rate").default(0.12),
  rapRate: doublePrecision("rap_rate").default(0.004),

  // Valeurs forfaitaires
  valeurForfaitaireTA: integer("valeur_forfaitaire_ta").default(900),
  valeurForfaitairePiscine: integer("valeur_forfaitaire_piscine").default(250),
  valeurForfaitaireStationnement: integer("valeur_forfaitaire_stationnement").default(2000),

  // Marché Local
  prixM2Maison: integer("prix_m2_maison").default(2500),
  prixM2Collectif: integer("prix_m2_collectif").default(3000),
  yieldMaison: doublePrecision("yield_maison").default(0.04),
  yieldCollectif: doublePrecision("yield_collectif").default(0.05),

  // Abattements
  abattementRP: doublePrecision("abattement_rp").default(0.5),
  surfaceAbattement: integer("surface_abattement").default(100),

  // Gouvernance (Phase 6-12)
  metropoleId: text("metropole_id"), // Reference to a user of role 'metropole' or organization
  epciCode: text("epci_code"),
  epciLabel: text("epci_label"),

  // Personnalisation des calculs (Mode Dyna-Math)
  formulas: jsonb("formulas").default({}),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const selectMunicipalitySettingSchema = createSelectSchema(municipalitySettingsTable);
export const insertMunicipalitySettingSchema = createInsertSchema(municipalitySettingsTable);
