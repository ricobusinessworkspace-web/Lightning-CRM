-- ═══════════════════════════════════════════════════════════════════════════
-- Lightning CRM — Alle Nutzer außer einem entfernen (Dev-Phase)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️  IRREVERSIBEL. Vorher in Supabase ein Backup ziehen:
--     Dashboard → Database → Backups → "Create backup"
--
-- Was das Skript macht:
--   1. Ermittelt deinen Account über die E-Mail (KEEPER_EMAIL unten).
--   2. Bricht ab, wenn dieser Account nicht eindeutig existiert.
--   3. Schreibt ALLE Fremd-Zuordnungen auf dich um (claimed_by, by_user_id,
--      by_user_name) — damit gehen weder Leads noch Anruf-Historie verloren.
--   4. Löscht persönliche Daten der anderen (Notifications, Push-Subs).
--   5. Löscht deren user_profiles und auth.users.
--   6. Setzt deinen Account auf role='developer' und ein gültiges Tagesziel.
--
-- Tabellen/Spalten werden vor jedem Zugriff auf Existenz geprüft — das Skript
-- läuft also auch durch, wenn eine der Tabellen bei dir nicht (mehr) existiert.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  KEEPER_EMAIL  text := 'rico.businessworkspace@gmail.com';   -- <<< ggf. anpassen
  keeper_id     uuid;
  keeper_name   text;
  n_users       int;
  t             record;
  affected      int;
  col_type      text;
BEGIN
  -- ── 1. Keeper auflösen ───────────────────────────────────────────────────
  SELECT count(*) INTO n_users
    FROM auth.users WHERE lower(email) = lower(KEEPER_EMAIL);

  IF n_users <> 1 THEN
    RAISE EXCEPTION
      'Abbruch: % Accounts fuer "%" gefunden (erwartet: genau 1). Nichts geaendert.',
      n_users, KEEPER_EMAIL;
  END IF;

  SELECT id INTO keeper_id
    FROM auth.users WHERE lower(email) = lower(KEEPER_EMAIL);

  SELECT coalesce(name, split_part(KEEPER_EMAIL, '@', 1))
    INTO keeper_name
    FROM user_profiles WHERE id = keeper_id;

  keeper_name := coalesce(keeper_name, split_part(KEEPER_EMAIL, '@', 1));

  RAISE NOTICE 'Keeper: % (%) — alles andere wird uebernommen/geloescht.',
    KEEPER_EMAIL, keeper_id;

  -- ── 2. Fremd-Zuordnungen auf den Keeper umschreiben ──────────────────────
  --     Reihenfolge wichtig: erst umhaengen, dann loeschen. Sonst reissen
  --     Foreign Keys die Leads/Anrufe mit in den Abgrund.
  FOR t IN
    SELECT * FROM (VALUES
      ('crm_leads',         'claimed_by'),
      ('crm_calls',         'by_user_id'),
      ('lead_activities',   'by_user_id'),
      ('crm_projects',      'claimed_by'),
      ('crm_projects',      'owner_id'),
      ('crm_project_tasks', 'by_user_id')
    ) AS v(tbl, col)
  LOOP
    IF to_regclass('public.' || t.tbl) IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = t.tbl
            AND column_name  = t.col
       )
    THEN
      -- Die Spalten sind uneinheitlich typisiert (crm_leads.claimed_by = uuid,
      -- crm_calls.by_user_id = text). Deshalb: Zuweisung auf den echten
      -- Spaltentyp casten, Vergleich generell ueber text.
      SELECT format_type(a.atttypid, a.atttypmod) INTO col_type
        FROM pg_attribute a
       WHERE a.attrelid = ('public.' || t.tbl)::regclass
         AND a.attname  = t.col
         AND a.attnum > 0
         AND NOT a.attisdropped;

      EXECUTE format(
        'UPDATE public.%I SET %I = $1::%s WHERE %I IS NOT NULL AND %I::text <> $1',
        t.tbl, t.col, col_type, t.col, t.col
      ) USING keeper_id::text;
      GET DIAGNOSTICS affected = ROW_COUNT;
      RAISE NOTICE '  % .% (%) -> Keeper: % Zeilen', t.tbl, t.col, col_type, affected;
    END IF;
  END LOOP;

  -- Anzeigenamen in der Historie mitziehen, sonst steht dort weiter
  -- der Name von jemandem, den es nicht mehr gibt.
  FOR t IN
    SELECT * FROM (VALUES
      ('crm_calls',       'by_user_name'),
      ('lead_activities', 'by_user_name')
    ) AS v(tbl, col)
  LOOP
    IF to_regclass('public.' || t.tbl) IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = t.tbl
            AND column_name  = t.col
       )
    THEN
      EXECUTE format(
        'UPDATE public.%I SET %I = $1 WHERE %I IS DISTINCT FROM $1',
        t.tbl, t.col, t.col
      ) USING keeper_name;
      GET DIAGNOSTICS affected = ROW_COUNT;
      RAISE NOTICE '  % .% -> "%": % Zeilen', t.tbl, t.col, keeper_name, affected;
    END IF;
  END LOOP;

  -- ── 3. Persoenliche Daten der anderen loeschen ───────────────────────────
  --     Werden NICHT uebernommen: Notifications und Push-Subscriptions sind
  --     an fremde Geraete/Postfaecher gebunden.
  FOR t IN
    SELECT * FROM (VALUES
      ('crm_notifications',      'user_id'),
      ('crm_push_subscriptions', 'user_id')
    ) AS v(tbl, col)
  LOOP
    IF to_regclass('public.' || t.tbl) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I WHERE %I::text IS DISTINCT FROM $1', t.tbl, t.col)
        USING keeper_id::text;
      GET DIAGNOSTICS affected = ROW_COUNT;
      RAISE NOTICE '  % geloescht: % Zeilen', t.tbl, affected;
    END IF;
  END LOOP;

  -- ── 4. Profile und Auth-Accounts der anderen loeschen ────────────────────
  DELETE FROM public.user_profiles WHERE id::text <> keeper_id::text;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE '  user_profiles geloescht: % Zeilen', affected;

  -- auth.users raeumt identities/sessions/refresh_tokens per CASCADE mit ab.
  DELETE FROM auth.users WHERE id <> keeper_id;   -- auth.users.id ist immer uuid
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE '  auth.users geloescht: % Zeilen', affected;

  -- ── 5. Eigenen Account sauber setzen ─────────────────────────────────────
  INSERT INTO public.user_profiles (id, name, role, daily_call_goal)
  VALUES (keeper_id, keeper_name, 'developer', 100)
  ON CONFLICT (id) DO UPDATE
    SET role            = 'developer',
        name            = coalesce(public.user_profiles.name, EXCLUDED.name),
        -- -1 ist der "gesperrt"-Marker der App; sicherheitshalber zuruecksetzen
        daily_call_goal = CASE
                            WHEN public.user_profiles.daily_call_goal IS NULL
                              OR public.user_profiles.daily_call_goal <= 0
                            THEN 100
                            ELSE public.user_profiles.daily_call_goal
                          END;

  RAISE NOTICE 'Fertig. Keeper ist jetzt developer.';
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFIKATION — nach dem COMMIT ausführen
-- ═══════════════════════════════════════════════════════════════════════════
SELECT 'auth.users'    AS tabelle, count(*) AS zeilen FROM auth.users
UNION ALL
SELECT 'user_profiles',           count(*) FROM public.user_profiles
UNION ALL
SELECT 'leads gesamt',            count(*) FROM public.crm_leads
UNION ALL
SELECT 'leads ohne Besitzer',     count(*) FROM public.crm_leads WHERE claimed_by IS NULL;

SELECT u.id, u.email, p.name, p.role, p.daily_call_goal
  FROM auth.users u
  LEFT JOIN public.user_profiles p ON p.id = u.id;
