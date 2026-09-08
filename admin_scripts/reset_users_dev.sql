-- ═══════════════════════════════════════════════════════════════════════════
-- Lightning CRM — Alle Nutzer außer einem entfernen (Dev-Phase)
-- ═══════════════════════════════════════════════════════════════════════════
-- Geschrieben gegen das TATSÄCHLICHE Schema (Stand: inspect_user_columns.sql):
--
--   crm_leads.claimed_by              uuid, nullable, FK
--   crm_calls.by_user_id              TEXT, nullable, kein FK   <-- Ausreißer
--   crm_calls.by_user_name            text
--   lead_activities.by_user_id        uuid, nullable, kein FK
--   lead_activities.by_user_name      text
--   crm_notifications.user_id         uuid, NOT NULL, FK
--   crm_push_subscriptions.user_id    uuid, nullable, FK
--   user_profiles.id                  uuid, FK -> auth.users
--   crm_projects / crm_project_tasks  haben KEINE Nutzer-Spalten -> nichts zu tun
--
-- ⚠️  IRREVERSIBEL. Vorher: Dashboard → Database → Backups → "Create backup"
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- SCHRITT 1 — VORSCHAU (read-only, ändert nichts)
-- Zeigt, was das Skript anfassen würde. Erst ausführen, dann Schritt 2.
-- ═══════════════════════════════════════════════════════════════════════════
WITH k AS (
  SELECT id FROM auth.users
   WHERE lower(email) = lower('rico.businessworkspace@gmail.com')   -- <<< ggf. anpassen
)
SELECT 'auth.users werden geloescht'      AS aktion,
       count(*)                           AS zeilen
  FROM auth.users WHERE id <> (SELECT id FROM k)
UNION ALL
SELECT 'user_profiles werden geloescht',  count(*)
  FROM user_profiles WHERE id <> (SELECT id FROM k)
UNION ALL
SELECT 'crm_leads -> auf dich umgehaengt', count(*)
  FROM crm_leads
 WHERE claimed_by IS NOT NULL AND claimed_by <> (SELECT id FROM k)
UNION ALL
SELECT 'crm_leads bleiben unassigned (NULL)', count(*)
  FROM crm_leads WHERE claimed_by IS NULL
UNION ALL
SELECT 'crm_calls -> auf dich umgehaengt', count(*)
  FROM crm_calls
 WHERE by_user_id IS NOT NULL AND by_user_id <> (SELECT id FROM k)::text
UNION ALL
SELECT 'lead_activities -> auf dich umgehaengt', count(*)
  FROM lead_activities
 WHERE by_user_id IS NOT NULL AND by_user_id <> (SELECT id FROM k)
UNION ALL
SELECT 'crm_notifications werden geloescht', count(*)
  FROM crm_notifications WHERE user_id <> (SELECT id FROM k)
UNION ALL
SELECT 'crm_push_subscriptions werden geloescht', count(*)
  FROM crm_push_subscriptions
 WHERE user_id IS DISTINCT FROM (SELECT id FROM k);


-- ═══════════════════════════════════════════════════════════════════════════
-- SCHRITT 2 — AUSFÜHREN
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  KEEPER_EMAIL text := 'rico.businessworkspace@gmail.com';   -- <<< ggf. anpassen
  keeper_id    uuid;
  keeper_name  text;
  n_users      int;
  affected     int;
BEGIN
  -- ── Keeper auflösen, sonst Abbruch ───────────────────────────────────────
  SELECT count(*) INTO n_users
    FROM auth.users WHERE lower(email) = lower(KEEPER_EMAIL);

  IF n_users <> 1 THEN
    RAISE EXCEPTION
      'Abbruch: % Accounts fuer "%" gefunden (erwartet: genau 1). Nichts geaendert.',
      n_users, KEEPER_EMAIL;
  END IF;

  SELECT id INTO keeper_id
    FROM auth.users WHERE lower(email) = lower(KEEPER_EMAIL);

  SELECT name INTO keeper_name FROM user_profiles WHERE id = keeper_id;
  keeper_name := coalesce(nullif(trim(keeper_name), ''), split_part(KEEPER_EMAIL, '@', 1));

  RAISE NOTICE 'Keeper: % / % / "%"', KEEPER_EMAIL, keeper_id, keeper_name;

  -- ── 1. Leads umhängen ────────────────────────────────────────────────────
  -- NULL bleibt NULL: das ist der "unassigned"-Pool der Kaltakquise, kein Besitz.
  UPDATE crm_leads
     SET claimed_by = keeper_id
   WHERE claimed_by IS NOT NULL
     AND claimed_by <> keeper_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE '  crm_leads.claimed_by: % Zeilen', affected;

  -- ── 2. Anruf-Historie umhängen ───────────────────────────────────────────
  -- by_user_id ist hier TEXT (kein FK) — deshalb der explizite ::text-Cast.
  UPDATE crm_calls
     SET by_user_id = keeper_id::text
   WHERE by_user_id IS NOT NULL
     AND by_user_id <> keeper_id::text;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE '  crm_calls.by_user_id: % Zeilen', affected;

  UPDATE crm_calls
     SET by_user_name = keeper_name
   WHERE by_user_id = keeper_id::text
     AND by_user_name IS DISTINCT FROM keeper_name;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE '  crm_calls.by_user_name: % Zeilen', affected;

  -- ── 3. Aktivitäten umhängen (hier ist by_user_id uuid) ───────────────────
  UPDATE lead_activities
     SET by_user_id = keeper_id
   WHERE by_user_id IS NOT NULL
     AND by_user_id <> keeper_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE '  lead_activities.by_user_id: % Zeilen', affected;

  UPDATE lead_activities
     SET by_user_name = keeper_name
   WHERE by_user_id = keeper_id
     AND by_user_name IS DISTINCT FROM keeper_name;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE '  lead_activities.by_user_name: % Zeilen', affected;

  -- ── 4. Persönliche Daten der anderen löschen ─────────────────────────────
  -- Nicht übernehmen: hängt an fremden Geräten/Postfächern.
  DELETE FROM crm_notifications WHERE user_id <> keeper_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE '  crm_notifications geloescht: % Zeilen', affected;

  DELETE FROM crm_push_subscriptions WHERE user_id IS DISTINCT FROM keeper_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE '  crm_push_subscriptions geloescht: % Zeilen', affected;

  -- ── 5. Profile und Auth-Accounts löschen ─────────────────────────────────
  -- Reihenfolge: erst Profile, dann auth.users (user_profiles.id -> auth.users).
  DELETE FROM user_profiles WHERE id <> keeper_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE '  user_profiles geloescht: % Zeilen', affected;

  DELETE FROM auth.users WHERE id <> keeper_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE '  auth.users geloescht: % Zeilen', affected;

  -- ── 6. Eigenen Account sauber setzen ─────────────────────────────────────
  INSERT INTO user_profiles (id, name, role, daily_call_goal)
  VALUES (keeper_id, keeper_name, 'developer', 100)
  ON CONFLICT (id) DO UPDATE
     SET role            = 'developer',
         name            = coalesce(nullif(trim(user_profiles.name), ''), EXCLUDED.name),
         -- -1 ist der "gesperrt"-Marker der App
         daily_call_goal = CASE
                             WHEN user_profiles.daily_call_goal IS NULL
                               OR user_profiles.daily_call_goal <= 0
                             THEN 100
                             ELSE user_profiles.daily_call_goal
                           END;

  RAISE NOTICE 'Fertig.';
END $$;

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- SCHRITT 3 — VERIFIKATION
-- ═══════════════════════════════════════════════════════════════════════════
SELECT u.id, u.email, p.name, p.role, p.daily_call_goal
  FROM auth.users u
  LEFT JOIN user_profiles p ON p.id = u.id;
-- Erwartung: genau eine Zeile, role = 'developer'

SELECT 'auth.users'                AS tabelle, count(*) AS zeilen FROM auth.users
UNION ALL SELECT 'user_profiles',            count(*) FROM user_profiles
UNION ALL SELECT 'leads gesamt',             count(*) FROM crm_leads
UNION ALL SELECT 'leads unassigned (NULL)',  count(*) FROM crm_leads WHERE claimed_by IS NULL
UNION ALL SELECT 'calls gesamt',             count(*) FROM crm_calls
UNION ALL SELECT 'activities gesamt',        count(*) FROM lead_activities;

-- Darf nichts zurückgeben: verwaiste Verweise auf gelöschte Nutzer
SELECT 'crm_calls' AS tabelle, by_user_id::text AS verwaiste_id
  FROM crm_calls
 WHERE by_user_id IS NOT NULL
   AND by_user_id NOT IN (SELECT id::text FROM auth.users)
UNION ALL
SELECT 'lead_activities', by_user_id::text
  FROM lead_activities
 WHERE by_user_id IS NOT NULL
   AND by_user_id NOT IN (SELECT id FROM auth.users);
