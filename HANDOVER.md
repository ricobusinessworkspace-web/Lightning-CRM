---
last_updated: 2026-09-24
last_agent: Claude Opus 5.5 (Rückruf-Timer: Drehrad, Glocke, Push)
status: Ready for Next Phase — ein Punkt duldet keinen Aufschub (Kasten ganz oben)
---

> **SSOT-Regel:** HANDOVER.md ist Single Source of Truth für den **Zustand**
> — „wo stehen wir, was war kaputt, was ist offen" — nicht für alles. Wird
> vor jeder Prompt gelesen und nach jeder fortgeschrieben, deshalb schlank
> halten: nur Deltas, kein Tutorial-Material. Schritt-für-Schritt-Anleitungen,
> die selten gebraucht werden, gehören nach `docs/`, nicht hierher.

| Datei | Zweck | Lesen wann |
|---|---|---|
| `HANDOVER.md` (hier) | Zustand: fertig / kaputt / offen | Vor jeder Prompt |
| `README.md` | Menschen-Einstieg, Tech-Stack, Befehle, Verzeichnisse | Einmal beim Einstieg |
| `AGENTS.md` | Verweis auf `~/dev/coding-workflow-standards.md` | Vor der allerersten Prompt |
| `docs/*.md` | Runbooks — Schritt-für-Schritt, einmalige Vorgänge | Nur wenn gerade gebraucht |
| `docs/mcp-server-einrichten.md` | Adresse, Zugangswort, Connector eintragen | Wenn der MCP-Zugang klemmt |
| `docs/ungeschuetzte-tabellen.md` | Neun Jarvis-Tabellen ohne Zugriffsregeln | Wenn jemand Jarvis anfasst |
| `docs/wohin-das-geht.md` | Richtung und Reihenfolge der nächsten Schritte | Wenn unklar ist, was als Nächstes dran ist |
| `docs/lesevertrag-jarvis.md` | Was Jarvis OS aus dem CRM liest: Sichten, `metric_key`-Katalog, Grenzen | Bevor jemand die Kennzahlen anfasst oder Jarvis anbindet |

**Module unter `public/modules/`** — jedes für eine Sache, jedes mit eigener
Prüfdatei: `oeffnungszeiten.js` (versteht Google-Zeiten), `kontaktdaten.js`
(liest Telefon/E-Mail aus Webseiten), `backfill.js` (trägt sie nach),
`karte.js` (Landkarte), `scraper.js` (Radar Scout, Altbestand).

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
- **Rückfragen:** ein Dialog für die ganze Anwendung (`confirmAction`) in der
  Form des Apple-Systemdialogs — dunkel und auf Deutsch. Der echte Systemdialog
  kommt nicht mehr vor.
- **Meldungen:** eine ruhige dunkle Karte mit farbigem Punkt, gleiche Sprache
  wie der Dialog. Höchstens drei gleichzeitig.
- **Mehrfachauswahl:** Antippen ändert genau eine Karte, ohne die Liste neu zu
  laden.
- **Stile:** ein Satz Tokens statt zweier konkurrierender Ebenen; die Fassung
  mit `!important`, die alles überschrieben hat, ist aufgelöst.
- **MCP-Server:** `api/mcp.js` — neun Werkzeuge, lesend und schreibend.
  **Läuft live** unter `https://calling-station.vercel.app/api/mcp`.
  Zwei Zugangswege: das feste `MCP_TOKEN` in der Kopfzeile (curl, Claude Code)
  und OAuth 2.1 über den eigenen Anmelde-Server (`api/oauth/*`) — den verlangt
  die Connector-Maske von Claude, sie kennt kein Feld für ein festes Wort.
  Einrichtung: [docs/mcp-server-einrichten.md](docs/mcp-server-einrichten.md).
- **Lead-Karteikarte:** Kontakt hält Telefon und E-Mail. Die Adresse im
  Standort-Kasten führt zur Karte **in der Anwendung**; die beiden Wege nach
  draußen (Webseite, Google Maps) stehen als zwei blaue Links darunter.
  Öffnungszeiten sagen nur „Geöffnet" oder „Geschlossen".
- **Kontaktdaten aus dem Impressum:** `public/modules/kontaktdaten.js` liest
  Telefon und E-Mail von einer Firmenseite — Startseite, Impressum, Kontakt,
  höchstens drei Seiten. Reine Textarbeit, kein DOM, dieselbe Datei läuft im
  Browser und im Test. Nachtragen für den ganzen Bestand über
  Einstellungen → Datenbank-Tools (`public/modules/backfill.js`).
- **Landkarte:** `public/modules/karte.js` — eigene Ansicht für Aufnahmen.
  GTA-Optik, gelbe Route, Spieler-Pfeil, HUD. **Dort steht kein Kundenname**
  (siehe „Bewusste Entscheidungen").
- **Öffnungszeiten:** `public/modules/oeffnungszeiten.js` versteht die
  englischen Google-Zeiten. Liste, Karteikarte und Karte fragen dieselbe Stelle.
- **Datenpflege:** leere Textfelder sind **NULL**, nicht `''`. Gilt für
  `email`, `impressum_phone`, `legal_company_name`, `director_name`,
  `phone_source`, `website_url`. Durchgesetzt in `core/db.js` (Anlegen *und*
  Ändern), geprüft in `tests/datenpflege.test.mjs`.
- **`company_domain`:** normalisierter Host aus `website_url`, wird bei jedem
  Schreibvorgang mitgeführt. **`is_multi_site`:** true, wenn dieselbe Domain
  mehrfach vorkommt — Plattformen ausgenommen. Neu berechnet von der
  SQL-Funktion `crm_multi_site_neu()`, aufgerufen am Ende jedes Imports.
- **Zwei Schreibwege, eine Regel:** `core/db.js` (Browser) und
  `api/_lib/crm.js` (MCP/Jarvis) setzen beide leeren Text auf NULL und leiten
  `company_domain` aus `website_url` ab. Wer die Regel ändert, muss beide
  Dateien anfassen — geprüft in `tests/mcp.test.mjs`.
- **Tests:** 518 Prüfungen, alle grün — 267 Oberfläche (`tests/ui.test.mjs`),
  63 MCP-Server (`tests/mcp.test.mjs`), 46 Anmelde-Vorgang
  (`tests/oauth.test.mjs`), 42 Kontaktdaten (`tests/kontaktdaten.test.mjs`),
  27 Öffnungszeiten, 24 Landkarte. `npm test` fährt alle sechs.

---

## 🔴 Sofort — offener Schlüssel im öffentlichen Repository

Am 10.09.2026 geprüft: das GitHub-Repository
`ricobusinessworkspace-web/Lightning-CRM` steht auf **öffentlich** und ist ohne
Anmeldung abrufbar. In `admin_scripts/backfill_places.js:12` steht ein
**Google-Schlüssel im Klartext**. Er ist damit für jeden lesbar und kann auf
deine Rechnung benutzt werden.

Zu tun:
1. **Schlüssel in der Google Cloud Console sperren, neuen anlegen.** Das ist
   der eigentliche Fix und nur von dort aus möglich.
2. Neuen Schlüssel einschränken — nur die benötigte Schnittstelle, nur die
   Adresse der App.
3. Entscheiden, ob das Repository überhaupt öffentlich sein soll.

~~4. Schlüssel aus der Datei nehmen.~~ **Erledigt am 11.09.2026:**
`backfill_places.js` liest ihn jetzt aus `GOOGLE_PLACES_API_KEY` und bricht
ohne die Variable mit einem Hinweis ab. **Das entschärft nichts rückwirkend** —
der alte Schlüssel steht weiter in der Versionsgeschichte und ist von dort
nicht zu entfernen. Schritt 1 bleibt offen.

**Nachgeprüft am 23.09.2026:** Das Repository ist **weiterhin öffentlich**
(ohne Anmeldung abrufbar). Im aktuellen Code steht kein Google-Schlüssel mehr,
in der Versionsgeschichte genau einer (beginnt mit `AIzaSyD099…`). Ob er in
der Google Cloud Console schon gesperrt ist, lässt sich von hier nicht sehen —
Schritte 1 bis 3 liegen bei Rico.

Der Supabase-Schlüssel gleich daneben ist **kein** Problem: der „anon"-Schlüssel
ist öffentlich gedacht, geschützt wird über die Zugriffsregeln.

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

- **Ein Schreibweg im Browser:** `window.leadStore.save()` in
  `public/core/leadstore.js`. Neue Schreibpfade gehen dort durch, nicht direkt
  über `api.saveLead`. Einzige Ausnahme: *neue* Leads ohne `id` (Scout-Import,
  „Neuer Lead").

  ⚠️ **Seit 11.09.2026 gibt es einen zweiten Schreibweg**, und der lässt sich
  nicht vermeiden: `api/_lib/crm.js` schreibt von der Serverseite aus für den
  MCP-Server. Dort gibt es weder `window` noch eine angemeldete Sitzung, also
  auch keinen `leadStore`. Die **Regeln** sind dieselben und stehen dort noch
  einmal ausgeschrieben: nur genannte Spalten, `last_edited_ms` mitziehen,
  Fremdänderung erkennen, Stufenwechsel mit alter *und* neuer Stufe festhalten,
  `closed_at_ms` nur einmal setzen. **Wer an diesen Regeln etwas ändert, muss
  beide Dateien anfassen.** Prüfblock 7 in `tests/mcp.test.mjs` sichert sie ab.
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

- **Eine Rückfrage für alles:** `window.confirmAction({ title, message,
  confirmLabel, destructive })` in `public/ui/main_ui.js`, Rückgabe ist ein
  `Promise<boolean>`.
  ```js
  if (!await window.confirmAction({
        title: 'Lead löschen?',
        message: 'Der Lead wird mit seinem gesamten Verlauf entfernt.',
        confirmLabel: 'Löschen' })) return;
  ```
  Esc bricht ab, Enter bestätigt, Klick daneben bricht ab, der Fokus liegt auf
  „Abbrechen" und geht danach dorthin zurück, wo er herkam. `destructive: false`
  macht den Knopf blau statt rot. **Kein `confirm()` und kein `alert()` mehr** —
  Prüfung 24 lässt keinen durch, Fehlermeldungen laufen über `showToast`. Die
  alte Form `showConfirmDialog(titel, text, label, rückruf)` leitet nur noch
  hierher weiter.

- **Eine Bildsprache, an einer Stelle festgelegt.** Farben, Abstände, Radien,
  Schrift und Bewegung stehen in `theme.css`; `styles.css` benutzt sie. Für die
  dünnen Linien und aufgehellten Flächen auf dunklem Grund gibt es je drei
  Stufen: `--hairline-soft/-/-strong` und `--fill-faint/-subtle/-hover`.
  **Keine neuen `rgba(255,255,255,x)` von Hand** — vorher lagen dort acht
  verschiedene Stärken für denselben Zweck.

- **`!important` ist die Ausnahme, nicht das Mittel.** In `styles.css` stand ein
  zweiter, späterer Stil-Satz („UX OVERHAUL"), der die Regeln darüber
  durchgehend mit `!important` ausgehebelt hat — zwei Gestaltungen für dieselben
  Bauteile. Zusammengeführt. Wer etwas ändern will, ändert die eine Regel.

- **Anzeige-Zustand lädt nichts nach.** Auswählen, Markieren, Aufklappen ändern
  keine Daten — also darf nichts nachgeladen werden. `handleLeadClick` legt in
  der Mehrfachauswahl nur die Klasse `is-selected` und das Kästchen der einen
  Karte um. Regel für neue Bedienelemente: **erst fragen, ob sich Daten ändern.
  Wenn nein, gehört kein `loadUi()` hinein.**

- **`window.listenKennung(cacheKey, leads)` verhindert doppeltes Zeichnen.**
  `loadUi` zeichnet absichtlich zweimal (erst Zwischenspeicher, dann Server).
  Sind beide gleich, wird der zweite Durchgang übersprungen. Die Kennung deckt
  Reiter, Filter, den Stand jedes Leads, den Auswahlmodus und die offene Karte
  ab. **Wer etwas hinzufügt, das das Aussehen der Karten ändert, ohne einen
  Wert am Lead zu ändern, muss es in die Kennung aufnehmen** — sonst bleibt die
  Änderung unsichtbar. Prüfung 23 sichert die bekannten Fälle.

- **`window.resetSidebar()` ist der eine Weg zur leeren Seitenleiste.** Stand
  vorher achtmal als aufgeklappter Block da, mit drei verschiedenen Ersatz-
  Bezeichnern (`#sidebar`, `.sidebar`, `#main-sidebar`) — und `#sidebar` gibt es
  im HTML gar nicht. Der echte Knoten ist `#main-sidebar`.

- **Aufgaben-Historie:** erledigte bleiben in der Detailansicht sichtbar
  (neueste zuerst, mit Zeitpunkt `done_ms`), wieder zu öffnen, einzeln oder
  gesammelt löschbar. Aufgabenreiter zeigt sie nicht. Dort wird **nur bei
  mehreren Nutzern** nach Zuweisung gefiltert — sonst fällt jeder
  Kaltakquise-Lead raus (`claimed_by = null`).

---

## Bewusste Entscheidungen — bitte nicht zurückbauen

Antworten auf konkrete Beschwerden, keine Zufälle.

- **Jeder Anruf zählt, egal wie er ausging.** Copy-Knopf = Anruf gezählt.
  Seit 24.09.2026 (Wunsch Rico) lässt er sich im Verlauf **nachträglich**
  einordnen: ✓ durchgestellt / ✕ nicht erreicht (`crm_calls.outcome`:
  `reached`/`not_reached`/NULL) plus Notiz (`crm_calls.notes`). Das ändert an
  keiner Zählung etwas. `call_status` am Lead bleibt `never`/`called`.
  **Nicht verwechseln:** die Altspalte `crm_calls.status` (Default `answered`)
  steht in allen Zeilen und bedeutet nichts — nie auswerten.
- **Wiedervorlage = Rückruf-Timer (seit 24.09.2026).** Drehrad Tage/Std./Min.
  (5er-Schritte, startet auf 0) oder Datum → 8:00. Geschrieben wird nur
  `snooze_until_ms`, erst mit „Setzen“. Jede fällige Wiedervorlage meldet sich:
  im CRM als Karte unter der Glocke (mit Ton, abschaltbar), auf den Geräten per
  Push. **Nachtruhe 21–8 Uhr (Berlin):** kein Push, um 8:00 gesammelt; im CRM
  erscheint sie trotzdem sofort. Abgehakt = Anruf/Nachricht nach Fälligkeit
  (`last_contact_ms`) oder × (`snooze_erledigt_ms`). „Später“ = +10 Min.
  **`snooze_until_ms` von Altfällen nie anfassen** — `crm_stock_metrics` liest es.
- **Löschen im Verlauf ist ein Papierkorb**, kein ✕ — das ✕ heißt beim Anruf
  „nicht erreicht".
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
- **Reihenfolge der Karteikarte folgt dem Gespräch**, nicht der Datenbank:
  Kontakt → Standort → Notizen → Aufgaben → Historie → Wiedervorlage → Wert →
  Eigenschaften → Verknüpfte Leads → Zuweisung. Erst handeln, dann einordnen,
  dann verwalten. Prüfung 27d hält die Reihenfolge fest.
- **Webseite und Karte sind von der Karteikarte aus erreichbar**, nicht nur
  über die Sprechblase an der Landkarte. Gelesen wird aus dem Formular
  (`#sys-web`, verstecktes Feld), damit auch eine gerade eingetippte, noch
  nicht gespeicherte Adresse zählt.
- **Die Adresse ist kein blauer Link.** Sie führt zur Karte in der Anwendung
  und sieht aus wie Text. Blau sind nur die beiden Wege nach draußen darunter.
- **Fremde Seiten öffnen als Reiter, nicht als Fenster.** `openExternal` klickt
  einen unsichtbaren Verweis mit `target="_blank"` statt `window.open()` —
  Safari macht daraus sonst je nach Einstellung ein eigenes Fenster.
- **Nachtragen schreibt nur in leere Felder** und **erst nach Bestätigung**.
  Aus diesen Adressen sollen Serienmails werden — eine falsch zugeordnete
  Adresse schreibt dann an die falsche Firma. Die Regel steht als eigene
  Funktion (`window.nachtragFelder`) und ist geprüft.
- **Auf der Landkarte steht kein Kundenname.** Die Ansicht wird abgefilmt.
  Blips zeigen Stufe und geschätzte Fahrzeit, sonst nichts; wer den Lead
  braucht, klickt ihn an und liest ihn in der Seitenleiste. Der Schalter
  „Namen zeigen" hebt das für die eigene Arbeit auf und steht standardmäßig
  aus. Prüfblock in `tests/karte.test.mjs` hält das fest.
- **Die Route folgt echten Straßen** (ausdrücklich so gewünscht, 21.09.2026).
  Gefragt wird der offene OSRM-Dienst; dorthin gehen **zwei Koordinatenpaare
  und sonst nichts** — kein Name, keine Adresse, keine Nummer. Antwortet er
  nicht, bleibt der gezeichnete Weg stehen und die Zeit trägt wieder „ca.".
- **Ein Klick auf einen Blip öffnet keine Karteikarte.** Es erscheint die
  Zielkarte: Stufe, Fahrzeit, geöffnet/geschlossen, Anzahl der Anrufe, wie
  lange der letzte her ist, Kundengröße. Kein Name, keine Adresse, kein Geld.
  Auf der Kartenansicht bleibt die Seitenleiste zu.
- **Sortierung springt nur bei der Wiedervorlage.** Sonst bleibt sie nach dem
  Speichern stehen (siehe oben); ein gesnoozter Lead gehört aber sofort nach
  unten. `window.sortiereListenNeu()` ist die einzige Ausnahme.
- **Fremde Adressen zählen nicht.** Eine E-Mail auf einer Plattformseite
  (Lieferando, Linktree, speisekarte.de …) gehört der Plattform, eine auf
  einer fremden Firmendomain meist der Werbeagentur aus der Fußzeile. Beides
  wird verworfen. Freemail (`@t-online.de`, `@gmail.com`) dagegen zählt —
  deutsche Kleinbetriebe nutzen fast nichts anderes.

---

## Gelöste Probleme (nicht wiederholen)

- **Problem:** Provision und Abschlussdatum aus der Seitenleiste wurden nie
  gespeichert — `saveLeadMain` hat beide Felder gar nicht mitgeschickt. Nur der
  Dialog beim Wechsel auf „closed" schrieb sie.
  **Lösung:** `window.leseWertFelder(lData)` in `main_ui.js`, genutzt von
  `saveLeadMain` und `getDomDraft`. Beträge liest `public/modules/betrag.js`
  („1.500,50" war vorher NaN → NULL). Unlesbares wird nicht gespeichert,
  sondern rot markiert. Datum nur schreiben, wenn sich der **Tag** ändert.
  **Warum wichtig:** Sonst setzt jedes Autospeichern die echte
  Abschluss-Uhrzeit auf 12:00. Der Dialog zieht die Seitenleisten-Felder sofort
  nach, sonst schreibt das nächste Autospeichern den alten Wert zurück.
- **Problem:** „Standort verknüpfen" ersetzte den eigenen Namen durch den
  Google-Namen und speicherte den Standort selbst nie (nur in die Kopie im
  Speicher gelegt — der Vergleich in `saveLeadMain` sah deshalb „keine
  Änderung").
  **Lösung:** `linkLeadLocation` sichert erst das Formular, schreibt dann die
  Standortfelder ausdrücklich über `leadStore.save` und füllt **nur Lücken**
  (Name, Telefon, Webseite, Place-ID, Maps-Link, Öffnungszeiten).
  **Warum wichtig:** Regel für alles aus Google Places: nie Bestehendes
  überschreiben. Nie Werte direkt in `store.state.leads` legen, die noch nicht
  gespeichert sind — der Vergleich hält sie dann für gespeichert.
  Aus demselben Grund geben die vier Aufrufer von `getDomDraft` keinen Entwurf
  mehr an `openLeadDirectly`, sondern rufen vorher `flushLeadForm()`.
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

- **Problem:** Zwei Meldungen kurz hintereinander — die erste rutschte aus dem
  Bild statt nach oben.
  **Lösung:** Die Plätze werden nach jedem Zu- und Abgang neu vergeben, anhand
  der tatsächlichen Höhe.
  **Warum wichtig:** Gerechnet wurde mit dem Wert, der gerade im Stil stand. Bei
  der noch einfahrenden Meldung war das der Startwert `-100px`; aus `-100 + 60`
  wurde `-40`. Nebenbei hängt das Einblenden nicht mehr am nächsten Bildwechsel
  (`requestAnimationFrame`) — den hält der Browser in nicht sichtbaren Reitern
  an, und die Meldung wäre dort für immer unsichtbar geblieben.

- **Problem:** Jeder Haken in der Mehrfachauswahl lud die Liste neu — sichtbar
  als mehrfaches Aufblitzen.
  **Lösung:** `handleLeadClick` legt nur noch Klasse und Kästchen der einen
  Karte um; `loadUi` überspringt einen zweiten, inhaltsgleichen Durchgang
  (`listenKennung`).
  **Warum wichtig:** Auswählen ändert keine Daten. `loadUi()` verwarf die
  Liste, zeichnete aus dem Zwischenspeicher, holte die Leads erneut vom Server
  und zeichnete nochmal — dazu lief die Einblend-Bewegung jeder Karte von vorn.

- **Problem:** Dieselbe Handlung fühlte sich je nach Stelle anders an — mal der
  Systemdialog des Browsers, mal ein eigener Dialog, mal gar keine Rückfrage.
  **Lösung:** `confirmAction` als einziger Weg, alle acht Stellen umgestellt.
  **Warum wichtig:** Der Systemdialog hält die ganze Seite an, sieht auf jedem
  Gerät anders aus und lässt sich nicht gestalten. Dazu kam, dass die
  Dialog-Regeln zweimal in `styles.css` standen und sich gegenseitig
  überschrieben haben.

- **Problem:** Der mobile „Zurück"-Knopf hat angefangene Eingaben verworfen.
  **Lösung:** Er ruft jetzt `closeLeadSidebar()` wie jeder andere Weg.
  **Warum wichtig:** Er hat die Seitenleiste direkt überschrieben und dabei
  `flushLeadForm()` übersprungen — genau der Fluchtpunkt, der Datenverlust
  verhindert. Nebenbei setzte er `window._currentSelectedLeadId`, eine Variable,
  die sonst nirgends vorkommt.

- **Problem:** „Speichert erst nach Neuladen" bei Zeitstempel-Konflikten.
  **Lösung:** `leadStore.save` holt bei Konflikt einmal den echten Stand und
  wiederholt automatisch.

---

## SWOT — Zustand der Codebase (10.09.2026)

Einmal-Bestandsaufnahme, am Code geprüft statt geschätzt. Jeder Punkt nennt die
Stelle zum Nachsehen.

### Stärken
- **Ein Schreibweg, und er begründet sich selbst.** `public/core/leadstore.js`
  sind 173 Zeilen, in denen jeder Mechanismus mit dem Fehler erklärt wird, der
  ihn nötig gemacht hat. Warteschlange, Konflikt-Selbstheilung und
  Speicher-Nachzug liegen an einer einzigen Stelle.
- **Autospeichern ist sichtbar.** Vier Auslöser, ein Fluchtpunkt, dazu die
  Statuszeile: Ein Fehlschlag sieht nicht mehr aus wie ein Erfolg.
- **Die Tests prüfen genau das, was schon einmal kaputt war.** 146 Prüfungen in
  21 Themenblöcken (`tests/ui.test.mjs`) — Aufgaben-Zuordnung beim Lead-Wechsel,
  Wiedervorlage, gleichzeitiges Speichern, Kaltakquise-Filter. Keine
  Alibi-Tests.
- **Rechteprüfung liegt auf dem Server, wo sie hingehört.** `api/_lib/auth.js`
  prüft den Anmelde-Token gegen Supabase, Rollen und Sperr-Marker serverseitig
  und sagt im Kommentar auch, warum der Client-Check nur Kosmetik ist. Die
  Weiterleitung `api/proxy.js` verlangt Anmeldung und blockt interne Adressen.
- **Ausgabe wird entschärft.** `escapeHtml` an 53 Stellen; die Stichprobe auf
  ungeschützte Lead-Daten in HTML fand nichts.
- **Sauberer Haushalt.** Null TODO/FIXME, acht `console.log` im gesamten
  Anwendungscode. Kommentare erklären das Warum, nicht das Was.
- **Schlanker Stack.** Kein Framework, fünf echte Abhängigkeiten, keine
  Bündelungs-Magie — die Anwendung läuft auch ohne Werkzeugkette.

### Schwächen
- 🔴 **Google-Schlüssel im Klartext in einem öffentlichen Repository** —
  siehe Kasten ganz oben. Der einzige Punkt mit echtem Schadenspotenzial.
- **Zwei Dateien tragen die halbe Anwendung.** `pipeline_ui.js` (2893 Zeilen)
  und `main_ui.js` (1695) halten zusammen 142 der 152 globalen Funktionen. In
  `pipeline_ui.js` steht auf 2893 Zeilen genau eine Abschnittsüberschrift — man
  findet dort nichts durch Blättern, nur durch Suchen.
- ~~**Das Dashboard rechnet auf gedeckelten Daten.**~~ *(Rico hat die
  Kennzahlen auf die Datenbank-Sichten `crm_daily_metrics` und
  `crm_stock_metrics` umgestellt — das Hauptdashboard zieht nichts mehr
  ungefiltert in den Browser. `getAgentStats` läuft nur noch im Team-Betrieb
  und meldet seit dem 11.09.2026 selbst, wenn es an die 1000-Zeilen-Grenze
  stößt: in der Konsole und als Hinweis im Dashboard, statt still zu niedrige
  Zahlen zu zeigen.)*
- ~~**Kommentare, die nicht mehr stimmen.**~~ *(11.09.2026: Punkt 5 in
  `public/core/config.js` und der Kopf von `core/db.js` richtiggestellt. Der
  db.js-Kopf sagt jetzt auch, dass es einen zweiten Schreibweg gibt.)*
- ~~**Eine Abhängigkeit ohne Nutzen.**~~ *(11.09.2026: `googleapis` entfernt —
  `npm audit` meldet jetzt null Lücken, `node_modules` von 273 MB auf 66 MB.
  `jsdom` steht bei den Entwicklungs-Abhängigkeiten, wo es hingehört.)*
- ~~**Papaparse wird zweimal geladen.**~~ *(11.09.2026: die mitgelieferte Kopie
  unter `public/lib/` ist weg, es kommt nur noch über `core/api.js`.)*
- ~~**Chart.js kommt unversioniert vom fremden Server.**~~ *(von Rico entfernt —
  wurde nirgends mehr verwendet, gegengeprüft.)*
- **Cache-Handhabung von Hand.** Jedes Skript trägt ein `?v=`-Anhängsel, dazu
  kommt der eigene Zwischenspeicher des Service Workers. Wer beim Ändern ein
  Anhängsel vergisst, liefert stillschweigend die alte Datei aus.
- **Aussehen an vier Stellen.** `theme.css`, `styles.css`, `mobile.css` und
  rund 370 Zeilen direkt in `index.html`, dazu rund 280 eingebaute Stile in den
  Vorlagen von `pipeline_ui.js` und `main_ui.js`. *(10.09.2026 deutlich
  entschärft: die zweite, überschreibende Stil-Ebene ist weg, die
  handverteilten Weiß-Transparenzen laufen über Tokens, fünf sich selbst
  überschreibende Regeln sind zusammengeführt. Die eingebauten Stile in den
  Vorlagen bleiben — die gehören zum Aufteilen von `pipeline_ui.js`.)*
- ~~**Die Tests hängen am Wortlaut des Quelltexts.**~~ *(10.09.2026 entschärft:
  die Ausschnitte laufen über einen Helfer, der bei einer fehlenden Textmarke
  laut scheitert statt still nichts zu prüfen. Am Quelltext hängen sie
  weiterhin.)*
- **Kein Weg, Daten aus der Anwendung herauszubekommen.** Einlesen gibt es,
  Ausgeben nicht.
- ~~**`.gitignore` sagt `scratch/`, zehn Dateien daraus sind trotzdem
  eingecheckt.**~~ *(11.09.2026: aus der Versionskontrolle genommen. Auf der
  Platte bleiben sie liegen — `.gitignore` hält sie jetzt auch wirklich raus.)*

### Chancen
- **Zwei Handgriffe, große Wirkung.** Schlüssel tauschen (zehn Minuten) und
  `googleapis` entfernen (ein Befehl, nirgends benutzt) — danach ist die
  einzige Sicherheitsmeldung weg und das echte Loch zu.
- **Dashboard als Datenbank-Auswertung.** Eine Ansicht mit `GROUP BY` hebt den
  Deckel auf und macht das Dashboard nebenbei schnell, statt bei jedem Aufruf
  den ganzen Bestand durch die Leitung zu ziehen.
- **`pipeline_ui.js` aufteilen ist mechanisch, nicht riskant.** Die
  Ladereihenfolge steht ohnehin ausgeschrieben in `index.html` — vier Zeilen
  dort, vier Dateien statt einer, Reihenfolge bleibt.
- **Ein Ausfuhr-Knopf ist fast geschenkt.** Papaparse ist schon geladen und
  kann auch schreiben — eigene Sicherung ohne Fremdanbieter, in einer
  Sitzung machbar.
- **Der Testaufbau trägt weiter.** Er lässt sich ohne neues Werkzeug auf
  `leadstore.js` und `core/db.js` ausweiten; die Fehlerbilder, die dort
  lauern (Konflikt, Teil-Updates), sind bekannt.

### Risiken
- **Ein Anmelde-Bereich für mehrere Anwendungen.** Die Regel `auth_full_access`
  auf `crm_leads` erlaubt jedem Angemeldeten alles — und angemeldet wird man in
  jeder App dieses Supabase-Projekts. Solange nur ein Konto existiert,
  ungefährlich; mit dem ersten fremden Konto nicht mehr.
- **Neun Tabellen ganz ohne Zugriffsregeln** (`core_*`, `ingest_*`). Wer den
  öffentlich einsehbaren anon-Schlüssel hat, liest und ändert sie ohne
  Anmeldung. **Kein CRM-Bestand betroffen** — alle `crm_*` und
  `lead_activities` sind geschützt (11.09.2026 geprüft). Die Tabellen gehören
  zu Jarvis; absichtlich nicht angefasst, weil Regeln einzuschalten ohne
  Regeln zu hinterlegen die App aussperrt. Fertiges Vorgehen in
  [docs/ungeschuetzte-tabellen.md](docs/ungeschuetzte-tabellen.md).
- **Alles hängt an einem Supabase-Projekt, ohne eigene Sicherung.** Kein
  Export, keine zweite Kopie. Ein Fehlgriff in `admin_scripts/` oder ein
  Ausfall trifft ungebremst.
- ~~**Das Wachstum arbeitet gegen das Dashboard.**~~ *(entschärft: die Sichten
  rechnen in der Datenbank, und wo noch gedeckelt geladen wird, sagt es das
  jetzt.)*
- **Fremder Code zur Laufzeit.** Leaflet und Google Fonts werden bei jedem
  Aufruf von fremden Servern geholt. Leaflet ist fest verdrahtet und mit
  Prüfsumme abgesichert, die Schriften nicht. Deutlich kleiner geworden, seit
  das unversionierte Chart.js raus ist. Restrisiko, kein akuter Posten.
- **Das Wissen steckt in zwei großen Dateien und in diesem Dokument.** Geht das
  Handover verloren, ist der Wiedereinstieg teuer.

---

## Offene Entscheidungen

> **Reihenfolge und Begründung stehen in
> [docs/wohin-das-geht.md](docs/wohin-das-geht.md).** Hier nur die Liste.

- **`getAgentStats` lädt drei Tabellen ungefiltert** (`core/db.js`). Läuft nur
  noch im Team-Betrieb und meldet seit dem 11.09. selbst, wenn es an die
  1000-Zeilen-Grenze stößt — ein Hinweis ersetzt aber keine Auswertung in der
  Datenbank. Voraussetzung für Team-Betrieb.
- **Keine Sicherung ausserhalb von Supabase.** Kein Export aus der App, keine
  zweite Kopie. Der Posten mit dem besten Gegenwert im ganzen Plan.
- **`crm_calls.by_user_id` ist `text` statt `uuid` + Foreign Key.** Bei ~300
  Zeilen harmlos, später nicht mehr.
- **`pipeline_ui.js` hat 2893 Zeilen** — und darin genau **eine**
  Abschnittsüberschrift. Listen/Sidebar/Karte/Dashboard sind vier Themen in
  einer Datei; zusammen mit `main_ui.js` (1695 Zeilen) halten die beiden 142
  der 152 globalen Funktionen. Aufteilen?
- **Echtes Schema versioniert ablegen**, `scratch/schema.sql` löschen. Zehn
  Minuten, verhindert Falle 1 dauerhaft. Die Datei ist **nicht** eingecheckt —
  Löschen kostet nichts und trifft niemanden sonst.
- **Der Engpass ist nicht die Software.** 23 Anrufe in der Woche gegen ein
  Tagesziel von 30 bis 100 aus `crm_metric_targets`; 8 von 195 Leads haben eine
  offene Aufgabe; 41 stehen auf `pitch` ohne Nachfass. Wer hier neue Funktionen
  baut, löst das falsche Problem — siehe Phase 2 in
  [docs/wohin-das-geht.md](docs/wohin-das-geht.md).
- **Soll das GitHub-Repository öffentlich bleiben?** Siehe Kasten ganz oben.
- **Wann auf `multiUser: true` umschalten?** Siehe
  [docs/multi-user-aktivieren.md](docs/multi-user-aktivieren.md) — noch nicht
  terminiert.

---

## Einzelplatz-Modus

Schalter in `public/core/config.js`:
```js
window.APP_CONFIG = { multiUser: false };
```
Bei `false` ausgeblendet: Registrierung, Einladungen, Nutzerverwaltung, Rollen,
Lead-Zuweisung, Sales-Bell-Push, Punkte-System. **Nichts gelöscht** — Code,
Serverfunktionen und Datenbankspalten sind unverändert vorhanden.

Rückschalter auf Team-Betrieb: siehe
[docs/multi-user-aktivieren.md](docs/multi-user-aktivieren.md).

Tech-Stack, Entwicklungsbefehle und Verzeichnisübersicht stehen in
[README.md](README.md) — hier nur, was sich am Zustand geändert hat.

---

## Vision & Langziel

Ein Werkzeug, das die tägliche Vertriebsarbeit **trägt** statt sie zu
verwalten — bedienbar über die App *und* über Claude, ehrlich in jeder Zahl,
und ohne Umbau auf mehrere Leute erweiterbar.

Kernprinzip unverändert: **nichts geht still verloren.** Jede Speicherung ist
sichtbar rückgemeldet, jeder Konflikt heilt sich selbst, jede Navigation
sichert vorher ab.

Zwei Dinge sind seit dem 11.09.2026 dazugekommen und verändern, was „fertig"
heißt:

- **Zwei Bedienoberflächen.** Die App und der MCP-Server. Jede neue Funktion
  muss ab jetzt zweimal gedacht werden — bedienbar *und* aufrufbar. Wo das
  auseinanderläuft, entstehen genau die stillen Fehler, gegen die dieses
  Projekt seit Monaten kämpft.
- **Aus dem Karteikasten wird ein Disziplin-System.** `crm_metric_targets`
  hält Tagesziele (100 Anrufe, aufgeteilt nach Art, von 30 hochgezogen). Ein
  CRM beantwortet „wo steht dieser Lead?". Ein Disziplin-System beantwortet
  „habe ich heute die Arbeit gemacht, aus der Abschlüsse entstehen?".

Ausgeschrieben in [docs/wohin-das-geht.md](docs/wohin-das-geht.md).

---

## Für nächsten Agent
- **Push einrichten ist Ricos Schritt:** iPhone → Safari → Teilen → „Zum
  Home-Bildschirm“, dort öffnen → Glocke → „Aktivieren“ → „Test senden“.
  Solange kein Gerät angemeldet ist, kommt nur die Karte im CRM.

- **Lies zuerst** den Kasten „🔴 Sofort" und die „⚠️ Kritische Fallen"
  oben — jede Falle hat schon einmal Zeit gekostet.
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
- 2026-09-24 — Rückruf-Timer in drei Phasen. (1) `modules/wiedervorlage.js`:
  Drehrad + Datum, ersetzt Std./Tage. (2) `modules/rueckruf.js`: Glocke im Kopf,
  Stapel oben rechts, eigene Fanfare (WebAudio, kein Fremdmaterial), Copy/
  Später/×, am Handy zusätzlich „Anrufen“. (3) Push: `api/rueckrufe.js` +
  `api/_lib/rueckrufe.js` (Regeln), `sw.js` neu (tag, Klick öffnet Lead).
  DB: `crm_leads.snooze_notified_ms`/`snooze_erledigt_ms` (83 Altfälle als
  gemeldet+erledigt markiert), Vault-Geheimnis `rueckruf_secret`, Funktion
  `rueckruf_zugang_pruefen` (nur service_role), `pg_net`, Cron-Job
  `rueckrufe-melden` (jede Minute, nur 8–21 Uhr und nur wenn etwas fällig ist).
  **Befund:** Push hat vorher nie funktioniert (keine VAPID-Schlüssel bei
  Vercel, 0 Geräte). Neues Schlüsselpaar von Rico bei Vercel hinterlegt; der
  alte Schlüssel im Sales-Bell-Code ersetzt (Claude Opus 5.5).
- 2026-09-24 — Anrufe im Verlauf einordnen: ✓/✕ und Notizfeld je Anruf
  (`renderCallActivity`, `setzeAnrufErgebnis`, `anrufNotizSichern` in
  `pipeline_ui.js`; `setCallDetails` in `core/db.js`). DB: Spalten
  `crm_calls.outcome`/`notes` + Sicht `lead_timeline` um `call_outcome`/
  `call_notes` ergänzt (Migrationen `crm_calls_outcome_notes`,
  `lead_timeline_call_outcome_notes`). MCP `anruf_festhalten` nimmt optional
  `ergebnis`/`notiz`, `lead_anzeigen` zeigt sie. Notizfeld löst bewusst kein
  Lead-Autospeichern aus. Nicht gegen die echte DB durchgeklickt (Claude Opus 5.5).
- 2026-09-23 — Provision/Abschlussdatum in der Seitenleiste speichern jetzt;
  Standort verknüpfen überschreibt nichts mehr und wird wirklich gespeichert;
  Kontakt-Marke „Maps" → „Telefon", Anruf-Knöpfe entfernt (Wunsch Rico).
  Nicht im Browser gegen die echte Datenbank durchgeklickt — nur Tests
  (Claude Opus 5.5).
- 2026-09-21 (5) — Datenpflege und Mehrfach-Standorte.
  **Der Bestand war zu 100 % mit Leerstrings gefüllt** — 243 von 243 Leads
  hatten `''` statt NULL in `email`, `impressum_phone`, `legal_company_name`,
  `director_name` und `phone_source`; jedes „is not null" lieferte alle
  Zeilen. Zwei Ursachen: der Insert-Pfad in `core/db.js` erzwang `?? ''` für
  jede Textspalte, und die Impressum-Anreicherung im Scout lief nur für
  Treffer **ohne** Telefonnummer — Google Places liefert fast immer eine,
  also lief sie praktisch nie. Beides behoben; die Anreicherung nutzt jetzt
  `modules/kontaktdaten.js` (eine Implementierung statt zwei) und kann
  zusätzlich Firmenname und Geschäftsführung lesen.
  **Neu:** `company_domain` (normalisierter Host) und `is_multi_site`.
  Plattformen sind bei der Ketten-Erkennung ausgenommen — ohne diese Ausnahme
  wären zehn Leads als Kette markiert worden, davon **acht falsch** (sechs
  fremde Betriebe teilen sich instagram.com). Echt ist genau eine Kette.
  **Beide Telefonnummern** stehen untereinander auf der Karteikarte,
  „Maps" und „Impressum", beide als `tel:`-Link; fehlt eine, fällt die Zeile
  weg. `phone` wird nie überschrieben.
  **Beim Prüfen aufgefallen:** während der Arbeit kamen 20 neue Leads dazu —
  mit Leerstrings, weil die live laufende Fassung noch den alten Code hatte.
  Die Migration heilt den Bestand, nicht die Quelle: **erst ausrollen, dann
  aufräumen.**
  **Dashboard und Jarvis sind nicht betroffen:** die drei Sichten
  (`crm_daily_metrics`, `crm_stock_metrics`, `lead_timeline`) benutzen keine
  der geänderten Spalten, und der MCP-Lesepfad gibt `l.email || null` aus —
  aus `''` wurde dort ohnehin `null`. Gegengeprüft am laufenden Server.
  Nachgezogen wurde `api/_lib/crm.js`: schrieb bis dahin `''` weiter und
  hätte bei einer Webadresse von Jarvis keine `company_domain` gesetzt.
  Rückweg: `update crm_leads set <spalte> = '' where <spalte> is null;` pro
  Spalte. Stand der 19 Zeilen mit echtem Inhalt liegt in
  `scratch/sicherung/crm_leads_impressumfelder_2026-09-21.json`.
- 2026-09-21 (4) — Nachbesserungen nach Durchsicht.
  Die Adresse im Standort-Kasten zeigt wieder auf die **Karte in der
  Anwendung** und ist kein blauer Link mehr; die Wege nach draußen sind die
  zwei Links darunter. Die Webseiten-Zeile im Kontakt-Kasten ist weg — das
  Feld steckt wieder versteckt im Formular (der Speicherweg liest es, sonst
  würde die Adresse beim nächsten Speichern geleert). Öffnungszeiten sagen
  nur noch **„Geöffnet" oder „Geschlossen"**, in derselben Schrift wie der
  Rest; die Uhrzeiten stehen im Tooltip. `openExternal` öffnet Reiter statt
  Fenster (Safari). **Die Route folgt jetzt echten Straßen** über OSRM —
  bewusste Kehrtwende gegenüber der vorherigen Fassung, auf Ansage; nach
  draußen gehen nur zwei Koordinatenpaare. **Ein Klick auf einen Blip öffnet
  keine Karteikarte mehr**, sondern die Zielkarte mit Arbeitsstand
  (Stufe, Fahrzeit, offen/zu, Anrufe, letzter Kontakt, Größe) — nichts davon
  zeigt, um wen es geht. Auf der Kartenansicht bleibt die Seitenleiste zu.
- 2026-09-21 (3) — Vier Fehler behoben, Landkarte neu.
  **Öffnungszeiten:** Google liefert englische Zwölf-Stunden-Zeiten
  (`"Monday: 6:30 AM – 4:00 PM"`), und sie stehen bei 198 von 243 Leads am
  *Standort*, nicht am Lead. Der Parser der Listenansicht warf AM/PM weg und
  kannte „Closed" nicht — deshalb stand fast überall „Closed". Jetzt versteht
  `modules/oeffnungszeiten.js` beide Sprachen, halbe Angaben
  (`"4:00 – 9:00 PM"`), Mittagspausen und Nächte über Mitternacht; angezeigt
  wird „Offen bis 16:00" statt eines Rohtexts.
  **Aktivitäten löschen:** drei Ursachen auf einmal — die Lead-Nummer kam als
  Text aus dem `onclick` und wurde mit `===` gegen eine Zahl verglichen (der
  Lead wurde nie gefunden, also kein Neuzeichnen), der Eintrag blieb in
  `crm_calls`/`lead_activities` stehen, und `db.deleteActivity` meldete auch
  dann Erfolg, wenn nichts gelöscht wurde. Alle drei behoben; gelöscht wird
  jetzt mit `.select()` geprüft.
  **Wiedervorlage:** `persistSnooze` hat gespeichert, aber nie neu sortiert —
  die Karte blieb stehen, wo sie war. Neu: `window.sortiereListenNeu()`, und
  die Kanban-Spalten trennen gesnoozte Leads unter einer Linie ab.
  **Copy-Knopf:** Rückmeldung stand hinter zwei Netzaufrufen, `currentTarget`
  ist nach `await` null, und der „ursprüngliche" Text wurde bei jedem Klick neu
  gemerkt — beim zweiten Klick blieb „Kopiert!" für immer stehen. Rückmeldung
  läuft jetzt vor dem Netz, `copyText` hat einen Rückfallweg ohne
  Zwischenablage-Schnittstelle.
  **Landkarte:** aus `pipeline_ui.js` heraus in `modules/karte.js` (−9.400
  Zeichen dort). Dunkle, blau eingefärbte Karte, Blips mit Leuchten, gelbe
  Route mit rechten Winkeln, Spieler-Pfeil, HUD mit Stufenfilter, Legende und
  Routenkasten. Kacheln von **Esri statt CARTO** — CARTO verlangt seit 2025
  einen Schlüssel und schreibt sonst „API KEY REQUIRED" über jede Kachel.
  Der Filterknopf verschwand hinter der Karte, weil Leaflets Ebenen
  (z-index 400–800) ohne eigenen Stapelkontext in den Wurzelkontext
  durchschlagen; `#map-container` bekommt jetzt `z-index: 0; isolation:
  isolate`. Mitgegangen ist das tote `autoGeocode` (init.js prüfte
  `typeof autoGeocode` auf eine Funktion, die nie auf `window` lag).
- 2026-09-21 (2) — Kontaktdaten. **225 von 243 Leads hatten keine E-Mail**,
  159 davon eine eigene Webseite. Das alte Auslesen nahm die erste Adresse der
  Seite — das war je nach Seite die Agentur aus der Fußzeile, ein Platzhalter
  aus einer Formularvorlage oder `info@` eines Portals. Neu:
  `public/modules/kontaktdaten.js` mit klaren Regeln (eigene Domain oder
  Freemail, Geschäftsführung vor `info@`, Verwaltungsadressen zuletzt,
  Plattformseiten gar nicht erst lesen), dazu Entschlüsseln von
  Cloudflare-Adressen, `info(at)`-Schreibweisen und `&#64;`. Telefon kommt
  bevorzugt aus `tel:`-Verweisen, Fax wird erkannt und verworfen, jede Nummer
  wird auf die deutsche Form gebracht (`00 49 (0)3 51 / 21 52 00 40` →
  `035121520040`). **An 54 echten Leads gemessen: 32 E-Mails gefunden (≈60 %),
  zwei davon falsch** — beide waren Portalseiten, die jetzt auf der
  Plattformliste stehen. Nachtragen für den ganzen Bestand über
  Einstellungen → Datenbank-Tools: erst suchen (schreibt nichts), Funde
  durchsehen, dann übernehmen. Drei Leads gleichzeitig, Anhalten jederzeit.
  Die Suche läuft über `/api/proxy` — **im lokalen `npm run dev` gibt es diese
  Serverfunktion nicht, das Werkzeug funktioniert nur auf der veröffentlichten
  Fassung.**
- 2026-09-21 — Lead-Karteikarte aufgeräumt. **Der Link zur Webseite war nur
  über die Landkarte zu erreichen** (Lead anklicken, Karte öffnen, Stecknadel
  treffen); im Formular stand `sys-web` als verstecktes Feld. Steht jetzt
  sichtbar und bearbeitbar im Kontakt-Kasten, daneben „Öffnen" — ohne Eintrag
  „Suchen" (Websuche nach dem Firmennamen). Der Standort-Kasten führt mit
  einem Link direkt zu Google Maps, gleiche Reihenfolge wie die Sprechblase an
  der Karte (Maps-Adresse → Place-ID → Namenssuche). Reihenfolge der Kästen
  nach Arbeitsablauf sortiert, Standort von Platz sieben auf zwei.
  **Zwei Altlasten dabei entfernt:** der Wiedervorlage-Kasten baute sich über
  eine Kette von `.replace()` selbst doppelt zusammen — Rahmen und Überschrift
  standen zweimal da; und `locationMatchingHtml` war ein toter Zwilling des
  Standort-Kastens mit denselben Element-IDs (`loc-search-*`), nie eingesetzt.
  Überschrift heißt jetzt „Wiedervorlage" statt „Follow-Up (Snooze)", passend
  zu den Meldungen. Kontaktzeilen haben eigene Klassen (`.kontakt-*`) statt
  eingebauter Stile — ein Stück Phase 3.2. Neu: Prüfblock 27d (15 Prüfungen).
- 2026-09-12 — Nacharbeit an der Kennzahlen-Datenschicht. **Der Verlauf durfte
  behaupten, was nie gespeichert wurde:** `core/db.js` protokollierte den
  Stufenwechsel 36 Zeilen VOR dem Schreibvorgang und vor der Konfliktprüfung.
  Scheiterte das Speichern, blieb der Eintrag stehen. Real passiert mit Lead 592
  („Kunde" ohne Stufe, ohne Abschlussdatum). Protokoll läuft jetzt nach dem
  geglückten Schreibvorgang, `closed_at_ms` weiterhin davor (gehört in den
  payload). Prüfung 27 hält die Reihenfolge fest.
  **Versionshinweis für laufende Tabs:** Ein vor dem Deploy geöffneter Tab lief
  auf altem Code weiter — so kamen am 12.09. zwei Stufenwechsel ohne Struktur in
  die Datenbank, obwohl seit dem 11.09. richtig deployt war. Nachgewiesen durch
  Lesen des Live-Bündels. Die Seite horcht jetzt auf `controllerchange`, fragt
  alle fünf Minuten nach und zeigt „Neue Fassung verfügbar · Neu laden"; vor dem
  Neuladen läuft `flushLeadForm()`.
  **Cache-Marker werden geprüft** (Prüfung 28 + `tests/cache-marker.json` +
  `tests/marker-aktualisieren.mjs`). Hat sofort einen echten Fall gefunden:
  `9c8e036` änderte `pipeline_ui.js` ohne Markerwechsel. Ausdrücklich NICHT
  betroffen ist die Modulkette — die bündelt Vite mit Inhalts-Hash.
  **Beim Abschluss wird nach dem Wert gefragt** — Dialog in der Form von
  `confirmAction`, „Später" ist erlaubt; am MCP-Server nimmt `stufe_setzen` jetzt
  `wert` und `datum` entgegen und weist sonst darauf hin. Die Geldfelder sind
  `type="text"` mit `inputmode="decimal"`: ein Zahlenfeld verwirft „847,50" je
  nach Spracheinstellung stillschweigend.
  **Testdaten bereinigt:** Leads 592/593 (Scout-Import 09.09., null Anrufe,
  Durchklicken) auf `cold/Lead` zurückgesetzt, fünf strukturlose Protokollzeilen
  gelöscht. Danach: 0 Zeilen ohne Struktur, 0 zerrissene Datensätze.
  Prüfungen 237 → 355 in drei Suiten (Claude Opus 5).
- 2026-09-12 — Datenschicht fertiggestellt: `crm_pipeline_snapshots` bekam die
  fehlende Zugriffsregel (die Tabelle stand seit dem 10.09. ohne Regel da,
  niemand kam heran) und wird jetzt beim Öffnen des Command Centers
  fortgeschrieben — `savePipelineSnapshot`, nebenher und ohne das Zeichnen
  aufzuhalten. Damit hat der Bestand erstmals einen Verlauf; ohne Aufruf
  entsteht eine sichtbare Lücke statt einer erfundenen Fortschreibung des
  Vortags. Dazu der **Lesevertrag für Jarvis OS**
  (`docs/lesevertrag-jarvis.md`): alle `metric_key`-Werte mit Bedeutung, die
  drei Einschränkungen (genäherte Alt-Anrufe, noch keine Conversion-Historie,
  53 Abschlüsse ohne Datum) und drei Punkte, die auf Jarvis-Seite offen sind —
  darunter die doppelte Wahrheit beim Anrufziel (`core_intentions` 30/60
  gegen `crm_metric_targets` 30/100). Prüfungen 205 → 207 (Claude Opus 5).
- 2026-09-12 — Richtung festgehalten (`docs/wohin-das-geht.md`): fünf Phasen
  von „was brennt" bis Team-Betrieb, mit Begründung der Reihenfolge. Die Vision
  im Handover nachgezogen — sie kannte den MCP-Server und das Kennzahl-System
  noch nicht. Veraltete offene Entscheidungen entfernt (`googleapis` ist raus,
  `getAgentStats` entschärft). Kernbefund: die Software ist der Nutzung voraus
  — 23 Anrufe die Woche gegen ein Tagesziel von 30–100, 8 von 195 Leads mit
  offener Aufgabe, 41 auf `pitch` ohne Nachfass (Claude Opus 5).
- 2026-09-11 — OAuth 2.1 für den MCP-Connector (`api/oauth/*`, `vercel.json`).
  Grund: die Connector-Maske von Claude nimmt kein festes Zugangswort, sie
  verlangt RFC 9728 + RFC 8414 + OAuth mit PKCE. Alles ohne Datenbank — Codes
  und Zeichen tragen ihren Inhalt unterschrieben in sich, der Schlüssel wird
  aus `MCP_TOKEN` abgeleitet. Damit macht ein Wechsel des Zugangsworts alle
  ausgestellten Zeichen auf einen Schlag wertlos. `api/mcp.js` nimmt beide Wege
  an und prüft bei Zeichen den Empfänger. 46 neue Prüfungen. Live
  gegengeprüft: beide `/.well-known/`-Adressen liefern, der 401 trägt den
  Wegweiser, Selbstanmeldung klappt, fremde Rücksprung-Adressen werden
  abgelehnt, die Zustimmungsseite steht (Claude Opus 5).
- 2026-09-11 — Schwachstellen und Risiken aus der SWOT abgearbeitet:
  Google-Schlüssel aus `backfill_places.js` (kommt jetzt aus der Umgebung;
  **Sperren in der Google Cloud Console bleibt offen**), `googleapis` entfernt
  (null Sicherheitsmeldungen, `node_modules` 273 → 66 MB), `jsdom` zu den
  Entwicklungs-Abhängigkeiten, doppeltes Papaparse aufgelöst, veraltete
  Kommentare in `config.js` und `db.js` richtiggestellt, `scratch/` aus der
  Versionskontrolle, `getAgentStats` meldet seinen Deckel jetzt selbst.
  Runbook für die neun ungeschützten Jarvis-Tabellen angelegt. Nach dem
  Entfernen im Browser gegengeprüft: alle Dateien laden, keine Fehler in der
  Konsole, `window.Papa` ist da (Claude Opus 5).
- 2026-09-11 — MCP-Server angelegt (`api/mcp.js`, `api/_lib/mcp_werkzeuge.js`,
  `api/_lib/crm.js`): neun Werkzeuge auf dem CRM, lesend und schreibend, hinter
  einem eigenen Zugangswort (`MCP_TOKEN`). Transportweg „Streamable HTTP" von
  Hand umgesetzt statt über ein weiteres Paket — gebraucht werden fünf
  Methoden. Dabei entsteht ein zweiter Schreibweg neben `leadStore`; siehe die
  Warnung unter „Was funktioniert". Runbook in
  `docs/mcp-server-einrichten.md`. 87 neue Prüfungen, `npm test` fährt jetzt
  beide Testläufe. **Offen: `MCP_TOKEN` bei Vercel setzen und neu
  veröffentlichen** (Claude Opus 5).
- 2026-09-10 — Bildsprache vereinheitlicht: Rückfrage-Dialog in der Form des
  Apple-Systemdialogs (dunkel, deutsch), Meldungen in derselben Sprache und mit
  korrigierter Stapelung, Meldungstexte ohne Emoji und Ausrufezeichen,
  Oberflächen-Tokens in `theme.css` statt acht handverteilter
  Weiß-Transparenzen, die zweite Stil-Ebene („UX OVERHAUL", durchgehend
  `!important`) aufgelöst, fünf sich selbst überschreibende Regeln
  zusammengeführt. Tests von 170 auf 178 (Claude Opus 5).
- 2026-09-10 — Grundlegende Bedien-Abläufe vereinheitlicht: eine Rückfrage für
  die ganze Anwendung (`confirmAction`, acht Stellen umgestellt, kein
  `confirm()`/`alert()` mehr), Mehrfachauswahl lädt die Liste nicht mehr neu,
  `loadUi` überspringt inhaltsgleiche Durchgänge (`listenKennung`),
  `resetSidebar()` statt acht Kopien mit drei verschiedenen Bezeichnern,
  mobiler „Zurück"-Knopf sichert wieder ab, doppelter `.confirm-overlay`-Block
  in `styles.css` aufgelöst. Tests von 146 auf 170 (Claude Opus 5).
- 2026-09-10 — SWOT-Bestandsaufnahme der Codebase eingearbeitet (neuer
  Abschnitt „SWOT"). Dabei gefunden und oben eingetragen: offener
  Google-Schlüssel im öffentlichen GitHub-Repository (Kasten ganz oben),
  ungenutzte Abhängigkeit `googleapis` als Ursache der einzigen
  Sicherheitsmeldung, `getAgentStats` deckelt drei Abfragen statt einer,
  veraltete Warnung in `public/core/config.js` (Punkt 5). Zahlen im Snapshot
  nachgezogen: 146 statt 142 Prüfungen, `pipeline_ui.js` 2893 statt ~2860
  Zeilen. Keine Codeänderung (Claude Opus 5).
- 2026-09-09 — Doku-Struktur nach SSOT-Regel korrigiert: HANDOVER.md ist SSOT
  für den **Zustand**, nicht für alles. `README.md` (Menschen-Einstieg,
  Tech-Stack, Befehle, Verzeichnisse) und `AGENTS.md` (Verweis auf
  `~/dev/coding-workflow-standards.md`, nicht einchecken) neu angelegt.
  Tech-Stack-Tabelle, Verzeichnis-Baum und die Multi-User-Checkliste sind aus
  dem Handover raus, Checkliste jetzt als Runbook in
  `docs/multi-user-aktivieren.md`. Vorheriger Stand (alles in einer Datei)
  war ein Missverständnis von „Single Source of Truth" — SSOT heißt SSOT für
  den Zustand, nicht ein Dokument für alles (Claude Sonnet 5).
- 2026-09-09 — `admin_scripts/README.md` aufgelöst: Inhalt (Produktiv-DB-
  Warnung) hier unter „Für nächsten Agent" übernommen, Datei gelöscht
  (Claude Sonnet 5).
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
