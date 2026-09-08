-- ═══════════════════════════════════════════════════════════════════════════
-- Alte Aktivitäts-Beschriftungen aufräumen
-- ═══════════════════════════════════════════════════════════════════════════
-- "Status geändert auf FOLLOW-UP" steht nirgends mehr im Code — das sind
-- Einträge aus einer früheren Version, die als fertiger Text in
-- lead_activities.details gespeichert wurden. Der Code schreibt heute nur noch
-- COLD / PITCH / DATA / OFFER / CLOSED.
--
-- FOLLOW-UP war die frühere Bezeichnung der Stufe DATA.
--
-- Hinweis zum Muster: geschrieben als '%FOLLOW%UP%', damit alle Schreibweisen
-- erfasst werden — "FOLLOW-UP", "FOLLOW UP" und "FOLLOWUP".
-- ═══════════════════════════════════════════════════════════════════════════

-- ── SCHRITT 1: Bestand ansehen (ändert nichts) ────────────────────────────
SELECT details, count(*) AS anzahl
  FROM lead_activities
 WHERE type = 'status_change'
 GROUP BY details
 ORDER BY anzahl DESC;


-- ── SCHRITT 2: Umschreiben ────────────────────────────────────────────────
BEGIN;

UPDATE lead_activities
   SET details = 'Status geändert auf DATA'
 WHERE type = 'status_change'
   AND details ILIKE '%FOLLOW%UP%';

COMMIT;


-- ── SCHRITT 3: Kontrolle ──────────────────────────────────────────────────
SELECT details, count(*) AS anzahl
  FROM lead_activities
 WHERE type = 'status_change'
 GROUP BY details
 ORDER BY anzahl DESC;

-- Erwartet: CLOSED 6, DATA 6, OFFER 5 — kein FOLLOW-UP mehr.
