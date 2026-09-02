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
--   (termin = 1 AND entscheider = 0) OR
--   (rechnung = 1 AND (termin = 0 OR entscheider = 0));
-- 
-- Wenn diese Abfrage Zeilen zurückgibt, korrigiere sie,
-- bevor du das untenstehende Constraint anlegst!
-- ==============================================================================

ALTER TABLE crm_leads 
ADD CONSTRAINT pipeline_monotony_check 
CHECK (
  (termin = 0 OR entscheider = 1) AND 
  (rechnung = 0 OR (termin = 1 AND entscheider = 1))
);
