-- ==============================================================================
-- 🔐 SECURITY PATCH: RLS & ANON-LECK SCHLIESSEN
-- ==============================================================================

-- 1. SICHERSTELLEN, DASS RLS WIRKLICH AKTIV IST
ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

-- 2. FEHLENDE AUTHENTICATED-POLICIES ANLEGEN (VOR DEM LÖSCHEN DER ANON-POLICY)
-- Um sicherzugehen, dass nach dem Löschen der Anon-Policy niemand ausgesperrt wird,
-- legen wir als Fallback eine generelle "Allow all for authenticated" Policy an.
-- WICHTIG: Das ueberschreibt vorerst die feingranularen Agent-Policies (own or unassigned).
-- Diese Feinsteuerung muss spaeter als separater Schritt bereinigt werden.

CREATE POLICY "Allow all for authenticated fallback" 
ON crm_leads FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated" 
ON crm_events FOR ALL USING (auth.role() = 'authenticated');

-- lead_activities hatte gar keine Policies, war also selbst fuer Admins gesperrt!
CREATE POLICY "Allow all for authenticated" 
ON lead_activities FOR ALL USING (auth.role() = 'authenticated');

-- ==============================================================================
-- 🛑 PAUSE: TESTEN!
-- Bitte lade an dieser Stelle die App (als eingeloggter Nutzer) neu. 
-- Wenn alles lädt und du speichern kannst, greifen die Authenticated-Policies.
-- ==============================================================================

-- 3. ANON-POLICIES LÖSCHEN (DAS LECK SCHLIESSEN)
DROP POLICY IF EXISTS "Allow all for anon" ON crm_leads;
DROP POLICY IF EXISTS "Allow all for anon" ON crm_events;

-- "Allow delete for all authenticated users" ist fehlerhaft, da role=public (anon!) erlaubt war!
DROP POLICY IF EXISTS "Allow delete for all authenticated users" ON crm_leads;

-- ==============================================================================
-- 🧹 4. AUFRÄUMEN DER DUPLIKATE IN user_profiles (OPTIONAL)
-- ==============================================================================
-- DROP POLICY IF EXISTS "Admins and Devs manage users" ON user_profiles;
-- DROP POLICY IF EXISTS "Admins und Developer duerfen Rollen aendern" ON user_profiles;
-- DROP POLICY IF EXISTS "Allow users to manage their own profile" ON user_profiles;
-- DROP POLICY IF EXISTS "Users can manage their own profile" ON user_profiles;

-- Ersetze sie durch ZWEI saubere Policies (Self-Service + Admins):
-- CREATE POLICY "Self service update" ON user_profiles FOR UPDATE USING (auth.uid() = id);
-- CREATE POLICY "Admin manage" ON user_profiles FOR ALL USING (
--   EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer'))
-- );
