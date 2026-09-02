-- ==============================================================================
-- 🔐 SYSTEM BLUEPRINT: LEAD ACTIVITIES & TIMELINE VIEW
-- ==============================================================================

-- 1. Tabelle lead_activities dokumentieren/anlegen
CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES crm_leads(id) ON DELETE CASCADE NOT NULL,
  ts BIGINT NOT NULL,
  type TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  by_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  by_user_name TEXT,
  direction TEXT
);

-- RLS für lead_activities (falls noch nicht aktiv)
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Activities sichtbar für authentifizierte Nutzer" ON lead_activities FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Activities erstellbar für authentifizierte Nutzer" ON lead_activities FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 2. VIEW lead_timeline erstellen
CREATE OR REPLACE VIEW lead_timeline AS
SELECT 
  id,
  lead_id,
  ts,
  'call' AS activity_type,
  status AS call_status,
  NULL AS old_stage,
  NULL AS new_stage,
  by_user_id,
  by_user_name,
  NULL AS direction
FROM crm_calls

UNION ALL

SELECT 
  id,
  lead_id,
  ts,
  type AS activity_type,
  NULL AS call_status,
  old_status AS old_stage,
  new_status AS new_stage,
  by_user_id,
  by_user_name,
  direction
FROM lead_activities;

GRANT SELECT ON lead_timeline TO authenticated;
