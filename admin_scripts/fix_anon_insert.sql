-- ═══════════════════════════════════════════════════════════════════════════
-- Fix: Nicht eingeloggte können Leads anlegen
-- ═══════════════════════════════════════════════════════════════════════════
-- Befund (08.09.2026):
--
--   crm_leads | "Agents can insert leads" | roles={public} | INSERT | WITH CHECK: true
--
-- roles={public} heisst: gilt fuer ALLE, auch fuer nicht angemeldete Besucher.
-- WITH CHECK: true heisst: keinerlei Bedingung.
--
-- Zusammen: wer die Adresse der Datenbank kennt (die steht oeffentlich im
-- Browser-Code), kann beliebig viele Zeilen in crm_leads schreiben — ohne Login.
--
-- LESEN ist NICHT betroffen. Alle SELECT-Regeln verlangen eine Anmeldung.
-- Auch Aendern und Loeschen sind dicht. Es geht ausschliesslich ums Anlegen.
--
-- Der Fix ist ein Einzeiler: die Regel loeschen. Angemeldete koennen weiterhin
-- Leads anlegen, das decken zwei andere Regeln bereits ab:
--   - "leads_insert_authenticated"  (INSERT, WITH CHECK: auth.role() = 'authenticated')
--   - "auth_full_access"            (ALL, nur fuer angemeldete Rolle, WITH CHECK: true)
-- ═══════════════════════════════════════════════════════════════════════════


-- ── SCHRITT 1: Vorher — kann anon die Tabelle ueberhaupt erreichen? ────────
-- (Wenn hier "anon / INSERT" auftaucht, ist das Loch real und nicht nur theoretisch.)
SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name   = 'crm_leads'
   AND grantee IN ('anon', 'authenticated')
 ORDER BY grantee, privilege_type;


-- ── SCHRITT 2: Die Regel entfernen ────────────────────────────────────────
DROP POLICY IF EXISTS "Agents can insert leads" ON public.crm_leads;


-- ── SCHRITT 3: Nachher — es darf keine INSERT-Regel mehr geben, die
--              {public} mit "true" kombiniert. ────────────────────────────
SELECT tablename, policyname, roles, cmd, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename  = 'crm_leads'
   AND cmd IN ('INSERT', 'ALL')
 ORDER BY policyname;

-- Erwartung danach:
--   Admins and Devs can do everything | {public}        | ALL    | null
--   auth_full_access                  | {authenticated} | ALL    | true
--   leads_insert_authenticated        | {public}        | INSERT | auth.role() = 'authenticated'
--
-- Danach in der App einmal einen Lead anlegen (Quick-Add oben) — muss weiter gehen.
