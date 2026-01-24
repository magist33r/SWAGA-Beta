const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vipGui', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (data) => ipcRenderer.invoke('config:save', data),
});
