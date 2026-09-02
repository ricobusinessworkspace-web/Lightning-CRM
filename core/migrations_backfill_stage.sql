-- ==============================================================================
-- 🔐 SYSTEM BLUEPRINT: BACKFILL STAGE (PHASE 5)
-- ==============================================================================

-- 1. Defekte Leads reparieren (rechnung=1 aber termin=0)
-- IDs 11, 202, 29
UPDATE crm_leads 
SET termin = 1 
WHERE id IN (11, 202, 29) AND rechnung = 1 AND COALESCE(termin, 0) = 0;

-- 2. Backfill der neuen stage Spalte
UPDATE crm_leads
SET stage = CASE
    WHEN status = 'Kunde' THEN 'closed'
    WHEN rechnung = 1 THEN 'data'
    WHEN termin = 1 THEN 'pitch'
    WHEN entscheider = 1 THEN 'pitch' -- Entscheider ist fachlich tot, rutscht in Pitch hoch
    ELSE 'cold'
END;

-- 3. Nach dem Backfill sollte die Spalte nicht mehr NULL sein,
-- (optional: falls gewuenscht, spaeter NOT NULL Constraint hinzufuegen)
