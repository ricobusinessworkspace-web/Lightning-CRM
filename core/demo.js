/**
 * core/demo.js — Demo-Modus: die ganze App mit erfundenen Daten
 * ─────────────────────────────────────────────────────────────────────────────
 * Einschalten: die Adresse mit ?demo aufrufen, z. B.
 *     https://calling-station.vercel.app/?demo
 * Ohne ?demo passiert hier nichts — die App arbeitet wie immer.
 *
 * Wofür: Aufnahmen für Social Media und Vorführungen, ohne echte Kunden.
 *
 * Was der Demo-Modus garantiert:
 *  1. Keine Anfrage an die echte Datenbank. JEDE Funktion von window.api wird
 *     ersetzt — auch eine, die hier nicht eigens nachgebaut ist; die antwortet
 *     dann leer, statt durchzureichen. Kommt später eine neue Funktion dazu,
 *     ist sie im Demo-Modus also automatisch abgeschaltet.
 *  2. Nichts wird gespeichert. Alles lebt im Speicher dieses Tabs. Neu laden
 *     stellt den Anfangszustand wieder her.
 *  3. Keine fremden Dienste für Suchen und Nachtragen: Google Places,
 *     Nominatim, Overpass und die eigenen Serverfunktionen unter /api
 *     beantwortet der Demo-Modus selbst.
 *
 * Diese Datei holt sich die Datenbank-Schicht NICHT selbst (kein Import von
 * db.js). Die Aufbereitung der Zeilen bekommt sie von core/api.js gereicht —
 * dieselbe wie für echte Daten, damit die Demo genau so aussieht wie der
 * Alltag.
 */
import { erzeugeDemoDaten, scoutTreffer, impressumSeite, tagKey, DEMO_STADT } from './demo-daten.js';

const DEMO_NUTZER = {
  id: 'demo-nutzer', email: 'demo@lightning.example', name: 'Demo',
  role: 'developer', daily_call_goal: 30
};

// Funktionen, die nichts lesen oder schreiben — die bleiben, wie sie sind.
const REIN = new Set(['getStage', 'sortLeads', 'copyText', 'updateTray']);

export function demoGewuenscht(ort) {
  try { return new URLSearchParams((ort && ort.search) || '').has('demo'); }
  catch (e) { return false; }
}

const klon = (wert) => JSON.parse(JSON.stringify(wert));
const letzte = (liste, n) => (Array.isArray(liste) ? liste : [])
  .slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, n);

/**
 * Ersetzt die Funktionen von `api` durch Demo-Fassungen und fängt die
 * Netzabfragen ab, die sonst nach draußen gingen.
 *
 * @param win    das Fenster (im Browser window, in den Prüfungen jsdom)
 * @param api    window.api — wird an Ort und Stelle umgebaut
 * @param hilfen { postProcessAndSort, normalizeRow } aus core/db.js
 */
export function installiereDemo(win, api, hilfen, jetzt = Date.now()) {
  const { postProcessAndSort, normalizeRow } = hilfen;
  const daten = erzeugeDemoDaten(jetzt);
  const ids = daten.naechsteIds;
  const lead = (id) => daten.leads.find(l => String(l.id) === String(id));

  // ── Kennzahlen, die mit der Demo mitlaufen ───────────────────────────────
  const tagesZaehler = (key, plus = 1) => {
    const tag = tagKey(Date.now());
    const zeile = daten.tageswerte.find(z => z.metric_key === key && z.tag === tag);
    if (zeile) zeile.wert += plus; else daten.tageswerte.push({ metric_key: key, tag, wert: plus });
  };

  const faellig = () => {
    const j = Date.now();
    return daten.leads.filter(l =>
      l.snooze_until_ms > 0 && l.snooze_until_ms <= j && l.snooze_until_ms >= j - 30 * 24 * 60 * 60 * 1000
      && Math.max(Number(l.snooze_erledigt_ms) || 0, Number(l.last_contact_ms) || 0) < l.snooze_until_ms);
  };

  const bestand = () => {
    const aktiv = daten.leads.filter(l => l.status === 'Lead');
    const angebot = aktiv.filter(l => l.stage === 'offer');
    const kalt = aktiv.filter(l => l.stage === 'cold');
    const kunden = daten.leads.filter(l => l.status === 'Kunde');
    const werte = {
      'sales.pipeline_count': angebot.length,
      'sales.pipeline_value_eur': angebot.reduce((s, l) => s + (Number(l.provi_umsatz) || 0), 0),
      'sales.leads_without_value': angebot.filter(l => l.provi_umsatz == null).length,
      'sales.cold_stock': kalt.length,
      'sales.cold_never_called': kalt.filter(l => !l.crm_calls.length).length,
      'sales.overdue_followups': faellig().length,
      'sales.closed_without_value_total': kunden.filter(l => l.provi_umsatz == null).length,
      'sales.closed_without_date_total': kunden.filter(l => !l.closed_at_ms).length
    };
    return Object.entries(werte).map(([metric_key, wert]) => ({ metric_key, wert }));
  };

  const aktivitaet = (l, eintrag) => {
    const a = { id: ids.aktivitaet++, lead_id: l.id, ts: Date.now(), by_user_name: DEMO_NUTZER.name, ...eintrag };
    l.lead_activities.push(a);
    return a;
  };

  // ── Die Demo-Fassungen ───────────────────────────────────────────────────
  const demo = {
    getLeads: async (f = {}) => {
      let zeilen = daten.leads.slice();
      if (f.tab === 'excluded') zeilen = zeilen.filter(l => l.status === 'Uninteressant');
      else if (!f.all && !f.includeExcluded) zeilen = zeilen.filter(l => l.status !== 'Uninteressant');
      const suche = f.search && f.search.length > 0;
      if (!suche) {
        const stufe = { kalt: 'cold', entscheider: 'pitch', pitch: 'pitch', termin: 'data', data: 'data', rechnung: 'offer', offer: 'offer' }[f.filter1];
        if (stufe) zeilen = zeilen.filter(l => l.status === 'Lead' && l.stage === stufe);
        else if (f.filter1 === 'kunden') zeilen = zeilen.filter(l => l.status === 'Kunde');
        if ((f.tab === 'queue' && f.filter1 !== 'kunden') || f.tab === 'cold') zeilen = zeilen.filter(l => l.status === 'Lead');
        else if (f.tab === 'customers') zeilen = zeilen.filter(l => l.status === 'Kunde');
        if (f.filter2 && f.filter2 !== 'all' && f.filter2 !== 'unassigned') zeilen = zeilen.filter(l => l.claimed_by === f.filter2);
      } else {
        const s = f.search.toLowerCase();
        zeilen = zeilen.filter(l => l.name.toLowerCase().includes(s));
      }
      // Wie die echte Abfrage: je Lead nur die letzten drei Anrufe und Aktivitäten
      return postProcessAndSort(zeilen.map(l => ({
        ...klon(l), crm_calls: letzte(klon(l.crm_calls), 3), lead_activities: letzte(klon(l.lead_activities), 3)
      })), f);
    },

    getLead: async (id) => { const l = lead(id); return l ? normalizeRow(klon(l)) : null; },

    saveLead: async (eingabe) => {
      const j = Date.now();
      const alsListe = (w, ersatz) => {
        if (w == null) return ersatz;
        if (typeof w !== 'string') return w;
        try { return JSON.parse(w); } catch (e) { return ersatz; }
      };
      if (eingabe.id) {
        const l = lead(eingabe.id);
        if (!l) throw new Error('Lead nicht gefunden');
        const alteStufe = l.stage;
        for (const [k, w] of Object.entries(eingabe)) {
          if (['id', 'crm_calls', 'lead_activities', 'call_history', 'timeline', 'call_status', 'created_at'].includes(k)) continue;
          l[k] = ['locations', 'linked_leads'].includes(k) ? alsListe(w, []) : k === 'opening_hours' ? alsListe(w, null) : w;
        }
        l.last_edited_ms = j;
        if (eingabe.stage && eingabe.stage !== alteStufe) {
          if (eingabe.stage === 'closed' && !l.closed_at_ms) l.closed_at_ms = j;
          aktivitaet(l, { type: 'status_change', details: `Status geändert auf ${String(eingabe.stage).toUpperCase()}`,
                          from_stage: alteStufe || null, to_stage: eingabe.stage, is_estimated: false });
        }
        return { id: l.id, updated: 1, last_edited_ms: j };
      }
      const neu = {
        phone: '', notes: '', task_text: '', stage: 'cold', status: 'Lead', size: null,
        snooze_until_ms: 0, last_contact_ms: 0, locations: [], linked_leads: [], claimed_by: null,
        ...eingabe,
        id: ids.lead++, created_at_ms: j, last_edited_ms: j, crm_calls: [], lead_activities: []
      };
      neu.locations = alsListe(neu.locations, []);
      neu.linked_leads = alsListe(neu.linked_leads, []);
      neu.opening_hours = alsListe(neu.opening_hours, null);
      daten.leads.push(neu);
      return { id: neu.id, inserted: true, last_edited_ms: j };
    },

    deleteLead: async (id) => {
      const vorher = daten.leads.length;
      daten.leads = daten.leads.filter(l => String(l.id) !== String(id));
      return { deleted: vorher - daten.leads.length };
    },
    deleteLeads: async (liste) => {
      const weg = new Set((liste || []).map(String));
      const vorher = daten.leads.length;
      daten.leads = daten.leads.filter(l => !weg.has(String(l.id)));
      return { deleted: vorher - daten.leads.length };
    },
    importLeads: async (liste) => {
      let n = 0;
      for (const l of (liste || []).filter(x => x && x.name)) { await demo.saveLead({ name: l.name, phone: l.phone || '' }); n++; }
      return { importedCount: n };
    },

    // Anmeldung — immer der Demo-Nutzer, nie eine echte Sitzung
    getSessionToken: async () => null,
    getCurrentUser: async () => ({ ...DEMO_NUTZER }),
    login: async () => ({ ...DEMO_NUTZER }),
    register: async () => ({ ...DEMO_NUTZER }),
    logout: async () => { win.location.href = win.location.pathname; },
    getSavedCredentials: async () => [],
    saveCredential: async () => ({ success: true }),
    promptTouchID: async () => ({ success: true }),
    updateProfile: async (name) => { DEMO_NUTZER.name = name || DEMO_NUTZER.name; return true; },
    updateEmail: async () => true,
    getUsers: async () => [{ ...DEMO_NUTZER }],
    inviteUser: async () => { throw new Error('Im Demo-Modus werden keine Einladungen verschickt.'); },
    updateUserRole: async () => true,
    deactivateUser: async () => true,
    getAgentStats: async () => [],

    // Kennzahlen
    getDailyMetrics: async (von, bis) => klon(daten.tageswerte.filter(z =>
      (!von || z.tag >= von) && (!bis || z.tag <= bis))),
    getStockMetrics: async () => bestand(),
    getMetricTargets: async () => klon(daten.ziele),
    saveMetricTarget: async (z) => {
      const valid_from = z.valid_from || tagKey(Date.now());
      daten.ziele = daten.ziele.filter(x => !(x.metric_key === z.metric_key && x.valid_from === valid_from));
      daten.ziele.push({ id: daten.ziele.length + 100, comparator: '>=', sort_order: 100, ...z, valid_from });
      return true;
    },
    getClosedNeedingInput: async (grenze = 50) => daten.leads
      .filter(l => l.stage === 'closed' && (l.provi_umsatz == null || !l.closed_at_ms))
      .sort((a, b) => (b.last_contact_ms || 0) - (a.last_contact_ms || 0))
      .slice(0, grenze)
      .map(l => ({ id: l.id, name: l.name, size: l.size, provi_umsatz: l.provi_umsatz,
                   closed_at_ms: l.closed_at_ms, last_contact_ms: l.last_contact_ms })),
    savePipelineSnapshot: async () => true,
    getPipelineSnapshots: async () => [],
    getSettings: async () => klon(daten.einstellungen),
    saveSetting: async (key, value) => { daten.einstellungen[key] = value; return true; },
    getUserRP: async () => daten.leads.filter(l => l.status === 'Kunde')
      .reduce((s, l) => s + (l.size === 'Großkunde' ? 5 : 1), 0),
    getLeadHistory: async (id) => {
      const l = lead(id);
      if (!l) return { timeline: [] };
      const anrufe = l.crm_calls.map(c => ({ ...c, activity_type: 'call' }));
      const rest = l.lead_activities.map(a => ({ ...a, activity_type: a.type }));
      return { timeline: klon([...anrufe, ...rest].sort((a, b) => a.ts - b.ts)) };
    },
    aktualisiereMehrfachStandorte: async () => null,

    // Anrufe und Kontakte
    logCall: async (id) => {
      const l = lead(id);
      if (!l) return null;
      const j = Date.now();
      const stufe = l.stage || 'cold';
      const ersterKontakt = l.crm_calls.length === 0;
      const anruf = { id: ids.anruf++, lead_id: l.id, ts: j, type: 'call', outcome: null, notes: null,
                      stage_at_call: stufe, size_at_call: l.size || null, is_estimated: false,
                      by_user_name: DEMO_NUTZER.name };
      l.crm_calls.push(anruf);
      l.last_contact_ms = j;
      // Das Command Center zählt mit — so wie die echte Tagessicht
      tagesZaehler('sales.calls_count');
      const gross = l.size === 'Großkunde';
      if (stufe === 'cold') {
        tagesZaehler(gross ? 'sales.calls_cold_gross' : 'sales.calls_cold_tarif');
        const vormittag = new Date(j).getHours() < 12;
        if (gross && vormittag) tagesZaehler('sales.calls_morning_gross');
        if (!gross && !vormittag) tagesZaehler('sales.calls_afternoon_tarif');
      } else if (['pitch', 'data', 'offer'].includes(stufe)) {
        tagesZaehler('sales.calls_followup');
      }
      if (ersterKontakt) tagesZaehler('sales.calls_first_contact');
      return { lead: klon(l), callId: anruf.id };
    },
    setCallDetails: async (callId, felder = {}) => {
      const anruf = daten.leads.flatMap(l => l.crm_calls).find(c => String(c.id) === String(callId));
      if (!anruf) return false;
      if ('outcome' in felder) {
        if (![null, 'reached', 'not_reached'].includes(felder.outcome)) return false;
        anruf.outcome = felder.outcome;
      }
      if ('notes' in felder) {
        const n = felder.notes == null ? '' : String(felder.notes);
        anruf.notes = n.trim() === '' ? null : n;
      }
      return true;
    },
    getFaelligeRueckrufe: async () => faellig()
      .sort((a, b) => a.snooze_until_ms - b.snooze_until_ms)
      .map(l => ({ id: l.id, name: l.name, phone: l.phone, impressum_phone: l.impressum_phone,
                   snooze_until_ms: l.snooze_until_ms, snooze_erledigt_ms: l.snooze_erledigt_ms,
                   last_contact_ms: l.last_contact_ms })),
    logMessage: async (id, kanal = 'email') => {
      const l = lead(id);
      if (!l) return null;
      aktivitaet(l, { type: 'message', details: kanal === 'whatsapp' ? 'WhatsApp geschrieben' : 'E-Mail geschrieben' });
      l.last_contact_ms = Date.now();
      return klon(l);
    },
    logEmail: async (id) => demo.logMessage(id, 'email'),
    logTaskDone: async (id, text, haupt = null) => {
      const l = lead(id);
      if (!l) return false;
      const kurz = (t) => { const s = String(t || '').trim().replace(/\s+/g, ' '); return s.length > 80 ? s.slice(0, 79) + '…' : s; };
      aktivitaet(l, { type: 'task_done', details: haupt
        ? `Teilaufgabe erledigt: ${kurz(text)} (zu: ${kurz(haupt)})` : `Aufgabe erledigt: ${kurz(text)}` });
      return true;
    },
    logStatusChange: async (id, neu, alt = null) => {
      const l = lead(id);
      if (l) aktivitaet(l, { type: 'status_change', details: `Status geändert auf ${String(neu).toUpperCase()}`,
                             from_stage: alt, to_stage: neu, is_estimated: false });
    },
    deleteActivity: async (id, typ) => {
      for (const l of daten.leads) {
        const liste = typ === 'call' ? l.crm_calls : l.lead_activities;
        const i = liste.findIndex(a => String(a.id) === String(id));
        if (i > -1) { liste.splice(i, 1); return true; }
      }
      return false;
    },
    getCallsToday: async () => {
      const tag = tagKey(Date.now());
      const zeile = daten.tageswerte.find(z => z.metric_key === 'sales.calls_count' && z.tag === tag);
      return zeile ? zeile.wert : 0;
    },
    updateCallGoal: async (ziel) => { DEMO_NUTZER.daily_call_goal = ziel; return true; },

    // Webseiten lesen (Nachtragen, Scout-Anreicherung) — nur erfundene Seiten
    fetchApi: async (url) => {
      const seite = impressumSeite(url);
      return seite ? { ok: true, status: 200, data: seite } : { ok: false, status: 0, data: '' };
    },

    // Live-Abos und Mitteilungen: im Demo-Modus still
    onLeadsChanged: () => () => {},
    getNotifications: async () => [],
    markNotificationRead: async () => {},
    sendNotification: async () => true,
    subscribeToNotifications: () => () => {}
  };

  // ── Umbauen: jede Funktion ersetzen, auch unbekannte ─────────────────────
  const echtOeffnen = typeof api.openExternal === 'function' ? api.openExternal : null;
  for (const name of Object.keys(api)) {
    if (typeof api[name] !== 'function' || REIN.has(name) || name === 'openExternal') continue;
    api[name] = demo[name] || (async () => {
      console.info(`[Demo] ${name} ist im Demo-Modus abgeschaltet.`);
      return null;
    });
  }
  // Fremde Seiten öffnen liest und schreibt nichts — nur die erfundenen
  // .example-Adressen führen nirgendwohin, das sagt die Demo dann.
  api.openExternal = (url) => {
    if (/\.example$/i.test(hostVon(url))) {
      if (typeof win.showToast === 'function') win.showToast('Demo: diese Webseite ist erfunden.');
      return;
    }
    if (echtOeffnen) echtOeffnen(url);
  };

  // ── Netzabfragen abfangen, die sonst nach draußen gingen ─────────────────
  const echtesFetch = typeof win.fetch === 'function' ? win.fetch.bind(win) : null;
  const Antwort = win.Response || globalThis.Response;
  const json = (koerper) => new Antwort(JSON.stringify(koerper), { status: 200, headers: { 'Content-Type': 'application/json' } });
  win.fetch = async (eingabe, init = {}) => {
    let url;
    try { url = new URL(typeof eingabe === 'string' ? eingabe : eingabe.url, win.location.href); }
    catch (e) { return echtesFetch(eingabe, init); }
    if (url.hostname === 'places.googleapis.com') {
      if (url.pathname.includes(':searchText')) {
        let text = '';
        try { text = JSON.parse(init.body || '{}').textQuery || ''; } catch (e) { /* leer */ }
        return json({ places: scoutTreffer(text, 20) });
      }
      return json({});                                   // Detailabfragen: nichts Neues
    }
    if (url.hostname === 'nominatim.openstreetmap.org') {
      const q = url.searchParams.get('q') || '';
      return json(scoutTreffer(q.split(',')[0], 12).map(p => ({
        lat: String(p.location.latitude), lon: String(p.location.longitude),
        name: p.displayName.text, display_name: `${p.displayName.text}, ${p.formattedAddress}`,
        extratags: { phone: p.nationalPhoneNumber, website: p.websiteUri }
      })));
    }
    if (url.hostname === 'overpass-api.de') return json({ elements: [] });
    if (url.origin === win.location.origin && url.pathname.startsWith('/api/')) {
      return json({ ok: true, demo: true, hinweis: 'Im Demo-Modus nicht ausgeführt.' });
    }
    if (!echtesFetch) throw new Error('fetch nicht verfügbar');
    return echtesFetch(eingabe, init);
  };

  // Standort: Die Karte zeigt sonst den echten Aufenthaltsort als Pfeil — in
  // einer Aufnahme für Social Media wäre das die eigene Adresse. In der Demo
  // steht der Pfeil deshalb fest in der Stadtmitte.
  const ort = win.navigator && win.navigator.geolocation;
  if (ort) {
    const position = { coords: { latitude: DEMO_STADT.lat, longitude: DEMO_STADT.lng, accuracy: 30 }, timestamp: Date.now() };
    try {
      ort.getCurrentPosition = (erfolg) => { setTimeout(() => erfolg && erfolg(position), 0); };
      ort.watchPosition = (erfolg) => { setTimeout(() => erfolg && erfolg(position), 0); return 1; };
      ort.clearWatch = () => {};
    } catch (e) { /* manche Browser lassen das nicht zu — dann bleibt es beim Hinweis in der Anleitung */ }
  }

  win.demoModus = true;
  if (win.document) {
    win.document.title = 'Demo · ' + win.document.title.replace(/^Demo · /, '');
    const hinweis = () => setTimeout(() => {
      if (typeof win.showToast === 'function') win.showToast('Demo-Modus: erfundene Daten, nichts wird gespeichert.');
    }, 800);
    if (win.document.readyState === 'loading') win.document.addEventListener('DOMContentLoaded', hinweis);
    else hinweis();
  }
  return { daten, demo };
}

function hostVon(url) {
  try { return new URL(String(url)).hostname; } catch (e) { return ''; }
}
