import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://duzmanqvyhqurxlpxrrg.supabase.co';
// Der anon-Key ist oeffentlich (RLS schuetzt die Daten) — gleicher Fallback wie in api/proxy.js,
// damit der Endpoint auch ohne gesetzte Env-Var funktioniert.
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1em1hbnF2eWhxdXJ4bHB4cnJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzOTk1NTQsImV4cCI6MjA5NDk3NTU1NH0.v7dSCQQn2T_3LHrTj4j2K5Byz3oKvuKE2zO7M9BA4Uo';

/**
 * Validiert den Bearer-Token des Requests gegen Supabase Auth und laedt das
 * zugehoerige Profil. Gibt { user, profile } zurueck oder wirft einen Fehler
 * mit .status.
 *
 * WICHTIG: Rollenpruefungen gehoeren hierher (Server), nicht in den Client.
 * Der Client-Check in core/db.js ist reine UI-Kosmetik und nicht durchsetzbar.
 */
export async function requireUser(req) {
  if (!SUPABASE_ANON_KEY) {
    const e = new Error('VITE_SUPABASE_ANON_KEY fehlt in den Environment Variables.');
    e.status = 500;
    throw e;
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    const e = new Error('Unauthorized: No token provided');
    e.status = 401;
    throw e;
  }
  const token = authHeader.slice(7).trim();

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    const e = new Error('Unauthorized: Invalid token');
    e.status = 401;
    throw e;
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, name, role, daily_call_goal')
    .eq('id', user.id)
    .maybeSingle();

  // daily_call_goal === -1 ist der Gesperrt-Marker (siehe core/db.js)
  if (profile && profile.daily_call_goal === -1) {
    const e = new Error('Account deaktiviert');
    e.status = 403;
    throw e;
  }

  return { user, profile: profile || { id: user.id, role: 'agent' } };
}

export async function requireAdmin(req) {
  const ctx = await requireUser(req);
  const role = ctx.profile.role;
  if (role !== 'admin' && role !== 'developer') {
    const e = new Error('Forbidden: Admin-Rechte erforderlich');
    e.status = 403;
    throw e;
  }
  return ctx;
}
