# Neun Tabellen ohne Zugriffsregeln

**Stand 11.09.2026. Betrifft nicht das CRM — aber dieselbe Datenbank.**

Supabase meldet neun Tabellen mit abgeschalteten Zugriffsregeln:

| Tabelle | Zeilen | Gehört zu |
|---|---|---|
| `core_metric_definitions` | 8 | Jarvis / Kennzahlen |
| `core_metric_sources` | 11 | Jarvis / Kennzahlen |
| `core_intentions` | 8 | Jarvis |
| `core_goals` | 2 | Jarvis |
| `core_manual_values` | 2 | Jarvis |
| `ingest_reminders` | 1 | Jarvis / Datenübernahme |
| `ingest_health_daily` | 2 | Jarvis / Datenübernahme |
| `ingest_status` | 2 | Jarvis / Datenübernahme |
| `ingest_health_targets` | 2 | Jarvis / Datenübernahme |

**Was das heißt:** Der anon-Schlüssel steht öffentlich im Browser-Code *und* im
öffentlichen GitHub-Repository. Wer ihn hat, kann in diesen neun Tabellen alles
lesen und alles ändern. Ohne Anmeldung.

**Alle CRM-Tabellen sind nicht betroffen** — `crm_leads`, `crm_calls`,
`lead_activities`, `crm_notifications`, `crm_push_subscriptions`,
`crm_metric_targets` und `crm_settings` haben ihre Regeln.

---

## Warum hier nichts automatisch repariert wurde

Regeln einzuschalten, ohne gleichzeitig welche zu hinterlegen, **sperrt alles
aus** — auch die Jarvis-App, die diese Tabellen benutzt. Der Schalter allein
macht es also nicht besser, sondern kaputt.

Die Tabellen gehören zu **Jarvis-OS**, nicht zum CRM. Wer das anfasst, sollte
vorher wissen, wie Jarvis darauf zugreift: mit Anmeldung oder ohne.

## Wenn Jarvis mit Anmeldung zugreift

Dann ist es ein Zweizeiler pro Tabelle. **Erst eine Anweisung, Ergebnis
ansehen, dann die nächste** — nicht alle auf einmal.

Schritt 1, nur ansehen:

```sql
SELECT tablename, policyname, roles, cmd
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('core_metric_definitions','core_metric_sources',
                     'core_intentions','core_goals','core_manual_values',
                     'ingest_reminders','ingest_health_daily',
                     'ingest_status','ingest_health_targets')
 ORDER BY tablename;
```

Erwartung: keine Zeile. Kommt doch eine, hat die Tabelle schon Regeln und
braucht diese Behandlung nicht.

Schritt 2, eine Tabelle zur Probe (hier `core_goals`):

```sql
ALTER TABLE public.core_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "angemeldete_duerfen_alles" ON public.core_goals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

Schritt 3: Jarvis öffnen und nachsehen, ob die Ziele noch erscheinen. Erst
wenn das stimmt, dieselben zwei Zeilen für die übrigen acht Tabellen — eine
nach der anderen.

## Zurücknehmen

```sql
ALTER TABLE public.core_goals DISABLE ROW LEVEL SECURITY;
```
