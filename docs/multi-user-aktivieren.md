# Multi-User aktivieren

Anleitung, um vom Einzelplatz-Betrieb (ein Nutzer) zurück auf Team-Betrieb
(mehrere Nutzer, Rollen, Zuweisung) umzuschalten. Wird selten gebraucht —
zuletzt deaktiviert, weil aktuell nur ein Nutzer arbeitet.

Hintergrund und der Code-Schalter selbst stehen in `HANDOVER.md` unter
„Einzelplatz-Modus". Diese Datei ist nur die Schritt-für-Schritt-Ausführung.

## Schritte

1. **Schalter umlegen** in `public/core/config.js`:
   ```js
   window.APP_CONFIG = { multiUser: true };
   ```

2. **Selbstregistrierung entscheiden.** Supabase → Authentication → Email →
   „Allow new users to sign up" nur aktivieren, wenn Nutzer sich wirklich
   selbst registrieren sollen dürfen.

3. **Zugriffsregeln schärfen.** Auf `crm_leads` liegt aktuell `auth_full_access`
   (jeder Angemeldete darf alles) neben feineren Regeln wie „Agents can read
   their own or unassigned leads". Policies wirken **additiv** — die
   großzügigste gewinnt. Die Rollentrennung existiert heute nur in der
   Oberfläche, nicht in der Datenbank. Vor dem Umschalten prüfen, welche
   Regeln tatsächlich greifen sollen, und `auth_full_access` ggf. entfernen
   oder einschränken.

4. **Push-Benachrichtigungen einrichten.** In Vercel die Umgebungsvariablen
   `VAPID_PUBLIC_KEY` und `VAPID_PRIVATE_KEY` setzen (für die Sales-Bell).

5. **Speicherlogik ist bereits bereit.** `saveLeadMain` schreibt seit der
   Umstellung auf `leadStore.save()` ohnehin nur geänderte Spalten — kein
   zusätzlicher Schritt nötig.

## Nach der Umschaltung sichtbar

Registrierung, Einladungen, Nutzerverwaltung, Rollen, Lead-Zuweisung
(Dropdown, Avatare, Filter), Sales-Bell-Push, Punkte-System. Nichts davon
wurde beim Deaktivieren gelöscht — Code, Serverfunktionen und
Datenbankspalten sind unverändert vorhanden.
