/**
 * Wiedervorlage mit Drehrad — "ruf in 20 Minuten nochmal an".
 *
 * Warum es diese Datei gibt
 * ─────────────────────────
 * Vorher gab es zwei Zahlenfelder, "Std." und "Tage". Ein Rueckruf in 20
 * Minuten ging damit gar nicht, und ein Rueckruf "morgen frueh" nur als
 * "in 24 Stunden" — also morgen zur selben Uhrzeit.
 *
 * Jetzt: ein Drehrad wie beim iPhone-Timer (Tage · Stunden · Minuten in
 * 5er-Schritten), das immer auf 0 steht. Alternativ ein Datum — dann ist die
 * Wiedervorlage an diesem Tag um 8:00 faellig. Darunter steht live, wann es
 * faellig wird. Geschrieben wird erst mit "Setzen", nie beim Drehen.
 *
 * Gespeichert wird weiter nur snooze_until_ms am Lead. Am Datenmodell aendert
 * sich nichts: ein Lead mit Wiedervorlage ist bis dahin ausgeblendet.
 *
 * Aufbau: oben reine Rechnung (laeuft auch im Test ohne Browser), unten die
 * Oberflaeche.
 */
(function () {
  'use strict';

  const MIN = 60 * 1000;
  const STD = 60 * MIN;
  const MORGENS = 8;              // Uhrzeit fuer "an diesem Datum"
  const MINUTEN_SCHRITT = 5;
  const WOCHENTAG = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

  const SPALTEN = [
    { feld: 'tage',    einheit: 'Tage', name: 'Tage',    werte: Array.from({ length: 31 }, (_, i) => i) },
    { feld: 'stunden', einheit: 'Std.', name: 'Stunden', werte: Array.from({ length: 24 }, (_, i) => i) },
    { feld: 'minuten', einheit: 'Min.', name: 'Minuten', werte: Array.from({ length: 60 / MINUTEN_SCHRITT }, (_, i) => i * MINUTEN_SCHRITT) }
  ];

  // ── Rechnung ───────────────────────────────────────────────────────────────

  /**
   * Zielzeitpunkt aus einer Dauer. Tage werden als Kalendertage gezaehlt
   * ("1 Tag" = morgen zur selben Uhrzeit, auch ueber die Zeitumstellung).
   * Auf die naechste volle Minute gerundet: angezeigt wird 14:53, also soll es
   * auch 14:53 faellig sein und nicht 14:52:40. Gerundet, nicht aufgerundet —
   * sonst stuende bei "20 Min" oft "in 21 Min" darunter.
   * Dauer 0 -> null (nichts zu setzen).
   */
  function zielAusDauer(jetzt, { tage = 0, stunden = 0, minuten = 0 } = {}) {
    if (tage <= 0 && stunden <= 0 && minuten <= 0) return null;
    const d = new Date(jetzt);
    d.setDate(d.getDate() + tage);
    const roh = d.getTime() + stunden * STD + minuten * MIN;
    return Math.round(roh / MIN) * MIN;
  }

  /** 'JJJJ-MM-TT' -> dieser Tag um 8:00 Ortszeit. Vergangen -> null. */
  function zielAusDatum(tag, jetzt) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(tag || ''));
    if (!m) return null;
    const ziel = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), MORGENS, 0, 0, 0).getTime();
    return ziel > jetzt ? ziel : null;
  }

  const zweistellig = (n) => String(n).padStart(2, '0');
  const uhrzeit = (d) => `${zweistellig(d.getHours())}:${zweistellig(d.getMinutes())}`;
  const tagesBeginn = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

  /** "heute 14:53" · "morgen 08:00" · "Mo, 29.09. 08:00" */
  function wann(ziel, jetzt) {
    const d = new Date(ziel);
    const tage = Math.round((tagesBeginn(ziel) - tagesBeginn(jetzt)) / (24 * STD));
    if (tage === 0) return `heute ${uhrzeit(d)}`;
    if (tage === 1) return `morgen ${uhrzeit(d)}`;
    return `${WOCHENTAG[d.getDay()]}, ${zweistellig(d.getDate())}.${zweistellig(d.getMonth() + 1)}. ${uhrzeit(d)}`;
  }

  /** Dauer als Text: "20 Min" · "2 Std 5 Min" · "3 Tage" · "1 Tag 4 Std" */
  function dauer(ms) {
    const minuten = Math.max(0, Math.round(ms / MIN));
    if (minuten < 1) return null;
    if (minuten < 60) return `${minuten} Min`;
    const stunden = Math.floor(minuten / 60);
    const restMin = minuten % 60;
    if (stunden < 24) return restMin ? `${stunden} Std ${restMin} Min` : `${stunden} Std`;
    const t = Math.floor(stunden / 24);
    const restStd = stunden % 24;
    const tagText = t === 1 ? '1 Tag' : `${t} Tage`;
    return restStd ? `${tagText} ${restStd} Std` : tagText;
  }

  /** "in 20 Min" / "gleich" */
  function inText(ziel, jetzt) {
    const t = dauer(ziel - jetzt);
    return t ? `in ${t}` : 'gleich';
  }

  /** "noch 20 Min" / "jetzt fällig" — fuer die Karten in der Liste */
  function restText(ziel, jetzt) {
    const t = dauer(ziel - jetzt);
    return t ? `noch ${t}` : 'jetzt fällig';
  }

  const Rechnung = { zielAusDauer, zielAusDatum, wann, dauer, inText, restText, SPALTEN, MORGENS };

  // ── Oberflaeche ────────────────────────────────────────────────────────────
  // Nur im Browser. Die Seitenleiste wird bei jedem Lead-Wechsel neu gezeichnet;
  // html() liefert den Abschnitt, binde() haengt die Bedienung an.

  const ZEILE = 30;       // Hoehe eines Eintrags im Rad (px), muss zu styles.css passen

  const KALENDER = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
  const UHR = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 4.8V8l2.2 1.4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';

  function html(lead) {
    const jetzt = Date.now();
    const ziel = Number(lead && lead.snooze_until_ms) || 0;
    const aktiv = ziel > jetzt;
    const id = Number(lead && lead.id) || 0;
    const heute = new Date(jetzt).toLocaleDateString('sv-SE');

    const spalten = SPALTEN.map(s => `
      <div class="wv-spalte" tabindex="0" role="spinbutton" data-feld="${s.feld}"
           aria-label="${s.name}" aria-valuemin="${s.werte[0]}" aria-valuemax="${s.werte[s.werte.length - 1]}"
           aria-valuenow="0" aria-valuetext="0 ${s.name}">
        <div class="wv-polster"></div>
        ${s.werte.map((w, i) => `<div class="wv-wert${i === 0 ? ' gewaehlt' : ''}" data-index="${i}">${w}</div>`).join('')}
        <div class="wv-polster"></div>
      </div>`).join('');

    const einheiten = SPALTEN.map(s => `<span class="wv-einheit">${s.einheit}</span>`).join('');

    return `
      <div class="apple-section wv" data-lead-id="${id}" data-eigenes-speichern>
        <h4 class="apple-section-title">Wiedervorlage</h4>
        ${!aktiv ? '' : `
        <div class="wv-aktiv">
          <span class="wv-aktiv-symbol">${UHR}</span>
          <div class="wv-aktiv-text">
            <div class="wv-aktiv-wann">${wann(ziel, jetzt)}</div>
            <div class="wv-aktiv-rest" data-wv-ziel="${ziel}">${restText(ziel, jetzt)}</div>
          </div>
          <button type="button" class="wv-aufheben">Aufheben</button>
        </div>`}
        <div class="wv-rad" role="group" aria-label="Wiedervorlage in">
          <div class="wv-band" aria-hidden="true"></div>
          <div class="wv-einheiten" aria-hidden="true">${einheiten}</div>
          ${spalten}
        </div>
        <div class="wv-fuss">
          <div class="wv-anzeige" aria-live="polite">Drehen oder Datum wählen</div>
          <div class="wv-aktionen">
            <div class="wv-datum-feld">
              <button type="button" class="wv-datum-knopf" title="An einem Datum um ${MORGENS}:00">${KALENDER}<span class="wv-datum-text">Datum</span></button>
              <button type="button" class="wv-datum-weg" aria-label="Datum entfernen" hidden>×</button>
              <input type="date" class="wv-datum" min="${heute}" tabindex="-1" aria-label="Datum der Wiedervorlage">
            </div>
            <button type="button" class="wv-setzen" disabled>${aktiv ? 'Neu setzen' : 'Setzen'}</button>
          </div>
        </div>
      </div>`;
  }

  const reduziert = () => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  };

  function binde(root) {
    if (!root || root._wvGebunden) return;
    root._wvGebunden = true;

    const leadId = Number(root.getAttribute('data-lead-id')) || 0;
    const spalten = [...root.querySelectorAll('.wv-spalte')];
    const anzeige = root.querySelector('.wv-anzeige');
    const setzen = root.querySelector('.wv-setzen');
    const datumEl = root.querySelector('.wv-datum');
    const datumKnopf = root.querySelector('.wv-datum-knopf');
    const datumText = root.querySelector('.wv-datum-text');
    const datumWeg = root.querySelector('.wv-datum-weg');
    const aufheben = root.querySelector('.wv-aufheben');

    const index = (sp) => {
      const max = sp.querySelectorAll('.wv-wert').length - 1;
      return Math.min(max, Math.max(0, Math.round(sp.scrollTop / ZEILE)));
    };
    const werte = () => {
      const w = {};
      spalten.forEach(sp => {
        const s = SPALTEN.find(x => x.feld === sp.dataset.feld);
        w[sp.dataset.feld] = s.werte[index(sp)];
      });
      return w;
    };

    let datum = '';

    const ziel = () => datum ? zielAusDatum(datum, Date.now()) : zielAusDauer(Date.now(), werte());

    const zeige = () => {
      const z = ziel();
      if (datum && !z) {
        anzeige.textContent = `${MORGENS}:00 an diesem Tag ist schon vorbei`;
        anzeige.classList.remove('bereit');
      } else if (!z) {
        anzeige.textContent = 'Drehen oder Datum wählen';
        anzeige.classList.remove('bereit');
      } else {
        const jetzt = Date.now();
        anzeige.innerHTML = `<b>${wann(z, jetzt)}</b> · ${inText(z, jetzt)}`;
        anzeige.classList.add('bereit');
      }
      setzen.disabled = !z;
      root.classList.toggle('wv-datum-modus', !!datum);
    };

    const datumSetzen = (tag) => {
      datum = tag || '';
      datumEl.value = datum;
      if (datum) {
        const [, m, d] = datum.split('-');
        datumText.textContent = `${d}.${m}.`;
      } else {
        datumText.textContent = 'Datum';
      }
      datumWeg.hidden = !datum;
      datumKnopf.classList.toggle('aktiv', !!datum);
      zeige();
    };

    const markiere = (sp) => {
      const i = index(sp);
      if (sp._index === i) return false;
      sp._index = i;
      sp.querySelectorAll('.wv-wert').forEach((el, k) => el.classList.toggle('gewaehlt', k === i));
      const s = SPALTEN.find(x => x.feld === sp.dataset.feld);
      sp.setAttribute('aria-valuenow', String(s.werte[i]));
      sp.setAttribute('aria-valuetext', `${s.werte[i]} ${s.name}`);
      return true;
    };

    spalten.forEach(sp => {
      sp._index = 0;
      let geplant = false;
      sp.addEventListener('scroll', () => {
        if (geplant) return;
        geplant = true;
        requestAnimationFrame(() => {
          geplant = false;
          if (!markiere(sp)) return;
          // Wer dreht, meint eine Dauer — ein gewaehltes Datum faellt weg.
          if (datum && Object.values(werte()).some(v => v > 0)) datumSetzen('');
          else zeige();
        });
      }, { passive: true });

      const geheZu = (i) => {
        const max = sp.querySelectorAll('.wv-wert').length - 1;
        const ziel = Math.min(max, Math.max(0, i));
        sp.scrollTo({ top: ziel * ZEILE, behavior: reduziert() ? 'auto' : 'smooth' });
      };

      sp.addEventListener('keydown', (e) => {
        const i = index(sp);
        const schritt = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 }[e.key];
        if (schritt) { e.preventDefault(); geheZu(i + schritt); }
        else if (e.key === 'Home') { e.preventDefault(); geheZu(0); }
        else if (e.key === 'End') { e.preventDefault(); geheZu(Infinity); }
        else if (e.key === 'Enter' && !setzen.disabled) { e.preventDefault(); setzen.click(); }
      });

      // Antippen eines Eintrags dreht ihn in die Mitte
      sp.addEventListener('click', (e) => {
        const el = e.target.closest('.wv-wert');
        if (el) geheZu(Number(el.dataset.index));
      });
    });

    datumKnopf.addEventListener('click', () => {
      try {
        if (typeof datumEl.showPicker === 'function') { datumEl.showPicker(); return; }
      } catch (e) { /* manche Browser erlauben showPicker nicht — dann sichtbar machen */ }
      root.classList.add('wv-datum-sichtbar');
      datumEl.focus();
    });
    datumEl.addEventListener('change', () => datumSetzen(datumEl.value));
    datumWeg.addEventListener('click', () => datumSetzen(''));

    setzen.addEventListener('click', async () => {
      const z = ziel();
      if (!z || setzen.disabled) return;
      setzen.disabled = true;
      const ok = await window.setzeWiedervorlage(leadId, z);
      if (!ok) setzen.disabled = false;
    });

    if (aufheben) {
      aufheben.addEventListener('click', async () => {
        aufheben.disabled = true;
        const ok = await window.setzeWiedervorlage(leadId, 0);
        if (!ok) aufheben.disabled = false;
      });
    }

    zeige();
    if (root.querySelector('[data-wv-ziel]')) tickStarten();
  }

  /** Den Abschnitt eines Leads neu zeichnen (nach Setzen oder Aufheben). */
  function neuZeichnen(leadId) {
    const alt = document.querySelector(`.wv[data-lead-id="${Number(leadId)}"]`);
    const lead = ((window.store && window.store.state && window.store.state.leads) || [])
      .find(x => Number(x.id) === Number(leadId));
    if (!alt || !lead) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = html(lead);
    const neu = tmp.firstElementChild;
    alt.replaceWith(neu);
    binde(neu);
  }

  // Restzeit ("noch 12 Min") laufen lassen, solange die Seite offen ist
  function tick() {
    const jetzt = Date.now();
    document.querySelectorAll('[data-wv-ziel]').forEach(el => {
      el.textContent = restText(Number(el.getAttribute('data-wv-ziel')), jetzt);
    });
  }

  // Erst starten, wenn es wirklich etwas herunterzuzaehlen gibt
  function tickStarten() {
    if (window._wvTick) return;
    window._wvTick = setInterval(tick, 30 * 1000);
  }

  const Wiedervorlage = { ...Rechnung, html, binde, neuZeichnen, tickStarten };
  if (typeof window !== 'undefined') window.Wiedervorlage = Wiedervorlage;
  if (typeof module !== 'undefined' && module.exports) module.exports = Wiedervorlage;
})();
