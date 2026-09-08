-- ═══════════════════════════════════════════════════════════════════════════
-- Alte Aktivitäts-Beschriftungen aufräumen
-- ═══════════════════════════════════════════════════════════════════════════
-- "Status geändert auf FOLLOW UP" steht nirgends mehr im Code — das sind
-- Einträge aus einer früheren Version, die als fertiger Text in
-- lead_activities.details gespeichert wurden. Der Code schreibt heute
-- COLD / PITCH / DATA / OFFER / CLOSED.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── SCHRITT 1: Was steht überhaupt drin? (ändert nichts) ──────────────────
SELECT details, count(*) AS anzahl
  FROM lead_activities
 WHERE type = 'status_change'
 GROUP BY details
 ORDER BY anzahl DESC;


-- ── SCHRITT 2: Alte Bezeichnungen auf die heutigen umschreiben ───────────
-- FOLLOW UP / FOLLOWUP war die frühere Bezeichnung der Stufe DATA.
BEGIN;

UPDATE lead_activities
   SET details = 'Status geändert auf DATA'
 WHERE type = 'status_change'
   AND (details ILIKE '%FOLLOW UP%' OR details ILIKE '%FOLLOWUP%');

-- Weitere Altbezeichnungen, falls vorhanden
UPDATE lead_activities
   SET details = 'Status geändert auf PITCH'
 WHERE type = 'status_change' AND details ILIKE '%ENTSCHEIDER%';

UPDATE lead_activities
   SET details = 'Status geändert auf DATA'
 WHERE type = 'status_change' AND details ILIKE '%TERMIN%';

UPDATE lead_activities
   SET details = 'Status geändert auf OFFER'
 WHERE type = 'status_change' AND details ILIKE '%RECHNUNG%';

COMMIT;


-- ── SCHRITT 3: Kontrolle — es sollten nur noch die fünf Stufen dastehen ──
SELECT details, count(*) AS anzahl
  FROM lead_activities
 WHERE type = 'status_change'
 GROUP BY details
 ORDER BY anzahl DESC;

-- Erwartet: nur noch "Status geändert auf COLD / PITCH / DATA / OFFER / CLOSED"
