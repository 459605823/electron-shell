const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kiosk', {
  reloadRemote: () => ipcRenderer.invoke('reload-remote')
});