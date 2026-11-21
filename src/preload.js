// Puente seguro entre el proceso principal y la interfaz.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("termix", {
  cargarHosts: () => ipcRenderer.invoke("hosts:load"),
  guardarHosts: (lista) => ipcRenderer.invoke("hosts:save", lista),
  conectar: (id, host) => ipcRenderer.invoke("ssh:connect", id, host),
  escribir: (id, datos) => ipcRenderer.send("ssh:input", id, datos),
  redimensionar: (id, cols, rows) => ipcRenderer.send("ssh:resize", id, cols, rows),
  cerrar: (id) => ipcRenderer.send("ssh:close", id),
  elegirClave: () => ipcRenderer.invoke("dialog:key"),
  importarSSHConfig: () => ipcRenderer.invoke("sshconfig:import"),
  abrirConfig: () => ipcRenderer.invoke("shell:abrirConfig"),
  onDatos: (id, cb) => ipcRenderer.on(`ssh:data:${id}`, (_e, d) => cb(d)),
  onFin: (id, cb) => ipcRenderer.on(`ssh:exit:${id}`, () => cb()),
});
