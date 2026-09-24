/**
 * Rueckruf-Meldungen — reine Regeln, ohne Datenbank und ohne Netz.
 *
 * Welche Wiedervorlage ist faellig und noch nicht gemeldet, ist gerade
 * Nachtruhe, und wie sieht die Mitteilung aus. Liegt hier getrennt, damit
 * tests/rueckruf.test.mjs es ohne Server pruefen kann.
 */

export const ZEITZONE = 'Europe/Berlin';
export const RUHE_AB = 21;      // ab 21:00 keine Mitteilungen ...
export const RUHE_BIS = 8;      // ... bis 8:00, dann gebuendelt
const SIEBEN_TAGE = 7 * 24 * 60 * 60 * 1000;

/** Stunde in Berlin (0–23), unabhaengig von der Zeitzone des Servers. */
export function stundeBerlin(ms) {
  const teile = new Intl.DateTimeFormat('de-DE', {
    timeZone: ZEITZONE, hour: 'numeric', hourCycle: 'h23'
  }).formatToParts(new Date(ms));
  return Number(teile.find(t => t.type === 'hour').value);
}

export function uhrBerlin(ms) {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: ZEITZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date(ms));
}

export function nachtruhe(ms) {
  const h = stundeBerlin(ms);
  return h >= RUHE_AB || h < RUHE_BIS;
}

/**
 * Faellig, noch nicht gemeldet, nicht abgehakt (oder schon angerufen), nicht uralt.
 * Uralt (> 7 Tage) meldet niemand mehr per Push — das steht in der Glocke.
 */
export function zuMelden(lead, jetzt) {
  const ziel = Number(lead.snooze_until_ms) || 0;
  if (ziel <= 0 || ziel > jetzt) return false;
  if (ziel < jetzt - SIEBEN_TAGE) return false;
  const gemeldet = Number(lead.snooze_notified_ms) || 0;
  // Abgehakt oder schon angerufen/angeschrieben -> nichts mehr zu melden
  const erledigt = Math.max(Number(lead.snooze_erledigt_ms) || 0, Number(lead.last_contact_ms) || 0);
  return gemeldet < ziel && erledigt < ziel;
}

const nummer = (l) => l.phone || l.impressum_phone || '';

/**
 * Eine Mitteilung fuer einen oder mehrere Leads.
 * Ein Lead: Name im Titel, Nummer im Text, Tipp oeffnet den Lead.
 * Mehrere (etwa um 8:00 nach der Nacht): eine Sammelmitteilung.
 */
export function mitteilung(leads, jetzt) {
  const sortiert = [...leads].sort((a, b) => a.snooze_until_ms - b.snooze_until_ms);
  if (sortiert.length === 1) {
    const l = sortiert[0];
    const seit = jetzt - l.snooze_until_ms > 2 * 60 * 1000
      ? `fällig seit ${uhrBerlin(l.snooze_until_ms)}` : 'jetzt fällig';
    return {
      typ: 'rueckruf',
      title: `Rückruf: ${l.name || 'Lead ' + l.id}`,
      body: [nummer(l), seit].filter(Boolean).join(' · '),
      url: `/?lead=${l.id}`,
      tag: `rueckruf-${l.id}`,
      leadId: l.id
    };
  }
  const namen = sortiert.map(l => l.name || `Lead ${l.id}`);
  const gezeigt = namen.slice(0, 4).join(' · ');
  return {
    typ: 'rueckrufe',
    title: `${sortiert.length} Rückrufe fällig`,
    body: namen.length > 4 ? `${gezeigt} · +${namen.length - 4}` : gezeigt,
    url: '/?rueckrufe=1',
    tag: 'rueckrufe'
  };
}

/**
 * Wer bekommt was: ein Lead mit Zustaendigem geht an dessen Geraete; ohne
 * Zustaendigen (Einzelplatz, Kaltakquise) an alle Geraete.
 * Rueckgabe: Map Abo-id -> { abo, leads[] }
 */
export function verteilen(leads, abos) {
  const proAbo = new Map();
  for (const l of leads) {
    const eigene = l.claimed_by ? abos.filter(a => a.user_id === l.claimed_by) : [];
    const ziel = eigene.length ? eigene : abos;
    for (const abo of ziel) {
      if (!proAbo.has(abo.id)) proAbo.set(abo.id, { abo, leads: [] });
      proAbo.get(abo.id).leads.push(l);
    }
  }
  return proAbo;
}
