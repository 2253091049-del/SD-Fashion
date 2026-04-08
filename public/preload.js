const { contextBridge, ipcRenderer } = require('electron');

// Renderer process-এ safe API expose করো
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron,
  savePdf: (html) => ipcRenderer.invoke('save-pdf', html),
  printReceipt: (html) => ipcRenderer.invoke('print-receipt', html)
});
