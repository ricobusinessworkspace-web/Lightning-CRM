-- ==============================================================================
-- 🔐 SYSTEM BLUEPRINT: PIPELINE SEMANTICS & MONOTONY CONSTRAINT
-- ==============================================================================
-- 
-- VORBEREITUNG (BITTE ZUERST AUSFÜHREN)
-- Führe folgende Prüf-Query aus, um zu sehen, ob es Leads gibt, 
-- die das Constraint (die Pipeline-Monotonie) verletzen würden.
-- 
-- PRÜF-QUERY:
-- SELECT id, name, status, entscheider, termin, rechnung 
-- FROM crm_leads 
-- WHERE 
--   (COALESCE(termin, 0) = 1 AND COALESCE(entscheider, 0) = 0) OR
--   (COALESCE(rechnung, 0) = 1 AND (COALESCE(termin, 0) = 0 OR COALESCE(entscheider, 0) = 0)) OR
--   (status = 'Kunde' AND COALESCE(rechnung, 0) = 0);
-- 
-- Wenn diese Abfrage Zeilen zurückgibt, korrigiere sie (z.B. im Admin-Panel),
-- bevor du das untenstehende Constraint anlegst!
-- ==============================================================================

ALTER TABLE crm_leads 
ADD CONSTRAINT pipeline_monotony_check 
CHECK (
  (COALESCE(termin, 0) = 0 OR COALESCE(entscheider, 0) = 1) AND 
  (COALESCE(rechnung, 0) = 0 OR (COALESCE(termin, 0) = 1 AND COALESCE(entscheider, 0) = 1)) AND
  (status != 'Kunde' OR COALESCE(rechnung, 0) = 1)
);
