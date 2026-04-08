const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function startServer() {
  // Set paths for the server to use
  if (app.isPackaged) {
    process.env.USER_DATA_PATH = app.getPath('userData');
  } else {
    process.env.USER_DATA_PATH = path.join(__dirname, 'data');
  }
  process.env.PORT = 3000;
  
  // Directly require instead of fork to allow app.asar access
  require('./server/server.js');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'SD Fashion Billing',
    icon: path.join(__dirname, 'public', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'public', 'preload.js')
    },
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startServer();
  createWindow();
});

ipcMain.handle('save-pdf', async (_event, html) => {
  const pdfWindow = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true }
  });

  const htmlUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
  await pdfWindow.loadURL(htmlUrl);

  const pdf = await pdfWindow.webContents.printToPDF({
    printBackground: true,
    // 80mm x 200mm (microns) for POS-style receipts
    pageSize: { width: 80000, height: 200000 }
  });

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save Bill PDF',
    defaultPath: 'SD-Fashion-Bill.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });

  if (canceled || !filePath) {
    pdfWindow.close();
    return { canceled: true };
  }

  fs.writeFileSync(filePath, pdf);
  pdfWindow.close();
  return { canceled: false, filePath };
});

ipcMain.handle('print-receipt', async (_event, html) => {
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true }
  });

  const htmlUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
  await printWindow.loadURL(htmlUrl);

  await new Promise((resolve, reject) => {
    printWindow.webContents.print({
      silent: false,
      printBackground: true
    }, (success, errorType) => {
      if (!success) {
        reject(new Error(errorType || 'Print failed'));
        return;
      }
      resolve();
    });
  });

  printWindow.close();
  return { ok: true };
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null && app.isReady()) {
    createWindow();
  }
});

app.on('before-quit', () => {
  // Force exit to ensure background Node/Express server doesn't stay alive
  process.exit(0);
});
