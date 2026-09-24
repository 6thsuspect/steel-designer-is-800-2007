/** Electron preload — exposes a minimal, safe bridge for file & PDF I/O. */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  saveJSON: (name: string, content: string) => ipcRenderer.invoke('save-json', name, content) as Promise<string | null>,
  openJSON: () => ipcRenderer.invoke('open-json') as Promise<string | null>,
  saveBlob: (name: string, blob: Blob) =>
    blob.arrayBuffer().then((buf) => ipcRenderer.invoke('save-blob', name, new Uint8Array(buf))) as Promise<string | null>,
  savePDF: (name: string) => ipcRenderer.invoke('save-pdf', name) as Promise<string | null>,
});
