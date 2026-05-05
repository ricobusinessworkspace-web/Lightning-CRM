const { app, BrowserWindow, ipcMain, shell, Tray, nativeImage, Menu, session } = require('electron');
const path = require('path');
const db = require('./db.js');

let mainWindow;
let tray = null;
let isQuitting = false;

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('index.html');



  const template = [
    { label: 'Calling Station', submenu: [{ label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => { isQuitting = true; app.quit(); } }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show App', click: () => { if(mainWindow) { if(!mainWindow.isVisible()) mainWindow.show(); mainWindow.focus(); } } },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('Calling Station');
  tray.setTitle('📞 0/100'); // Added an emoji and default text for the menu bar so it's visible
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    if (mainWindow) {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'geolocation') {
      callback(true);
    } else {
      callback(false);
    }
  });
  
  // Start at login
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true
  });

  createWindow();
  createTray();

  app.on('activate', function () {
    if (mainWindow) {
        mainWindow.show();
    } else {
        createWindow();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', function () {
  // Removed app.quit() to keep app persistently in dock on mac
});

// IPC Handlers
ipcMain.handle('get-leads', async (event, filters) => {
  return db.getLeads(filters);
});

ipcMain.handle('save-lead', async (event, lead) => {
  return db.saveLead(lead);
});

ipcMain.handle('log-call', async (event, id) => {
  return db.logCall(id);
});

ipcMain.handle('delete-lead', async (event, id) => {
  return db.deleteLead(id);
});

ipcMain.handle('delete-leads', async (event, ids) => {
  return db.deleteLeads(ids);
});

ipcMain.handle('import-leads', async (event, leadsArray) => {
  return db.importLeads(leadsArray);
});

ipcMain.handle('get-stats', async (event, range) => {
  return db.getStats(range);
});

ipcMain.handle('get-active-session', async () => {
  return db.getActiveSession();
});

ipcMain.handle('create-session', async () => {
  return db.createSession();
});

ipcMain.handle('end-session', async (event, sessionId) => {
  return db.endSession(sessionId);
});

ipcMain.handle('log-call-extended', async (event, data) => {
  return db.logCallExtended(data);
});

ipcMain.handle('get-session-stats', async (event, sessionId) => {
  return db.getSessionStats(sessionId);
});

ipcMain.handle('open-url', async (event, url) => {
  require('electron').shell.openExternal(url);
  return true;
});

ipcMain.on('update-tray', (event, count) => {
  if (tray) {
    try {
      tray.setTitle(`📞 ${count}/100`);
    } catch(e) {}
  }
});

ipcMain.handle('copy-text', async (event, text) => {
  require('electron').clipboard.writeText(text);
  return true;
});

// --- IPC HANDLERS END ---
