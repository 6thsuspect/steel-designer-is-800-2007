/**
 * Electron main process — window lifecycle, file save/load dialogs and
 * printToPDF export (FR-24.4). Renderers run the same React UI as the web build.
 */
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    title: 'Steel Designer IS800',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // Built renderer output (vite build) lives at dist/index.html
  void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('save-json', async (_e, defaultName: string, content: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: defaultName, filters: [{ name: 'Workspace JSON', extensions: ['json'] }] });
  if (!canceled && filePath) fs.writeFileSync(filePath, content, 'utf-8');
  return canceled ? null : filePath;
});

ipcMain.handle('open-json', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ filters: [{ name: 'Workspace JSON', extensions: ['json'] }], properties: ['openFile'] });
  if (canceled || filePaths.length === 0) return null;
  return fs.readFileSync(filePaths[0], 'utf-8');
});

ipcMain.handle('save-blob', async (_e, defaultName: string, data: Uint8Array) => {
  const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: defaultName });
  if (!canceled && filePath) fs.writeFileSync(filePath, Buffer.from(data));
  return canceled ? null : filePath;
});

ipcMain.handle('save-pdf', async (e, defaultName: string) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return null;
  const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: defaultName, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (canceled || !filePath) return null;
  const data = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 } });
  fs.writeFileSync(filePath, data);
  return filePath;
});
