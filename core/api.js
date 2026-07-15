import { db } from './db.js';
import Papa from 'papaparse';

window.Papa = Papa;

window.api = {
  // Leads
  openExternal: (url) => window.open(url, '_blank'),
  getLeads: (filters) => db.getLeads(filters),
  saveLead: (lead) => db.saveLead(lead),
  deleteLead: (id) => db.deleteLead(id),
  deleteLeads: (ids) => db.deleteLeads(ids),
  importLeads: (leadsArray) => db.importLeads(leadsArray),

  // Auth
  getCurrentUser: () => db.getCurrentUser(),
  login: (email, password) => db.login(email, password),
  register: (email, password) => db.register(email, password),
  logout: () => db.logout(),
  
  getSavedCredentials: async () => [],
  saveCredential: async () => ({success: true}),
  promptTouchID: async () => ({success: true}), 
  updateProfile: (name) => db.updateProfile(name),
  getUsers: () => db.getUsers(),
  updateUserRole: (userId, newRole) => db.updateUserRole(userId, newRole),
  makeMeDeveloper: () => db.makeMeDeveloper(),
  getAgentStats: () => db.getAgentStats(),

  // Call Tracking
  logCall: (id) => db.logCall(id),
  logEmail: (id) => db.logEmail(id),
  markCallNotAnswered: (leadId, callTs) => db.markCallNotAnswered(leadId, callTs),
  getCallsToday: () => db.getCallsToday(),

  // Utilities
  updateTray: (count) => { console.log("Tray updated:", count); document.title = `📞 ${count}/100 - Lightning CRM`; },
  copyText: async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch(e) {
      console.error('Clipboard error:', e);
      return false;
    }
  },
  fetchApi: async (url, options) => {
    try {
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl, options);
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch(e) { data = text; }
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      return { error: err.message };
    }
  },

  onLeadsChanged: (callback) => db.subscribeToLeadChanges(callback)
};
