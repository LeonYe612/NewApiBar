const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('widgetAPI', {
  fetchData: () => ipcRenderer.invoke('fetch-data'),
  doLogin: (creds) => ipcRenderer.invoke('do-login', creds),
  saveDomain: (domain) => ipcRenderer.invoke('save-domain', domain),
  loadConfig: () => ipcRenderer.invoke('load-config'),
  setRefreshInterval: (min) => ipcRenderer.invoke('set-refresh-interval', min),
  logout: () => ipcRenderer.invoke('logout'),
  setPin: (pinned) => ipcRenderer.invoke('set-pin', pinned),
  resizeWindow: (width, height) => ipcRenderer.invoke('resize-window', width, height),
  saveTheme: (theme) => ipcRenderer.invoke('save-theme', theme),
  saveOpacity: (opacity) => ipcRenderer.invoke('save-opacity', opacity),
  saveMinimalMode: (mode) => ipcRenderer.invoke('save-minimal-mode', mode),
  hide: () => ipcRenderer.send('widget-hide'),
  show: () => ipcRenderer.send('widget-show')
})

// 事件转发
ipcRenderer.on('widget-refresh', () => {
  window.dispatchEvent(new CustomEvent('widget-refresh'))
})

ipcRenderer.on('widget-show-settings', () => {
  window.dispatchEvent(new CustomEvent('widget-show-settings'))
})
