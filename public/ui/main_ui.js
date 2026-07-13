window.setPipeline = async (type) => {
    let e = parseInt(document.getElementById('sys-e').value) || 0;
    let t = parseInt(document.getElementById('sys-t').value) || 0;
    let r = parseInt(document.getElementById('sys-r').value) || 0;
    let k = parseInt(document.getElementById('sys-k').value) || 0;

    if (type === 'e') {
       e = e ? 0 : 1;
       if (e === 0) { t = 0; r = 0; k = 0; }
    }
    if (type === 't') {
       t = t ? 0 : 1;
       if (t) e = 1;
       if (t === 0) { r = 0; k = 0; }
    }
    if (type === 'r') {
       r = r ? 0 : 1;
       if (r) { e = 1; t = 1; }
       if (r === 0) k = 0;
    }
    if (type === 'k') {
       k = k ? 0 : 1;
       if (k) { e = 1; t = 1; r = 1; }
    }

    document.getElementById('sys-e').value = e;
    document.getElementById('sys-t').value = t;
    document.getElementById('sys-r').value = r;
    document.getElementById('sys-k').value = k;

    const s1 = document.getElementById('seg-1');
    const s2 = document.getElementById('seg-2');
    const s3 = document.getElementById('seg-3');
    const s4 = document.getElementById('seg-4');

    if (s1) s1.className = 'pipe-seg';
    if (s2) s2.className = 'pipe-seg';
    if (s3) s3.className = 'pipe-seg';
    if (s4) s4.className = 'pipe-seg';

    if (e && s1) s1.classList.add('active-blue');
    if (t && s2) s2.classList.add('active-orange');
    if (r && s3) s3.classList.add('active-red');
    if (k && s4) s4.classList.add('active-success');
  };

  window.selectCustomSnooze = () => {
    const daysInput = document.getElementById('snooze-days-input');
    const days = daysInput ? parseInt(daysInput.value) || 7 : 7;
    selectSnooze(days * 24);
  };

  window.selectCustomSnoozeHours = () => {
    const hoursInput = document.getElementById('snooze-hours-input');
    const hours = hoursInput ? parseInt(hoursInput.value) || 24 : 24;
    selectSnooze(hours);
  };

  window.selectSnooze = (hrs) => {
    window._clearSnooze = false;
    const btnHours = document.getElementById('snz-hours');
    const btnCustom = document.getElementById('snz-custom');
    
    if (currentSnoozeOffset === hrs) {
      currentSnoozeOffset = 0;
      if (btnHours) btnHours.classList.remove('outline');
      if (btnCustom) btnCustom.classList.remove('outline');
    } else {
      currentSnoozeOffset = hrs;
      if (btnHours) btnHours.classList.remove('outline');
      if (btnCustom) btnCustom.classList.remove('outline');
      
      if (hrs <= 24) {
        if (btnHours) btnHours.classList.add('outline');
      } else {
        if (btnCustom) btnCustom.classList.add('outline');
      }
      
      if (hrs > 24) {
         showToast(`Follow-Up in +${hrs/24} Tagen vorgemerkt. Klicke auf Speichern.`);
      } else {
         showToast(`Follow-Up in +${hrs}h vorgemerkt. Klicke auf Speichern.`);
      }
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
         if (val && val.startsWith('http')) window.api.openExternal(val);
         else if (val) window.api.openExternal('https://' + val);
         else window.api.openExternal(`https://www.google.com/search?q=${encodeURIComponent(nameStr || '')}`);
      } else if (type === 'maps') {
         if (val && val.startsWith('http')) {
           window.api.openExternal(val);
         } else if (val) {
           window.api.openExternal(`https://www.google.com/maps/place/?q=place_id:${val}`);
         } else {
           window.api.openExternal(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nameStr || 'Unbekannt')}`);
         }
      }
    }
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
    } catch(e) { showToast("❌ Fehler beim Abruf der Details"); if(preview) preview.remove(); }
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
  window.saveLeadMain = async (id, noClose = true) => {
    if (window._currentSelectedLeadId !== id) {
        console.warn('saveLeadMain aborted: Lead ID mismatch or no lead selected.');
        return false;
    }
    
    // Add to session history only when explicitly saved/edited
    window._sessionRecentLeads = window._sessionRecentLeads || new Set();
    window._sessionRecentLeads.add(id);

    try {
      // BUGFIX: Always fetch the current lead object BEFORE referencing it to prevent ReferenceError crashes
      const lData = (await window.api.getLeads({all:true})).find(x => x.id === id);

      let sNameNode = document.getElementById('sys-name');
      const sName = sNameNode ? (sNameNode.innerText || sNameNode.value || '').trim() : (lData ? lData.name : '');
      const sPhone = document.getElementById('sys-phone')?.value?.trim() ?? (lData ? (lData.phone || '') : '');
      const sWeb = document.getElementById('sys-web')?.value?.trim() ?? (lData ? (lData.website_url || '') : '');

      const noteEl = document.getElementById('note-input');
      const notes = noteEl ? noteEl.value : (lData ? (lData.notes || '') : '');

      let entscheider = parseInt(document.getElementById('sys-e')?.value) || 0;
      let termin = parseInt(document.getElementById('sys-t')?.value) || 0;
      let rechnung = parseInt(document.getElementById('sys-r')?.value) || 0;
      let isKundeVal = parseInt(document.getElementById('sys-k')?.value) || 0;
      const size = document.getElementById('m-size')?.value || (lData ? (lData.size || 'Tarifkunde') : 'Tarifkunde');

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

      let status = 'Lead';
      if (isKundeVal) {
        status = 'Kunde';
      } else if (lData && lData.status !== 'Kunde') {
        status = lData.status;
      }

      let abschlussdatum = lData ? (lData.abschlussdatum || '') : '';
      let zaehlernummern = lData ? (lData.zaehlernummern || '') : '';
      let umsatz = lData ? (lData.umsatz || 0) : 0;

      let snoozeMs = lData ? lData.snooze_until_ms : 0;
    
      if (window._clearSnooze) {
        snoozeMs = 0;
      } else if (currentSnoozeTargetMs > 0) {
        snoozeMs = currentSnoozeTargetMs;
      } else if (currentSnoozeOffset > 0) {
        snoozeMs = Date.now() + (currentSnoozeOffset * 60 * 60 * 1000);
      }
    
      // Reset snooze state flags after reading
      window._clearSnooze = false;
      currentSnoozeOffset = 0;
      currentSnoozeTargetMs = 0;

      const latVal = document.getElementById('sys-lat')?.value;
      const lngVal = document.getElementById('sys-lng')?.value;
      const lat = latVal ? parseFloat(latVal) : (lData ? lData.lat : null);
      const lng = lngVal ? parseFloat(lngVal) : (lData ? lData.lng : null);
    
      const htmlPlaceIdNode = document.getElementById('sys-placeid');
      const existingPlaceId = htmlPlaceIdNode ? htmlPlaceIdNode.value.trim() : (lData ? lData.google_place_id : '');
      const finalPlaceId = window._pendingPlaceId !== null && window._pendingPlaceId !== undefined ? window._pendingPlaceId : existingPlaceId;
      window._pendingPlaceId = null;

      const starBtn = document.getElementById('sidebar-star-btn');
      const isStarred = starBtn ? (starBtn.getAttribute('data-starred') === '1' ? 1 : 0) : (lData ? lData.starred : 0);
      
      // --- ACTUAL DATABASE SAVE ---
      await window.api.saveLead({ 
        id, name: sName, phone: sPhone, website_url: sWeb, google_maps_url: '', 
        notes, entscheider, termin, rechnung, size, snooze_until_ms: snoozeMs, 
        task_text: taskTxt, status: status, maps_city: city, lat, lng, 
        google_place_id: finalPlaceId, umsatz: umsatz, starred: isStarred,
        interest_strom: lData ? lData.interest_strom : 0,
        interest_gas: lData ? lData.interest_gas : 0,
        closed_strom: lData ? lData.closed_strom : 0,
        closed_gas: lData ? lData.closed_gas : 0,
        zaehlernummern: zaehlernummern,
        abschlussdatum: abschlussdatum,
        provi_umsatz: lData ? (lData.provi_umsatz || 0) : 0
      });

      // F6: Apply pending call log only on save
      if (window._pendingCallLog) {
        await window.api.logCall(id);
        await window.updateTrayCount();
        window._pendingCallLog = false;
      }
      
      if (window._pendingEmailLog) {
        await window.api.logEmail(id);
        window._pendingEmailLog = false;
      }

      // IMPORTANT: Only call loadUi() here — NOT loadMapData() directly.
      // Calling loadMapData() from here causes a Leaflet crash when the user is NOT on the
      // map tab because initMap() tries to mount onto the hidden/absent #map-container element.
      // loadUi() already calls loadMapData() internally when currentTab === 'map'.
      try { await loadUi(); } catch (e) { console.warn('Non-critical loadUi error after save:', e); }
      
      if (!noClose) {
        window._currentSelectedLeadId = null;
        if (typeof window.renderEmptySidebar === 'function') {
          window.renderEmptySidebar();
        } else {
          const mainSidebar = document.getElementById('main-sidebar');
          if (mainSidebar) mainSidebar.innerHTML = `<div class="empty-state">Nächsten Lead wählen</div>`;
        }
      } else {
        if (window.openLeadDirectly) window.openLeadDirectly(id);
        else if (window.openLead) window.openLead(id);
      }
      
      showToast("Lead gespeichert!");
      return true;
    } catch (err) {
      console.error('saveLeadMain error:', err);
      showToast(`Speicher-Fehler: ${err.message}`, true);
      return false;
    }
  };

  window.cancelSnooze = () => {
    window._clearSnooze = true;
    currentSnoozeOffset = 0;
    currentSnoozeTargetMs = 0;
    
    const btnHours = document.getElementById('snz-hours');
    const btnCustom = document.getElementById('snz-custom');
    if (btnHours) btnHours.classList.remove('outline');
    if (btnCustom) btnCustom.classList.remove('outline');
    
    const cancelContainer = document.getElementById('cancel-snooze-container');
    if (cancelContainer) {
      cancelContainer.style.display = 'none';
    }
    showToast("Snooze-Aufhebung vorgemerkt. Klicke auf Speichern.");
  };

  window.renderTasksList = () => {
    const listDiv = document.getElementById('tasks-list');
    if (!listDiv) return;
    
    const now = new Date();
    now.setHours(0,0,0,0);
    
    let html = '';
    (window.currentTasks || []).forEach(t => {
      let textStyle = t.done ? 'text-decoration: line-through; opacity: 0.45;' : '';
      
      // Deadline badge
      let deadlineBadge = '';
      if (t.deadline && !t.done) {
        const d = new Date(t.deadline + 'T00:00:00');
        const diff = Math.floor((d - now) / (1000*60*60*24));
        if (diff < 0)  deadlineBadge = `<span class="deadline-badge deadline-overdue">${Math.abs(diff)}d überfällig</span>`;
        else if (diff === 0) deadlineBadge = `<span class="deadline-badge deadline-today">Heute</span>`;
        else if (diff <= 3)  deadlineBadge = `<span class="deadline-badge deadline-soon">in ${diff}d</span>`;
        else deadlineBadge = `<span class="deadline-badge deadline-ok">${d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}</span>`;
      }
      
      html += `
        <div style="display:flex; align-items:center; gap:12px; padding:10px 12px; margin-bottom:6px; border-radius:8px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); transition:background 0.2s, border-color 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.04)'; this.style.borderColor='rgba(255,255,255,0.08)';" onmouseout="this.style.background='rgba(255,255,255,0.02)'; this.style.borderColor='rgba(255,255,255,0.04)';">
          <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleTask(${t.id}, this.checked)" style="flex-shrink:0; margin-top:2px; cursor:pointer; accent-color:var(--success); transform:scale(1.2);" />
          <div style="flex:1; font-size:13px; font-weight:500; color:var(--text-main); outline:none; border-bottom:1px solid transparent; transition:0.2s; padding:2px 4px; border-radius:4px; ${textStyle}" contenteditable="${t.done ? 'false' : 'true'}" onfocus="this.style.background='rgba(255,255,255,0.05)';" onblur="this.style.background='transparent'; updateTaskText(${t.id}, this.innerText)">${escapeHtml(t.text)}</div>
          ${deadlineBadge}
          <div style="position:relative; display:flex; align-items:center;">
            <input type="date" value="${t.deadline || ''}" title="Deadline" 
              onchange="setTaskDeadline(${t.id}, this.value)"
              style="width:24px; height:24px; opacity:0; cursor:pointer; position:absolute; right:0; z-index:2;">
            <span style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; cursor:pointer; color:var(--text-muted); opacity:0.6; transition:opacity 0.2s; z-index:1; padding-right:8px;" title="Deadline setzen" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">Termin</span>
          </div>
          <button onclick="deleteTask(${t.id})" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:16px; flex-shrink:0; opacity:0.4; transition:all 0.2s;" onmouseover="this.style.opacity='1'; this.style.color='#ff453a';" onmouseout="this.style.opacity='0.4'; this.style.color='var(--text-muted)';">✕</button>
        </div>
      `;
    });
    
    if (!window.currentTasks || window.currentTasks.length === 0) {
      html = '<div style="font-size:12px; color:var(--text-muted); font-style:italic; padding:4px 0;">Keine Aufgaben.</div>';
    }
    listDiv.innerHTML = html;
  };

  window.setTaskDeadline = (id, dateStr) => {
    if (!window.currentTasks) return;
    const t = window.currentTasks.find(x => x.id === id);
    if (t) { t.deadline = dateStr; renderTasksList(); }
  };

  window.handleNewTaskKeyPress = (e) => {
    if (e.key === 'Enter') {
      const txt = e.target.value.trim();
      if (!txt) return;
      if (!window.currentTasks) window.currentTasks = [];
      window.currentTasks.push({ id: Date.now(), text: txt, done: false, deadline: '' });
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

  window.updateTaskText = (id, text) => {
    if (!window.currentTasks) return;
    const t = window.currentTasks.find(x => x.id === id);
    if (t) t.text = text.trim();
  };

  // Legacy UI logic handlers removed in favor of simple Pipeline "Kunde" toggle

  window.updateTrayCount = async () => {
    try {
      const count = await window.api.getCallsToday();
      window.api.updateTray(count);
      const topbarEl = document.getElementById('topbar-calls-count');
      if (topbarEl) {
        topbarEl.innerText = `📞 ${count}/100`;
        topbarEl.style.display = 'block';
      }
    } catch(e) {
      console.error('Error updating tray count:', e);
    }
  };

  // ── copyPhone — F5: DOES NOT save lead data. Only copies + logs call. ────────
  window.copyPhone = async (e, id, phone) => {
    // Always read the current phone from the input if available (most up-to-date)
    const phoneInput = document.getElementById('sys-phone');
    const targetPhone = phoneInput ? phoneInput.value.trim() : phone;
    if (!targetPhone) return;

    // Copy to clipboard
    try {
      await window.api.copyText(targetPhone);
    } catch(err) {
      console.log('Clipboard fallback error:', err);
    }

    // F6: Only set pending flag. Do not write to DB until "Speichern" is clicked.
    window._pendingCallLog = true;
    
    // Quick UI feedback for the copy button
    const btn = e.currentTarget || e.target;
    if (btn && btn.tagName === 'BUTTON') {
      const orig = btn.innerText;
      btn.innerText = 'Kopiert! 📞';
      btn.style.borderColor = 'var(--success)';
      btn.style.color = 'var(--success)';
      setTimeout(() => {
        if (btn) {
          btn.innerText = orig;
          btn.style.borderColor = 'var(--border)';
          btn.style.color = 'var(--text-muted)';
        }
      }, 1500);
    }
    
    // Fallback: update status
    document.getElementById('sys-status').value = 'Erreicht';
  };

  // ── copyEmail — F5: DOES NOT save lead data. Only copies + logs email. ───────
  window.copyEmail = async (e, id, email) => {
    const emailInput = document.getElementById('sys-email');
    const targetEmail = emailInput ? emailInput.value.trim() : email;
    if (!targetEmail) return;

    try {
      await window.api.copyText(targetEmail);
    } catch(err) {
      console.log('Clipboard fallback error:', err);
    }

    window._pendingEmailLog = true;
    
    const btn = e.currentTarget || e.target;
    if (btn && btn.tagName === 'BUTTON') {
      const orig = btn.innerText;
      btn.innerText = 'Kopiert! ✉️';
      btn.style.borderColor = 'var(--success)';
      btn.style.color = 'var(--success)';
      setTimeout(() => {
        if (btn) {
          btn.innerText = orig;
          btn.style.borderColor = 'var(--border)';
          btn.style.color = 'var(--text-muted)';
        }
      }, 1500);
    }
  };

  // ── markNotAnswered — F4: Mark a call entry as not answered + 15min snooze ──
  window.markNotAnswered = async (leadId, callTs) => {
    try {
      await window.api.markCallNotAnswered(leadId, callTs);
      showToast('Anruf als nicht erreicht markiert. 15min Snooze.');
      await window.updateTrayCount();
      if (window.loadUi) await window.loadUi();
      if (window._currentSelectedLeadId === leadId) {
        if (window.openLeadDirectly) await window.openLeadDirectly(leadId);
        else if (window.openLead) await window.openLead(leadId);
      }
    } catch(err) {
      console.error(err);
      showToast('Fehler beim Markieren.', true);
    }
  };

  window.deleteLead = async (id) => {
    if(confirm("Diesen Lead endgültig löschen? Er verschwindet komplett!")) {
      await window.api.deleteLead(id);
      if (typeof window.renderEmptySidebar === 'function') {
        window.renderEmptySidebar();
      } else {
        sidebar.innerHTML = `<div class="empty-state">Nächsten Lead wählen</div>`;
      }
      await loadUi();
    }
  };

  window.markLeadUninteresting = async (id) => {
    if(confirm("Möchtest du diesen Lead wirklich als uninteressant markieren? Er wird aus all deinen aktiven Listen ausgeblendet.")) {
      try {
        const fullList = await window.api.getLeads({ all: true });
        const l = fullList.find(x => x.id === id);
        if (l) {
          l.status = 'Uninteressant';
          l.task_text = '';
          l.snooze_until_ms = 0;
          await window.api.saveLead(l);
          if (typeof window.renderEmptySidebar === 'function') {
            window.renderEmptySidebar();
          } else {
            sidebar.innerHTML = `<div class="empty-state">Nächsten Lead wählen</div>`;
          }
          await loadUi();
          showToast("Lead archiviert! 📁");
        } else {
          showToast("Lead nicht gefunden.", true);
        }
      } catch(e) {
        console.error(e);
        showToast("Fehler beim Archivieren.", true);
      }
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

  window.toggleSettings = () => {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.toggle('hidden');
  };

  window.triggerCSVImport = () => {
    const csvFileInput = document.getElementById('csv-file');
    if (csvFileInput) csvFileInput.click();
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
          
          // Auto-close settings modal on success
          const modal = document.getElementById('settings-modal');
          if (modal) modal.classList.add('hidden');
        }
        
        // Reset file input value so the same file can be selected again if needed
        event.target.value = '';
      }
    });
  };

  const localEscape = (unsafe) => {
    return (unsafe || '').toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  };

  window.updateExcludedCount = async () => {
    try {
      let excludedLeads = await window.api.getLeads({ tab: 'excluded' });
      // Extra resilience safeguard: Filter in frontend in case backend module cache is active
      excludedLeads = excludedLeads.filter(l => l.status === 'Uninteressant');
      const countSpan = document.getElementById('excluded-count');
      if (countSpan) {
        countSpan.innerText = excludedLeads.length;
      }
    } catch (e) {
      console.error("Fehler beim Aktualisieren der ausgeschlossenen Leads:", e);
    }
  };

  window.openExcludedLeadsModal = () => {
    const modal = document.getElementById('excluded-leads-modal');
    if (modal) {
      modal.classList.remove('hidden');
      const searchInput = document.getElementById('excluded-search-input');
      if (searchInput) searchInput.value = '';
      window.renderExcludedLeadsList('');
    }
  };

  window.closeExcludedLeadsModal = () => {
    const modal = document.getElementById('excluded-leads-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
    window.updateExcludedCount();
  };

  window.renderExcludedLeadsList = async (searchQuery = '') => {
    const container = document.getElementById('excluded-leads-container');
    if (!container) return;

    container.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding: 20px;">Lade ausgeschlossene Leads... ⏳</div>';

    try {
      let excludedLeads = await window.api.getLeads({ tab: 'excluded' });
      // Extra resilience safeguard: Filter in frontend in case backend module cache is active
      excludedLeads = excludedLeads.filter(l => l.status === 'Uninteressant');
      
      const filtered = excludedLeads.filter(l => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = l.name && l.name.toLowerCase().includes(q);
        const cityMatch = l.maps_city && l.maps_city.toLowerCase().includes(q);
        return nameMatch || cityMatch;
      });

      if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state" style="height:auto; padding:30px; text-align:center; color:var(--text-muted);">Keine ausgeschlossenen Leads${searchQuery ? ' für diese Suche' : ''} gefunden.</div>`;
        return;
      }

      container.innerHTML = filtered.map(l => {
        const hasMapsUrl = l.google_maps_url && l.google_maps_url.trim();
        const titleWithLink = hasMapsUrl 
          ? `<a href="#" onclick="window.api.openExternal('${l.google_maps_url}')" style="color:var(--text-main); font-weight:600; text-decoration:none; font-size:13px;" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text-main)'">${localEscape(l.name)} 🔗</a>`
          : `<span style="font-weight: 600; color: var(--text-main); font-size: 13px;">${localEscape(l.name)}</span>`;

        return `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 8px;">
            <div style="display: flex; flex-direction: column; gap: 2px; max-width: 65%;">
              ${titleWithLink}
              <span style="font-size: 10px; color: var(--text-muted); font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${l.google_place_id}">ID: ${localEscape(l.google_place_id)}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 12px; color: var(--text-muted); max-width: 80px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${l.maps_city || 'Unbekannt'}">📍 ${localEscape(l.maps_city || 'Unbekannt')}</span>
              <button class="action-btn-small success-bold" style="padding: 6px 12px; font-size: 11px;" onclick="reactivateLead(${l.id})">Reaktivieren</button>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.error(e);
      container.innerHTML = '<div style="color:red; text-align:center; padding: 20px;">Fehler beim Laden der Liste.</div>';
    }
  };

  window.reactivateLead = async (id) => {
    try {
      const fullList = await window.api.getLeads({ all: true });
      const l = fullList.find(x => x.id === id);
      if (l) {
        l.status = 'Lead';
        await window.api.saveLead(l);
        showToast("Lead erfolgreich reaktiviert! 🎉");
        
        await loadUi();
        
        const searchInput = document.getElementById('excluded-search-input');
        const q = searchInput ? searchInput.value : '';
        window.renderExcludedLeadsList(q);
        window.updateExcludedCount();
      } else {
        showToast("Lead nicht gefunden.", true);
      }
    } catch (e) {
      console.error(e);
      showToast("Fehler bei Reaktivierung.", true);
    }
  };



  // Cache leads for the select dropdown
  window.api.getLeads({ all: true }).then(leads => {
    window._cachedLeadsForSelect = leads.sort((a,b) => a.name.localeCompare(b.name));
  });

  // --- HTML ESCAPE HELPER ---
  // escapeHtml is provided globally by pipeline_ui.js (loaded before this file)

  // --- UN-SAVED CHANGES DIALOG (Apple-Style Alert) ---
  const showUnsavedChangesDialog = (callback, changedAreas = []) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 99999;';
    
    let changesHtml = '';
    if (changedAreas.length > 0) {
      changesHtml = `
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 12px; margin-bottom: 24px; text-align: left;">
          <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Geänderte Bereiche:</div>
          <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: var(--text-main); line-height: 1.6;">
            ${changedAreas.map(a => `<li>${a}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    overlay.innerHTML = `
      <div style="width: 380px; padding: 24px; border-radius: 16px; background: #0c0c0c; border: 1px solid var(--border); box-shadow: 0 20px 40px rgba(0,0,0,0.8); text-align: center;">
        <div style="font-size: 32px; margin-bottom: 12px;">⚠️</div>
        <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 700; color: #fff;">Ungespeicherte Änderungen</h3>
        <p style="margin: 0 0 16px 0; font-size: 13px; color: var(--text-muted); line-height: 1.4;">Möchtest du die Änderungen am Lead speichern, bevor du ihn schließt?</p>
        ${changesHtml}
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <button id="unsaved-save-btn" class="action-btn success-bold" style="width: 100%; padding: 12px; font-size: 13px; font-weight: 600;">Ja, speichern</button>
          <button id="unsaved-discard-btn" class="action-btn" style="width: 100%; padding: 12px; font-size: 13px; font-weight: 600; background: rgba(255, 69, 58, 0.1); color: #ff453a; border: 1px solid #ff453a;">Nein, verwerfen</button>
          <button id="unsaved-cancel-btn" class="action-btn outline" style="width: 100%; padding: 12px; font-size: 13px; font-weight: 600; border-color: var(--border); color: var(--text-muted);">Abbrechen</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    const cleanup = () => overlay.remove();
    
    overlay.querySelector('#unsaved-save-btn').onclick = () => {
      cleanup();
      callback('save');
    };
    overlay.querySelector('#unsaved-discard-btn').onclick = () => {
      cleanup();
      callback('discard');
    };
    overlay.querySelector('#unsaved-cancel-btn').onclick = () => {
      cleanup();
      callback('cancel');
    };
  };

  window.checkUnsavedChangesBeforeClose = async (id, callbackOnProceed) => {
    // Feature disabled per user request: always proceed without warning
    callbackOnProceed();
  };

  // --- RECENTLY EDITED LEADS SIDEBAR ---
  window.renderEmptySidebar = async () => {
    const sidebarEl = document.getElementById('main-sidebar');
    if (!sidebarEl) return;
    
    if (window.currentTab === 'map') {
      sidebarEl.innerHTML = `
        <div style="padding: 24px; display: flex; flex-direction: column; height: 100%; box-sizing: border-box;">
          <h3 style="margin-top:0; color:var(--text-main);">📍 Standort-Zuweisung</h3>
          <p style="font-size:12px; color:var(--text-muted); line-height:1.4;">Wähle einen Lead aus, um ihn auf der Karte zu platzieren.</p>
          
          <input type="text" id="map-lead-search" class="modern-input-small" style="width:100%; margin-bottom:12px; box-sizing: border-box;" placeholder="Nach Lead suchen..." oninput="searchLeadForMap(this.value)">
          
          <div id="map-lead-results" style="max-height:300px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;"></div>
        </div>
      `;
      if (typeof window.searchLeadForMap === 'function') {
         window.searchLeadForMap('');
      }
      return;
    }

    sidebarEl.innerHTML = `<div class="empty-state">Nächsten Lead wählen</div>`;
  };



  