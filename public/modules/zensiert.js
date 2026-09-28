/**
 * Zensierter Modus — Kundendaten fuer Bildschirmaufnahmen verdecken.
 *
 * Warum es diese Datei gibt
 * ─────────────────────────
 * Rico nimmt Videos fuer Social Media auf, waehrend er im CRM arbeitet.
 * Namen, Nummern, Adressen und Notizen duerfen darin nicht zu sehen sein —
 * alles andere soll ganz normal weiterlaufen.
 *
 * Deshalb ist das eine reine ANZEIGE-Maske: <html> bekommt die Klasse
 * "zensiert", und styles.css macht markierte Stellen unlesbar (Punkte statt
 * Zeichen, zusaetzlich weichgezeichnet). Die Daten selbst werden nie
 * angefasst — Copy kopiert die echte Nummer, Anrufen waehlt sie, Speichern
 * schreibt, was im Feld steht, Suchen findet wie immer.
 *
 * Markiert wird mit der Klasse "pii" im Markup, dazu feste Felder der
 * Karteikarte ueber ihre id (Liste in styles.css, Abschnitt ZENSIERT).
 *
 * Umschalten: ⌃⇧Z (Ctrl + Shift + Z), das Auge oben rechts, oder dreimal
 * schnell auf das Logo tippen (Handy). Der Zustand bleibt beim Neuladen
 * erhalten — index.html setzt die Klasse schon vor dem ersten Zeichnen,
 * damit beim Neuladen waehrend einer Aufnahme nichts aufblitzt.
 */
(function () {
  'use strict';

  const SCHLUESSEL = 'zensiert';
  const wurzel = document.documentElement;
  const istAn = () => wurzel.classList.contains('zensiert');

  function setzen(an, still) {
    wurzel.classList.toggle('zensiert', an);
    try { localStorage.setItem(SCHLUESSEL, an ? 'an' : 'aus'); } catch (e) { /* privat: dann nur fuer diese Sitzung */ }
    const knopf = document.getElementById('zensiert-knopf');
    if (knopf) {
      knopf.setAttribute('aria-pressed', String(an));
      knopf.title = an ? 'Zensierter Modus an — ⌃⇧Z zum Ausschalten' : 'Zensierter Modus (⌃⇧Z)';
    }
    if (!still && typeof window.showToast === 'function') {
      window.showToast(an ? 'Zensierter Modus an' : 'Zensierter Modus aus');
    }
  }

  const umschalten = () => setzen(!istAn());

  /** Fuer Texte, die nicht im Markup stehen (Meldungen): Name oder neutral. */
  window.anzeigeName = (name, ersatz = 'Lead') => (istAn() ? ersatz : (name || ersatz));

  // ⌃⇧Z — e.key statt e.code, damit es auch auf der deutschen Tastatur Z ist
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && String(e.key).toLowerCase() === 'z') {
      e.preventDefault();
      umschalten();
    }
  }, true);

  function start() {
    setzen(istAn(), true);   // Knopf an den Zustand anpassen, ohne Meldung
    const knopf = document.getElementById('zensiert-knopf');
    if (knopf) knopf.addEventListener('click', umschalten);

    // Handy: dreimal schnell aufs Logo
    const logo = document.querySelector('.drag-header .logo');
    if (logo) {
      let tipps = [];
      logo.addEventListener('click', () => {
        const jetzt = Date.now();
        tipps = tipps.filter(t => jetzt - t < 700);
        tipps.push(jetzt);
        if (tipps.length >= 3) { tipps = []; umschalten(); }
      });
    }
  }

  window.Zensiert = { umschalten, setzen, istAn };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
