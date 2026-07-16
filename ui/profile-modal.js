import { auth } from '../core/auth.js';

export function initProfileModal() {
  const modal = document.getElementById('profile-modal');
  if (!modal) return;

  const closeBtn = document.getElementById('close-profile-btn');
  const saveBtn = document.getElementById('save-profile-btn');
  const biometricsBtn = document.getElementById('setup-biometrics-btn');
  
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const name = document.getElementById('profile-name-input').value;
    try {
      saveBtn.textContent = 'Speichere...';
      await window.api.updateProfile(name);
      saveBtn.textContent = 'Gespeichert!';
      setTimeout(() => saveBtn.textContent = 'Profil speichern', 2000);
    } catch (err) {
      console.error(err);
      saveBtn.textContent = 'Fehler!';
    }
  });
  }

  if (biometricsBtn) {
    biometricsBtn.addEventListener('click', async () => {
      biometricsBtn.innerHTML = '<span class="icon">⏳</span> Richte ein...';
      // Im Desktop-Modus greift Electron IPC, im Web greift WebAuthn
      const res = window.api.promptTouchID ? await window.api.promptTouchID() : await auth.registerPasskey();
      if (res && res.success) {
        biometricsBtn.innerHTML = '<span class="icon">✅</span> Eingerichtet';
      } else {
        biometricsBtn.innerHTML = '<span class="icon">❌</span> Fehler';
      }
    });
  }

  // Global event listener to open modal (e.g. from header)
  window.addEventListener('open-profile', async () => {
    const user = await window.api.getCurrentUser();
    if (!user) return;

    document.getElementById('profile-name-input').value = user.name || '';
    document.getElementById('profile-email-input').value = user.email || '';
    
    const roleBadge = document.getElementById('profile-role-badge');
    roleBadge.textContent = (user.role === 'minion' || user.role === 'agent') ? '🛡️ Agent' : user.role;
    
    if (user.role === 'admin' || user.role === 'developer') {
      document.getElementById('admin-section').style.display = 'block';
      loadAdminUsers(user.role);
    } else {
      document.getElementById('admin-section').style.display = 'none';
    }

    modal.style.display = 'flex';
  });
}

async function loadAdminUsers(currentRole) {
  const list = document.getElementById('admin-user-list');
  list.innerHTML = 'Lade Nutzer...';
  
  try {
    const users = await window.api.getUsers();
    list.innerHTML = '';
    
    users.forEach(u => {
      const row = document.createElement('div');
      row.className = 'admin-user-row';
      
      const displayRole = (u.role === 'minion' || u.role === 'agent') ? 'Agent' : u.role;
      const info = document.createElement('div');
      info.innerHTML = `<strong>${u.name}</strong> <span class="mono">${displayRole}</span>`;
      
      const actions = document.createElement('div');
      if (currentRole === 'developer' && u.role !== 'developer') {
        const promoteBtn = document.createElement('button');
        promoteBtn.className = 'btn';
        promoteBtn.style.padding = '4px 8px';
        promoteBtn.textContent = 'Make Admin';
        promoteBtn.onclick = async () => {
          await window.api.updateUserRole(u.id, 'admin');
          loadAdminUsers(currentRole);
        };
        actions.appendChild(promoteBtn);
      }
      
      row.appendChild(info);
      row.appendChild(actions);
      list.appendChild(row);
    });
  } catch (err) {
    list.innerHTML = 'Fehler beim Laden.';
  }
}
