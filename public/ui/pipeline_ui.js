const escapeHtml = (unsafe) => {
  return (unsafe || '').toString()
       .replace(/&/g, "&amp;")
       .replace(/</g, "&lt;")
       .replace(/>/g, "&gt;")
       .replace(/"/g, "&quot;")
       .replace(/'/g, "&#039;");
};

// Safe DOM helpers — prevent crashes when elements are removed
const $ = (id) => document.getElementById(id);
const $show = (id, d = 'flex') => { const el = $(id); if (el) el.style.display = d; };
const $hide = (id) => { const el = $(id); if (el) el.style.display = 'none'; };

window.handleLeadAssignmentChange = (val) => {
  // Assignment wird beim Speichern des Leads gelesen (aus dem select#sys-claimed-by)
};


  window.toggleBulkMode = () => {
      window.store.state.isBulkMode = !window.store.state.isBulkMode;
      window.store.state.selectedBulkIds.clear();
      const btn = document.getElementById('bulk-mode-btn');
      if (btn) {
          if (window.store.state.isBulkMode) {
              btn.innerText = 'Auswahl abbrechen';
              btn.style.borderColor = 'var(--text-main)';
              btn.style.color = 'var(--text-main)';
              const bar = document.getElementById('bulk-action-bar');
              if(bar) bar.style.display = 'flex';
          } else {
              btn.innerText = 'Mehrfachauswahl';
              btn.style.borderColor = 'var(--border)';
              btn.style.color = 'var(--text-muted)';
              const bar = document.getElementById('bulk-action-bar');
              if(bar) bar.style.display = 'none';
          }
      }
      updateBulkUI();
      loadUi();
  };

  window.updateLeadSize = (id, newSize) => {
    // Just update DOM/Draft instead of auto-saving
    let hiddenInput = document.getElementById('m-size');
    if (!hiddenInput) {
      hiddenInput = document.createElement('input');
      hiddenInput.type = 'hidden';
      hiddenInput.id = 'm-size';
      document.body.appendChild(hiddenInput);
    }
    hiddenInput.value = newSize;

    const draft = typeof window.getDomDraft === 'function' ? window.getDomDraft() : null;
    if (draft) draft.size = newSize;

    const lead = window.store.state.leads.find(l => l.id === id);
    if (lead) lead.size = newSize;

    document.querySelectorAll('.size-btn').forEach(btn => {
      if (btn.getAttribute('data-size') === newSize) {
        btn.style.background = 'var(--color-brand-accent, #0a84ff)';
        btn.style.color = 'white';
      } else {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--text-muted)';
      }
    });
  };

  window.handleLeadClick = (id) => {
      if (window.store.state.isBulkMode) {
          if (window.store.state.selectedBulkIds.has(id)) {
              window.store.state.selectedBulkIds.delete(id);
          } else {
              window.store.state.selectedBulkIds.add(id);
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
      const uncalledBtn = document.getElementById('bulk-uncalled-btn');
      
      if (window.store.state.isBulkMode) {
          bar.style.display = 'flex';
          const cnt = document.getElementById('bulk-count');
          if(cnt) cnt.innerText = `${window.store.state.selectedBulkIds.size} Leads ausgewählt`;
          
          if (window.store.state.currentTab === 'cold' && uncalledBtn) {
              uncalledBtn.style.display = 'inline-block';
          } else if (uncalledBtn) {
              uncalledBtn.style.display = 'none';
          }
      } else {
          bar.style.display = 'none';
      }
  };
  window.executeBulkDelete = async () => {
      if (window.store.state.selectedBulkIds.size === 0) return;
      showConfirmDialog(
        'Leads in Bulk löschen?',
        `Wirklich ${window.store.state.selectedBulkIds.size} Leads unwiderruflich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`,
        `${window.store.state.selectedBulkIds.size} Leads löschen`,
        async () => {
          await window.api.deleteLeads(Array.from(window.store.state.selectedBulkIds));
          toggleBulkMode(); // exits bulk mode and reloads
          if (typeof window.renderEmptySidebar === 'function') {
            window.renderEmptySidebar();
          } else {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.innerHTML = `<div class="empty-state">Nächsten Lead wählen</div>`;
          }
          if (typeof showToast === 'function') showToast("Leads in Bulk gelöscht!");
      });
  };

  window.executeBulkDeleteUncalled = async () => {
      if (window.store.state.currentTab !== 'cold') return;
      
      const leads = await window.api.getLeads({ tab: 'cold' });
      const uncalled = leads.filter(l => (l.call_status || 'never') === 'never');
      
      if (uncalled.length === 0) {
        if (typeof showToast === 'function') showToast("Keine unangerufenen Leads gefunden.", true);
        return;
      }
      
      showConfirmDialog(
        'Leads in Bulk löschen?',
        `Wirklich alle ${uncalled.length} unangerufenen Leads unwiderruflich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`,
        `${uncalled.length} Leads löschen`,
        async () => {
          await window.api.deleteLeads(uncalled.map(l => l.id));
          toggleBulkMode(); // exits bulk mode and reloads
          if (typeof window.renderEmptySidebar === 'function') {
            window.renderEmptySidebar();
          } else {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.innerHTML = `<div class="empty-state">Nächsten Lead wählen</div>`;
          }
          if (typeof showToast === 'function') showToast(`${uncalled.length} unangerufene Leads gelöscht!`);
      });
  };

  window.getLeadStatusMap = (l) => {
    let res = { color: 'p-kalt', label: 'COLD', mapPin: 'pin-kalt' };
    if (l.status === 'Kunde') res = { color: 'p-kunde', label: 'CLOSED', mapPin: 'pin-kunde' };
    else if (l.status === 'Uninteressant') res = { color: 'p-excluded', label: 'Ausgeschlossen 🚫', mapPin: 'pin-excluded' };
    else if (l.rechnung) res = { color: 'p-rechnung', label: 'OFFER', mapPin: 'pin-rechnung' };
    else if (l.termin) res = { color: 'p-termin', label: 'DATA', mapPin: 'pin-termin' };
    else if (l.entscheider) res = { color: 'p-entscheider', label: 'PITCH', mapPin: 'pin-entscheider' };
    
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
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
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

  window.store.state.currentMapStatusFilter = 'all';
  window.store.state.currentMapUserFilter = 'all';

  window.setMapStatusFilter = (val, btnElem) => {
    window.store.state.currentMapStatusFilter = val;
    if (btnElem && btnElem.parentElement) {
      btnElem.parentElement.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
      btnElem.classList.add('active');
    }
    if (window.loadMapData) window.loadMapData();
  };

  window.setMapUserFilter = (val, btnElem) => {
    window.store.state.currentMapUserFilter = val;
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
    
    const mapStatusFilter = window.store.state.currentMapStatusFilter;
    const mapUserFilter = window.store.state.currentMapUserFilter;

    leads.forEach(l => {
      const sMap = getLeadStatusMap(l);
      
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
    // Subtle content fade-out
    const contentArea = document.getElementById('queue-container');
    if (contentArea) contentArea.classList.add('content-fade-out');

    window.store.state.currentTab = tab;
    hideMapHoverCard();
    
    // Fix Lead Selection State Bug: clear selection globally
    window.store.state.currentSelectedLeadId = null;
    
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    if(document.getElementById(`nav-${tab}`)) document.getElementById(`nav-${tab}`).classList.add('active');
    
    $show('map-wrapper', tab === 'map' ? 'flex' : 'none');
    $show('scout-wrapper', tab === 'scout' ? 'flex' : 'none');
    $show('dashboard-wrapper', tab === 'dashboard' ? 'flex' : 'none');
    $show('main-list-wrapper', (tab !== 'map' && tab !== 'scout' && tab !== 'dashboard') ? 'flex' : 'none');
    
    $show('main-sidebar', (tab === 'scout' || tab === 'dashboard') ? 'none' : 'flex');
    const mc = document.querySelector('.main-content');
    if (mc) mc.style.display = (tab === 'map' || tab === 'scout' || tab === 'dashboard') ? 'none' : 'flex';

    if (tab === 'map') {
      setTimeout(() => { if (map) map.invalidateSize(); }, 100);
    }
    
    if (tab === 'scout') {
      if (typeof window.loadApiKey === 'function') window.loadApiKey();
    }
    
    const hiddenTabs = ['scout', 'projects', 'dashboard'];
    const qaContainer = $('qa-container');
    if (qaContainer) qaContainer.style.display = hiddenTabs.includes(tab) ? 'none' : 'flex';
    
    const filtersContainer = $('filters-container');
    if (filtersContainer) filtersContainer.style.display = hiddenTabs.includes(tab) ? 'none' : 'flex';
    
    if (typeof window.renderEmptySidebar === 'function') {
      window.renderEmptySidebar();
    } else {
      sidebar.innerHTML = `<div class="empty-state">Nächsten Lead wählen</div>`;
    }
    
    window.store.state.isBulkMode = false;
    window.store.state.selectedBulkIds.clear();
    const bulkBar = document.getElementById('bulk-action-bar');
    if (bulkBar) bulkBar.style.display = 'none';

    window.store.state.currentFilter1 = 'all';
    window.store.state.currentFilter2 = 'all';
    
    if (tab === 'dashboard') {
if (typeof window.renderDashboard === 'function') {
        window.renderDashboard();
      }
    } else {
      window.store.state.currentSearch = ''; 
      window.store.state.currentColdCallFilter = 'all';

      // --- LAZY LOADING SETUP ---
      window._lazyLoadQueue = [];
      if (!window._lazyObserver) {
        window._lazyObserver = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const sentinel = entry.target;
              const queueId = sentinel.dataset.queueId;
              const qObj = window._lazyLoadQueue[queueId];
              if (qObj) {
                const batch = qObj.listToRender.slice(qObj.currentIndex, qObj.currentIndex + 50);
                qObj.currentIndex += 50;
                
                const temp = document.createElement('div');
                temp.innerHTML = qObj.renderFn(batch);
                while(temp.firstChild) {
                  sentinel.parentNode.insertBefore(temp.firstChild, sentinel);
                }
                
                if (qObj.currentIndex >= qObj.listToRender.length) {
                  window._lazyObserver.unobserve(sentinel);
                  sentinel.remove();
                }
              }
            }
          });
        }, { rootMargin: '400px' }); // Load 400px before reaching the end
      }
      // --------------------------

      const si = $('search-input');
      if (si) si.value = '';
      await loadUi();
    }

    // Fade in new content
    requestAnimationFrame(() => {
      if (contentArea) {
        contentArea.classList.remove('content-fade-out');
        contentArea.classList.add('content-fade-in');
      }
    });
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
    if (window.store.state.currentTab === 'scout') return;

    // Projects tab has its own renderer
    if (window.store.state.currentTab === 'projects') {
      if (typeof window.renderProjectsTab === 'function') await window.renderProjectsTab();
      return;
    }

    renderFilterButtons();
    const filters = { 
      tab: window.store.state.currentTab, 
      search: window.store.state.currentSearch,
      filter1: window.store.state.currentFilter1,
      filter2: window.store.state.currentFilter2
    };

    if (window.store.state.currentTab === 'map') {
      await loadMapData(filters);
    } else {
      let leads = await window.api.getLeads(filters);
      // Frontend-level safeguard: Ensure Uninteressant leads are never shown in active CRM tabs
      leads = leads.filter(l => l.status !== 'Uninteressant');
      
      // Apply Advanced Filters
      const st = window.store.state;
      if (st.advFilterStatus && st.advFilterStatus !== 'all') {
         if (st.advFilterStatus === 'Lead') leads = leads.filter(l => !l.entscheider && !l.termin && !l.rechnung && l.status !== 'Kunde');
         else if (st.advFilterStatus === 'PITCH') leads = leads.filter(l => l.entscheider && !l.termin && !l.rechnung && l.status !== 'Kunde');
         else if (st.advFilterStatus === 'FOLLOWUP') leads = leads.filter(l => l.termin && !l.rechnung && l.status !== 'Kunde');
         else if (st.advFilterStatus === 'OFFER') leads = leads.filter(l => l.rechnung && l.status !== 'Kunde');
         else if (st.advFilterStatus === 'CLOSE') leads = leads.filter(l => l.status === 'Kunde');
      }
      if (st.advFilterAssign && st.advFilterAssign !== 'all') {
         if (st.advFilterAssign === 'me') {
            leads = leads.filter(l => l.claimed_by === (window.globalUser ? window.globalUser.id : null));
         } else if (st.advFilterAssign === 'unassigned') {
            leads = leads.filter(l => !l.claimed_by);
         } else {
            leads = leads.filter(l => String(l.claimed_by) === String(st.advFilterAssign));
         }
      }
      if (st.advFilterTask && st.advFilterTask !== 'all') {
         leads = leads.filter(l => {
            let open = false;
            if (l.task_text) {
               try { 
                  const ts = JSON.parse(l.task_text);
                  open = ts.some(t => !t.done);
               } catch(e){}
            }
            return st.advFilterTask === 'open' ? open : !open;
         });
      }
      if (st.advFilterLink && st.advFilterLink !== 'all') {
         leads = leads.filter(l => {
            const hasLinks = l.linked_leads && l.linked_leads.length > 0;
            return st.advFilterLink === 'linked' ? hasLinks : !hasLinks;
         });
      }

      renderQueue(leads);
    }
    
    if (!window.store.state.currentSelectedLeadId) {
      if (typeof window.renderEmptySidebar === 'function') {
        window.renderEmptySidebar();
      }
    }
  }

  window.toggleAdvFilter = () => {
    const el = document.getElementById('adv-filter-dropdown');
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
  };

  window.setAdvFilter = (key, val) => {
    window.store.state[key] = val;
    loadUi();
  };

  function renderFilterButtons() {
    const group2 = document.getElementById('filter-group-2');
    if (!group2) return;

    // Use default values if not set
    const st = window.store.state;
    st.advFilterStatus = st.advFilterStatus || 'all';
    st.advFilterAssign = st.advFilterAssign || 'all';
    st.advFilterTask   = st.advFilterTask   || 'all';
    st.advFilterLink   = st.advFilterLink   || 'all';

    let userOptions = `<option value="all" ${st.advFilterAssign === 'all' ? 'selected' : ''}>Alle Leads</option>`;
    userOptions += `<option value="me" ${st.advFilterAssign === 'me' ? 'selected' : ''}>Meine Leads</option>`;
    userOptions += `<option value="unassigned" ${st.advFilterAssign === 'unassigned' ? 'selected' : ''}>Nicht zugewiesen</option>`;
    if (window.globalUser && (window.globalUser.role === 'admin' || window.globalUser.role === 'developer') && window.globalUsersList) {
      window.globalUsersList.forEach(u => {
        if (u.id !== window.globalUser.id) {
          userOptions += `<option value="${u.id}" ${String(st.advFilterAssign) === String(u.id) ? 'selected' : ''}>${escapeHtml(u.name)}</option>`;
        }
      });
    }

    const hasActiveFilters = st.advFilterStatus !== 'all' || st.advFilterAssign !== 'all' || st.advFilterTask !== 'all' || st.advFilterLink !== 'all';
    const activeColor = hasActiveFilters ? 'var(--color-brand-primary, #0a84ff)' : 'var(--text-muted)';
    const activeBg = hasActiveFilters ? 'rgba(10, 132, 255, 0.1)' : 'transparent';
    const activeBorder = hasActiveFilters ? 'var(--color-brand-primary, #0a84ff)' : 'var(--border)';

    group2.style.display = 'flex';
    group2.style.position = 'relative';
    group2.innerHTML = `
      <button onclick="window.toggleAdvFilter()" class="action-btn-small outline" style="border-color:${activeBorder}; color:${activeColor}; background:${activeBg}; display:flex; align-items:center; gap:6px; font-weight:500; height:32px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
        Filter
      </button>
      
      <div id="adv-filter-dropdown" style="display:none; position:absolute; top:40px; right:0; background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:16px; width:260px; z-index: var(--z-dropdown, 1000); box-shadow: var(--shadow-md, 0 10px 30px rgba(0,0,0,0.5));">
        
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:11px; font-weight:600; color:var(--text-muted); margin-bottom:4px; text-transform:uppercase;">Zuweisung</label>
          <select class="modern-input" style="width:100%; padding:6px 8px; font-size:13px; border-radius:6px; background:var(--color-surface-hover, #1c1c1e); color:white; border:none; outline:none;" onchange="window.setAdvFilter('advFilterAssign', this.value)">
            ${userOptions}
          </select>
        </div>

        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:11px; font-weight:600; color:var(--text-muted); margin-bottom:4px; text-transform:uppercase;">Pipeline Status</label>
          <select class="modern-input" style="width:100%; padding:6px 8px; font-size:13px; border-radius:6px; background:var(--color-surface-hover, #1c1c1e); color:white; border:none; outline:none;" onchange="window.setAdvFilter('advFilterStatus', this.value)">
            <option value="all" ${st.advFilterStatus === 'all' ? 'selected' : ''}>Alle Status</option>
            <option value="Lead" ${st.advFilterStatus === 'Lead' ? 'selected' : ''}>Lead</option>
            <option value="PITCH" ${st.advFilterStatus === 'PITCH' ? 'selected' : ''}>PITCH</option>
            <option value="FOLLOWUP" ${st.advFilterStatus === 'FOLLOWUP' ? 'selected' : ''}>FOLLOW-UP</option>
            <option value="OFFER" ${st.advFilterStatus === 'OFFER' ? 'selected' : ''}>OFFER</option>
            <option value="CLOSE" ${st.advFilterStatus === 'CLOSE' ? 'selected' : ''}>CLOSE</option>
          </select>
        </div>

        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:11px; font-weight:600; color:var(--text-muted); margin-bottom:4px; text-transform:uppercase;">Aufgaben</label>
          <select class="modern-input" style="width:100%; padding:6px 8px; font-size:13px; border-radius:6px; background:var(--color-surface-hover, #1c1c1e); color:white; border:none; outline:none;" onchange="window.setAdvFilter('advFilterTask', this.value)">
            <option value="all" ${st.advFilterTask === 'all' ? 'selected' : ''}>Alle</option>
            <option value="open" ${st.advFilterTask === 'open' ? 'selected' : ''}>Offene Aufgaben</option>
            <option value="none" ${st.advFilterTask === 'none' ? 'selected' : ''}>Keine offene Aufgaben</option>
          </select>
        </div>

        <div style="margin-bottom:4px;">
          <label style="display:block; font-size:11px; font-weight:600; color:var(--text-muted); margin-bottom:4px; text-transform:uppercase;">Verknüpfungen</label>
          <select class="modern-input" style="width:100%; padding:6px 8px; font-size:13px; border-radius:6px; background:var(--color-surface-hover, #1c1c1e); color:white; border:none; outline:none;" onchange="window.setAdvFilter('advFilterLink', this.value)">
            <option value="all" ${st.advFilterLink === 'all' ? 'selected' : ''}>Alle</option>
            <option value="linked" ${st.advFilterLink === 'linked' ? 'selected' : ''}>Mit Verknüpfungen</option>
            <option value="none" ${st.advFilterLink === 'none' ? 'selected' : ''}>Ohne Verknüpfungen</option>
          </select>
        </div>

      </div>
    `;

  }

  window.setFilter = (group, filterName) => {
    if (group === 1) window.store.state.currentFilter1 = filterName;
    else window.store.state.currentFilter2 = filterName;
    loadUi();
  };

  let _searchDebounceTimer = null;
  window.handleSearch = (e) => {
    window.store.state.currentSearch = e.target.value.trim();
    if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
    _searchDebounceTimer = setTimeout(() => loadUi(), 250);
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
      let icon = '📞';
      let stateMsg = 'Pick up the phone and start dialing.';
      if (window.store.state.currentSearch) {
        icon = '🔍';
        stateMsg = `Kein Lead für "${escapeHtml(window.store.state.currentSearch)}" gefunden.`;
      } else if (window.store.state.currentTab === 'tasks') {
        icon = '🎉';
        stateMsg = 'Zero Inbox! Keine offenen Aufgaben.';
      } else if (window.store.state.currentTab === 'customers') {
        icon = '👥';
        stateMsg = 'Noch keine Kunden. Weiter so!';
      } else if (window.store.state.currentTab === 'cold') {
        icon = '❄️';
        stateMsg = 'Keine Leads in der Kaltakquise.';
      }
      qList.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${icon}</div><div class="empty-state-text">${stateMsg}</div></div>`;
      return;
    }
    
    let tabTitle = window.store.state.currentTab === 'queue' ? 'Pipeline' : (window.store.state.currentTab === 'cold' ? 'Kaltakquise' : (window.store.state.currentTab === 'tasks' ? 'Aufgaben' : (window.store.state.currentTab === 'customers' ? 'Kunden' : 'Radar')));
    if (window.store.state.currentSearch) tabTitle = `Globale Suche: "${window.store.state.currentSearch}"`;

    // Reset lazy load queue for this render cycle
    window._lazyLoadQueue = [];


    const renderSingleLead = (l) => {
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
         
         // 1. Location Data
         let cityHtml = '';
         const city = l.maps_city || (l.locations && l.locations.length > 0 && l.locations[0].maps_city) || '';
         if (city) {
           cityHtml = `<div style="font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; font-weight: 500; height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">📍 ${escapeHtml(city)}</div>`;
         } else {
           cityHtml = `<div style="font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; font-weight: 500; height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.5;">📍 Kein Standort</div>`;
         }

         // 2. Last Call (only the most recent call matters for the list view)
         // Note: getLeads returns 'crm_calls', getLeadHistory returns stored in 'call_history'
         let allActs = [];
         const callSource = l.call_history || l.crm_calls || [];
         callSource.forEach(c => { if(typeof c !== 'number') allActs.push(c); });
         if (l.lead_activities && l.lead_activities.length > 0) {
           l.lead_activities.forEach(a => allActs.push(a));
         }
         // Sort newest first
         allActs.sort((a,b) => (b.ts || 0) - (a.ts || 0));

         // Only care about calls for the list view metric
         const lastCall = allActs.find(act => act.type === 'call');

         let recentActivitiesHtml = '';
         if (lastCall) {
           const dateStr = new Date(lastCall.ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
           const uname = (lastCall.by_user_name && lastCall.by_user_name !== 'Unbekannt') ? lastCall.by_user_name : null;
           const callText = uname ? `${uname} (${dateStr})` : dateStr;
           recentActivitiesHtml = `<div style="font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; font-weight: 500; height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">📞 ${escapeHtml(callText)}</div>`;
         } else {
           recentActivitiesHtml = `<div style="font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; font-weight: 500; height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.5;">📞 Keine Aktivitäten</div>`;
         }

         // 3. Opening Hours Data
         let ohHtml = '';
         let ohRaw = '';
         if (l.opening_hours) {
           try {
             const parsed = JSON.parse(l.opening_hours);
             let ohArray = parsed.weekdayDescriptions || (Array.isArray(parsed) ? parsed : null);
             if (ohArray && ohArray.length === 7) {
               const todayIdx = (new Date().getDay() + 6) % 7;
               ohRaw = ohArray[todayIdx];
             } else if (ohArray && ohArray.length > 0) {
               ohRaw = ohArray[0];
             }
           } catch(e) {}
         } 
         if (!ohRaw && l.locations && l.locations.length > 0 && l.locations[0].opening_hours) {
           const ohArray = l.locations[0].opening_hours;
           if (Array.isArray(ohArray) && ohArray.length === 7) {
               const todayIdx = (new Date().getDay() + 6) % 7;
               ohRaw = ohArray[todayIdx];
           } else if (Array.isArray(ohArray)) {
               ohRaw = ohArray[0];
           }
         }
         
         if (ohRaw) {
           let isOpenText = '🕒 Unbekannt';
           let color = 'var(--text-muted)';
           const s = ohRaw.toLowerCase();
           if (s.includes('geschlossen')) {
             isOpenText = '🕒 Closed';
             color = 'var(--color-crm-excluded, #ff453a)';
           } else if (s.includes('rund um die uhr') || s.includes('24 hours')) {
             isOpenText = '🕒 Open';
             color = 'var(--color-crm-customer, #34c759)';
           } else {
             const match = ohRaw.match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
             if (match) {
               const now = new Date();
               const currMins = now.getHours() * 60 + now.getMinutes();
               const [startH, startM] = match[1].split(':').map(Number);
               let [endH, endM] = match[2].split(':').map(Number);
               if (endH === 0 && endM === 0) endH = 24;
               const startMins = startH * 60 + startM;
               const endMins = endH * 60 + endM;
               if (currMins >= startMins && currMins <= endMins) {
                 isOpenText = '🕒 Open';
                 color = 'var(--color-crm-customer, #34c759)';
               } else {
                 isOpenText = '🕒 Closed';
                 color = 'var(--color-crm-excluded, #ff453a)';
               }
             }
           }
           ohHtml = `<div style="font-size: 11px; color: ${color}; display: flex; align-items: center; gap: 4px; font-weight: 600; height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${isOpenText}</div>`;
         } else {
           ohHtml = `<div style="font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; font-weight: 600; height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.5;">🕒 Keine Öffnungszeiten</div>`;
         }
         
         activityLog = `<div style="margin-top: 2px; display: flex; flex-direction: column; gap: 3px;">${cityHtml}${recentActivitiesHtml}${ohHtml}</div>`;
        let avatarHtml = '';
        if (l.claimed_by && window.globalUsersList) {
           const assignedUser = window.globalUsersList.find(u => u.id === l.claimed_by);
           if (assignedUser && assignedUser.name) {
             const initial = assignedUser.name.charAt(0).toUpperCase();
             avatarHtml = `<div style="width: 20px; height: 20px; border-radius: 50%; border: 1px solid #bf5af2; color: #bf5af2; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; position: absolute; bottom: 12px; right: 12px; background: transparent;" title="Zugewiesen an: ${assignedUser.name}">${initial}</div>`;
           }
        }

        let opacityStyle = (isSnoozed && window.store.state.currentTab !== 'cold') ? 'opacity: 0.55;' : '';
        let bulkStyle = (window.store.state.isBulkMode && window.store.state.selectedBulkIds.has(l.id)) ? 'outline: 2px solid var(--accent);' : '';
        let cboxHtml = window.store.state.isBulkMode ? `<input type="checkbox" style="position:absolute; top:12px; right:12px; pointer-events:none; transform:scale(1.2);" ${window.store.state.selectedBulkIds.has(l.id) ? 'checked' : ''}>` : '';
        let starHtml = l.starred ? `<span style="color: #ffcc00; font-size: 14px; margin-left: 8px;" title="Priorisierter Lead">★</span>` : '';

        let isStarredClass = l.starred ? 'is-starred' : '';

        const isCustomerTab = window.store.state.currentTab === 'customers';

        return `
        <div class="lead-card ${window.store.state.currentSelectedLeadId === l.id ? 'active-lead-card' : ''} ${isStarredClass}" style="${opacityStyle} ${bulkStyle}" onclick="handleLeadClick(${l.id})" id="lead-card-${l.id}">
          
          <div style="flex: 1; display: flex; flex-direction: column; justify-content: flex-start; min-width: 0;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 8px;">
              <div class="lead-prio ${titleColor}" style="margin-bottom:0;">${milestone}</div>
              <div style="display:flex; align-items:center; gap:6px;">
                ${starHtml}
              </div>
            </div>
            
            <div class="lead-name truncate-2" style="margin-bottom: ${isCustomerTab ? '0' : '12px'}; font-weight: 600; color: var(--color-text-primary, #f2f2f7); padding-right: 20px; width: 100%;">
              <span>${l.name}</span>
            </div>
          </div>
          
          <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: auto;">
            <div style="flex: 1; min-width: 0;">
              ${activityLog}
              ${snoozeBadge}
            </div>
            ${avatarHtml}
          </div>
          
          ${cboxHtml}
        </div>
        `;
    };

    const renderLeadList = (list) => {
        if (!list || list.length === 0) return '';
        const MAX_INITIAL = 50;
        
        const toRender = list.slice(0, MAX_INITIAL);
        const html = toRender.map(renderSingleLead).join('');

        if (list.length > MAX_INITIAL) {
            const queueId = window._lazyLoadQueue.length;
            window._lazyLoadQueue.push({
               listToRender: list,
               currentIndex: MAX_INITIAL,
               renderFn: (batch) => batch.map(renderSingleLead).join('')
            });
            return html + `<div class="lazy-sentinel" data-queue-id="${queueId}" style="height: 1px; width: 100%;"></div>`;
        }
        return html;
    };

    if (window.store.state.currentTab === 'queue' && !window.store.state.currentSearch) {
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

      const pitchList = sortKanban(crmLeads.filter(l => l.entscheider === 1 && !l.termin && !l.rechnung && l.status === 'Lead'));
      const dataList = sortKanban(crmLeads.filter(l => l.termin === 1 && !l.rechnung && l.status === 'Lead'));
      const offerList = sortKanban(crmLeads.filter(l => l.rechnung === 1 && l.status === 'Lead'));

      const colHtml = (title, list) => `
        <div class="kanban-column">
          <div class="kanban-header">
            <div class="kanban-title">${title}</div>
            <div class="kanban-count">${list.length}</div>
          </div>
          <div class="kanban-cards">
            ${list.length === 0 ? '<div class="empty-state" style="height:40px; font-size:12px;">Keine Leads</div>' : renderLeadList(list)}
          </div>
        </div>
      `;

      qList.innerHTML = `
        <div class="list-header" style="display:flex; align-items:center; justify-content:space-between; width:100%;">
          <span>${tabTitle} (Pipeline)</span>
          <button id="bulk-mode-btn" class="action-btn-small ${window.store.state.isBulkMode ? 'outline' : ''}" onclick="toggleBulkMode()">
            ${window.store.state.isBulkMode ? 'Auswahl abbrechen' : 'Mehrfachauswahl'}
          </button>
        </div>
        <div class="kanban-board">
          ${colHtml('PITCH', pitchList)}
          ${colHtml('DATA', dataList)}
          ${colHtml('OFFER', offerList)}
        </div>
      `;
    } else if (window.store.state.currentTab === 'cold' && !window.store.state.currentSearch) {
      // COLD CALLING STATION VIEW
      let coldLeads = leads.filter(l => !l.entscheider && !l.termin && !l.rechnung && l.status === 'Lead');

      // F6: Apply call status filter
      let filteredByStatus = coldLeads;
      if (window.store.state.currentColdCallFilter !== 'all') {
        filteredByStatus = coldLeads.filter(l => (l.call_status || 'never') === window.store.state.currentColdCallFilter);
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
        
        let scoutTerm = '';
        for (let l of leadsArr) {
          const match = (l.notes || '').match(/\[Scout-Suche:\s*(.+?)\]/);
          if (match) { scoutTerm = escapeHtml(match[1]); break; }
        }
        if (scoutTerm) {
          timeStr += ` — Suche: "${scoutTerm}"`;
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
          <button id="bulk-mode-btn" class="action-btn-small ${window.store.state.isBulkMode ? 'outline' : ''}" onclick="toggleBulkMode()">
            ${window.store.state.isBulkMode ? 'Auswahl abbrechen' : 'Mehrfachauswahl'}
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
    } else if (window.store.state.currentTab === 'tasks' && !window.store.state.currentSearch) {
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
           const tasks = JSON.parse(lead.task_text).filter(t => !t.done || (window.sessionDoneTasks && window.sessionDoneTasks.has(t.id)));
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

      allTasks.sort((a, b) => {
          const starA = a.lead.starred ? 1 : 0;
          const starB = b.lead.starred ? 1 : 0;
          if (starA !== starB) return starB - starA;
          
          const scoreA = getScore(a.lead);
          const scoreB = getScore(b.lead);
          if (scoreA !== scoreB) return scoreB - scoreA;
          
          return b.lead.id - a.lead.id;
      });

      const now = new Date();
      now.setHours(0,0,0,0);

      const checkSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-top:1px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      const appleCheckbox = (done, onclickParams) => `
        <div onclick="${onclickParams}; event.stopPropagation();" style="width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid ${done ? 'var(--color-brand-accent, #0a84ff)' : 'var(--color-border-base, #2c2c2e)'}; background: ${done ? 'var(--color-brand-accent, #0a84ff)' : 'transparent'}; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: all 0.2s;">
          ${done ? checkSvg : ''}
        </div>
      `;

      let html = `<div class="list-header" style="margin-bottom:24px;">Missionen (${allTasks.length} offene Aufgaben)</div>`;
      const renderTaskGrid = (tasksList) => {
        let gridHtml = `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap:16px; align-items: stretch; max-width: 100%; margin-bottom: 32px;">`;
        tasksList.forEach(item => {
          const { lead, task: t } = item;
          let textStyle = t.done ? 'text-decoration: line-through; opacity: 0.45;' : '';
          
          let deadlineBadge = '';
          if (t.deadline && !t.done) {
            const d = new Date(t.deadline + 'T00:00:00');
            const diff = Math.floor((d - now) / (1000*60*60*24));
            if (diff < 0)  deadlineBadge = `<span class="deadline-badge deadline-overdue">${Math.abs(diff)}d überfällig</span>`;
            else if (diff === 0) deadlineBadge = `<span class="deadline-badge deadline-today">Heute</span>`;
            else if (diff <= 3)  deadlineBadge = `<span class="deadline-badge deadline-soon">in ${diff}d</span>`;
            else deadlineBadge = `<span class="deadline-badge deadline-ok">${d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}</span>`;
          }

          let subtasksHtml = '';
          const subs = t.subtasks || [];
          if (subs.length > 0) {
            subtasksHtml = `<div style="margin-top: 12px; padding-left: 34px; display:flex; flex-direction:column; gap:0;">`;
            subs.forEach((st, idx) => {
              let stStyle = st.done ? 'text-decoration: line-through; opacity: 0.45;' : '';
              let borderBottom = idx < subs.length - 1 ? 'border-bottom: 1px solid var(--color-border-base, #2c2c2e);' : '';
              subtasksHtml += `
                <div class="task-item" style="padding: 10px 0; ${borderBottom} display:flex; align-items:flex-start; gap:12px;">
                  ${appleCheckbox(st.done, `toggleTaskFast(${lead.id}, ${t.id}, ${!st.done}, ${st.id})`)}
                  <div style="flex:1; font-size:13px; color:var(--color-text-primary, #f2f2f7); outline:none; transition:0.2s; line-height:1.4; padding-top:2px; ${stStyle}">${escapeHtml(st.text)}</div>
                </div>
              `;
            });
            subtasksHtml += `</div>`;
          }
          
          let avatarHtml = '';
          if (lead.claimed_by && window.globalUsersList) {
             const assignedUser = window.globalUsersList.find(u => u.id === lead.claimed_by);
             if (assignedUser && assignedUser.name) {
               const initial = assignedUser.name.charAt(0).toUpperCase();
               avatarHtml = `<div style="width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--color-border-base, #2c2c2e); color: var(--color-text-secondary, #8e8e93); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; background: var(--color-surface-hover, #1e1e20); flex-shrink: 0;" title="Zugewiesen an: ${assignedUser.name}">${initial}</div>`;
             }
          }

          let leadColor = 'var(--text-main)';
          if (lead.status === 'Kunde') leadColor = 'var(--color-crm-customer, #30d158)';
          else if (lead.rechnung) leadColor = 'var(--color-crm-invoice, #ff453a)';
          else if (lead.termin) leadColor = 'var(--color-crm-contact, #ff9f0a)';
          else if (lead.entscheider) leadColor = 'var(--color-crm-decision, #0a84ff)';

          gridHtml += `
            <div class="task-item" style="display:flex; flex-direction:column; align-items: stretch; background: var(--color-surface-base, #161618); border-radius: var(--radius-lg, 12px); padding: 16px; position: relative; box-shadow: var(--shadow-card, 0 1px 3px rgba(0,0,0,0.3)); height: 100%; box-sizing: border-box; cursor: pointer;" onclick="openLead(${lead.id})">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--color-border-base, #2c2c2e); min-height: 42px;">
                <div class="truncate-2" style="font-size: 13px; color: ${leadColor}; font-weight: 700; cursor: pointer; display:flex; align-items:flex-start; gap: 6px; line-height: 1.4; padding-right: 8px;">
                  <span>${lead.starred ? '★ ' : ''}${escapeHtml(lead.name)}</span>
                </div>
                ${avatarHtml}
              </div>
              <div style="display:flex; align-items:flex-start; gap: 12px;">
                ${appleCheckbox(t.done, `toggleTaskFast(${lead.id}, ${t.id}, ${!t.done})`)}
                <div style="flex:1; font-size:15px; font-weight:500; color:var(--color-text-primary, #f2f2f7); outline:none; transition:0.2s; line-height:1.4; padding-top:1px; ${textStyle}">${escapeHtml(t.text)}</div>
                ${deadlineBadge}
              </div>
              ${subtasksHtml}
              <div style="flex: 1;"></div>
            </div>
          `;
        });
        gridHtml += `</div>`;
        return gridHtml;
      };

      const emailTasks = allTasks.filter(t => t.isEmail);
      const regularTasks = allTasks.filter(t => !t.isEmail);

      if (regularTasks.length > 0) {
        html += `<div style="font-size:13px; font-weight:700; color:var(--color-text-secondary, #8e8e93); margin: 0 0 16px 0; text-transform:uppercase; letter-spacing:1px;">Hauptaufgaben</div>`;
        html += renderTaskGrid(regularTasks);
      }

      if (emailTasks.length > 0) {
        if (regularTasks.length > 0) {
          html += `<div style="font-size:13px; font-weight:700; color:var(--color-text-secondary, #8e8e93); margin: 8px 0 16px 0; text-transform:uppercase; letter-spacing:1px;">E-Mail & Kommunikation</div>`;
        } else {
          html += `<div style="font-size:13px; font-weight:700; color:var(--color-text-secondary, #8e8e93); margin: 0 0 16px 0; text-transform:uppercase; letter-spacing:1px;">E-Mail & Kommunikation</div>`;
        }
        html += renderTaskGrid(emailTasks);
      }
      qList.innerHTML = html;



    } else if (window.store.state.currentTab === 'customers' && !window.store.state.currentSearch) {
      // CUSTOMERS VIEW
      let customerLeads = leads.filter(l => l.status === 'Kunde');
      qList.innerHTML = `
        <div class="list-header" style="display:flex; align-items:center; justify-content:space-between; width:100%;">
          <span>${tabTitle} (${customerLeads.length} Kunden)</span>
          <button id="bulk-mode-btn" class="action-btn-small ${window.store.state.isBulkMode ? 'outline' : ''}" onclick="toggleBulkMode()">
            ${window.store.state.isBulkMode ? 'Auswahl abbrechen' : 'Mehrfachauswahl'}
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
        <div class="list-header" style="display:flex; align-items:center; justify-content:space-between; width:100%; ${window.store.state.currentSearch ? 'color: var(--accent);' : ''}">
          <span>${tabTitle} (${activeLeads.length})</span>
          <button id="bulk-mode-btn" class="action-btn-small ${window.store.state.isBulkMode ? 'outline' : ''}" onclick="toggleBulkMode()">
            ${window.store.state.isBulkMode ? 'Auswahl abbrechen' : 'Mehrfachauswahl'}
          </button>
        </div>
        <div class="leads-grid">
          ${renderLeadList(activeLeads)}
        </div>
        </div>
      `;
    }

    // Attach observers to all new sentinels after rendering
    if (window._lazyObserver) {
       document.querySelectorAll('.lazy-sentinel').forEach(s => window._lazyObserver.observe(s));
    }
  }

  window.openLead = async (id, keepForceLocationSearch = false) => {
    if (window.store.state.currentSelectedLeadId && window.store.state.currentSelectedLeadId !== id) {
      if (typeof window.checkUnsavedChangesBeforeClose === 'function') {
        window.checkUnsavedChangesBeforeClose(window.store.state.currentSelectedLeadId, () => {
          window.openLeadDirectly(id, keepForceLocationSearch);
        });
        return;
      }
    }
    window.openLeadDirectly(id, keepForceLocationSearch);
  };

  window._sessionRecentLeads = window._sessionRecentLeads || new Set();

  window.openLeadDirectly = async (id, keepForceLocationSearch = false, isSaving = false, draft = null) => {
    // --- Instant Visual UI Feedback ---
    document.querySelectorAll('.lead-card').forEach(c => c.classList.remove('active-lead-card'));
    const card = document.getElementById(`lead-card-${id}`);
    if (card) card.classList.add('active-lead-card');

    const sidebarEl = document.getElementById('main-sidebar');
    if (sidebarEl) {
      sidebarEl.classList.remove('collapsed');
    }
    // ----------------------------------

    let l = window.store.state.leads ? window.store.state.leads.find(x => x.id === id) : null;
    if (!l) {
      window.store.state.leads = await window.api.getLeads({ all: true });
      l = window.store.state.leads.find(x => x.id === id);
    }
    if (!keepForceLocationSearch) window._forceLocationSearch = false;
    window.store.state.currentSelectedLeadId = id;

    if(!l) return;

    try {
      const fullHistory = await window.api.getLeadHistory(l.id);
      l.call_history = fullHistory.crm_calls || [];
      l.lead_activities = fullHistory.lead_activities || [];
    } catch(e) {
      console.error(e);
    }

    if (draft) {
      l.name = draft.name || l.name;
      l.phone = draft.phone !== undefined ? draft.phone : l.phone;
      l.email = draft.email !== undefined ? draft.email : l.email;
      l.website_url = draft.website_url !== undefined ? draft.website_url : l.website_url;
      l.notes = draft.notes !== undefined ? draft.notes : l.notes;
      l.entscheider = draft.entscheider !== undefined ? draft.entscheider : l.entscheider;
      l.termin = draft.termin !== undefined ? draft.termin : l.termin;
      l.rechnung = draft.rechnung !== undefined ? draft.rechnung : l.rechnung;
      l.maps_city = draft.maps_city !== undefined ? draft.maps_city : l.maps_city;
      l.lat = draft.lat !== undefined ? draft.lat : l.lat;
      l.lng = draft.lng !== undefined ? draft.lng : l.lng;
    }

    window.store.state.currentSnoozeOffset = 0;
    window.store.state.currentSnoozeTargetMs = 0;
    window.store.state.clearSnooze = false;
    window._pendingCallLog = false;
    window.store.state.isTaskMode = false;
    window.store.state.isKundeMode = false;

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
      <div class="apple-section">
        <h4 class="apple-section-title">Follow-Up (Snooze)</h4>
        <div class="snooze-grid" id="snooze-group" style="display: flex; gap: 8px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 120px; display: flex; align-items: stretch;">
            <input type="number" id="snooze-hours-input" value="${(window.store.state.currentSnoozeOffset > 0 && window.store.state.currentSnoozeOffset <= 24) ? window.store.state.currentSnoozeOffset : 24}" style="width: 40px; border-radius: 6px 0 0 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); color: var(--text-main); text-align: center; font-size: 13px; box-sizing: border-box;" onchange="if(window.store.state.currentSnoozeOffset > 0 && window.store.state.currentSnoozeOffset <= 24) selectCustomSnoozeHours()">
            <button class="action-btn snooze-opt ${(window.store.state.currentSnoozeOffset > 0 && window.store.state.currentSnoozeOffset <= 24) ? 'outline' : ''}" id="snz-hours" onclick="selectCustomSnoozeHours()" style="flex: 1; border-radius: 0 6px 6px 0; padding-left: 0; padding-right: 0;">Std.</button>
          </div>
          <div style="flex: 1; min-width: 120px; display: flex; align-items: stretch;">
            <input type="number" id="snooze-days-input" value="${window.store.state.currentSnoozeOffset > 24 ? window.store.state.currentSnoozeOffset / 24 : 7}" style="width: 40px; border-radius: 6px 0 0 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); color: var(--text-main); text-align: center; font-size: 13px; box-sizing: border-box;" onchange="if(window.store.state.currentSnoozeOffset > 24) selectCustomSnooze()">
            <button class="action-btn snooze-opt ${window.store.state.currentSnoozeOffset > 24 ? 'outline' : ''}" id="snz-custom" onclick="selectCustomSnooze()" style="flex: 1; border-radius: 0 6px 6px 0; padding-left: 0; padding-right: 0;">Tage</button>
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
        <div style="padding: 4px 0; font-size: 12px; color: var(--text-muted); cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='var(--text-main)'" onmouseout="this.style.color='var(--text-muted)'" onclick="document.getElementById('loc-search-container').style.display='block'; this.style.display='none';">
          + Standort hinzufügen
        </div>
      `;
    }

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
        <div style="margin-top: 12px; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 14px;">🕒</span>
          <div style="font-size: 12px; color: var(--color-text-primary, #f2f2f7); font-weight: 500;">
            ${escapeHtml(todayStr)}
          </div>
        </div>
      `;
    } else if (ohArray && Array.isArray(ohArray)) {
      let ohStr = ohArray.map(day => escapeHtml(day)).join('<br>');
      openingHoursHtml = `
        <div style="margin-top: 12px;">
          <label style="font-size: 11px; font-weight: 600; color: var(--color-text-secondary, #8e8e93); margin-bottom: 4px; display:block;">Öffnungszeiten</label>
          <div style="font-size: 11px; color: var(--color-text-primary, #f2f2f7); line-height: 1.5;">${ohStr}</div>
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

    let pitchCounterHtml = '';
    if (t) { // If lead is in PITCH
      let callsInPitch = 0;
      let lastCallTs = 0;
      let allActsForCount = [];
      const callSrcForCount = l.call_history || l.crm_calls || [];
      allActsForCount = callSrcForCount.filter(c => typeof c !== 'number');
      callsInPitch = allActsForCount.filter(a => a.type === 'call').length;
      if (callsInPitch > 0) {
        lastCallTs = Math.max(...allActsForCount.filter(a => a.type === 'call').map(a => a.ts));
      }
      const lastCallText = lastCallTs ? `Letzter Anruf: ${new Date(lastCallTs).toLocaleDateString()}` : 'Noch nie angerufen';
      pitchCounterHtml = `
        <div style="margin-top: 16px; padding: 12px; background: rgba(255, 159, 10, 0.15); border: 1px solid rgba(255, 159, 10, 0.3); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">🔥</span>
            <div>
              <div style="color: var(--color-brand-orange, #ff9f0a); font-weight: 600; font-size: 13px;">Bisher ${callsInPitch} mal angerufen</div>
              <div style="color: rgba(255,255,255,0.6); font-size: 11px; margin-top: 2px;">${lastCallText}</div>
            </div>
          </div>
        </div>
      `;
    }

    let allActs = [];
    // Note: getLeads returns 'crm_calls', getLeadHistory stores in 'call_history'
    const callSrc = l.call_history || l.crm_calls || [];
    callSrc.forEach(c => { if(typeof c !== 'number') allActs.push(c); });
    if (l.lead_activities && l.lead_activities.length > 0) {
      l.lead_activities.forEach(a => allActs.push(a));
    }
    allActs.sort((a,b) => (b.ts || 0) - (a.ts || 0));
    
    let activitiesHtml = '';
    if (allActs.length > 0) {
      activitiesHtml = allActs.map(act => {
        const uname = act.by_user_name && act.by_user_name !== 'Unbekannt' ? act.by_user_name : null;
        const dateStr = new Date(act.ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        let icon = '📞';
        let text = '';
        if (act.type === 'call') {
          icon = '📞';
          text = uname ? `Anruf – ${uname}` : 'Anruf';
        } else if (act.type === 'email') {
          icon = '✉️';
          text = act.details || 'E-Mail';
        } else if (act.type === 'status_change') {
          icon = '🔄';
          // Make status change text readable in German
          const detail = act.details || '';
          const statusMap = { 'PITCH': 'Status → Pitch', 'FOLLOW-UP': 'Status → Follow-Up', 'OFFER': 'Status → Angebot', 'CLOSED': 'Status → Abschluss ✅', 'COLD': 'Status → Kalt' };
          const matched = Object.entries(statusMap).find(([k]) => detail.includes(k));
          text = matched ? matched[1] : (uname ? `${detail} – ${uname}` : detail);
        } else {
          text = act.details || act.type;
        }
        
        return `
          <div style="display: flex; gap: 12px; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
            <div style="font-size: 16px; margin-top: 2px;">${icon}</div>
            <div style="flex: 1;">
              <div style="font-size: 13px; color: var(--color-text-primary, #f2f2f7); font-weight: 500;">${escapeHtml(text)}</div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${dateStr}${uname && act.type !== 'call' ? ` · ${escapeHtml(uname)}` : ''}</div>
            </div>
          </div>
        `;
      }).join('');
    } else {
      activitiesHtml = `<div style="font-size: 12px; color: var(--text-muted); opacity: 0.5;">Noch keine Aktivitäten vorhanden.</div>`;
    }

    sidebarEl.innerHTML = `
      <div class="focused-lead" style="display:flex; flex-direction:column; height:100%;">
        
        <!-- HEADER ROW: Unternehmen -->
        <div class="sidebar-header" style="padding: 24px 24px 16px 24px; flex-shrink: 0; background: rgba(13, 13, 15, 0.7); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border-bottom: 1px solid var(--color-border-base, #2c2c2e); z-index: 20; position: sticky; top: 0;">
          
          <!-- MOBILE NATIVE BACK BUTTON -->
          <div class="mobile-only" style="align-items: center; gap: 8px; margin-bottom: 16px; cursor: pointer;" onclick="closeLeadSidebar()">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand-accent, #0a84ff)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            <span style="color: var(--color-brand-accent, #0a84ff); font-size: 16px; font-weight: 500;">Zurück</span>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px; gap: 16px;">
             <div id="sys-name" class="focused-name truncate-1" contenteditable="true" style="outline:none; padding:4px 0; flex: 1; min-width: 0; border-bottom:1px solid transparent; transition:0.2s; font-size: 22px; font-weight: 800; color: var(--color-text-primary, #f2f2f7); margin: 0; white-space: pre-wrap;" onfocus="this.classList.remove('truncate-1'); this.style.borderBottom='1px solid var(--color-brand-accent, #0a84ff)';" onblur="this.classList.add('truncate-1'); this.style.borderBottom='1px solid transparent';">${escapeHtml(l.name)}</div>
             <div style="display:flex; gap:16px; align-items: center; flex-shrink: 0;">
               <button id="sidebar-star-btn" data-starred="${l.starred ? 1 : 0}" style="background:transparent; border:none; font-size:24px; cursor:pointer; padding:0; color: ${l.starred ? '#ffcc00' : 'var(--color-text-secondary, #8e8e93)'}; transition: transform 0.2s; line-height: 1; display: flex; align-items: center;" onclick="toggleLeadStar(${l.id})" title="Priorisieren (Stern)">${l.starred ? '★' : '☆'}</button>
               <button class="desktop-only" style="background:transparent; border:none; font-size:20px; cursor:pointer; padding:0; color:var(--color-text-secondary, #8e8e93); transition: color 0.2s; line-height: 1; display: flex; align-items: center;" onclick="closeLeadSidebar()" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='var(--color-text-secondary, #8e8e93)'" title="Lead abwählen">✕</button>
             </div>
          </div>
          <div class="pipeline-bar" style="margin-top: 12px; display: flex; gap: 4px; overflow-x: auto;">
            <div id="seg-0" class="pipe-seg ${!e && !t && !r && !isKunde ? 'active-cold' : ''}" style="flex:1; text-align:center; padding:6px; font-size:10px; border-radius:6px; cursor:pointer;" onclick="setPipeline('cold')">COLD</div>
            <div id="seg-1" class="pipe-seg ${e && !t && !r && !isKunde ? 'active-pitch' : ''}" style="flex:1; text-align:center; padding:6px; font-size:10px; border-radius:6px; cursor:pointer;" onclick="setPipeline('e')">PITCH</div>
            <div id="seg-2" class="pipe-seg ${t && !r && !isKunde ? 'active-data' : ''}" style="flex:1; text-align:center; padding:6px; font-size:10px; border-radius:6px; cursor:pointer;" onclick="setPipeline('t')">DATA</div>
            <div id="seg-3" class="pipe-seg ${r && !isKunde ? 'active-offer' : ''}" style="flex:1; text-align:center; padding:6px; font-size:10px; border-radius:6px; cursor:pointer;" onclick="setPipeline('r')">OFFER</div>
            <div id="seg-4" class="pipe-seg ${isKunde ? 'active-kunde' : ''}" style="flex:1; text-align:center; padding:6px; font-size:10px; border-radius:6px; cursor:pointer;" onclick="setPipeline('k')">CLOSED</div>
          </div>
          ${pitchCounterHtml}
        </div>

        <!-- SCROLLABLE BODY -->
        <div class="sidebar-body" style="flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 24px; gap: 20px;">
          
          <!-- Kontakt-Informationen -->
          <div class="apple-section">
            <h4 class="apple-section-title">Kontakt</h4>
            <div style="display:flex; flex-direction:column; gap:12px;">
               <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap: wrap; gap: 8px;">
                 <input type="text" id="sys-phone" style="font-family:ui-monospace, monospace; font-size:14px; padding:8px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:8px; outline:none; transition:0.2s; color:var(--color-text-primary, #f2f2f7); flex: 1; min-width: 150px;" value="${escapeHtml(l.phone || '')}" placeholder="Keine Nummer" onfocus="this.style.borderBottom='1px solid var(--color-brand-accent, #0a84ff)';" onblur="this.style.borderBottom='1px solid transparent';">
                 <div style="display:flex; gap: 8px; align-items: center;">
                   ${(l.phone && window.PhoneUtil) ? window.PhoneUtil.renderWhatsAppIcon(l.phone).replace('<a', '<a style=\"background: rgba(37, 211, 102, 0.1); color: #25D366 !important; padding: 8px 12px; border-radius: 8px;\"') : ''}
                   <button style="background:transparent; border:none; padding:8px 12px; font-size:12px; color:var(--color-brand-accent, #0a84ff); font-weight:600; cursor:pointer; background: rgba(10, 132, 255, 0.1); border-radius: 8px;" onclick="copyPhone(event, ${l.id}, '${escapeHtml(l.phone || '')}')">Copy</button>
                 </div>
               </div>
               
               <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap: wrap; gap: 8px;">
                 <input type="text" id="sys-email" style="font-family:ui-monospace, monospace; font-size:14px; padding:8px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:8px; outline:none; transition:0.2s; color:var(--color-text-primary, #f2f2f7); flex: 1; min-width: 150px;" value="${escapeHtml(l.email || '')}" placeholder="Keine E-Mail" onfocus="this.style.borderBottom='1px solid var(--color-brand-accent, #0a84ff)';" onblur="this.style.borderBottom='1px solid transparent';">
                 <button style="background:transparent; border:none; padding:8px 12px; font-size:12px; color:var(--color-brand-accent, #0a84ff); font-weight:600; cursor:pointer; background: rgba(10, 132, 255, 0.1); border-radius: 8px;" onclick="copyEmail(event, ${l.id}, '${escapeHtml(l.email || '')}')">Copy</button>
               </div>
            </div>
          </div>

          <!-- Eigenschaften (Groß/Tarif) -->
          <div class="apple-section">
            <h4 class="apple-section-title">Eigenschaften</h4>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size: 13px; color: var(--color-text-primary, #f2f2f7);">Unternehmensgröße</span>
              <div style="display:flex; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 2px;">
                <button class="size-btn" data-size="Tarifkunde" style="padding: 4px 12px; font-size: 12px; font-weight: 600; border-radius: 6px; border: none; cursor: pointer; transition: 0.2s; ${l.size === 'Tarifkunde' || !l.size ? 'background: var(--color-brand-accent, #0a84ff); color: white;' : 'background: transparent; color: var(--text-muted);'}" onclick="updateLeadSize(${l.id}, 'Tarifkunde')">Tarif</button>
                <button class="size-btn" data-size="Großkunde" style="padding: 4px 12px; font-size: 12px; font-weight: 600; border-radius: 6px; border: none; cursor: pointer; transition: 0.2s; ${l.size === 'Großkunde' ? 'background: var(--color-brand-accent, #0a84ff); color: white;' : 'background: transparent; color: var(--text-muted);'}" onclick="updateLeadSize(${l.id}, 'Großkunde')">Groß</button>
              </div>
            </div>
          </div>

          <!-- Aktivitäten Historie -->
          <div class="apple-section">
            <h4 class="apple-section-title">Aktivitäten Historie</h4>
            <div style="display: flex; flex-direction: column;">
              ${activitiesHtml}
            </div>
          </div>

          <!-- Notizen -->
          <div class="apple-section" style="display: flex; flex-direction: column;">
            <h4 class="apple-section-title">Notizen</h4>
            <textarea id="note-input" class="modern-input" placeholder="Notizen hier eintragen..." style="width: 100%; box-sizing: border-box; min-height: 120px; flex: 1; resize: vertical; margin-bottom: 0; background: transparent; border: none; padding: 8px 0; color: var(--color-text-primary, #f2f2f7); font-size: 14px;">${escapeHtml(l.notes || '')}</textarea>
          </div>

          <!-- Mission Briefing (Aufgaben) -->
          <div class="apple-section">
            <h4 class="apple-section-title">Aufgaben</h4>
            <div id="tasks-list" style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;"></div>
            <form onsubmit="window.handleNewTaskSubmit(event)" style="margin:0; padding:0; width:100%;">
              <input type="text" id="new-task-input-rem" style="width:100%; box-sizing:border-box; border:none; background:transparent; font-size:14px; color:var(--color-text-primary, #f2f2f7); padding:8px 0; outline:none;" placeholder="+ Neue Aufgabe..." enterkeyhint="done" onkeypress="handleNewTaskKeyPress(event)" />
            </form>
          </div>

          <!-- Verknüpfte Leads -->
          <div class="apple-section">
            <h4 class="apple-section-title">Verknüpfte Leads</h4>
            <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;" id="linked-leads-list">
              ${(() => {
                let html = '';
                const links = l.linked_leads || [];
                if (links.length > 0) {
                   links.forEach(link => {
                      const tLead = (window.store.state.leads || []).find(x => x.id === link.id);
                      const name = tLead ? tLead.name : 'Unbekannt';
                      html += `
                        <div style="display:flex; align-items:center; justify-content:space-between; background:var(--color-surface-hover, #1c1c1e); padding:6px 10px; border-radius:6px; cursor:pointer; transition:0.2s;" onclick="openLead(${link.id})">
                          <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:16px; color:var(--text-muted); opacity:0.7;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></span>
                            <div style="display:flex; flex-direction:column;">
                              <span style="font-size:13px; color:var(--color-text-primary, #f2f2f7); font-weight:500;">${escapeHtml(name)}</span>
                              <span style="font-size:10px; color:var(--text-muted);">${escapeHtml(link.type)}</span>
                            </div>
                          </div>
                          <button onclick="event.stopPropagation(); window.removeLeadLink(${l.id}, ${link.id})" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:16px; padding:0 4px;">×</button>
                        </div>
                      `;
                   });
                }
                return html;
              })()}
            </div>
            <div id="inline-link-search" style="display:none; margin-top:12px;">
              <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <input type="text" id="inline-link-input" class="modern-input-small" style="font-size: 12px; padding: 8px; flex:1; background: rgba(0,0,0,0.2); color:white; border:none; border-radius:6px; outline:none;" placeholder="Lead-Namen suchen..." oninput="window.filterInlineLinkLeads(this.value)" autocomplete="off" />
                <select id="inline-link-type" class="modern-input-small" style="font-size: 12px; padding: 6px 4px; background: rgba(0,0,0,0.2); color: white; border: none; border-radius: 6px; outline:none; max-width:110px;">
                   <option value="Filiale / Standort">Standort</option>
                   <option value="Empfehlung">Empfehlung</option>
                </select>
              </div>
              <div id="inline-link-results" style="max-height: 150px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; display:none;">
                ${(() => {
                  const leads = window.store.state.leads || [];
                  const sortedLeads = [...leads].sort((a,b) => (a.name || '').localeCompare(b.name || ''));
                  let opts = '';
                  sortedLeads.forEach(sl => {
                    if (sl.id !== l.id && sl.name) {
                      opts += `<div class="link-lead-option" style="padding:8px 12px; background:rgba(0,0,0,0.2); border-radius:6px; cursor:pointer; color:white; font-size:12px; transition:0.2s; display:none;" onmouseover="this.style.background='rgba(0,0,0,0.4)'" onmouseout="this.style.background='rgba(0,0,0,0.2)'" onclick="window.saveInlineLeadLink(${l.id}, ${sl.id})">${escapeHtml(sl.name)}</div>`;
                    }
                  });
                  return opts;
                })()}
              </div>
            </div>
            
            <div id="inline-link-toggle" style="padding: 4px 0; font-size: 12px; color: var(--text-muted); cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='var(--text-main)'" onmouseout="this.style.color='var(--text-muted)'" onclick="document.getElementById('inline-link-search').style.display='flex'; this.style.display='none';">
              + Verknüpfung hinzufügen
            </div>
          </div>

          <!-- Location & Opening Hours -->
          <div class="apple-section">
            <h4 class="apple-section-title">Standort</h4>
            ${locListHtml}
            ${openingHoursHtml}
            <div id="loc-search-container" style="display:${window._forceLocationSearch ? 'block' : 'none'}; margin-top:12px;">
              <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <input type="text" id="loc-search-input" class="modern-input-small" style="font-size: 12px; padding: 8px; flex:1; background: rgba(0,0,0,0.2); color:white; border:none; border-radius:6px;" value="${escapeHtml(l.name)}" placeholder="Firma, Ort..." />
                <button class="action-btn-small" style="background: var(--color-brand-accent, #0a84ff); color: white; border-color: var(--color-brand-accent, #0a84ff); font-weight: 600; padding: 0 12px; border-radius:6px;" onclick="searchLeadLocation(${l.id})">Suchen</button>
              </div>
              <div id="loc-search-results" style="max-height: 150px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;"></div>
            </div>
          </div>

          <!-- Zuweisung -->
          ${(function(){
            let assignmentHtml = '';
            if (window.globalUser && (window.globalUser.role === 'admin' || window.globalUser.role === 'developer')) {
              const usersOpts = [{ id: 'unassigned', name: 'Niemandem zugewiesen' }].concat(window.globalUsersList || []);
              const optsHtml = usersOpts.map(u => `<option value="${u.id}" ${l.claimed_by === u.id || (!l.claimed_by && u.id === 'unassigned') ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('');
              
              assignmentHtml = `
                <div class="apple-section">
                  <h4 class="apple-section-title">Zuweisung</h4>
                  <select id="sys-claimed-by" class="modern-input-small" style="width: 100%; box-sizing: border-box; background: transparent; border: none; padding: 8px 0; font-size: 14px; color: var(--color-text-primary); outline:none;" onchange="handleLeadAssignmentChange(this.value); if(window.saveAdminAssignment){ window.saveAdminAssignment(${l.id}, this.value); }">
                    ${optsHtml}
                  </select>
                </div>
              `;
            } else {
              assignmentHtml = `<input type="hidden" id="sys-claimed-by" value="${l.claimed_by || 'unassigned'}">`;
            }
            return assignmentHtml;
          })()}

          <!-- Snooze and Advanced settings -->
          ${snoozeHtml.replace('margin-top: 16px;', '').replace('label', 'h4 class="apple-section-title"').replace('<div class="snooze-grid"', '<div class="apple-section"><h4 class="apple-section-title">Follow-Up (Snooze)</h4><div class="snooze-grid"')}</div>

          <div style="display: flex; justify-content: center; gap: 24px; margin-top: 8px; margin-bottom: 24px;">
            <button class="action-btn-small" style="border:none; color:var(--color-text-secondary, #8e8e93); background:transparent; font-size: 12px; padding: 4px; cursor:pointer; transition: color 0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='var(--color-text-secondary, #8e8e93)'" onclick="markLeadUninteresting('${l.id}')">Uninteressant</button>
            <button class="action-btn-small" style="border:none; color:var(--color-text-secondary, #8e8e93); background:transparent; font-size: 12px; padding: 4px; cursor:pointer; transition: color 0.2s;" onmouseover="this.style.color='#ff453a'" onmouseout="this.style.color='var(--color-text-secondary, #8e8e93)'" onclick="deleteLead('${l.id}')">Löschen</button>
          </div>

          <!-- Hidden System Fields -->
          <input type="hidden" id="sys-e" value="${e ? 1 : 0}">
          <input type="hidden" id="sys-t" value="${t ? 1 : 0}">
          <input type="hidden" id="sys-r" value="${r ? 1 : 0}">
          <input type="hidden" id="sys-k" value="${isKunde ? 1 : 0}">
          <input type="hidden" id="sys-web" value="${escapeHtml(l.website_url||'')}">
          <input type="hidden" id="sys-placeid" value="${l.google_place_id||''}">
          <input type="hidden" id="sys-lat" value="${l.lat||''}">
          <input type="hidden" id="sys-lng" value="${l.lng||''}">
          <input type="hidden" id="sys-city" value="${escapeHtml(l.maps_city||'')}">

        </div>
        
        <div class="sidebar-footer" style="padding: 16px 24px max(24px, env(safe-area-inset-bottom)) 24px; flex-shrink: 0; border-top: 1px solid var(--color-border-base, #2c2c2e); background: var(--color-bg-panel, #0d0d0f); z-index: 10;">
          <button class="action-btn success-bold ${isSaving ? 'btn-success-flash' : ''}" id="main-save-btn" style="width:100%; padding: 14px; font-size:15px; font-weight:600; border-radius: var(--radius-lg, 12px);" onclick="saveLeadMain(${l.id}, true)">${isSaving ? '✓ Gespeichert' : 'Speichern'}</button>
        </div>
      </div>
    `;
    
    renderTasksList();

    if (isSaving) {
      setTimeout(() => {
        const btn = document.getElementById('main-save-btn');
        if (btn) {
          btn.classList.remove('btn-success-flash');
          btn.textContent = 'Speichern';
        }
      }, 2000);
    }
  };

  // --- NEW FEATURES: Pin Click, Call Tracking & Calendar ---
  
  window.closeLeadSidebar = () => {
    if (window.store.state.currentSelectedLeadId) {
      if (typeof window.checkUnsavedChangesBeforeClose === 'function') {
        window.checkUnsavedChangesBeforeClose(window.store.state.currentSelectedLeadId, () => {
          window.store.state.currentSelectedLeadId = null;
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
    
    window.store.state.currentSelectedLeadId = null;
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

  window.toggleTaskFast = async (leadId, taskId, done, subtaskId = null) => {
    try {
      const fullList = await window.api.getLeads({ all: true }); 
      const l = fullList.find(x => x.id === leadId);
      if (!l || !l.task_text) return;
      
      let tasks = [];
      try { tasks = JSON.parse(l.task_text); } catch(e) { return; }
      const t = tasks.find(x => x.id === taskId);
      if (t) {
         if (subtaskId) {
           const st = t.subtasks?.find(x => x.id === subtaskId);
           if (st) st.done = done;
         } else {
           t.done = done;
           if (done) {
             window.sessionDoneTasks = window.sessionDoneTasks || new Set();
             window.sessionDoneTasks.add(t.id);
           }
           if (t.subtasks) {
             t.subtasks.forEach(s => s.done = done);
           }
         }
         
         l.task_text = JSON.stringify(tasks);
         await window.api.saveLead(l);
         if (done && typeof window.showToast === 'function') {
           window.showToast("Aufgabe erledigt!");
         }
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
      const draft = typeof window.getDomDraft === 'function' ? window.getDomDraft() : null;
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
        
        if (window.store.state.currentTab === 'map') {
          if (typeof window.loadMapData === 'function') {
            await window.loadMapData();
          }
        }
        await loadUi();
        if (window.openLeadDirectly) await window.openLeadDirectly(id, false, false, draft);
        else await openLead(id);
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
      const draft = typeof window.getDomDraft === 'function' ? window.getDomDraft() : null;
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
      if (window.openLeadDirectly) await window.openLeadDirectly(leadId, false, false, draft);
      else await openLead(leadId);

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
      const draft = typeof window.getDomDraft === 'function' ? window.getDomDraft() : null;
      const fullList = await window.api.getLeads({ all: true });
      const l = fullList.find(x => x.id === id);
      if (!l) return;
      
      l.starred = l.starred ? 0 : 1;
      const starBtn = document.getElementById('sidebar-star-btn');
      if (starBtn) {
        starBtn.setAttribute('data-starred', l.starred ? '1' : '0');
        starBtn.style.color = l.starred ? '#ffcc00' : 'var(--text-muted)';
        starBtn.innerText = l.starred ? '★' : '☆';
      }
      
      await window.api.saveLead(l);
      showToast(l.starred ? "Lead priorisiert! ⭐" : "Priorisierung aufgehoben.");
      await loadUi();
      // toggleLeadStar didn't call openLead, but if it did, we'd pass draft.
      // Wait, toggleLeadStar just calls loadUi(). It doesn't re-render the sidebar.
      // We don't need to do anything else!
    } catch(e) {
      console.error(e);
      showToast("Fehler beim Priorisieren.");
    }
  };

  window.executeUniversalEnrichment = async () => {
    const btn = document.getElementById('btn-run-enrich');
    if (btn) {
      btn.innerText = 'Läuft... Bitte warten ⏳';
      btn.disabled = true;
    }
    
    try {
      const allLeads = await window.api.getLeads({ all: true });
      const apiKey = localStorage.getItem('googlePlacesApiKey') || '';
      
      showToast(`${allLeads.length} Leads werden auf fehlende Daten geprüft...`);
      
      let emailEnrichedCount = 0;
      let apiEnrichedCount = 0;
      
      for (let i = 0; i < allLeads.length; i++) {
        const l = allLeads[i];
        let changed = false;

        if (btn) btn.innerText = `Prüfe ${i + 1} von ${allLeads.length}...`;
        
        // 1. Google Places Backfill (if we have ID and are missing fields)
        const hasOpeningHours = l.locations && l.locations.length > 0 && !!l.locations[0].opening_hours;
        const needsApi = !l.phone || !l.maps_city || !l.lat || !l.lng || !hasOpeningHours;
        if (l.google_place_id && apiKey && needsApi) {
           try {
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
                 if (!l.phone && (data.nationalPhoneNumber || data.internationalPhoneNumber)) {
                    l.phone = data.nationalPhoneNumber || data.internationalPhoneNumber;
                    changed = true;
                 }
                 const bestAddress = data.formattedAddress || data.displayName?.text;
                 if (!l.maps_city && bestAddress) {
                    l.maps_city = bestAddress;
                    changed = true;
                 }
                 if ((!l.lat || !l.lng) && data.location) {
                    l.lat = data.location.latitude;
                    l.lng = data.location.longitude;
                    changed = true;
                 }
                 if (data.regularOpeningHours) {
                    if (!l.locations) l.locations = [];
                    if (l.locations.length === 0) {
                      l.locations.push({
                         address: l.maps_city, lat: l.lat, lng: l.lng, place_id: l.google_place_id, opening_hours: data.regularOpeningHours.weekdayDescriptions
                      });
                      changed = true;
                    } else if (!l.locations[0].opening_hours) {
                      l.locations[0].opening_hours = data.regularOpeningHours.weekdayDescriptions;
                      changed = true;
                    }
                 }
               }
             }
           } catch (e) {
             console.warn("Places API Error", e);
           }
        }

        // 2. Website Email Backfill
        if (!l.email && l.website_url && l.website_url.startsWith('http')) {
           try {
             const email = await scrapeEmailFromWebsite(l.website_url);
             if (email) {
               l.email = email;
               changed = true;
               emailEnrichedCount++;
             }
           } catch (e) {
             console.warn("Website Scrape Error", e);
           }
        }

        if (changed) {
          apiEnrichedCount++;
          await window.api.saveLead(l);
        }
      }
      
      showToast(`Enrichment fertig! ${apiEnrichedCount} Leads aktualisiert (davon ${emailEnrichedCount} neue E-Mails).`);
      await loadUi(); // Refresh UI
      
    } catch (err) {
      console.error(err);
      showToast(`Enrichment Fehler: ${err.message}`, true);
    } finally {
      if (btn) {
        btn.innerText = 'Data Enrichment (Alle fehlenden Daten laden)';
        btn.disabled = false;
      }
    }
  };

  async function scrapeEmailFromWebsite(baseUrl) {
    try {
      let html = "";
      // First try the main page
      const res = await window.api.fetchApi(baseUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.ok) {
         html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      }
      
      let email = extractBestEmail(html);
      
      // If no email on main page, search for impressum link
      if (!email && html) {
         const parser = new DOMParser();
         const doc = parser.parseFromString(html, "text/html");
         const links = Array.from(doc.querySelectorAll('a'));
         let impressumUrl = null;
         for (let a of links) {
           const text = a.textContent.toLowerCase();
           const href = a.getAttribute('href') || '';
           if (text.includes('impressum') || href.toLowerCase().includes('impressum') || text.includes('kontakt')) {
             if (href.startsWith('http')) {
                impressumUrl = href;
             } else if (href.startsWith('/')) {
                impressumUrl = baseUrl.replace(/\/$/, '') + href;
             } else {
                impressumUrl = baseUrl.replace(/\/$/, '') + '/' + href;
             }
             break;
           }
         }
         
         if (impressumUrl) {
           const impRes = await window.api.fetchApi(impressumUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
           if (impRes.ok) {
              const impHtml = typeof impRes.data === 'string' ? impRes.data : JSON.stringify(impRes.data);
              email = extractBestEmail(impHtml);
           }
         }
      }
      return email;
    } catch (e) {
      return null;
    }
  }

  function extractBestEmail(html) {
    if (!html) return null;
    const bodyText = html.replace(/<style[^>]*>.*<\/style>/gis, '')
                         .replace(/<script[^>]*>.*<\/script>/gis, '')
                         .replace(/<[^>]+>/g, ' ');
    
    // Find all emails
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
    const matches = [...bodyText.matchAll(emailRegex)];
    if (matches.length === 0) return null;
    
    // Look for keywords near the email
    const keywords = ['geschäftsführer', 'inhaber', 'vertretungsberechtigt', 'ceo', 'vorstand'];
    
    for (let m of matches) {
      const email = m[1].toLowerCase();
      // Avoid obvious dummy emails or image names disguised as emails
      if (email.endsWith('.png') || email.endsWith('.jpg') || email.endsWith('.jpeg') || email.endsWith('.gif') || email.endsWith('.webp')) continue;
      
      const index = m.index;
      // Extract a window of text around the email
      const windowStart = Math.max(0, index - 200);
      const windowEnd = Math.min(bodyText.length, index + 200);
      const context = bodyText.substring(windowStart, windowEnd).toLowerCase();
      
      for (let k of keywords) {
         if (context.includes(k)) {
           return m[1]; // Found a prioritized email
         }
      }
    }
    
    // Return the first valid one if no keywords found
    for (let m of matches) {
      const email = m[1].toLowerCase();
      if (!(email.endsWith('.png') || email.endsWith('.jpg') || email.endsWith('.jpeg') || email.endsWith('.gif') || email.endsWith('.webp'))) {
         return m[1];
      }
    }
    
    return null;
  }

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

  window.updateGlobalMetrics = async () => {
    try {
      const widget = document.getElementById('global-metrics-widget');
      if (!widget) return;
      
      const currentUser = await window.api.getCurrentUser();
      if (!currentUser) return;
      
      const stats = await window.api.getAgentStats();
      if (!stats || stats.length === 0) return;
      
      const myStats = stats.find(s => s.id === currentUser.id);
      if (!myStats) return;
      
      widget.style.display = 'flex';
      
      const goal = myStats.daily_call_goal || 100;
      const callsToday = myStats.today.calls;
      const emailsToday = myStats.today.emails;
      
      document.getElementById('gm-calls').innerText = `${callsToday} / ${goal}`;
      document.getElementById('gm-emails').innerText = `${emailsToday}`;
      
      const todayStr = new Date().toISOString().split('T')[0];
      const lsKey = `dashboard_manual_kpis_${todayStr}`;
      let manualData = { revenue: '0 € / 2500 €' };
      try {
        const stored = localStorage.getItem(lsKey);
        if (stored) manualData = { ...manualData, ...JSON.parse(stored) };
      } catch(e) {}
      
      const revEl = document.getElementById('gm-revenue');
      if (revEl) {
        revEl.innerText = manualData.revenue || '0 €';
      }
      
    } catch (err) {
      console.warn('Failed to update global metrics:', err);
    }
  };

  window.renderDashboard = async () => {
    const container = document.getElementById('dashboard-content');
    if (!container) return;
    
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '32px';
    
    try {
      const currentUser = await window.api.getCurrentUser();
      
      if (currentUser.role !== 'developer') {
        container.innerHTML = `
          <div style="flex: 1; display: flex; align-items: center; justify-content: center; background: #000; border-radius: var(--radius-lg, 12px); min-height: 400px; width: 100%;">
            <h1 style="color: #fff; font-size: 24px; font-weight: 700; letter-spacing: 1px;">COMING SOON</h1>
          </div>
        `;
        return;
      }
      
      container.innerHTML = '<div class="empty-state" style="width: 100%;">Lade Metriken...</div>';
      const stats = await window.api.getAgentStats();
      
      if (!stats || stats.length === 0) {
        container.innerHTML = '<div class="empty-state" style="width: 100%;">Noch keine Metriken verfügbar.</div>';
        return;
      }
      
      container.innerHTML = '';
      
      const myStats = stats.find(s => s.id === currentUser.id);
      
      if (myStats) {
        const mySection = document.createElement('div');
        
        let kpiGoals = { warm: 20, cold_tarif: 10, cold_gross: 10 };
        try {
          const storedGoals = localStorage.getItem('dashboard_kpi_goals');
          if (storedGoals) kpiGoals = { ...kpiGoals, ...JSON.parse(storedGoals) };
        } catch(e) {}
        
        const warmAct = myStats.today.warm || 0;
        const tarifAct = myStats.today.cold_tarif || 0;
        const grossAct = myStats.today.cold_gross || 0;
        const offersAct = myStats.today.offers || 0;
        
        mySection.innerHTML = `
          <div style="margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <h2 style="font-size: 18px; font-weight: 700; color: #fff; margin: 0;">KPI Dashboard</h2>
            <div style="display: flex; gap: 12px; align-items: center;">
              <div style="display: flex; align-items: center; gap: 4px;">
                <span style="font-size: 11px; color: var(--text-muted);">Warm:</span>
                <input type="number" id="goal-warm" value="${kpiGoals.warm}" class="modern-input-small" style="width: 50px; text-align: center; padding: 4px;" />
              </div>
              <div style="display: flex; align-items: center; gap: 4px;">
                <span style="font-size: 11px; color: var(--text-muted);">Tarif:</span>
                <input type="number" id="goal-tarif" value="${kpiGoals.cold_tarif}" class="modern-input-small" style="width: 50px; text-align: center; padding: 4px;" />
              </div>
              <div style="display: flex; align-items: center; gap: 4px;">
                <span style="font-size: 11px; color: var(--text-muted);">Groß:</span>
                <input type="number" id="goal-gross" value="${kpiGoals.cold_gross}" class="modern-input-small" style="width: 50px; text-align: center; padding: 4px;" />
              </div>
              <button class="action-btn-small outline" onclick="window.saveKpiGoals()" style="padding: 4px 12px;">Speichern</button>
            </div>
          </div>
          
          <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 16px;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
              
              <div style="background: rgba(0,0,0,0.2); padding: 16px; border-radius: 8px; text-align: center;">
                <div style="font-size: 24px; font-weight: 800; color: #fff;">${warmAct} <span style="font-size: 14px; color: var(--text-muted);">/ ${kpiGoals.warm}</span></div>
                <div style="font-size: 11px; color: var(--color-crm-milestone1, #0a84ff); text-transform: uppercase; font-weight: bold;">Warme Calls</div>
              </div>
              
              <div style="background: rgba(0,0,0,0.2); padding: 16px; border-radius: 8px; text-align: center;">
                <div style="font-size: 24px; font-weight: 800; color: #fff;">${tarifAct} <span style="font-size: 14px; color: var(--text-muted);">/ ${kpiGoals.cold_tarif}</span></div>
                <div style="font-size: 11px; color: var(--color-brand-orange, #ff9f0a); text-transform: uppercase; font-weight: bold;">Cold (Tarif)</div>
              </div>
              
              <div style="background: rgba(0,0,0,0.2); padding: 16px; border-radius: 8px; text-align: center;">
                <div style="font-size: 24px; font-weight: 800; color: #fff;">${grossAct} <span style="font-size: 14px; color: var(--text-muted);">/ ${kpiGoals.cold_gross}</span></div>
                <div style="font-size: 11px; color: var(--color-crm-customer, #34c759); text-transform: uppercase; font-weight: bold;">Cold (Groß)</div>
              </div>

              <div style="background: rgba(0,0,0,0.2); padding: 16px; border-radius: 8px; text-align: center;">
                <div style="font-size: 24px; font-weight: 800; color: #fff;">${offersAct}</div>
                <div style="font-size: 11px; color: var(--color-crm-milestone2, #ff453a); text-transform: uppercase; font-weight: bold;">Angebote Gesendet</div>
              </div>
              
            </div>
            
            <div style="height: 300px; width: 100%;">
              <canvas id="kpiChart"></canvas>
            </div>
          </div>
        `;
        container.appendChild(mySection);
        
        // Render Chart
        setTimeout(() => {
          const ctx = document.getElementById('kpiChart').getContext('2d');
          new Chart(ctx, {
            type: 'bar',
            data: {
              labels: ['Warm', 'Cold (Tarif)', 'Cold (Groß)'],
              datasets: [
                {
                  label: 'Ist',
                  data: [warmAct, tarifAct, grossAct],
                  backgroundColor: ['#0a84ff', '#ff9f0a', '#34c759'],
                  borderRadius: 4
                },
                {
                  label: 'Ziel',
                  data: [kpiGoals.warm, kpiGoals.cold_tarif, kpiGoals.cold_gross],
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                  borderWidth: 1,
                  borderRadius: 4
                }
              ]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: 'rgba(255, 255, 255, 0.7)' } },
                x: { grid: { display: false }, ticks: { color: 'rgba(255, 255, 255, 0.7)' } }
              },
              plugins: {
                legend: { labels: { color: 'rgba(255, 255, 255, 0.7)' } }
              }
            }
          });
        }, 100);
        
        window.saveKpiGoals = () => {
          const warm = parseInt(document.getElementById('goal-warm').value) || 20;
          const tarif = parseInt(document.getElementById('goal-tarif').value) || 10;
          const gross = parseInt(document.getElementById('goal-gross').value) || 10;
          localStorage.setItem('dashboard_kpi_goals', JSON.stringify({ warm, cold_tarif: tarif, cold_gross: gross }));
          window.renderDashboard();
        };
      }
      
      const teamSection = document.createElement('div');
      teamSection.innerHTML = `
        <div style="margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
          <h2 style="font-size: 18px; font-weight: 700; color: #fff; margin: 0;">Team Performance</h2>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 24px;" id="team-grid"></div>
      `;
      container.appendChild(teamSection);
      
      const teamGrid = document.getElementById('team-grid');
      
      stats.forEach(stat => {
        const answeredRate = stat.today.calls > 0 ? Math.round(((stat.today.calls - stat.today.unanswered) / stat.today.calls) * 100) : 0;
        const answeredRateWeek = stat.week.calls > 0 ? Math.round(((stat.week.calls - stat.week.unanswered) / stat.week.calls) * 100) : 0;
        
        const card = document.createElement('div');
        card.style.cssText = 'background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 16px;';
        
        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width:36px; height:36px; border-radius:50%; background:var(--surface); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:14px; color:var(--text-main);">
                ${stat.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 style="margin: 0 0 2px 0; font-size: 15px; font-weight: 700; color: var(--text-main);">${stat.name}</h3>
                <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">${stat.role === 'minion' ? 'Agent' : stat.role}</div>
              </div>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 6px;">Ziel: ${stat.daily_call_goal || 100}</div>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr; gap: 8px;">
            <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; text-align: center;">
              <div style="font-size: 18px; font-weight: 800; color: #fff;">${stat.today.calls} <span style="font-size: 11px; color: var(--text-muted); font-weight: 500;">/ ${stat.week.calls}</span></div>
              <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase;">Calls (Heute / Woche)</div>
            </div>
          </div>
        `;
        
        teamGrid.appendChild(card);
      });
      
    } catch(err) {
      console.error(err);
      container.innerHTML = `<div class="empty-state" style="width: 100%; color: #ff453a;">Fehler beim Laden der Metriken: ${err.message}</div>`;
    }
  };


// --- Linked Leads Logic ---
window.filterInlineLinkLeads = (val) => {
  const resultsDiv = document.getElementById('inline-link-results');
  if (!resultsDiv) return;
  
  if (!val || val.trim().length === 0) {
    resultsDiv.style.display = 'none';
    return;
  }
  
  const opts = resultsDiv.querySelectorAll('.link-lead-option');
  let hasAny = false;
  opts.forEach(opt => {
    if (opt.textContent.toLowerCase().includes(val.toLowerCase())) {
      opt.style.display = 'block';
      hasAny = true;
    } else {
      opt.style.display = 'none';
    }
  });
  resultsDiv.style.display = hasAny ? 'flex' : 'none';
};

window.saveInlineLeadLink = async (sourceId, targetId) => {
  if (!targetId || isNaN(targetId)) return;
  const draft = typeof window.getDomDraft === 'function' ? window.getDomDraft() : null;
  const type = document.getElementById('inline-link-type').value;

  const leads = window.store.state.leads;
  const source = leads.find(l => l.id === sourceId);
  const target = leads.find(l => l.id === targetId);
  if (!source || !target) return;

  source.linked_leads = source.linked_leads || [];
  target.linked_leads = target.linked_leads || [];

  if (!source.linked_leads.find(x => x.id === targetId)) {
    source.linked_leads.push({ id: targetId, type });
  }
  if (!target.linked_leads.find(x => x.id === sourceId)) {
    let reverseType = type;
    if (type === 'Empfehlung') reverseType = 'Empfohlen von';
    target.linked_leads.push({ id: sourceId, type: reverseType });
  }

  await window.api.saveLead(source);
  await window.api.saveLead(target);
  
  if (typeof window.showToast === 'function') window.showToast('Leads verknüpft');
  
  if (window.store.state.currentLeadId === sourceId) {
    if (window.openLeadDirectly) await window.openLeadDirectly(sourceId, true, false, draft);
    else window.openLead(sourceId, true);
  }
};

window.removeLeadLink = async (sourceId, targetId) => {
  if (!confirm('Verknüpfung wirklich entfernen?')) return;
  const draft = typeof window.getDomDraft === 'function' ? window.getDomDraft() : null;
  const leads = window.store.state.leads;
  const source = leads.find(l => l.id === sourceId);
  const target = leads.find(l => l.id === targetId);
  
  if (source) {
    source.linked_leads = (source.linked_leads || []).filter(x => x.id !== targetId);
    await window.api.saveLead(source);
  }
  if (target) {
    target.linked_leads = (target.linked_leads || []).filter(x => x.id !== sourceId);
    await window.api.saveLead(target);
  }
  
  if (typeof window.showToast === 'function') window.showToast('Verknüpfung entfernt');
  
  if (window.store.state.currentLeadId === sourceId) {
    if (window.openLeadDirectly) await window.openLeadDirectly(sourceId, true, false, draft);
    else window.openLead(sourceId, true);
  }
};
