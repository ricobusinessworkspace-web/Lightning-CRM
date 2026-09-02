-- ==============================================================================
-- 🔐 SYSTEM BLUEPRINT: LEAD ACTIVITIES & TIMELINE VIEW
-- ==============================================================================

-- 1. Dokumentation des Ist-Zustands von lead_activities
-- Die Tabelle existiert bereits produktiv mit folgendem Schema:
-- id: uuid
-- lead_id: bigint
-- by_user_id: uuid
-- by_user_name: text
-- type: text
-- details: text
-- ts: bigint

-- 2. VIEW lead_timeline erstellen
-- Verbindet crm_calls (mit bigint id und text by_user_id) 
-- und lead_activities (mit uuid id und uuid by_user_id) ueber explizite text-Casts.
CREATE OR REPLACE VIEW lead_timeline AS
SELECT 
  id::text,
  lead_id,
  ts,
  'call' AS activity_type,
  status AS call_status,
  NULL AS details,
  by_user_id::text,
  by_user_name
FROM crm_calls

UNION ALL

SELECT 
  id::text,
  lead_id,
  ts,
  type AS activity_type,
  NULL AS call_status,
  details,
  by_user_id::text,
  by_user_name
FROM lead_activities;

-- 3. Berechtigungen setzen
GRANT SELECT ON lead_timeline TO authenticated;
