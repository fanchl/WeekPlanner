const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quickAddBridge', {
  submit: (text) => ipcRenderer.invoke('quick-add:submit', { text }),
  close: () => ipcRenderer.send('quick-add:close'),
  onReset: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('quick-add:reset', handler);
    return () => ipcRenderer.removeListener('quick-add:reset', handler);
  },
  onFocusInput: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('quick-add:focus-input', handler);
    return () => ipcRenderer.removeListener('quick-add:focus-input', handler);
  }
});
