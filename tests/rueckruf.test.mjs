/**
 * Rueckruf-Meldungen — Regeln des Servers (api/_lib/rueckrufe.js).
 */
import { nachtruhe, stundeBerlin, zuMelden, mitteilung, verteilen } from '../api/_lib/rueckrufe.js';

const ok = [];
const fail = [];
const check = (name, cond) => (cond ? ok : fail).push(name);

// Zeiten in Berlin, unabhaengig von der Zeitzone dieses Rechners
const berlin = (iso) => new Date(iso).getTime();   // ISO mit Offset

check('14:00 Sommerzeit ist 14 Uhr in Berlin', stundeBerlin(berlin('2026-09-24T14:00:00+02:00')) === 14);
check('14:00 Winterzeit ist 14 Uhr in Berlin', stundeBerlin(berlin('2026-12-03T14:00:00+01:00')) === 14);
check('20:59 keine Nachtruhe', !nachtruhe(berlin('2026-09-24T20:59:00+02:00')));
check('21:00 Nachtruhe', nachtruhe(berlin('2026-09-24T21:00:00+02:00')));
check('00:00 Nachtruhe', nachtruhe(berlin('2026-09-25T00:00:00+02:00')));
check('07:59 Nachtruhe', nachtruhe(berlin('2026-09-25T07:59:00+02:00')));
check('08:00 wieder frei', !nachtruhe(berlin('2026-09-25T08:00:00+02:00')));

const jetzt = berlin('2026-09-24T14:53:30+02:00');
const faellig = jetzt - 30 * 1000;
check('Faellig, nie gemeldet -> melden', zuMelden({ snooze_until_ms: faellig }, jetzt));
check('Noch nicht faellig -> nicht melden', !zuMelden({ snooze_until_ms: jetzt + 60000 }, jetzt));
check('Keine Wiedervorlage -> nicht melden', !zuMelden({ snooze_until_ms: 0 }, jetzt));
check('Schon gemeldet -> nicht doppelt', !zuMelden({ snooze_until_ms: faellig, snooze_notified_ms: faellig + 1 }, jetzt));
check('Gemeldet fuer eine FRUEHERE Wiedervorlage -> neu melden',
  zuMelden({ snooze_until_ms: faellig, snooze_notified_ms: faellig - 3600000 }, jetzt));
check('Abgehakt -> nicht melden', !zuMelden({ snooze_until_ms: faellig, snooze_erledigt_ms: faellig + 5 }, jetzt));
check('Schon angerufen -> nicht melden', !zuMelden({ snooze_until_ms: faellig, last_contact_ms: faellig + 5 }, jetzt));
check('Anruf VOR dem Faelligwerden zaehlt nicht', zuMelden({ snooze_until_ms: faellig, last_contact_ms: faellig - 60000 }, jetzt));
check('Aelter als 7 Tage -> kein Push mehr', !zuMelden({ snooze_until_ms: jetzt - 8 * 86400000 }, jetzt));

// Mitteilung
const a = { id: 7, name: 'Bäckerei Müller', phone: '0351 123', snooze_until_ms: faellig };
const m1 = mitteilung([a], jetzt);
check('Einzeln: Name im Titel', m1.title === 'Rückruf: Bäckerei Müller');
check('Einzeln: Nummer und "jetzt fällig"', m1.body === '0351 123 · jetzt fällig');
check('Einzeln: oeffnet den Lead', m1.url === '/?lead=7' && m1.leadId === 7 && m1.tag === 'rueckruf-7');
const nachts = { id: 8, name: 'Autohaus', impressum_phone: '0351 999', snooze_until_ms: berlin('2026-09-24T00:00:00+02:00') };
const m8 = mitteilung([nachts], berlin('2026-09-24T08:00:10+02:00'));
check('Nachts faellig, um 8 gemeldet: "fällig seit 00:00"', m8.body === '0351 999 · fällig seit 00:00');
const viele = [1, 2, 3, 4, 5, 6].map(i => ({ id: i, name: `Firma ${i}`, snooze_until_ms: faellig - i * 1000 }));
const mv = mitteilung(viele, jetzt);
check('Mehrere: eine Sammelmitteilung', mv.title === '6 Rückrufe fällig' && mv.url === '/?rueckrufe=1');
check('Mehrere: aelteste zuerst, hoechstens vier Namen', mv.body.startsWith('Firma 6 · Firma 5') && mv.body.endsWith('+2'));

// Verteilen
const abos = [{ id: 'a', user_id: 'rico' }, { id: 'b', user_id: 'rico' }, { id: 'c', user_id: 'anna' }];
const v1 = verteilen([{ id: 1, claimed_by: 'anna' }], abos);
check('Zustaendiger bekommt es, nur er', [...v1.keys()].join() === 'c');
const v2 = verteilen([{ id: 2, claimed_by: null }, { id: 3, claimed_by: null }], abos);
check('Ohne Zustaendigen: alle Geraete, gebuendelt', v2.size === 3 && v2.get('a').leads.length === 2);
const v3 = verteilen([{ id: 4, claimed_by: 'max' }], abos);
check('Zustaendiger ohne Geraet: alle bekommen es', v3.size === 3);

console.log(`${ok.length} bestanden, ${fail.length} fehlgeschlagen`);
if (fail.length) { fail.forEach(f => console.log('  FEHLER:', f)); process.exit(1); }
