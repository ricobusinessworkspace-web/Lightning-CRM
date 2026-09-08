-- ═══════════════════════════════════════════════════════════════════════════
-- Lightning CRM — Zugang auf den eigenen Account beschränken (Dev-Phase)
-- ═══════════════════════════════════════════════════════════════════════════
-- Nutzer löschen allein reicht NICHT. Zwei Türen bleiben sonst offen:
--   a) Registrierung ist im Login-Modal aktiv → jeder legt sich einen Account an
--   b) RLS-Policy "Allow all for anon" → mit dem (öffentlichen, im Browser-
--      Bundle sichtbaren) anon-Key kommt man ganz ohne Account an alle Leads
--
-- (a) ist eine Dashboard-Einstellung, kein SQL:
--     Authentication → Sign In / Providers → Email → "Allow new users to sign up" AUS
--
-- (b) erledigt dieses Skript.
--
-- ⚠️  ACHTUNG — geteiltes Supabase-Projekt:
--     In diesem Projekt liegen noch weitere Apps (jarvis_*, g_*, tracker_*,
--     core_*). Dieses Skript fasst AUSSCHLIESSLICH die fuenf Tabellen an, die
--     das CRM nachweislich benutzt. user_profiles ist bewusst ausgenommen,
--     weil es geteilt sein koennte.
--
--     Ausserdem: core_goals, core_intentions, core_metric_definitions und
--     core_metric_sources haben RLS AUS — die sind ohne jeden Schutz oeffentlich
--     lesbar und schreibbar. Gehoert nicht zum CRM, sollte aber jemand ansehen.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── SCHRITT 1: Erst anschauen, was aktuell gilt ────────────────────────────
SELECT schemaname, tablename, policyname, roles, cmd, qual
  FROM pg_policies
 WHERE schemaname = 'public'
 ORDER BY tablename, policyname;

SELECT relname AS tabelle, relrowsecurity AS rls_aktiv
  FROM pg_class
 WHERE relnamespace = 'public'::regnamespace
   AND relkind = 'r'
 ORDER BY relname;


-- ── SCHRITT 2: Abriegeln ───────────────────────────────────────────────────
-- Erst laufen lassen, wenn Schritt 1 bestätigt hat, dass es offene
-- anon-Policies gibt.

BEGIN;

DO $$
DECLARE
  tbl  text;
  pol  record;
BEGIN
  -- NUR die Tabellen, die das CRM nachweislich benutzt.
  --
  -- Bewusst NICHT dabei:
  --   user_profiles    — wird moeglicherweise von den jarvis_*/tracker_*-Apps
  --                      im selben Projekt mitbenutzt. Policies hier zu
  --                      ersetzen koennte die anderen Apps lahmlegen.
  --   crm_events, crm_projects, crm_project_tasks, crm_task_overrides
  --                    — im CRM-Code nicht verwendet, Zugehoerigkeit unklar.
  --   jarvis_*, g_*, tracker_*, core_*
  --                    — gehoeren nicht zu diesem Projekt. Finger weg.
  FOREACH tbl IN ARRAY ARRAY[
    'crm_leads', 'crm_calls', 'lead_activities',
    'crm_notifications', 'crm_push_subscriptions'
  ]
  LOOP
    CONTINUE WHEN to_regclass('public.' || tbl) IS NULL;

    -- RLS einschalten (falls noch aus)
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    -- Alle bestehenden Policies dieser Tabelle entfernen
    FOR pol IN
      SELECT policyname FROM pg_policies
       WHERE schemaname = 'public' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, tbl);
    END LOOP;

    -- Genau eine Policy: nur eingeloggte Nutzer, sonst niemand.
    -- Da nach reset_users_dev.sql nur noch dein Account existiert,
    -- ist "authenticated" faktisch "nur du".
    EXECUTE format(
      'CREATE POLICY "dev_authenticated_only" ON public.%I
         FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl
    );

    -- anon-Rolle explizit aussperren
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', tbl);

    RAISE NOTICE 'Abgeriegelt: %', tbl;
  END LOOP;
END $$;

COMMIT;


-- ── SCHRITT 3: Verifikation ────────────────────────────────────────────────
SELECT tablename, policyname, roles, cmd
  FROM pg_policies
 WHERE schemaname = 'public'
 ORDER BY tablename;

-- Erwartung: pro Tabelle genau eine Policy "dev_authenticated_only"
-- mit roles = {authenticated}. Keine Zeile mit {anon} oder {public}.
