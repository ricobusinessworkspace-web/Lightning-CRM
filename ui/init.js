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
    if (accInfo) accInfo.innerText = `Eingeloggt als ${globalUser.name || globalUser.email || 'Unknown'} (${globalUser.role || 'agent'})`;
    
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
        if (accInfo) accInfo.innerText = `Eingeloggt als ${globalUser.name || globalUser.email || 'Unknown'} (${globalUser.role || 'agent'})`;
        
        const headerInitial = document.getElementById('header-profile-initial');
        if (headerInitial) {
           const dispName = globalUser.name || globalUser.email || '?';
           headerInitial.innerText = dispName.charAt(0).toUpperCase();
        }
        
        window.globalUsersList = await window.api.getUsers();
        
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

  window.openProfileModal = () => {
    document.getElementById('profile-email-display').innerText = globalUser?.email || 'Keine E-Mail';
    const roleMap = { 'admin': '👑 Administrator', 'agent': '🛡️ Agent' };
    document.getElementById('profile-role-display').innerHTML = roleMap[globalUser?.role] || '🛡️ Agent';
    document.getElementById('profile-name-input').value = globalUser?.name || '';
    document.getElementById('profile-modal').classList.remove('hidden');
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

  // ── Supabase Realtime Integration ──────────────────────────────────────────
  if (window.api && window.api.onLeadsChanged) {
    window.api.onLeadsChanged(({ eventType, newRow, oldRow }) => {
      console.log('⚡ Supabase Realtime Update:', eventType, newRow?.name || oldRow?.name);
      // Auto-refresh the current tab and the call tracker badge
      if (typeof loadUi === 'function') loadUi();
      if (typeof updateTrayCount === 'function') updateTrayCount();
    });
  }
