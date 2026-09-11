/**
 * config.js — zentrale Schalter für das CRM
 * ─────────────────────────────────────────────────────────────────────────────
 * Muss VOR allen anderen Skripten geladen werden (siehe index.html).
 *
 *   multiUser: false → Einzelplatz-Betrieb. Alles rund um mehrere Nutzer ist
 *                       ausgeblendet: Einladungen, Nutzerverwaltung, Rollen,
 *                       Lead-Zuweisung, Sales-Bell-Push, Punkte-System,
 *                       Registrierung.
 *
 *   multiUser: true   → alles wieder da. Nichts wurde gelöscht, weder im Code
 *                       noch in der Datenbank (claimed_by, by_user_id und die
 *                       Server-Funktionen unter /api sind unverändert vorhanden).
 *
 * ─── Wenn wieder mehrere Leute mitarbeiten sollen ───────────────────────────
 *   1. Hier multiUser auf true setzen.
 *   2. In Supabase: Authentication → Sign In / Providers → Email →
 *      "Allow new users to sign up" wieder an (nur falls Selbst-Registrierung
 *      gewünscht ist; über Einladungen geht es auch ohne).
 *   3. In Supabase die Zugriffsregeln schärfen: auf crm_leads liegt die Regel
 *      "auth_full_access" (jeder Angemeldete darf alles). Sie hebelt die feiner
 *      abgestuften Agent-Regeln daneben aus, weil solche Regeln additiv wirken.
 *      Die Rollentrennung existiert aktuell nur in der Oberfläche.
 *      Zudem teilen sich mehrere Apps diese Datenbank — ein Login gilt überall.
 *   4. Vercel: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY setzen, sonst bleibt der
 *      Sales-Bell-Push aus (siehe api/push_sales_bell.js).
 *   5. (erledigt) saveLeadMain schrieb früher beim Speichern alle Spalten
 *      zurück — bei zwei Nutzern hätte man sich gegenseitig überschrieben.
 *      Seit dem leadStore-Umbau schreibt es nur noch die geänderten Spalten
 *      (leadStore.diff in public/ui/main_ui.js), Prüfung 12 sichert das ab.
 */

window.APP_CONFIG = {
  multiUser: false
};

// Kurzform für die Abfrage im UI-Code
window.isMultiUser = () => !!(window.APP_CONFIG && window.APP_CONFIG.multiUser);
