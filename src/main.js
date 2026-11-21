// Termix — proceso principal de Electron.
// Cliente SSH open source: gestiona las conexiones con ssh2 y manda los datos
// al renderer (xterm.js). No hay nube, ni cuentas, ni telemetría.
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { Client } = require("ssh2");
const net = require("node:net");

const CONFIG_DIR = path.join(os.homedir(), ".config", "termix");
const HOSTS_FILE = path.join(CONFIG_DIR, "hosts.json");

const sesiones = new Map(); // id -> { client, stream, win }

function leerHosts() {
  try {
    return JSON.parse(fs.readFileSync(HOSTS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function guardarHosts(lista) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(HOSTS_FILE, JSON.stringify(lista, null, 2));
  return true;
}

function crearVentana() {
  const win = new BrowserWindow({
    width: 1480,
    height: 900,
    minWidth: 820,
    minHeight: 520,
    title: "Termix",
    backgroundColor: "#0f1115",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  return win;
}

app.whenReady().then(() => {
  crearVentana();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });
});

app.on("window-all-closed", () => {
  for (const [, s] of sesiones) {
    try { s.stream?.close(); s.client?.end(); } catch {}
  }
  if (process.platform !== "darwin") app.quit();
});

// ── hosts ──────────────────────────────────────────────────────────────────
ipcMain.handle("hosts:load", () => leerHosts());
ipcMain.handle("hosts:save", (_e, lista) => guardarHosts(lista));

// ── conexión SSH ───────────────────────────────────────────────────────────
ipcMain.handle("ssh:connect", async (event, id, host) => {
  try {
    const client = new Client();
    sesiones.set(id, { client, win: event.sender });

    const enviar = (canal, datos) => {
      if (!event.sender.isDestroyed()) event.sender.send(canal, datos);
    };

    return await new Promise((resolve) => {
      client.on("ready", () => {
        client.shell({ term: "xterm-256color", cols: 100, rows: 30 }, (err, stream) => {
          if (err) return resolve({ ok: false, error: err.message });
          const sesion = sesiones.get(id);
          sesion.stream = stream;
          stream.on("data", (d) => enviar(`ssh:data:${id}`, d.toString("utf8")));
          stream.stderr.on("data", (d) => enviar(`ssh:data:${id}`, d.toString("utf8")));
          stream.on("close", () => {
            enviar(`ssh:exit:${id}`);
            try { client.end(); } catch {}
            sesiones.delete(id);
          });
          resolve({ ok: true });
        });
      });
      client.on("error", (err) => resolve({ ok: false, error: err.message }));
      client.on("keyboard-interactive", (_n, _i, _l, prompts, finish) => {
        finish(prompts.map(() => host.password || ""));
      });

      const opciones = {
        host: host.host,
        port: Number(host.port) || 22,
        username: host.user,
        readyTimeout: 20000,
        keepaliveInterval: 15000,
        tryKeyboard: true,
        algorithms: { serverHostKey: ["ssh-ed25519", "rsa-sha2-256", "ssh-rsa", "ecdsa-sha2-nistp256"] },
      };
      if (host.auth === "key" && host.keyPath) {
        opciones.privateKey = fs.readFileSync(host.keyPath.replace(/^~/, os.homedir()));
        if (host.password) opciones.passphrase = host.password;
      } else {
        opciones.password = host.password || "";
      }
      client.connect(opciones);
    });
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.on("ssh:input", (_e, id, datos) => {
  const s = sesiones.get(id);
  try { s?.stream?.write(datos); } catch {}
});

ipcMain.on("ssh:resize", (_e, id, cols, rows) => {
  const s = sesiones.get(id);
  try { s?.stream?.setWindow(rows, cols, 0, 0); } catch {}
});

ipcMain.on("ssh:close", (_e, id) => {
  const s = sesiones.get(id);
  try { s?.stream?.close(); s?.client?.end(); } catch {}
  sesiones.delete(id);
});

// ── SFTP ───────────────────────────────────────────────────────────────────
function sesionSFTP(id) {
  const sesion = sesiones.get(id);
  if (!sesion) return null;
  if (sesion.sftp) return sesion.sftp;
  return null;
}

ipcMain.handle("sftp:list", async (_e, id, ruta) => {
  const s = sesiones.get(id);
  if (!s?.client) return { ok: false, error: "sin conexión" };
  const destino = ruta || ".";
  return await new Promise((resolve) => {
    s.client.sftp((err, sftp) => {
      if (err) return resolve({ ok: false, error: err.message });
      sftp.readdir(destino, (err2, lista) => {
        if (err2) return resolve({ ok: false, error: err2.message });
        const entradas = lista
          .map((e) => ({
            nombre: e.filename,
            directorio: e.attrs.isDirectory(),
            tamano: e.attrs.size,
            mtime: e.attrs.mtime,
            permisos: (e.attrs.mode & 0o777).toString(8),
          }))
          .filter((e) => e.nombre !== "." && e.nombre !== "..")
          .sort((a, b) => Number(b.directorio) - Number(a.directorio) || a.nombre.localeCompare(b.nombre));
        sftp.realpath(destino, (_err3, real) => resolve({ ok: true, ruta: real || destino, entradas }));
      });
    });
  });
});

ipcMain.handle("sftp:inicio", async (_e, id) =>
  await new Promise((resolve) => {
    const s = sesiones.get(id);
    if (!s?.client) return resolve("~");
    s.client.sftp((err, sftp) => {
      if (err) return resolve("~");
      sftp.realpath(".", (_e2, real) => resolve(real || "~"));
    });
  }));

ipcMain.handle("sftp:descargar", async (event, id, rutaRemota) => {
  const s = sesiones.get(id);
  if (!s?.client) return { ok: false, error: "sin conexión" };
  const r = await dialog.showSaveDialog({
    title: "Guardar archivo",
    defaultPath: path.join(os.homedir(), "Descargas", path.basename(rutaRemota)),
  });
  if (r.canceled || !r.filePath) return { ok: false, cancelado: true };
  return await new Promise((resolve) => {
    s.client.sftp((err, sftp) => {
      if (err) return resolve({ ok: false, error: err.message });
      sftp.fastGet(rutaRemota, r.filePath, (err2) => {
        resolve(err2 ? { ok: false, error: err2.message } : { ok: true, ruta: r.filePath });
      });
    });
  });
});

ipcMain.handle("sftp:subir", async (_e, id, carpetaRemota) => {
  const s = sesiones.get(id);
  if (!s?.client) return { ok: false, error: "sin conexión" };
  const r = await dialog.showOpenDialog({ title: "Subir archivo(s)", properties: ["openFile", "multiSelections"] });
  if (r.canceled || !r.filePaths.length) return { ok: false, cancelado: true };
  return await new Promise((resolve) => {
    s.client.sftp((err, sftp) => {
      if (err) return resolve({ ok: false, error: err.message });
      let pendientes = r.filePaths.length;
      const fallos = [];
      for (const local of r.filePaths) {
        const destino = path.posix.join(carpetaRemota, path.basename(local));
        sftp.fastPut(local, destino, (err2) => {
          if (err2) fallos.push(`${path.basename(local)}: ${err2.message}`);
          if (--pendientes === 0) resolve({ ok: fallos.length === 0, fallos });
        });
      }
    });
  });
});

ipcMain.handle("sftp:accion", async (_e, id, accion, ruta, nuevo) => {
  const s = sesiones.get(id);
  if (!s?.client) return { ok: false, error: "sin conexión" };
  return await new Promise((resolve) => {
    s.client.sftp((err, sftp) => {
      if (err) return resolve({ ok: false, error: err.message });
      const hecho = (e) => resolve(e ? { ok: false, error: e.message } : { ok: true });
      if (accion === "mkdir") sftp.mkdir(ruta, hecho);
      else if (accion === "borrar") sftp.unlink(ruta, hecho);
      else if (accion === "rmdir") sftp.rmdir(ruta, hecho);
      else if (accion === "renombrar") sftp.rename(ruta, nuevo, hecho);
      else resolve({ ok: false, error: "acción desconocida" });
    });
  });
});

// ── reenvío de puertos local (-L) ──────────────────────────────────────────
ipcMain.handle("forward:abrir", async (_e, id, regla) => {
  const s = sesiones.get(id);
  if (!s?.client) return { ok: false, error: "sin conexión" };
  if (!net) return { ok: false, error: "net no disponible" };
  return await new Promise((resolve) => {
    const servidor = net.createServer((socket) => {
      s.client.forwardOut("127.0.0.1", socket.remotePort || 0, regla.destino, regla.puertoDestino, (err, flujo) => {
        if (err) { socket.destroy(); return; }
        socket.pipe(flujo).pipe(socket);
        flujo.on("close", () => socket.destroy());
        socket.on("error", () => flujo.destroy());
      });
    });
    servidor.on("error", (e) => resolve({ ok: false, error: e.message }));
    servidor.listen(regla.puertoLocal, "127.0.0.1", () => {
      s.forwards = s.forwards || [];
      s.forwards.push({ ...regla, servidor, activo: true });
      resolve({ ok: true, puerto: regla.puertoLocal });
    });
  });
});

ipcMain.handle("forward:cerrar", async (_e, id, puertoLocal) => {
  const s = sesiones.get(id);
  if (!s?.forwards) return { ok: false };
  const i = s.forwards.findIndex((f) => f.puertoLocal === puertoLocal);
  if (i >= 0) {
    try { s.forwards[i].servidor.close(); } catch {}
    s.forwards.splice(i, 1);
  }
  return { ok: true };
});

ipcMain.handle("forward:listar", (_e, id) => {
  const s = sesiones.get(id);
  return (s?.forwards || []).map((f) => ({ puertoLocal: f.puertoLocal, destino: f.destino, puertoDestino: f.puertoDestino, activo: f.activo }));
});

// ── shell local (pty con "script") ─────────────────────────────────────────
ipcMain.handle("local:abrir", async (event, id) => {
  const { spawn } = require("node:child_process");
  const enviar = (datos) => { if (!event.sender.isDestroyed()) event.sender.send(`ssh:data:${id}`, datos); };
  const hijo = spawn("script", ["-qfc", process.env.SHELL || "/bin/bash", "/dev/null"], {
    env: { ...process.env, TERM: "xterm-256color" },
  });
  sesiones.set(id, { local: hijo, win: event.sender });
  hijo.stdout.on("data", (d) => enviar(d.toString("utf8")));
  hijo.stderr.on("data", (d) => enviar(d.toString("utf8")));
  hijo.on("close", () => {
    if (!event.sender.isDestroyed()) event.sender.send(`ssh:exit:${id}`);
    sesiones.delete(id);
  });
  return { ok: true, proceso: hijo.pid };
});

ipcMain.on("local:input", (_e, id, datos) => {
  try { sesiones.get(id)?.local?.stdin?.write(datos); } catch {}
});

// ── snippets ───────────────────────────────────────────────────────────────
const SNIPPETS = path.join(CONFIG_DIR, "snippets.json");
ipcMain.handle("snippets:load", () => {
  try { return JSON.parse(fs.readFileSync(SNIPPETS, "utf-8")); } catch { return []; }
});
ipcMain.handle("snippets:save", (_e, lista) => {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(SNIPPETS, JSON.stringify(lista, null, 2));
  return true;
});
ipcMain.on("snippets:enviar", (_e, id, texto) => {
  const s = sesiones.get(id);
  try { s?.stream ? s.stream.write(texto) : s?.local?.stdin?.write(texto); } catch {}
});

// ── importar ~/.ssh/config ─────────────────────────────────────────────────
ipcMain.handle("sshconfig:import", () => {
  const ruta = path.join(os.homedir(), ".ssh", "config");
  if (!fs.existsSync(ruta)) return [];
  const salida = [];
  let actual = null;
  for (const linea of fs.readFileSync(ruta, "utf-8").split("\n")) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const [clave, ...resto] = limpia.split(/\s+/);
    const valor = resto.join(" ");
    if (/^host$/i.test(clave)) {
      if (actual && actual.host && !/[*?]/.test(actual.host)) salida.push(actual);
      actual = { nombre: valor, host: "", port: "22", user: os.userInfo().username, auth: "key", keyPath: "~/.ssh/id_ed25519" };
    } else if (actual) {
      if (/^hostname$/i.test(clave)) actual.host = valor;
      else if (/^port$/i.test(clave)) actual.port = valor;
      else if (/^user$/i.test(clave)) actual.user = valor;
      else if (/^identityfile$/i.test(clave)) actual.keyPath = valor.replace(/^"|"$/g, "");
    }
  }
  if (actual && actual.host && !/[*?]/.test(actual.host)) salida.push(actual);
  // los hosts sin HostName usan el propio nombre como destino
  return salida.map((h) => ({ ...h, host: h.host || h.nombre }));
});

// ── utilidades de escritorio ───────────────────────────────────────────────
ipcMain.handle("dialog:key", async () => {
  const r = await dialog.showOpenDialog({
    title: "Elige tu clave privada",
    defaultPath: path.join(os.homedir(), ".ssh"),
    properties: ["openFile"],
  });
  return r.canceled ? "" : r.filePaths[0];
});

ipcMain.handle("shell:abrirConfig", () => shell.openPath(CONFIG_DIR));
