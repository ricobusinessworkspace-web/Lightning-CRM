const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openExternal: (url) => ipcRenderer.invoke('open-url', url),
  getLeads: (filters) => ipcRenderer.invoke('get-leads', filters),
  saveLead: (lead) => ipcRenderer.invoke('save-lead', lead),
  deleteLead: (id) => ipcRenderer.invoke('delete-lead', id),
  deleteLeads: (ids) => ipcRenderer.invoke('delete-leads', ids),
  logCall: (id) => ipcRenderer.invoke('log-call', id),
  importLeads: (leadsArray) => ipcRenderer.invoke('import-leads', leadsArray),
  getStats: (range = 'today') => ipcRenderer.invoke('get-stats', range),
  getActiveSession: () => ipcRenderer.invoke('get-active-session'),
  createSession: () => ipcRenderer.invoke('create-session'),
  endSession: (sessionId) => ipcRenderer.invoke('end-session', sessionId),
  logCallExtended: (data) => ipcRenderer.invoke('log-call-extended', data),
  getSessionStats: (sessionId) => ipcRenderer.invoke('get-session-stats', sessionId),

  updateTray: (count) => ipcRenderer.send('update-tray', count),

  copyText: (text) => ipcRenderer.invoke('copy-text', text)
});
