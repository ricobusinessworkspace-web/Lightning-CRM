import '../core/api.js';

// Global Keyboard Navigation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const fetchPreview = document.getElementById('fetch-preview');
      if (fetchPreview) return fetchPreview.remove();
      
      const popover = document.getElementById('popover');
      if (popover) { popover.remove(); return; }
      
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




  let globalUser = null;
  window.globalUsersList = [];
  let isRegisterMode = false;

  window.toggleAuthMode = () => {
    isRegisterMode = !isRegisterMode;
    document.getElementById('login-btn').innerText = isRegisterMode ? 'Account erstellen' : 'Einloggen';
    document.getElementById('auth-mode-toggle').innerText = isRegisterMode ? 'Zum Login' : 'Registrieren';
    document.querySelector('#login-modal h2').innerText = isRegisterMode ? 'Neuer Account' : 'Willkommen zurück';
    document.querySelector('#login-modal p').innerText = isRegisterMode ? 'Erstelle einen Zugang zum CRM.' : 'Bitte logge dich ein, um fortzufahren.';
  };



  function executeLoginSuccess() {
    document.getElementById('login-modal').style.display = 'none';
    const accInfo = document.getElementById('account-info');
    const displayRole = (globalUser.role === 'minion' || globalUser.role === 'agent') ? 'Agent' : globalUser.role;
    if (accInfo) accInfo.innerText = `Eingeloggt als ${globalUser.name || globalUser.email || 'Unknown'} (${displayRole})`;
    
    const headerInitial = document.getElementById('header-profile-initial');
    if (headerInitial) {
       const dispName = globalUser.name || globalUser.email || '?';
       headerInitial.innerText = dispName.charAt(0).toUpperCase();
    }
    
    window.api.getUsers().then(users => window.globalUsersList = users);
    
    // Init App
    if(typeof loadApiKey === 'function') loadApiKey();
    if(typeof loadUi === 'function') loadUi();
    if(typeof autoGeocode === 'function') autoGeocode();
    if (window.updateTrayCount) window.updateTrayCount();
  }

  async function checkAuth() {
    const splash = document.getElementById('startup-splash');
    const loginModal = document.getElementById('login-modal');
    
    try {
      globalUser = await window.api.getCurrentUser();
      window.globalUser = globalUser;
      
      if (globalUser) {
        loginModal.style.display = 'none';
        if(splash) splash.classList.add('splash-hidden');
        
        const accInfo = document.getElementById('account-info');
        const displayRole = (globalUser.role === 'minion' || globalUser.role === 'agent') ? 'Agent' : globalUser.role;
        if (accInfo) accInfo.innerText = `Eingeloggt als ${globalUser.name || globalUser.email || 'Unknown'} (${displayRole})`;
        
        const headerInitial = document.getElementById('header-profile-initial');
        if (headerInitial) {
           const dispName = globalUser.name || globalUser.email || '?';
           headerInitial.innerText = dispName.charAt(0).toUpperCase();
        }
        
        window.globalUsersList = await window.api.getUsers();
        
        if (globalUser.role === 'admin' || globalUser.role === 'developer') {
          const navDash = document.getElementById('nav-dashboard');
          if (navDash) navDash.style.display = 'inline-block';
        }
        
        // Init App
        if(typeof loadApiKey === 'function') loadApiKey();
        if(typeof loadUi === 'function') loadUi();
        if(typeof autoGeocode === 'function') autoGeocode();
        if (window.updateTrayCount) window.updateTrayCount();
      } else {
        if(splash) splash.classList.add('splash-hidden');
        loginModal.style.display = 'flex';
        

      }
    } catch (e) {
      console.error('Auth Error', e);
    }
  }

  window.handleLogin = async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    let pw = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');
    const err = document.getElementById('login-error');
    

    
    btn.innerText = 'Lädt...';
    err.style.display = 'none';
    
    try {
      if (isRegisterMode) {
        globalUser = await window.api.register(email, pw);
      } else {
        globalUser = await window.api.login(email, pw);
      }
      window.globalUser = globalUser;
      
      executeLoginSuccess();
      btn.innerText = isRegisterMode ? 'Account erstellen' : 'Einloggen';
    } catch(error) {
      console.error(error);
      err.innerText = error.message || 'Login fehlgeschlagen.';
      err.style.display = 'block';
      btn.innerText = isRegisterMode ? 'Account erstellen' : 'Einloggen';
    }
  };

  window.handleLogout = async () => {
    await window.api.logout();
    window.location.reload();
  };

  window.handleProfileTitleClick = async () => {
    window._profileClickCount = (window._profileClickCount || 0) + 1;
    if (window._profileClickCount >= 5 && globalUser?.role !== 'developer') {
      try {
        const { error } = await window.supabase.rpc('update_user_role', { target_user_id: globalUser.id, new_role: 'developer' });
        if (!error) {
          globalUser.role = 'developer';
          alert('Developer mode unlocked!');
          openProfileModal(); // Refresh modal
        }
      } catch (err) {
        console.error('Unlock failed', err);
      }
    }
  };

  window.openProfileModal = () => {
    window._profileClickCount = 0;
    const email = globalUser?.email || 'Keine E-Mail';
    document.getElementById('profile-email-display').innerText = email;
    
    // Set Avatar Initial
    const avatarEl = document.getElementById('profile-avatar');
    if (avatarEl) {
      avatarEl.innerText = email.charAt(0).toUpperCase();
    }

    const roleMap = { 
      'developer': { icon: '👨‍💻', color: '#ef4444', text: 'DEVELOPER' }, 
      'admin': { icon: '👑', color: '#3b82f6', text: 'ADMIN' }, 
      'agent': { icon: '🛡️', color: '#22c55e', text: 'AGENT' } 
    };
    const roleData = roleMap[globalUser?.role] || roleMap['agent'];
    document.getElementById('profile-role-display').innerHTML = `
      <span style="color: ${roleData.color};">${roleData.icon}</span>
      <span style="color: ${roleData.color}; font-weight: 700;">${roleData.text}</span>
    `;

    document.getElementById('profile-name-input').value = globalUser?.name || '';
    
    const userMgmtBtn = document.getElementById('open-user-mgmt-btn');
    if (userMgmtBtn) {
      if (globalUser?.role === 'admin' || globalUser?.role === 'developer') {
        userMgmtBtn.style.display = 'flex';
      } else {
        userMgmtBtn.style.display = 'none';
      }
    }

    document.getElementById('profile-modal').classList.remove('hidden');
  };

  window.openUserManagement = async () => {
    document.getElementById('profile-modal').classList.add('hidden');
    document.getElementById('user-management-modal').classList.remove('hidden');
    
    const listContainer = document.getElementById('user-mgmt-list');
    listContainer.innerHTML = '<div style="color:var(--text-muted); font-size:12px;">Lade Benutzer...</div>';
    
    try {
      const users = await window.api.getUsers();
      listContainer.innerHTML = '';
      users.forEach(u => {
        const isMe = u.id === globalUser.id;
        const div = document.createElement('div');
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:12px; background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:8px;';
        
        let selectHtml = `
          <select class="modern-input-small" style="padding:4px 8px; font-size:12px; width:120px;" onchange="changeUserRole('${u.id}', this.value)" ${isMe ? 'disabled' : ''}>
            <option value="agent" ${u.role === 'agent' ? 'selected' : ''}>Agent</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="developer" ${u.role === 'developer' ? 'selected' : ''}>Developer</option>
          </select>
        `;
        
        // Use a simple helper to escape HTML securely
        const escape = (str) => String(str).replace(/[&<>'"]/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[match]));
        
        div.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:4px;">
            <strong style="color:#fff; font-size:14px;">${escape(u.name || 'Unbekannt')} ${isMe ? '(Du)' : ''}</strong>
            <span style="color:var(--text-muted); font-size:11px; font-family:monospace;">ID: ${u.id.substring(0,8)}...</span>
          </div>
          <div style="display:flex; align-items:center; gap:12px;">
            <span id="role-status-${u.id}" style="font-size:11px; color:var(--success); display:none;">Gespeichert!</span>
            ${selectHtml}
          </div>
        `;
        listContainer.appendChild(div);
      });
    } catch(err) {
      listContainer.innerHTML = `<div style="color:#ff453a; font-size:12px;">Fehler: ${err.message}</div>`;
    }
  };

  window.changeUserRole = async (userId, newRole) => {
    try {
      await window.api.updateUserRole(userId, newRole);
      const statusEl = document.getElementById(`role-status-${userId}`);
      if (statusEl) {
        statusEl.style.display = 'inline';
        setTimeout(() => { statusEl.style.display = 'none'; }, 2000);
      }
      window.globalUsersList = await window.api.getUsers(); // refresh internal list
    } catch (e) {
      alert("Fehler beim Ändern der Rolle: " + e.message);
    }
  };

  window.inviteUserReal = async () => {
    const emailInput = document.getElementById('invite-email-input-real');
    const statusMsg = document.getElementById('invite-status-msg-real');
    const btn = document.getElementById('invite-user-btn-real');
    const email = emailInput.value.trim();
    
    if (!email) {
      statusMsg.style.display = 'block';
      statusMsg.style.color = '#ff453a';
      statusMsg.textContent = 'Bitte E-Mail eingeben.';
      return;
    }

    try {
      btn.disabled = true;
      btn.textContent = 'Lädt...';
      statusMsg.style.display = 'none';

      await window.api.inviteUser(email);
      
      statusMsg.style.display = 'block';
      statusMsg.style.color = '#32d74b';
      statusMsg.textContent = 'Einladung erfolgreich gesendet!';
      emailInput.value = '';
      
      // Reload list
      await window.openUserManagement();
    } catch (err) {
      statusMsg.style.display = 'block';
      statusMsg.style.color = '#ff453a';
      statusMsg.textContent = 'Fehler: ' + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Einladen';
    }
  };

  window.saveProfile = async () => {
    const newName = document.getElementById('profile-name-input').value.trim();
    if (!newName) return;
    
    const btn = document.getElementById('profile-save-btn');
    btn.innerText = 'Speichert...';
    
    try {
      globalUser = await window.api.updateProfile(newName);
      window.globalUser = globalUser;
      window.globalUsersList = await window.api.getUsers(); // refresh list
      
      const accInfo = document.getElementById('account-info');
      if (accInfo) accInfo.innerText = `Eingeloggt als ${globalUser.name || globalUser.email || 'Unknown'} (${globalUser.role || 'agent'})`;
      
      const headerInitial = document.getElementById('header-profile-initial');
      if (headerInitial) headerInitial.innerText = (globalUser.name || globalUser.email || '?').charAt(0).toUpperCase();
      
      document.getElementById('profile-modal').classList.add('hidden');
    } catch(e) {
      console.error(e);
      alert('Fehler beim Speichern: ' + e.message);
    } finally {
      btn.innerText = 'Profil speichern';
    }
  };

  checkAuth();
  
  import { initProfileModal } from './profile-modal.js';
  initProfileModal();

  // ── Supabase Realtime Integration ──────────────────────────────────────────
  if (window.api && window.api.onLeadsChanged) {
    window.api.onLeadsChanged(({ eventType, newRow, oldRow }) => {
      console.log('⚡ Supabase Realtime Update:', eventType, newRow?.name || oldRow?.name);
      // Auto-refresh the current tab and the call tracker badge
      if (typeof loadUi === 'function') loadUi();
      if (typeof updateTrayCount === 'function') updateTrayCount();
    });
  }
