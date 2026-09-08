# Lightning CRM — Handover

Stand: 08.09.2026 · Branch `master` · Deploy über Vercel bei jedem Push

---

## 1. Was das ist

Web-CRM für Leadgenerierung, Kaltakquise und Vertriebs-Pipeline. Aktuell im
**Einzelplatz-Betrieb**: genau ein Nutzer (Rico), 248 Leads, ~300 Anrufe.

- **Frontend:** Vanilla JS, kein Framework. Globale `window.*`-Funktionen,
  HTML wird als Template-String zusammengebaut und per `innerHTML` gesetzt.
- **Build/Dev:** Vite. `npm run dev`, `npm run build`, `npm test`.
- **Backend:** Supabase (PostgreSQL + Auth + Realtime).
- **Serverfunktionen:** Vercel Functions unter `/api/`.

---

## 2. Lies das zuerst — fünf Fallen

Diese Punkte haben in der letzten Sitzung jeweils Zeit gekostet. Alle sind real.

### 2.1 `scratch/schema.sql` ist veraltet und lügt

Die Datei kennt `crm_calls`, `lead_activities` und `user_profiles` **gar nicht**
und behauptet eine offene Zugriffsregel für nicht angemeldete Besucher, die es
live nicht gibt. **Nicht als Quelle benutzen.** Den echten Stand immer über
`admin_scripts/inspect_user_columns.sql` oder direkt in Supabase abfragen.

### 2.2 Die Datenbank gehört nicht nur diesem Projekt

Im selben Supabase-Projekt liegen weitere Apps: `jarvis_*`, `g_*`, `tracker_*`,
`core_*`. Konsequenzen:

- `auth.users` ist **projektweit**. Nutzer löschen trifft alle Apps.
- `user_profiles` wird möglicherweise geteilt — Policies dort nicht anfassen.
- `core_goals`, `core_intentions`, `core_metric_definitions`,
  `core_metric_sources` haben **RLS aus** und sind ungeschützt öffentlich.
  Gehört nicht zum CRM, ist aber bekannt.

### 2.3 Spaltentypen sind uneinheitlich

| Spalte | Typ | Foreign Key |
|---|---|---|
| `crm_leads.claimed_by` | `uuid` | ja |
| `crm_calls.by_user_id` | **`text`** | nein |
| `lead_activities.by_user_id` | `uuid` | nein |
| `crm_notifications.user_id` | `uuid` | ja |
| `crm_push_subscriptions.user_id` | `uuid` | ja |

Dass die Statistik Anrufe den Profilen zuordnen kann, funktioniert nur, weil in
der Text-Spalte zufällig die uuid als String steht. Bei dynamischem SQL immer
über `::text` vergleichen und auf den echten Spaltentyp casten.

### 2.4 Zwei Verzeichnisse heißen `core/`

`index.html` lädt `core/config.js` **und** `core/auth.js` — die kommen aus
**verschiedenen Ordnern**:

- `./core/` (Projektwurzel) → `auth.js`, `api.js`, `db.js` — ES-Module
- `./public/core/` → `config.js`, `store.js`, `state.js`, `leads.js`,
  `tasks.js`, `pipeline.js` — klassische Skripte

Vite serviert `public/` unter `/`, deshalb lösen beide auf. **Beim Bearbeiten
auf den richtigen Ordner achten.** `dist/` ist Build-Ausgabe, nie editieren.

### 2.5 Ladereihenfolge entscheidet

```
core/config.js → core/auth.js → core/store.js → core/state.js → core/leads.js
→ core/tasks.js → core/pipeline.js → ui/pipeline_ui.js → ui/main_ui.js
→ modules/scraper.js → ui/profile-modal.js → ui/init.js
```

`pipeline_ui.js` läuft **vor** `main_ui.js`. Genau daran ist ein Auto-Save-
Wrapper gescheitert, der `selectSnooze` einpacken wollte, bevor es existierte —
er hat monatelang stillschweigend nichts getan. **Nie Funktionen aus
`main_ui.js` auf oberster Ebene von `pipeline_ui.js` umschließen.**

---

## 3. Verzeichnisse

```
index.html              Layout, Modals, Navigation, Skript-Reihenfolge
core/db.js      (1023) Supabase-Zugriff, gesamte Datenlogik
core/api.js       (92)  window.api — dünne Fassade über db.js
core/auth.js      (33)  Passkey-Stub, Developer-Unlock
public/core/config.js   DER SCHALTER (multiUser)
public/core/store.js    Proxy-Store, window.store.state
public/core/leadstore.js (149) DER EINZIGE SCHREIBWEG (siehe §4)
public/ui/pipeline_ui.js (2842) Listen, Karten, Sidebar, Karte, Dashboard
public/ui/main_ui.js    (1412) Speichern, Aufgaben, Snooze, Toasts, Bulk
public/modules/scraper.js (746) Radar Scout (Google Places / OSM)
ui/init.js        (513) Bootstrap, Login, Realtime-Abo
api/              Vercel Functions + api/_lib/auth.js
admin_scripts/    SQL für Wartung (siehe §8)
tests/ui.test.mjs 70 Prüfungen, ohne Browser
```

---

## 4. Speichern — das Wichtigste

**Es gibt genau einen Schreibweg: `window.leadStore.save()`** in
`public/core/leadstore.js`. Neue Schreibpfade gehen dort durch, nicht direkt
über `api.saveLead`. Einzige Ausnahme sind *neue* Leads (ohne `id` —
Scout-Import und „Neuer Lead"), die legt `api.saveLead` an.

```js
await window.leadStore.save(leadId, { task_text: '…' }, { label: 'Aufgabe' });
```

`save` erledigt vier Dinge, die vorher jede Funktion selbst machen musste — und
manche eben nicht:

1. **Warteschlange.** Gleichzeitige Speichervorgänge laufen nacheinander.
2. **Nur die genannten Spalten.** `db.js` beherrscht Teil-Updates. Nicht
   genannte Spalten bleiben unangetastet.
3. **Zeitstempel-Selbstheilung.** Meldet die Datenbank einen Konflikt, holt
   `save` einmal den echten Stand und wiederholt. Das war die Ursache für
   „speichert erst nach einem Neuladen".
4. **Speicher nachziehen.** `store.state.leads` **und** jeder
   Reiter-Zwischenspeicher (`tabCache`) werden gemeinsam aktualisiert — per
   `Object.assign`, damit vorhandene Verweise gültig bleiben.

`window.leadStore.diff(id, wunschwerte)` liefert nur die Spalten, die sich vom
bekannten Stand unterscheiden. `saveLeadMain` baut damit sein Update.

Drei Einstiegspunkte:

| Funktion | schreibt | wann |
|---|---|---|
| `persistTasks()` | `task_text` | jede Aufgaben-Änderung, sofort |
| `persistSnooze(ms)` | `snooze_until_ms` | Snooze setzen/aufheben, sofort |
| `saveLeadMain(id)` | nur geänderte Spalten | Feld verlassen, Stufenwechsel |

### Zwei Bindungen, die nicht wegdürfen

Beide verhindern, dass beim **Lead-Wechsel** auf den falschen Lead geschrieben
wird. Zwischen „anderer Lead ausgewählt" und „Seitenleiste neu gezeichnet"
liegt ein Netzwerkaufruf. In diesem Fenster zeigt die Auswahl schon auf den
neuen Lead, die Formularfelder aber noch auf den alten.

- **Aufgaben:** `window.currentTasks` gehört immer zu `window.currentTasksLeadId`.
  Gesetzt wird beides nur über `window.bindTasksToLead(lead)`, und zwar
  **sofort** beim Lead-Wechsel, vor dem Laden des Verlaufs. `persistTasks` und
  `capturePendingTasks` verweigern ohne Bindung die Arbeit; `saveLeadMain`
  schreibt `task_text` nur, wenn die Bindung auf denselben Lead zeigt.
- **Formular:** die Seitenleiste trägt `data-lead-id` auf `.focused-lead`.
  `saveLeadMain` bricht ab, wenn die ID nicht zum gespeicherten Lead passt.

Ohne diese beiden Prüfungen sind zwei Fehler sofort wieder da: Aufgaben
verschwinden, und man findet Aufgaben bei Leads, für die man sie nie angelegt
hat.

Nach dem Speichern **nur die betroffene Karte** neu zeichnen:
`refreshLeadCard(id)` → `patchLeadCard(id)` tauscht einen DOM-Knoten.
Nur wenn die Karte nicht im DOM ist, wird auf `loadUi(true)` zurückgefallen.
**Nicht auf `loadUi()` zurückbauen** — das ersetzt die ganze Liste, kostet
Scrollposition und fühlt sich kaputt an.

## 5. Bewusste Entscheidungen — bitte nicht zurückbauen

Das sind Antworten auf konkrete Beschwerden, keine Zufälle.

- **Anrufe kennen kein „erreicht / nicht erreicht".** Ein Anruf ist ein Anruf.
  `call_status` kennt nur `never` / `called`. Die Spalte `crm_calls.status`
  existiert noch, wird aber nirgends ausgewertet.
- **Keine versteckte Ausblende-Logik.** Früher verschwanden Leads aus Pipeline
  und Kaltakquise, wenn im Aufgabentext „mail" vorkam — traf auch
  „Rechnung mailen". Leads bleiben immer sichtbar.
- **Offene Aufgaben zeigt ein kleines `+`** hinter dem Pipeline-Status. Diese
  Lösung war schon da und ist gewollt. Kein Badge, kein Icon.
- **Pipeline-Stufen schalten nicht um.** Ein Klick setzt genau diese Stufe.
- **Der Snooze-Knopf schaltet sehr wohl um.** Klick auf die markierte Auswahl
  hebt die Wiedervorlage auf. Andere Auswahl setzt um. Zusätzlich gibt es
  „Snooze aufheben". Der Merker liegt in `window._activeSnoozeChoice` —
  **nicht** in `store.state.currentSnoozeOffset`, das liest `saveLeadMain` aus
  und würde die Wiedervorlage bei jedem Speichern weiter nach vorn schieben.
- **Erledigte Aufgaben werden abgehakt, nicht gelöscht.**
- **E-Mail und WhatsApp sind dieselbe Aktivität.** Der Knopf „Schreiben" neben
  der E-Mail-Adresse und das WhatsApp-Symbol neben der Telefonnummer halten
  beide fest: „Ich habe dem Kunden geschrieben." Der Typ heißt `message`, der
  genaue Weg steht in `details`. Alte Einträge stehen als `email` in der
  Tabelle, werden gleich angezeigt und gleich gezählt.
- **Zusammenführen nur bei gleicher Google-Place-ID.** Namensgleichheit gibt
  einen Hinweis. Früher wurde über Name + Stadt still zusammengeführt — zwei
  Mal „Neuer Lead" öffnete beim zweiten Klick den ersten.
- **Sortierung bleibt nach dem Speichern stehen**, bis komplett neu geladen
  wird. Sonst springt die Karte unter dem Cursor weg.

---

## 6. Einzelplatz-Modus

Ein Schalter in `public/core/config.js`:

```js
window.APP_CONFIG = { multiUser: false };
```

Bei `false` ausgeblendet: Registrierung, Einladungen, Nutzerverwaltung, Rollen,
Lead-Zuweisung (Dropdown, Avatare, Filter), Sales-Bell-Push, Punkte-System.
**Nichts ist gelöscht** — Code, Serverfunktionen und Datenbankspalten sind
unverändert.

### Bevor wieder mehrere Leute arbeiten

1. `multiUser: true`.
2. Supabase → Authentication → Email → „Allow new users to sign up" (nur bei
   gewünschter Selbstregistrierung).
3. **Zugriffsregeln schärfen.** Auf `crm_leads` liegt `auth_full_access`
   (jeder Angemeldete darf alles) neben feineren Regeln wie „Agents can read
   their own or unassigned leads". Solche Regeln wirken additiv — die
   großzügigste gewinnt. Die Rollentrennung existiert heute nur in der
   Oberfläche. Dazu §2.2: ein Login gilt für alle Apps im Projekt.
4. Vercel: `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` setzen.
5. `saveLeadMain` auf Teil-Updates umbauen (siehe §7).

---

## 7. Offene Schulden, nach Dringlichkeit

1. **`getAgentStats` (`core/db.js`) lädt alle Anrufe in den Browser.**
   PostgREST liefert max. 1000 Zeilen — darüber zählt das Dashboard **still
   falsch**. Aktuell ~300 Anrufe, also Monate Puffer. Gehört in eine SQL-View
   mit `GROUP BY`. Das ist der einzige Posten mit Ablaufdatum.
2. **`crm_calls.by_user_id` von `text` auf `uuid` + Foreign Key ziehen.**
   Bei ~300 Zeilen harmlos, später nicht mehr.
3. **Echtes Schema versioniert ablegen** und `scratch/schema.sql` löschen.
   Zehn Minuten, verhindert Falle §2.1 dauerhaft.
4. **`lead_activities`: alte `email`-Einträge auf `message` ziehen.** Kosmetik,
   der Code kommt mit beidem klar (§5). Vorher prüfen, ob auf der Spalte `type`
   eine Prüfregel liegt — `logMessage` weicht sonst still auf `email` aus.
5. **`pipeline_ui.js` mit ~2800 Zeilen aufteilen.** Listen / Sidebar / Karte /
   Dashboard sind vier unabhängige Themen in einer Datei.
6. **`autoGeocode` ist bewusst nicht exportiert** — es würde beim Login eine
   Massen-Geocoding-Schleife starten.

**Erledigt seit dem letzten Stand:** Teil-Updates statt aller ~25 Spalten,
der tote `toggleAnalytics`, die neun Einmal-Skripte aus dem Wurzelverzeichnis
(liegen jetzt in `scratch/einmal_skripte/`).

## 8. Admin-Skripte

Alle read-only-Schritte zuerst ausführen. Die schreibenden sind irreversibel —
vorher Backup über Supabase → Database → Backups.

| Datei | Zweck |
|---|---|
| `inspect_user_columns.sql` | Welche Spalten verweisen auf Nutzer, mit Typ |
| `check_shared_project.sql` | Zeigt Zeilen, die auf gelöschte Accounts zeigen |
| `cleanup_activity_labels.sql` | Alte Beschriftungen (`FOLLOW-UP` → `DATA`) |
| `fix_anon_insert.sql` | Erledigt — anonymes Anlegen von Leads geschlossen |
| `reset_users_dev.sql` | Erledigt — alle Nutzer außer einem entfernt |
| `lockdown_dev.sql` | **NICHT ausführen**, überholt (siehe Dateikopf) |

---

## 9. Entwicklung

```bash
npm install
npm run dev      # Vite, Port 3000
npm test         # 70 Prüfungen, ohne Browser, ~1 Sekunde
npm run build
```

`npm test` (`tests/ui.test.mjs`) läuft über jsdom und deckt ab: Pipeline-Stufen,
eindeutige Aufgaben-IDs, Speichern beim Abhaken/Löschen, Snooze setzen und
aufheben, dass keine Reste im Store bleiben, Einzelkarten-Aktualisierung und
die Reihenfolge in der Speicher-Warteschlange, die Lead-Bindung der Aufgaben,
die Selbstheilung bei veraltetem Zeitstempel und dass wirklich nur geänderte
Spalten geschrieben werden. **Nach jeder Änderung an `main_ui.js`,
`pipeline_ui.js` oder `leadstore.js` laufen lassen.**

Die `/api/*`-Funktionen serviert Vite **nicht**. Änderungen dort lassen sich nur
nach dem Deploy prüfen (oder mit `vercel dev`).

Deployment: Push auf `master` → Vercel deployt automatisch.

---

## 10. Umgang mit dem Nutzer

- **Deutsch, keine Fachsprache.** Nicht „RLS-Policy", sondern „Zugriffsregel".
  Nicht „Endpoint", sondern „Serverfunktion".
- **Erst prüfen, dann behaupten.** Eine Warnung auf Basis einer veralteten
  Datei hat Vertrauen gekostet. Read-only-Abfragen sind billig.
- **Offensichtliche Bedienprobleme mit aufräumen**, statt sie nur zu benennen —
  darum wurde ausdrücklich gebeten.
- **Bestehende, funktionierende Lösungen nicht ersetzen.** Siehe §5.
- **Nicht ungefragt pushen.** Der Push auf `master` geht direkt live.
- **SQL immer einzeln.** Eine Anweisung geben, auf das Ergebnis warten, dann
  die nächste. Nie mehrere SQL-Blöcke in einer Nachricht, auch nicht bei
  reinen Abfragen. Ausdrücklich so gewünscht.
