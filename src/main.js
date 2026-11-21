// Termix — proceso principal de Electron.
// Cliente SSH open source: gestiona las conexiones con ssh2 y manda los datos
// al renderer (xterm.js). No hay nube, ni cuentas, ni telemetría.
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { Client } = require("ssh2");

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
    width: 1180,
    height: 780,
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
