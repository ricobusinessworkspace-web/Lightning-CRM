document.addEventListener('DOMContentLoaded', async () => {

  // STARTUP SPLASH ANIMATION
  setTimeout(() => {
    const splash = document.getElementById('startup-splash');
    if (splash) {
      splash.classList.add('splash-hidden');
      setTimeout(() => splash.remove(), 600);
    }
  }, 1500);

  const qList = document.getElementById('queue-container');
  const sidebar = document.querySelector('.sidebar');
  const chipContainer = document.getElementById('chip-container');
  
  let currentFilter1 = 'all';
  let currentFilter2 = 'all';
  let currentSearch = '';
  let currentTab = 'queue';

  let currentSnoozeOffset = 0; 
  let currentSnoozeTargetMs = 0; 
  let isTaskMode = false;
  let isKundeMode = false;
  window._currentSelectedLeadId = null;
  window._activeSessionId = null;

  let isBulkMode = false;
  let selectedBulkIds = new Set();

  window.toggleBulkMode = () => {
      isBulkMode = !isBulkMode;
      selectedBulkIds.clear();
      const btn = document.getElementById('bulk-mode-btn');
      if (btn) {
          if (isBulkMode) {
              btn.innerText = 'Auswahl abbrechen';
              btn.style.borderColor = 'var(--text-main)';
              btn.style.color = 'var(--text-main)';
          } else {
              btn.innerText = 'Mehrfachauswahl';
              btn.style.borderColor = 'var(--border)';
              btn.style.color = 'var(--text-muted)';
              document.getElementById('bulk-action-bar').style.display = 'none';
          }
      }
      loadUi();
  };

  window.handleLeadClick = (id) => {
      if (isBulkMode) {
          if (selectedBulkIds.has(id)) {
              selectedBulkIds.delete(id);
          } else {
              selectedBulkIds.add(id);
          }
          updateBulkUI();
          loadUi();
      } else {
          openLead(id);
      }
  };

  window.updateBulkUI = () => {
      const bar = document.getElementById('bulk-action-bar');
      if(!bar) return;
      if (selectedBulkIds.size > 0) {
          bar.style.display = 'flex';
          const cnt = document.getElementById('bulk-count');
          if(cnt) cnt.innerText = `${selectedBulkIds.size} Leads ausgewählt`;
      } else {
          bar.style.display = 'none';
      }
  };

  window.executeBulkDelete = async () => {
      if (selectedBulkIds.size === 0) return;
      if (confirm(`Wirklich ${selectedBulkIds.size} Leads unwiderruflich löschen?`)) {
          await window.api.deleteLeads(Array.from(selectedBulkIds));
          toggleBulkMode(); // exits bulk mode and reloads
          sidebar.innerHTML = `<div class="empty-state">Nächsten Lead wählen</div>`;
          showToast("Leads in Bulk gelöscht!");
      }
  };

  window.getLeadStatusMap = (l) => {
    let res = { color: 'p-kalt', label: 'Kalt', mapPin: 'pin-kalt' };
    if (l.status === 'Kunde') res = { color: 'p-kunde', label: 'Kunde', mapPin: 'pin-kunde' };
    else if (l.rechnung) res = { color: 'p-rechnung', label: 'Rechnung', mapPin: 'pin-rechnung' };
    else if (l.termin) res = { color: 'p-termin', label: 'Termin', mapPin: 'pin-termin' };
    else if (l.entscheider) res = { color: 'p-entscheider', label: 'Entscheider', mapPin: 'pin-entscheider' };
    
    res.isTask = (typeof l.task_text === 'string' && l.task_text.trim() !== '');
    return res;
  };

  let map = null;
  let mapMarkers = [];

  function initMap() {
    if (map) return;
    map = L.map('map-container').setView([51.165691, 10.451526], 6);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CartoDB',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);
  }

  async function loadMapData(filters = { all: true }) {
    if (!map) initMap();
    const leads = await window.api.getLeads(filters);
    mapMarkers.forEach(m => map.removeLayer(m));
    mapMarkers = [];
    let count = 0;
    leads.forEach(l => {
      if (l.lat && l.lng) {
        count++;
        const pinClass = getLeadStatusMap(l).mapPin;

        const icon = L.divIcon({ className: 'scout-marker', iconSize: [14, 14], iconAnchor: [7, 7], html: `<div class="map-pin ${pinClass}"></div>` });
        const popupHtml = `
          <div style="margin-bottom:12px;">
            <div style="font-weight:600; font-size:15px; margin-bottom:4px; color:var(--text-main);">${l.name}</div>
            <div style="font-size:12px; color:var(--text-muted);">📍 ${l.maps_city || 'Unbekannt'}</div>
          </div>
          <div style="display:flex; gap:6px; flex-direction:column;">
            <button onclick="handleLinkClick(event, 'web', '${l.website_url||''}', ${l.id})" class="action-btn-small outline" style="width:100%; border-color:var(--border); color:var(--text-main); padding:6px; font-size:11px;" title="Cmd+Klick = URL bearbeiten">🌐 Zur Website</button>
            <button onclick="handleLinkClick(event, 'maps', '${l.google_maps_url||''}', ${l.id})" class="action-btn-small outline" style="width:100%; border-color:var(--border); color:var(--text-main); padding:6px; font-size:11px;" title="Cmd+Klick = URL bearbeiten">🗺️ In Google Maps öffnen</button>
          </div>
        `;
        const m = L.marker([l.lat, l.lng], {icon}).addTo(map).bindPopup(popupHtml);
        m.on('click', () => {
          map.setView([l.lat, l.lng], 16, { animate: true });
          document.getElementById('map-sidebar').style.display = 'none';
          document.getElementById('main-sidebar').style.display = 'flex';
          openLead(l.id);
        });
        m.leadId = l.id;
        mapMarkers.push(m);
      }
    });
    console.log("Loaded map markers:", count);
  }

  let playerMarker = null;
  let isFlyingToLead = false;

  let playerLocated = false;
  async function locatePlayer() {
    if (playerLocated) return;
    
    const placePin = (lat, lng, label) => {
      playerLocated = true;
      if(playerMarker) map.removeLayer(playerMarker);
      const icon = L.divIcon({ className: 'gta-player-marker', iconSize: [20, 20], iconAnchor: [10, 10], html: `<div class="player-arrow"></div>` });
      playerMarker = L.marker([lat, lng], {icon, zIndexOffset: 2000}).addTo(map).bindPopup(`<strong style="color:#000;">${label}</strong>`);
      if (!isFlyingToLead && map) map.setView([lat, lng], 11, { animate: true, duration: 2 });
    };

    const doIpFallback = async () => {
      try {
        const r = await fetch('https://ipapi.co/json/');
        const d = await r.json();
        if (d.latitude && d.longitude) {
          placePin(parseFloat(d.latitude), parseFloat(d.longitude), `Dein Hub 📍 (${d.city || 'IP-Basis'})`);
        } else {
          placePin(51.165, 10.451, 'Dein Hub 📍');
        }
      } catch(e) { placePin(51.165, 10.451, 'Dein Hub 📍'); }
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        pos => placePin(pos.coords.latitude, pos.coords.longitude, 'Dein Hub (GPS) 📍'),
        err => {
           if (err.code === err.PERMISSION_DENIED) {
              console.warn("macOS blockiert das GPS Signal für Entwickler-Apps (npm start).");
           }
           doIpFallback();
        },
        { timeout: 10000, enableHighAccuracy: true, maximumAge: 0 }
      );
    } else {
      doIpFallback();
    }
  }

  async function autoGeocode() {
    const leads = await window.api.getLeads({ all: true });
    const toGeocode = leads.filter(l => l.maps_city && (!l.lat || !l.lng));
    
    if (toGeocode.length === 0) return;
    console.log(`Auto-geocoding ${toGeocode.length} leads...`);

    for (const l of toGeocode) {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(l.maps_city)}`, {
          headers: { 'Accept-Language': 'de-DE' }
        });
        const data = await res.json();
        if (data && data.length > 0) {
          l.lat = parseFloat(data[0].lat);
          l.lng = parseFloat(data[0].lon);
          await window.api.saveLead(l);
          console.log(`Geocoded: ${l.name} -> ${l.lat}, ${l.lng}`);
          await loadMapData();
        }
        // Respect rate limits (1 request per second for Nominatim)
        await new Promise(r => setTimeout(r, 1100));
      } catch (e) {
        console.error(`Geocoding failed for ${l.name}`, e);
      }
    }
  }

  window.flyToMap = async (id) => {
    isFlyingToLead = true;
    await switchTab('map');
    
    setTimeout(() => {
      if(map) {
         const m = mapMarkers.find(x => x.leadId === id);
         if (m) {
           const pos = m.getLatLng();
           map.flyTo(pos, 14, { duration: 1.5 });
           setTimeout(() => m.openPopup(), 1500);
         }
      }
      setTimeout(() => { isFlyingToLead = false; }, 2000);
    }, 100);
  };

  window.switchTab = async (tab) => {
    currentTab = tab;
    
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`nav-${tab}`).classList.add('active');
    
    document.getElementById('map-wrapper').style.display = tab === 'map' ? 'block' : 'none';
    document.getElementById('main-sidebar').style.display = tab === 'map' ? 'none' : 'flex';
    document.getElementById('map-sidebar').style.display = tab === 'map' ? 'flex' : 'none';
    document.querySelector('.main-content').style.display = tab === 'map' ? 'none' : 'block';

    if (tab === 'map') {
      setTimeout(() => { if (map) map.invalidateSize(); }, 100);
      locatePlayer();
    }
    
    document.getElementById('qa-container').style.display = tab === 'queue' ? 'flex' : 'none';
    document.getElementById('filters-container').style.display = 'flex'; 
    
    sidebar.innerHTML = `<div class="empty-state">Nächsten Lead wählen</div>`;
    
    currentFilter1 = 'all';
    currentFilter2 = 'all';
    if (tab === 'tasks') currentFilter1 = 'all'; // Default for tasks is 'all' which means Kunden/Pipeline

    currentSearch = ''; 
    if(document.getElementById('search-input')) document.getElementById('search-input').value = '';
    
    await loadUi();
  };

  async function loadUi() {
    renderFilterButtons();
    const filters = { 
      tab: currentTab, 
      search: currentSearch,
      filter1: currentFilter1,
      filter2: currentFilter2
    };

    if (currentTab === 'map') {
      await loadMapData(filters);
    } else {
      const leads = await window.api.getLeads(filters);
      renderQueue(leads);
    }
  }

  function renderFilterButtons() {
    const group1 = document.getElementById('filter-group-1');
    const group2 = document.getElementById('filter-group-2');
    if (!group1 || !group2) return;

    let opts1 = [];
    let opts2 = [
      { id: 'all', label: 'Alle' },
      { id: 'großkunde', label: 'Großkunde' },
      { id: 'tarifkunde', label: 'Tarifkunde' }
    ];

    if (currentTab === 'queue') {
      opts1 = [
        { id: 'all', label: 'Alle' },
        { id: 'rechnung', label: 'Rechnung' },
        { id: 'termin', label: 'Termin' },
        { id: 'entscheider', label: 'Entscheider' },
        { id: 'kalt', label: 'Kalt' }
      ];
    } else if (currentTab === 'tasks') {
      opts1 = [
        { id: 'all', label: 'Alle' },
        { id: 'kunden', label: 'Kunde' },
        { id: 'rechnung', label: 'Rechnung' },
        { id: 'termin', label: 'Termin' },
        { id: 'entscheider', label: 'Entscheider' }
      ];
    } else if (currentTab === 'map') {
      opts1 = [
        { id: 'all', label: 'Alle' },
        { id: 'kunden', label: 'Kunde' },
        { id: 'rechnung', label: 'Rechnung' },
        { id: 'termin', label: 'Termin' },
        { id: 'entscheider', label: 'Entscheider' },
        { id: 'kalt', label: 'Kalt' }
      ];
    }

    group1.innerHTML = opts1.map(o => `
      <button class="chip ${currentFilter1 === o.id ? 'active' : ''}" onclick="setFilter(1, '${o.id}')">${o.label}</button>
    `).join('');

    group2.innerHTML = opts2.map(o => `
      <button class="chip ${currentFilter2 === o.id ? 'active' : ''}" onclick="setFilter(2, '${o.id}')">${o.label}</button>
    `).join('');
  }

  window.setFilter = (group, filterName) => {
    if (group === 1) currentFilter1 = filterName;
    else currentFilter2 = filterName;
    loadUi();
  };

  window.handleSearch = (e) => {
    currentSearch = e.target.value.trim();
    loadUi();
  };

  function renderQueue(leads) {
    if(!leads || leads.length === 0) {
      let stateMsg = "Verdammt leer hier. Ausgezeichnet!";
      if (currentSearch) stateMsg = `Kein Lead für "${currentSearch}" gefunden.`;
      qList.innerHTML = `<div class="empty-state">${stateMsg}</div>`;
      return;
    }
    
    let tabTitle = currentTab === 'queue' ? 'Queue' : (currentTab === 'tasks' ? 'Aufgaben' : 'Radar');
    if (currentSearch) tabTitle = `Globale Suche: "${currentSearch}"`;

    let activeLeads = leads;
    let snoozedLeads = [];

    if (currentTab === 'queue' && currentFilter1 === 'all' && !currentSearch) {
      activeLeads = leads.filter(l => (l.snooze_until_ms || 0) <= Date.now());
      snoozedLeads = leads.filter(l => (l.snooze_until_ms || 0) > Date.now());
    }

    const renderLeadList = (list) => list.map(l => {
        const sMap = getLeadStatusMap(l);
        let titleColor = sMap.color;
        let milestone = sMap.label;
        let extraBadge = '';

        if (sMap.isTask) {
           milestone += ' +';
           if (l.task_text) {
              let parsedText = l.task_text;
              if (parsedText.startsWith('[')) {
                 try { 
                   let arr = JSON.parse(parsedText).filter(t => !t.done);
                   parsedText = arr.length > 0 ? arr[0].text + (arr.length > 1 ? ` (+${arr.length-1})` : '') : '';
                 } catch(e) {}
              }
              if (parsedText) {
                extraBadge = `<div style="padding-top:2px; font-size:13px; font-weight:500; color:var(--text-light); white-space:normal; line-height:1.4;">${parsedText}</div>`;
              }
           }
        } else if (l.status === 'Kunde' && l.maps_city) {
          extraBadge = `<div class="task-badge">${l.maps_city}</div>`;
        }

        let opacityStyle = (l.snooze_until_ms > Date.now() && currentTab !== 'queue') ? 'opacity: 0.55;' : '';
        let bulkStyle = (isBulkMode && selectedBulkIds.has(l.id)) ? 'outline: 2px solid var(--accent);' : '';
        let cboxHtml = isBulkMode ? `<input type="checkbox" style="position:absolute; top:12px; right:12px; pointer-events:none; transform:scale(1.2);" ${selectedBulkIds.has(l.id) ? 'checked' : ''}>` : '';

        return `
        <div class="lead-card ${window._currentSelectedLeadId === l.id ? 'active-lead-card' : ''}" style="${opacityStyle} ${bulkStyle}" onclick="handleLeadClick(${l.id})" id="lead-card-${l.id}">
          <div class="lead-prio ${titleColor}">${milestone}</div>
          <div class="lead-name">${l.name}</div>
          <div class="lead-phone">${l.phone || 'Keine Nummer'}</div>
          ${extraBadge}
          ${cboxHtml}
        </div>
        `;
    }).join('');

    qList.innerHTML = `
      <div class="list-header" style="display:flex; align-items:center; ${currentSearch ? 'color: var(--accent);' : ''}">${tabTitle} (${activeLeads.length})</div>
      <div class="leads-grid">
        ${renderLeadList(activeLeads)}
      </div>
      
      ${snoozedLeads.length > 0 ? `
        <div class="list-header" style="margin-top:32px; opacity:0.6;">Zukünftig (Snoozed) (${snoozedLeads.length})</div>
        <div class="leads-grid" style="opacity: 0.6;">
          ${renderLeadList(snoozedLeads)}
        </div>
      ` : ''}
    `;
  }

  window.openLead = async (id) => {
    window._currentSelectedLeadId = id;
    document.querySelectorAll('.lead-card').forEach(c => c.classList.remove('active-lead-card'));
    const card = document.getElementById(`lead-card-${id}`);
    if (card) card.classList.add('active-lead-card');

    // Use current search and filters to get the lead, but fallback to a global search if not found
    let l = null;
    try {
      const leads = await window.api.getLeads({ 
        search: currentSearch || '', 
        tab: currentTab, 
        filter1: currentFilter1, 
        filter2: currentFilter2 
      }); 
      l = leads.find(x => x.id === id);
    } catch (e) {}

    if (!l) {
      const fullList = await window.api.getLeads({ all: true }); 
      l = fullList.find(x => x.id === id);
    }
    if(!l) return;

    currentSnoozeOffset = 0;
    currentSnoozeTargetMs = 0;
    isTaskMode = false;
    isKundeMode = false;

    let actionButtons = '';
    const isKunde = l.status === 'Kunde';
    const isSnoozed = l.snooze_until_ms > Date.now();
    
    // Convert generic string tasks into our new Reminders array structure
    window.currentTasks = [];
    if (l.task_text) {
      if (l.task_text.startsWith('[')) {
        try { window.currentTasks = JSON.parse(l.task_text); } catch(e) {}
      } else {
        window.currentTasks = [{ id: Date.now(), text: l.task_text, done: false }];
      }
    }

    // --- Snooze Block (Native) ---
    let snoozeHtml = `
      <div style="margin-top: 16px;">
        <label style="font-size:12px; color:var(--text-muted); margin-bottom:8px; display:block; font-weight:600;">Follow-Up (Snooze)</label>
        <div class="snooze-grid" id="snooze-group">
          <button class="action-btn snooze-opt ${currentSnoozeOffset === 1 ? 'outline' : ''}" id="snz-1" onclick="selectSnooze(1)">+1h</button>
          <button class="action-btn snooze-opt ${currentSnoozeOffset === 24 ? 'outline' : ''}" id="snz-24" onclick="selectSnooze(24)">+24h</button>
        </div>
        ${isSnoozed ? `<div style="margin-top: 12px; text-align: center;"><button class="action-btn-small" style="border:1px dashed #ff453a; color:#ff453a; background:transparent; width:100%; padding: 8px;" onclick="cancelSnooze(${l.id})">Snooze aufheben</button></div>` : ''}
      </div>
    `;

    // --- Google Calendar & Follow Up Block ---
    let calendarHtml = `
      <div style="margin-top: 16px; display: flex; flex-direction: column; gap: 8px;">
        <label style="font-size:12px; color:var(--text-muted); margin-bottom:4px; display:block; font-weight:600;">Kalender-Einträge (GCal)</label>
        <div style="display:flex; gap: 8px;">
          <button class="action-btn-small outline" style="flex:1; padding: 10px;" onclick="openGoogleCalendar(${l.id}, 'nachgreifen')">Nachgreifen</button>
          <button class="action-btn-small" style="flex:1; padding: 10px; background: #0a84ff; color:#fff; border:none;" onclick="openGoogleCalendar(${l.id}, 'termin')">Termin</button>
        </div>
      </div>
    `;

    let umsatzHtml = ``;
    if (isKunde) {
      umsatzHtml = `
        <div id="kunde-creation-container" style="margin-top: 16px;">
          <label style="font-size:12px; color:var(--success); margin-bottom:4px; display:block; font-weight:600;">Umsatz / Deal-Value (€)</label>
          <input type="number" id="umsatz-input" class="modern-input-small" style="width:100%; border-color: var(--success); font-weight: 700; color:var(--success);" value="${l.umsatz || ''}" />
        </div>
      `;
    }

    const e = l.entscheider || 0;
    const t = l.termin || 0;
    const r = l.rechnung || 0;

    sidebar.innerHTML = `
      <div class="focused-lead">
        <!-- HEADER ROW: Unternehmen + Pin -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 4px;">
           <div id="sys-name" class="focused-name" contenteditable="true" style="outline:none; padding:4px 0; max-width:85%; border-bottom:1px solid transparent; transition:0.2s;" onfocus="this.style.borderBottom='1px solid var(--accent)';" onblur="this.style.borderBottom='1px solid transparent';">${l.name}</div>
           <button class="action-btn-small" style="background:transparent; border:none; font-size:20px; cursor:pointer; padding:0;" onclick="handlePinClick(${l.id})" title="Auf Karte anzeigen">📍</button>
        </div>
        
        <!-- SUB-HEADER ROW: Nummer + Phone -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 24px;">
           <input type="text" id="sys-phone" style="font-family:ui-monospace, monospace; font-size:15px; font-weight:500; padding:4px 0; background:transparent; border:none; border-bottom:1px solid transparent; outline:none; transition:0.2s; color:var(--text-muted); flex: 1; margin-right: 16px;" value="${l.phone || ''}" placeholder="Keine Nummer" onfocus="this.style.borderBottom='1px solid var(--accent)';" onblur="this.style.borderBottom='1px solid transparent';">
           <button class="action-btn-small" style="background:transparent; border:none; font-size:20px; cursor:pointer; padding:0;" onclick="startCallTracking(${l.id})" title="Anrufen starten">📞</button>
        </div>

        <hr style="border:0; border-bottom: 1px solid var(--border); margin-bottom: 24px;" />

        <div class="actions">
          <!-- PIPELINE -->
          <input type="hidden" id="sys-e" value="${e}">
          <input type="hidden" id="sys-t" value="${t}">
          <input type="hidden" id="sys-r" value="${r}">
          
          <input type="hidden" id="sys-web" value="${l.website_url||''}">
          <input type="hidden" id="sys-placeid" value="${l.google_place_id||''}">
          <input type="hidden" id="sys-lat" value="${l.lat||''}">
          <input type="hidden" id="sys-lng" value="${l.lng||''}">
          <input type="hidden" id="sys-city" value="${l.maps_city||''}">

          <div class="pipeline-bar">
            <div id="seg-1" class="pipe-seg ${e || t || r ? 'active-blue' : ''}" onclick="setPipeline('e')">Entscheider</div>
            <div id="seg-2" class="pipe-seg ${t ? 'active-orange' : ''}" onclick="setPipeline('t')">Termin</div>
            <div id="seg-3" class="pipe-seg ${r ? 'active-red' : ''}" onclick="setPipeline('r')">Rechnung</div>
          </div>

          <label style="font-size:12px; color:var(--text-muted); margin-bottom:4px; display:block;">Kundengröße</label>
          <select id="m-size" class="modern-input-small" style="margin-bottom: 24px; width: 100%;">
            <option value="Tarifkunde" ${l.size === 'Tarifkunde' ? 'selected' : ''}>Tarifkunde</option>
            <option value="Großkunde" ${l.size === 'Großkunde' ? 'selected' : ''}>Großkunde</option>
          </select>
          
          <textarea id="note-input" class="modern-input" placeholder="Notizen..." style="width: 100%; box-sizing: border-box; min-height: 80px; margin-bottom:16px;">${l.notes || ''}</textarea>

          <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
            <label style="font-size:12px; color:var(--text-muted); margin-bottom:8px; display:block; font-weight:600;">Aufgaben</label>
            <div id="tasks-list" style="display:flex; flex-direction:column; gap:8px; margin-bottom:8px;"></div>
            <input type="text" id="new-task-input-rem" class="modern-input-small" style="width:100%; box-sizing:border-box; border:none; border-bottom:1px solid var(--border); border-radius:0; padding:8px 0; background:transparent;" placeholder="+ Aufgabe hinzufügen..." onkeypress="handleNewTaskKeyPress(event)" />
          </div>
          
          ${snoozeHtml}
          ${calendarHtml}
          ${umsatzHtml}
          
          <div id="kunde-creation-container" style="display:${!isKunde && isKundeMode ? 'block' : 'none'}; margin-top: 16px;">
            <label style="font-size:12px; color:var(--success); margin-bottom:4px; display:block; font-weight:600;">Umsatz eintragen (€)</label>
            <input type="number" id="umsatz-input-new" class="modern-input-small" style="width:100%; border-color: var(--success); font-weight: 700; color:var(--success);" placeholder="Umsatz..." />
          </div>

          ${!isKunde && !isKundeMode ? `
            <div style="margin-top: 16px; display: flex; justify-content: space-between; gap: 8px;" id="kunde-toggle-btn-container">
              <button class="action-btn-small" style="color:var(--success); border-color:var(--success); flex:1;" id="btn-kunde-toggle" onclick="prepareKundeModeReminders()">Als Kunde abschliessen</button>
            </div>
          ` : ''}

          <div id="main-save-btn-container">
             <button class="action-btn success-bold" id="main-save-btn" style="width:100%; margin-top: 24px; padding: 14px; font-size:15px;" onclick="saveLeadMain(${l.id})">Speichern</button>
          </div>
          
          <div style="margin-top: 16px; text-align: center;">
            <button class="action-btn-small" style="border:none; color:var(--text-muted); background:transparent;" onclick="deleteLead(${l.id})">Löschen</button>
          </div>
        </div>
      </div>
    `;
    
    renderTasksList();
  };

  // --- NEW FEATURES: Pin Click, Call Tracking & Calendar ---
  
  window.handlePinClick = async (id) => {
    const l = (await window.api.getLeads({all:true})).find(x => x.id === id);
    if (!l) return;
    
    if (l.lat && l.lng) {
      // Switch to Map tab, which handles hiding the main sidebar and showing the map sidebar correctly
      if (currentTab !== 'map') await switchTab('map');
      if (window.flyToMap) flyToMap(id);
    } else {
      // Show enrichment popover
      await showEnrichmentPopover(l);
    }
  };

  window.showEnrichmentPopover = async (l) => {
    // Check if popover exists, remove it if it does
    let p = document.getElementById('fetch-preview-popover');
    if (p) p.remove();
    
    p = document.createElement('div');
    p.id = 'fetch-preview-popover';
    p.className = 'fetch-preview-popover';
    p.innerHTML = `<div style="font-size:13px; font-weight:600; margin-bottom:8px;">🔍 Suche Daten für "${l.name}"...</div><div class="empty-state" style="height:auto;">Anfrage läuft...</div>`;
    document.body.appendChild(p);

    const term = l.name;
    const city = l.maps_city || '';
    const apiKey = localStorage.getItem('googlePlacesApiKey') || '';
    let html = `<div style="font-size:13px; font-weight:600; margin-bottom:12px;">Wähle den korrekten Eintrag für "${term}":</div>`;
    let found = false;

    try {
      if (apiKey) {
        const url = 'https://places.googleapis.com/v1/places:searchText';
        let queryStr = term;
        if (city) queryStr += ` in ${city}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.location,places.googleMapsUri,places.id'
          },
          body: JSON.stringify({ textQuery: queryStr, pageSize: 5 })
        });
        const data = await res.json();
        if (data.places && data.places.length > 0) {
           found = true;
           data.places.forEach(item => {
              let address = item.formattedAddress || '';
              let phone = item.nationalPhoneNumber || '';
              html += `<div style="padding:10px; background:var(--bg); border:1px solid var(--border); border-radius:6px; margin-bottom:8px; cursor:pointer;" onclick="selectEnrichment(${l.id}, ${item.location.latitude}, ${item.location.longitude}, '${encodeURIComponent(item.displayName?.text || '')}', '${encodeURIComponent(phone)}', '${encodeURIComponent(item.websiteUri || '')}', '${encodeURIComponent(address)}', '${item.id}')">
                <div style="font-weight:600; font-size:13px; color:var(--text-main); margin-bottom:4px;">${item.displayName?.text || 'Unbekannt'}</div>
                <div style="font-size:11px; color:var(--text-muted);">${address}</div>
                ${phone ? `<div style="font-size:11px; color:var(--text-muted); margin-top: 4px;">📞 ${phone}</div>` : ''}
              </div>`;
           });
        }
      } else {
        // Nominatim Flow
        let queryStr = term;
        if (city) queryStr += `, ${city}`;
        const q = encodeURIComponent(queryStr);
        const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&addressdetails=1&extratags=1&limit=5`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'de-DE', 'User-Agent': 'CallingStationLeadScout/1.0 (info@callingstation.com)' } });
        const data = await res.json();
        
        if(data && data.length > 0) {
           found = true;
           data.forEach(item => {
              let name = item.name || (item.display_name ? item.display_name.split(',')[0] : 'Unbekannt');
              let phone = item.extratags?.phone || item.extratags?.['contact:phone'] || '';
              let website = item.extratags?.website || item.extratags?.['contact:website'] || '';
              let address = item.display_name || city;
              html += `<div style="padding:10px; background:var(--bg); border:1px solid var(--border); border-radius:6px; margin-bottom:8px; cursor:pointer;" onclick="selectEnrichment(${l.id}, ${item.lat}, ${item.lon}, '${encodeURIComponent(name)}', '${encodeURIComponent(phone)}', '${encodeURIComponent(website)}', '${encodeURIComponent(address)}', '')">
                <div style="font-weight:600; font-size:13px; color:var(--text-main); margin-bottom:4px;">${name}</div>
                <div style="font-size:11px; color:var(--text-muted);">${address}</div>
                ${phone ? `<div style="font-size:11px; color:var(--text-muted); margin-top: 4px;">📞 ${phone}</div>` : ''}
              </div>`;
           });
        }
      }

      if (found) {
         p.innerHTML = html + `<button class="action-btn-small outline" style="width:100%; margin-top:4px;" onclick="document.getElementById('fetch-preview-popover').remove()">Abbrechen</button>`;
      } else {
         p.innerHTML = `<div class="empty-state" style="height:auto;">Keine Daten für "${term}" gefunden.<br><br><button class="action-btn-small outline" onclick="document.getElementById('fetch-preview-popover').remove()">Schließen</button></div>`;
      }
    } catch (err) {
      p.innerHTML = `<div class="empty-state" style="height:auto; color:red;">Fehler beim Laden: ${err.message}<br><button class="action-btn-small outline" onclick="document.getElementById('fetch-preview-popover').remove()">Schließen</button></div>`;
    }
  };

  window.selectEnrichment = async (leadId, lat, lng, encName, encPhone, encWeb, encAddress, placeId) => {
     const p = document.getElementById('fetch-preview-popover');
     if (p) p.remove();

     const l = (await window.api.getLeads({all:true})).find(x => x.id === leadId);
     if (!l) return;
     
     if (encPhone && encPhone !== 'undefined' && !l.phone) l.phone = decodeURIComponent(encPhone);
     if (encWeb && encWeb !== 'undefined' && !l.website_url) l.website_url = decodeURIComponent(encWeb);
     
     l.lat = lat;
     l.lng = lng;
     if (placeId && placeId !== 'undefined') l.google_place_id = placeId;

     await window.api.saveLead(l);
     
     showToast('Lead angereichert! 📍');
     
     // Reload UI to show changes
     await loadUi();
     window.openLead(leadId); // Force the sidebar to refresh and show new phone/website
     await loadMapData();
  };

  let activeCallInterval = null;
  let activeCallSeconds = 0;
  
  window.startCallTracking = async (id) => {
    const phoneInput = document.getElementById('sys-phone');
    const phone = phoneInput ? phoneInput.value : '';
    if (!phone) { showToast('Keine Nummer hinterlegt!'); return; }
    
    // Copy number
    await window.copyPhone({currentTarget: null}, id, phone);
    
    // 3-2-1 Overlay
    const overlay = document.createElement('div');
    overlay.className = 'call-countdown-overlay';
    document.body.appendChild(overlay);
    
    let count = 3;
    let isCancelled = false;
    
    const renderCount = () => {
       if (isCancelled) return;
       overlay.innerHTML = `
         <div class="countdown-number" style="animation:none;">${count}</div>
         <div class="countdown-text">Anruf wird gestartet...</div>
         <button class="cancel-call-btn" onclick="this.parentElement.remove(); window._cancelCall=true;">Abbrechen (X)</button>
       `;
       // Re-trigger animation
       const numDiv = overlay.querySelector('.countdown-number');
       numDiv.style.animation = 'popIn 1s infinite cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    };
    
    window._cancelCall = false;
    renderCount();
    
    const interval = setInterval(() => {
      if (window._cancelCall) {
         clearInterval(interval);
         return;
      }
      count--;
      if (count > 0) {
        renderCount();
      } else {
        clearInterval(interval);
        overlay.remove();
        startActiveCallTimer(id);
      }
    }, 1000);
  };
  
  const startActiveCallTimer = async (id) => {
    const l = (await window.api.getLeads({all:true})).find(x => x.id === id);
    if (!l) return;
    
    if (activeCallInterval) clearInterval(activeCallInterval);
    activeCallSeconds = 0;
    
    const existing = document.getElementById('active-call-banner');
    if (existing) existing.remove();
    
    const banner = document.createElement('div');
    banner.id = 'active-call-banner';
    banner.className = 'call-timer-banner pulsing';
    banner.innerHTML = `📞 Aktiver Call mit ${l.name} -  <span id="call-clock">00:00</span>`;
    document.body.appendChild(banner);
    
    // Switch Save button to Call Outcome selector
    const saveBtnCont = document.getElementById('main-save-btn-container');
    if (saveBtnCont) {
       saveBtnCont.innerHTML = `
         <div id="active-call-outcome-row" style="display:flex; gap:8px; margin-top:24px;">
           <button class="action-btn outline" style="flex:1; border-color:#ff453a; color:#ff453a; font-size:12px; padding:8px;" onclick="saveLeadMain(${id}, false, 'no_interest')" title="Echtes Gespräch, aber kein Interesse">Kein Interesse</button>
           <button class="action-btn outline" style="flex:1; border-color:var(--text-muted); color:var(--text-muted); font-size:12px; padding:8px;" onclick="saveLeadMain(${id}, false, 'mailbox')" title="Mailbox / Nicht erreicht">Mailbox</button>
           <button class="action-btn success-bold" style="flex:1; font-size:12px; padding:8px; background:rgba(48,209,88,0.1);" onclick="saveLeadMain(${id}, false, 'positive')" title="Oder einfach Termin/Snooze anklicken">Positiv</button>
         </div>
         <div style="text-align:center; margin-top:8px; font-size:10px; color:var(--text-muted);">
            Wähle das Call-Ergebnis um den Lead zu speichern
         </div>
       `;
    }

    activeCallInterval = setInterval(() => {
      activeCallSeconds++;
      if (document.getElementById('call-clock')) {
         const m = Math.floor(activeCallSeconds / 60).toString().padStart(2, '0');
         const s = (activeCallSeconds % 60).toString().padStart(2, '0');
         document.getElementById('call-clock').innerText = `${m}:${s}`;
      } else {
         clearInterval(activeCallInterval); // Banner removed
      }
    }, 1000);
  };
  
  window.openGoogleCalendar = (id, type) => {
    const titleNode = document.getElementById('sys-name');
    const phoneNode = document.getElementById('sys-phone');
    const name = titleNode ? (titleNode.innerText || titleNode.value) : 'Lead';
    const phone = phoneNode ? phoneNode.value : '';
    
    const title = encodeURIComponent(`Call: ${name}`);
    const details = encodeURIComponent(`Tel: ${phone}\n\nTermin generiert über Calling Station.`);
    
    // Calculate Dates
    const now = new Date();
    let startDate = new Date(now.getTime());
    let endDate = new Date(now.getTime());
    
    // Nachgreifen -> Tomorrow defaults
    if (type === 'nachgreifen') {
       startDate.setDate(startDate.getDate() + 1);
       endDate.setDate(startDate.getDate() + 1);
       endDate.setMinutes(startDate.getMinutes() + 15); // 15 min block
    }
    // Termin -> Tomorrow 1h block
    else if (type === 'termin') {
       startDate.setDate(startDate.getDate() + 1);
       endDate.setDate(startDate.getDate() + 1);
       endDate.setHours(startDate.getHours() + 1); 
       // We DO NOT auto-set pipeline or snooze anymore to keep it decoupled!
    }
    
    // Format to Google Cal format: YYYYMMDDTHHmmSSZ (UTC)
    const formatStr = (d) => d.toISOString().replace(/-|:|\.\d\d\d/g,"");
    const dates = `${formatStr(startDate)}/${formatStr(endDate)}`;
    
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}`;
    window.api.openExternal(url);
    showToast("Google Kalender geöffnet!");
  };

  window.setPipeline = (type) => {
    let e = parseInt(document.getElementById('sys-e').value) || 0;
    let t = parseInt(document.getElementById('sys-t').value) || 0;
    let r = parseInt(document.getElementById('sys-r').value) || 0;

    if (type === 'e') {
       e = e ? 0 : 1;
       if (e === 0) { t = 0; r = 0; }
    }
    if (type === 't') {
       t = t ? 0 : 1;
       if (t) e = 1;
    }
    if (type === 'r') {
       r = r ? 0 : 1;
       if (r) e = 1;
    }

    document.getElementById('sys-e').value = e;
    document.getElementById('sys-t').value = t;
    document.getElementById('sys-r').value = r;

    const s1 = document.getElementById('seg-1');
    const s2 = document.getElementById('seg-2');
    const s3 = document.getElementById('seg-3');

    s1.className = 'pipe-seg';
    s2.className = 'pipe-seg';
    s3.className = 'pipe-seg';

    if (e) s1.classList.add('active-blue');
    if (t) s2.classList.add('active-orange');
    if (r) s3.classList.add('active-red');
  };

  window.selectSnooze = (hrs) => {
    if (currentSnoozeOffset === hrs) {
      currentSnoozeOffset = 0;
      currentSnoozeTargetMs = 0;
      document.querySelectorAll('.snooze-opt').forEach(b => b.classList.remove('outline'));
      return;
    }
    currentSnoozeOffset = hrs;
    currentSnoozeTargetMs = 0;
    document.querySelectorAll('.snooze-opt').forEach(b => b.classList.remove('outline'));
    document.getElementById(`snz-${hrs}`).classList.add('outline');
    document.getElementById('custom-snooze-container').style.display = 'none';
  };

  window.openCustomSnooze = () => {
    currentSnoozeOffset = 0;
    document.querySelectorAll('.snooze-opt').forEach(b => b.classList.remove('outline'));
    document.getElementById(`snz-custom`).classList.add('outline');
    document.getElementById('custom-snooze-container').style.display = 'block';
  };

  window.setExactSnooze = (val) => {
    if(!val) return;
    const targetDate = new Date(val);
    currentSnoozeTargetMs = targetDate.getTime();
    currentSnoozeOffset = 0;
  };

  window.prepareTaskMode = () => {
    isTaskMode = !isTaskMode;
    const btn = document.getElementById('btn-task-toggle');
    const cont = document.getElementById('task-creation-container');
    if (isTaskMode) {
      isKundeMode = false;
      if(document.getElementById('kunde-creation-container')) document.getElementById('kunde-creation-container').style.display = 'none';
      if(document.getElementById('btn-kunde-toggle')) {
        document.getElementById('btn-kunde-toggle').style.background = 'transparent';
        document.getElementById('btn-kunde-toggle').style.borderColor = 'var(--success)';
      }
      
      btn.style.background = 'var(--surface-hover)';
      btn.style.borderColor = 'var(--accent)';
      cont.style.display = 'block';
      document.getElementById('new-task-input').focus();
    } else {
      btn.style.background = 'transparent';
      btn.style.borderColor = 'var(--accent)';
      cont.style.display = 'none';
    }
  };

  window.prepareKundeMode = () => {
    isKundeMode = !isKundeMode;
    const btn = document.getElementById('btn-kunde-toggle');
    const cont = document.getElementById('kunde-creation-container');
    if (isKundeMode) {
      isTaskMode = false;
      document.getElementById('task-creation-container').style.display = 'none';
      document.getElementById('btn-task-toggle').style.background = 'transparent';
      document.getElementById('btn-task-toggle').style.borderColor = 'var(--accent)';
      
      btn.style.background = 'var(--surface-hover)';
      btn.style.borderColor = 'var(--success)';
      cont.style.display = 'block';
      const cityInput = document.getElementById('new-kunde-city');
      if (cityInput) cityInput.focus();
    } else {
      btn.style.background = 'transparent';
      btn.style.borderColor = 'var(--success)';
      cont.style.display = 'none';
    }
  };

  window.handleLinkClick = async (event, type, val, id, nameStr) => {
    if (event.ctrlKey || event.metaKey) {
      const newVal = prompt(`Manuelle ${type==='web'?'URL':'Place ID'} eintragen:`, val || '');
      if (newVal !== null) {
        if (type === 'web') document.getElementById('sys-web').value = newVal.trim();
        else document.getElementById('sys-placeid').value = newVal.trim();
        saveLeadMain(id);
      }
    } else {
      if (type === 'web') {
         if (val) window.api.openExternal(val);
         else window.api.openExternal(`https://www.google.com/search?q=${encodeURIComponent(nameStr)}`);
      } else if (type === 'maps' && val) {
         window.api.openExternal(`https://www.google.com/maps/place/?q=place_id:${val}`);
      }
    }
  };

  window.fetchPlaceData = async (id) => {
    const l = (await window.api.getLeads({all:true})).find(x => x.id === id);
    if (!l) return;
    const apiKey = localStorage.getItem('googlePlacesApiKey');
    if (!apiKey) return alert('Google API Key fehlt im Tab "Map"!');

    let cityNode = document.getElementById('sys-city');
    let currentCity = cityNode ? cityNode.value : l.maps_city;
    
    // --- UI City Prompt instead of unsupported window.prompt() ---
    const existing = document.getElementById('city-prompt');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.id = 'city-prompt';
    div.className = 'fetch-preview-popover';
    div.innerHTML = `
      <div style="font-weight:700; font-size:14px; margin-bottom:12px; color:var(--text-main);">In welcher Stadt befindet sich "${l.name}"?</div>
      <input type="text" id="prompt-city-input" class="modern-input-small" style="width:100%; margin-bottom:16px;" value="${currentCity || ''}" placeholder="Stadt eingeben...">
      <div style="display:flex; gap:8px;">
        <button id="btn-city-confirm" class="action-btn-small" style="flex:1; background:var(--accent); color:#fff; border:none; padding:8px;">Bestätigen</button>
        <button onclick="document.getElementById('city-prompt').remove(); showToast('❌ Datenabgleich abgebrochen');" class="action-btn-small outline" style="flex:1; padding:8px;">Abbrechen</button>
      </div>
    `;
    document.body.appendChild(div);
    const input = document.getElementById('prompt-city-input');
    input.focus();
    input.select();

    document.getElementById('btn-city-confirm').onclick = async () => {
      const promptCity = input.value.trim();
      div.remove();
      
      if (cityNode) cityNode.value = promptCity;
      showToast("⏳ Suche Radar-Daten...");

      try {
        const query = encodeURIComponent(l.name + ' ' + promptCity);
        const searchRes = await fetch(`https://places.googleapis.com/v1/places:searchText`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress'
          },
          body: JSON.stringify({textQuery: decodeURIComponent(query), languageCode: 'de'})
        });
        const searchData = await searchRes.json();
        
        if (!searchData.places || searchData.places.length === 0) {
          showToast("❌ Nichts gefunden");
          return;
        }

        // Always show multi-select preview to give options as requested
        showMultiSelectPreview(id, searchData.places);
      } catch(e) { console.error(e); showToast("❌ Fehler beim Abruf"); }
    };
  };

  window.showMultiSelectPreview = (id, places) => {
    const existing = document.getElementById('fetch-preview');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.id = 'fetch-preview';
    div.className = 'fetch-preview-popover';
    
    let listHtml = places.map((p, idx) => `
      <div style="padding:10px; border:1px solid var(--border); border-radius:8px; margin-bottom:8px; cursor:pointer;" class="fetch-result-item outline" onclick="fetchPlaceDetails(${id}, '${p.id}', '')">
        <div style="font-weight:700; font-size:13px; color:var(--text-main); margin-bottom:4px;">${p.displayName?.text || 'Unbekannt'}</div>
        <div style="font-size:11px; color:var(--text-muted); line-height:1.2;">${p.formattedAddress || 'Keine Adresse'}</div>
      </div>
    `).join('');

    div.innerHTML = `
      <div style="font-weight:600; font-size:14px; margin-bottom:12px; color:var(--text-main);">Wähle das passende Profil:</div>
      <div style="max-height: 250px; overflow-y:auto; margin-bottom:16px;">
        ${listHtml}
      </div>
      <button onclick="document.getElementById('fetch-preview').remove()" class="action-btn-small outline" style="width:100%; padding:8px;">Abbrechen</button>
    `;
    document.body.appendChild(div);
  };

  window.fetchPlaceDetails = async (id, placeId, apiKeyArg) => {
    const preview = document.getElementById('fetch-preview');
    if (preview) preview.innerHTML = `<div style="text-align:center; padding:20px;">Lade Details... ⏳</div>`;

    const apiKey = apiKeyArg || localStorage.getItem('googlePlacesApiKey');
    if (!apiKey) return;

    try {
      const detailsRes = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
        method: 'GET',
        headers: {
           'Content-Type': 'application/json',
           'X-Goog-Api-Key': apiKey,
           'X-Goog-FieldMask': 'displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,websiteUri,googleMapsUri,location,id'
        }
      });
      const p = await detailsRes.json();
      showFetchPreview(id, p);
    } catch(e) { showToast("❌ Fehler beim Abruf der Details"); if(preview) preview.remove(); }
  };

  window.showFetchPreview = (id, p) => {
    const existing = document.getElementById('fetch-preview');
    if (existing) existing.remove();

    const name = p.displayName ? p.displayName.text : 'Unbekannt';
    const addr = p.formattedAddress || 'Keine Adresse';
    const web = p.websiteUri || '';
    const phone = p.internationalPhoneNumber || p.nationalPhoneNumber || '';
    const placeId = p.id || '';

    const div = document.createElement('div');
    div.id = 'fetch-preview';
    div.className = 'fetch-preview-popover';
    div.innerHTML = `
      <div style="font-weight:700; font-size:14px; margin-bottom:4px; color:var(--text-main);">${name}</div>
      <div style="font-size:11px; color:var(--text-muted); margin-bottom:12px; line-height:1.3;">${addr}</div>
      <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:16px;">
        ${phone ? `<div style="font-size:12px;">📞 ${phone}</div>` : ''}
        ${web ? `<div style="font-size:12px; color:var(--accent); text-decoration:underline;">🌐 ${web.substring(0,30)}...</div>` : ''}
      </div>
      <div style="display:flex; gap:8px;">
        <button onclick="confirmFetch(${id}, '${placeId}')" class="action-btn-small" style="flex:1; background:var(--success); color:#fff; border:none; padding:8px;">Übernehmen</button>
        <button onclick="document.getElementById('fetch-preview').remove()" class="action-btn-small outline" style="flex:1; padding:8px;">Abbrechen</button>
      </div>
    `;
    window._pendingData = p;
    document.body.appendChild(div);
  };

  window.confirmFetch = async (id, placeId) => {
    const p = window._pendingData;
    if (!p) return;
    if (p.websiteUri) document.getElementById('sys-web').value = p.websiteUri;
    if (p.internationalPhoneNumber || p.nationalPhoneNumber) {
       const phoneInput = document.getElementById('sys-phone');
       if (phoneInput) phoneInput.value = p.internationalPhoneNumber || p.nationalPhoneNumber;
    }
    if (p.location) {
      const latNode = document.getElementById('sys-lat');
      const lngNode = document.getElementById('sys-lng');
      if(latNode) latNode.value = p.location.latitude;
      if(lngNode) lngNode.value = p.location.longitude;
    }
    
    window._pendingPlaceId = placeId;
    document.getElementById('fetch-preview').remove();
    showToast("✅ Daten übernommen!");
    await saveLeadMain(id, true);
    // Auto-select and fly to the new pin on map
    if (window.flyToMap) flyToMap(id);
  };

  window.showToast = (msg, isError = false) => {
    document.querySelectorAll('.app-toast').forEach(e => e.remove());
    const t = document.createElement('div');
    t.className = 'app-toast';
    const bg = isError ? 'rgba(255, 69, 58, 0.2)' : 'rgba(48,209,88,0.2)';
    const color = isError ? '#ff453a' : '#30d158';
    
    t.style = `position:fixed; top:-50px; left:50%; transform:translateX(-50%); background:${bg}; border:1px solid ${color}; color:#fff; padding:10px 24px; border-radius:30px; font-size:14px; font-weight:600; z-index:99999; box-shadow:0 10px 30px rgba(0,0,0,0.6); pointer-events:none; transition:all 0.4s cubic-bezier(0.16, 1, 0.3, 1); backdrop-filter:blur(12px); opacity:0;`;
    t.innerHTML = msg;
    document.body.appendChild(t);
    
    requestAnimationFrame(() => { t.style.top = '30px'; t.style.opacity = '1'; });
    setTimeout(() => { t.style.top = '-50px'; t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 2500);
  };

  // Remove confirmEnrich, autoEnrich, cancelEnrich, etc. (deprecated)
  window.saveLeadMain = async (id, isEnrichment = false, explicitOutcome = null) => {
    try {
      // BUGFIX: Always fetch the current lead object BEFORE referencing it to prevent ReferenceError crashes
      const lData = (await window.api.getLeads({all:true})).find(x => x.id === id);

      let sNameNode = document.getElementById('sys-name');
      const sName = sNameNode ? (sNameNode.innerText || sNameNode.value || '').trim() : '';
      const sPhone = document.getElementById('sys-phone')?.value?.trim() || '';
      const sWeb = document.getElementById('sys-web')?.value?.trim() || '';
    
    const notes = document.getElementById('note-input').value;
    const entscheider = parseInt(document.getElementById('sys-e').value) || 0;
    const termin = parseInt(document.getElementById('sys-t').value) || 0;
    const rechnung = parseInt(document.getElementById('sys-r').value) || 0;
    const size = document.getElementById('m-size').value;

    const sysCityNode = document.getElementById('sys-city');
    let city = sysCityNode ? sysCityNode.value : (lData ? lData.maps_city : '');
    
    // Auto-capture any text sitting in the input field when save is clicked (if they forgot to hit Enter)
    const remInput = document.getElementById('new-task-input-rem');
    if (remInput && remInput.value.trim() !== '') {
      if (!window.currentTasks) window.currentTasks = [];
      window.currentTasks.push({ id: Date.now(), text: remInput.value.trim(), done: false });
      remInput.value = '';
    }

    // Store remaining tasks (filtering out done)
    let finalTasks = (window.currentTasks || []).filter(t => !t.done);
    let taskTxt = finalTasks.length > 0 ? JSON.stringify(finalTasks) : '';

    let status = lData ? lData.status : 'Lead';
    const kundeCont = document.getElementById('kunde-creation-container');
    if (kundeCont && kundeCont.style.display !== 'none') {
      status = 'Kunde';
    }

    let umsatz = lData ? (lData.umsatz || 0) : 0;
    if (status === 'Kunde') {
      const cityNode = document.getElementById('new-kunde-city');
      if (cityNode && cityNode.value.trim()) city = cityNode.value.trim();
      let umsatzInput = document.getElementById('umsatz-input');
      if (!umsatzInput) umsatzInput = document.getElementById('umsatz-input-new');
      if (umsatzInput && umsatzInput.value) {
         const parsedUmsatz = parseInt(umsatzInput.value);
         if (isNaN(parsedUmsatz) || parsedUmsatz <= 0) {
            showToast('Bitte validen Umsatz eintragen um den Kunden zu closen!', true);
            return;
         }
         umsatz = parsedUmsatz;
      }
    }

    let snoozeMs = lData ? lData.snooze_until_ms : 0;
    
    const latVal = document.getElementById('sys-lat')?.value;
    const lngVal = document.getElementById('sys-lng')?.value;
    const lat = latVal ? parseFloat(latVal) : (lData ? lData.lat : null);
    const lng = lngVal ? parseFloat(lngVal) : (lData ? lData.lng : null);
    
    const htmlPlaceIdNode = document.getElementById('sys-placeid');
    const existingPlaceId = htmlPlaceIdNode ? htmlPlaceIdNode.value.trim() : (lData ? lData.google_place_id : '');
    const finalPlaceId = window._pendingPlaceId !== null && window._pendingPlaceId !== undefined ? window._pendingPlaceId : existingPlaceId;
    window._pendingPlaceId = null;

    if (currentSnoozeTargetMs > 0) {
      snoozeMs = currentSnoozeTargetMs;
    } else if (currentSnoozeOffset > 0) {
      snoozeMs = Date.now() + (currentSnoozeOffset * 60 * 60 * 1000);
    }

      const banner = document.getElementById('active-call-banner');
      let finalOutcome = explicitOutcome;
      let recordedDuration = activeCallSeconds;

      if (banner) {
         clearInterval(activeCallInterval);
         banner.remove();
      }

      // Infer outcome if not explicitly clicked via outcome buttons but a call was running
      if (recordedDuration > 0 && !finalOutcome) {
         // Auto-detect positive outcomes
         if (termin === 1) finalOutcome = 'meeting';
         else if (snoozeMs > Date.now()) finalOutcome = 'callback';
         else finalOutcome = 'mailbox'; // Safe fallback if they don't explicitly reject
      }
      
      // Override explicit outcome via pipeline actions if they clicked 'positive'
      if (explicitOutcome === 'positive') {
         if (termin === 1) finalOutcome = 'meeting';
         else if (snoozeMs > Date.now()) finalOutcome = 'callback';
         else finalOutcome = 'callback'; // general successful follow up
      }

      await window.api.saveLead({ 
        id, name: sName, phone: sPhone, website_url: sWeb, google_maps_url: '', 
        notes, entscheider, termin, rechnung, size, snooze_until_ms: snoozeMs, 
        task_text: taskTxt, status: status, maps_city: city, lat, lng, 
        google_place_id: finalPlaceId, umsatz: umsatz 
      });

      // Save the call log if it was an active call
      if (recordedDuration > 0) {
        await window.api.logCallExtended({
           session_id: window._activeSessionId,
           lead_id: id,
           duration_seconds: recordedDuration,
           outcome: finalOutcome || 'unknown'
        });
        if(window._activeSessionId) {
          await window.updateLiveSessionStats();
        }
      }

      await loadMapData();
      await loadUi();
      
      if (isEnrichment) {
        openLead(id);
      } else {
        window._currentSelectedLeadId = null;
        const mainSidebar = document.getElementById('main-sidebar');
        if(mainSidebar) mainSidebar.innerHTML = `<div class="empty-state">Nächsten Lead wählen</div>`;
      }
      
      showToast("Lead gespeichert!");
    } catch (err) {
      console.error(err);
      showToast(`Speicher-Fehler: ${err.message}`, true);
    }
  };

  window.cancelSnooze = async (id) => {
    const l = (await window.api.getLeads({all:true})).find(x => x.id === id);
    if (!l) return;
    
    l.notes = document.getElementById('note-input').value;
    l.entscheider = parseInt(document.getElementById('sys-e').value) || 0;
    l.termin = parseInt(document.getElementById('sys-t').value) || 0;
    l.rechnung = parseInt(document.getElementById('sys-r').value) || 0;
    l.size = document.getElementById('m-size').value;
    l.snooze_until_ms = 0;
    
    await window.api.saveLead(l);
    await loadMapData();
    loadUi();
    
    window._currentSelectedLeadId = null;
    sidebar.innerHTML = `<div class="empty-state">Nächsten Lead wählen</div>`;
    showToast("Lead gespeichert!");
  };

  window.renderTasksList = () => {
    const listDiv = document.getElementById('tasks-list');
    if (!listDiv) return;
    
    let html = '';
    (window.currentTasks || []).forEach(t => {
      let textStyle = t.done ? 'text-decoration: line-through; opacity: 0.5;' : '';
      html += `
        <div style="display:flex; align-items:flex-start; gap:8px;">
          <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleTask(${t.id}, this.checked)" style="margin-top:3px; cursor:pointer;" />
          <div style="flex:1; font-size:13px; color:var(--text-main); ${textStyle}">${t.text}</div>
          <button onclick="deleteTask(${t.id})" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer;">✕</button>
        </div>
      `;
    });
    
    if (!window.currentTasks || window.currentTasks.length === 0) {
      html = '<div style="font-size:12px; color:var(--text-muted); font-style:italic;">Keine Aufgaben.</div>';
    }
    listDiv.innerHTML = html;
  };

  window.handleNewTaskKeyPress = (e) => {
    if (e.key === 'Enter') {
      const txt = e.target.value.trim();
      if (!txt) return;
      if (!window.currentTasks) window.currentTasks = [];
      window.currentTasks.push({ id: Date.now(), text: txt, done: false });
      e.target.value = '';
      renderTasksList();
    }
  };

  window.toggleTask = (id, done) => {
    if (!window.currentTasks) return;
    const t = window.currentTasks.find(x => x.id === id);
    if (t) t.done = done;
    renderTasksList();
  };

  window.deleteTask = (id) => {
    if (!window.currentTasks) return;
    window.currentTasks = window.currentTasks.filter(x => x.id !== id);
    renderTasksList();
  };

  window.prepareKundeModeReminders = () => {
    const cont = document.getElementById('kunde-creation-container');
    const toggleLayer = document.getElementById('kunde-toggle-btn-container');
    if (cont) cont.style.display = 'block';
    if (toggleLayer) toggleLayer.style.display = 'none';
    const umsInput = document.getElementById('umsatz-input-new');
    if (umsInput) umsInput.focus();
  };

  window.copyPhone = async (e, id, phone) => {
    if(!phone) return;
    try {
      await window.api.copyText(phone);
    } catch(err) {
      console.log('Clipboard fallback error:', err);
    }
    await window.api.logCall(id);
    
    // Quick UI feedback for the small copy btn
    const btn = e.currentTarget || e.target;
    if (btn && btn.tagName === 'BUTTON') {
      const orig = btn.innerText;
      btn.innerText = 'OK';
      btn.style.borderColor = 'var(--success)';
      btn.style.color = 'var(--success)';
      setTimeout(() => {
         if (btn) {
           btn.innerText = orig;
           btn.style.borderColor = 'transparent';
           btn.style.color = 'var(--text-muted)';
         }
      }, 1500);
    }
  };

  window.deleteLead = async (id) => {
    if(confirm("Diesen Lead endgültig löschen? Er verschwindet komplett!")) {
      await window.api.deleteLead(id);
      sidebar.innerHTML = `<div class="empty-state">Nächsten Lead wählen</div>`;
      await loadUi();
      await loadMapData();
    }
  };

  window.toggleAnalytics = async (isUpdate = false) => {
    const modal = document.getElementById('analytics-modal');
    if (!isUpdate) {
        modal.classList.toggle('hidden');
    }
    
    if (!modal.classList.contains('hidden')) {
      const range = document.getElementById('stat-range') ? document.getElementById('stat-range').value : 'today';
      const stats = await window.api.getStats(range);
      
      document.getElementById('stat-calls').innerText = stats.totalDone || 0;
      document.getElementById('stat-ent').innerText = stats.entscheider || 0;
      document.getElementById('stat-term').innerText = stats.termin || 0;
      
      const elUmsatz = document.getElementById('stat-umsatz');
      if (elUmsatz) elUmsatz.innerText = (stats.umsatz || 0).toLocaleString('de-DE');
      
      const elEntConv = document.getElementById('stat-ent-conv');
      if (elEntConv) elEntConv.innerText = `${stats.callsToEntscheider || 0}% C-t-E`;
      
      const elTermConv = document.getElementById('stat-term-conv');
      if (elTermConv) elTermConv.innerText = `${stats.callsToTermin || 0}% C-t-T`;
      
      if (typeof updateGoals === 'function') updateGoals();
    }
  };

  window.quickAdd = async () => {
    const name = document.getElementById('qa-name').value.trim();
    const phone = document.getElementById('qa-phone').value.trim();
    if(!name) return;
    const res = await window.api.saveLead({ name, phone });
    document.getElementById('qa-name').value = '';
    document.getElementById('qa-phone').value = '';
    
    await loadUi();
    openLead(res.id);
  };

  window.handleCSV = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async function(results) {
        const data = results.data;
        const leadsToImport = [];
        data.forEach(row => {
          const phoneKey = Object.keys(row).find(k => k.toLowerCase().includes('nummer') || k.toLowerCase().includes('telefon') || k.toLowerCase().includes('phone'));
          const nameKey = Object.keys(row).find(k => k.toLowerCase().includes('unternehmen') || k.toLowerCase().includes('firma') || k.toLowerCase().includes('name'));
          if (nameKey && row[nameKey]) leadsToImport.push({ name: row[nameKey], phone: phoneKey ? row[phoneKey] : '' });
        });
        if (leadsToImport.length > 0) {
          await window.api.importLeads(leadsToImport);
          alert(`${leadsToImport.length} Leads importiert!`);
          loadUi();
        }
      }
    });
  };

  let scoutedResults = [];
  let scoutMarkers = [];

  const loadApiKey = () => {
    const inp = document.getElementById('google-api-key');
    let key = localStorage.getItem('googlePlacesApiKey');
    if (!key && inp && inp.value) {
      key = inp.value;
      localStorage.setItem('googlePlacesApiKey', key);
    }
    if (inp && key) inp.value = key;
    return key || '';
  };

  window.saveApiKey = (val) => {
    localStorage.setItem('googlePlacesApiKey', val.trim());
  };

  window.startScouting = async () => {
    const term = document.getElementById('scout-term').value.trim();
    const city = document.getElementById('scout-city').value.trim();
    if (!term) return alert('Bitte mindestes einen Suchbegriff oder eine Adresse eingeben.');

    const apiKey = localStorage.getItem('googlePlacesApiKey') || '';
    const resCont = document.getElementById('scout-results');
    resCont.innerHTML = `<div class="empty-state" style="height:auto;">Scouting läuft... ⏳</div>`;
    document.getElementById('scout-import-btn').style.display = 'none';
    
    scoutMarkers.forEach(m => map.removeLayer(m));
    scoutMarkers = [];
    scoutedResults = [];
    
    let bounds = L.latLngBounds();
    let html = '';

    // Fetch existing leads for visual deduplication
    const existingLeads = await window.api.getLeads({ all: true });
    const existingNames = new Set(existingLeads.map(l => l.name.toLowerCase().trim()));
    const existingPhones = new Set(existingLeads.map(l => l.phone).filter(p => p));

    try {
      if (apiKey) {
        // --- GOOGLE PLACES API (NEW) ---
        const url = 'https://places.googleapis.com/v1/places:searchText';
        
        let morePages = true;
        let pageCount = 0;
        let pageToken = '';

        while(morePages && pageCount < 1) { // TEST PHASE LIMIT: Max 10/20 leads 
          let queryStr = term;
          if (city) queryStr += ` in ${city}`;
          const body = { textQuery: queryStr, pageSize: 20 };
          if (pageToken) body.pageToken = pageToken;
          
          resCont.innerHTML = `<div class="empty-state" style="height:auto;">Scouting Seite ${pageCount+1}... ⏳</div>`;
          
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.location,places.googleMapsUri,places.id,nextPageToken'
            },
            body: JSON.stringify(body)
          });
          const data = await res.json();
          
          if (data.error) throw new Error(data.error.message);

          if (data.places && data.places.length > 0) {
            data.places.forEach(item => {
               let lat = item.location.latitude;
               let lng = item.location.longitude;
               let name = item.displayName ? item.displayName.text : 'Unbekannt';
               let phone = item.nationalPhoneNumber || '';
               let website = item.websiteUri || '';
               let address = item.formattedAddress || city;
               let googleMapsUrl = item.googleMapsUri || '';

               let isDuplicate = existingNames.has(name.toLowerCase().trim()) || (phone && existingPhones.has(phone));

               if (isDuplicate) {
                 let extLead = existingLeads.find(x => x.name.toLowerCase().trim() === name.toLowerCase().trim() || (phone && x.phone === phone));
                 let action = extLead ? `onclick="openLead(${extLead.id})"` : '';
                 html += `
                   <div style="padding: 12px; background:var(--bg); border:1px solid var(--border); border-radius:8px; margin-bottom:8px; opacity: 0.6; cursor:pointer;" ${action}>
                     <div style="font-weight:600; font-size:14px; margin-bottom:4px; color:var(--text-main);">${name} 
                       <span style="font-size:10px; font-weight:700; background:rgba(48,209,88,0.2); color:var(--success); padding:2px 6px; border-radius:4px; margin-left:6px;">In deiner Queue</span>
                     </div>
                     <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">📞 ${phone || 'Unbekannt'}</div>
                     <div style="display:flex; gap:6px;">
                       ${website ? `<button onclick="window.api.openExternal('${website}')" class="action-btn-small outline" style="flex:1; padding:4px; font-size:10px;">🌐 Website</button>` : ''}
                       ${googleMapsUrl ? `<button onclick="window.api.openExternal('${googleMapsUrl}')" class="action-btn-small outline" style="flex:1; padding:4px; font-size:10px;">🗺️ Google Maps</button>` : ''}
                     </div>
                   </div>
                 `;
               } else {
                 scoutedResults.push({ name, phone, website, maps_city: address, lat, lng, google_maps_url: googleMapsUrl, google_place_id: item.id });

                 const icon = L.divIcon({ className: 'scout-marker', iconSize: [14, 14], iconAnchor: [7, 7], html: `<div class="map-pin pin-kalt"></div>` });
                 const popupHtml = `
                    <div style="margin-bottom:8px;"><strong style="color:#000; font-size:14px;">${name}</strong><br><span style="color:#666;">📞 ${phone || 'Keine Nr'}<br>📍 ${address}</span></div>
                    <div style="display:flex; gap:6px; flex-direction:column;">
                      ${website ? `<button onclick="window.api.openExternal('${website}')" class="action-btn-small outline" style="width:100%; border-color:#ccc; color:#0a84ff; padding:4px; font-size:11px;">🌐 Zur Website</button>` : ''}
                      ${googleMapsUrl ? `<button onclick="window.api.openExternal('${googleMapsUrl}')" class="action-btn-small outline" style="width:100%; border-color:#ccc; color:#0a84ff; padding:4px; font-size:11px;">🗺️ In Google Maps öffnen</button>` : ''}
                    </div>
                 `;
                 const m = L.marker([lat, lng], {icon, zIndexOffset: 1000}).addTo(map).bindPopup(popupHtml);
                 m.on('click', () => map.setView([lat, lng], 16, { animate: true }));
                 scoutMarkers.push(m);
                 bounds.extend([lat, lng]);

                 html += `
                   <div style="padding: 12px; background:var(--bg); border:1px solid var(--border); border-radius:8px; margin-bottom:8px;">
                     <div style="font-weight:600; font-size:14px; margin-bottom:4px; color:var(--text-main);">${name}</div>
                     <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">📞 ${phone || 'Unbekannt'}</div>
                     <div style="display:flex; gap:6px;">
                       <button onclick="window.api.openExternal('${website}')" class="action-btn-small outline" style="flex:1; padding:4px; font-size:10px;">🌐 Website</button>
                       <button onclick="window.api.openExternal('${googleMapsUrl}')" class="action-btn-small outline" style="flex:1; padding:4px; font-size:10px;">🗺️ Google Maps</button>
                     </div>
                   </div>
                 `;
               }
            });
          }

          if (data.nextPageToken && pageCount < 2) {
             pageToken = data.nextPageToken;
             pageCount++;
             // Google often requires a short delay before the next page token is active
             await new Promise(r => setTimeout(r, 1000));
          } else {
             morePages = false;
          }
        }
      } else {
        // --- OPENSTREETMAP NOMINATIM FALLBACK ---
        let queryStr = term;
        if (city) queryStr += `, ${city}`;
        const q = encodeURIComponent(queryStr);
        const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&addressdetails=1&extratags=1&limit=50`;
        const res = await fetch(url, { 
          headers: { 
            'Accept-Language': 'de-DE',
            'User-Agent': 'CallingStationLeadScout/1.0 (info@callingstation.com)'
          } 
        });
        const data = await res.json();

        if(data && data.length > 0) {
          data.forEach(item => {
             let lat = parseFloat(item.lat);
             let lng = parseFloat(item.lon);
             let name = item.name || (item.display_name ? item.display_name.split(',')[0] : 'Unbekannt');
             if(!name) return;

             let phone = '';
             let website = '';
             if(item.extratags) {
               phone = item.extratags.phone || item.extratags['contact:phone'] || '';
               website = item.extratags.website || item.extratags['contact:website'] || '';
             }

             let isDuplicate = existingNames.has(name.toLowerCase().trim()) || (phone && existingPhones.has(phone));

             let osmMapUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
             if (isDuplicate) {
               html += `
                 <div style="padding: 12px; background:var(--bg); border:1px solid var(--border); border-radius:8px; margin-bottom:8px; opacity: 0.6;">
                   <div style="font-weight:600; font-size:14px; margin-bottom:4px;">${name}
                     <span style="font-size:10px; font-weight:700; background:rgba(48,209,88,0.2); color:var(--success); padding:2px 6px; border-radius:4px; margin-left:6px;">In deiner Queue</span>
                   </div>
                   <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">📞 ${phone || 'Unbekannt'}</div>
                   <div style="display:flex; gap:6px;">
                      ${website ? `<button onclick="window.api.openExternal('${website}')" class="action-btn-small outline" style="flex:1; padding:4px; font-size:10px;">🌐 Website</button>` : ''}
                      <button onclick="window.api.openExternal('${osmMapUrl}')" class="action-btn-small outline" style="flex:1; padding:4px; font-size:10px;">🗺️ Google Maps</button>
                    </div>
                 </div>
               `;
             } else {
               scoutedResults.push({ name, phone, website, maps_city: city, lat, lng });

               const icon = L.divIcon({ className: 'scout-marker', iconSize: [14, 14], iconAnchor: [7, 7], html: `<div class="map-pin pin-kalt"></div>` });
               const popupHtml = `
                  <div style="margin-bottom:12px;">
                    <div style="font-weight:600; font-size:15px; margin-bottom:4px; color:var(--text-main);">${name}</div>
                    <div style="font-size:12px; color:var(--text-muted);">📞 ${phone || 'Keine Nr'}<br>📍 ${city}</div>
                  </div>
                  <div style="display:flex; gap:6px; flex-direction:column;">
                    ${website ? `<button onclick="window.api.openExternal('${website}')" class="action-btn-small outline" style="width:100%; border-color:var(--border); color:var(--text-main); padding:6px; font-size:11px;">🌐 Zur Website</button>` : ''}
                    <button onclick="window.api.openExternal('${osmMapUrl}')" class="action-btn-small outline" style="width:100%; border-color:var(--border); color:var(--text-main); padding:6px; font-size:11px;">🗺️ In Google Maps öffnen</button>
                  </div>
               `;
               const m = L.marker([lat, lng], {icon, zIndexOffset: 1000}).addTo(map).bindPopup(popupHtml);
               m.on('click', () => map.setView([lat, lng], 16, { animate: true }));
               scoutMarkers.push(m);
               bounds.extend([lat, lng]);

               html += `
                 <div style="padding: 12px; background:var(--bg); border:1px solid var(--border); border-radius:8px; margin-bottom:8px;">
                   <div style="font-weight:600; font-size:14px; margin-bottom:4px; color:var(--text-main);">${name}</div>
                   <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">📞 ${phone || 'Unbekannt (aus OSM Daten)'}</div>
                   <div style="display:flex; gap:6px;">
                     <button onclick="window.api.openExternal('${website || ''}')" class="action-btn-small outline" style="flex:1; padding:4px; font-size:10px;">🌐 Website</button>
                     <button onclick="window.api.openExternal('${osmMapUrl}')" class="action-btn-small outline" style="flex:1; padding:4px; font-size:10px;">🗺️ Google Maps</button>
                   </div>
                 </div>
               `;
             }
          });
        }
      }
        
      if(scoutedResults.length > 0 || html !== '') {
        if (scoutedResults.length > 0) map.fitBounds(bounds, { padding: [50, 50] });
        resCont.innerHTML = html;
        
        const btn = document.getElementById('scout-import-btn');
        btn.style.display = scoutedResults.length > 0 ? 'block' : 'none';
        if (scoutedResults.length > 0) btn.innerText = `Alle ${scoutedResults.length} in Queue 📥`;
        
      } else {
        resCont.innerHTML = `
          <div class="empty-state" style="height:auto;">
             Nichts gefunden via Standard-Suche.<br><br>
             <button class="action-btn-small outline" style="width:100%; border-color:var(--accent); color:var(--text-main);" onclick="runDeepSearch('${term}', '${city}')">Deep Search (Overpass API) starten</button>
          </div>
        `;
      }
    } catch(err) {
      resCont.innerHTML = `<div class="empty-state" style="height:auto; color:red;">Fehler: ${err.message}</div>`;
    }
  };
  window.runDeepSearch = async (term, city) => {
    const resCont = document.getElementById('scout-results');
    resCont.innerHTML = `<div class="empty-state" style="height:auto;">Starte Deep Search (Overpass)... ⏳</div>`;
    
    // We will form an Overpass QL query. If city is provided, we search in that area. 
    // For simplicity, we search for nodes/ways with name matching the term.
    let query = `[out:json][timeout:25];`;
    if (city) {
        query += `area[name="${city}"]->.searchArea;`;
        query += `(nwr["name"~"${term}",i](area.searchArea););`;
    } else {
        // Global search without area is usually too heavy for overpass, but we can try with a hard limit
        query += `(nwr["name"~"${term}",i];);`;
    }
    query += `out center 50;`;

    try {
        const url = `https://overpass-api.de/api/interpreter`;
        const res = await fetch(url, {
            method: 'POST',
            body: query,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const data = await res.json();
        
        let html = '';
        let bounds = L.latLngBounds();
        const existingLeads = await window.api.getLeads({ all: true });
        const existingNames = new Set(existingLeads.map(l => l.name.toLowerCase().trim()));
        const existingPhones = new Set(existingLeads.map(l => l.phone).filter(p => p));

        if (data && data.elements && data.elements.length > 0) {
            data.elements.forEach(item => {
                let name = item.tags?.name;
                if (!name) return;
                
                let lat = item.lat || item.center?.lat;
                let lng = item.lon || item.center?.lon;
                if (!lat || !lng) return;

                let phone = item.tags?.phone || item.tags?.['contact:phone'] || '';
                let website = item.tags?.website || item.tags?.['contact:website'] || '';
                let isDuplicate = existingNames.has(name.toLowerCase().trim()) || (phone && existingPhones.has(phone));
                
                let osmMapUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
                
                if (isDuplicate) {
                   html += `
                     <div style="padding: 12px; background:var(--bg); border:1px solid var(--border); border-radius:8px; margin-bottom:8px; opacity: 0.6;">
                       <div style="font-weight:600; font-size:14px; margin-bottom:4px;">${name}
                         <span style="font-size:10px; font-weight:700; background:rgba(48,209,88,0.2); color:var(--success); padding:2px 6px; border-radius:4px; margin-left:6px;">In deiner Queue</span>
                       </div>
                       <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">📞 ${phone || 'Unbekannt'}</div>
                       <div style="display:flex; gap:6px;">
                          ${website ? `<button onclick="window.api.openExternal('${website}')" class="action-btn-small outline" style="flex:1; padding:4px; font-size:10px;">🌐 Website</button>` : ''}
                          <button onclick="window.api.openExternal('${osmMapUrl}')" class="action-btn-small outline" style="flex:1; padding:4px; font-size:10px;">🗺️ Google Maps</button>
                        </div>
                     </div>
                   `;
                } else {
                   scoutedResults.push({ name, phone, website, maps_city: city || '', lat, lng });

                   const icon = L.divIcon({ className: 'scout-marker', iconSize: [14, 14], iconAnchor: [7, 7], html: `<div class="map-pin pin-kalt"></div>` });
                   const popupHtml = `
                      <div style="margin-bottom:12px;">
                        <div style="font-weight:600; font-size:15px; margin-bottom:4px; color:var(--text-main);">${name}</div>
                        <div style="font-size:12px; color:var(--text-muted);">📞 ${phone || 'Keine Nr'}<br>📍 ${city || 'Unbekannt'}</div>
                      </div>
                      <div style="display:flex; gap:6px; flex-direction:column;">
                        ${website ? `<button onclick="window.api.openExternal('${website}')" class="action-btn-small outline" style="width:100%; border-color:var(--border); color:var(--text-main); padding:6px; font-size:11px;">🌐 Zur Website</button>` : ''}
                        <button onclick="window.api.openExternal('${osmMapUrl}')" class="action-btn-small outline" style="width:100%; border-color:var(--border); color:var(--text-main); padding:6px; font-size:11px;">🗺️ In Google Maps öffnen</button>
                      </div>
                   `;
                   const m = L.marker([lat, lng], {icon, zIndexOffset: 1000}).addTo(map).bindPopup(popupHtml);
                   m.on('click', () => map.setView([lat, lng], 16, { animate: true }));
                   scoutMarkers.push(m);
                   bounds.extend([lat, lng]);

                   html += `
                     <div style="padding: 12px; background:var(--bg); border:1px solid var(--border); border-radius:8px; margin-bottom:8px;">
                       <div style="font-weight:600; font-size:14px; margin-bottom:4px; color:var(--text-main);">${name}</div>
                       <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">📞 ${phone || 'Unbekannt (aus OSM Daten)'}</div>
                       <div style="display:flex; gap:6px;">
                         ${website ? `<button onclick="window.api.openExternal('${website}')" class="action-btn-small outline" style="flex:1; padding:4px; font-size:10px;">🌐 Website</button>` : ''}
                         <button onclick="window.api.openExternal('${osmMapUrl}')" class="action-btn-small outline" style="flex:1; padding:4px; font-size:10px;">🗺️ Google Maps</button>
                       </div>
                     </div>
                   `;
                }
            });
            
            if (scoutedResults.length > 0) map.fitBounds(bounds, { padding: [50, 50] });
            resCont.innerHTML = html;
            
            const btn = document.getElementById('scout-import-btn');
            btn.style.display = scoutedResults.length > 0 ? 'block' : 'none';
            if (scoutedResults.length > 0) btn.innerText = `Alle ${scoutedResults.length} in Queue 📥`;
            
        } else {
             resCont.innerHTML = `<div class="empty-state" style="height:auto;">Auch mit Deep Search nichts gefunden. Überprüfe die Schreibweise der Stadt.</div>`;
        }
    } catch(err) {
        resCont.innerHTML = `<div class="empty-state" style="height:auto; color:red;">Overpass Fehler: ${err.message}</div>`;
    }
  };

  window.importScoutedLeads = async () => {
    if(scoutedResults.length === 0) return;
    const btn = document.getElementById('scout-import-btn');
    btn.innerText = 'Importiere... ⏳';
    btn.disabled = true;

    try {
      const existingLeads = await window.api.getLeads({ all: true });
      const existingNames = new Set(existingLeads.map(l => l.name.toLowerCase().trim()));
      const existingPhones = new Set(existingLeads.map(l => l.phone).filter(p => p));
      let importedCount = 0;

      for (let r of scoutedResults) {
        if (!r.name) continue;
        if (existingNames.has(r.name.toLowerCase().trim())) continue;
        if (r.phone && existingPhones.has(r.phone)) continue;

        let notes = r.website ? `Website aus Scout: ${r.website}` : '';
        await window.api.saveLead({ 
          name: r.name, phone: r.phone, size: 'Tarifkunde', status: 'Lead', 
          maps_city: r.maps_city, lat: r.lat, lng: r.lng, notes: notes, 
          snooze_until_ms: 0, task_text: '', last_contact_ms: 0, 
          website_url: r.website, google_maps_url: r.google_maps_url, google_place_id: r.google_place_id
        });
        importedCount++;
      }

      alert(`${importedCount} frische Leads importiert! 🚀 (${scoutedResults.length - importedCount} Duplikate übersprungen)`);
      btn.disabled = false;
      scoutedResults = [];
      scoutMarkers.forEach(m => map.removeLayer(m));
      scoutMarkers = [];
      document.getElementById('scout-term').value = '';
      document.getElementById('scout-results').innerHTML = `<div class="empty-state" style="height:auto;">Import erfolgreich.</div>`;
      btn.style.display = 'none';
      switchTab('queue');
    } catch (err) {
      alert(`Fehler beim Importieren: ${err.message}`);
      btn.innerText = 'Import fehlgeschlagen';
      btn.disabled = false;
    }
  };

  // Global Keyboard Navigation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const fetchPreview = document.getElementById('fetch-preview');
      if (fetchPreview) return fetchPreview.remove();
      
      const popover = document.getElementById('popover');
      if (popover) { popover.remove(); isPopoverOpen = false; return; }
      
      const sidebar = document.getElementById('main-sidebar');
      if (sidebar && sidebar.style.display !== 'none' && !e.target.closest('input, textarea, [contenteditable]')) {
        document.activeElement.blur();
      }
    }
    
    if (e.key === 'Enter') {
      if (document.activeElement.tagName === 'TEXTAREA') return;
      
      const fetchPreview = document.getElementById('fetch-preview');
      if (fetchPreview) {
         const confirmBtn = fetchPreview.querySelector('button[onclick^="confirmFetch"]');
         if (confirmBtn) { e.preventDefault(); confirmBtn.click(); return; }
      }
      
      const sidebar = document.getElementById('main-sidebar');
      if (sidebar && sidebar.style.display !== 'none') {
         const saveBtn = sidebar.querySelector('button[onclick^="saveLeadMain"]');
         if (saveBtn) { e.preventDefault(); saveBtn.click(); return; }
      }
    }
  });



  // --- WIDGET DRAG & DROP ---
  const widget = document.getElementById('floating-session-widget');
  const dragHandle = document.getElementById('widget-drag-handle');
  let isDraggingWidget = false, dragStartX = 0, dragStartY = 0, initialLeft = 0, initialTop = 0;
  if(dragHandle && widget) {
    dragHandle.addEventListener('mousedown', (e) => {
       if(e.target.tagName.toLowerCase() === 'button') return;
       isDraggingWidget = true;
       dragStartX = e.clientX; dragStartY = e.clientY;
       const rect = widget.getBoundingClientRect();
       initialLeft = rect.left; initialTop = rect.top;
       widget.style.right = 'auto';
       widget.style.bottom = 'auto';
       widget.style.left = initialLeft + 'px';
       widget.style.top = initialTop + 'px';
       document.body.style.userSelect = 'none';
    });
    window.addEventListener('mousemove', (e) => {
       if(!isDraggingWidget) return;
       const dx = e.clientX - dragStartX; const dy = e.clientY - dragStartY;
       widget.style.left = (initialLeft + dx) + 'px';
       widget.style.top = (initialTop + dy) + 'px';
    });
    window.addEventListener('mouseup', () => {
       isDraggingWidget = false;
       document.body.style.userSelect = '';
    });
  }

  window.toggleWidgetCollapse = () => {
    if(widget) {
      widget.classList.toggle('collapsed');
      const btn = document.getElementById('widget-collapse-btn');
      btn.innerHTML = widget.classList.contains('collapsed') ? '[]' : '_';
    }
  };

  // --- SESSIONS & DAILY STATS ---
  window.updateLiveSessionStats = async () => {
    try {
      let callStats;
      let leadStats = await window.api.getStats('today'); 
      let isSession = !!window._activeSessionId;

      callStats = await window.api.getSessionStats('today');
      
      const updateStat = (id, val, formatPostfix = '') => {
         const el = document.getElementById(id);
         if(!el) return;
         const currentStr = el.innerText.replace(formatPostfix, '');
         const stringVal = String(val || 0);
         if(currentStr !== stringVal) {
           el.innerText = stringVal + formatPostfix;
           el.classList.remove('stat-pop');
           void el.offsetWidth;
           el.classList.add('stat-pop');
         }
      };

      let totalCalls = callStats?.totalCalls || 0;
      let target = 100;

      if(window.api.updateTray) {
          window.api.updateTray(totalCalls);
      }

      const fill = document.getElementById('live-progress-fill');
      if(fill) {
          let pct = Math.min((totalCalls / target) * 100, 100);
          fill.style.width = pct + '%';
          fill.style.background = pct >= 100 ? 'var(--success)' : 'linear-gradient(90deg, #0a84ff, #30d158)';
      }

      const dot = document.getElementById('widget-status-dot');
      const txt = document.getElementById('widget-status-text');
      if(dot && txt) {
         if(isSession) {
            dot.style.background = 'var(--success)';
            dot.style.boxShadow = '0 0 8px var(--success)';
            dot.style.animation = 'pulse 2s infinite';
            txt.innerText = 'LIVE SESSION';
         } else {
            dot.style.background = 'var(--text-muted)';
            dot.style.boxShadow = 'none';
            dot.style.animation = 'none';
            txt.innerText = 'DAILY STATS';
         }
      }

      const elCalls = document.getElementById('live-stat-calls');
      if(elCalls) {
         elCalls.innerHTML = `${totalCalls} <span style="font-size:11px;color:#888;font-weight:600;">/ ${target}</span>`;
      }

      updateStat('live-stat-connect', callStats?.connectRate || 0, '%');
      
      updateStat('live-stat-entscheider', leadStats?.entscheider || 0);
      updateStat('live-stat-termin', leadStats?.termin || 0);

      updateStat('live-detail-conversion', callStats?.conversionRate || 0, '%');
      updateStat('live-detail-real', callStats?.totalRealConversations || 0);
      updateStat('live-detail-callback', callStats?.outcomes?.callback || 0);
      updateStat('live-detail-failed', (callStats?.outcomes?.no_interest || 0) + (callStats?.outcomes?.mailbox || 0));
    } catch(err) {
      console.error("Live Session Widget Error:", err);
    }
  };

  window.checkActiveSession = async () => {
    try {
      const s = await window.api.getActiveSession();
      const btn = document.getElementById('session-toggle-btn');
      if (s) {
        window._activeSessionId = s.id;
        if(btn) {
          btn.innerHTML = '🛑 Session Beenden';
          btn.style.background = 'rgba(255, 69, 58, 0.2)';
          btn.style.color = '#ff453a';
          btn.style.borderColor = '#ff453a';
        }
      } else {
        window._activeSessionId = null;
        if(btn) {
          btn.innerHTML = '🚀 Start Session';
          btn.style.background = '#0a84ff';
          btn.style.color = '#fff';
          btn.style.borderColor = 'transparent';
        }
      }
      // if(widget) widget.classList.remove('hidden'); // Disabled auto-boot
      await updateLiveSessionStats();
    } catch(err) {}
  };

  window.toggleSession = async () => {
    if (window._activeSessionId) {
      await window.api.endSession(window._activeSessionId);
      window._activeSessionId = null;
    } else {
      const s = await window.api.createSession();
      window._activeSessionId = s.id;
      showToast("🚀 Session gestartet! Let's go!");
    }
    await checkActiveSession();
  };

  checkActiveSession();
  loadApiKey();
  loadUi();
  autoGeocode();
});
