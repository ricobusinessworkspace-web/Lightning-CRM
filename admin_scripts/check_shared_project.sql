-- ═══════════════════════════════════════════════════════════════════════════
-- Prüfen, ob der Nutzer-Reset andere Apps im selben Supabase-Projekt getroffen hat
-- ═══════════════════════════════════════════════════════════════════════════
-- Hintergrund: auth.users gilt für das GANZE Supabase-Projekt, nicht nur für
-- das CRM. In diesem Projekt liegen auch jarvis_*, g_*, tracker_* und core_*.
-- Falls die eigene Logins hatten, wurden die mitgelöscht.
--
-- Diese Abfragen ändern nichts.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Wie viele Accounts gibt es noch?
SELECT count(*) AS accounts_uebrig FROM auth.users;


-- 2. Welche Tabellen haben überhaupt eine Nutzer-Spalte?
SELECT table_name, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND (column_name LIKE '%user_id%' OR column_name IN ('user','owner_id','claimed_by','created_by'))
 ORDER BY table_name, column_name;


-- 3. Verweise ins Leere: Zeilen, die auf einen gelöschten Account zeigen.
--    Läuft automatisch über alle uuid-Nutzerspalten im Schema.
DO $$
DECLARE
  r        record;
  n        bigint;
  gefunden boolean := false;
BEGIN
  FOR r IN
    SELECT c.table_name AS tbl, c.column_name AS col
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND t.table_type = 'BASE TABLE'
       AND c.udt_name = 'uuid'
       AND (c.column_name LIKE '%user_id%' OR c.column_name IN ('owner_id','claimed_by','created_by'))
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE %I IS NOT NULL
         AND %I NOT IN (SELECT id FROM auth.users)', r.tbl, r.col, r.col
    ) INTO n;

    IF n > 0 THEN
      gefunden := true;
      RAISE NOTICE 'VERWAIST: %.% -> % Zeilen zeigen auf geloeschte Accounts', r.tbl, r.col, n;
    END IF;
  END LOOP;

  IF NOT gefunden THEN
    RAISE NOTICE 'Alles sauber: keine Zeile zeigt auf einen geloeschten Account.';
  END IF;
END $$;
