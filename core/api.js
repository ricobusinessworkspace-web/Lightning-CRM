import { db } from './db.js';
import Papa from 'papaparse';

window.Papa = Papa;

window.api = {
  // Leads
  // Immer ein neuer Reiter im selben Fenster.
  //
  // window.open() laesst Safari je nach Einstellung ein eigenes Fenster
  // aufmachen. Ein angeklickter Verweis mit target="_blank" folgt dagegen der
  // Einstellung "Seiten in Reitern statt in Fenstern oeffnen" — und die steht
  // bei Safari standardmaessig auf Reitern.
  openExternal: (url) => {
    if (!url) return;
    try {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      window.open(url, '_blank');      // Rueckfallweg
    }
  },
  getLeads: (filters) => db.getLeads(filters),
  getLead: (id) => db.getLead(id),
  saveLead: async (lead) => {
    const res = await db.saveLead(lead);
    if (res && res.last_edited_ms) {
       lead.last_edited_ms = res.last_edited_ms;
       if (typeof window !== 'undefined' && window.store && window.store.state.leads) {
          const stored = window.store.state.leads.find(x => x.id === res.id);
          if (stored) stored.last_edited_ms = res.last_edited_ms;
       }
    }
    return res;
  },
  deleteLead: (id) => db.deleteLead(id),
  deleteLeads: (ids) => db.deleteLeads(ids),
  importLeads: (leadsArray) => db.importLeads(leadsArray),

  // Auth
  getSessionToken: () => db.getSessionToken(),
  getCurrentUser: () => db.getCurrentUser(),
  login: (email, password) => db.login(email, password),
  register: (email, password) => db.register(email, password),
  logout: () => db.logout(),
  
  getSavedCredentials: async () => [],
  saveCredential: async () => ({success: true}),
  promptTouchID: async () => ({success: true}), 
  updateProfile: (name) => db.updateProfile(name),
  updateEmail: (email) => db.updateEmail(email),
  getUsers: () => db.getUsers(),
  inviteUser: (email) => db.inviteUser(email),
  updateUserRole: (userId, newRole) => db.updateUserRole(userId, newRole),
  deactivateUser: (userId) => db.deactivateUser(userId),
  makeMeDeveloper: () => db.makeMeDeveloper(),
  getAgentStats: () => db.getAgentStats(),

  // Kennzahlen — lesen aus den Sichten, nicht aus den Rohtabellen
  getDailyMetrics: (vonTag, bisTag) => db.getDailyMetrics(vonTag, bisTag),
  getStockMetrics: () => db.getStockMetrics(),
  getMetricTargets: () => db.getMetricTargets(),
  saveMetricTarget: (zeile) => db.saveMetricTarget(zeile),
  getClosedNeedingInput: (grenze) => db.getClosedNeedingInput(grenze),
  savePipelineSnapshot: (bestand) => db.savePipelineSnapshot(bestand),
  getPipelineSnapshots: (von, bis) => db.getPipelineSnapshots(von, bis),
  getSettings: () => db.getSettings(),
  saveSetting: (key, value) => db.saveSetting(key, value),
  getUserRP: (userId) => db.getUserRP(userId),
  getLeadHistory: (id) => db.getLeadHistory(id),
  getStage: (lead) => db.getStage(lead),
  sortLeads: (liste, filters) => db.sortLeads(liste, filters),
  aktualisiereMehrfachStandorte: () => db.aktualisiereMehrfachStandorte(),

  // Call Tracking
  logCall: (id) => db.logCall(id),
  logMessage: (id, kanal) => db.logMessage(id, kanal),
  logEmail: (id) => db.logMessage(id, 'email'),
  logTaskDone: (id, text, hauptText) => db.logTaskDone(id, text, hauptText),
  logStatusChange: (id, neueStufe, alteStufe) => db.logStatusChange(id, neueStufe, alteStufe),
  deleteActivity: (id, type) => db.deleteActivity(id, type),
  getCallsToday: () => db.getCallsToday(),
  updateCallGoal: (goal) => db.updateCallGoal(goal),

  // Utilities
  updateTray: (count) => { console.log("Tray updated:", count); },
  // Kopieren mit Rueckfallweg: die Zwischenablage-Schnittstelle verweigert
  // den Dienst, wenn das Fenster nicht im Vordergrund ist oder die Seite nicht
  // ueber https laeuft. Dann bleibt der alte Weg ueber ein verstecktes Feld.
  copyText: async (text) => {
    const wert = String(text == null ? '' : text);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(wert);
        return true;
      }
    } catch (e) {
      console.warn('Zwischenablage abgelehnt, nutze Rueckfallweg:', e && e.message);
    }
    try {
      const feld = document.createElement('textarea');
      feld.value = wert;
      feld.setAttribute('readonly', '');
      feld.style.cssText = 'position:fixed; top:-1000px; opacity:0;';
      document.body.appendChild(feld);
      feld.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(feld);
      return !!ok;
    } catch (e) {
      console.error('Clipboard error:', e);
      return false;
    }
  },
  fetchApi: async (url, options = {}) => {
    try {
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
      const token = await db.getSessionToken();
      if (token) {
        options.headers = { ...options.headers, Authorization: `Bearer ${token}` };
      }
      const res = await fetch(proxyUrl, options);
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch(e) { data = text; }
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      return { error: err.message };
    }
  },

  onLeadsChanged: (callback) => db.subscribeToLeadChanges(callback),
  
  // Notifications
  getNotifications: () => db.getNotifications(),
  markNotificationRead: (id) => db.markNotificationRead(id),
  sendNotification: (userId, type, leadId, message) => db.sendNotification(userId, type, leadId, message),
  subscribeToNotifications: (callback) => db.subscribeToNotifications(callback)
};
