-- ─────────────────────────────────────────────────────────────────────────────
-- 0027_zone_centric_phase1.sql
--
-- Phase 1 of zone-centric refactor.
--
-- This migration is ADDITIVE only — no DROP, no RENAME. The legacy tables
-- (regulatory_calibration_zones, regulatory_units, urban_rules,
-- indexed_regulatory_rules) remain intact and continue to serve the
-- orchestrator until Phase 2 switches the pipeline.
--
-- 1. Creates 4 unified tables
-- 2. Backfills them from legacy data with deduplication
--    (key: zoneId + articleNumber + topic)
-- 3. Each row carries `legacy_source` + `legacy_source_id` for traceability.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. regulatory_zones ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "regulatory_zones" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "commune_id"          text NOT NULL,
  "zone_code"           text NOT NULL,
  "zone_label"          text,
  "zone_type"           text,
  "summary"             text,
  "geometry"            jsonb,
  "status"              text DEFAULT 'draft' NOT NULL,
  "confidence_score"    double precision,
  "legacy_zone_id"      uuid,
  "created_by"          text,
  "updated_by"          text,
  "created_at"          timestamp DEFAULT now() NOT NULL,
  "updated_at"          timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regulatory_zones_commune_idx"      ON "regulatory_zones" ("commune_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regulatory_zones_code_idx"         ON "regulatory_zones" ("zone_code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regulatory_zones_status_idx"       ON "regulatory_zones" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regulatory_zones_legacy_idx"       ON "regulatory_zones" ("legacy_zone_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regulatory_zones_commune_code_idx" ON "regulatory_zones" ("commune_id", "zone_code");
--> statement-breakpoint

-- 2. zone_regulatory_rules ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "zone_regulatory_rules" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "zone_id"               uuid NOT NULL REFERENCES "regulatory_zones"("id") ON DELETE CASCADE,
  "article_number"        text,
  "article_title"         text,
  "topic"                 text NOT NULL,
  "rule_text"             text NOT NULL,
  "conditions"            jsonb DEFAULT '{}'::jsonb,
  "exceptions"            jsonb DEFAULT '{}'::jsonb,
  "source_document_id"    uuid,
  "source_document_kind"  text,
  "source_excerpt"        text,
  "source_page"           integer,
  "confidence_score"      double precision DEFAULT 0,
  "validation_status"     text DEFAULT 'draft' NOT NULL,
  "legacy_source"         text,
  "legacy_source_id"      uuid,
  "created_by"            text,
  "updated_by"            text,
  "created_at"            timestamp DEFAULT now() NOT NULL,
  "updated_at"            timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "zone_regulatory_rules_zone_idx"               ON "zone_regulatory_rules" ("zone_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "zone_regulatory_rules_topic_idx"              ON "zone_regulatory_rules" ("topic");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "zone_regulatory_rules_article_idx"            ON "zone_regulatory_rules" ("article_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "zone_regulatory_rules_validation_idx"         ON "zone_regulatory_rules" ("validation_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "zone_regulatory_rules_legacy_idx"             ON "zone_regulatory_rules" ("legacy_source", "legacy_source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "zone_regulatory_rules_zone_article_topic_idx" ON "zone_regulatory_rules" ("zone_id", "article_number", "topic");
--> statement-breakpoint

-- 3. regulatory_controls ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "regulatory_controls" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "zone_id"               uuid NOT NULL REFERENCES "regulatory_zones"("id") ON DELETE CASCADE,
  "rule_id"               uuid REFERENCES "zone_regulatory_rules"("id") ON DELETE SET NULL,
  "control_type"          text NOT NULL,
  "rule"                  text NOT NULL,
  "rule_structured"       jsonb DEFAULT '{}'::jsonb,
  "source_article"        text,
  "source_document_id"    uuid,
  "source_document_kind"  text,
  "confidence_score"      double precision DEFAULT 0,
  "validation_status"     text DEFAULT 'draft' NOT NULL,
  "legacy_source"         text,
  "legacy_source_id"      uuid,
  "created_by"            text,
  "updated_by"            text,
  "created_at"            timestamp DEFAULT now() NOT NULL,
  "updated_at"            timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regulatory_controls_zone_idx"        ON "regulatory_controls" ("zone_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regulatory_controls_rule_idx"        ON "regulatory_controls" ("rule_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regulatory_controls_type_idx"        ON "regulatory_controls" ("control_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regulatory_controls_validation_idx"  ON "regulatory_controls" ("validation_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regulatory_controls_legacy_idx"      ON "regulatory_controls" ("legacy_source", "legacy_source_id");
--> statement-breakpoint

-- 4. reglement_analysis ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "reglement_analysis" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "commune_id"          text NOT NULL,
  "document_id"         uuid,
  "source"              text NOT NULL,
  "title"               text,
  "raw_content"         text NOT NULL,
  "structured_content"  jsonb DEFAULT '{}'::jsonb,
  "status"              text DEFAULT 'draft' NOT NULL,
  "imported_by"         text,
  "validated_by"        text,
  "validated_at"        timestamp,
  "created_at"          timestamp DEFAULT now() NOT NULL,
  "updated_at"          timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reglement_analysis_commune_idx"  ON "reglement_analysis" ("commune_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reglement_analysis_source_idx"   ON "reglement_analysis" ("source");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reglement_analysis_status_idx"   ON "reglement_analysis" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reglement_analysis_document_idx" ON "reglement_analysis" ("document_id");
--> statement-breakpoint

-- ─── Data backfill (defensive: only runs if legacy tables exist) ─────────────

-- 5. Backfill regulatory_zones from regulatory_calibration_zones
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'regulatory_calibration_zones') THEN
    INSERT INTO regulatory_zones (
      commune_id, zone_code, zone_label, status, legacy_zone_id,
      created_by, updated_by, created_at, updated_at
    )
    SELECT
      rcz.commune_id,
      rcz.zone_code,
      rcz.zone_label,
      CASE WHEN rcz.is_active THEN 'validated' ELSE 'draft' END,
      rcz.id,
      rcz.created_by,
      rcz.updated_by,
      rcz.created_at,
      rcz.updated_at
    FROM regulatory_calibration_zones rcz
    WHERE NOT EXISTS (
      SELECT 1 FROM regulatory_zones rz WHERE rz.legacy_zone_id = rcz.id
    );
  END IF;
END $$;
--> statement-breakpoint

-- 6. Backfill zone_regulatory_rules from indexed_regulatory_rules (priority 1)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'indexed_regulatory_rules') THEN
    INSERT INTO zone_regulatory_rules (
      zone_id, article_number, topic, rule_text,
      source_document_id, source_document_kind, source_excerpt, source_page,
      confidence_score, validation_status,
      legacy_source, legacy_source_id, created_at, updated_at
    )
    SELECT
      rz.id,
      irr.article_code,
      irr.theme_code,
      irr.rule_label,
      irr.document_id,
      'town_hall',
      irr.source_text,
      irr.source_page,
      irr.confidence_score,
      CASE WHEN irr.status = 'published' THEN 'validated'
           WHEN irr.status = 'draft'     THEN 'draft'
           ELSE 'draft' END,
      'indexed_regulatory_rules',
      irr.id,
      irr.created_at,
      irr.updated_at
    FROM indexed_regulatory_rules irr
    JOIN regulatory_zones rz ON rz.legacy_zone_id = irr.zone_id
    WHERE irr.zone_id IS NOT NULL;
  END IF;
END $$;
--> statement-breakpoint

-- 7. Backfill zone_regulatory_rules from urban_rules (priority 2, dedup)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'urban_rules') THEN
    INSERT INTO zone_regulatory_rules (
      zone_id, article_number, topic, rule_text,
      source_document_id, source_document_kind, source_excerpt, source_page,
      confidence_score, validation_status,
      legacy_source, legacy_source_id, created_at, updated_at
    )
    SELECT
      rz.id,
      ur.source_article,
      ur.rule_topic,
      COALESCE(NULLIF(ur.rule_summary, ''), ur.rule_text_raw),
      ur.town_hall_document_id,
      'town_hall',
      ur.source_excerpt,
      ur.source_page,
      ur.confidence_score,
      CASE WHEN ur.review_status = 'validated' THEN 'validated' ELSE 'draft' END,
      'urban_rules',
      ur.id,
      ur.created_at,
      ur.updated_at
    FROM urban_rules ur
    JOIN regulatory_zones rz
      ON rz.commune_id = ur.municipality_id AND rz.zone_code = ur.zone_code
    WHERE ur.zone_code IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM zone_regulatory_rules zrr
        WHERE zrr.zone_id = rz.id
          AND COALESCE(zrr.article_number, '') = COALESCE(ur.source_article, '')
          AND zrr.topic = ur.rule_topic
      );
  END IF;
END $$;
--> statement-breakpoint

-- 8. Backfill zone_regulatory_rules from regulatory_units (priority 3, dedup)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'regulatory_units') THEN
    INSERT INTO zone_regulatory_rules (
      zone_id, article_number, article_title, topic, rule_text,
      source_document_id, source_document_kind,
      confidence_score, validation_status,
      legacy_source, legacy_source_id, created_at, updated_at
    )
    SELECT
      rz.id,
      ru.article_number::text,
      ru.title,
      ru.theme,
      ru.source_text,
      COALESCE(ru.town_hall_document_id, ru.base_ia_document_id),
      CASE
        WHEN ru.town_hall_document_id IS NOT NULL THEN 'town_hall'
        WHEN ru.base_ia_document_id   IS NOT NULL THEN 'base_ia'
        ELSE NULL
      END,
      CASE ru.confidence
        WHEN 'high'   THEN 0.9
        WHEN 'medium' THEN 0.6
        WHEN 'low'    THEN 0.3
        ELSE 0
      END,
      CASE WHEN ru.review_status = 'validated' THEN 'validated' ELSE 'draft' END,
      'regulatory_units',
      ru.id,
      ru.created_at,
      ru.updated_at
    FROM regulatory_units ru
    JOIN regulatory_zones rz
      ON rz.commune_id = ru.municipality_id AND rz.zone_code = ru.zone_code
    WHERE ru.zone_code IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM zone_regulatory_rules zrr
        WHERE zrr.zone_id = rz.id
          AND COALESCE(zrr.article_number, '') = COALESCE(ru.article_number::text, '')
          AND zrr.topic = ru.theme
      );
  END IF;
END $$;
--> statement-breakpoint

-- 9. Derive regulatory_controls from indexed_regulatory_rules with operator/value
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'indexed_regulatory_rules') THEN
    INSERT INTO regulatory_controls (
      zone_id, rule_id, control_type, rule, rule_structured,
      source_article, source_document_id, source_document_kind,
      confidence_score, validation_status,
      legacy_source, legacy_source_id, created_at, updated_at
    )
    SELECT
      rz.id,
      zrr.id,
      CASE
        WHEN irr.value_numeric IS NOT NULL THEN 'dimensional'
        WHEN irr.value_text    IS NOT NULL THEN 'qualitative'
        ELSE 'procedural'
      END,
      TRIM(BOTH ' ' FROM CONCAT_WS(' ',
        irr.theme_code,
        irr.operator,
        COALESCE(irr.value_numeric::text, irr.value_text),
        irr.unit
      )),
      jsonb_strip_nulls(jsonb_build_object(
        'operator',     irr.operator,
        'valueNumeric', irr.value_numeric,
        'valueText',    irr.value_text,
        'unit',         irr.unit,
        'field',        irr.theme_code
      )),
      irr.article_code,
      irr.document_id,
      'town_hall',
      irr.confidence_score,
      CASE WHEN irr.status = 'published' THEN 'validated' ELSE 'draft' END,
      'indexed_regulatory_rules',
      irr.id,
      irr.created_at,
      irr.updated_at
    FROM indexed_regulatory_rules irr
    JOIN regulatory_zones rz ON rz.legacy_zone_id = irr.zone_id
    LEFT JOIN zone_regulatory_rules zrr
      ON zrr.legacy_source = 'indexed_regulatory_rules' AND zrr.legacy_source_id = irr.id
    WHERE irr.zone_id IS NOT NULL
      AND (irr.operator IS NOT NULL OR irr.value_numeric IS NOT NULL OR irr.value_text IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM regulatory_controls rc
        WHERE rc.legacy_source = 'indexed_regulatory_rules' AND rc.legacy_source_id = irr.id
      );
  END IF;
END $$;
