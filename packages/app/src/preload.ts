import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('sjSimApi', {
  saveGame: (payload: unknown) => ipcRenderer.invoke('sjSim:saveGame', payload),
  loadGame: () => ipcRenderer.invoke('sjSim:loadGame'),
  getSaveSummary: () => ipcRenderer.invoke('sjSim:getSaveSummary'),
});
