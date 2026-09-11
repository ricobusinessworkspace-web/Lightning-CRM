---
last_updated: 2026-09-10
last_agent: Claude Opus 5 (OAuth für den MCP-Connector)
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
- **Tests:** 311 Prüfungen, alle grün — 178 Oberfläche (`tests/ui.test.mjs`),
  87 MCP-Server (`tests/mcp.test.mjs`), 46 Anmelde-Vorgang
  (`tests/oauth.test.mjs`). `npm test` fährt alle drei.

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
- **Fremder Code zur Laufzeit.** Chart.js (unversioniert), Leaflet und Google
  Fonts werden bei jedem Aufruf von fremden Servern geholt. Ändert sich dort
  etwas, ändert sich die App ohne Zutun.
- **Das Wissen steckt in zwei großen Dateien und in diesem Dokument.** Geht das
  Handover verloren, ist der Wiedereinstieg teuer.

---

## Offene Entscheidungen

- **`getAgentStats` lädt alles Ungefilterte in den Browser** (`core/db.js:904`):
  Leads, Anrufe **und** Aktivitäten, je eine Abfrage ohne Grenze — nicht nur
  die Anrufe. PostgREST liefert höchstens 1000 Zeilen und meldet nicht, dass
  gekürzt wurde; das Dashboard zählt darüber still falsch. ~300 Anrufe
  aktuell, also Monate Puffer. Sollte eine Datenbank-Auswertung mit
  `GROUP BY` werden. Einziger Posten mit Ablaufdatum.
- **`crm_calls.by_user_id` ist `text` statt `uuid` + Foreign Key.** Bei ~300
  Zeilen harmlos, später nicht mehr.
- **`pipeline_ui.js` hat 2893 Zeilen** — und darin genau **eine**
  Abschnittsüberschrift. Listen/Sidebar/Karte/Dashboard sind vier Themen in
  einer Datei; zusammen mit `main_ui.js` (1695 Zeilen) halten die beiden 142
  der 152 globalen Funktionen. Aufteilen?
- **Echtes Schema versioniert ablegen**, `scratch/schema.sql` löschen. Zehn
  Minuten, verhindert Falle 1 dauerhaft. Die Datei ist **nicht** eingecheckt —
  Löschen kostet nichts und trifft niemanden sonst.
- **`googleapis` aus den Abhängigkeiten werfen?** Wird nirgends eingebunden
  (geprüft) und ist die alleinige Ursache der einzigen Sicherheitsmeldung
  (`qs`, mittel). Ein Befehl, kein Risiko.
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

Robustes, verlässliches Einzelplatz-CRM, das bei Bedarf ohne Codeänderung auf
Team-Betrieb umschaltet (Schalter, nicht Umbau). Kernprinzip: nichts geht
still verloren — jede Speicherung ist sichtbar rückgemeldet, jeder Konflikt
heilt sich selbst, jede Navigation sichert vorher ab.

---

## Für nächsten Agent

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
