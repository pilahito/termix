// Puente seguro entre el proceso principal y la interfaz.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("termix", {
  // hosts
  cargarHosts: () => ipcRenderer.invoke("hosts:load"),
  guardarHosts: (lista) => ipcRenderer.invoke("hosts:save", lista),
  importarSSHConfig: () => ipcRenderer.invoke("sshconfig:import"),

  // sesiones SSH
  conectar: (id, host) => ipcRenderer.invoke("ssh:connect", id, host),
  escribir: (id, datos) => ipcRenderer.send("ssh:input", id, datos),
  redimensionar: (id, cols, rows) => ipcRenderer.send("ssh:resize", id, cols, rows),
  cerrar: (id) => ipcRenderer.send("ssh:close", id),
  onDatos: (id, cb) => ipcRenderer.on(`ssh:data:${id}`, (_e, d) => cb(d)),
  onFin: (id, cb) => ipcRenderer.on(`ssh:exit:${id}`, () => cb()),

  // terminal local (pty)
  abrirLocal: (id) => ipcRenderer.invoke("local:abrir", id),
  escribirLocal: (id, datos) => ipcRenderer.send("local:input", id, datos),

  // SFTP
  sftpInicio: (id) => ipcRenderer.invoke("sftp:inicio", id),
  sftpListar: (id, ruta) => ipcRenderer.invoke("sftp:list", id, ruta),
  sftpDescargar: (id, ruta) => ipcRenderer.invoke("sftp:descargar", id, ruta),
  sftpSubir: (id, carpeta) => ipcRenderer.invoke("sftp:subir", id, carpeta),
  sftpAccion: (id, accion, ruta, nuevo) => ipcRenderer.invoke("sftp:accion", id, accion, ruta, nuevo),

  // reenvío de puertos
  forwardAbrir: (id, regla) => ipcRenderer.invoke("forward:abrir", id, regla),
  forwardCerrar: (id, puerto) => ipcRenderer.invoke("forward:cerrar", id, puerto),
  forwardListar: (id) => ipcRenderer.invoke("forward:listar", id),

  // snippets
  snippetsCargar: () => ipcRenderer.invoke("snippets:load"),
  snippetsGuardar: (lista) => ipcRenderer.invoke("snippets:save", lista),
  snippetEnviar: (id, texto) => ipcRenderer.send("snippets:enviar", id, texto),

  // vault cifrado
  vaultEstado: () => ipcRenderer.invoke("vault:estado"),
  vaultDesbloquear: (clave) => ipcRenderer.invoke("vault:desbloquear", clave),
  vaultActivar: (clave) => ipcRenderer.invoke("vault:activar", clave),
  vaultDesactivar: (clave) => ipcRenderer.invoke("vault:desactivar", clave),
  vaultCambiarClave: (actual, nueva) => ipcRenderer.invoke("vault:cambiarClave", actual, nueva),
  vaultBloquear: () => ipcRenderer.invoke("vault:bloquear"),

  // inventario local
  listarClaves: () => ipcRenderer.invoke("keys:list"),
  listarKnownHosts: () => ipcRenderer.invoke("knownhosts:list"),
  cargarLog: () => ipcRenderer.invoke("log:load"),
  anotarLog: (entrada) => ipcRenderer.invoke("log:append", entrada),

  // varios
  elegirClave: () => ipcRenderer.invoke("dialog:key"),
  abrirConfig: () => ipcRenderer.invoke("shell:abrirConfig"),
});
