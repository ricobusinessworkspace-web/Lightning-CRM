---
last_updated: 2026-09-09
last_agent: Claude Sonnet 5 (Altlasten-Aufräumung)
status: Ready for Next Phase
---

## Projekt-Snapshot

**Was ist das Projekt?**
Web-CRM für Leadgenerierung, Kaltakquise und Vertriebs-Pipeline. Aktuell im
**Einzelplatz-Betrieb**: genau ein Nutzer (Rico), ~248 Leads, ~300 Anrufe.

**Aktueller Stand:**
- **Speichersystem:** stabil. Ein Schreibweg (`leadStore.save`), Warteschlange,
  Konflikt-Selbstheilung, Store-Sync.
- **Autospeichern:** zuverlässig über vier Auslöser + `flushLeadForm()` als
  Fluchtpunkt vor jeder Navigation. Keine stillen Datenverluste mehr bei
  Reiterwechsel oder Lead-Wechsel.
- **Aufgaben:** erledigte bleiben als Historie mit Zeitpunkt sichtbar,
  Aufgabenreiter zeigt nur Offenes, auch für Kaltakquise-Leads korrekt gefiltert.
- **Statuszeile:** zeigt Speicherzustand live (Speichert/Gespeichert/Fehler).
- **Tests:** 142 Prüfungen, alle grün.

---

## ⚠️ Kritische Fallen — vor der Arbeit lesen

Jede dieser fünf Punkte hat in einer früheren Sitzung real Zeit gekostet.

### 1. `scratch/schema.sql` ist veraltet und lügt
Kennt `crm_calls`, `lead_activities`, `user_profiles` **gar nicht** und
behauptet eine offene Zugriffsregel für Gäste, die live nicht existiert.
**Nie als Quelle benutzen.** Echten Stand über `admin_scripts/inspect_user_columns.sql`
oder direkt in Supabase abfragen.

### 2. Die Datenbank gehört nicht nur diesem Projekt
Im selben Supabase-Projekt liegen weitere Apps: `jarvis_*`, `g_*`, `tracker_*`,
`core_*`.
- `auth.users` ist **projektweit** — Nutzer löschen trifft alle Apps.
- `user_profiles` wird möglicherweise geteilt — Policies dort nicht anfassen.
- `core_goals`, `core_intentions`, `core_metric_definitions`,
  `core_metric_sources` haben **RLS aus** und sind ungeschützt öffentlich.
  Gehört nicht zum CRM, ist aber bekannt.

### 3. Spaltentypen sind uneinheitlich
| Spalte | Typ | Foreign Key |
|---|---|---|
| `crm_leads.claimed_by` | `uuid` | ja |
| `crm_calls.by_user_id` | **`text`** | nein |
| `lead_activities.by_user_id` | `uuid` | nein |
| `crm_notifications.user_id` | `uuid` | ja |
| `crm_push_subscriptions.user_id` | `uuid` | ja |

Bei dynamischem SQL immer über `::text` vergleichen und auf den echten
Spaltentyp casten.

### 4. Zwei Verzeichnisse heißen `core/`
- `./core/` (Projektwurzel) → `auth.js`, `api.js`, `db.js` — ES-Module
- `./public/core/` → `config.js`, `store.js`, `state.js`, `leadstore.js` —
  klassische Skripte

Vite serviert `public/` unter `/`, deshalb lösen beide auf. **Beim Bearbeiten
auf den richtigen Ordner achten.** `dist/` ist Build-Ausgabe, nie editieren.

### 5b. Der Name „calling-station" ist ein Überrest, kein zweites Projekt

Das Vercel-Deployment von Lightning CRM heißt intern noch `calling-station`
(`.vercel/project.json` → `projectName: "calling-station"`, Live-URL
`calling-station-wardogs.vercel.app`, referenziert in `core/db.js` für
`inviteUser`). Grund: Lightning CRM ist aus einer alten Electron-Desktop-App
namens „Calling Station" hervorgegangen (gleiches Lead-Schema, lokale
SQLite-DB). Der Ordner `/Users/rico/dev/calling-station` mit dieser App wurde
am 09.09.2026 entfernt (Altprojekt, zuletzt als „Day Rail"-Kalenderleiste
weiterverwendet, von Rico bestätigt) — über Git-Historie (Branch `day-rail`
im Sammel-Repo `/Users/rico/dev`) wiederherstellbar. Ebenfalls entfernt:
verwaiste lokale Reste im Lightning-CRM-Ordner selbst
(`calling_station.sqlite` mit 192 alten Leads — Schema deckungsgleich mit
`crm_leads`, Stand 26.06., klar vom heutigen Supabase-Bestand überholt —
sowie `.backup`, `credentials.json`, leere `app.db`, leerer `js/`-Ordner).

Zwei Admin-Skripte, die auf diese Reste zeigten (`inspect_db.js`,
`scratch_pdf.js` — Einmal-Analyse gegen die alte SQLite-DB bzw. PDF-Parser-
Test gegen eine Test-PDF aus dem gelöschten Ordner), sind am 09.09.2026
ebenfalls entfernt worden. Beide waren ohne Bezug zum laufenden Betrieb.

### 5. Ladereihenfolge entscheidet
```
core/config.js → core/auth.js → core/store.js → core/state.js → core/leads.js
→ core/tasks.js → core/pipeline.js → ui/pipeline_ui.js → ui/main_ui.js
→ modules/scraper.js → ui/profile-modal.js → ui/init.js
```
`pipeline_ui.js` läuft **vor** `main_ui.js`. Nie Funktionen aus `main_ui.js`
auf oberster Ebene von `pipeline_ui.js` umschließen — ein Auto-Save-Wrapper
ist genau daran monatelang stillschweigend gescheitert.

---

## Was funktioniert (behalte das)

- **Einziger Schreibweg:** `window.leadStore.save()` in `public/core/leadstore.js`.
  Neue Schreibpfade gehen dort durch, nicht direkt über `api.saveLead`. Einzige
  Ausnahme: *neue* Leads ohne `id` (Scout-Import, „Neuer Lead").
  ```js
  await window.leadStore.save(leadId, { task_text: '…' }, { label: 'Aufgabe' });
  ```
  Erledigt: Warteschlange (kein Gleichzeitig-Schreiben), nur genannte Spalten,
  Zeitstempel-Selbstheilung bei Konflikt, Store-Sync auf `state.leads` **und**
  `tabCache` gemeinsam.

- **Autospeichern — vier Auslöser, ein Fluchtpunkt:**

  | Auslöser | wann |
  |---|---|
  | `input` in der Seitenleiste | 900 ms nach letzter Eingabe |
  | `change` | Auswahl-/Datumsfelder, sofort |
  | `focusout` | Feld verlassen |
  | **`flushLeadForm()`** | **vor jeder Navigation** |

  `window.flushLeadForm()` ist der Fluchtpunkt und darf nirgends fehlen.
  Aufrufer: `openLeadDirectly`, `switchTab`, `closeLeadSidebar`,
  `visibilitychange` / `pagehide` / `beforeunload` in `ui/init.js`.

  Grund: `switchTab`/`closeLeadSidebar` setzen `currentSelectedLeadId` sofort
  auf `null`. Ohne Fluchtpunkt fand ein verzögertes Autospeichern danach nichts
  mehr vor und hat still verworfen.

  Zwei Dinge machen es verlässlich:
  - Lead-Zugehörigkeit steht am Formular (`data-lead-id` auf `.focused-lead`),
    gelesen über `window.getFormLeadId()` — **nicht** in `currentSelectedLeadId`.
  - Angefangene Eingaben werden **direkt aus dem DOM** geholt
    (`capturePendingTasks()`, `captureTaskEdits()`), nicht über `onblur`
    erwartet — `blur` feuert nicht, wenn das Fenster selbst den Fokus verliert
    (Handy sperren, Tab wechseln).

- **Statuszeile ist Teil des Vertrags:** `#save-status` im Kopf der
  Seitenleiste zeigt „Speichert…", „Gespeichert 14:32",
  „Änderung noch nicht gespeichert" oder „Speichern fehlgeschlagen" +
  „Erneut versuchen". **Nicht wegoptimieren** — ohne sie sieht ein
  stillschweigend fehlgeschlagener Schreibvorgang wie ein erfolgreicher aus.

- **Zwei Bindungen gegen Falsch-Schreiben beim Lead-Wechsel:**
  - Aufgaben: `window.currentTasks` gehört zu `window.currentTasksLeadId`,
    gesetzt über `window.bindTasksToLead(lead)` sofort beim Wechsel.
  - Formular: `data-lead-id` auf `.focused-lead`; `saveLeadMain` bricht ab,
    wenn ID nicht passt.

- **Single-Card-Refresh:** `refreshLeadCard(id)` → `patchLeadCard(id)` tauscht
  nur einen DOM-Knoten. **Nicht auf `loadUi()` zurückbauen** — kostet
  Scrollposition und Sortierung.

- **Aufgaben-Historie:** erledigte bleiben in der Detailansicht sichtbar
  (neueste zuerst, mit Zeitpunkt `done_ms`), wieder zu öffnen, einzeln oder
  gesammelt löschbar. Aufgabenreiter zeigt sie nicht. Dort wird **nur bei
  mehreren Nutzern** nach Zuweisung gefiltert — sonst fällt jeder
  Kaltakquise-Lead raus (`claimed_by = null`).

---

## Bewusste Entscheidungen — bitte nicht zurückbauen

Antworten auf konkrete Beschwerden, keine Zufälle.

- **Anrufe kennen kein „erreicht/nicht erreicht".** `call_status` nur
  `never`/`called`. `crm_calls.status` existiert noch, wird nirgends ausgewertet.
- **Keine versteckte Ausblende-Logik.** Früher verschwanden Leads, wenn im
  Aufgabentext „mail" vorkam (traf auch „Rechnung mailen"). Leads bleiben
  immer sichtbar.
- **Offene Aufgaben zeigt ein kleines `+`** hinter dem Pipeline-Status. Kein
  Badge, kein Icon.
- **Pipeline-Stufen schalten nicht um.** Ein Klick setzt genau diese Stufe.
- **Snooze-Knopf schaltet um:** Klick auf markierte Auswahl hebt Wiedervorlage
  auf. Merker in `window._activeSnoozeChoice`, **nicht** in
  `store.state.currentSnoozeOffset` (das würde bei jedem Speichern die
  Wiedervorlage weiterschieben).
- **E-Mail und WhatsApp sind dieselbe Aktivität** (Typ `message`). Alte
  Einträge stehen als `email`, werden gleich angezeigt und gezählt.
- **Zusammenführen nur bei gleicher Google-Place-ID.** Früher über Name+Stadt
  still zusammengeführt — zweimal „Neuer Lead" öffnete beim zweiten Klick den
  ersten.
- **Sortierung bleibt nach dem Speichern stehen**, bis komplett neu geladen
  wird.

---

## Gelöste Probleme (nicht wiederholen)

- **Problem:** Änderungen gingen beim Reiterwechsel verloren.
  **Lösung:** `flushLeadForm()` vor jeder Navigation; Formular (`data-lead-id`)
  statt Auswahl-State ist Quelle der Wahrheit.
  **Warum wichtig:** `switchTab`/`closeLeadSidebar` leeren die Auswahl sofort —
  jeder spätere Save-Versuch hätte sonst ins Leere gegriffen.

- **Problem:** Aufgabentexte verschwanden beim Sperren des Handys.
  **Lösung:** Texte direkt aus dem DOM lesen (`captureTaskEdits`), nicht auf
  `onblur` verlassen.
  **Warum wichtig:** `blur` feuert nicht bei Fenster-Fokusverlust.

- **Problem:** Kaltakquise-Leads fehlten komplett im Aufgabenreiter.
  **Lösung:** Zuweisungsfilter nur bei `multiUser: true`, unzugewiesene immer
  sichtbar.
  **Warum wichtig:** Kaltakquise-Leads haben `claimed_by = null` — der Filter
  hat sie im Einzelplatz-Betrieb komplett ausgeblendet.

- **Problem:** Speichern schlug manchmal still fehl, kein Hinweis.
  **Lösung:** Statuszeile `#save-status`, gespeist aus `leadStore`.
  **Warum wichtig:** Ohne Rückmeldung ist ein Fehlschlag von Erfolg nicht zu
  unterscheiden — genau daran war Vertrauen verloren gegangen.

- **Problem:** „Speichert erst nach Neuladen" bei Zeitstempel-Konflikten.
  **Lösung:** `leadStore.save` holt bei Konflikt einmal den echten Stand und
  wiederholt automatisch.

---

## Offene Entscheidungen

- **`getAgentStats` lädt alle Anrufe in den Browser.** PostgREST-Limit 1000
  Zeilen — Dashboard zählt darüber still falsch. ~300 Anrufe aktuell, also
  Monate Puffer. Sollte SQL-View mit `GROUP BY` werden. Einziger Posten mit
  Ablaufdatum.
- **`crm_calls.by_user_id` ist `text` statt `uuid` + Foreign Key.** Bei ~300
  Zeilen harmlos, später nicht mehr.
- **`pipeline_ui.js` hat ~2860 Zeilen.** Listen/Sidebar/Karte/Dashboard sind
  vier Themen in einer Datei — aufteilen?
- **Echtes Schema versioniert ablegen**, `scratch/schema.sql` löschen. Zehn
  Minuten, verhindert Falle 1 dauerhaft.
- **Wann auf `multiUser: true` umschalten?** Siehe Checkliste unten — noch
  nicht terminiert.

---

## Tech Stack & Key Dependencies

| Was | Details |
|---|---|
| Frontend | Vanilla JS, kein Framework. Globale `window.*`, HTML als Template-String via `innerHTML`. |
| Build/Dev | Vite: `npm run dev` (Port 3000), `npm test`, `npm run build`. |
| Backend | Supabase (PostgreSQL + Auth + Realtime). |
| Serverfunktionen | Vercel Functions unter `/api/` — Vite serviert sie **nicht**, nur nach Deploy oder mit `vercel dev` prüfbar. |
| Tests | `tests/ui.test.mjs`, jsdom, 142 Prüfungen, ~1 Sekunde. |
| Deployment | Push auf `master` → Vercel deployt automatisch. **Nicht ungefragt pushen.** |

**Verzeichnisse:**
```
index.html               Layout, Modals, Navigation, Skript-Reihenfolge
core/db.js       (1057)  Supabase-Zugriff, gesamte Datenlogik
core/api.js        (92)  window.api — dünne Fassade über db.js
core/auth.js       (33)  Passkey-Stub, Developer-Unlock
public/core/config.js    DER SCHALTER (multiUser)
public/core/store.js     Proxy-Store, window.store.state
public/core/leadstore.js (173) DER EINZIGE SCHREIBWEG
public/ui/pipeline_ui.js (2860) Listen, Karten, Sidebar, Karte, Dashboard
public/ui/main_ui.js     (1523) Speichern, Aufgaben, Snooze, Toasts, Bulk
public/modules/scraper.js (746) Radar Scout (Google Places / OSM)
ui/init.js         (513) Bootstrap, Login, Realtime-Abo
api/               Vercel Functions + api/_lib/auth.js
admin_scripts/     SQL für Wartung — schreibt direkt auf Produktiv-DB, siehe unten
tests/ui.test.mjs  142 Prüfungen
```

**Einzelplatz-Modus:** Schalter in `public/core/config.js`:
```js
window.APP_CONFIG = { multiUser: false };
```
Bei `false` ausgeblendet: Registrierung, Einladungen, Nutzerverwaltung, Rollen,
Lead-Zuweisung, Sales-Bell-Push, Punkte-System. **Nichts gelöscht.**

Checkliste vor Rückschalter auf `multiUser: true`:
1. `multiUser: true` setzen.
2. Supabase → Authentication → Email → „Allow new users to sign up" nur bei
   gewünschter Selbstregistrierung.
3. **Zugriffsregeln schärfen.** Auf `crm_leads` liegt `auth_full_access`
   (jeder Angemeldete alles) neben feineren Regeln — additiv, großzügigste
   gewinnt. Rollentrennung existiert heute nur in der Oberfläche.
4. Vercel: `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` setzen.
5. `saveLeadMain` ist bereits auf Teil-Updates umgestellt (erledigt).

---

## Vision & Langziel

Robustes, verlässliches Einzelplatz-CRM, das bei Bedarf ohne Codeänderung auf
Team-Betrieb umschaltet (Schalter, nicht Umbau). Kernprinzip: nichts geht
still verloren — jede Speicherung ist sichtbar rückgemeldet, jeder Konflikt
heilt sich selbst, jede Navigation sichert vorher ab.

---

## Für nächsten Agent

- **Lies zuerst** die „⚠️ Kritische Fallen" oben — jede hat schon einmal Zeit
  gekostet.
- **Erst prüfen, dann behaupten.** Eine Warnung auf Basis einer veralteten
  Datei (`scratch/schema.sql`) hat schon einmal Vertrauen gekostet. Read-only-
  Abfragen sind billig.
- **SQL immer einzeln.** Eine Anweisung geben, auf das Ergebnis warten, dann
  die nächste. Nie mehrere SQL-Blöcke in einer Nachricht, auch nicht bei
  reinen Abfragen. Ausdrücklich so gewünscht.
- **Nicht ungefragt pushen.** Push auf `master` geht direkt live.
- **Deutsch, keine Fachsprache.** Nicht „RLS-Policy", sondern „Zugriffsregel".
  Nicht „Endpoint", sondern „Serverfunktion".
- **Bestehende, funktionierende Lösungen nicht ersetzen.** Siehe „Bewusste
  Entscheidungen" oben.
- **Offensichtliche Bedienprobleme mit aufräumen**, statt sie nur zu nennen —
  ausdrücklich so gewünscht.
- **`npm test` nach jeder Änderung** an `main_ui.js`, `pipeline_ui.js` oder
  `leadstore.js`.
- **⚠️ Admin-Skripte schreiben direkt auf der produktiven Datenbank.** Alles
  in `admin_scripts/` umgeht teilweise App-Logik und UI-Checks — ein Fehler
  kann zu unwiderruflichem Datenverlust führen. Immer read-only-Schritte
  zuerst ausführen, vor jeder schreibenden Aktion Backup über
  Supabase → Database → Backups sicherstellen.

---

## Handover-Historie
- 2026-09-09 — `admin_scripts/README.md` aufgelöst: Inhalt (Produktiv-DB-
  Warnung) hier unter „Für nächsten Agent" übernommen, Datei gelöscht.
  HANDOVER.md ist jetzt die einzige Doku im Projekt (Single Source of
  Truth, ausdrücklich so gewünscht) (Claude Sonnet 5).
- 2026-09-09 — Die zwei kaputten Admin-Skripte (`inspect_db.js`,
  `scratch_pdf.js`), die auf die entfernten calling-station-Reste zeigten,
  gelöscht (Claude Sonnet 5).
- 2026-09-09 — `calling-station`-Verwirrung geklärt (siehe Falle 5b) und
  aufgeräumt: alter Electron-App-Ordner entfernt, verwaiste lokale
  Datenreste im Lightning-CRM-Ordner in den Papierkorb verschoben (Claude
  Sonnet 5).
- 2026-09-09 — Workflow-Standardisierung nach `coding-workflow-standards.md`,
  Inhalt vollständig aus dem Vorgänger-Handover übernommen (Claude Sonnet 5).
- 2026-09-09 — Autospeichern-Fix (vier Auslöser, Fluchtpunkt, Statuszeile),
  Aufgaben-Historie mit Zeitpunkt, Aufgabenreiter-Filter korrigiert (Claude
  Opus 5).
- 2026-09-09 — Ein Schreibweg für alle Lead-Änderungen (`leadStore`),
  E-Mail/WhatsApp als vereinheitlichte Aktivität `message` (Claude Opus 5).
