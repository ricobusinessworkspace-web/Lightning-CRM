/**
 * core/leadstore.js — der EINZIGE Schreibweg zur Lead-Tabelle
 * ─────────────────────────────────────────────────────────────────────────────
 * Muss nach core/store.js und vor ui/pipeline_ui.js geladen werden.
 *
 * Warum es diese Datei gibt
 * ─────────────────────────
 * Vorher hat jede Funktion selbst gespeichert: eigener Aufruf von
 * api.saveLead, eigenes Nachziehen der Kopie im Speicher, eigene
 * Fehlerbehandlung. Drei Folgen, alle real aufgetreten:
 *
 *   1. Wer die Kopie im Speicher vergessen hat nachzuziehen, schickte beim
 *      naechsten Mal einen veralteten Zeitstempel mit. Die Aenderungspruefung
 *      hielt das fuer eine Fremdaenderung und lehnte ab — bei einem einzigen
 *      Nutzer. Erst ein Neuladen der Seite half.
 *   2. Manche Wege haben nur store.state.leads aktualisiert, andere nur den
 *      Zwischenspeicher der Reiter (tabCache). Je nachdem, welche Ansicht
 *      danach gezeichnet wurde, sah man den alten oder den neuen Stand.
 *   3. Wer eine Kopie des Lead-Objekts anlegte statt es zu aendern, liess
 *      andere Stellen auf das alte Objekt zeigen.
 *
 * Alles laeuft jetzt durch window.leadStore.save(). Die Funktion
 *   - reiht den Vorgang in die Warteschlange ein (nichts ueberholt sich),
 *   - schickt den Zeitstempel aus dem Speicher mit,
 *   - holt bei gemeldetem Konflikt EINMAL den echten Stand und wiederholt,
 *   - zieht Speicher und Zwischenspeicher der Reiter gemeinsam nach,
 *   - zeichnet die betroffene Karte neu.
 */
(function () {
  'use strict';

  // ── Warteschlange ──────────────────────────────────────────────────────────
  // Ein Klick loest oft mehrere Speichervorgaenge gleichzeitig aus: der Knopf
  // schreibt selbst, und derselbe Klick nimmt den Fokus aus dem vorherigen
  // Feld, was den Auto-Save startet. Ohne Warteschlange schicken beide den
  // Stand von VOR dem jeweils anderen mit.
  let chain = Promise.resolve();
  window.queueSave = (fn) => {
    const next = chain.then(() => fn());
    // Ein Fehler darf die Kette nicht abreissen lassen
    chain = next.then(() => {}, () => {});
    return next;
  };

  const leadsArray = () =>
    (window.store && window.store.state && window.store.state.leads) || [];

  const get = (id) => leadsArray().find(x => x.id === id) || null;

  // ── Kopie im Speicher nachziehen ───────────────────────────────────────────
  // Bewusst Object.assign statt eines neuen Objekts: andere Stellen halten
  // Verweise auf denselben Lead (z. B. die geladene Verlaufsliste in
  // openLeadDirectly). Ein Austausch wuerde die stillschweigend abhaengen.
  const patch = (id, fields) => {
    const target = leadsArray().find(x => x.id === id);
    if (target) Object.assign(target, fields);

    const tc = window.store && window.store.state && window.store.state.tabCache;
    if (tc) {
      for (const k of Object.keys(tc)) {
        if (!Array.isArray(tc[k])) continue;
        const cached = tc[k].find(x => x.id === id);
        if (cached && cached !== target) Object.assign(cached, fields);
      }
    }
    return target;
  };

  const istKonflikt = (err) => /Konflikt/i.test((err && err.message) || '');

  // ── Zustandsmeldung nach aussen ────────────────────────────────────────────
  // Die Seitenleiste zeigt daran, ob gerade geschrieben wird, wann zuletzt
  // gespeichert wurde und ob etwas offen geblieben ist. Ohne diese Rueckmeldung
  // sieht ein stillschweigend fehlgeschlagener Schreibvorgang genauso aus wie
  // ein erfolgreicher — genau daran ist das Vertrauen in das Autospeichern
  // zerbrochen.
  const melde = (zustand, extra) => {
    if (typeof window.setSaveStatus === 'function') {
      try { window.setSaveStatus(zustand, extra); } catch (e) { /* Anzeige darf nie stoeren */ }
    }
  };

  // Offene Schreibvorgaenge. Solange > 0, laeuft noch etwas.
  let offen = 0;

  /**
   * Schreibt genau die uebergebenen Spalten. Nicht genannte Spalten bleiben
   * unberuehrt (db.js beherrscht Teil-Updates).
   *
   * @param {number} id      Lead
   * @param {object} fields  nur die Spalten, die sich geaendert haben
   * @param {object} opts    { label, silent, noRefresh }
   * @returns {Promise<boolean>} true, wenn geschrieben wurde
   */
  const save = (id, fields, opts = {}) => window.queueSave(async () => {
    if (!id) return false;
    if (!fields || Object.keys(fields).length === 0) return true; // nichts zu tun

    const schreibe = async (lastEditedMs) => {
      const payload = { id, ...fields };
      if (lastEditedMs !== undefined) payload.last_edited_ms = lastEditedMs;
      return window.api.saveLead(payload);
    };

    offen++;
    melde('speichert');
    try {
      const bekannt = get(id);
      let res;
      try {
        res = await schreibe(bekannt ? bekannt.last_edited_ms : undefined);
      } catch (err) {
        if (!istKonflikt(err)) throw err;
        // Der eigene Zwischenstand ist veraltet. Echten Stand holen und genau
        // einmal wiederholen. Im Einzelplatz-Betrieb ist ein gemeldeter
        // Konflikt praktisch immer die eigene vorherige Speicherung.
        // Da nur die genannten Spalten geschrieben werden, kann dabei auch bei
        // mehreren Nutzern nur ueberschrieben werden, was gerade bearbeitet wird.
        console.warn('leadStore: Zeitstempel veraltet, hole echten Stand und wiederhole.', err.message);
        const frisch = await window.api.getLead(id);
        if (!frisch) throw err;
        patch(id, { last_edited_ms: frisch.last_edited_ms });
        res = await schreibe(frisch.last_edited_ms);
      }

      const uebernommen = { ...fields };
      if (res && res.last_edited_ms) uebernommen.last_edited_ms = res.last_edited_ms;
      patch(id, uebernommen);

      if (!opts.noRefresh && typeof window.refreshLeadCard === 'function') {
        window.refreshLeadCard(id);
      }
      offen--;
      if (offen === 0) melde('gespeichert', { leadId: id, felder: Object.keys(fields) });
      return true;
    } catch (err) {
      offen--;
      console.error('leadStore.save:', err);
      melde('fehler', { leadId: id, felder: fields, meldung: err.message, label: opts.label });
      if (!opts.silent && typeof window.showToast === 'function') {
        window.showToast(`${opts.label || 'Änderung'} konnte nicht gespeichert werden: ${err.message}`, true);
      }
      return false;
    }
  });

  /**
   * Vergleicht Wunschwerte mit dem bekannten Stand und liefert nur die
   * Spalten zurueck, die sich wirklich unterscheiden. Ist der Lead nicht im
   * Speicher, werden alle Wunschwerte zurueckgegeben.
   */
  const diff = (id, kandidat) => {
    const bekannt = get(id);
    if (!bekannt) return { ...kandidat };
    const out = {};
    for (const [k, v] of Object.entries(kandidat)) {
      if (v === undefined) continue;
      const alt = bekannt[k];
      // null und '' und 0 sauber unterscheiden, aber "1" == 1 zulassen
      const gleich = (alt === v) ||
                     (alt == null && v == null) ||
                     (typeof alt === 'number' && typeof v === 'number' && alt === v) ||
                     (String(alt ?? '') === String(v ?? '') && typeof alt !== 'object');
      if (!gleich) out[k] = v;
    }
    return out;
  };

  // Warten, bis alle laufenden Schreibvorgaenge durch sind.
  const ruhe = () => window.queueSave(async () => true);

  window.leadStore = { get, patch, save, diff, ruhe, offeneVorgaenge: () => offen };
})();
