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
 *   3. In Supabase die Zugriffsregel schärfen: die Regel "dev_authenticated_only"
 *      aus admin_scripts/lockdown_dev.sql erlaubt JEDEM eingeloggten Nutzer
 *      ALLES — inklusive fremder Leads und Rollenänderungen. Vor dem zweiten
 *      Nutzer muss die durch echte Per-Nutzer-Regeln ersetzt werden.
 *   4. Vercel: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY setzen, sonst bleibt der
 *      Sales-Bell-Push aus (siehe api/push_sales_bell.js).
 *   5. saveLeadMain in public/ui/main_ui.js schreibt beim Speichern ALLE Spalten
 *      zurück. Bei einem Nutzer harmlos, bei zweien überschreibt man sich
 *      gegenseitig. Vorher auf Teil-Updates umbauen.
 */

window.APP_CONFIG = {
  multiUser: false
};

// Kurzform für die Abfrage im UI-Code
window.isMultiUser = () => !!(window.APP_CONFIG && window.APP_CONFIG.multiUser);
