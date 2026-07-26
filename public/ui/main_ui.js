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
    window.store.state.clearSnooze = false;
    const btnHours = document.getElementById('snz-hours');
    const btnCustom = document.getElementById('snz-custom');
    
    if (window.store.state.currentSnoozeOffset === hrs) {
      window.store.state.currentSnoozeOffset = 0;
      if (btnHours) btnHours.classList.remove('outline');
      if (btnCustom) btnCustom.classList.remove('outline');
    } else {
      window.store.state.currentSnoozeOffset = hrs;
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


  window.showToast = (msg, type = 'success') => {
    // Support legacy boolean API: showToast('msg', true) means error
    if (type === true) type = 'error';
    if (type === false) type = 'success';
    
    const existing = document.querySelectorAll('.app-toast');
    const offset = existing.length * 56;
    existing.forEach((e, i) => {
      // Push existing toasts up
      const currentTop = parseInt(e.style.top) || 30;
      e.style.top = (currentTop - 56) + 'px';
    });
    
    const t = document.createElement('div');
    t.className = `app-toast toast-${type}`;
    t.style.cssText = `top: -50px; opacity: 0;`;
    t.innerHTML = msg;
    document.body.appendChild(t);
    
    requestAnimationFrame(() => { t.style.top = '30px'; t.style.opacity = '1'; });
    setTimeout(() => { t.style.top = '-50px'; t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 2500);
  };

  window.showConfirmDialog = (title, message, confirmLabel, onConfirm) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-dialog">
        <div class="confirm-dialog-icon">⚠️</div>
        <h3 class="confirm-dialog-title">${title}</h3>
        <p class="confirm-dialog-message">${message}</p>
        <div class="confirm-dialog-actions">
          <button class="confirm-btn-danger" id="confirm-yes">${confirmLabel}</button>
          <button class="confirm-btn-cancel" id="confirm-no">Abbrechen</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirm-yes').onclick = () => { overlay.remove(); onConfirm(); };
    overlay.querySelector('#confirm-no').onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  };

  window.Modal = {
    open(id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('hidden');
      el.classList.add('modal-active');
    },
    close(id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.add('modal-exit');
      setTimeout(() => {
        el.classList.add('hidden');
        el.classList.remove('modal-active', 'modal-exit');
      }, 200);
    }
  };

  // Remove confirmEnrich, autoEnrich, cancelEnrich, etc. (deprecated)
  window.saveLeadMain = async (id, noClose = false) => {
    if (window.store.state.currentSelectedLeadId !== id) {
        console.warn('saveLeadMain aborted: Lead ID mismatch or no lead selected.');
        return false;
    }
    
    // Add to session history only when explicitly saved/edited
    window._sessionRecentLeads = window._sessionRecentLeads || new Set();
    window._sessionRecentLeads.add(id);

    try {
      const saveBtn = document.getElementById('main-save-btn');
      if (saveBtn) {
        saveBtn.classList.add('btn-loading');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Speichern...';
      }

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

      // Auto-capture subtasks
      const subtaskInputs = document.querySelectorAll('.subtask-input-rem');
      subtaskInputs.forEach(input => {
        if (input.value.trim() !== '') {
          const parentId = parseInt(input.getAttribute('data-parent'), 10);
          if (window.currentTasks) {
            const pt = window.currentTasks.find(x => x.id === parentId);
            if (pt) {
              if (!pt.subtasks) pt.subtasks = [];
              pt.subtasks.push({ id: Date.now() + Math.floor(Math.random()*1000), text: input.value.trim(), done: false });
              pt.done = false;
              input.value = '';
            }
          }
        }
      });

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
    
      if (window.store.state.clearSnooze) {
        snoozeMs = 0;
      } else if (window.store.state.currentSnoozeTargetMs > 0) {
        snoozeMs = window.store.state.currentSnoozeTargetMs;
      } else if (window.store.state.currentSnoozeOffset > 0) {
        snoozeMs = Date.now() + (window.store.state.currentSnoozeOffset * 60 * 60 * 1000);
      }
    
      // Reset snooze state flags after reading
      window.store.state.clearSnooze = false;
      window.store.state.currentSnoozeOffset = 0;
      window.store.state.currentSnoozeTargetMs = 0;

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
      
      const claimedByNode = document.getElementById('sys-claimed-by');
      const claimedByVal = claimedByNode ? claimedByNode.value : undefined;

      // ACTUAL DATABASE SAVE ---
      await window.api.saveLead({ 
        id, name: sName, phone: sPhone, website_url: sWeb, google_maps_url: '', 
        notes, entscheider, termin, rechnung, size, snooze_until_ms: snoozeMs, 
        task_text: taskTxt, status: status, maps_city: city, lat, lng, 
        google_place_id: finalPlaceId, umsatz: umsatz, starred: isStarred,
        claimed_by: claimedByVal,
        interest_strom: lData ? lData.interest_strom : 0,
        interest_gas: lData ? lData.interest_gas : 0,
        closed_strom: lData ? lData.closed_strom : 0,
        closed_gas: lData ? lData.closed_gas : 0,
        zaehlernummern: zaehlernummern,
        abschlussdatum: abschlussdatum,
        provi_umsatz: lData ? (lData.provi_umsatz || 0) : 0
      });

      // SALES BELL TRIGGER
      if (isKundeVal && lData && lData.status !== 'Kunde') {
        try {
          fetch('/api/push_sales_bell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: '🔔 Deal gewonnen!',
              message: `${window.currentUser?.name || window.currentUser?.email?.split('@')[0] || 'Ein Agent'} hat gerade "${sName}" abgeschlossen!`,
              excludeUserId: window.currentUser?.id
            })
          }).catch(err => console.error('Sales bell fetch error', err));
        } catch(e) { console.error('Sales Bell Error:', e); }
      }

      // IMPORTANT: Only call loadUi() here — NOT loadMapData() directly.
      // Calling loadMapData() from here causes a Leaflet crash when the user is NOT on the
      // map tab because initMap() tries to mount onto the hidden/absent #map-container element.
      // loadUi() already calls loadMapData() internally when window.store.state.currentTab === 'map'.
      try { await loadUi(); } catch (e) { console.warn('Non-critical loadUi error after save:', e); }
      
      if (saveBtn) {
        saveBtn.classList.remove('btn-loading');
        saveBtn.classList.add('btn-success-flash');
        saveBtn.disabled = false;
        saveBtn.textContent = '✓ Gespeichert';
      }
      showToast("Lead gespeichert!");

      if (!noClose) {
        setTimeout(() => {
          if (typeof window.closeLeadSidebar === 'function') {
            window.closeLeadSidebar();
          } else {
            window.store.state.currentSelectedLeadId = null;
            document.querySelectorAll('.lead-card').forEach(c => c.classList.remove('active-lead-card'));
            if (typeof window.renderEmptySidebar === 'function') {
              window.renderEmptySidebar();
            }
          }
        }, 500);
      } else {
        setTimeout(() => {
          if (saveBtn) {
            saveBtn.classList.remove('btn-success-flash');
            saveBtn.textContent = 'Speichern';
          }
        }, 1200);
        if (window.openLeadDirectly) window.openLeadDirectly(id);
        else if (window.openLead) window.openLead(id);
      }
      
      return true;
    } catch (err) {
      if (saveBtn) {
        saveBtn.classList.remove('btn-loading');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Speichern';
      }
      console.error('saveLeadMain error:', err);
      showToast(`Speicher-Fehler: ${err.message}`, true);
      return false;
    }
  };

  window.cancelSnooze = () => {
    window.store.state.clearSnooze = true;
    window.store.state.currentSnoozeOffset = 0;
    window.store.state.currentSnoozeTargetMs = 0;
    
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

      // Apple Checkbox SVG
      const checkSvg = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" style="margin-top:1px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      const appleCheckbox = (done, onclickParams) => `
        <div onclick="${onclickParams}; event.stopPropagation();" style="width: 18px; height: 18px; border-radius: 50%; border: 1px solid ${done ? 'var(--success)' : 'rgba(255,255,255,0.3)'}; background: ${done ? 'var(--success)' : 'transparent'}; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: 0.2s; margin-top:2px;">
          ${done ? checkSvg : ''}
        </div>
      `;

      // Subtasks
      let subtasksHtml = '';
      const subs = t.subtasks || [];
      if (subs.length > 0) {
        subtasksHtml = `<div style="margin-top: 12px; padding-left: 28px; display:flex; flex-direction:column; gap:0;">`;
        subs.forEach((st, idx) => {
          let stStyle = st.done ? 'text-decoration: line-through; opacity: 0.45;' : '';
          let borderBottom = idx < subs.length - 1 ? 'border-bottom: 1px solid rgba(255,255,255,0.05);' : '';
          subtasksHtml += `
            <div class="task-item" style="padding: 8px 0; ${borderBottom} display:flex; align-items:flex-start; gap:8px;">
              ${appleCheckbox(st.done, `toggleTask(${t.id}, ${!st.done}, ${st.id})`)}
              <div style="flex:1; font-size:12px; color:var(--text-main); outline:none; transition:0.2s; line-height:1.4; padding-top:2px; ${stStyle}" contenteditable="${st.done ? 'false' : 'true'}" onfocus="this.style.background='rgba(255,255,255,0.05)';" onblur="this.style.background='transparent'; updateSubtaskText(${t.id}, ${st.id}, this.innerText)">${escapeHtml(st.text)}</div>
              <button onclick="deleteSubtask(${t.id}, ${st.id})" class="task-delete-btn" style="font-size: 10px; margin-top:2px;">✕</button>
            </div>
          `;
        });
        subtasksHtml += `</div>`;
      }
      
      html += `
        <div class="task-item" style="flex-direction:column; align-items: stretch; background: rgba(255,255,255,0.03); border-radius: 12px; margin-bottom: 16px; border: 1px solid var(--border); padding: 12px;">
          <div style="display:flex; align-items:flex-start; gap: 10px;">
            ${appleCheckbox(t.done, `toggleTask(${t.id}, ${!t.done})`)}
            <div style="flex:1; font-size:14px; font-weight:600; color:var(--text-main); outline:none; transition:0.2s; line-height:1.4; padding-top:1px; ${textStyle}" contenteditable="${t.done ? 'false' : 'true'}" onfocus="this.style.background='rgba(255,255,255,0.05)';" onblur="this.style.background='transparent'; updateTaskText(${t.id}, this.innerText)">${escapeHtml(t.text)}</div>
            ${deadlineBadge}
            <div style="position:relative; display:flex; align-items:center;">
              <input type="date" value="${t.deadline || ''}" title="Deadline" 
                onchange="setTaskDeadline(${t.id}, this.value)"
                style="width:24px; height:24px; opacity:0; cursor:pointer; position:absolute; right:0; z-index:2;">
              <span class="task-deadline-trigger" title="Deadline setzen">Termin</span>
            </div>
            <button onclick="deleteTask(${t.id})" class="task-delete-btn" style="margin-top:1px;">✕</button>
          </div>
          ${subtasksHtml}
          <div style="margin-top: 8px; padding-left: 28px; display: flex; align-items: center; border-top: ${subs.length > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none'}; padding-top: 8px;">
            <input type="text" placeholder="+ Neue Teilaufgabe..." class="subtask-input-rem" data-parent="${t.id}" style="flex: 1; padding: 4px 0; font-size: 12px; background: transparent; border: none; color: var(--text-main); outline: none;" onkeypress="if(event.key==='Enter'){handleAddSubtask(${t.id}, this.value); this.value='';}">
          </div>
        </div>
      `;
    });
    
    if (!window.currentTasks || window.currentTasks.length === 0) {
      html = '<div style="font-size:12px; color:var(--text-muted); font-style:italic; padding:4px 0; margin-bottom: 12px;">Keine Aufgaben.</div>';
    }
    listDiv.innerHTML = html;
  };

  window.handleAddSubtask = (parentTaskId, text) => {
    const txt = text.trim();
    if (!txt) return;
    if (!window.currentTasks) return;
    const pt = window.currentTasks.find(x => x.id === parentTaskId);
    if (!pt) return;
    if (!pt.subtasks) pt.subtasks = [];
    pt.subtasks.push({ id: Date.now(), text: txt, done: false });
    pt.done = false; // Add new subtask opens the main task
    renderTasksList();
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
      window.currentTasks.push({ id: Date.now(), text: txt, done: false, deadline: '', subtasks: [] });
      e.target.value = '';
      renderTasksList();
    }
  };

  window.handleNewTaskSubmit = (e) => {
    e.preventDefault();
    const input = e.target.querySelector('input');
    if (!input) return;
    const txt = input.value.trim();
    if (!txt) return;
    if (!window.currentTasks) window.currentTasks = [];
    window.currentTasks.push({ id: Date.now(), text: txt, done: false, deadline: '', subtasks: [] });
    input.value = '';
    renderTasksList();
  };

  window.toggleTask = (parentId, done, subtaskId = null) => {
    if (!window.currentTasks) return;
    const pt = window.currentTasks.find(x => x.id === parentId);
    if (!pt) return;

    if (subtaskId) {
      // Toggle a subtask
      const st = pt.subtasks?.find(x => x.id === subtaskId);
      if (st) st.done = done;
      // If a subtask is checked, evaluate if all subtasks are checked
      if (pt.subtasks && pt.subtasks.every(s => s.done)) {
        pt.done = true;
      } else {
        pt.done = false;
      }
    } else {
      // Toggle the main task
      pt.done = done;
      // If a Main Task is checked, check ALL its subtasks. If unchecked, uncheck all.
      if (pt.subtasks) {
        pt.subtasks.forEach(s => s.done = done);
      }
    }

    renderTasksList();
    
    // Check if ALL tasks in the pipeline are done
    if (done && window.currentTasks.length > 0 && window.currentTasks.every(task => task.done)) {
      if (typeof window.triggerMissionPassed === 'function') {
        window.triggerMissionPassed();
      }
    }
    
    if (window.store.state.currentSelectedLeadId) {
      window.saveLeadMain(window.store.state.currentSelectedLeadId, true);
    }
  };

  window.triggerMissionPassed = () => {
    const overlay = document.createElement('div');
    overlay.className = 'mission-passed-overlay';
    // Clean, Apple-minimalist success animation
    overlay.innerHTML = `
      <div style="background: rgba(48,209,88,0.15); border: 1px solid rgba(48,209,88,0.3); backdrop-filter: blur(8px); padding: 16px 24px; border-radius: 12px; display: flex; align-items: center; gap: 12px; box-shadow: 0 8px 32px rgba(48,209,88,0.2);">
        <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--success); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px;">✓</div>
        <div style="color: var(--success); font-weight: 600; font-size: 14px; letter-spacing: 0.5px;">Alle Aufgaben erledigt</div>
      </div>
    `;
    document.body.appendChild(overlay);
    
    overlay.style.cssText = `
      position: fixed; top: 40px; left: 50%; transform: translateX(-50%) translateY(-20px);
      z-index: var(--z-splash); pointer-events: none; opacity: 0;
      transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.4s ease;
    `;
    
    requestAnimationFrame(() => {
      overlay.style.transform = 'translateX(-50%) translateY(0)';
      overlay.style.opacity = '1';
    });
    
    setTimeout(() => {
      overlay.style.opacity = '0';
      overlay.style.transform = 'translateX(-50%) translateY(-20px)';
      setTimeout(() => overlay.remove(), 400);
    }, 2500);
  };

  window.deleteTask = (id) => {
    if (!window.currentTasks) return;
    window.currentTasks = window.currentTasks.filter(x => x.id !== id);
    renderTasksList();
  };

  window.deleteSubtask = (parentId, subtaskId) => {
    if (!window.currentTasks) return;
    const pt = window.currentTasks.find(x => x.id === parentId);
    if (pt && pt.subtasks) {
      pt.subtasks = pt.subtasks.filter(x => x.id !== subtaskId);
      renderTasksList();
    }
  };

  window.updateTaskText = (id, text) => {
    if (!window.currentTasks) return;
    const t = window.currentTasks.find(x => x.id === id);
    if (t) t.text = text.trim();
  };

  window.updateSubtaskText = (parentId, subtaskId, text) => {
    if (!window.currentTasks) return;
    const pt = window.currentTasks.find(x => x.id === parentId);
    if (pt && pt.subtasks) {
      const st = pt.subtasks.find(x => x.id === subtaskId);
      if (st) st.text = text.trim();
    }
  };

  // Legacy UI logic handlers removed in favor of simple Pipeline "Kunde" toggle

  window.updateTrayCount = async () => {
    try {
      if (window.store.state.currentTab === 'dashboard' && typeof window.renderDashboard === 'function') {
        window.renderDashboard();
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

    // Persist call log immediately — a call is a fact, not a draft
    try {
      await window.api.logCall(id);
      await window.updateTrayCount();
    } catch(err) { console.warn('Call log failed:', err); }
    
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

    // Persist email log immediately
    try {
      await window.api.logEmail(id);
    } catch(err) { console.warn('Email log failed:', err); }
    
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
      if (window.store.state.currentSelectedLeadId === leadId) {
        if (window.openLeadDirectly) await window.openLeadDirectly(leadId);
        else if (window.openLead) await window.openLead(leadId);
      }
    } catch(err) {
      console.error(err);
      showToast('Fehler beim Markieren.', true);
    }
  };

  window.deleteLead = async (id) => {
    showConfirmDialog(
      'Lead endgültig löschen?',
      'Der Lead verschwindet komplett und kann nicht wiederhergestellt werden.',
      'Ja, endgültig löschen',
      async () => {
        await window.api.deleteLead(id);
        
        // Remove locally immediately to ensure UI reflects the deletion
        if (window.store && window.store.state && window.store.state.allLeads) {
          window.store.state.allLeads = window.store.state.allLeads.filter(l => l.id !== id);
        }

        if (typeof window.renderEmptySidebar === 'function') {
          window.renderEmptySidebar();
        } else {
          const sidebar = document.getElementById('main-sidebar');
          if (sidebar) sidebar.innerHTML = `<div class="empty-state">Nächsten Lead wählen</div>`;
        }
        await loadUi();
      }
    );
  };

  window.markLeadUninteresting = async (id) => {
    showConfirmDialog(
      'Lead als uninteressant markieren?',
      'Möchtest du diesen Lead wirklich als uninteressant markieren? Er wird aus all deinen aktiven Listen ausgeblendet.',
      'Ja, archivieren',
      async () => {
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
    });
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
    if (modal && modal.classList.contains('hidden')) {
      Modal.open('settings-modal');
    } else {
      Modal.close('settings-modal');
    }
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
          showToast(`${leadsToImport.length} Leads importiert!`);
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



  window.addEventListener('DOMContentLoaded', () => {
    if (window.api && window.api.getLeads) {
      window.api.getLeads({ all: true }).then(leads => {
        window._cachedLeadsForSelect = leads.sort((a,b) => a.name.localeCompare(b.name));
      }).catch(e => console.error("Error caching leads:", e));
    }
  });

  // --- HTML ESCAPE HELPER ---
  // escapeHtml is provided globally by pipeline_ui.js (loaded before this file)

  // --- UN-SAVED CHANGES DIALOG (Apple-Style Alert) ---
  const showUnsavedChangesDialog = (callback, changedAreas = []) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style = 'position: fixed; top: 0; left: 0; width: 100dvw; height: 100dvh; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: var(--z-modal);';
    
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

  // --- RECENTLY EDITED LEADS SIDEBAR / EMPTY STATE ---
  window.renderEmptySidebar = async () => {
    const sidebarEl = document.getElementById('main-sidebar');
    if (!sidebarEl) return;
    
    sidebarEl.classList.add('collapsed');
    sidebarEl.innerHTML = `<div class="empty-state">Nächsten Lead wählen</div>`;
  };

  window.openNewLeadForm = async () => {
    const res = await window.api.saveLead({ name: "Neuer Lead" });
    await loadUi();
    openLead(res.id);
    
    // Focus the name input automatically so user can directly start typing
    setTimeout(() => {
      const nameEl = document.getElementById('sys-name');
      if (nameEl) {
        nameEl.focus();
        document.execCommand('selectAll', false, null);
      }
    }, 300);
  };

  // --- WEB PUSH LOGIC (SALES BELL) ---
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  window.subscribeToSalesBell = async () => {
    const btn = document.getElementById('push-subscribe-btn');
    if (btn) {
      btn.textContent = 'Aktivieren...';
      btn.disabled = true;
    }

    try {
      if (!('serviceWorker' in navigator)) throw new Error('Service Worker not supported');
      if (!('PushManager' in window)) throw new Error('Push Manager not supported');

      const registration = await navigator.serviceWorker.ready;
      if (!registration) throw new Error('Service Worker not ready');

      // Request Permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Benachrichtigungen blockiert');
      }

      // Hardcoded Public VAPID key
      const vapidPublicKey = 'BHyEIPrHyhQCvVghKL1_mMGsoAU7mdprcWHxzMpXA8txelYBkjE0c4XLzDtwrOapXTbsCpaL9Zg3nI9Nh4YO4hI';
      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });

      // Send to Backend
      const res = await fetch('/api/push_subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription,
          userId: window.currentUser.id
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Fehler beim Speichern');

      if (btn) {
        btn.textContent = 'Aktiviert ✓';
        btn.style.background = 'var(--success)';
        btn.disabled = true;
      }
      showToast('Push-Benachrichtigungen aktiviert!');
    } catch (err) {
      console.error('Push error:', err);
      if (btn) {
        btn.textContent = 'Push aktivieren';
        btn.disabled = false;
      }
      showToast(`Fehler: ${err.message}`, true);
    }
  };
