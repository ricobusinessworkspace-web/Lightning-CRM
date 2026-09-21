/**
 * Öffnungszeiten lesen und beantworten: "haben die gerade auf?"
 *
 * Warum es diese Datei gibt
 * ─────────────────────────
 * Google liefert die Zeiten als **englischen Zwoelf-Stunden-Text**, Zeile pro
 * Wochentag, Montag zuerst:
 *
 *     "Monday: 6:30 AM – 4:00 PM"
 *     "Saturday: Closed"
 *     "Tuesday: 4:00 – 9:00 PM"        ← nur hinten steht PM, vorne nicht
 *
 * Die Listenansicht hat daraus mit /(\d{1,2}:\d{2}).*(\d{1,2}:\d{2})/ zwei
 * Uhrzeiten gezogen und AM/PM weggeworfen. Aus "6:30 AM – 4:00 PM" wurde
 * 6:30 bis 4:00 — ein Zeitraum, der nie gilt. Deshalb stand bei fast jedem
 * Lead "Closed", obwohl die Zeiten sauber hinterlegt waren. "Closed" selbst
 * wurde auch nicht erkannt, weil nur auf "geschlossen" geprueft wurde.
 *
 * Hier steht die ganze Logik einmal, und alle drei Ansichten (Liste,
 * Karteikarte, Landkarte) fragen dieselbe Stelle.
 */
(function () {
  'use strict';

  const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

  // Google schreibt Montag zuerst. Dieselbe Zaehlung wie (getDay()+6)%7.
  const tagIndex = (datum) => ((datum || new Date()).getDay() + 6) % 7;

  /** Die sieben Zeilen eines Leads — egal, wo sie hinterlegt sind. */
  function zeilen(lead) {
    if (!lead) return null;
    const ausWert = (wert) => {
      if (!wert) return null;
      let w = wert;
      if (typeof w === 'string') {
        try { w = JSON.parse(w); } catch (e) { return null; }
      }
      if (Array.isArray(w)) return w;
      if (w && Array.isArray(w.weekdayDescriptions)) return w.weekdayDescriptions;
      return null;
    };
    // Erst am Lead, dann am ersten Standort — im Bestand steht es fast immer
    // am Standort (198 von 243 Leads), am Lead selbst nur bei dreien.
    const direkt = ausWert(lead.opening_hours);
    if (direkt && direkt.length) return direkt;
    const orte = Array.isArray(lead.locations) ? lead.locations : [];
    for (const ort of orte) {
      const ausOrt = ausWert(ort && ort.opening_hours);
      if (ausOrt && ausOrt.length) return ausOrt;
    }
    return null;
  }

  /** Die Zeile fuer einen Wochentag, ohne den vorangestellten Tagesnamen. */
  function zeileFuerTag(lead, idx) {
    const alle = zeilen(lead);
    if (!alle || !alle.length) return null;
    const roh = alle.length === 7 ? alle[((idx % 7) + 7) % 7] : alle[0];
    if (!roh) return null;
    return String(roh).replace(/^[^:]{3,12}:\s*/, '').trim();   // "Monday: " weg
  }

  // ── Eine Zeile in Zeitraeume uebersetzen ──────────────────────────────────

  const GESCHLOSSEN = /(geschlossen|closed|ruhetag)/i;
  const DURCHGEHEND = /(rund um die uhr|24\s*hours|24\/7|durchgehend|open 24)/i;

  // "6:30 AM – 4:00 PM", "4:00 – 9:00 PM", "11:00–14:30", "9 AM–5 PM"
  const ZEITRAUM = /(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:–|—|-|bis|to)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/gi;

  const inMinuten = (stunde, minute, halbtag) => {
    let h = stunde % 24;
    if (halbtag) {
      const p = /p/i.test(halbtag);
      if (p && h !== 12) h += 12;
      if (!p && h === 12) h = 0;
    }
    return h * 60 + (minute || 0);
  };

  /**
   * Zeitraeume einer Zeile in Minuten seit Mitternacht.
   * Reicht ein Zeitraum ueber Mitternacht, endet er jenseits von 1440.
   */
  function zeitraeume(zeile) {
    if (!zeile) return null;
    if (GESCHLOSSEN.test(zeile)) return [];
    if (DURCHGEHEND.test(zeile)) return [{ von: 0, bis: 1440 }];

    const gefunden = [];
    let m;
    ZEITRAUM.lastIndex = 0;
    while ((m = ZEITRAUM.exec(zeile)) !== null) {
      const vonH = parseInt(m[1], 10);
      const vonM = m[2] ? parseInt(m[2], 10) : 0;
      let vonHalbtag = m[3] || null;
      const bisH = parseInt(m[4], 10);
      const bisM = m[5] ? parseInt(m[5], 10) : 0;
      const bisHalbtag = m[6] || null;

      // "4:00 – 9:00 PM": vorne fehlt die Angabe. Ist die Anfangsstunde
      // kleiner, gehoert sie zur selben Tageshaelfte (16:00–21:00). Ist sie
      // groesser, ist es der Vormittag ("11:00 – 2:00 PM" = 11:00–14:00).
      if (!vonHalbtag && bisHalbtag) vonHalbtag = (vonH <= bisH) ? bisHalbtag : (/p/i.test(bisHalbtag) ? 'am' : 'pm');

      let von = inMinuten(vonH, vonM, vonHalbtag);
      let bis = inMinuten(bisH, bisM, bisHalbtag);
      if (bis <= von) bis += 1440;                  // ueber Mitternacht
      gefunden.push({ von, bis });
    }
    return gefunden.length ? gefunden : null;
  }

  const alsUhrzeit = (minuten) => {
    const m = ((minuten % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };

  // ── Die Frage, um die es geht ─────────────────────────────────────────────

  /**
   * @returns {{offen: boolean|null, text: string|null, bis: string|null, ab: string|null}}
   *   offen === null heisst: keine Zeiten hinterlegt. Das ist etwas anderes
   *   als "geschlossen" und wird auch anders angezeigt.
   */
  function zustand(lead, jetzt) {
    const d = jetzt || new Date();
    const heuteIdx = tagIndex(d);
    const heuteZeile = zeileFuerTag(lead, heuteIdx);
    if (heuteZeile === null) return { offen: null, text: null, bis: null, ab: null };

    const minutenJetzt = d.getHours() * 60 + d.getMinutes();

    // Gestern kann bis in den heutigen Morgen reichen (Gastronomie).
    const gestern = zeitraeume(zeileFuerTag(lead, heuteIdx - 1)) || [];
    for (const z of gestern) {
      if (z.bis > 1440 && minutenJetzt < z.bis - 1440) {
        return { offen: true, text: 'Offen bis ' + alsUhrzeit(z.bis), bis: alsUhrzeit(z.bis), ab: null };
      }
    }

    const heute = zeitraeume(heuteZeile);
    if (heute === null) return { offen: null, text: null, bis: null, ab: null };
    if (heute.length === 0) return { offen: false, text: 'Heute geschlossen', bis: null, ab: null };

    for (const z of heute) {
      if (minutenJetzt >= z.von && minutenJetzt < z.bis) {
        const bis = alsUhrzeit(z.bis);
        return {
          offen: true,
          text: (z.von === 0 && z.bis >= 1440) ? 'Durchgehend offen' : 'Offen bis ' + bis,
          bis, ab: null
        };
      }
    }

    const spaeter = heute.filter(z => z.von > minutenJetzt).sort((a, b) => a.von - b.von)[0];
    if (spaeter) {
      const ab = alsUhrzeit(spaeter.von);
      return { offen: false, text: 'Öffnet ' + ab, bis: null, ab };
    }
    return { offen: false, text: 'Feierabend', bis: null, ab: null };
  }

  /** Lesbare Zeile fuer heute, z. B. "Montag: 06:30 – 16:00". */
  function heuteText(lead, jetzt) {
    const idx = tagIndex(jetzt);
    const zeile = zeileFuerTag(lead, idx);
    if (zeile === null) return null;
    const z = zeitraeume(zeile);
    if (z === null) return WOCHENTAGE[idx] + ': ' + zeile;        // unverstanden: Rohtext
    if (z.length === 0) return WOCHENTAGE[idx] + ': geschlossen';
    return WOCHENTAGE[idx] + ': ' + z.map(r => alsUhrzeit(r.von) + ' – ' + alsUhrzeit(r.bis)).join(', ');
  }

  /** Alle sieben Tage lesbar — fuer die Karteikarte. */
  function wocheText(lead) {
    const alle = zeilen(lead);
    if (!alle || alle.length !== 7) return null;
    return alle.map((_, i) => {
      const z = zeitraeume(zeileFuerTag(lead, i));
      const wert = z === null ? String(alle[i]).replace(/^[^:]{3,12}:\s*/, '')
                 : z.length === 0 ? 'geschlossen'
                 : z.map(r => alsUhrzeit(r.von) + ' – ' + alsUhrzeit(r.bis)).join(', ');
      return { tag: WOCHENTAGE[i], zeit: wert, heute: i === tagIndex() };
    });
  }

  const Oeffnungszeiten = { zeilen, zeileFuerTag, zeitraeume, zustand, heuteText, wocheText, tagIndex, WOCHENTAGE };
  if (typeof window !== 'undefined') window.Oeffnungszeiten = Oeffnungszeiten;
  if (typeof module !== 'undefined' && module.exports) module.exports = Oeffnungszeiten;
})();
