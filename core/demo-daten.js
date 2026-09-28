/**
 * core/demo-daten.js — erfundene Daten für den Demo-Modus
 * ─────────────────────────────────────────────────────────────────────────────
 * Wofür: Aufnahmen für Social Media und Vorführungen. Auf dem Bildschirm soll
 * ein voller, lebendiger Vertriebstag stehen — ohne einen einzigen echten
 * Kunden.
 *
 * Regeln, damit das so bleibt:
 *  - Namen von Firmen und Ansprechpartnern sind ausgedacht.
 *  - Webseiten und E-Mail-Adressen enden auf .example. Diese Endung ist für
 *    Beispiele reserviert (RFC 2606) und im Internet nicht erreichbar.
 *  - Telefonnummern: nach der Vorwahl beginnt die Nummer mit 0. So eine
 *    Teilnehmernummer vergibt in Deutschland niemand — es kann sie nicht geben.
 *  - Alles ist relativ zu "jetzt" gebaut. Die Demo sieht an jedem Tag frisch
 *    aus: fällige Rückrufe sind fällig, die Woche hat Anrufe.
 *  - Gleicher Startwert, gleiche Daten. Eine Aufnahme lässt sich wiederholen.
 *
 * Diese Datei ist rein: kein Netz, keine Datenbank, kein window. Sie ist so
 * auch in den Prüfungen lauffähig (tests/demo.test.mjs).
 */

// Dresden, weil die Karte dort startet (public/modules/karte.js) — so stehen
// die Blips gleich im Bild. Die Firmen darin sind trotzdem erfunden.
const STADT = {
  name: 'Dresden', vorwahl: '0351', lat: 51.0504, lng: 13.7372,
  plz: ['01067', '01069', '01097', '01099', '01127', '01139', '01157', '01187', '01219', '01307']
};

const STRASSEN = ['Hauptstraße', 'Bahnhofstraße', 'Lindenstraße', 'Gartenstraße', 'Schulstraße',
  'Kirchstraße', 'Ringstraße', 'Mühlweg', 'Parkallee', 'Wiesenweg', 'Am Markt', 'Feldstraße'];

const TAG = 24 * 60 * 60 * 1000;
const STD = 60 * 60 * 1000;
const MIN = 60 * 1000;

// ── Zufall mit Startwert (mulberry32) ────────────────────────────────────────
function zufall(startwert) {
  let a = startwert >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Kleiner, stabiler Streuwert aus einem Text — dieselbe Webseite ergibt immer
// dieselbe Nummer und denselben Inhaber.
function streuwert(text) {
  let h = 2166136261;
  for (const z of String(text)) { h ^= z.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function tagKey(datum) {
  const d = new Date(datum);
  const zwei = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
}

export function slug(text) {
  return String(text).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/&/g, 'und').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Eine Nummer, die es nicht geben kann: Vorwahl, dann eine 0. */
export function demoNummer(vorwahl, zahl) {
  const n = String(zahl % 1000000).padStart(6, '0');
  return `${vorwahl} 0${n.slice(0, 2)} ${n.slice(2)}`;
}

function oeffnungszeiten(art) {
  const tage = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const muster = {
    frueh:   ['6:00 AM – 6:00 PM', '6:00 AM – 12:00 PM', 'Closed'],
    buero:   ['8:00 AM – 5:00 PM', 'Closed', 'Closed'],
    laden:   ['9:00 AM – 7:00 PM', '9:00 AM – 4:00 PM', 'Closed'],
    gastro:  ['11:00 AM – 11:00 PM', '11:00 AM – 11:00 PM', '11:00 AM – 9:00 PM'],
    immer:   ['Open 24 hours', 'Open 24 hours', 'Open 24 hours']
  }[art] || ['9:00 AM – 6:00 PM', 'Closed', 'Closed'];
  return tage.map((t, i) => `${t}: ${i < 5 ? muster[0] : i === 5 ? muster[1] : muster[2]}`);
}

// ── Der Bestand ──────────────────────────────────────────────────────────────
// stufe: cold | pitch | data | offer | closed; status: Lead | Kunde | Uninteressant
// kontakte: wie oft schon angerufen (0 = nie), rueckruf: Stunden ab jetzt
// (negativ = seit so vielen Minuten fällig, siehe unten)
const FIRMEN = [
  { name: 'Bäckerei Sonnenkorn', chef: 'Herr Albrecht', art: 'frueh', size: 'Tarifkunde', stufe: 'pitch', kontakte: 3,
    notiz: 'Chef steht bis 10 Uhr selbst in der Backstube — danach anrufen. Vertrag läuft bis 31.03.',
    aufgaben: ['Angebot mit zwei Tarifen rechnen'] },
  { name: 'Hausverwaltung Lindner & Partner', chef: 'Frau Lindner', art: 'buero', size: 'Großkunde', stufe: 'offer', kontakte: 5,
    notiz: '14 Objekte, Allgemeinstrom. Will das Angebot schriftlich, entscheidet mit Partner.', wert: 2400, rueckrufTage: 1 },
  { name: 'Autohaus Weißenborn', chef: 'Herr Weißenborn', art: 'laden', size: 'Großkunde', stufe: 'data', kontakte: 4,
    notiz: 'Zählernummern kommen per Mail von der Buchhaltung.', aufgaben: ['Zählernummern nachhaken'] },
  { name: 'Hotel Am Stadtwald', chef: 'Frau Berger', art: 'immer', size: 'Großkunde', stufe: 'pitch', kontakte: 2,
    notiz: 'Hat um Rückruf gebeten — Direktion ist nachmittags im Haus.', faelligSeitMin: 8 },
  { name: 'Physiotherapie Lindenhof', art: 'buero', size: 'Tarifkunde', stufe: 'cold', kontakte: 0, block: 1 },
  { name: 'Gasthaus Zur Linde', art: 'gastro', size: 'Tarifkunde', stufe: 'cold', kontakte: 1, block: 1,
    anrufNotiz: 'Nicht erreicht, Ruhetag Montag' },
  { name: 'Kfz-Werkstatt Brenner', art: 'laden', size: 'Tarifkunde', stufe: 'cold', kontakte: 1, block: 1 },
  { name: 'Druckerei Kästner', art: 'buero', size: 'Großkunde', stufe: 'cold', kontakte: 0, block: 1 },
  { name: 'Fitnessstudio Kraftraum Süd', chef: 'Herr Petzold', art: 'immer', size: 'Großkunde', stufe: 'data', kontakte: 3,
    notiz: 'Hoher Verbrauch durch Sauna. Will Festpreis für 24 Monate.', aufgaben: ['Verbrauch vom Vorjahr anfragen'] },
  { name: 'Eiscafé Venezia am Markt', art: 'gastro', size: 'Tarifkunde', stufe: 'closed', kontakte: 4, wert: 180, geschlossenVorTagen: 9 },
  { name: 'Tischlerei Holzmann', art: 'buero', size: 'Tarifkunde', stufe: 'cold', kontakte: 0, block: 2 },
  { name: 'Wäscherei Blütenweiß', chef: 'Herr Krüger', art: 'laden', size: 'Großkunde', stufe: 'offer', kontakte: 4,
    notiz: 'Vergleicht mit Stadtwerke-Angebot. Preis ist das Thema, nicht der Service.', wert: 1600, rueckrufTage: 2 },
  { name: 'Metzgerei Fuchs', chef: 'Frau Fuchs', art: 'frueh', size: 'Tarifkunde', stufe: 'pitch', kontakte: 2,
    notiz: 'Zwei Kühlhäuser. Interesse an Strom und Gas.', aufgaben: ['Angebot Strom + Gas'] },
  { name: 'Brauhaus Elbtaler', art: 'gastro', size: 'Großkunde', stufe: 'closed', kontakte: 6, wert: 1250, geschlossenVorTagen: 3 },
  { name: 'Blumenhaus Vergissmeinnicht', art: 'laden', size: 'Tarifkunde', stufe: 'cold', kontakte: 0, block: 2 },
  { name: 'Zahnarztpraxis Dr. Seidel', art: 'buero', size: 'Tarifkunde', stufe: 'cold', kontakte: 1, block: 2, rueckrufTage: 1 },
  { name: 'Markt am Eck', art: 'laden', size: 'Großkunde', stufe: 'cold', kontakte: 1, block: 2 },
  { name: 'Getränke Hopfen & Malz', art: 'laden', size: 'Tarifkunde', stufe: 'cold', kontakte: 0, block: 2 },
  { name: 'Pension Rosengarten', art: 'immer', size: 'Tarifkunde', stufe: 'closed', kontakte: 3, geschlossenVorTagen: 16 },
  { name: 'Steuerbüro Hartmann', art: 'buero', size: 'Tarifkunde', stufe: 'cold', status: 'Uninteressant', kontakte: 2 },
  { name: 'Café Milchbart', art: 'gastro', size: 'Tarifkunde', stufe: 'cold', kontakte: 0, block: 1 },
  { name: 'Schlosserei Eisenherz', chef: 'Herr Vogt', art: 'buero', size: 'Großkunde', stufe: 'pitch', kontakte: 2,
    notiz: 'Drei Hallen, Drehstrom. Entscheidet der Senior, der ist Donnerstag da.' },
  { name: 'Kosmetikstudio Glanzpunkt', art: 'laden', size: 'Tarifkunde', stufe: 'cold', kontakte: 0, block: 1 },
  { name: 'Imbiss Zur Ecke', art: 'gastro', size: 'Tarifkunde', stufe: 'cold', kontakte: 1, block: 2 }
];

const SCOUT_ZUSAETZE = ['Morgenrot', 'Kornblume', 'am Markt', 'Sonnenschein', 'Lindenhof', 'Goldstück',
  'Stadtmitte', 'am Park', 'Mühlenstein', 'Süd', 'Nord', 'Westend', 'am Ring', 'Flussblick',
  'Zum Anker', 'Feinschliff', 'Rosenhof', 'Kastanie', 'Auenblick', 'Löwenzahn'];

const NACHNAMEN = ['Albrecht', 'Becker', 'Hoffmann', 'Kramer', 'Lehmann', 'Neumann', 'Richter', 'Schulze',
  'Seifert', 'Wagner', 'Winkler', 'Zimmermann'];
const VORNAMEN = ['Anja', 'Frank', 'Jana', 'Jens', 'Katrin', 'Markus', 'Sabine', 'Thomas', 'Ute', 'Uwe'];

/**
 * Baut den ganzen Demo-Bestand. Gibt Rohzeilen zurück, so wie die Datenbank
 * sie liefert (mit crm_calls und lead_activities) — die Oberfläche bekommt sie
 * durch dieselbe Aufbereitung wie echte Daten.
 */
export function erzeugeDemoDaten(jetzt = Date.now(), startwert = 20260928) {
  const r = zufall(startwert);
  const zahl = (min, max) => Math.floor(min + r() * (max - min + 1));
  const wahl = (liste) => liste[Math.floor(r() * liste.length)];

  let naechsteAnrufId = 50001;
  let naechsteAktivitaetId = 70001;
  // Zwei Scout-Importe: vor drei Tagen am Abend, vor neun Tagen
  const umUhr = (vorTagen, stunde, minute) => {
    const d = new Date(jetzt - vorTagen * TAG); d.setHours(stunde, minute, 0, 0); return d.getTime();
  };
  const kopfBlock = { 1: umUhr(3, 19, 40), 2: umUhr(9, 20, 15) };

  const leads = FIRMEN.map((f, i) => {
    const id = 9001 + i;
    const domain = slug(f.name) + '.example';
    const plz = STADT.plz[i % STADT.plz.length];
    const adresse = `${STRASSEN[i % STRASSEN.length]} ${zahl(2, 88)}, ${plz} ${STADT.name}`;
    const lat = STADT.lat + (r() - 0.5) * 0.06;
    const lng = STADT.lng + (r() - 0.5) * 0.1;
    const status = f.status || (f.stufe === 'closed' ? 'Kunde' : 'Lead');
    const zeiten = oeffnungszeiten(f.art);

    // Anrufe: die letzten liegen näher an heute, je weiter der Lead ist
    const anrufe = [];
    for (let k = 0; k < f.kontakte; k++) {
      const vorTagen = (f.kontakte - k) * zahl(2, 5) - zahl(0, 1);
      const ts = jetzt - Math.max(vorTagen, 1) * TAG + zahl(-3, 3) * STD;
      const letzter = k === f.kontakte - 1;
      anrufe.push({
        id: naechsteAnrufId++, lead_id: id, ts, type: 'call',
        outcome: letzter && f.anrufNotiz ? 'not_reached' : (r() < 0.7 ? 'reached' : 'not_reached'),
        notes: letzter && f.anrufNotiz ? f.anrufNotiz : null,
        stage_at_call: k === 0 ? 'cold' : f.stufe === 'closed' ? 'offer' : f.stufe,
        size_at_call: f.size, is_estimated: false, by_user_name: 'Demo'
      });
    }

    // Verlauf: Stufenwechsel passend zum Weg, dazu Nachrichten
    const aktivitaeten = [];
    const weg = ['cold', 'pitch', 'data', 'offer', 'closed'];
    const ziel = weg.indexOf(f.stufe);
    for (let s = 1; s <= ziel; s++) {
      const bezug = anrufe[Math.min(s, anrufe.length - 1)];
      aktivitaeten.push({
        id: naechsteAktivitaetId++, lead_id: id, type: 'status_change',
        ts: (bezug ? bezug.ts : jetzt - s * TAG) + 5 * MIN,
        details: `Status geändert auf ${weg[s].toUpperCase()}`,
        from_stage: weg[s - 1], to_stage: weg[s], is_estimated: false, by_user_name: 'Demo'
      });
    }
    if (f.kontakte >= 2 && r() < 0.6) {
      aktivitaeten.push({
        id: naechsteAktivitaetId++, lead_id: id, type: 'message',
        ts: anrufe[anrufe.length - 1].ts + 20 * MIN,
        details: r() < 0.5 ? 'WhatsApp geschrieben' : 'E-Mail geschrieben', by_user_name: 'Demo'
      });
    }

    const letzterKontakt = anrufe.length ? Math.max(...anrufe.map(a => a.ts)) : 0;
    const geschlossen = f.geschlossenVorTagen ? jetzt - f.geschlossenVorTagen * TAG : null;

    let snooze = 0;
    if (f.faelligSeitMin) snooze = jetzt - f.faelligSeitMin * MIN;
    else if (f.rueckrufTage) {
      const d = new Date(jetzt + f.rueckrufTage * TAG); d.setHours(9, 0, 0, 0);
      snooze = d.getTime();
    }

    const erstellt = f.block ? kopfBlock[f.block] : jetzt - (20 + i) * TAG;
    const aufgaben = (f.aufgaben || []).map((text, n) => ({ id: id * 10 + n, text, done: false, subtasks: [] }));
    const suchNotiz = f.block ? `[Scout-Suche: ${f.block === 1 ? 'Gastronomie & Dienstleister' : 'Einzelhandel'} ${STADT.name}]` : '';

    return {
      id,
      name: f.chef ? `${f.chef} / ${f.name}` : f.name,
      phone: demoNummer(STADT.vorwahl, streuwert(f.name)),
      impressum_phone: null,
      email: f.kontakte > 0 || r() < 0.5 ? `info@${domain}` : null,
      website_url: `https://${domain}`,
      company_domain: domain,
      google_maps_url: null,
      google_place_id: `demo-${id}`,
      maps_city: adresse,
      lat, lng,
      locations: [{ place_id: `demo-${id}`, name: f.name, address: adresse, lat, lng,
                    opening_hours: { weekdayDescriptions: zeiten }, source: 'demo' }],
      opening_hours: null,
      stage: f.stufe, status, size: f.size,
      notes: [suchNotiz, f.notiz || ''].filter(Boolean).join('\n'),
      task_text: aufgaben.length ? JSON.stringify(aufgaben) : '',
      snooze_until_ms: snooze, snooze_erledigt_ms: null,
      last_contact_ms: letzterKontakt,
      created_at_ms: erstellt,
      last_edited_ms: Math.max(letzterKontakt, erstellt),
      closed_at_ms: status === 'Kunde' ? geschlossen : null,
      provi_umsatz: f.wert ?? null,
      estimated_kwh: f.size === 'Großkunde' ? zahl(60, 240) * 1000 : zahl(8, 40) * 1000,
      starred: false,
      interest_strom: true, interest_gas: /Metzgerei|Brauhaus|Wäscherei|Hotel/.test(f.name),
      closed_strom: status === 'Kunde', closed_gas: false,
      zaehlernummern: null, abschlussdatum: null, umsatz: null,
      linked_leads: [], claimed_by: null, is_multi_site: false,
      crm_calls: anrufe,
      lead_activities: aktivitaeten
    };
  });

  return {
    leads,
    tageswerte: erzeugeTageswerte(jetzt, r),
    ziele: [
      { id: 1, metric_key: 'sales.calls_count', label: 'Anrufe', base_value: 20, target_value: 30, comparator: '>=', sort_order: 10, valid_from: '2026-01-01' },
      { id: 2, metric_key: 'sales.calls_cold_gross', label: 'Cold Großkunden', base_value: 6, target_value: 10, comparator: '>=', sort_order: 20, valid_from: '2026-01-01' },
      { id: 3, metric_key: 'sales.calls_cold_tarif', label: 'Cold Tarif', base_value: 8, target_value: 12, comparator: '>=', sort_order: 30, valid_from: '2026-01-01' },
      { id: 4, metric_key: 'sales.calls_followup', label: 'Nachgreifen', base_value: 4, target_value: 8, comparator: '>=', sort_order: 40, valid_from: '2026-01-01' }
    ],
    einstellungen: {
      'rhythm.morning_end': '12:00',
      'rhythm.active_weekdays': [1, 2, 3, 4, 5, 6],
      'block.start_date': tagKey(jetzt - 33 * TAG),
      'block.weeks': 12
    },
    naechsteIds: { lead: 9001 + leads.length, anruf: naechsteAnrufId, aktivitaet: naechsteAktivitaetId }
  };
}

/**
 * Tageswerte wie aus crm_daily_metrics: die letzten zwölf Wochen, Montag bis
 * Samstag, langsam steigend. Heute steht bewusst UNTER dem Soll — in der
 * Aufnahme soll man sehen, wie die Zahl mit jedem Anruf wächst.
 */
function erzeugeTageswerte(jetzt, r) {
  const zeilen = [];
  const neu = (tag, key, wert) => { if (wert > 0) zeilen.push({ metric_key: key, tag, wert }); };
  for (let vorTagen = 84; vorTagen >= 0; vorTagen--) {
    const d = new Date(jetzt - vorTagen * TAG);
    if (d.getDay() === 0) continue;                          // Sonntag zählt nicht
    const tag = tagKey(d);
    let anrufe = vorTagen === 0 ? 12
      : Math.round(14 + (84 - vorTagen) * 0.2 + (r() - 0.5) * 10);
    if (d.getDay() === 6 && vorTagen !== 0) anrufe = Math.round(anrufe * 0.5);
    anrufe = Math.max(0, Math.min(anrufe, 38));
    const gross = Math.round(anrufe * 0.35);
    const tarif = Math.round(anrufe * 0.4);
    const nach = Math.max(0, anrufe - gross - tarif);
    neu(tag, 'sales.calls_count', anrufe);
    neu(tag, 'sales.calls_cold_gross', gross);
    neu(tag, 'sales.calls_cold_tarif', tarif);
    neu(tag, 'sales.calls_followup', nach);
    neu(tag, 'sales.calls_first_contact', Math.round((gross + tarif) * 0.7));
    neu(tag, 'sales.calls_morning_gross', Math.round(gross * 0.8));
    neu(tag, 'sales.calls_afternoon_tarif', Math.round(tarif * 0.7));
    if (vorTagen === 0) continue;                            // heute: nur Anrufe
    neu(tag, 'sales.stage_cold_pitch', Math.round(anrufe * 0.08 + r()));
    neu(tag, 'sales.stage_pitch_data', r() < 0.5 ? 1 : 0);
    neu(tag, 'sales.stage_data_offer', r() < 0.3 ? 1 : 0);
    if (r() < 0.18) {
      neu(tag, 'sales.stage_offer_closed', 1);
      neu(tag, 'sales.closed_count', 1);
      neu(tag, 'sales.closed_value_eur', [180, 240, 420, 950, 1250][Math.floor(r() * 5)]);
    }
  }
  return zeilen;
}

/**
 * Treffer für den Radar Scout — im Format der Google-Places-Antwort. Der Name
 * wird aus dem Suchbegriff gebaut: "Bäckerei" ergibt "Bäckerei Morgenrot" usw.
 */
export function scoutTreffer(suchtext, anzahl = 20) {
  const text = String(suchtext || '').trim();
  const [begriffRoh] = text.split(/\s+in\s+/i);
  const begriff = (begriffRoh || 'Betrieb').trim().split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const r = zufall(streuwert(text.toLowerCase()));
  const art = /bäcker|metzger|fleisch/i.test(begriff) ? 'frueh'
    : /restaurant|café|cafe|gast|imbiss|pizza|bar|hotel/i.test(begriff) ? 'gastro'
    : /büro|verwaltung|kanzlei|praxis|steuer/i.test(begriff) ? 'buero' : 'laden';
  const zusaetze = SCOUT_ZUSAETZE.slice().sort(() => r() - 0.5);
  return Array.from({ length: Math.min(anzahl, zusaetze.length) }, (_, i) => {
    const name = `${begriff} ${zusaetze[i]}`;
    const domain = slug(name) + '.example';
    const lat = STADT.lat + (r() - 0.5) * 0.08;
    const lng = STADT.lng + (r() - 0.5) * 0.12;
    return {
      id: `demo-scout-${streuwert(name)}`,
      displayName: { text: name, languageCode: 'de' },
      formattedAddress: `${STRASSEN[i % STRASSEN.length]} ${1 + Math.floor(r() * 90)}, ${STADT.plz[i % STADT.plz.length]} ${STADT.name}, Deutschland`,
      nationalPhoneNumber: demoNummer(STADT.vorwahl, streuwert(name)),
      websiteUri: `https://${domain}`,
      location: { latitude: lat, longitude: lng },
      googleMapsUri: '',
      rating: Math.round((3.6 + r() * 1.4) * 10) / 10,
      userRatingCount: Math.floor(5 + r() * 400),
      primaryTypeDisplayName: { text: begriff, languageCode: 'de' },
      regularOpeningHours: { weekdayDescriptions: oeffnungszeiten(art) }
    };
  });
}

/**
 * Eine Startseite mit Impressum für eine .example-Adresse. Damit zeigt das
 * Nachtragen von Telefon und E-Mail in der Demo, was es kann — Inhaber und
 * Nummer sind aus der Adresse abgeleitet und damit bei jedem Aufruf gleich.
 */
export function impressumSeite(url) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return null; }
  if (!host.endsWith('.example')) return null;
  const h = streuwert(host);
  const firma = host.replace(/\.example$/, '').split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const inhaber = `${VORNAMEN[h % VORNAMEN.length]} ${NACHNAMEN[(h >>> 4) % NACHNAMEN.length]}`;
  const tel = demoNummer(STADT.vorwahl, h >>> 3);
  return `<!doctype html><html lang="de"><head><title>${firma}</title></head><body>
<header><h1>${firma}</h1></header>
<main><p>Willkommen bei ${firma} in ${STADT.name}.</p></main>
<footer><h2>Impressum</h2>
<p>${firma}<br>Inhaber: ${inhaber}<br>${STRASSEN[h % STRASSEN.length]} ${1 + (h % 80)}<br>${STADT.plz[h % STADT.plz.length]} ${STADT.name}</p>
<p>Telefon: ${tel}<br>E-Mail: info@${host}</p></footer>
</body></html>`;
}

export const DEMO_STADT = STADT;
