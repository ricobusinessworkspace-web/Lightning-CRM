-- ==============================================================================
-- 🔐 SYSTEM BLUEPRINT: STAGE COLUMN (PHASE 5)
-- ==============================================================================
-- Diese Datei legt die neue stage-Spalte an.

ALTER TABLE crm_leads ADD COLUMN stage TEXT;
ALTER TABLE crm_leads ADD CONSTRAINT stage_check CHECK (stage IN ('cold', 'pitch', 'data', 'offer', 'closed'));

-- Die alte Datei "migrations_pipeline_semantics.sql" kann gelöscht oder ignoriert werden,
-- da das Constraint nun rein auf "stage" basiert.
