# MCP-Server einrichten

Damit Claude direkt mit dem CRM arbeiten kann: Leads suchen und anzeigen,
Notizen und Aufgaben anlegen, Pipeline-Stufe setzen, Anrufe festhalten.

**Die Adresse, die in das Feld „Server-URL" gehört:**

```
https://calling-station.vercel.app/api/mcp
```

> Falls die Live-Adresse eine andere ist: es ist immer die Adresse der
> veröffentlichten App plus `/api/mcp`. Das Deployment heißt aus historischen
> Gründen noch `calling-station` — siehe Falle 5b im Handover.

---

## 1. Zugangswort erzeugen

Ein langes, zufälliges Wort. Einmal erzeugen, an zwei Stellen eintragen:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Das Ergebnis kommt **nicht** in eine Datei im Projekt — der Code liegt in einem
öffentlichen Repository.

## 2. Bei Vercel hinterlegen

Vercel → Projekt `calling-station` → Settings → Environment Variables:

| Name | Wert | Umgebung |
|---|---|---|
| `MCP_TOKEN` | das erzeugte Zugangswort | Production |
| `SUPABASE_SERVICE_ROLE_KEY` | liegt bereits vor | Production |

Danach einmal neu veröffentlichen (Deployments → ⋯ → Redeploy), sonst kennt
die Serverfunktion die neue Variable nicht.

**Ohne `MCP_TOKEN` antwortet der Server gar nicht.** Das ist Absicht: er hängt
an der produktiven Datenbank, und eine vergessene Variable darf ihn nicht offen
stehen lassen.

## 3. Connector eintragen

In Claude unter „Connector hinzufügen":

- **Name:** Lightning CRM
- **Server-URL:** `https://calling-station.vercel.app/api/mcp`
- **Authentifizierung:** Bearer Token → das Zugangswort aus Schritt 1

## 4. Prüfen

```bash
curl -s -X POST https://calling-station.vercel.app/api/mcp \
  -H "Authorization: Bearer DEIN_ZUGANGSWORT" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Erwartet: eine Liste mit neun Werkzeugen. Kommt `401`, stimmt das Zugangswort
nicht oder es wurde nach dem Setzen nicht neu veröffentlicht.

---

## Was der Server kann

| Werkzeug | Was es tut | Schreibt |
|---|---|---|
| `leads_suchen` | Leads filtern und auflisten | nein |
| `lead_anzeigen` | ein Lead mit Aufgaben und Verlauf | nein |
| `kennzahlen` | Bestand, Stufen, Anrufe heute/diese Woche | nein |
| `notiz_anhaengen` | hängt einen Absatz mit Datum an die Notizen | ja |
| `aufgabe_anlegen` | legt eine offene Aufgabe an | ja |
| `aufgabe_abhaken` | setzt eine Aufgabe auf erledigt | ja |
| `stufe_setzen` | setzt die Pipeline-Stufe | ja |
| `anruf_festhalten` | hält einen Anruf fest | ja |
| `nachricht_festhalten` | hält E-Mail oder WhatsApp fest | ja |

Einträge, die über diesen Weg entstehen, stehen im Verlauf des Leads mit dem
Zusatz **MCP** — man sieht also, was von Hand kam und was nicht.

---

## Grenzen, die bewusst so sind

- **Leads anlegen und löschen geht nicht.** Beides ist über die App bewusster
  zu tun; ein versehentlicher Aufruf kostet sonst Bestand.
- **Nur bestimmte Spalten sind schreibbar** (`api/_lib/crm.js`, Liste
  `SCHREIBBAR`). `claimed_by`, `created_at_ms` und alles Rechnerische stehen
  nicht drin.
- **Fremdänderungen werden erkannt.** Wer auf einem veralteten Stand schreibt,
  bekommt einen Hinweis statt eines stillen Überschreibens.
- **Kein Zustand zwischen zwei Anfragen.** Der Server hält keinen offenen
  Ereignisstrom (kein SSE); `GET` wird abgelehnt.

## Wenn etwas nicht geht

| Antwort | Ursache |
|---|---|
| `401` | Zugangswort falsch, oder `MCP_TOKEN` fehlt bzw. ist kürzer als 24 Zeichen |
| `405` | Es wurde `GET` geschickt — der Server nimmt nur `POST` |
| Werkzeug meldet „SUPABASE_SERVICE_ROLE_KEY fehlt" | Variable bei Vercel nicht gesetzt oder nicht neu veröffentlicht |
| `409` im Werkzeug | Der Lead wurde in der Zwischenzeit geändert — noch einmal anzeigen lassen |

## Zugang sperren

`MCP_TOKEN` bei Vercel ändern oder löschen, dann neu veröffentlichen. Der alte
Zugang ist sofort tot.
