/**
 * Die Landkarte — Ansicht für Aufnahmen, nicht fürs Arbeiten.
 *
 * Wofür sie da ist
 * ────────────────
 * Diese Ansicht wird abgefilmt (Kaltakquise-Videos). Deshalb gilt hier eine
 * andere Regel als im Rest der Anwendung:
 *
 *   **Auf der Karte steht kein Kundenname, keine Adresse, keine Nummer.**
 *
 * Ein Blip zeigt die Pipeline-Stufe und sonst nichts. Wer den Lead wirklich
 * braucht, klickt ihn an — dann öffnet sich die Karteikarte in der
 * Seitenleiste, die beim Filmen nicht im Bild ist. Der Schalter „Namen
 * zeigen" hebt das für die eigene Arbeit auf; er steht standardmäßig aus und
 * merkt sich nichts über Sitzungen hinweg hinaus außer der eigenen Wahl.
 *
 * Die Route ist **geschätzt und stilisiert**. Sie fragt bewusst keinen
 * Routendienst: das würde den eigenen Standort und die Koordinaten des Leads
 * an einen Dritten schicken. Gezeichnet wird ein rechtwinkliger Weg im
 * GTA-Gelb, die Zeit kommt aus Luftlinie × Umwegfaktor ÷ Richtgeschwindigkeit.
 * Überall, wo sie auftaucht, steht „ca." davor.
 *
 * Der Spieler-Pfeil steht auf dem eigenen Standort, wenn der Browser ihn
 * hergibt (nur lokal, nichts wird gesendet) — sonst in der Mitte der Karte.
 * Über „Standort setzen" lässt er sich für eine Aufnahme frei platzieren.
 */
(function () {
  'use strict';

  // ── Zustand ───────────────────────────────────────────────────────────────
  let karte = null;
  let blips = [];
  let routenLinien = [];
  let spieler = null;
  let spielerPos = null;
  let standortSetzenAktiv = false;
  let aktiverLead = null;
  let leadsImSpeicher = [];

  const SCHALTER = 'karteNamenZeigen';
  const namenZeigen = () => {
    try { return localStorage.getItem(SCHALTER) === '1'; } catch (e) { return false; }
  };

  const DRESDEN = [51.0504, 13.7372];

  // Farben der Stufen — dieselben wie in der Pipeline, nur kräftiger, damit
  // sie auf dunklem Grund wie Blips wirken.
  const STUFEN = {
    COLD:   { farbe: '#0a84ff', name: 'Cold' },
    PITCH:  { farbe: '#ffd60a', name: 'Pitch' },
    DATA:   { farbe: '#ff9f0a', name: 'Data' },
    OFFER:  { farbe: '#ff453a', name: 'Offer' },
    CLOSED: { farbe: '#30d158', name: 'Kunde' }
  };
  const stufeVon = (l) => {
    const s = (window.api && window.api.getStage) ? window.api.getStage(l) : 'COLD';
    return STUFEN[s] ? s : 'COLD';
  };

  const el = (id) => document.getElementById(id);

  // ── Aufbau ────────────────────────────────────────────────────────────────

  function aufbauen() {
    if (karte) return karte;
    const behaelter = el('map-container');
    if (!behaelter || typeof L === 'undefined') return null;
    behaelter.classList.add('karte-gta');

    karte = L.map('map-container', {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true
    }).setView(DRESDEN, 12);

    // Graue Grundkarte ohne Beschriftung; die GTA-Färbung macht ein
    // CSS-Filter auf der Kachelebene (siehe .karte-gta in styles.css).
    //
    // Esri statt CARTO: CARTO verlangt seit 2025 einen Schlüssel und schreibt
    // sonst "API KEY REQUIRED" quer über jede Kachel. Esri liefert dieselbe
    // dunkle Graustufenkarte ohne Anmeldung.
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: '&copy; Esri, HERE, Garmin, &copy; OpenStreetMap'
    }).addTo(karte);

    // Straßennamen dezent darüber — hilft im Video, ohne aufdringlich zu sein.
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, opacity: 0.7, attribution: ''
    }).addTo(karte);

    L.control.zoom({ position: 'bottomright' }).addTo(karte);

    karte.on('click', (e) => {
      if (standortSetzenAktiv) {
        spielerSetzen(e.latlng.lat, e.latlng.lng);
        standortSetzen(false);
        if (aktiverLead) routeZeichnen(aktiverLead);
        return;
      }
      routeLoeschen();
      aktiverLead = null;
      hudRouteZeigen(null);
    });

    window.map = karte;              // Altbestand greift darauf zu
    hudBauen();
    spielerStarten();
    return karte;
  }

  // ── Blips ─────────────────────────────────────────────────────────────────

  function blipIcon(stufe, gewaehlt) {
    const farbe = STUFEN[stufe].farbe;
    return L.divIcon({
      className: 'karte-blip-huelle',
      iconSize: [gewaehlt ? 22 : 16, gewaehlt ? 22 : 16],
      iconAnchor: [gewaehlt ? 11 : 8, gewaehlt ? 11 : 8],
      html: `<div class="karte-blip${gewaehlt ? ' karte-blip-aktiv' : ''}" style="--blip: ${farbe};"></div>`
    });
  }

  function blipSetzen(l) {
    if (!l.lat || !l.lng) return null;
    const stufe = stufeVon(l);
    const m = L.marker([l.lat, l.lng], {
      icon: blipIcon(stufe, false),
      keyboard: false,
      // Kein title-Attribut: der Browser würde den Namen als Tooltip zeigen.
      riseOnHover: true
    }).addTo(karte);

    m.leadId = l.id;
    m.stufe = stufe;

    m.on('click', () => {
      aktiverLead = l;
      blipsMarkieren(l.id);
      routeZeichnen(l);
      karte.panTo([l.lat, l.lng], { animate: true });
      // Die Karteikarte öffnet sich in der Seitenleiste — dort stehen die
      // echten Daten, nicht auf der Karte.
      if (typeof window.openLead === 'function') window.openLead(l.id);
    });
    m.on('mouseover', () => hudBlipZeigen(l));
    m.on('mouseout', () => hudBlipZeigen(null));

    blips.push(m);
    return m;
  }

  function blipsMarkieren(leadId) {
    blips.forEach(m => m.setIcon(blipIcon(m.stufe, m.leadId === leadId)));
  }

  // ── Spieler ───────────────────────────────────────────────────────────────

  function spielerSetzen(lat, lng) {
    spielerPos = { lat, lng };
    const icon = L.divIcon({
      className: 'karte-spieler-huelle',
      iconSize: [34, 34], iconAnchor: [17, 17],
      html: '<div class="karte-spieler"><div class="karte-spieler-pfeil"></div></div>'
    });
    if (spieler) karte.removeLayer(spieler);
    spieler = L.marker([lat, lng], { icon, zIndexOffset: 1000, interactive: false }).addTo(karte);
  }

  function spielerStarten() {
    // Erst die Mitte der Karte, damit der Pfeil sofort da ist. Der echte
    // Standort kommt nach, wenn der Browser ihn hergibt — er verlässt das
    // Gerät nicht.
    const mitte = karte.getCenter();
    spielerSetzen(mitte.lat, mitte.lng);
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        spielerSetzen(p.coords.latitude, p.coords.longitude);
        if (aktiverLead) routeZeichnen(aktiverLead);
      },
      () => { /* abgelehnt: der Pfeil bleibt in der Mitte */ },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  }

  function standortSetzen(an) {
    standortSetzenAktiv = an;
    const knopf = el('karte-standort-knopf');
    if (knopf) knopf.classList.toggle('karte-hud-an', an);
    const behaelter = el('map-container');
    if (behaelter) behaelter.style.cursor = an ? 'crosshair' : '';
  }

  // ── Route: stilisiert, geschätzt, ohne fremden Dienst ─────────────────────

  const ERDRADIUS = 6371;
  function luftlinieKm(a, b) {
    const bog = (g) => g * Math.PI / 180;
    const dLat = bog(b.lat - a.lat), dLng = bog(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 +
              Math.cos(bog(a.lat)) * Math.cos(bog(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * ERDRADIUS * Math.asin(Math.sqrt(x));
  }

  // Umwegfaktor: Straßen sind länger als die Luftlinie. 1,35 ist der übliche
  // Erfahrungswert für Stadtgebiete.
  const UMWEG = 1.35;
  function fahrzeitMinuten(kmLuftlinie) {
    const km = kmLuftlinie * UMWEG;
    const tempo = km < 5 ? 28 : km < 20 ? 45 : 70;    // km/h, mit Ampeln
    return Math.max(1, Math.round((km / tempo) * 60));
  }

  /**
   * Rechtwinkliger Weg zwischen zwei Punkten — sieht aus wie eine Route durch
   * Straßen, ist aber gezeichnet, nicht berechnet. Der Knick sitzt immer an
   * derselben Stelle pro Lead (aus der Lead-Nummer), damit die Linie nicht bei
   * jedem Klick anders aussieht.
   */
  function wegPunkte(von, nach, streuung) {
    const anteil = 0.35 + ((streuung % 30) / 100);     // 0,35 bis 0,64
    const zwischenLng = von.lng + (nach.lng - von.lng) * anteil;
    const zwischenLat = von.lat + (nach.lat - von.lat) * (1 - anteil);
    return [
      [von.lat, von.lng],
      [von.lat, zwischenLng],
      [zwischenLat, zwischenLng],
      [zwischenLat, nach.lng],
      [nach.lat, nach.lng]
    ];
  }

  function routeLoeschen() {
    routenLinien.forEach(l => karte.removeLayer(l));
    routenLinien = [];
    blipsMarkieren(null);
  }

  function routeZeichnen(lead) {
    if (!karte || !spielerPos || !lead || !lead.lat || !lead.lng) return;
    routeLoeschen();
    blipsMarkieren(lead.id);

    const ziel = { lat: lead.lat, lng: lead.lng };
    const punkte = wegPunkte(spielerPos, ziel, Number(lead.id) || 7);

    // Zwei Linien übereinander: dunkle Fassung als Kante, gelbe darüber —
    // so sieht die Linie in GTA aus.
    routenLinien.push(L.polyline(punkte, {
      color: '#000000', weight: 11, opacity: 0.55, lineJoin: 'round', lineCap: 'round'
    }).addTo(karte));
    routenLinien.push(L.polyline(punkte, {
      className: 'karte-route', color: '#f7c948', weight: 6, opacity: 0.95,
      lineJoin: 'round', lineCap: 'round'
    }).addTo(karte));

    const km = luftlinieKm(spielerPos, ziel);
    hudRouteZeigen({ km: km * UMWEG, minuten: fahrzeitMinuten(km), stufe: stufeVon(lead) });
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  function hudBauen() {
    const huelle = el('map-wrapper');
    if (!huelle || el('karte-hud')) return;

    const hud = document.createElement('div');
    hud.id = 'karte-hud';
    hud.innerHTML = `
      <div class="karte-hud-oben">
        <div class="karte-chips" id="karte-stufen">
          ${['all'].concat(Object.keys(STUFEN)).map(s => `
            <button class="karte-chip${s === 'all' ? ' karte-hud-an' : ''}" data-stufe="${s}"
                    onclick="window.Karte.stufeFiltern('${s}', this)">
              ${s === 'all' ? 'Alle' : `<span class="karte-punkt" style="--blip:${STUFEN[s].farbe}"></span>${STUFEN[s].name}`}
            </button>`).join('')}
        </div>
        <div class="karte-chips">
          <button class="karte-chip${namenZeigen() ? ' karte-hud-an' : ''}" id="karte-namen-knopf"
                  onclick="window.Karte.namenUmschalten(this)">Namen zeigen</button>
          <button class="karte-chip" id="karte-standort-knopf"
                  onclick="window.Karte.standortSetzen()">Standort setzen</button>
        </div>
      </div>

      <div class="karte-hud-unten">
        <div class="karte-legende">
          ${Object.keys(STUFEN).map(s => `
            <span class="karte-legende-eintrag"><span class="karte-punkt" style="--blip:${STUFEN[s].farbe}"></span>${STUFEN[s].name}</span>
          `).join('')}
          <span class="karte-legende-eintrag karte-legende-hinweis" id="karte-anzahl"></span>
        </div>
        <div class="karte-route-karte" id="karte-route-info" style="display:none;">
          <div class="karte-route-zeit" id="karte-route-zeit">—</div>
          <div class="karte-route-strecke" id="karte-route-strecke">—</div>
          <div class="karte-route-fuss">geschätzt · keine echte Navigation</div>
          <button class="karte-chip" onclick="window.Karte.routeLoeschen()">Route löschen</button>
        </div>
        <div class="karte-blip-info" id="karte-blip-info" style="display:none;"></div>
      </div>
    `;
    huelle.appendChild(hud);
  }

  function hudRouteZeigen(daten) {
    const kasten = el('karte-route-info');
    if (!kasten) return;
    if (!daten) { kasten.style.display = 'none'; return; }
    kasten.style.display = 'block';
    const zeit = el('karte-route-zeit');
    const strecke = el('karte-route-strecke');
    if (zeit) zeit.textContent = 'ca. ' + daten.minuten + ' Min';
    if (strecke) strecke.textContent = 'ca. ' + daten.km.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' km';
  }

  // Beim Überfahren: Stufe, und nur mit ausdrücklichem Schalter der Name.
  function hudBlipZeigen(lead) {
    const kasten = el('karte-blip-info');
    if (!kasten) return;
    if (!lead) { kasten.style.display = 'none'; return; }
    const stufe = stufeVon(lead);
    const entfernung = spielerPos
      ? ' · ca. ' + fahrzeitMinuten(luftlinieKm(spielerPos, { lat: lead.lat, lng: lead.lng })) + ' Min'
      : '';
    const name = namenZeigen() && lead.name
      ? `<span class="karte-blip-name">${String(lead.name).replace(/[<>&"]/g, '')}</span>` : '';
    kasten.style.display = 'block';
    kasten.innerHTML = `<span class="karte-punkt" style="--blip:${STUFEN[stufe].farbe}"></span>${STUFEN[stufe].name}${entfernung}${name}`;
  }

  // ── Öffentliche Wege ──────────────────────────────────────────────────────

  window.loadMapData = async function (filters = { all: true }) {
    if (!aufbauen()) return;
    // Wird die Karte aufgebaut, während ihr Behälter noch versteckt ist, misst
    // Leaflet null Pixel und zeichnet nichts. Ein Nachmessen kostet nichts.
    setTimeout(() => { try { karte.invalidateSize(); } catch (e) {} }, 60);
    const alle = (await window.api.getLeads(filters)).filter(l => l.status === 'Lead' || l.status === 'Kunde');
    leadsImSpeicher = alle;

    blips.forEach(m => karte.removeLayer(m));
    blips = [];

    const stufenFilter = window.store.state.currentMapStatusFilter || 'all';
    let gesetzt = 0;
    alle.forEach(l => {
      if (stufenFilter !== 'all' && stufeVon(l) !== stufenFilter) return;
      if (blipSetzen(l)) gesetzt++;
    });
    window.mapMarkers = blips;
    const anzahl = el('karte-anzahl');
    if (anzahl) anzahl.textContent = gesetzt + ' Blips';
  };

  window.flyToMap = async (id) => {
    if (typeof window.switchTab === 'function') await window.switchTab('map');
    if (typeof window.openLead === 'function') await window.openLead(id);
    setTimeout(() => {
      if (!karte) return;
      const m = blips.find(x => x.leadId === id);
      const lead = leadsImSpeicher.find(x => x.id === id);
      if (m) {
        karte.flyTo(m.getLatLng(), 15, { duration: 1.2 });
        if (lead) { aktiverLead = lead; routeZeichnen(lead); }
      }
    }, 150);
  };

  window.setMapStatusFilter = (val, knopf) => window.Karte.stufeFiltern(val, knopf);
  window.setMapUserFilter = () => {};      // Zuweisung spielt im Einzelplatz keine Rolle

  window.Karte = {
    aufbauen,
    routeLoeschen: () => { routeLoeschen(); aktiverLead = null; hudRouteZeigen(null); },
    stufeFiltern: (stufe, knopf) => {
      window.store.state.currentMapStatusFilter = stufe;
      const gruppe = el('karte-stufen');
      if (gruppe) gruppe.querySelectorAll('.karte-chip').forEach(b => b.classList.remove('karte-hud-an'));
      if (knopf) knopf.classList.add('karte-hud-an');
      window.loadMapData();
    },
    namenUmschalten: (knopf) => {
      const neu = !namenZeigen();
      try { localStorage.setItem(SCHALTER, neu ? '1' : '0'); } catch (e) {}
      if (knopf) knopf.classList.toggle('karte-hud-an', neu);
    },
    standortSetzen: () => standortSetzen(!standortSetzenAktiv),
    // Für Prüfungen: die Rechenwege ohne Karte
    luftlinieKm, fahrzeitMinuten, wegPunkte, STUFEN
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { luftlinieKm, fahrzeitMinuten, wegPunkte, STUFEN };
  }
})();
