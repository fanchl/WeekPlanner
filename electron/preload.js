const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopBridge', {
  isDesktop: true,
  openMarkdownFile: () => ipcRenderer.invoke('dialog:open-markdown'),
  writeMarkdownFile: (filePath, content) =>
    ipcRenderer.invoke('fs:write-markdown', { filePath, content }),
  saveMarkdownAs: (defaultName, content) =>
    ipcRenderer.invoke('dialog:save-markdown', { defaultName, content }),
  onQuickAdd: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('quick-add:create', handler);
    return () => ipcRenderer.removeListener('quick-add:create', handler);
  }
});
