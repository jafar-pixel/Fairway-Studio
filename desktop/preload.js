// The web app gets no Node or Electron access. The only bridge is the offline page's retry button.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fairwayDesktop", {
  isDesktop: true,
  retry: () => ipcRenderer.send("fairway:retry"),
});
