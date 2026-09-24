/**
 * Faellige Rueckrufe — Glocke, Karten, Ton und Mitteilungen aufs Geraet.
 *
 * Warum es diese Datei gibt
 * ─────────────────────────
 * Eine Wiedervorlage blendet einen Lead bis zu einem Zeitpunkt aus. Bisher
 * tauchte er danach stillschweigend wieder in der Liste auf — "ruf in 20
 * Minuten nochmal an" ging dabei regelmaessig unter.
 *
 * Jetzt meldet sich jede faellige Wiedervorlage:
 *   - im CRM oben rechts als Karte (mit Ton), alle nach Zeit sortiert. Die
 *     Glocke im Kopf blendet den Stapel ein und aus und zaehlt, was offen ist.
 *   - auf Handy und Mac als Push-Mitteilung (api/rueckrufe.js, jede Minute,
 *     nachts gesammelt um 8:00). Ein Tipp oeffnet genau diesen Lead.
 *
 * Abgehakt ist ein Rueckruf, sobald angerufen oder geschrieben wurde
 * (last_contact_ms nach dem Faelligwerden) oder man ihn wegklickt
 * (snooze_erledigt_ms). "Spaeter" schiebt ihn um 10 Minuten.
 */
(function () {
  'use strict';

  const TAKT = 30 * 1000;
  const SPAETER = 10 * 60 * 1000;
  const VAPID = 'BEz1sMulB4ee_7LY3i-eHpP2Fmei6RHAzU1QzpAusy3PniUTbX47juEulS_4nCBiHxajVx__L5R37Ve0hxEGBkg';

  const lies = (k, fallback) => { try { const v = localStorage.getItem(k); return v === null ? fallback : v; } catch (e) { return fallback; } };
  const schreib = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* privat/gesperrt: dann eben nicht merken */ } };

  let faellig = [];                        // [{ id, name, phone, impressum_phone, snooze_until_ms }]
  let offen = lies('rr-stapel', 'auf') === 'auf';
  let manuell = false;                     // per Glocke geoeffnet (dann auch leer sichtbar)
  let letzteKennung = '';
  const gesehen = new Set(JSON.parse(lies('rr-gesehen', '[]') || '[]'));
  const schluessel = (l) => `${l.id}:${l.snooze_until_ms}`;

  const nummer = (l) => l.phone || l.impressum_phone || '';
  const uhr = (ms) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const esc = (t) => (window.escapeHtml ? window.escapeHtml(t) : String(t ?? ''));
  const beruehrung = () => { try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } };

  function seitText(ms) {
    const min = Math.round((Date.now() - ms) / 60000);
    if (min < 1) return 'jetzt fällig';
    const heute = new Date().toDateString() === new Date(ms).toDateString();
    return heute ? `fällig seit ${uhr(ms)}` : `fällig seit ${new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${uhr(ms)}`;
  }

  // ── Ton ────────────────────────────────────────────────────────────────────
  // Eigene Komposition im Geist einer "Mission geschafft"-Fanfare: zwei kurze
  // Blechblaeser-Akkorde, die in einen hellen Dur-Akkord aufloesen, darunter
  // ein tiefer Schlag. Kein Fremdmaterial — alles hier mit Oszillatoren gebaut.
  let audio = null;
  const tonAn = () => lies('rr-ton', 'an') === 'an';

  function audioBereit() {
    if (audio) return audio;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { audio = new AC(); } catch (e) { audio = null; }
    return audio;
  }
  // Browser spielen erst nach einer Beruehrung Ton ab — beim ersten Klick
  // irgendwo den Kanal oeffnen, damit die Fanfare spaeter nicht stumm bleibt.
  const entsperren = () => { const a = audioBereit(); if (a && a.state === 'suspended') a.resume().catch(() => {}); };
  ['pointerdown', 'keydown'].forEach(t => window.addEventListener(t, entsperren, { once: false, passive: true }));

  function fanfare() {
    if (!tonAn()) return;
    const a = audioBereit();
    if (!a || a.state !== 'running') return;
    const t0 = a.currentTime + 0.02;
    const master = a.createGain();
    master.gain.value = 0.16;
    const hall = a.createDelay(); hall.delayTime.value = 0.09;
    const hallPegel = a.createGain(); hallPegel.gain.value = 0.22;
    master.connect(a.destination);
    master.connect(hall); hall.connect(hallPegel); hallPegel.connect(a.destination);

    const blech = (freqs, start, dauer, hell) => {
      const filter = a.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(700, start);
      filter.frequency.linearRampToValueAtTime(hell ? 3200 : 1800, start + Math.min(0.25, dauer));
      filter.Q.value = 1.2;
      const huelle = a.createGain();
      huelle.gain.setValueAtTime(0.0001, start);
      huelle.gain.exponentialRampToValueAtTime(1, start + 0.03);
      huelle.gain.setValueAtTime(1, start + dauer * 0.6);
      huelle.gain.exponentialRampToValueAtTime(0.0001, start + dauer);
      filter.connect(huelle); huelle.connect(master);
      freqs.forEach(f => [-6, 6].forEach(cent => {
        const o = a.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = cent;
        const g = a.createGain(); g.gain.value = 0.22 / freqs.length;
        o.connect(g); g.connect(filter);
        o.start(start); o.stop(start + dauer + 0.05);
      }));
    };
    const schlag = (start) => {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(110, start);
      o.frequency.exponentialRampToValueAtTime(42, start + 0.5);
      g.gain.setValueAtTime(0.9, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.7);
      o.connect(g); g.connect(master);
      o.start(start); o.stop(start + 0.75);
    };

    schlag(t0);
    blech([293.66, 349.23, 440.00], t0, 0.16);                    // d-Moll, kurz
    blech([261.63, 329.63, 392.00], t0 + 0.2, 0.16);              // C-Dur, kurz
    schlag(t0 + 0.4);
    blech([293.66, 369.99, 440.00, 587.33], t0 + 0.4, 1.25, true); // D-Dur, gehalten
  }

  // ── Daten ──────────────────────────────────────────────────────────────────
  let laeuft = false;
  async function pruefen() {
    if (laeuft || !window.globalUser || !window.api || !window.api.getFaelligeRueckrufe) return;
    laeuft = true;
    try {
      const liste = await window.api.getFaelligeRueckrufe();
      const neu = liste.filter(l => !gesehen.has(schluessel(l)));
      const kennung = liste.map(schluessel).join(',');
      faellig = liste;
      if (neu.length) {
        neu.forEach(l => gesehen.add(schluessel(l)));
        // Nur die juengsten Eintraege merken — die Liste soll nicht wachsen
        schreib('rr-gesehen', JSON.stringify([...gesehen].slice(-200)));
        offen = true;
        schreib('rr-stapel', 'auf');
        fanfare();
        // Der Lead gehoert jetzt wieder in die aktive Liste
        if (typeof window.sortiereListenNeu === 'function') window.sortiereListenNeu();
      }
      // Nur neu zeichnen, wenn sich etwas geaendert hat — sonst verschwindet
      // der Knopf unter dem Zeiger, gerade wenn man klicken will.
      if (neu.length || kennung !== letzteKennung) zeichnen(new Set(neu.map(l => l.id)));
      else glockeAktualisieren();
      letzteKennung = kennung;
    } catch (e) {
      console.warn('Rückrufe nicht lesbar:', e && e.message);
    } finally {
      laeuft = false;
    }
  }

  // ── Oberflaeche ────────────────────────────────────────────────────────────
  function stapel() {
    let el = document.getElementById('rr-stapel');
    if (!el) {
      el = document.createElement('aside');
      el.id = 'rr-stapel';
      el.className = 'rr-stapel';
      el.setAttribute('aria-label', 'Fällige Rückrufe');
      el.addEventListener('click', klick);
      document.body.appendChild(el);
    }
    return el;
  }

  function glockeAktualisieren() {
    const g = document.getElementById('rr-glocke');
    if (!g) return;
    const zahl = g.querySelector('.rr-zahl');
    if (zahl) { zahl.textContent = String(faellig.length); zahl.hidden = faellig.length === 0; }
    g.classList.toggle('hat-faellige', faellig.length > 0);
    g.setAttribute('aria-expanded', String(offen));
    g.title = faellig.length ? `${faellig.length} Rückruf${faellig.length === 1 ? '' : 'e'} fällig` : 'Rückrufe';
  }

  function karte(l, istNeu) {
    const nr = nummer(l);
    const tel = nr.replace(/[^0-9+]/g, '');
    return `
      <div class="rr-karte${istNeu ? ' neu' : ''}" data-id="${l.id}">
        <div class="rr-kopf">
          <span class="rr-punkt" aria-hidden="true"></span>
          <span class="rr-seit">${seitText(l.snooze_until_ms)}</span>
          <button type="button" class="rr-weg" data-aktion="erledigt" title="Erledigt — ohne Anruf" aria-label="Erledigt">×</button>
        </div>
        <button type="button" class="rr-name" data-aktion="oeffnen" title="Lead öffnen">${esc(l.name || 'Lead ' + l.id)}</button>
        ${nr ? `<div class="rr-nummer">${esc(nr)}</div>` : ''}
        <div class="rr-aktionen">
          ${nr ? `<button type="button" class="rr-knopf haupt" data-aktion="copy">Copy</button>` : `<button type="button" class="rr-knopf haupt" data-aktion="oeffnen">Öffnen</button>`}
          ${nr && tel && beruehrung() ? `<a class="rr-knopf" data-aktion="anruf" href="tel:${esc(tel)}">Anrufen</a>` : ''}
          <button type="button" class="rr-knopf" data-aktion="spaeter" title="In 10 Minuten nochmal erinnern">Später</button>
        </div>
      </div>`;
  }

  function zeichnen(neueIds = new Set()) {
    glockeAktualisieren();
    const el = stapel();
    // Leer nur sichtbar, wenn man ihn selbst ueber die Glocke geoeffnet hat
    el.hidden = !offen || (faellig.length === 0 && !manuell);
    const kopf = `
      <div class="rr-leiste">
        <span class="rr-titel">Rückrufe${faellig.length ? ` · ${faellig.length}` : ''}</span>
        <button type="button" class="rr-ton${tonAn() ? ' an' : ''}" data-aktion="ton" aria-pressed="${tonAn()}" title="Ton ${tonAn() ? 'aus' : 'an'}schalten">${tonAn() ? LAUT : STUMM}</button>
        <button type="button" class="rr-zu" data-aktion="zu" aria-label="Ausblenden">×</button>
      </div>`;
    const karten = faellig.length
      ? faellig.map(l => karte(l, neueIds.has(l.id))).join('')
      : '<div class="rr-leer">Keine fälligen Rückrufe.</div>';
    el.innerHTML = kopf + `<div class="rr-liste">${karten}</div>` + pushFuss();
  }

  const LAUT = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 6h2.5L9 3v10L5.5 10H3z" fill="currentColor"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.8a6 6 0 0 1 0 8.4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
  const STUMM = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 6h2.5L9 3v10L5.5 10H3z" fill="currentColor"/><path d="M11.5 6l3 4M14.5 6l-3 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';

  // ── Aktionen ───────────────────────────────────────────────────────────────
  const eintrag = (id) => faellig.find(l => Number(l.id) === Number(id));

  function entfernen(id) {
    faellig = faellig.filter(l => Number(l.id) !== Number(id));
    letzteKennung = faellig.map(schluessel).join(',');
    zeichnen();
  }

  async function erledigen(id) {
    const ok = await window.leadStore.save(Number(id), { snooze_erledigt_ms: Date.now() }, { label: 'Rückruf', noRefresh: true });
    if (ok) entfernen(id);
    return ok;
  }

  async function oeffnen(id) {
    if (typeof window.openLeadDirectly === 'function') await window.openLeadDirectly(Number(id));
  }

  async function klick(e) {
    const knopf = e.target.closest('[data-aktion]');
    if (!knopf) return;
    const aktion = knopf.getAttribute('data-aktion');
    const k = knopf.closest('.rr-karte');
    const id = k ? Number(k.getAttribute('data-id')) : null;
    const l = id ? eintrag(id) : null;

    if (aktion === 'zu') { umschalten(false); return; }
    if (aktion === 'ton') {
      schreib('rr-ton', tonAn() ? 'aus' : 'an');
      entsperren();
      if (tonAn()) setTimeout(fanfare, 60);   // Probe, damit man weiss, wie es klingt
      zeichnen();
      return;
    }
    if (aktion === 'push-an') { pushAktivieren(); return; }
    if (aktion === 'push-test') { pushTesten(); return; }
    if (!l) return;

    if (aktion === 'oeffnen') { oeffnen(id); return; }
    if (aktion === 'erledigt') { erledigen(id); return; }
    if (aktion === 'spaeter') {
      const ok = await window.leadStore.save(id, { snooze_until_ms: Date.now() + SPAETER }, { label: 'Rückruf', noRefresh: true });
      if (ok) {
        entfernen(id);
        if (typeof window.showToast === 'function') window.showToast(`${l.name || 'Rückruf'}: in 10 Minuten nochmal`);
        if (typeof window.sortiereListenNeu === 'function') window.sortiereListenNeu();
      }
      return;
    }
    if (aktion === 'copy') {
      // Der normale Copy-Weg: kopiert, zaehlt den Anruf, schreibt den Verlauf.
      // Der Anruf setzt last_contact_ms — damit ist der Rueckruf abgehakt.
      await window.copyPhone({ currentTarget: knopf }, id, nummer(l), null);
      entfernen(id);
      oeffnen(id);
      return;
    }
    if (aktion === 'anruf') {
      // tel: oeffnet die Telefon-App; gezaehlt wird trotzdem hier.
      try {
        await window.api.logCall(id);
        if (window.updateTrayCount) window.updateTrayCount();
      } catch (err) { console.warn('Anruf nicht gezählt', err); }
      entfernen(id);
    }
  }

  function umschalten(wert) {
    const sichtbar = !stapel().hidden;
    offen = typeof wert === 'boolean' ? wert : !sichtbar;
    manuell = offen;
    schreib('rr-stapel', offen ? 'auf' : 'zu');
    zeichnen();
    if (offen) pushStatus();
  }

  // ── Mitteilungen auf diesem Geraet ─────────────────────────────────────────
  let pushZustand = 'unbekannt';   // unbekannt | aus | an | gesperrt | homescreen | nicht-moeglich
  const istIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
  const istHomescreen = () => (window.navigator.standalone === true) ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

  function schluesselBytes(b64) {
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const roh = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(roh, c => c.charCodeAt(0));
  }
  const gleicheBytes = (a, b) => a && b && a.byteLength === b.byteLength &&
    new Uint8Array(a).every((x, i) => x === new Uint8Array(b)[i]);

  async function pushStatus() {
    let z;
    if (istIOS() && !istHomescreen()) z = 'homescreen';
    else if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) z = 'nicht-moeglich';
    else if (Notification.permission === 'denied') z = 'gesperrt';
    else {
      try {
        const reg = await navigator.serviceWorker.ready;
        const abo = await reg.pushManager.getSubscription();
        const passt = abo && gleicheBytes(abo.options && abo.options.applicationServerKey, schluesselBytes(VAPID).buffer);
        z = passt && Notification.permission === 'granted' ? 'an' : 'aus';
      } catch (e) { z = 'aus'; }
    }
    if (z !== pushZustand) { pushZustand = z; zeichnen(); }
  }

  function pushFuss() {
    const texte = {
      unbekannt: '',
      aus: `<span>Mitteilungen auf diesem Gerät</span><button type="button" class="rr-link" data-aktion="push-an">Aktivieren</button>`,
      an: `<span class="rr-an">Mitteilungen auf diesem Gerät aktiv</span><button type="button" class="rr-link" data-aktion="push-test">Test senden</button>`,
      gesperrt: `<span>Mitteilungen sind im Browser blockiert — in den Website-Einstellungen erlauben.</span>`,
      homescreen: `<span>Für Mitteilungen aufs iPhone: in Safari Teilen → „Zum Home-Bildschirm“, dann dort öffnen.</span>`,
      'nicht-moeglich': `<span>Dieser Browser kann keine Mitteilungen empfangen.</span>`
    };
    const t = texte[pushZustand] || '';
    return t ? `<div class="rr-fuss">${t}</div>` : '';
  }

  async function pushAktivieren() {
    try {
      const erlaubnis = await Notification.requestPermission();
      if (erlaubnis !== 'granted') { await pushStatus(); return; }
      const reg = await navigator.serviceWorker.ready;
      const schluessel = schluesselBytes(VAPID);
      let abo = await reg.pushManager.getSubscription();
      // Ein altes Abo mit anderem Schluessel kann nie zugestellt werden — ersetzen
      if (abo && !gleicheBytes(abo.options && abo.options.applicationServerKey, schluessel.buffer)) {
        await abo.unsubscribe();
        abo = null;
      }
      if (!abo) abo = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: schluessel });

      const token = await window.api.getSessionToken();
      if (!token) throw new Error('Keine gültige Anmeldung — bitte neu einloggen.');
      const res = await fetch('/api/push_subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subscription: abo })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || `Fehler ${res.status}`);
      if (typeof window.showToast === 'function') window.showToast('Mitteilungen aktiviert');
    } catch (e) {
      console.error('Push aktivieren:', e);
      if (typeof window.showToast === 'function') window.showToast(`Mitteilungen nicht aktiviert: ${e.message}`, true);
    }
    await pushStatus();
  }

  async function pushTesten() {
    try {
      const token = await window.api.getSessionToken();
      const res = await fetch('/api/rueckrufe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ test: true })
      });
      const data = await res.json().catch(() => ({}));
      const text = data.ok ? `Test an ${data.zugestellt} Gerät${data.zugestellt === 1 ? '' : 'e'} geschickt`
                           : `Test nicht zugestellt: ${data.error || data.grund || res.status}`;
      if (typeof window.showToast === 'function') window.showToast(text, !data.ok);
    } catch (e) {
      if (typeof window.showToast === 'function') window.showToast(`Test fehlgeschlagen: ${e.message}`, true);
    }
  }

  // ── Nachrichten vom Service Worker und Einstieg ueber die Mitteilung ───────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      const d = e.data || {};
      if (d.typ === 'rueckruf' || d.typ === 'rueckrufe') pruefen();
      if (d.typ === 'oeffne' && d.leadId) warteAufAnmeldung().then(() => oeffnen(d.leadId));
      if (d.typ === 'oeffne-stapel') umschalten(true);
    });
  }

  function warteAufAnmeldung() {
    return new Promise((resolve) => {
      const los = () => (window.globalUser && typeof window.openLeadDirectly === 'function') ? resolve() : setTimeout(los, 300);
      los();
    });
  }

  function einstieg() {
    const p = new URLSearchParams(location.search);
    const lead = Number(p.get('lead'));
    const stapelAuf = p.get('rueckrufe') === '1';
    if (!lead && !stapelAuf) return;
    // Parameter weg, damit ein Neuladen nicht erneut springt
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    warteAufAnmeldung().then(() => {
      pruefen();
      if (stapelAuf) umschalten(true);
      if (lead) oeffnen(lead);
    });
  }

  // ── Start ──────────────────────────────────────────────────────────────────
  function start() {
    const g = document.getElementById('rr-glocke');
    if (g) g.addEventListener('click', () => umschalten());
    zeichnen();
    einstieg();
    warteAufAnmeldung().then(() => { pruefen(); pushStatus(); });
    setInterval(pruefen, TAKT);
    // Seiten-Uhr laeuft im Hintergrund-Tab langsamer — beim Zurueckkommen sofort
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pruefen(); });
    // "faellig seit" aktuell halten
    setInterval(() => { document.querySelectorAll('.rr-karte').forEach(k => {
      const l = eintrag(k.getAttribute('data-id'));
      const s = k.querySelector('.rr-seit');
      if (l && s) s.textContent = seitText(l.snooze_until_ms);
    }); }, TAKT);
  }

  window.Rueckruf = { pruefen, umschalten, fanfare, pushAktivieren, pushStatus, _zustand: () => ({ faellig, offen, pushZustand }) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
