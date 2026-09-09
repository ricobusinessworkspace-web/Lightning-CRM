# Lightning CRM

Web-CRM für Leadgenerierung, Kaltakquise und Vertriebs-Pipeline. Aktuell im
Einzelplatz-Betrieb.

**Für den aktuellen Projektzustand (was läuft, was ist offen, was ist kaputt)
siehe [HANDOVER.md](HANDOVER.md) — dort auch die vollständige Doku-Tabelle.**

## Tech Stack

| Was | Details |
|---|---|
| Frontend | Vanilla JS, kein Framework. Globale `window.*`, HTML als Template-String via `innerHTML`. |
| Build/Dev | Vite |
| Backend | Supabase (PostgreSQL + Auth + Realtime) |
| Serverfunktionen | Vercel Functions unter `/api/` |
| Tests | `tests/ui.test.mjs`, jsdom |
| Deployment | Push auf `master` → Vercel deployt automatisch |

## Setup

```bash
npm install
npm run dev      # Vite, Port 3000
npm test         # jsdom-Tests, ~1 Sekunde
npm run build
```

Die `/api/*`-Funktionen serviert Vite **nicht** — Änderungen dort lassen sich
nur nach dem Deploy prüfen (oder mit `vercel dev`).

## Verzeichnisse

```
index.html               Layout, Modals, Navigation, Skript-Reihenfolge
core/db.js               Supabase-Zugriff, gesamte Datenlogik
core/api.js              window.api — dünne Fassade über db.js
core/auth.js             Passkey-Stub, Developer-Unlock
public/core/config.js    DER SCHALTER (multiUser)
public/core/store.js     Proxy-Store, window.store.state
public/core/leadstore.js DER EINZIGE SCHREIBWEG (siehe HANDOVER.md §„Was funktioniert")
public/ui/pipeline_ui.js Listen, Karten, Sidebar, Karte, Dashboard
public/ui/main_ui.js     Speichern, Aufgaben, Snooze, Toasts, Bulk
public/modules/scraper.js Radar Scout (Google Places / OSM)
ui/init.js               Bootstrap, Login, Realtime-Abo
api/                     Vercel Functions + api/_lib/auth.js
admin_scripts/           SQL für Wartung — schreibt direkt auf Produktiv-DB, siehe HANDOVER.md
docs/                    Schritt-für-Schritt-Anleitungen (Runbooks), selten gebraucht
tests/ui.test.mjs        Testsuite
```

## Anleitungen (docs/)

| Datei | Wofür |
|---|---|
| [docs/multi-user-aktivieren.md](docs/multi-user-aktivieren.md) | Vom Einzelplatz- zurück auf Team-Betrieb umschalten |
