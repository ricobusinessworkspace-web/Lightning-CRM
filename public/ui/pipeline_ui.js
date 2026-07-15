const escapeHtml = (unsafe) => {
  return (unsafe || '').toString()
       .replace(/&/g, "&amp;")
       .replace(/</g, "&lt;")
       .replace(/>/g, "&gt;")
       .replace(/"/g, "&quot;")
       .replace(/'/g, "&#039;");
};

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
          if (typeof window.renderEmptySidebar === 'function') {
            window.renderEmptySidebar();
          } else {
            sidebar.innerHTML = `<div class="empty-state">Nächsten Lead wählen</div>`;
          }
          showToast("Leads in Bulk gelöscht!");
      }
  };

  window.getLeadStatusMap = (l) => {
    let res = { color: 'p-kalt', label: 'Kalt', mapPin: 'pin-kalt' };
    if (l.status === 'Kunde') res = { color: 'p-kunde', label: 'Kunde', mapPin: 'pin-kunde' };
    else if (l.status === 'Uninteressant') res = { color: 'p-excluded', label: 'Ausgeschlossen 🚫', mapPin: 'pin-excluded' };
    else if (l.rechnung) res = { color: 'p-rechnung', label: 'Rechnung', mapPin: 'pin-rechnung' };
    else if (l.termin) res = { color: 'p-termin', label: 'Kontakt', mapPin: 'pin-termin' };
    else if (l.entscheider) res = { color: 'p-entscheider', label: 'Entscheider', mapPin: 'pin-entscheider' };
    
    let hasActive = false;
    if (typeof l.task_text === 'string' && l.task_text.trim() !== '') {
      try {
        const arr = JSON.parse(l.task_text);
        if (Array.isArray(arr)) {
          hasActive = arr.some(t => !t.done);
        } else {
          hasActive = true;
        }
      } catch(e) {
        hasActive = true;
      }
    }
    res.isTask = hasActive;
    return res;
  };

  let map = null;
  let mapMarkers = [];

  function initMap() {
    if (map) return;
    map = L.map('map-container').setView([51.0504, 13.7372], 11);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CartoDB',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);
  }

  // ── Map Hover Card (F1) ─────────────────────────────────────────────────────
  let _mapHoverCard = null;
  let _mapHoverTimeout = null;

  function showMapHoverCard(l, containerPoint) {
    hideMapHoverCard();
    const sMap = getLeadStatusMap(l);
    const callStatus = l.call_status || 'never';
    const callBadge = callStatus === 'never'
      ? '<span class="call-status-badge call-status-never">Nie angerufen</span>'
      : callStatus === 'not_answered'
        ? '<span class="call-status-badge call-status-not-answered">Nicht erreicht</span>'
        : '<span class="call-status-badge call-status-answered">Angerufen</span>';

    const card = document.createElement('div');
    card.className = 'map-hover-card';
    card.id = 'map-hover-card';

    const loc = Array.isArray(l.locations) && l.locations.length > 0 ? l.locations[0] : null;
    const address = loc ? (loc.address || loc.name || l.maps_city || '') : (l.maps_city || '');

    card.innerHTML = `
      <div class="map-hover-card-inner" style="overflow: hidden; border-radius: 12px; background: #1c1c1e; box-shadow: 0 16px 32px rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.1);">
        <div style="height: 80px; width: 100%; background: linear-gradient(135deg, rgba(10,132,255,0.4) 0%, rgba(48,209,88,0.2) 100%); display: flex; align-items: flex-end; padding: 12px; box-sizing: border-box; border-bottom: 1px solid rgba(255,255,255,0.05);">
           <div style="font-weight: 700; font-size: 16px; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,0.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(l.name)}</div>
        </div>
        <div style="padding: 16px;">
          ${address ? `<div style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px; display: flex; align-items: flex-start; gap: 6px;"><span>📍</span><span style="line-height: 1.4;">${escapeHtml(address)}</span></div>` : ''}
          ${l.phone ? `<div style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px; display: flex; align-items: center; gap: 6px;"><span>📞</span><span>${escapeHtml(l.phone)}</span></div>` : ''}
          <div style="display: flex; gap: 8px; align-items: center; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05);">
            <span class="map-hover-status ${sMap.color}" style="font-size: 11px; padding: 4px 8px; border-radius: 6px; background: rgba(255,255,255,0.1);">${sMap.label}</span>
          </div>
        </div>
      </div>
    `;

    // Position directly over the marker
    const wrapper = document.getElementById('map-container');
    if (!wrapper) return;
    wrapper.appendChild(card);

    const markerPoint = map.latLngToContainerPoint(L.latLng(l.lat, l.lng));
    const cardW = 260, cardH = 200; // estimated dimensions
    const wrapperRect = wrapper.getBoundingClientRect();
    
    // Center above marker
    let left = markerPoint.x - (cardW / 2);
    let top  = markerPoint.y - cardH - 10;
    
    // Bounds checking
    if (left < 10) left = 10;
    if (left + cardW > wrapperRect.width - 10) left = wrapperRect.width - cardW - 10;
    if (top < 10) top = markerPoint.y + 20; // Show below if no space above

    card.style.left = left + 'px';
    card.style.top  = top + 'px';

    _mapHoverCard = card;
  }

  function hideMapHoverCard() {
    if (_mapHoverCard) { _mapHoverCard.remove(); _mapHoverCard = null; }
    if (_mapHoverTimeout) { clearTimeout(_mapHoverTimeout); _mapHoverTimeout = null; }
  }

  function addLeadToMap(l) {
    if (!l.lat || !l.lng) return null;
    const pinClass = getLeadStatusMap(l).mapPin;
    const icon = L.divIcon({ className: 'scout-marker', iconSize: [14, 14], iconAnchor: [7, 7], html: `<div class="map-pin ${pinClass}"></div>` });
    const popupHtml = `
      <div style="margin-bottom:12px;">
        <div style="font-weight:600; font-size:15px; margin-bottom:4px; color:var(--text-main);">${l.name}</div>
        <div style="font-size:12px; color:var(--text-muted);">📍 ${l.maps_city || 'Unbekannt'}</div>
      </div>
      <div style="display:flex; gap:6px; flex-direction:column;">
        <button onclick="handleLinkClick(event, 'web', '${escapeHtml(l.website_url||'')}', ${l.id}, '${escapeHtml(l.name.replace(/'/g, "\\'"))}')" class="action-btn-small outline" style="width:100%; border-color:var(--border); color:var(--text-main); padding:6px; font-size:11px;">🌐 Zur Website</button>
        <button onclick="handleLinkClick(event, 'maps', '${escapeHtml(l.google_maps_url||l.google_place_id||'')}', ${l.id}, '${escapeHtml(l.name.replace(/'/g, "\\'"))}')" class="action-btn-small outline" style="width:100%; border-color:var(--border); color:var(--text-main); padding:6px; font-size:11px;">🗺️ In Google Maps öffnen</button>
      </div>
    `;
    const m = L.marker([l.lat, l.lng], {icon}).addTo(map).bindPopup(popupHtml);
    m.on('click', () => {
      hideMapHoverCard();
      map.setView([l.lat, l.lng], 16, { animate: true });
      const mapSide = document.getElementById('map-sidebar');
      if (mapSide) mapSide.style.display = 'none';
      document.getElementById('main-sidebar').style.display = 'flex';
      openLead(l.id);
    });
    m.on('mouseover', (e) => {
      _mapHoverTimeout = setTimeout(() => showMapHoverCard(l, e.containerPoint), 80);
    });
    m.on('mouseout', () => hideMapHoverCard());
    m.leadId = l.id;
    mapMarkers.push(m);
    return m;
  }

  window.currentMapStatusFilter = 'all';
  window.currentMapUserFilter = 'all';

  window.setMapStatusFilter = (val, btnElem) => {
    window.currentMapStatusFilter = val;
    if (btnElem && btnElem.parentElement) {
      btnElem.parentElement.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
      btnElem.classList.add('active');
    }
    if (window.loadMapData) window.loadMapData();
  };

  window.setMapUserFilter = (val, btnElem) => {
    window.currentMapUserFilter = val;
    if (btnElem && btnElem.parentElement) {
      btnElem.parentElement.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
      btnElem.classList.add('active');
    }
    if (window.loadMapData) window.loadMapData();
  };

  window.loadMapData = async function(filters = { all: true }) {
    if (!map) initMap();
    const leads = (await window.api.getLeads(filters)).filter(l => l.status === 'Lead' || l.status === 'Kunde');
    mapMarkers.forEach(m => map.removeLayer(m));
    mapMarkers = [];
    let count = 0;
    
    const mapStatusFilter = window.currentMapStatusFilter;
    const mapUserFilter = window.currentMapUserFilter;

    leads.forEach(l => {
      const sMap = getLeadStatusMap(l);
      // Filter out cold leads from map display
      if (sMap.label === 'Kalt') return;
      
      // Apply Status Filter
      if (mapStatusFilter !== 'all' && sMap.label !== mapStatusFilter) return;
      
      // Apply User Filter
      if (mapUserFilter !== 'all' && l.claimed_by !== mapUserFilter) return;

      const m = addLeadToMap(l);
      if (m) count++;
    });
    console.log("Loaded map markers:", count);
  };
  // Keeping the local alias for backwards compatibility internally if used
  const loadMapData = window.loadMapData;

  let isFlyingToLead = false;

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
    await openLead(id);
    
    setTimeout(async () => {
      if(map) {
         let m = mapMarkers.find(x => x.leadId === id);
         if (!m) {
           const leads = await window.api.getLeads({all:true});
           const l = leads.find(x => x.id === id);
           if (l) {
             m = addLeadToMap(l);
           }
         }
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
    hideMapHoverCard();
    
    // Fix Lead Selection State Bug: clear selection globally
    window._currentSelectedLeadId = null;
    
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    if(document.getElementById(`nav-${tab}`)) document.getElementById(`nav-${tab}`).classList.add('active');
    
    document.getElementById('map-wrapper').style.display = tab === 'map' ? 'flex' : 'none';
    if(document.getElementById('scout-wrapper')) document.getElementById('scout-wrapper').style.display = tab === 'scout' ? 'flex' : 'none';
    if(document.getElementById('dashboard-wrapper')) document.getElementById('dashboard-wrapper').style.display = tab === 'dashboard' ? 'flex' : 'none';
    if(document.getElementById('main-list-wrapper')) document.getElementById('main-list-wrapper').style.display = (tab !== 'map' && tab !== 'scout' && tab !== 'dashboard') ? 'flex' : 'none';
    
    document.getElementById('main-sidebar').style.display = (tab === 'scout' || tab === 'dashboard') ? 'none' : 'flex';
    document.querySelector('.main-content').style.display = (tab === 'map' || tab === 'scout' || tab === 'dashboard') ? 'none' : 'flex';

    if (tab === 'map') {
      setTimeout(() => { if (map) map.invalidateSize(); }, 100);
    }
    
    if (tab === 'scout') {
      if (typeof window.loadApiKey === 'function') window.loadApiKey();
    }
    
    const hiddenTabs = ['scout', 'projects', 'dashboard'];
    document.getElementById('qa-container').style.display = hiddenTabs.includes(tab) ? 'none' : 'flex';
    document.getElementById('filters-container').style.display = hiddenTabs.includes(tab) ? 'none' : 'flex';
    
    if (typeof window.renderEmptySidebar === 'function') {
      window.renderEmptySidebar();
    } else {
      sidebar.innerHTML = `<div class="empty-state">Nächsten Lead wählen</div>`;
    }
    
    isBulkMode = false;
    selectedBulkIds.clear();
    const bulkBar = document.getElementById('bulk-action-bar');
    if (bulkBar) bulkBar.style.display = 'none';

    currentFilter1 = 'all';
    currentFilter2 = 'all';
    
    if (tab === 'dashboard') {
      if (typeof window.renderDashboard === 'function') {
        window.renderDashboard();
      }
    } else {
      currentSearch = ''; 
      currentColdCallFilter = 'all';
      if(document.getElementById('search-input')) document.getElementById('search-input').value = '';
      await loadUi();
    }
  };

  window.toggleAdvancedMode = () => {
    const panel = document.getElementById('scout-advanced-panel');
    const btn = document.getElementById('adv-toggle-btn');
    if (!panel || !btn) return;
    
    if (panel.style.display === 'none') {
      panel.style.display = 'block';
      btn.style.background = 'var(--accent)';
      btn.style.color = '#fff';
      btn.style.borderColor = 'var(--accent)';
    } else {
      panel.style.display = 'none';
      btn.style.background = 'var(--surface)';
      btn.style.color = 'var(--text-main)';
      btn.style.borderColor = 'var(--border)';
    }
  };

  async function loadUi() {
    if (typeof window.updateExcludedCount === 'function') {
      window.updateExcludedCount();
    }
    if (currentTab === 'scout') return;

    // Projects tab has its own renderer
    if (currentTab === 'projects') {
      if (typeof window.renderProjectsTab === 'function') await window.renderProjectsTab();
      return;
    }

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
      let leads = await window.api.getLeads(filters);
      // Frontend-level safeguard: Ensure Uninteressant leads are never shown in active CRM tabs
      leads = leads.filter(l => l.status !== 'Uninteressant');
      renderQueue(leads);
    }
    
    if (!window._currentSelectedLeadId) {
      if (typeof window.renderEmptySidebar === 'function') {
        window.renderEmptySidebar();
      }
    }
  }

  function renderFilterButtons() {
    const group2 = document.getElementById('filter-group-2');
    if (!group2) return;

    if (window.globalUser && window.globalUser.role === 'admin') {
      group2.style.display = 'flex';
      let opts2 = [
        { id: 'all', label: 'Alle User' }
      ];
      if (window.globalUsersList) {
        window.globalUsersList.forEach(u => {
          opts2.push({ id: u.id, label: escapeHtml(u.name || 'Unknown') });
        });
      }

      group2.innerHTML = opts2.map(o => `
        <button class="chip ${currentFilter2 === o.id ? 'active' : ''}" onclick="setFilter(2, '${o.id}')">${o.label}</button>
      `).join('');

      // Also render map filters
      const mapUserRow = document.getElementById('map-user-filter-row');
      const mapUserBtns = document.getElementById('map-user-btns');
      if (mapUserRow && mapUserBtns) {
        mapUserRow.style.display = 'flex';
        mapUserBtns.innerHTML = opts2.map(o => `
          <button class="chip ${window.currentMapUserFilter === o.id ? 'active' : ''}" onclick="setMapUserFilter('${o.id}', this)">${o.label}</button>
        `).join('');
      }

    } else {
      group2.style.display = 'none';
      group2.innerHTML = '';
      currentFilter2 = 'all';

      const mapUserRow = document.getElementById('map-user-filter-row');
      if (mapUserRow) mapUserRow.style.display = 'none';
    }
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

  // ── Helper: has active email task ────────────────────────────────────────────
  function hasActiveEmailTask(lead) {
    if (!lead.task_text) return false;
    try {
      const tasks = JSON.parse(lead.task_text);
      if (!Array.isArray(tasks)) return false;
      return tasks.some(t => !t.done && (
        t.text.toLowerCase().includes('email') ||
        t.text.toLowerCase().includes('mail')
      ));
    } catch(e) {
      const lower = (lead.task_text || '').toLowerCase();
      return lower.includes('email') || lower.includes('mail');
    }
  }

  function renderQueue(leads) {
    if(!leads || leads.length === 0) {
      let stateMsg = "Pick up the phone and start dialing.";
      if (currentSearch) stateMsg = `Kein Lead für "${currentSearch}" gefunden.`;
      qList.innerHTML = `<div class="empty-state">${stateMsg}</div>`;
      return;
    }
    
    let tabTitle = currentTab === 'queue' ? 'Pipeline' : (currentTab === 'cold' ? 'Kaltakquise' : (currentTab === 'tasks' ? 'Aufgaben' : (currentTab === 'customers' ? 'Kunden' : 'Radar')));
    if (currentSearch) tabTitle = `Globale Suche: "${currentSearch}"`;

    const renderLeadList = (list) => list.map(l => {
        const sMap = getLeadStatusMap(l);
        let titleColor = sMap.color;
        let milestone = sMap.label;
        if (sMap.isTask) {
           milestone += ' +';
        }

        const isSnoozed = (l.snooze_until_ms || 0) > Date.now();
        let snoozeBadge = '';
        if (isSnoozed) {
          const snoozeDate = new Date(l.snooze_until_ms);
          const dateStr = snoozeDate.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
          snoozeBadge = `<div style="font-size: 11px; margin-top: 6px; color: var(--success); display: flex; align-items: center; gap: 4px; font-weight: 500;">🕒 Snoozed bis: ${dateStr}</div>`;
        }

        // F6 removed: no call_status badge on lead cards
        let callStatusBadge = '';

        let activityLog = '';
        if (l.call_history && l.call_history.length > 0) {
           let lastCall = null;
           let lastEmail = null;
           
           for (let i = l.call_history.length - 1; i >= 0; i--) {
             const entry = l.call_history[i];
             if (typeof entry === 'number') {
               if (!lastCall) lastCall = { ts: entry, by_user_name: 'Unbekannt' };
               continue;
             }
             const type = entry.type || 'call';
             if (type === 'call' && !lastCall) lastCall = entry;
             if (type === 'email' && !lastEmail) lastEmail = entry;
             if (lastCall && lastEmail) break;
           }

           let callHtml = '';
           if (lastCall && (lastCall.by_user_name || typeof lastCall.ts === 'number')) {
             const uname = lastCall.by_user_name || 'Unbekannt';
             const dateStr = new Date(lastCall.ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
             const timeStr = new Date(lastCall.ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
             callHtml = `<div style="font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; font-weight: 500;">📞 Letzter Anruf: ${uname} (${dateStr} ${timeStr})</div>`;
           }

           let emailHtml = '';
           if (lastEmail && lastEmail.by_user_name) {
             const uname = lastEmail.by_user_name || 'Unbekannt';
             const dateStr = new Date(lastEmail.ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
             const timeStr = new Date(lastEmail.ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
             emailHtml = `<div style="font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; font-weight: 500;">✉️ Letzte E-Mail: ${uname} (${dateStr} ${timeStr})</div>`;
           }
           
           if (callHtml || emailHtml) {
             activityLog = `<div style="margin-top: 6px; display: flex; flex-direction: column; gap: 2px;">${callHtml}${emailHtml}</div>`;
           }
        }

        let avatarHtml = '';
        if (l.claimed_by && window.globalUsersList) {
           const assignedUser = window.globalUsersList.find(u => u.id === l.claimed_by);
           if (assignedUser && assignedUser.name) {
             const initial = assignedUser.name.charAt(0).toUpperCase();
             avatarHtml = `<div style="width: 20px; height: 20px; border-radius: 50%; border: 1px solid #bf5af2; color: #bf5af2; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; position: absolute; bottom: 12px; right: 12px; background: transparent;" title="Zugewiesen an: ${assignedUser.name}">${initial}</div>`;
           }
        }

        let opacityStyle = (isSnoozed && currentTab !== 'cold') ? 'opacity: 0.55;' : '';
        let bulkStyle = (isBulkMode && selectedBulkIds.has(l.id)) ? 'outline: 2px solid var(--accent);' : '';
        let cboxHtml = isBulkMode ? `<input type="checkbox" style="position:absolute; top:12px; right:12px; pointer-events:none; transform:scale(1.2);" ${selectedBulkIds.has(l.id) ? 'checked' : ''}>` : '';
        let starHtml = l.starred ? `<span style="color: #ffcc00; font-size: 14px; margin-left: 8px;" title="Priorisierter Lead">★</span>` : '';

        let isStarredClass = l.starred ? 'is-starred' : '';

        return `
        <div class="lead-card ${window._currentSelectedLeadId === l.id ? 'active-lead-card' : ''} ${isStarredClass}" style="${opacityStyle} ${bulkStyle} position: relative;" onclick="handleLeadClick(${l.id})" id="lead-card-${l.id}">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
            <div class="lead-prio ${titleColor}" style="margin-bottom:0;">${milestone}</div>
            <div style="display:flex; align-items:center; gap:6px;">
              ${starHtml}
            </div>
          </div>
          <div class="lead-name truncate-1" style="margin-bottom:0; padding-right: 24px; width: 100%;">
            <span>${l.name}</span>
          </div>
          ${activityLog}
          ${snoozeBadge}
          ${cboxHtml}
          ${avatarHtml}
        </div>
        `;
    }).join('');

    if (currentTab === 'queue' && !currentSearch) {
      // KANBAN VIEW (CRM)
      
      const sortKanban = (list) => {
        return list.sort((a,b) => {
          const now = Date.now();
          const snoozedA = (a.snooze_until_ms && a.snooze_until_ms > now) ? 1 : 0;
          const snoozedB = (b.snooze_until_ms && b.snooze_until_ms > now) ? 1 : 0;
          if (snoozedA !== snoozedB) return snoozedA - snoozedB;
          if (snoozedA === 1 && snoozedB === 1) {
            return a.snooze_until_ms - b.snooze_until_ms;
          }

          // 0. Starred Status
          const starA = a.starred ? 1 : 0;
          const starB = b.starred ? 1 : 0;
          if (starA !== starB) return starB - starA;

          if (a.size === 'Großkunde' && b.size !== 'Großkunde') return -1;
          if (b.size === 'Großkunde' && a.size !== 'Großkunde') return 1;
          return 0; // maintain original sorting
        });
      };

      const crmLeads = leads.filter(l => l.entscheider || l.termin || l.rechnung);

      const entscheider = sortKanban(crmLeads.filter(l => l.entscheider === 1 && !l.termin && !l.rechnung && l.status === 'Lead'));
      const termin = sortKanban(crmLeads.filter(l => l.termin === 1 && !l.rechnung && l.status === 'Lead'));
      const rechnung = sortKanban(crmLeads.filter(l => l.rechnung === 1 && l.status === 'Lead'));

      const colHtml = (title, list) => `
        <div class="kanban-column">
          <div class="kanban-header">
            <div class="kanban-title">${title}</div>
            <div class="kanban-count">${list.length}</div>
          </div>
          <div class="kanban-cards">
            ${list.length === 0 ? '<div class="empty-state" style="height:40px; font-size:12px;">Pick up the phone and start dialing.</div>' : renderLeadList(list)}
          </div>
        </div>
      `;

      qList.innerHTML = `
        <div class="list-header" style="display:flex; align-items:center; justify-content:space-between; width:100%;">
          <span>${tabTitle} (Pipeline)</span>
          <button id="bulk-mode-btn" class="action-btn-small ${isBulkMode ? 'outline' : ''}" onclick="toggleBulkMode()">
            ${isBulkMode ? 'Auswahl abbrechen' : 'Mehrfachauswahl'}
          </button>
        </div>
        <div class="kanban-board">
          ${colHtml('Entscheider', entscheider)}
          ${colHtml('Kontakt', termin)}
          ${colHtml('Rechnung', rechnung)}
        </div>
      `;
    } else if (currentTab === 'cold' && !currentSearch) {
      // COLD CALLING STATION VIEW
      let coldLeads = leads.filter(l => !l.entscheider && !l.termin && !l.rechnung && l.status === 'Lead');

      // F6: Apply call status filter
      let filteredByStatus = coldLeads;
      if (currentColdCallFilter !== 'all') {
        filteredByStatus = coldLeads.filter(l => (l.call_status || 'never') === currentColdCallFilter);
      }

      let activeLeads = filteredByStatus.filter(l => (l.snooze_until_ms || 0) <= Date.now());
      let snoozedLeads = filteredByStatus.filter(l => (l.snooze_until_ms || 0) > Date.now());
      
      window._currentColdLeads = activeLeads.map(l => l.id);

      // --- Grouping by Import Block ---
      activeLeads.sort((a, b) => {
        const timeA = a.created_at || 0;
        const timeB = b.created_at || 0;
        if (timeA !== timeB) return timeB - timeA;
        return b.id - a.id;
      });

      let groupedHtml = '';
      let currentBlockLeads = [];
      let currentBlockTime = null;
      const THRESHOLD = 30 * 60 * 1000; // 30 minutes window

      const renderBlock = (timeMs, leadsArr) => {
        let timeStr = "Ältere Leads";
        if (timeMs > 0) {
          const d = new Date(timeMs);
          const datePart = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
          const timePart = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute:'2-digit' });
          timeStr = "Import am " + datePart + " (ca. " + timePart + " Uhr)";
        }
        
        leadsArr.sort((a,b) => {
          const starA = a.starred ? 1 : 0;
          const starB = b.starred ? 1 : 0;
          if (starA !== starB) return starB - starA;
          return b.id - a.id;
        });

        return '<div style="margin-top: 24px; margin-bottom: 12px; font-size: 13px; font-weight: 600; color: var(--accent); border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px;">' +
                 timeStr + ' <span style="color:var(--text-muted); font-weight:normal; font-size:12px;">(' + leadsArr.length + ' Leads)</span>' +
               '</div>' +
               '<div class="leads-grid">' +
                 renderLeadList(leadsArr) +
               '</div>';
      };

      activeLeads.forEach(l => {
        const time = l.created_at || 0;
        if (currentBlockTime === null) {
          currentBlockTime = time;
          currentBlockLeads.push(l);
        } else {
          if (time === 0 && currentBlockTime === 0) {
             currentBlockLeads.push(l);
          } else if (time > 0 && currentBlockTime > 0 && Math.abs(currentBlockTime - time) <= THRESHOLD) {
             currentBlockLeads.push(l);
          } else {
             groupedHtml += renderBlock(currentBlockTime, currentBlockLeads);
             currentBlockTime = time;
             currentBlockLeads = [l];
          }
        }
      });
      if (currentBlockLeads.length > 0) {
        groupedHtml += renderBlock(currentBlockTime, currentBlockLeads);
      }
      // --------------------------------

      // No call status filter chips (req 5: simplified)
      qList.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; width:100%; margin-bottom:12px;">
          <div class="list-header" style="margin-bottom:0;">${tabTitle} (${activeLeads.length} Leads)</div>
          <button id="bulk-mode-btn" class="action-btn-small ${isBulkMode ? 'outline' : ''}" onclick="toggleBulkMode()">
            ${isBulkMode ? 'Auswahl abbrechen' : 'Mehrfachauswahl'}
          </button>
        </div>
        ${groupedHtml}
        
        ${snoozedLeads.length > 0 ? `
          <div class="list-header" style="margin-top:32px; opacity:0.6;">Zukünftig (Snoozed) (${snoozedLeads.length})</div>
          <div class="leads-grid" style="opacity: 0.6;">
            ${renderLeadList(snoozedLeads)}
          </div>
        ` : ''}
      `;
    } else if (currentTab === 'tasks' && !currentSearch) {
      // TASKS DASHBOARD VIEW
      let leadsWithTasks = leads.filter(l => {
         if (window.globalUser && window.globalUser.role !== 'admin' && l.claimed_by !== window.globalUser.id) return false;
         if (!l.task_text) return false;
         try {
           const arr = JSON.parse(l.task_text);
           return Array.isArray(arr) && arr.some(t => !t.done);
         } catch(e) { return false; }
      });

      let allTasks = [];
      leadsWithTasks.forEach(lead => {
         try { 
           const tasks = JSON.parse(lead.task_text).filter(t => !t.done);
           tasks.forEach(t => {
               const isEmail = t.text.toLowerCase().includes('email') || t.text.toLowerCase().includes('mail');
               allTasks.push({ lead, task: t, isEmail });
           });
         } catch(e) {}
      });

      if (allTasks.length === 0) {
        qList.innerHTML = `<div class="empty-state">🎉 Zero Inbox! Keine offenen Aufgaben für dich.</div>`;
        return;
      }

      const getScore = (l) => {
          if (l.status === 'Kunde') return 4;
          if (l.rechnung) return 3;
          if (l.termin) return 2;
          if (l.entscheider) return 1;
          return 0;
      };

      // Sort by global logic
      allTasks.sort((a, b) => {
          const starA = a.lead.starred ? 1 : 0;
          const starB = b.lead.starred ? 1 : 0;
          if (starA !== starB) return starB - starA;
          
          const scoreA = getScore(a.lead);
          const scoreB = getScore(b.lead);
          if (scoreA !== scoreB) return scoreB - scoreA;
          
          return b.lead.id - a.lead.id;
      });

      const emailTasks = allTasks.filter(t => t.isEmail);
      const generalTasks = allTasks.filter(t => !t.isEmail);

      const renderTaskRow = (item) => {
         const { lead, task } = item;
         let avatarHtml = '';
         if (lead.claimed_by && window.globalUsersList) {
            const assignedUser = window.globalUsersList.find(u => u.id === lead.claimed_by);
            if (assignedUser && assignedUser.name) {
              const initial = assignedUser.name.charAt(0).toUpperCase();
              avatarHtml = `<div style="width: 20px; height: 20px; border-radius: 50%; border: 1px solid #bf5af2; color: #bf5af2; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; background: transparent; flex-shrink: 0;" title="Zugewiesen an: ${assignedUser.name}">${initial}</div>`;
            }
         }

         return `
           <div class="task-row-item" style="display:flex; align-items:flex-start; gap: 12px; padding:16px 20px; border-bottom:1px solid rgba(255,255,255,0.03); transition:background 0.2s ease;" onmouseover="this.style.background='var(--surface-hover)'" onmouseout="this.style.background='transparent'">
             <input type="checkbox" style="margin-top:2px; cursor:pointer; flex-shrink:0;" onchange="toggleTaskFast(${lead.id}, ${task.id}, this.checked)">
             <div style="flex:1; min-width:0;">
               <div contenteditable="true" class="truncate-1" style="outline:none; font-size:14px; color:var(--text-main); line-height:1.5;" onblur="updateGlobalTaskText(${lead.id}, ${task.id}, this.innerText)" onclick="event.stopPropagation()">${escapeHtml(task.text)}</div>
               <div style="font-size: 12px; margin-top: 8px; display: flex; align-items: center; gap: 8px;">
                 <a href="#" onclick="event.preventDefault(); openLead(${lead.id})" style="color: var(--accent); text-decoration: none; font-weight: 600; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                   ${lead.starred ? '★ ' : ''}${escapeHtml(lead.name)}
                 </a>
               </div>
             </div>
             ${avatarHtml}
           </div>
         `;
      };

      let html = `<div class="list-header" style="margin-bottom:24px;">Aufgaben Dashboard (${allTasks.length} offene Aufgaben)</div>`;
      html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:32px; align-items: start; max-width: 100%;">`;

      let generalHtml = `<div></div>`;
      if (generalTasks.length > 0) {
        generalHtml = `
          <div>
            <div style="font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; padding-left: 8px;">Normale Aufgaben</div>
            <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden;">
              ${generalTasks.map(t => renderTaskRow(t)).join('')}
            </div>
          </div>
        `;
      }

      let emailHtml = `<div></div>`;
      if (emailTasks.length > 0) {
        emailHtml = `
          <div>
            <div style="font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; padding-left: 8px;">E-Mail Aufgaben</div>
            <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden;">
              ${emailTasks.map(t => renderTaskRow(t)).join('')}
            </div>
          </div>
        `;
      }

      html += generalHtml + emailHtml;
      html += `</div>`;
      qList.innerHTML = html;


    } else if (currentTab === 'customers' && !currentSearch) {
      // CUSTOMERS VIEW
      let customerLeads = leads.filter(l => l.status === 'Kunde');
      qList.innerHTML = `
        <div class="list-header" style="display:flex; align-items:center; justify-content:space-between; width:100%;">
          <span>${tabTitle} (${customerLeads.length} Kunden)</span>
          <button id="bulk-mode-btn" class="action-btn-small ${isBulkMode ? 'outline' : ''}" onclick="toggleBulkMode()">
            ${isBulkMode ? 'Auswahl abbrechen' : 'Mehrfachauswahl'}
          </button>
        </div>
        <div class="leads-grid">
          ${renderLeadList(customerLeads)}
        </div>
      `;

    } else {
      // LIST VIEW (Search, Radar)
      let activeLeads = leads;
      let snoozedLeads = [];

      qList.innerHTML = `
        <div class="list-header" style="display:flex; align-items:center; justify-content:space-between; width:100%; ${currentSearch ? 'color: var(--accent);' : ''}">
          <span>${tabTitle} (${activeLeads.length})</span>
          <button id="bulk-mode-btn" class="action-btn-small ${isBulkMode ? 'outline' : ''}" onclick="toggleBulkMode()">
            ${isBulkMode ? 'Auswahl abbrechen' : 'Mehrfachauswahl'}
          </button>
        </div>
        <div class="leads-grid">
          ${renderLeadList(activeLeads)}
        </div>
      `;
    }
  }

  window.openLead = async (id, keepForceLocationSearch = false) => {
    if (window._currentSelectedLeadId && window._currentSelectedLeadId !== id) {
      if (typeof window.checkUnsavedChangesBeforeClose === 'function') {
        window.checkUnsavedChangesBeforeClose(window._currentSelectedLeadId, () => {
          window.openLeadDirectly(id, keepForceLocationSearch);
        });
        return;
      }
    }
    window.openLeadDirectly(id, keepForceLocationSearch);
  };

  window._sessionRecentLeads = window._sessionRecentLeads || new Set();

  window.openLeadDirectly = async (id, keepForceLocationSearch = false) => {
    if (!keepForceLocationSearch) window._forceLocationSearch = false;
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
    window._clearSnooze = false;
    window._pendingCallLog = false;
    isTaskMode = false;
    isKundeMode = false;

    let actionButtons = '';
    const isKunde = l.status === 'Kunde';
    const isSnoozed = l.snooze_until_ms > Date.now();

    // Call History Dropdown Removed.
    let historyHtml = '';
    
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
    const gCalText = encodeURIComponent(`Follow-Up: ${l.name}`);
    const gCalDetails = encodeURIComponent(`Firma: ${l.name}\nTelefon: ${l.phone || 'Keine'}\nURL: ${l.website_url || ''}\n\nNotizen:\n${l.notes || ''}`);
    const gCalUrl = `https://calendar.google.com/calendar/r/eventedit?text=${gCalText}&details=${gCalDetails}`;

    let snoozeHtml = `
      <div style="margin-top: 16px;">
        <label style="font-size:12px; color:var(--text-muted); margin-bottom:8px; display:block; font-weight:600;">Follow-Up (Snooze)</label>
        <div class="snooze-grid" id="snooze-group" style="display: flex; gap: 8px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 120px; display: flex; align-items: stretch;">
            <input type="number" id="snooze-hours-input" value="${(currentSnoozeOffset > 0 && currentSnoozeOffset <= 24) ? currentSnoozeOffset : 24}" style="width: 40px; border-radius: 6px 0 0 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); color: var(--text-main); text-align: center; font-size: 13px; box-sizing: border-box;" onchange="if(currentSnoozeOffset > 0 && currentSnoozeOffset <= 24) selectCustomSnoozeHours()">
            <button class="action-btn snooze-opt ${(currentSnoozeOffset > 0 && currentSnoozeOffset <= 24) ? 'outline' : ''}" id="snz-hours" onclick="selectCustomSnoozeHours()" style="flex: 1; border-radius: 0 6px 6px 0; padding-left: 0; padding-right: 0;">Std.</button>
          </div>
          <div style="flex: 1; min-width: 120px; display: flex; align-items: stretch;">
            <input type="number" id="snooze-days-input" value="${currentSnoozeOffset > 24 ? currentSnoozeOffset / 24 : 7}" style="width: 40px; border-radius: 6px 0 0 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); color: var(--text-main); text-align: center; font-size: 13px; box-sizing: border-box;" onchange="if(currentSnoozeOffset > 24) selectCustomSnooze()">
            <button class="action-btn snooze-opt ${currentSnoozeOffset > 24 ? 'outline' : ''}" id="snz-custom" onclick="selectCustomSnooze()" style="flex: 1; border-radius: 0 6px 6px 0; padding-left: 0; padding-right: 0;">Tage</button>
          </div>
        </div>
        ${isSnoozed ? `<div id="cancel-snooze-container" style="margin-top: 12px; text-align: center;"><button type="button" class="action-btn-small" style="border:1px dashed #ff453a; color:#ff453a; background:transparent; width:100%; padding: 8px;" onclick="cancelSnooze()">Snooze aufheben</button></div>` : ''}
      </div>
    `;

    // Removed Reminder Block

    let calendarHtml = ``;

    let customerContractHtml = ``;

    let locListHtml = '';
    const locations = Array.isArray(l.locations) ? [...l.locations] : [];
    if (locations.length === 0 && l.lat && l.lng && l.maps_city) {
      locations.push({
        name: l.name,
        address: l.maps_city,
        lat: l.lat,
        lng: l.lng,
        place_id: l.google_place_id || '',
        source: 'legacy'
      });
    }

    if (locations.length > 0) {
      locListHtml = locations.map((loc, idx) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 4px 0;">
          <div style="font-size:12px; cursor:pointer; color:var(--text-main);" onclick="window.flyToMap(${l.id})">
            ${escapeHtml(loc.address || loc.name || 'Unbekannte Adresse')}
          </div>
          <button style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:12px; padding:4px;" onclick="removeLocation(${l.id}, ${idx})" title="Entfernen">✕</button>
        </div>
      `).join('');
    } else {
      locListHtml = `
        <div style="padding: 4px 0; font-size: 12px; color: var(--text-muted); cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='var(--text-main)'" onmouseout="this.style.color='var(--text-muted)'" onclick="window.handlePinDoubleClick(${l.id})">
          + Standort hinzufügen
        </div>
      `;
    }

    let locationMatchingHtml = `
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
        <label style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px; display:block;">Standort</label>
        ${locListHtml}
        <div id="loc-search-container" style="display:${window._forceLocationSearch ? 'block' : 'none'}; margin-top:8px;">
          <div style="display: flex; gap: 8px; margin-bottom: 8px;">
            <input type="text" id="loc-search-input" class="modern-input-small" style="font-size: 11px; padding: 6px 8px; flex:1;" value="${escapeHtml(l.name)}" placeholder="Firma, Ort..." />
            <button class="action-btn-small" style="background: var(--accent); color: white; border-color: var(--accent); font-weight: 600; font-size: 11px; padding: 6px 12px;" onclick="searchLeadLocation(${l.id})">Suchen</button>
          </div>
          <div id="loc-search-results" style="max-height: 150px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;"></div>
        </div>
      </div>
    `;

    const e = l.entscheider || 0;
    const t = l.termin || 0;
    const r = l.rechnung || 0;

    sidebar.innerHTML = `
      <div class="focused-lead" style="display:flex; flex-direction:column; height:100%;">
        <!-- HEADER ROW: Unternehmen + Pin -->
        <div class="sidebar-header" style="padding: 24px 24px 0 24px; flex-shrink: 0;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 4px;">
             <div id="sys-name" class="focused-name truncate-1" contenteditable="true" style="outline:none; padding:4px 0; max-width:75%; border-bottom:1px solid transparent; transition:0.2s;" onfocus="this.style.borderBottom='1px solid var(--accent)';" onblur="this.style.borderBottom='1px solid transparent';">${escapeHtml(l.name)}</div>
             <div style="display:flex; gap:8px; align-items: center;">
               <button id="sidebar-star-btn" data-starred="${l.starred ? 1 : 0}" class="action-btn-small" style="background:transparent; border:none; font-size:20px; cursor:pointer; padding:0; color: ${l.starred ? '#ffcc00' : 'var(--text-muted)'};" onclick="toggleLeadStar(${l.id})" title="Priorisieren (Stern)">${l.starred ? '★' : '☆'}</button>
               <button class="action-btn-small" style="background:transparent; border:none; font-size:16px; cursor:pointer; padding:0; color:var(--text-muted);" onclick="closeLeadSidebar()" title="Lead abwählen">✕</button>
             </div>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom: 16px; min-height: 32px;">
             <div style="display:flex; justify-content:space-between; align-items:center;">
               <input type="text" id="sys-phone" style="font-family:ui-monospace, monospace; font-size:15px; font-weight:500; padding:4px 0; background:transparent; border:none; border-bottom:1px solid transparent; outline:none; transition:0.2s; color:var(--text-muted); flex: 1; margin-right: 16px;" value="${escapeHtml(l.phone || '')}" placeholder="Keine Nummer" onfocus="this.style.borderBottom='1px solid var(--accent)';" onblur="this.style.borderBottom='1px solid transparent';">
               <button style="background:transparent; border:none; padding:4px 8px; font-size:11px; color:var(--accent); font-weight:600; cursor:pointer;" onclick="copyPhone(event, ${l.id}, '${escapeHtml(l.phone || '')}')">Copy & Track</button>
             </div>
             <div style="display:flex; justify-content:space-between; align-items:center;">
               <input type="text" id="sys-email" style="font-family:ui-monospace, monospace; font-size:15px; font-weight:500; padding:4px 0; background:transparent; border:none; border-bottom:1px solid transparent; outline:none; transition:0.2s; color:var(--text-muted); flex: 1; margin-right: 16px;" value="${escapeHtml(l.email || '')}" placeholder="Keine E-Mail" onfocus="this.style.borderBottom='1px solid var(--accent)';" onblur="this.style.borderBottom='1px solid transparent';">
               <button style="background:transparent; border:none; padding:4px 8px; font-size:11px; color:var(--accent); font-weight:600; cursor:pointer;" onclick="copyEmail(event, ${l.id}, '${escapeHtml(l.email || '')}')">Copy & Track</button>
             </div>
          </div>
          ${(() => {
             let lastCall = null;
             let lastEmail = null;
             if (l.call_history && l.call_history.length > 0) {
               for (let i = l.call_history.length - 1; i >= 0; i--) {
                 const entry = l.call_history[i];
                 if (typeof entry === 'number') {
                   if (!lastCall) lastCall = { ts: entry };
                   continue;
                 }
                 const type = entry.type || 'call';
                 if (type === 'call' && !lastCall) lastCall = entry;
                 if (type === 'email' && !lastEmail) lastEmail = entry;
                 if (lastCall && lastEmail) break;
               }
             }
             
             let html = '<div style="display:flex; flex-direction:column; gap:4px; margin-bottom: 16px;">';
             
             if (lastCall && lastCall.ts > 0) {
               const dateStr = new Date(lastCall.ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
               html += `<div style="font-size:12px; color:var(--text-muted); display:flex; align-items:center; gap:6px;"><span>📞 Letzter Anruf:</span> <strong style="color:var(--text-main); font-weight:600;">${dateStr} Uhr</strong></div>`;
             } else {
               html += `<div style="font-size:12px; color:var(--text-muted); display:flex; align-items:center; gap:6px;"><span>📞 Letzter Anruf:</span> <span style="font-style:italic; color:var(--text-muted);">Keine Daten</span></div>`;
             }

             if (lastEmail && lastEmail.ts > 0) {
               const dateStr = new Date(lastEmail.ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
               html += `<div style="font-size:12px; color:var(--text-muted); display:flex; align-items:center; gap:6px;"><span>✉️ Letzte E-Mail:</span> <strong style="color:var(--text-main); font-weight:600;">${dateStr} Uhr</strong></div>`;
             } else {
               html += `<div style="font-size:12px; color:var(--text-muted); display:flex; align-items:center; gap:6px;"><span>✉️ Letzte E-Mail:</span> <span style="font-style:italic; color:var(--text-muted);">Keine Daten</span></div>`;
             }
             
             html += '</div>';
             return html;
          })()}
        </div>

        <div class="sidebar-body" style="flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 0 24px;">
          ${historyHtml}
          <!-- Divider removed since history is gone -->

          ${(() => {
            if (window.globalUser && window.globalUser.role === 'admin') {
               const users = window.globalUsersList || [];
               let optionsHtml = `<option value="unassigned">-- Niemandem zugewiesen --</option>`;
               users.forEach(u => {
                  optionsHtml += `<option value="${u.id}" ${l.claimed_by === u.id ? 'selected' : ''}>${escapeHtml(u.name || 'Unknown')} (${u.role})</option>`;
               });
               return `
                 <div style="margin-bottom: 24px; background: rgba(255,255,255,0.02); border: 1px solid var(--border); padding: 12px; border-radius: 8px;">
                   <label style="font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-bottom:6px; display:block;">Admin: Zuweisung</label>
                   <select id="admin-assign-select" class="modern-input-small" style="width:100%; padding: 8px; font-size: 13px;" onchange="window.saveAdminAssignment(${l.id}, this.value)">
                     ${optionsHtml}
                   </select>
                 </div>
               `;
            }
            return '';
          })()}

          ${(() => {
            let openingHoursHtml = '';
            let ohArray = null;
            if (l.opening_hours) {
              try { 
                const parsed = JSON.parse(l.opening_hours);
                if (parsed.weekdayDescriptions) ohArray = parsed.weekdayDescriptions;
                else if (Array.isArray(parsed)) ohArray = parsed;
              } catch(e) {}
            }
            if (!ohArray && locations.length > 0 && locations[0].opening_hours && Array.isArray(locations[0].opening_hours)) {
              ohArray = locations[0].opening_hours;
            }

            if (ohArray && Array.isArray(ohArray) && ohArray.length === 7) {
              const todayIdx = (new Date().getDay() + 6) % 7;
              let todayStr = ohArray[todayIdx] || '';
              openingHoursHtml = `
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 16px;">🕒</span>
                  <div style="font-size: 12px; color: var(--text-main); font-weight: 500;">
                    ${escapeHtml(todayStr)}
                  </div>
                </div>
              `;
            } else if (ohArray && Array.isArray(ohArray)) {
              let ohStr = ohArray.map(day => escapeHtml(day)).join('<br>');
              openingHoursHtml = `
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                  <label style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px; display:block;">Öffnungszeiten</label>
                  <div style="font-size: 11px; color: var(--text-main); line-height: 1.5;">${ohStr}</div>
                </div>
              `;
            }
            return openingHoursHtml;
          })()}

          ${locationMatchingHtml}

          <div class="actions">
            <!-- PIPELINE -->
            <input type="hidden" id="sys-e" value="${e}">
            <input type="hidden" id="sys-t" value="${t}">
            <input type="hidden" id="sys-r" value="${r}">
            <input type="hidden" id="sys-k" value="${isKunde ? 1 : 0}">
            
            <input type="hidden" id="sys-web" value="${escapeHtml(l.website_url||'')}">
            <input type="hidden" id="sys-placeid" value="${l.google_place_id||''}">
            <input type="hidden" id="sys-lat" value="${l.lat||''}">
            <input type="hidden" id="sys-lng" value="${l.lng||''}">
            <input type="hidden" id="sys-city" value="${escapeHtml(l.maps_city||'')}">

            <div class="pipeline-bar">
              <div id="seg-1" class="pipe-seg ${e || t || r || isKunde ? 'active-blue' : ''}" onclick="setPipeline('e')">Entscheider</div>
              <div id="seg-2" class="pipe-seg ${t || isKunde ? 'active-orange' : ''}" onclick="setPipeline('t')">Kontakt</div>
              <div id="seg-3" class="pipe-seg ${r || isKunde ? 'active-red' : ''}" onclick="setPipeline('r')">Rechnung</div>
              <div id="seg-4" class="pipe-seg ${isKunde ? 'active-success' : ''}" onclick="setPipeline('k')">Kunde</div>
            </div>

            <!-- The textarea is given flex:1 to stretch to the bottom -->
            <textarea id="note-input" class="modern-input" placeholder="Notizen..." style="width: 100%; box-sizing: border-box; min-height: 120px; flex: 1; margin-bottom:24px; resize: none;">${escapeHtml(l.notes || '')}</textarea>
            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 24px;">
              <label style="font-size:12px; color:var(--text-muted); margin-bottom:12px; display:block; font-weight:600;">Aufgaben</label>
              <div id="tasks-list" style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;"></div>
              <input type="text" id="new-task-input-rem" class="modern-input-small" style="width:100%; box-sizing:border-box; border:none; border-bottom:1px solid var(--border); border-radius:0; padding:8px 0; background:transparent;" placeholder="Aufgabe hinzufügen..." onkeypress="handleNewTaskKeyPress(event)" />
            </div>
            
            ${snoozeHtml}
            ${calendarHtml}
            
            <div style="display: flex; justify-content: center; gap: 24px; margin-top: 16px; margin-bottom: 16px;">
              <button class="action-btn-small" style="border:none; color:var(--text-muted); background:transparent; font-size: 11px; padding: 4px; cursor:pointer;" onclick="markLeadUninteresting(${l.id})">Uninteressant</button>
              <button class="action-btn-small" style="border:none; color:var(--text-muted); background:transparent; font-size: 11px; padding: 4px; cursor:pointer;" onclick="deleteLead(${l.id})">Löschen</button>
            </div>
          </div>
        </div>
        
        <div class="sidebar-footer" style="padding: 16px 24px 24px 24px; flex-shrink: 0; border-top: 1px solid var(--border); background: var(--bg-sidebar);">
          <button class="action-btn" id="main-save-btn" style="width:100%; padding: 14px; font-size:14px; font-weight:600; background:var(--text-main); color:var(--bg-sidebar); border:none;" onclick="saveLeadMain(${l.id})">Speichern</button>
        </div>
      </div>
    `;
    
    renderTasksList();
  };

  // --- NEW FEATURES: Pin Click, Call Tracking & Calendar ---
  
  window.closeLeadSidebar = () => {
    if (window._currentSelectedLeadId) {
      if (typeof window.checkUnsavedChangesBeforeClose === 'function') {
        window.checkUnsavedChangesBeforeClose(window._currentSelectedLeadId, () => {
          window._currentSelectedLeadId = null;
          document.querySelectorAll('.lead-card').forEach(c => c.classList.remove('active-lead-card'));
          if (typeof window.renderEmptySidebar === 'function') {
            window.renderEmptySidebar();
          } else {
            sidebar.innerHTML = `<div class="empty-state">Nächsten Lead wählen</div>`;
          }
        });
        return;
      }
    }
    
    window._currentSelectedLeadId = null;
    document.querySelectorAll('.lead-card').forEach(c => c.classList.remove('active-lead-card'));
    if (typeof window.renderEmptySidebar === 'function') {
      window.renderEmptySidebar();
    } else {
      sidebar.innerHTML = `<div class="empty-state">Nächsten Lead wählen</div>`;
    }
  };

  window.handleTaskDragStart = (e, leadId, taskId) => {
    e.dataTransfer.setData('text/plain', `${leadId}_${taskId}`);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
      e.target.style.opacity = '0.4';
    }, 0);
  };

  window.handleTaskDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const item = e.target.closest('.task-row-item');
    if (item) {
      item.style.borderTop = '2px solid var(--accent)';
    }
  };

  window.handleTaskDrop = (e, targetLeadId, targetTaskId) => {
    e.preventDefault();
    const item = e.target.closest('.task-row-item');
    if (item) item.style.borderTop = '';
    
    const sourceId = e.dataTransfer.getData('text/plain');
    const targetId = `${targetLeadId}_${targetTaskId}`;
    if (!sourceId || sourceId === targetId) return;

    let manualOrderStr = localStorage.getItem('task_order');
    let manualOrder = manualOrderStr ? JSON.parse(manualOrderStr) : [];
    
    if (!manualOrder.includes(sourceId)) manualOrder.push(sourceId);
    if (!manualOrder.includes(targetId)) manualOrder.push(targetId);

    const fromIdx = manualOrder.indexOf(sourceId);
    const toIdx = manualOrder.indexOf(targetId);

    manualOrder.splice(fromIdx, 1);
    manualOrder.splice(toIdx, 0, sourceId);

    localStorage.setItem('task_order', JSON.stringify(manualOrder));
    loadUi();
  };
  
  window.handleTaskDragEnd = (e) => {
    e.target.style.opacity = '1';
    document.querySelectorAll('.task-row-item').forEach(el => {
      el.style.borderTop = '';
    });
  };

  window.updateGlobalTaskText = async (leadId, taskId, newText) => {
    try {
      const fullList = await window.api.getLeads({ all: true });
      const l = fullList.find(x => x.id === leadId);
      if (!l) return;
      let tasks = [];
      try { tasks = JSON.parse(l.task_text); } catch(e){}
      const t = tasks.find(x => x.id === taskId);
      if (t) {
        t.text = newText.trim();
        l.task_text = JSON.stringify(tasks);
        await window.api.saveLead(l);
      }
    } catch(e) {
      console.error("Fehler beim Aktualisieren der Aufgabe", e);
    }
  };

  window.toggleTaskFast = async (leadId, taskId, done) => {
    try {
      const fullList = await window.api.getLeads({ all: true }); 
      const l = fullList.find(x => x.id === leadId);
      if (!l || !l.task_text) return;
      
      let tasks = [];
      try { tasks = JSON.parse(l.task_text); } catch(e) { return; }
      const t = tasks.find(x => x.id === taskId);
      if (t) {
         t.done = done;
         l.task_text = JSON.stringify(tasks);
         await window.api.saveLead(l);
         loadUi(); // refresh the view
      }
    } catch(e) { console.error(e); }
  };

  let pinClickTimer = null;
  window.handlePinClick = (id) => {
    if (pinClickTimer) {
      clearTimeout(pinClickTimer);
      pinClickTimer = null;
      window.handlePinDoubleClick(id);
    } else {
      pinClickTimer = setTimeout(() => {
        pinClickTimer = null;
        window.flyToMap(id);
      }, 250);
    }
  };

  window.searchLeadForMap = async (query) => {
    const resultsCont = document.getElementById('map-lead-results');
    if (!resultsCont) return;
    
    const leads = await window.api.getLeads({ all: true });
    let filtered = leads;
    if (query) {
      const q = query.toLowerCase();
      filtered = leads.filter(l => l.name.toLowerCase().includes(q) || (l.maps_city && l.maps_city.toLowerCase().includes(q)));
    } else {
      filtered = leads.filter(l => !l.lat && (!l.locations || l.locations.length === 0));
    }
    
    filtered = filtered.slice(0, 20);
    
    if (filtered.length === 0) {
      resultsCont.innerHTML = `<div style="font-size:11px; color:var(--text-muted);">Keine Leads gefunden.</div>`;
      return;
    }
    
    resultsCont.innerHTML = filtered.map(l => {
      const hasLoc = !!(l.lat || (l.locations && l.locations.length > 0));
      return `
        <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); padding:10px; border-radius:8px; margin-bottom:4px; cursor:pointer;" onclick="openLeadDirectly(${l.id}, true)">
          <div style="font-size:13px; font-weight:600; color:var(--text-main);">${escapeHtml(l.name)}</div>
          <div style="font-size:11px; color:var(--text-muted); display:flex; justify-content:space-between; margin-top:4px;">
            <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(l.maps_city || 'Kein Ort')}</span>
            <span>${hasLoc ? '🗺️ Hat Standort' : '📍 Fehlt'}</span>
          </div>
        </div>
      `;
    }).join('');
  };

  window.handlePinDoubleClick = async (id) => {
    window._forceLocationSearch = true;
    await window.switchTab('map');
    await window.openLead(id, true);
    setTimeout(() => {
       if (typeof window.searchLeadLocation === 'function') {
           window.searchLeadLocation(id);
       }
    }, 500);
  };

  window.removeLocation = async (id, index) => {
    try {
      const fullList = await window.api.getLeads({ all: true });
      const l = fullList.find(x => x.id === id);
      if (!l) return;
      if (Array.isArray(l.locations)) {
        l.locations.splice(index, 1);
        
        // Sever Google Places API connection
        l.google_place_id = '';
        l.google_maps_url = '';
        l.maps_city = '';
        l.lat = null;
        l.lng = null;
        l.opening_hours = '';
        
        await window.api.saveLead(l);
        showToast("Standort (Places-Verknüpfung) entfernt.");
        
        if (window.currentTab === 'map') {
          if (typeof window.loadMapData === 'function') {
            await window.loadMapData();
          }
        }
        await loadUi();
        await openLead(id);
      }
    } catch(e) {
      console.error(e);
      showToast("Fehler beim Entfernen des Standorts.");
    }
  };

  window.searchLeadLocation = async (id) => {
    const input = document.getElementById('loc-search-input');
    const resultsCont = document.getElementById('loc-search-results');
    if (!input || !resultsCont) return;
    
    const existingLeads = await window.api.getLeads({ all: true });

    const query = input.value.trim();
    if (!query) {
      resultsCont.innerHTML = '<div style="color: #ff453a; font-size: 11px;">Bitte Suchbegriff eingeben.</div>';
      return;
    }

    resultsCont.innerHTML = '<div style="color: var(--text-muted); font-size: 11px;">Suche läuft... ⏳</div>';

    const apiKey = localStorage.getItem('googlePlacesApiKey') || '';
    const results = [];

    try {
      if (apiKey) {
        const url = 'https://places.googleapis.com/v1/places:searchText';
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.websiteUri,places.googleMapsUri,places.id,places.nationalPhoneNumber,places.internationalPhoneNumber,places.regularOpeningHours'
          },
          body: JSON.stringify({ textQuery: query, pageSize: 5 })
        });
        const data = await res.json();
        if (data.places && data.places.length > 0) {
          data.places.forEach(p => {
            results.push({
              name: p.displayName?.text || 'Unbekannter Ort',
              address: p.formattedAddress || '',
              lat: p.location?.latitude,
              lng: p.location?.longitude,
              website: p.websiteUri || '',
              mapsUrl: p.googleMapsUri || '',
              phone: p.nationalPhoneNumber || p.internationalPhoneNumber || '',
              placeId: p.id,
              opening_hours: p.regularOpeningHours ? JSON.stringify(p.regularOpeningHours) : ''
            });
          });
        }
      } else {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`;
        const res = await fetch(url, {
          headers: { 'Accept-Language': 'de-DE', 'User-Agent': 'LightningCRMMatching/1.0' }
        });
        const data = await res.json();
        if (data && data.length > 0) {
          data.forEach(item => {
            const name = item.name || (item.display_name ? item.display_name.split(',')[0] : 'Ort');
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lon);
            const address = item.display_name || '';
            const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
            results.push({ name, address, lat, lng, website: '', mapsUrl, placeId: '' });
          });
        }
      }

      if (results.length === 0) {
        resultsCont.innerHTML = '<div style="color: var(--text-muted); font-size: 11px;">Keine Ergebnisse gefunden.</div>';
        return;
      }

      resultsCont.innerHTML = results.map((r, i) => {
        let dupLead = null;
        if (r.placeId) {
          dupLead = existingLeads.find(l => l.google_place_id === r.placeId && l.id !== id);
        } else if (r.address && r.lat) {
          dupLead = existingLeads.find(l => l.maps_city === r.address && l.id !== id);
        }
        
        if (dupLead) {
          let ownerStr = 'Niemandem (Kalt)';
          if (dupLead.claimed_by) {
            const owner = (window.globalUsersList || []).find(u => u.id === dupLead.claimed_by);
            ownerStr = owner ? owner.name : 'Zugewiesen';
          }
          return `
            <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255, 69, 58, 0.3); padding: 8px; border-radius: 6px; display: flex; flex-direction: column; gap: 4px; opacity: 0.8;">
              <div style="font-size: 12px; font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</div>
              <div style="font-size: 10px; color: var(--text-muted); line-height: 1.3; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;" title="${escapeHtml(r.address)}">${escapeHtml(r.address)}</div>
              <div style="color: #ffcc00; font-size: 10px; font-weight: bold; margin-top: 4px;">⚠️ Bereits verknüpft mit Lead:</div>
              <div style="color: var(--text-muted); font-size: 10px;">${escapeHtml(dupLead.name)} (Gehört: ${escapeHtml(ownerStr)})</div>
              <button class="action-btn-small" style="background: transparent; color: var(--text-muted); border-color: var(--border); font-weight: bold; font-size: 10px; padding: 4px 8px; width: 100%; margin-top: 4px; cursor: not-allowed;" disabled>Verknüpfen blockiert</button>
            </div>
          `;
        }
        
        return `
          <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); padding: 8px; border-radius: 6px; display: flex; flex-direction: column; gap: 4px;">
            <div style="font-size: 12px; font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</div>
            <div style="font-size: 10px; color: var(--text-muted); line-height: 1.3; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;" title="${escapeHtml(r.address)}">${escapeHtml(r.address)}</div>
            <button class="action-btn-small" style="background: var(--success); color: black; border-color: var(--success); font-weight: bold; font-size: 10px; padding: 4px 8px; width: 100%; margin-top: 4px;" onclick="linkLeadLocation(${id}, '${encodeURIComponent(JSON.stringify(r)).replace(/'/g, "%27")}')">Auswählen & Verknüpfen</button>
          </div>
        `;
      }).join('');
    } catch(err) {
      console.error(err);
      resultsCont.innerHTML = `<div style="color: #ff453a; font-size: 11px;">Fehler bei der Suche: ${escapeHtml(err.message)}</div>`;
    }
  };

  window.linkLeadLocation = async (leadId, encodedData) => {
    try {
      const data = JSON.parse(decodeURIComponent(encodedData));
      const fullList = await window.api.getLeads({ all: true });
      const l = fullList.find(x => x.id === leadId);
      if (!l) return;

      // Restrict to max 1 location as requested ("Wenn kein standort hinterlegt ist...")
      l.locations = [{
        place_id: data.placeId || '',
        name: data.name || '',
        address: data.address || '',
        lat: data.lat,
        lng: data.lng,
        source: 'manual'
      }];

      if (data.website && !l.website_url) l.website_url = data.website;
      if (data.mapsUrl && !l.google_maps_url) l.google_maps_url = data.mapsUrl;
      if (data.placeId && !l.google_place_id) l.google_place_id = data.placeId;
      if (data.phone && !l.phone) l.phone = data.phone;
      
      // Update the main properties as well so they don't get overwritten with old data when saving again later
      l.maps_city = data.address || '';
      l.lat = data.lat;
      l.lng = data.lng;
      l.opening_hours = data.opening_hours || '';

      window._forceLocationSearch = false;
      await window.api.saveLead(l);
      showToast("Standort erfolgreich verknüpft! 🗺️");
      await loadUi();
      await openLead(leadId);

      setTimeout(() => {
        if(window.map) {
           const mapMarkers = window.mapMarkers || [];
           const m = mapMarkers.find(x => x.leadId === leadId);
           if (m) {
             const pos = m.getLatLng();
             window.map.flyTo(pos, 16, { duration: 1.5 });
             setTimeout(() => m.openPopup(), 1500);
           }
        }
      }, 300);

    } catch(e) {
      console.error(e);
      showToast("Fehler beim Verknüpfen des Standorts.");
    }
  };

  window.toggleLeadStar = async (id) => {
    try {
      const fullList = await window.api.getLeads({ all: true });
      const l = fullList.find(x => x.id === id);
      if (!l) return;
      
      l.starred = l.starred ? 0 : 1;
      
      // Update DOM button immediately in the sidebar
      const starBtn = document.getElementById('sidebar-star-btn');
      if (starBtn) {
        starBtn.setAttribute('data-starred', l.starred ? '1' : '0');
        starBtn.style.color = l.starred ? '#ffcc00' : 'var(--text-muted)';
        starBtn.innerText = l.starred ? '★' : '☆';
      }
      
      await window.api.saveLead(l);
      showToast(l.starred ? "Lead priorisiert! ⭐" : "Priorisierung aufgehoben.");
      await loadUi();
    } catch(e) {
      console.error(e);
      showToast("Fehler beim Priorisieren.");
    }
  };

  window.executeDeepCleanup = async () => {
    const btn = document.getElementById('btn-run-cleanup');
    if (btn) {
      btn.innerText = 'Läuft... Bitte warten ⏳';
      btn.disabled = true;
    }
    
    try {
      const allLeads = await window.api.getLeads({ all: true });
      let notesCleaned = 0;
      let timeRepaired = 0;
      let apiBackfilled = 0;
      
      const apiKey = localStorage.getItem('googlePlacesApiKey') || '';
      
      for (const l of allLeads) {
        let changed = false;
        
        // A. Clean Notes
        if (l.notes) {
          const lines = l.notes.split('\n');
          const cleanLines = lines.filter(line => {
            return !line.trim().startsWith('Website aus Scout:') && 
                   !line.trim().startsWith('Google Rating:');
          });
          const newNotes = cleanLines.join('\n').trim();
          if (newNotes !== l.notes.trim()) {
            l.notes = newNotes;
            changed = true;
            notesCleaned++;
          }
        }
        
        // B. Call Tracker Timestamp 21.05.
        // check if last_contact_ms is on 21.05.2026
        if (l.last_contact_ms && l.last_contact_ms > 0) {
          const lTime = new Date(l.last_contact_ms);
          if (lTime.getFullYear() === 2026 && lTime.getMonth() === 4 && lTime.getDate() === 21) {
            // call_history is now an array (not a JSON string) from Supabase
            let history = Array.isArray(l.call_history) ? l.call_history : [];
            if (Array.isArray(history)) {
               // Remove all entries from 21.05. (handle both {ts,status} and legacy number)
               history = history.filter(entry => {
                  const ts = typeof entry === 'number' ? entry : (entry?.ts || 0);
                  const d = new Date(ts);
                  return !(d.getFullYear() === 2026 && d.getMonth() === 4 && d.getDate() === 21);
               });
               l.call_history = history;
               if (history.length > 0) {
                 const last = history[history.length - 1];
                 l.last_contact_ms = typeof last === 'number' ? last : (last?.ts || 0);
               } else {
                 l.last_contact_ms = 0;
               }
            } else {
               l.last_contact_ms = 0;
            }
            changed = true;
            timeRepaired++;
          }
        }

        
        // C. API Backfill (phone, maps_city, lat, lng, opening_hours)
        const needsBackfill = !l.phone || !l.maps_city || !l.lat || !l.lng || !l.opening_hours;
        if (l.google_place_id && apiKey && needsBackfill) {
           const url = `https://places.googleapis.com/v1/places/${l.google_place_id}`;
           const res = await fetch(url, {
             headers: {
               'X-Goog-Api-Key': apiKey,
               'X-Goog-FieldMask': 'displayName,formattedAddress,location,nationalPhoneNumber,internationalPhoneNumber,regularOpeningHours'
             }
           });
           
           if (res.ok) {
             const data = await res.json();
             if (data) {
               let localChanged = false;
               if (!l.phone && (data.nationalPhoneNumber || data.internationalPhoneNumber)) {
                  l.phone = data.nationalPhoneNumber || data.internationalPhoneNumber;
                  localChanged = true;
               }
               const bestAddress = data.formattedAddress || data.displayName?.text;
               if (bestAddress && l.maps_city !== bestAddress) {
                  l.maps_city = bestAddress;
                  localChanged = true;
               }
               if ((!l.lat || !l.lng) && data.location) {
                  l.lat = data.location.latitude;
                  l.lng = data.location.longitude;
                  localChanged = true;
               }
               if (!l.opening_hours && data.regularOpeningHours) {
                  l.opening_hours = JSON.stringify(data.regularOpeningHours);
                  localChanged = true;
               }
               
               if (localChanged) {
                  changed = true;
                  apiBackfilled++;
               }
             }
           }
        }
        
        if (changed) {
          await window.api.saveLead(l);
        }
      }
      
      showToast(`Cleanup fertig! Notizen: ${notesCleaned}, Timestamps: ${timeRepaired}, API geladen: ${apiBackfilled}`);
      await loadUi();
      
    } catch (err) {
      console.error(err);
      showToast(`Cleanup Fehler: ${err.message}`, true);
    } finally {
      if (btn) {
        btn.innerText = 'Cleanup jetzt ausführen';
        btn.disabled = false;
      }
    }
  };

  // Background Event Sync is handled centrally in init.js via window.api.onLeadsChanged

  window.saveAdminAssignment = async (leadId, assignedUserId) => {
    try {
      const leads = await window.api.getLeads({ all: true });
      const lead = leads.find(x => x.id === leadId);
      if(lead) {
         lead.claimed_by = assignedUserId;
         await window.api.saveLead(lead);
         if (typeof loadUi === 'function') loadUi();
      }
    } catch(e) { console.error(e); }
  };

  window.renderDashboard = async () => {
    const container = document.getElementById('dashboard-content');
    if (!container) return;
    
    container.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;">Lade Metriken...</div>';
    
    try {
      const stats = await window.api.getAgentStats();
      
      if (!stats || stats.length === 0) {
        container.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;">Noch keine Metriken verfügbar.</div>';
        return;
      }
      
      container.innerHTML = '';
      
      stats.forEach(stat => {
        const totalCalls = stat.calls;
        const answeredCalls = totalCalls - stat.unanswered;
        const answeredRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;
        
        const card = document.createElement('div');
        card.style.cssText = 'background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 12px; padding: 24px; display: flex; flex-direction: column; gap: 16px;';
        
        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h3 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 700; color: var(--text-main);">${stat.name}</h3>
              <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Minion ID: ${stat.id.split('-')[0]}</div>
            </div>
            <div style="background: var(--surface); padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; color: var(--text-main); border: 1px solid var(--border);">
              ${stat.role === 'minion' ? 'Minion' : stat.role}
            </div>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; text-align: center;">
              <div style="font-size: 24px; font-weight: 800; color: #fff;">${stat.leads}</div>
              <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">CRM Leads</div>
            </div>
            <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; text-align: center;">
              <div style="font-size: 24px; font-weight: 800; color: #fff;">${totalCalls}</div>
              <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Calls</div>
            </div>
            <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; text-align: center;">
              <div style="font-size: 24px; font-weight: 800; color: #fff;">${stat.emails}</div>
              <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">E-Mails</div>
            </div>
            <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; text-align: center;">
              <div style="font-size: 24px; font-weight: 800; color: #34c759;">${answeredRate}%</div>
              <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Erreicht</div>
            </div>
          </div>
        `;
        
        container.appendChild(card);
      });
      
    } catch(err) {
      console.error(err);
      container.innerHTML = \`<div class="empty-state" style="grid-column: 1 / -1; color: #ff453a;">Fehler beim Laden der Metriken: \${err.message}</div>\`;
    }
  };