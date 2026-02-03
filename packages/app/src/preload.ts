import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('sjSimApi', {});
