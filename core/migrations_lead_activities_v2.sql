-- 1. Fehlende Spalte anlegen, falls noch nicht vorhanden
ALTER TABLE lead_activities ADD COLUMN IF NOT EXISTS details text;

-- 2. Bestehende RLS-Policies sicherheitshalber droppen, falls sie falsch definiert wurden
DROP POLICY IF EXISTS "Allow all for authenticated" ON lead_activities;
DROP POLICY IF EXISTS "Allow all for authenticated" ON crm_calls;

-- 3. RLS-Policies neu anlegen
CREATE POLICY "Allow all for authenticated" 
ON lead_activities FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated" 
ON crm_calls FOR ALL USING (auth.role() = 'authenticated');

-- 4. View anlegen, Typen explizit casten, um BIGINT/UUID/TEXT Konflikte zu lösen
CREATE OR REPLACE VIEW lead_timeline AS
SELECT 
  id::text,
  lead_id::bigint,
  ts::bigint,
  'call' as activity_type,
  status as call_status,
  type as call_direction,
  NULL as details,
  by_user_id::text,
  by_user_name::text,
  created_at
FROM crm_calls
UNION ALL
SELECT 
  id::text,
  lead_id::bigint,
  ts::bigint,
  type as activity_type,
  NULL as call_status,
  NULL as call_direction,
  details::text,
  by_user_id::text,
  by_user_name::text,
  created_at
FROM lead_activities;

-- 5. Dem authentifizierten Nutzer (und der API) Rechte auf die View geben
GRANT SELECT ON lead_timeline TO authenticated;
GRANT SELECT ON lead_timeline TO anon;
