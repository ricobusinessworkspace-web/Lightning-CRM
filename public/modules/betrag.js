/**
 * Provision und Abschlussdatum aus einem Eingabefeld lesen.
 *
 * Warum es diese Datei gibt
 * ─────────────────────────
 * Beide Stellen, an denen man den Wert eines Abschlusses eintippt (Dialog
 * "Abschluss festhalten" und das Feld "Wert" in der Seitenleiste), haben
 * nur das erste Komma durch einen Punkt ersetzt und dann Number() gerufen:
 *
 *     "1.500"     -> 1.5      (Tausenderpunkt als Komma gelesen)
 *     "1.500,50"  -> NaN      -> NULL, der alte Wert war weg
 *
 * Hier steht das Lesen einmal. Was sich nicht eindeutig als Betrag lesen
 * laesst, liefert `undefined` — und undefined heisst beim Speichern
 * "nichts anfassen", nicht "leeren".
 */
(function () {
  'use strict';

  /**
   * Text -> Zahl in Euro.
   *   ''            -> null       (bewusst geleert: "noch nicht eingetragen")
   *   '1500', '1.500', '1500,50', '1.500,50', '1,500.50', '1500.5' -> Zahl
   *   'abc', '1,2,3' -> undefined  (unlesbar: nicht speichern)
   */
  function leseBetrag(roh) {
    let s = String(roh ?? '').replace(/[\s €]/g, '');
    if (s === '') return null;
    if (!/^-?[\d.,]+$/.test(s)) return undefined;

    const punkt = s.lastIndexOf('.');
    const komma = s.lastIndexOf(',');
    if (punkt !== -1 && komma !== -1) {
      // Beides kommt vor: das hintere Zeichen trennt die Nachkommastellen.
      const dezimal = punkt > komma ? '.' : ',';
      const tausend = dezimal === '.' ? ',' : '.';
      s = s.split(tausend).join('').replace(dezimal, '.');
    } else if (komma !== -1) {
      // Nur Komma: deutsches Dezimalkomma — oder Tausender wie "1,500,000"
      s = /^-?\d{1,3}(,\d{3}){2,}$/.test(s) ? s.split(',').join('') : s.replace(',', '.');
    } else if (punkt !== -1) {
      // Nur Punkt: "1.500" / "12.000" sind Tausender, "1500.5" ein Dezimalpunkt
      if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.split('.').join('');
    }

    if ((s.match(/\./g) || []).length > 1) return undefined;
    const zahl = Number(s);
    return Number.isFinite(zahl) ? zahl : undefined;
  }

  /** Zeitstempel -> 'JJJJ-MM-TT' in Ortszeit (so wie <input type="date"> es zeigt). */
  function alsTag(ms) {
    if (ms === null || ms === undefined || ms === '') return '';
    const d = new Date(Number(ms));
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('sv-SE');
  }

  /**
   * 'JJJJ-MM-TT' -> Zeitstempel. Mittags statt Mitternacht, damit der Tag beim
   * Umrechnen nicht ueber eine Zeitzonen- oder Sommerzeitgrenze kippt.
   */
  function ausTag(tag) {
    if (!tag) return null;
    const ms = new Date(`${tag}T12:00:00`).getTime();
    return Number.isNaN(ms) ? undefined : ms;
  }

  const Betrag = { leseBetrag, alsTag, ausTag };
  if (typeof window !== 'undefined') window.Betrag = Betrag;
  if (typeof module !== 'undefined' && module.exports) module.exports = Betrag;
})();
