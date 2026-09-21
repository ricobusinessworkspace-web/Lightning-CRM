/**
 * Kontaktdaten aus einer Firmen-Webseite lesen — Telefon und E-Mail.
 *
 * Reine Textarbeit, kein DOM, keine Netzwerkaufrufe: dieselbe Datei laeuft im
 * Browser und im Test. Wer Seiten holen will, reicht eine Holfunktion herein
 * (`holeKontaktdaten`) — im Browser `window.api.fetchApi`, im Test ein Stummel.
 *
 * Die Regeln stehen hier oben, damit man sie nicht aus dem Code klauben muss:
 *
 *  1. **Fremde Adressen zaehlen nicht.** Eine E-Mail auf der Seite einer
 *     Plattform (Lieferando, Linktree, Facebook, Speisekartenweb …) gehoert der
 *     Plattform. Solche Seiten werden gar nicht erst gelesen.
 *  2. **Nur eigene Domain oder Freemail.** `info@metzgerei-mueller.de` ja,
 *     `metzgerei.mueller@t-online.de` ja — deutsche Kleinbetriebe nutzen das
 *     staendig. `info@webdesign-schmidt.de` im Fusszeilen-Credit: nein.
 *  3. **Die persoenliche Adresse schlaegt die allgemeine.** Steht im Impressum
 *     eine Adresse beim Geschaeftsfuehrer, gewinnt die. Sonst `info@`,
 *     `kontakt@`, `office@` und Verwandte.
 *  4. **Verwaltungsadressen nur als letzte Wahl.** `datenschutz@`, `webmaster@`,
 *     `bewerbung@` sind keine Vertriebsadressen.
 *  5. **Fax ist kein Telefon.** Und `tel:`-Verweise schlagen alles, was nur im
 *     Text steht.
 */
(function () {
  'use strict';

  // ── Listen ────────────────────────────────────────────────────────────────

  // Fremde Seiten, auf denen ein Betrieb nur einen Eintrag hat.
  const PLATTFORMEN = [
    'linktr.ee', 'linktree.com', 'facebook.com', 'instagram.com', 'x.com',
    'twitter.com', 'tiktok.com', 'youtube.com', 'youtu.be', 'pinterest.de',
    'pinterest.com', 'linkedin.com', 'wa.me', 't.me', 'whatsapp.com',
    'google.com', 'google.de', 'goo.gl', 'business.site', 'sites.google.com',
    'lieferando.de', 'lieferservice.de', 'ubereats.com', 'wolt.com',
    'speisekartenweb.de', 'menulist.menu', 'sluurpy.de', 'restaurantguru.com',
    'restaurant-guru.de', 'thefork.de', 'opentable.de', 'quandoo.de',
    'tripadvisor.de', 'tripadvisor.com', 'yelp.de', 'yelp.com',
    'gelbeseiten.de', 'dasoertliche.de', 'das-telefonbuch.de', '11880.com',
    'wlw.de', 'firmenwissen.de', 'northdata.de', 'kununu.com', 'indeed.com',
    'vunyu.com', 'certoblue.top', 'cannanas.club', 'pangaea.app', 'bit.ly',
    // im Bestand aufgetaucht: Verzeichnisse, die eine eigene info@-Adresse
    // haben. Ohne diese Liste landet die Adresse des Verzeichnisses im Lead.
    'speisekarte.de', 'treatwell.de', 'localhours.me', 'ivof.com',
    'lieferando.at', 'mjam.net', 'eventbrite.de', 'doctolib.de', 'jameda.de'
  ];

  // Anbieter, hinter denen kein Betrieb steht: Baukaesten, Hoster, Werkzeuge.
  const FREMDE_ANBIETER = [
    'wix.com', 'wixpress.com', 'jimdo.com', 'jimdo.de', 'wordpress.com',
    'squarespace.com', 'shopify.com', 'webflow.com', 'strato.de', 'ionos.de',
    '1und1.de', 'hostinger.de', 'godaddy.com', 'sentry.io', 'cookiebot.com',
    'borlabs.io', 'usercentrics.com', 'gstatic.com', 'googleapis.com',
    'example.com', 'example.org', 'domain.de', 'ihredomain.de', 'muster.de',
    'sentry.wixpress.com', 'email.com', 'mail.com', 'test.de'
  ];

  // Freemail: gehoert nicht zur Webseite, ist aber trotzdem der Betrieb.
  const FREEMAIL = [
    't-online.de', 'gmx.de', 'gmx.net', 'gmx.at', 'web.de', 'gmail.com',
    'googlemail.com', 'outlook.de', 'outlook.com', 'hotmail.de', 'hotmail.com',
    'live.de', 'yahoo.de', 'yahoo.com', 'aol.com', 'freenet.de', 'arcor.de',
    'posteo.de', 'mailbox.org', 'mail.de', 'online.de', 'icloud.com', 'me.com'
  ];

  // Allgemeine Firmenadressen — das, was in den meisten Faellen da ist.
  const ALLGEMEIN = [
    'info', 'kontakt', 'contact', 'mail', 'email', 'office', 'buero', 'büro',
    'hallo', 'hello', 'anfrage', 'anfragen', 'service', 'post', 'zentrale',
    'empfang', 'reservierung', 'reservierungen', 'bestellung', 'bestellungen',
    'team', 'shop', 'verkauf', 'vertrieb', 'praxis', 'kanzlei', 'restaurant'
  ];

  // Keine Vertriebsadressen — nur, wenn sonst gar nichts da ist.
  const VERWALTUNG = [
    'datenschutz', 'dsgvo', 'privacy', 'webmaster', 'admin', 'administrator',
    'hostmaster', 'postmaster', 'abuse', 'noreply', 'no-reply', 'donotreply',
    'newsletter', 'bewerbung', 'bewerbungen', 'jobs', 'karriere', 'presse',
    'marketing', 'buchhaltung', 'rechnung', 'rechnungen', 'spam', 'impressum'
  ];

  // Wer im Impressum genannt wird — Naehe zu diesen Woertern hebt eine Adresse.
  const CHEF_WOERTER = [
    'geschäftsführer', 'geschaeftsführer', 'geschaeftsfuehrer', 'geschäftsführung',
    'inhaber', 'inhaberin', 'eigentümer', 'vertretungsberechtigt', 'vorstand',
    'betriebsleiter', 'betriebsleitung', 'filialleiter', 'gesellschafter',
    'verantwortlich', 'ansprechpartner'
  ];

  const DATEI_ENDUNGEN = /\.(png|jpe?g|gif|webp|svg|bmp|tiff?|ico|css|js|json|xml|pdf|docx?|zip|woff2?|ttf|eot|mp4|webm|html?|php)$/i;

  // ── Kleinkram ─────────────────────────────────────────────────────────────

  const hostVon = (url) => {
    try { return new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url).hostname.toLowerCase().replace(/^www\./, ''); }
    catch (e) { return ''; }
  };

  // "speisekarte.metzgerei-mueller.de" -> "metzgerei-mueller.de".
  // Zwei Stufen reichen; mehrteilige Endungen (co.uk) bekommen drei.
  const MEHRTEILIGE_ENDUNG = /\.(co|com|org|net|gov|ac)\.[a-z]{2}$/i;
  const hauptDomain = (host) => {
    if (!host) return '';
    const teile = host.split('.');
    const tiefe = MEHRTEILIGE_ENDUNG.test(host) ? 3 : 2;
    return teile.slice(-tiefe).join('.');
  };

  const istPlattform = (url) => {
    const d = hauptDomain(hostVon(url));
    if (!d) return false;
    return PLATTFORMEN.some(p => d === p || d.endsWith('.' + p));
  };

  const istFremderAnbieter = (domain) =>
    FREMDE_ANBIETER.some(p => domain === p || domain.endsWith('.' + p));

  const istFreemail = (domain) => FREEMAIL.indexOf(domain) !== -1;

  // Scripte, Stile und Kommentare fliegen raus — dort stehen Schluessel und
  // Fremdadressen, nie die Adresse des Betriebs.
  const nurInhalt = (html) => String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const ohneTags = (html) => nurInhalt(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  // &#64; &#x40; &amp; und Verwandte zurueckuebersetzen.
  const entitaeten = (text) => String(text || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&commat;/gi, '@')
    .replace(/&period;/gi, '.')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');

  // info(at)firma.de, info [at] firma [dot] de, info@firma punkt de
  const entwirrt = (text) => String(text || '')
    .replace(/\s*[\(\[\{]\s*(at|ät|aet)\s*[\)\]\}]\s*/gi, '@')
    .replace(/\s+(at|ät)\s+/gi, '@')
    .replace(/\s*[\(\[\{]\s*(dot|punkt)\s*[\)\]\}]\s*/gi, '.')
    .replace(/\s+(dot|punkt)\s+/gi, '.');

  // Cloudflare verschleiert mailto-Adressen als Hex-Kette mit XOR-Schluessel
  // im ersten Byte. Kommt auf deutschen Kleinseiten haeufig vor.
  const cloudflareAdressen = (html) => {
    const gefunden = [];
    const muster = /data-cfemail=["']([0-9a-f]+)["']/gi;
    let m;
    while ((m = muster.exec(String(html || ''))) !== null) {
      const hex = m[1];
      try {
        const schluessel = parseInt(hex.substr(0, 2), 16);
        let klar = '';
        for (let i = 2; i < hex.length; i += 2) {
          klar += String.fromCharCode(parseInt(hex.substr(i, 2), 16) ^ schluessel);
        }
        if (klar.indexOf('@') !== -1) gefunden.push(klar);
      } catch (e) { /* kaputte Kette: ueberspringen */ }
    }
    return gefunden;
  };

  const istGueltigeAdresse = (adresse) => {
    if (!adresse || adresse.length > 100) return false;
    const teile = adresse.split('@');
    if (teile.length !== 2) return false;
    const [lokal, domain] = teile;
    if (!lokal || lokal.length > 64 || !domain) return false;
    if (DATEI_ENDUNGEN.test(domain)) return false;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return false;
    if (/^[0-9a-f]{16,}$/i.test(lokal)) return false;     // Hash, kein Mensch
    // Platzhalter aus Formular-Vorlagen: "beispiel@gmail.com" ist keine
    // Adresse, sondern ein Beispiel. Real aufgetaucht bei Lead 15.
    const PLATZHALTER = /^(beispiel|example|muster(mann|frau)?|max[._-]?mustermann|test|testmail|demo|dummy|name|vorname|nachname|ihrname|ihre?[-._]?e?mail|dein[e]?[-._]?e?mail|your[-._]?e?mail|mail|email|user|username|abc|xyz|xxx)$/i;
    if (PLATZHALTER.test(lokal)) return false;
    if (/^(beispiel|example|muster|test|demo|dummy)[.@]/i.test(adresse)) return false;
    if (/@2x/i.test(adresse)) return false;
    return true;
  };

  // ── E-Mail ────────────────────────────────────────────────────────────────

  const ADRESS_MUSTER = /[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;

  /**
   * Alle Adressen einer Seite mit ihrem Umfeld.
   * `quelle`: 'mailto' (aus einem Verweis) oder 'text'.
   */
  function emailKandidaten(html, opt) {
    const mitSkripten = !!(opt && opt.mitSkripten);
    const roh = String(html || '');
    const treffer = [];
    const gesehen = new Set();

    const merke = (adresse, quelle, umfeld) => {
      const sauber = String(adresse || '').trim().toLowerCase()
        .replace(/^mailto:/i, '').split('?')[0].replace(/[.,;:)\]}>"']+$/, '');
      if (!istGueltigeAdresse(sauber)) return;
      const schluessel = sauber + '|' + quelle;
      if (gesehen.has(schluessel)) return;
      gesehen.add(schluessel);
      treffer.push({
        adresse: sauber,
        lokal: sauber.split('@')[0],
        domain: sauber.split('@')[1],
        quelle,
        umfeld: String(umfeld || '').toLowerCase()
      });
    };

    // 1. mailto-Verweise — die sichersten Treffer.
    const mailtoMuster = /href\s*=\s*["']\s*mailto:([^"'>\s]+)/gi;
    let m;
    while ((m = mailtoMuster.exec(roh)) !== null) {
      const umfeld = ohneTags(roh.substring(Math.max(0, m.index - 300), m.index + 300));
      merke(decodeURIComponent(m[1].replace(/&amp;/gi, '&')), 'mailto', umfeld);
    }

    // 2. Von Cloudflare verschleierte Adressen.
    cloudflareAdressen(roh).forEach(a => merke(a, 'mailto', ''));

    // 3. Alles, was im sichtbaren Text steht — auch verschleiert.
    const text = entwirrt(entitaeten(ohneTags(roh)));
    while ((m = ADRESS_MUSTER.exec(text)) !== null) {
      merke(m[0], 'text', text.substring(Math.max(0, m.index - 250), m.index + 250));
    }
    ADRESS_MUSTER.lastIndex = 0;

    // 4. Letzte Zuflucht: Seiten, die ihren Inhalt erst im Browser zusammen-
    //    bauen, tragen die Adresse in einem Skriptblock. Dort steht aber auch
    //    viel Fremdes, deshalb nur auf Nachfrage und mit Abzug in der Wertung.
    if (mitSkripten) {
      const skriptText = entitaeten(roh);
      while ((m = ADRESS_MUSTER.exec(skriptText)) !== null) {
        merke(m[0], 'skript', skriptText.substring(Math.max(0, m.index - 250), m.index + 250));
      }
      ADRESS_MUSTER.lastIndex = 0;
    }

    return treffer;
  }

  /**
   * Die brauchbarste Adresse auswaehlen.
   * Gibt `null` zurueck, wenn nichts uebrig bleibt — lieber keine Adresse als
   * die der Werbeagentur aus der Fusszeile.
   */
  function besteEmail(kandidaten, opt) {
    const o = opt || {};
    const eigene = hauptDomain(hostVon(o.webseite || ''));
    const chefName = String(o.chef || '').toLowerCase();
    const namensTeile = chefName.split(/[\s,.]+/).filter(t => t.length >= 3);

    const bewertet = [];
    (kandidaten || []).forEach(k => {
      const domain = hauptDomain(k.domain);
      if (istFremderAnbieter(domain)) return;              // Baukasten, Hoster
      if (PLATTFORMEN.some(p => domain === p)) return;     // Plattform

      const eigeneDomain = !!eigene && (domain === eigene || k.domain.endsWith('.' + eigene));
      const frei = istFreemail(domain);
      // Fremde Firmendomain: fast immer die Agentur aus der Fusszeile.
      if (!eigeneDomain && !frei) return;

      let punkte = eigeneDomain ? 100 : 40;                // eigene Domain schlaegt Freemail
      if (k.quelle === 'mailto') punkte += 15;             // Verweis statt Fliesstext
      if (k.quelle === 'skript') punkte -= 20;             // aus dem Maschinenraum
      // Im Impressum steht die Adresse des Betriebs. Auf der Startseite kann
      // auch die eines Gastes stehen, der etwas in ein Formular geschrieben hat.
      if (/impressum|imprint|kontakt|contact|legal/i.test(k.seite || '')) punkte += 15;

      const lokal = k.lokal.replace(/[._-]/g, '');
      const istVerwaltung = VERWALTUNG.some(v => k.lokal === v || lokal === v.replace(/-/g, ''));
      const istAllgemein = ALLGEMEIN.some(a => k.lokal === a || lokal === a.replace(/ü/g, 'u'));
      const nahChef = CHEF_WOERTER.some(w => k.umfeld.indexOf(w) !== -1);
      const traegtNamen = namensTeile.some(t => lokal.indexOf(t) !== -1);

      if (istVerwaltung)      punkte -= 60;
      else if (traegtNamen)   punkte += 50;                // heisst wie der Chef
      else if (nahChef && !istAllgemein) punkte += 35;     // steht beim Chef
      else if (istAllgemein)  punkte += 25;                // info@ und Verwandte
      else                    punkte += 5;                 // irgendeine Fachadresse

      bewertet.push({ ...k, punkte, eigeneDomain, istAllgemein, istVerwaltung });
    });

    if (bewertet.length === 0) return null;
    bewertet.sort((a, b) => b.punkte - a.punkte || a.adresse.length - b.adresse.length);
    return bewertet[0];
  }

  // ── Telefon ───────────────────────────────────────────────────────────────

  const NUMMER_MUSTER = /(?:\+49|0049|0)[\s\/\-.]*\d[\d\s\/\-.]{5,22}\d/g;

  const nurZiffern = (s) => String(s || '').replace(/\D/g, '');

  // "+49 (0)3 51 / 21 52 00 60" und "+ 49 351 …" lesbar machen, bevor gesucht
  // wird. Das eingeklammerte (0) ist die haeufigste Falle: es gehoert nicht
  // zur Nummer, steht aber mitten drin.
  const nummernText = (text) => String(text || '')
    .replace(/\(\s*0\s*\)/g, '')
    .replace(/\+\s+(?=\d)/g, '+')
    .replace(/\u00a0/g, ' ');

  /**
   * Eine Nummer auf eine feste Form bringen: `0` + Ziffern, wie es auch im
   * Bestand steht. Liefert null, wenn daraus keine deutsche Rufnummer wird.
   */
  function nummerNormalisieren(roh) {
    const t = nummernText(String(roh || '').replace(/^tel:/i, '').trim());
    let z = nurZiffern(t);
    if (!z) return null;

    // "+49 …", "0049 …", "00 49 (0)3 51 …" — dieselbe Nummer, drei
    // Schreibweisen. Alles wird zur deutschen Form mit fuehrender Null.
    if (z.indexOf('0049') === 0)              z = '0' + z.slice(4);
    else if (/^\+/.test(t) && z.indexOf('49') === 0) z = '0' + z.slice(2);
    else if (/^\+/.test(t))                   return null;   // anderes Land
    else if (z.indexOf('00') === 0)           return null;   // anderes Land
    else if (z.indexOf('0') !== 0)            return null;   // ohne Vorwahl
    z = z.replace(/^0+/, '0');                               // 0049 -> 0

    // 0 + Vorwahl (2-5) + Anschluss (3-9): 9 bis 14 Ziffern.
    if (z.length < 9 || z.length > 14) return null;
    if (!/^0(1[0-9]|[2-9])/.test(z)) return null;
    if (/^(\d)\1+$/.test(z.slice(1))) return null;           // 0000000000
    return z;
  }

  /** Alle Nummern einer Seite, Fax erkannt und aussortiert. */
  function telefonKandidaten(html) {
    const roh = String(html || '');
    const treffer = [];
    const gesehen = new Set();

    const merke = (nummer, quelle, umfeld) => {
      const sauber = nummerNormalisieren(nummer);
      if (!sauber) return;
      if (gesehen.has(sauber)) return;
      const u = String(umfeld || '').toLowerCase();
      // "Fax: 0351 …" — das Wort steht unmittelbar davor, nicht irgendwo
      // sonst auf der Seite.
      const istFax = /fax[^0-9]{0,15}$/i.test(u);
      gesehen.add(sauber);
      treffer.push({ nummer: sauber, ziffern: sauber, quelle, istFax, umfeld: u });
    };

    // 1. tel:-Verweise.
    const telMuster = /href\s*=\s*["']\s*tel:([^"'>\s]+)/gi;
    let m;
    while ((m = telMuster.exec(roh)) !== null) {
      const davor = ohneTags(roh.substring(Math.max(0, m.index - 120), m.index));
      merke(decodeURIComponent(m[1]).replace(/%20/g, ' '), 'tel', davor);
    }

    // 2. Nummern im Text.
    const text = nummernText(ohneTags(roh));
    while ((m = NUMMER_MUSTER.exec(text)) !== null) {
      merke(m[0], 'text', text.substring(Math.max(0, m.index - 60), m.index));
    }
    NUMMER_MUSTER.lastIndex = 0;

    return treffer;
  }

  function besteTelefonnummer(kandidaten) {
    const brauchbar = (kandidaten || []).filter(k => !k.istFax);
    if (brauchbar.length === 0) return null;
    const punkte = (k) => {
      let p = k.quelle === 'tel' ? 50 : 0;
      if (/tel(efon)?[^0-9]{0,15}$/i.test(k.umfeld)) p += 25;
      if (/mobil|handy/i.test(k.umfeld)) p += 5;
      if (/^01[5-7]/.test(k.ziffern)) p += 3;         // Mobilnummer: erreichbar
      return p;
    };
    return brauchbar.slice().sort((a, b) => punkte(b) - punkte(a))[0];
  }

  // ── Unterseiten ───────────────────────────────────────────────────────────

  const UNTERSEITEN_WORT = /(impressum|imprint|kontakt|contact|ueber-uns|über-uns|about|legal)/i;

  /** Verweise auf Impressum und Kontakt, wichtigste zuerst, hoechstens `max`. */
  function impressumLinks(html, basisUrl, max) {
    const grenze = max || 2;
    const roh = nurInhalt(html);
    const gefunden = [];
    const gesehen = new Set();
    const muster = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi;
    let m;
    while ((m = muster.exec(roh)) !== null) {
      const href = entitaeten(m[1]).trim();
      const text = ohneTags(m[2]).trim();
      const wort = UNTERSEITEN_WORT.exec(href) || UNTERSEITEN_WORT.exec(text);
      if (!wort) continue;
      let ziel;
      try { ziel = new URL(href, basisUrl).href; } catch (e) { continue; }
      if (!/^https?:/i.test(ziel)) continue;
      if (hauptDomain(hostVon(ziel)) !== hauptDomain(hostVon(basisUrl))) continue;  // nicht wegfuehren
      const schluessel = ziel.replace(/\/$/, '').toLowerCase();
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      // Impressum zuerst, dann Kontakt, dann der Rest — dort steht die
      // Adresse am wahrscheinlichsten.
      const rang = /impressum|imprint|legal/i.test(wort[1]) ? 0
                 : /kontakt|contact/i.test(wort[1])         ? 1 : 2;
      gefunden.push({ url: ziel, rang });
    }
    gefunden.sort((a, b) => a.rang - b.rang);   // stabil: Reihenfolge der Seite bleibt
    return gefunden.slice(0, grenze).map(x => x.url);
  }

  // ── Der ganze Vorgang ─────────────────────────────────────────────────────

  /**
   * Eine Webseite lesen und Telefon + E-Mail zurueckgeben.
   *
   * `hole(url)` muss `{ ok, text }` liefern — im Browser ueber die eigene
   * Serverfunktion, im Test ein Stummel. Hoechstens drei Seiten pro Betrieb.
   */
  async function holeKontaktdaten(webseite, hole, opt) {
    const o = opt || {};
    const ergebnis = {
      email: null, emailQuelle: null, emailSeite: null,
      telefon: null, telefonQuelle: null, telefonSeite: null,
      seiten: [], grund: null
    };
    if (!webseite) { ergebnis.grund = 'keine-webseite'; return ergebnis; }
    if (istPlattform(webseite)) { ergebnis.grund = 'plattform'; return ergebnis; }

    // Auch eine abweisende Antwort (403, 503) hat oft noch die ganze Seite im
    // Bauch. Verworfen wird erst, wenn wirklich kein Text kommt.
    let abgewiesen = 0, geholt = 0;
    const seiteHolen = async (url) => {
      const a = await hole(url);
      if (a && a.ok) geholt++; else abgewiesen++;
      if (a && a.text && a.text.length > 200) return { url, html: a.text };
      return null;
    };

    const start = /^https?:\/\//i.test(webseite) ? webseite : 'https://' + webseite;
    let erste = await seiteHolen(start);
    ergebnis.seiten.push(start);

    // Zweiter Versuch mit oder ohne "www." — viele Server antworten nur auf
    // eine der beiden Formen.
    if (!erste) {
      const andersHerum = /:\/\/www\./i.test(start)
        ? start.replace(/:\/\/www\./i, '://')
        : start.replace(/:\/\//, '://www.');
      if (andersHerum !== start) {
        erste = await seiteHolen(andersHerum);
        ergebnis.seiten.push(andersHerum);
      }
    }
    if (!erste) { ergebnis.grund = 'nicht-erreichbar'; return ergebnis; }

    const seiten = [erste];
    let ziele = impressumLinks(erste.html, erste.url, 2);
    // Seiten, die ihre Verweise erst im Browser bauen, haben hier nichts —
    // dann die beiden ueblichen Adressen raten.
    if (ziele.length === 0) {
      const wurzel = new URL(erste.url).origin;
      ziele = [wurzel + '/impressum', wurzel + '/kontakt'];
    }
    for (const url of ziele) {
      const seite = await seiteHolen(url);
      ergebnis.seiten.push(url);
      if (seite) seiten.push(seite);
    }

    const waehle = (mitSkripten) => {
      const emails = [];
      const telefone = [];
      seiten.forEach(s => {
        emailKandidaten(s.html, { mitSkripten }).forEach(k => emails.push({ ...k, seite: s.url }));
        telefonKandidaten(s.html).forEach(k => telefone.push({ ...k, seite: s.url }));
      });
      return {
        email: besteEmail(emails, { webseite: erste.url, chef: o.chef }),
        telefon: besteTelefonnummer(telefone)
      };
    };

    let wahl = waehle(false);
    if (!wahl.email) wahl = waehle(true);        // letzte Zuflucht: Skriptblöcke

    if (wahl.email) {
      ergebnis.email = wahl.email.adresse;
      ergebnis.emailQuelle = wahl.email.quelle;
      ergebnis.emailSeite = wahl.email.seite;
    }
    if (wahl.telefon) {
      ergebnis.telefon = wahl.telefon.nummer;
      ergebnis.telefonQuelle = wahl.telefon.quelle;
      ergebnis.telefonSeite = wahl.telefon.seite;
    }
    if (!ergebnis.email && !ergebnis.telefon) {
      // Ehrlich bleiben: "nichts gefunden" heisst etwas anderes als "die Seite
      // hat uns nicht hereingelassen".
      ergebnis.grund = (geholt === 0 && abgewiesen > 0) ? 'seite-blockiert' : 'nichts-gefunden';
    }
    return ergebnis;
  }

  const Kontaktdaten = {
    hostVon, hauptDomain, istPlattform, istFreemail,
    emailKandidaten, besteEmail,
    telefonKandidaten, besteTelefonnummer, nummerNormalisieren,
    impressumLinks, holeKontaktdaten,
    PLATTFORMEN, FREEMAIL, ALLGEMEIN, VERWALTUNG
  };

  if (typeof window !== 'undefined') window.Kontaktdaten = Kontaktdaten;
  if (typeof module !== 'undefined' && module.exports) module.exports = Kontaktdaten;
})();
