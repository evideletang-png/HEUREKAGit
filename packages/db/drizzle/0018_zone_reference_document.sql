ALTER TABLE "regulatory_calibration_zones"
ADD COLUMN IF NOT EXISTS "reference_document_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'regulatory_calibration_zones_reference_document_id_town_hall_documents_id_fk'
  ) THEN
    ALTER TABLE "regulatory_calibration_zones"
    ADD CONSTRAINT "regulatory_calibration_zones_reference_document_id_town_hall_documents_id_fk"
    FOREIGN KEY ("reference_document_id")
    REFERENCES "public"."town_hall_documents"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "regulatory_calibration_zones_reference_document_idx"
ON "regulatory_calibration_zones" ("reference_document_id");
