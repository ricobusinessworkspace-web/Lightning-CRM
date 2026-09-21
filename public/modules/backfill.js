/**
 * Kontaktdaten nachtragen — Telefon und E-Mail fuer Leads, bei denen nichts
 * drin steht.
 *
 * Zwei Schritte, bewusst getrennt:
 *   1. **Suchen.** Liest die Webseite jedes Leads (Startseite, Impressum,
 *      Kontakt) und sammelt Vorschlaege. Schreibt nichts.
 *   2. **Uebernehmen.** Erst danach, und nur was angehakt ist.
 *
 * Warum getrennt: aus diesen Adressen sollen spaeter Serienmails werden. Eine
 * falsch zugeordnete Adresse schreibt dann an die falsche Firma. Der Blick
 * dazwischen kostet zwei Minuten und verhindert das.
 *
 * Geschrieben wird ausschliesslich in leere Felder — ein vorhandener Eintrag
 * wird nie ueberschrieben, auch nicht von einem "besseren" Fund.
 */
(function () {
  'use strict';

  const GLEICHZEITIG = 3;     // drei Seiten auf einmal; mehr reizt fremde Server

  let laeuft = false;
  let abbruch = false;
  let vorschlaege = [];       // { lead, email, telefon, quelle, seite, grund }

  const el = (id) => document.getElementById(id);
  const text = (id, wert) => { const n = el(id); if (n) n.textContent = wert; };

  const escape = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  const leer = (w) => !String(w == null ? '' : w).trim();

  const GRUND_TEXT = {
    'keine-webseite':  'keine Webseite hinterlegt',
    'plattform':       'nur ein Eintrag auf einer fremden Plattform',
    'nicht-erreichbar': 'Seite nicht erreichbar',
    'seite-blockiert': 'Seite hat uns abgewiesen',
    'nichts-gefunden': 'nichts gefunden'
  };

  // Seiten holen: ueber die eigene Serverfunktion, nicht direkt aus dem
  // Browser — fremde Server erlauben das sonst nicht.
  const holeSeite = async (url) => {
    try {
      const r = await window.api.fetchApi(url);
      const inhalt = typeof r.data === 'string' ? r.data : (r.data ? JSON.stringify(r.data) : '');
      return { ok: !!r.ok, status: r.status || 0, text: inhalt };
    } catch (e) {
      return { ok: false, status: 0, text: '' };
    }
  };

  // Telefon aus dem Google-Eintrag — fuer Leads ohne Webseite, aber mit
  // Place-ID. Ohne hinterlegten Schluessel wird der Schritt uebersprungen.
  const telefonVonGoogle = async (lead) => {
    const key = localStorage.getItem('googlePlacesApiKey') || '';
    if (!key || !lead.google_place_id) return null;
    try {
      const res = await fetch(`https://places.googleapis.com/v1/places/${lead.google_place_id}`, {
        headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'nationalPhoneNumber,internationalPhoneNumber' }
      });
      if (!res.ok) return null;
      const d = await res.json();
      return d.nationalPhoneNumber || d.internationalPhoneNumber || null;
    } catch (e) { return null; }
  };

  // ── Schritt 1: suchen ─────────────────────────────────────────────────────

  // Betroffen ist jeder Lead, bei dem eines der beiden Felder leer ist.
  const kandidaten = (leads) => (leads || []).filter(l => leer(l.email) || leer(l.phone));

  /**
   * Was von einem Fund wirklich geschrieben wird.
   *
   * Der Kern des ganzen Werkzeugs: **nur leere Felder**. Ein vorhandener
   * Eintrag bleibt stehen, auch wenn der Fund "besser" aussieht — was im CRM
   * steht, hat jemand dort hingeschrieben.
   */
  const felderFuer = (lead, fund) => {
    const felder = {};
    if (!lead || !fund) return felder;
    if (fund.email && leer(lead.email)) felder.email = fund.email;
    if (fund.telefon && leer(lead.phone)) felder.phone = fund.telefon;
    return felder;
  };

  window.nachtragKandidaten = kandidaten;
  window.nachtragFelder = felderFuer;

  async function einenPruefen(lead) {
    const eintrag = { lead, email: null, telefon: null, quelle: null, seite: null, grund: null };

    if (!leer(lead.website_url)) {
      const r = await window.Kontaktdaten.holeKontaktdaten(lead.website_url, holeSeite, { chef: lead.name });
      if (leer(lead.email) && r.email) { eintrag.email = r.email; eintrag.seite = r.emailSeite; }
      if (leer(lead.phone) && r.telefon) { eintrag.telefon = r.telefon; }
      eintrag.quelle = 'Webseite';
      eintrag.grund = r.grund;
    } else {
      eintrag.grund = 'keine-webseite';
    }

    // Telefon fehlt weiterhin: der Google-Eintrag hat oft eins.
    if (leer(lead.phone) && !eintrag.telefon) {
      const tel = await telefonVonGoogle(lead);
      if (tel) {
        eintrag.telefon = tel;
        if (!eintrag.email) { eintrag.quelle = 'Google'; eintrag.grund = null; }
      }
    }
    if (eintrag.email || eintrag.telefon) eintrag.grund = null;
    return eintrag;
  }

  window.starteNachtragen = async () => {
    if (laeuft) return;
    laeuft = true; abbruch = false; vorschlaege = [];

    const knopfStart = el('nachtragen-start');
    const knopfStopp = el('nachtragen-stopp');
    const knopfUebernehmen = el('nachtragen-uebernehmen');
    if (knopfStart) knopfStart.style.display = 'none';
    if (knopfStopp) knopfStopp.style.display = 'inline-flex';
    if (knopfUebernehmen) knopfUebernehmen.style.display = 'none';
    const liste = el('nachtragen-liste');
    if (liste) liste.innerHTML = '';

    try {
      const alle = await window.api.getLeads({ all: true });
      const offen = kandidaten(alle);
      let fertig = 0;

      const fortschritt = () => {
        text('nachtragen-stand', `${fertig} von ${offen.length} geprüft · ${vorschlaege.filter(v => v.email || v.telefon).length} Funde`);
        const balken = el('nachtragen-balken');
        if (balken) balken.style.width = offen.length ? Math.round((fertig / offen.length) * 100) + '%' : '0%';
      };
      fortschritt();

      // Drei Leads gleichzeitig; jeder holt bis zu drei Seiten.
      let naechster = 0;
      const arbeiter = async () => {
        while (!abbruch) {
          const i = naechster++;
          if (i >= offen.length) return;
          const eintrag = await einenPruefen(offen[i]);
          vorschlaege.push(eintrag);
          fertig++;
          if (eintrag.email || eintrag.telefon) zeileAnhaengen(eintrag);
          fortschritt();
        }
      };
      await Promise.all(Array.from({ length: GLEICHZEITIG }, arbeiter));

      zusammenfassen(offen.length, fertig);
    } catch (e) {
      console.error('Nachtragen:', e);
      text('nachtragen-stand', 'Suche fehlgeschlagen: ' + e.message);
    } finally {
      laeuft = false;
      if (knopfStopp) knopfStopp.style.display = 'none';
      if (knopfStart) { knopfStart.style.display = 'inline-flex'; knopfStart.textContent = 'Neu suchen'; }
      const treffer = vorschlaege.filter(v => v.email || v.telefon).length;
      if (knopfUebernehmen && treffer > 0) {
        knopfUebernehmen.style.display = 'inline-flex';
        zaehlerAktualisieren();
      }
    }
  };

  window.stoppeNachtragen = () => { abbruch = true; text('nachtragen-stand', 'Wird angehalten …'); };

  // ── Anzeige ───────────────────────────────────────────────────────────────

  function zeileAnhaengen(v) {
    const liste = el('nachtragen-liste');
    if (!liste) return;
    const zeile = document.createElement('label');
    zeile.className = 'nachtrag-zeile';
    zeile.innerHTML = `
      <input type="checkbox" class="nachtrag-haken" checked data-lead="${v.lead.id}" onchange="window.nachtragenZaehler()">
      <div class="nachtrag-inhalt">
        <div class="nachtrag-name">${escape(v.lead.name || 'Ohne Namen')}</div>
        ${v.email ? `<div class="nachtrag-fund"><span>E-Mail</span><b>${escape(v.email)}</b></div>` : ''}
        ${v.telefon ? `<div class="nachtrag-fund"><span>Telefon</span><b>${escape(v.telefon)}</b></div>` : ''}
        <div class="nachtrag-quelle">${escape(v.quelle || '')}${v.seite ? ' · ' + escape(kurzeSeite(v.seite)) : ''}</div>
      </div>`;
    liste.appendChild(zeile);
  }

  const kurzeSeite = (url) => {
    try { const u = new URL(url); return (u.pathname === '/' || !u.pathname) ? u.hostname : u.hostname + u.pathname; }
    catch (e) { return url; }
  };

  function zusammenfassen(gesamt, geprueft) {
    const ohne = vorschlaege.filter(v => !v.email && !v.telefon);
    const zaehler = {};
    ohne.forEach(v => { const g = v.grund || 'nichts-gefunden'; zaehler[g] = (zaehler[g] || 0) + 1; });
    const teile = Object.keys(zaehler).map(g => `${zaehler[g]}× ${GRUND_TEXT[g] || g}`);
    const rest = gesamt - geprueft;
    text('nachtragen-stand',
      `${geprueft} von ${gesamt} geprüft · ${vorschlaege.length - ohne.length} Funde`
      + (ohne.length ? ` · ohne Fund: ${teile.join(', ')}` : '')
      + (rest > 0 ? ` · ${rest} nicht geprüft (angehalten)` : ''));
  }

  window.nachtragenZaehler = () => zaehlerAktualisieren();

  function zaehlerAktualisieren() {
    const haken = Array.from(document.querySelectorAll('.nachtrag-haken'));
    const an = haken.filter(h => h.checked).length;
    const knopf = el('nachtragen-uebernehmen');
    if (knopf) {
      knopf.textContent = `${an} übernehmen`;
      knopf.disabled = an === 0;
    }
  }

  // ── Schritt 2: uebernehmen ────────────────────────────────────────────────

  window.uebernimmNachtragen = async () => {
    const haken = Array.from(document.querySelectorAll('.nachtrag-haken')).filter(h => h.checked);
    if (haken.length === 0) return;

    const knopf = el('nachtragen-uebernehmen');
    if (knopf) { knopf.disabled = true; knopf.textContent = 'Wird gespeichert …'; }

    let geschrieben = 0, gescheitert = 0;
    for (const h of haken) {
      const id = parseInt(h.getAttribute('data-lead'), 10);
      const v = vorschlaege.find(x => x.lead.id === id);
      if (!v) continue;

      const felder = felderFuer(v.lead, v);
      if (Object.keys(felder).length === 0) continue;

      const ok = await window.leadStore.save(id, felder, { silent: true, noRefresh: true, label: 'Kontaktdaten' });
      if (ok) { geschrieben++; h.closest('.nachtrag-zeile').classList.add('nachtrag-fertig'); h.checked = false; }
      else gescheitert++;
    }

    if (typeof window.showToast === 'function') {
      window.showToast(gescheitert
        ? `${geschrieben} Leads ergänzt, ${gescheitert} fehlgeschlagen`
        : `${geschrieben} Leads ergänzt`, gescheitert > 0);
    }
    if (typeof window.loadUi === 'function') await window.loadUi();
    zaehlerAktualisieren();
    if (knopf) knopf.disabled = false;
  };

  // ── Fenster ───────────────────────────────────────────────────────────────

  window.oeffneNachtragen = async () => {
    const fenster = el('nachtragen-modal');
    if (!fenster) return;
    fenster.classList.remove('hidden');
    const liste = el('nachtragen-liste');
    if (liste) liste.innerHTML = '';
    const knopf = el('nachtragen-uebernehmen');
    if (knopf) knopf.style.display = 'none';
    const start = el('nachtragen-start');
    if (start) { start.style.display = 'inline-flex'; start.textContent = 'Suche starten'; }
    const balken = el('nachtragen-balken');
    if (balken) balken.style.width = '0%';

    try {
      const alle = await window.api.getLeads({ all: true });
      const offen = kandidaten(alle);
      const ohneEmail = offen.filter(l => leer(l.email)).length;
      const ohneTelefon = offen.filter(l => leer(l.phone)).length;
      const mitSeite = offen.filter(l => !leer(l.website_url)).length;
      text('nachtragen-stand',
        `${offen.length} Leads ohne vollständige Kontaktdaten — ${ohneEmail} ohne E-Mail, `
        + `${ohneTelefon} ohne Telefon. ${mitSeite} davon haben eine Webseite, die gelesen werden kann.`);
    } catch (e) {
      text('nachtragen-stand', 'Leads konnten nicht geladen werden: ' + e.message);
    }
  };

  window.schliesseNachtragen = () => {
    abbruch = true;
    const fenster = el('nachtragen-modal');
    if (fenster) fenster.classList.add('hidden');
  };
})();
