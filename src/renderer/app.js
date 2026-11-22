// Termix — interfaz: hosts en rejilla, snippets, pestañas de terminal y SFTP.
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

let hosts = [];
let snippets = [];
let filtro = "";
let sesiones = [];
let activa = null;
let sftpVisible = false;
let vista = "inicio";

const esc = (texto) =>
  String(texto ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

const humano = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const COLORES = [
  ["#f97316", "#ea580c"], ["#eab308", "#ca8a04"], ["#3b82f6", "#2563eb"],
  ["#ec4899", "#db2777"], ["#22c55e", "#16a34a"], ["#a855f7", "#9333ea"],
  ["#14b8a6", "#0d9488"], ["#ef4444", "#dc2626"],
];

function colorDe(nombre) {
  let h = 0;
  for (const c of String(nombre)) h = (h * 31 + c.charCodeAt(0)) % 9973;
  const [a, b] = COLORES[h % COLORES.length];
  return `linear-gradient(145deg, ${a}, ${b})`;
}

function estado(texto, host) {
  $("#estado-texto").textContent = texto;
  $("#estado-host").textContent = host || "";
}

// ── arranque ───────────────────────────────────────────────────────────────
(async function init() {
  conectarEventos();
  await arrancarDatos();
})();

function conectarEventos() {
  $("#buscar").addEventListener("input", (e) => {
    filtro = e.target.value.trim().toLowerCase();
    pintarHosts();
  });

  for (const boton of $$(".nav .item[data-vista]")) {
    boton.addEventListener("click", () => {
      $$(".nav .item").forEach((b) => b.classList.remove("activo"));
      boton.classList.add("activo");
      mostrarVista(boton.dataset.vista);
    });
  }
  $("#nav-tuneles").addEventListener("click", () => {
    pintarTuneles();
    $("#dlg-tuneles").showModal();
  });
  $("#nav-ajustes").addEventListener("click", () => {
    refrescarConfig();
    $("#dlg-config").showModal();
  });
  $("#nav-acerca").addEventListener("click", () => $("#dlg-acerca").showModal());
  $("#nav-local").addEventListener("click", abrirTerminalLocal);

  $("#btn-nuevo").addEventListener("click", abrirFormulario);
  $("#btn-nueva-pestana").addEventListener("click", abrirFormulario);
  $("#btn-nueva-pestana2").addEventListener("click", abrirFormulario);
  $("#btn-importar").addEventListener("click", importar);
  $("#btn-sftp").addEventListener("click", () => alternarSFTP());
  $("#sftp-cerrar").addEventListener("click", () => alternarSFTP(false));
  $("#sftp-recargar").addEventListener("click", recargarSFTP);
  $("#btn-snippet-nuevo").addEventListener("click", () => {
    $("#form-snippet").reset();
    $("#dlg-snippet").showModal();
  });
  $("#cerrar-acerca").addEventListener("click", () => $("#dlg-acerca").close());
  $("#cerrar-tuneles").addEventListener("click", () => $("#dlg-tuneles").close());
  $("#cerrar-config").addEventListener("click", () => $("#dlg-config").close());
  $("#btn-abrir-carpeta").addEventListener("click", () => window.termix.abrirConfig());

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
      e.preventDefault();
      abrirFormulario();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w" && activa) {
      e.preventDefault();
      cerrarSesion(activa);
    }
  });
}

// ── datos ──────────────────────────────────────────────────────────────────
async function arrancarDatos() {
  const v = await window.termix.vaultEstado();
  if (v.existe && !v.desbloqueado) return abrirDesbloqueo();
  await cargarTodo();
}

async function cargarTodo() {
  [hosts, snippets] = await Promise.all([
    window.termix.cargarHosts(),
    window.termix.snippetsCargar(),
  ]);
  hosts = hosts || [];
  snippets = snippets || [];
  pintarHosts();
  pintarSnippets();
}

// ── vistas ─────────────────────────────────────────────────────────────────
function mostrarVista(nombre) {
  vista = nombre;
  $("#vista-inicio").hidden = nombre !== "inicio";
  $("#vista-snippets").hidden = nombre !== "snippets";
  $("#vista-keychain").hidden = nombre !== "keychain";
  $("#vista-known").hidden = nombre !== "known";
  $("#vista-logs").hidden = nombre !== "logs";
  $("#terminales").style.display = nombre === "terminal" ? "block" : "none";
  $$(".pestana[data-vista]").forEach((t) => t.classList.toggle("activa", t.dataset.vista === nombre));
  if (nombre === "snippets") pintarSnippets();
  if (nombre === "inicio") pintarHosts();
  if (nombre === "keychain") pintarClaves();
  if (nombre === "known") pintarKnownHosts();
  if (nombre === "logs") pintarLogs();
}

function mostrarTerminal() {
  vista = "terminal";
  $("#vista-inicio").hidden = true;
  $("#vista-snippets").hidden = true;
  $("#terminales").style.display = "block";
  $$(".pestana[data-vista]").forEach((t) => t.classList.remove("activa"));
  try { activa?.fit.fit(); } catch {}
  activa?.term.focus();
}

// ── hosts en rejilla ───────────────────────────────────────────────────────
function pintarHosts() {
  const rejilla = $("#rejilla-hosts");
  const grupos = $("#rejilla-grupos");
  rejilla.innerHTML = "";
  grupos.innerHTML = "";

  const visibles = hosts.filter((h) =>
    !filtro || `${h.nombre} ${h.user} ${h.host} ${h.grupo || ""} ${h.etiquetas || ""}`.toLowerCase().includes(filtro));

  // grupos = campo `grupo` de los hosts
  const porGrupo = new Map();
  for (const h of visibles) {
    const g = (h.grupo || "").trim();
    if (!g) continue;
    porGrupo.set(g, (porGrupo.get(g) || 0) + 1);
  }
  $("#seccion-grupos").hidden = porGrupo.size === 0;
  for (const [nombre, cuantos] of porGrupo) {
    const caja = document.createElement("button");
    caja.className = "tarjeta-grupo";
    caja.innerHTML = `
      <span class="icono" style="background:${colorDe(nombre)}">▤</span>
      <span class="texto">
        <strong>${esc(nombre)}</strong>
        <small>${cuantos} host${cuantos === 1 ? "" : "s"}</small>
      </span>`;
    caja.addEventListener("click", () => {
      $("#buscar").value = nombre;
      filtro = nombre.toLowerCase();
      pintarHosts();
    });
    grupos.append(caja);
  }

  for (const host of visibles) {
    const tarjeta = document.createElement("div");
    tarjeta.className = "tarjeta-host";
    const etiquetas = (host.etiquetas || "ssh")
      .split(",").map((t) => t.trim()).filter(Boolean).slice(0, 3);
    tarjeta.innerHTML = `
      <span class="icono" style="background:${colorDe(host.nombre)}">${esc((host.nombre || "?").slice(0, 1).toUpperCase())}</span>
      <span class="texto">
        <strong>${esc(host.nombre)}</strong>
        <small>${etiquetas.map(esc).join(" · ") || "ssh"}</small>
      </span>
      <button class="borrar" title="Borrar host">×</button>`;
    tarjeta.title = `${host.user}@${host.host}:${host.port || 22}`;
    tarjeta.addEventListener("click", (e) => {
      if (e.target.classList.contains("borrar")) {
        hosts = hosts.filter((h) => h !== host);
        window.termix.guardarHosts(hosts);
        pintarHosts();
        estado(`Host «${host.nombre}» borrado`);
        return;
      }
      conectar(host);
    });
    rejilla.append(tarjeta);
  }

  $("#hosts-vacio").hidden = visibles.length > 0;
  $("#titulo-hosts").textContent = filtro ? `Hosts · «${filtro}»` : "Hosts";
}

// ── snippets en rejilla ────────────────────────────────────────────────────
function pintarSnippets() {
  const rejilla = $("#rejilla-snippets");
  rejilla.innerHTML = "";
  for (const snip of snippets) {
    const tarjeta = document.createElement("div");
    tarjeta.className = "tarjeta-host snippet";
    tarjeta.innerHTML = `
      <span class="icono" style="background:${colorDe(snip.nombre)}">›_</span>
      <span class="texto">
        <strong>${esc(snip.nombre)}</strong>
        <small class="comando">${esc(snip.texto)}</small>
      </span>
      <button class="borrar" title="Borrar snippet">×</button>`;
    tarjeta.addEventListener("click", (e) => {
      if (e.target.classList.contains("borrar")) {
        snippets = snippets.filter((s) => s !== snip);
        window.termix.snippetsGuardar(snippets);
        pintarSnippets();
        return;
      }
      if (!activa) return estado("Abre una sesión para enviar el snippet");
      window.termix.snippetEnviar(activa.id, snip.texto + "\r");
      estado(`Snippet «${snip.nombre}» enviado`);
    });
    rejilla.append(tarjeta);
  }
  $("#snippets-vacio").hidden = snippets.length > 0;
}

// ── keychain, known hosts y logs ───────────────────────────────────────────
async function pintarClaves() {
  const rejilla = $("#rejilla-claves");
  const claves = await window.termix.listarClaves();
  rejilla.innerHTML = "";
  for (const k of claves) {
    const tarjeta = document.createElement("div");
    tarjeta.className = "tarjeta-host";
    tarjeta.innerHTML = `
      <span class="icono" style="background:${colorDe(k.nombre)}">⚿</span>
      <span class="texto">
        <strong>${esc(k.nombre)}</strong>
        <small>${esc(k.tipo)} · ${esc(k.comentario || "sin comentario")}</small>
      </span>`;
    rejilla.append(tarjeta);
  }
  $("#claves-vacio").hidden = claves.length > 0;
}

async function pintarKnownHosts() {
  const rejilla = $("#rejilla-known");
  const entradas = await window.termix.listarKnownHosts();
  rejilla.innerHTML = "";
  for (const e of entradas.slice(0, 200)) {
    const tarjeta = document.createElement("div");
    tarjeta.className = "tarjeta-host";
    tarjeta.innerHTML = `
      <span class="icono" style="background:${colorDe(e.host)}">◈</span>
      <span class="texto">
        <strong>${esc(e.host)}</strong>
        <small>${esc(e.tipo)}</small>
      </span>`;
    rejilla.append(tarjeta);
  }
  $("#known-vacio").hidden = entradas.length > 0;
}

async function pintarLogs() {
  const rejilla = $("#rejilla-logs");
  const lista = await window.termix.cargarLog();
  rejilla.innerHTML = "";
  for (const l of lista.slice(0, 200)) {
    const tarjeta = document.createElement("div");
    tarjeta.className = "tarjeta-host";
    tarjeta.innerHTML = `
      <span class="icono" style="background:${colorDe(l.accion || "log")}">≡</span>
      <span class="texto">
        <strong>${esc(l.accion)}</strong>
        <small>${esc(l.detalle || "")} · ${esc(new Date(l.hora).toLocaleString("es-ES"))}</small>
      </span>`;
    rejilla.append(tarjeta);
  }
  $("#logs-vacio").hidden = lista.length > 0;
}

function anotar(accion, detalle) {
  window.termix.anotarLog({ accion, detalle: detalle || "" });
}

// ── formularios ────────────────────────────────────────────────────────────
function abrirFormulario() {
  $("#dlg-titulo").textContent = "Nuevo host";
  $("#form-host").reset();
  $("#dlg-host").showModal();
}

$("#btn-clave").addEventListener("click", async () => {
  const ruta = await window.termix.elegirClave();
  if (ruta) $("#form-host").elements.keyPath.value = ruta;
});

$("#form-host").addEventListener("submit", (evento) => {
  if (evento.submitter?.value === "cancelar") return;
  evento.preventDefault();
  const datos = Object.fromEntries(new FormData(evento.target));
  const host = { ...datos, port: Number(datos.port) || 22 };
  if (hosts.some((h) => h.nombre === host.nombre)) {
    hosts = hosts.map((h) => (h.nombre === host.nombre ? host : h));
  } else {
    hosts.push(host);
  }
  window.termix.guardarHosts(hosts);
  pintarHosts();
  $("#dlg-host").close();
  conectar(host);
});

$("#form-snippet").addEventListener("submit", (evento) => {
  if (evento.submitter?.value === "cancelar") return;
  evento.preventDefault();
  const datos = Object.fromEntries(new FormData(evento.target));
  snippets.push({ nombre: datos.nombre, texto: datos.texto });
  window.termix.snippetsGuardar(snippets);
  pintarSnippets();
  $("#dlg-snippet").close();
});

async function importar() {
  const importados = await window.termix.importarSSHConfig();
  if (!importados?.length) return estado("No encontré hosts en ~/.ssh/config");
  let nuevos = 0;
  for (const h of importados) {
    if (!hosts.some((x) => x.nombre === h.nombre)) {
      hosts.push(h);
      nuevos++;
    }
  }
  window.termix.guardarHosts(hosts);
  pintarHosts();
  estado(`${nuevos} hosts importados de ~/.ssh/config`);
}

// ── pestañas y terminales ──────────────────────────────────────────────────
function crearSesion({ titulo, host, tipo }) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const pestana = document.createElement("button");
  pestana.className = "pestana";
  pestana.innerHTML = `<span class="punto"></span>${esc(titulo)}<span class="cerrar">×</span>`;

  const contenedor = document.createElement("div");
  contenedor.className = "panel-term";

  const term = new Terminal({
    fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
    fontSize: 13.5,
    lineHeight: 1.2,
    cursorBlink: true,
    theme: {
      background: "#0b0f19", foreground: "#e7ebf3", cursor: "#3b82f6", cursorAccent: "#0b0f19",
      selectionBackground: "#3b82f655",
      black: "#1b2231", red: "#f87171", green: "#34d399", yellow: "#fbbf24",
      blue: "#3b82f6", magenta: "#c084fc", cyan: "#22d3ee", white: "#e7ebf3",
      brightBlack: "#4b5568", brightRed: "#fca5a5", brightGreen: "#6ee7b7",
      brightYellow: "#fde68a", brightBlue: "#93c5fd", brightMagenta: "#d8b4fe",
      brightCyan: "#67e8f9", brightWhite: "#ffffff",
    },
    scrollback: 10000,
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);

  $("#terminales").append(contenedor);
  $("#pestanas").append(pestana);

  const sesion = {
    id, titulo, host, tipo, term, fit, contenedor, pestana, sftpRuta: null,
    linea: "", sugerencias: [], indiceSugerencia: -1,
  };
  sesiones.push(sesion);
  activar(sesion);
  mostrarTerminal();

  term.open(contenedor);
  try { fit.fit(); } catch {}
  setTimeout(() => { try { fit.fit(); } catch {} }, 250);

  pestana.addEventListener("click", (e) => {
    if (e.target.classList.contains("cerrar")) return cerrarSesion(sesion);
    activar(sesion);
    mostrarTerminal();
  });

  window.addEventListener("resize", () => fit.fit());

  term.onData((datos) => {
    procesarTeclas(sesion, datos);
    if (sesion.tipo === "local") window.termix.escribirLocal(sesion.id, datos);
    else window.termix.escribir(sesion.id, datos);
  });
  term.onResize(({ cols, rows }) => {
    if (sesion.tipo !== "local") window.termix.redimensionar(sesion.id, cols, rows);
  });
  window.termix.onDatos(sesion.id, (datos) => term.write(datos));
  window.termix.onFin(sesion.id, () => {
    sesion.pestana.querySelector(".punto")?.classList.add("malo");
    term.writeln("\r\n\x1b[90m[sesión cerrada]\x1b[0m");
  });
  return sesion;
}

function activar(sesion) {
  activa = sesion;
  for (const s of sesiones) {
    s.pestana.classList.toggle("activa", s === sesion);
    s.contenedor.classList.toggle("visible", s === sesion);
  }
  try { sesion.fit.fit(); } catch {}
  estado("Conectado", sesion.host ? `${sesion.host.user}@${sesion.host.host}` : "terminal local");
  if (sftpVisible) recargarSFTP();
}

function cerrarSesion(sesion) {
  window.termix.cerrar(sesion.id);
  sesion.term.dispose();
  sesion.contenedor.remove();
  sesion.pestana.remove();
  sesiones = sesiones.filter((s) => s !== sesion);
  if (activa === sesion) {
    if (sesiones.length) { activar(sesiones[sesiones.length - 1]); mostrarTerminal(); }
    else {
      activa = null;
      alternarSFTP(false);
      mostrarVista("inicio");
      estado("Listo");
    }
  }
}

async function conectar(host) {
  const sesion = crearSesion({ titulo: host.nombre, host, tipo: "ssh" });
  sesion.term.writeln(`\x1b[90mConectando a ${host.user}@${host.host}:${host.port || 22}…\x1b[0m`);
  const r = await window.termix.conectar(sesion.id, host);
  if (!r.ok) {
    sesion.pestana.querySelector(".punto")?.classList.add("malo");
    sesion.term.writeln(`\x1b[31mError: ${r.error}\x1b[0m`);
    anotar("SSH error", r.error);
    estado("Error de conexión", host.nombre);
  } else { estado("Conectado", `${host.user}@${host.host}`); anotar("SSH conectado", `${host.user}@${host.host}:${host.port || 22}`); }
}

async function abrirTerminalLocal() {
  const sesion = crearSesion({ titulo: "Terminal local", host: null, tipo: "local" });
  const r = await window.termix.abrirLocal(sesion.id);
  if (!r?.ok) sesion.term.writeln(`\x1b[31mNo se pudo abrir la shell\x1b[0m`);
}

// ── autocompletado ─────────────────────────────────────────────────────────
function popupSugerencias() { return $("#sugerencias"); }

function pintarSugerencias(sesion) {
  const caja = popupSugerencias();
  if (!sesion.sugerencias.length) {
    caja.hidden = true;
    caja.innerHTML = "";
    return;
  }
  caja.innerHTML = sesion.sugerencias
    .map((s, i) => `<div class="sugerencia${i === sesion.indiceSugerencia ? " activa" : ""}">
        <code>${esc(s.texto)}</code><span>${esc(s.ayuda || "")}</span></div>`)
    .join("");
  const r = sesion.contenedor.getBoundingClientRect ? sesion.contenedor.getBoundingClientRect() : null;
  caja.hidden = false;
  if (r) {
    caja.style.left = `${Math.max(16, r.left + 12)}px`;
    caja.style.bottom = `${Math.max(40, window.innerHeight - r.bottom + 28)}px`;
  }
}

function cerrarSugerencias(sesion) {
  sesion.sugerencias = [];
  sesion.indiceSugerencia = -1;
  pintarSugerencias(sesion);
}

function aceptarSugerencia(sesion, texto) {
  const enviar = sesion.tipo === "local" ? window.termix.escribirLocal : window.termix.escribir;
  // Ctrl-U borra la línea completa (readline) y se escribe la sugerencia entera.
  enviar(sesion.id, "\x15" + texto);
  sesion.linea = texto;
  cerrarSugerencias(sesion);
}

function procesarTeclas(sesion, datos) {
  // Enter / Ctrl-C: cierra y reinicia la línea
  if (datos === "\r" || datos === "\n") {
    if (sesion.sugerencias.length && sesion.indiceSugerencia >= 0) {
      aceptarSugerencia(sesion, sesion.sugerencias[sesion.indiceSugerencia].texto);
      return;
    }
    window.TermixCompletar.anotar(sesion.linea);
    sesion.linea = "";
    cerrarSugerencias(sesion);
    return;
  }
  if (datos === "\x03") { sesion.linea = ""; cerrarSugerencias(sesion); return; }
  if (datos === "\t") {
    if (sesion.sugerencias.length) {
      const i = sesion.indiceSugerencia < 0 ? 0 : sesion.indiceSugerencia;
      aceptarSugerencia(sesion, sesion.sugerencias[i].texto);
    }
    return;
  }
  if (datos === "\x1b") { cerrarSugerencias(sesion); return; }
  if (datos === "\x1b[A" || datos === "\x1b[B") {
    if (!sesion.sugerencias.length) return;
    const delta = datos === "\x1b[A" ? -1 : 1;
    sesion.indiceSugerencia =
      (sesion.indiceSugerencia + delta + sesion.sugerencias.length) % sesion.sugerencias.length;
    pintarSugerencias(sesion);
    return;
  }
  if (datos === "\x7f") {
    sesion.linea = sesion.linea.slice(0, -1);
  } else if (datos.length === 1 && datos >= " ") {
    sesion.linea += datos;
  } else {
    return; // flechas, tabuladores, control: no tocan el texto
  }
  sesion.sugerencias = window.TermixCompletar.sugerencias(sesion.linea);
  sesion.indiceSugerencia = sesion.sugerencias.length ? 0 : -1;
  pintarSugerencias(sesion);
}

// ── SFTP ───────────────────────────────────────────────────────────────────
function alternarSFTP(mostrar = !sftpVisible) {
  sftpVisible = mostrar;
  $("#panel-sftp").classList.toggle("visible", mostrar);
  $("#btn-sftp").classList.toggle("activo", mostrar);
  if (mostrar) recargarSFTP();
}

async function recargarSFTP() {
  if (!activa || activa.tipo !== "ssh") {
    $("#sftp-lista").innerHTML = '<li class="vacio-lista">Conecta a un host para ver sus archivos.</li>';
    $("#sftp-estado").textContent = "sin sesión SSH";
    return;
  }
  if (!activa.sftpRuta) activa.sftpRuta = await window.termix.sftpInicio(activa.id);
  const r = await window.termix.sftpListar(activa.id, activa.sftpRuta);
  if (!r.ok) {
    $("#sftp-lista").innerHTML = `<li class="vacio-lista">${esc(r.error)}</li>`;
    return;
  }
  activa.sftpRuta = r.ruta;
  $("#sftp-ruta").value = r.ruta;
  const lista = $("#sftp-lista");
  lista.innerHTML = "";
  for (const e of r.entradas) {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="icono">${e.directorio ? "🗀" : "🗎"}</span>
      <span class="nombre" title="${esc(e.nombre)}">${esc(e.nombre)}</span>
      <span class="meta">${e.directorio ? "dir" : humano(e.tamano)}</span>
      <span class="ops">
        <button data-op="bajar" title="Descargar">⤓</button>
        <button data-op="renombrar" title="Renombrar">✎</button>
        <button data-op="borrar" title="Borrar">×</button>
      </span>`;
    li.addEventListener("click", async (ev) => {
      const op = ev.target.dataset?.op;
      const ruta = `${r.ruta.replace(/\/$/, "")}/${e.nombre}`;
      if (!op) {
        if (e.directorio) { activa.sftpRuta = ruta; recargarSFTP(); }
        return;
      }
      if (op === "bajar") {
        const d = await window.termix.sftpDescargar(activa.id, ruta);
        if (d.ok) estado(`Descargado ${e.nombre}`, d.ruta);
        else if (!d.cancelado) estado(`Error: ${d.error}`);
      } else if (op === "borrar" && !e.directorio) {
        await window.termix.sftpAccion(activa.id, "borrar", ruta);
        recargarSFTP();
      } else if (op === "renombrar") {
        const nuevo = prompt("Nuevo nombre:", e.nombre);
        if (nuevo && nuevo !== e.nombre) {
          await window.termix.sftpAccion(activa.id, "renombrar", ruta, `${r.ruta.replace(/\/$/, "")}/${nuevo}`);
          recargarSFTP();
        }
      }
    });
    lista.append(li);
  }
  $("#sftp-estado").textContent = `${r.entradas.length} elementos`;
}

$("#sftp-arriba").addEventListener("click", () => {
  if (!activa) return;
  activa.sftpRuta = activa.sftpRuta.replace(/\/[^/]+\/?$/, "") || "/";
  recargarSFTP();
});
$("#sftp-ruta").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && activa) {
    activa.sftpRuta = e.target.value.trim();
    recargarSFTP();
  }
});
$("#sftp-subir").addEventListener("click", async () => {
  if (!activa) return;
  const r = await window.termix.sftpSubir(activa.id, activa.sftpRuta);
  if (r.ok) { estado("Archivos subidos"); recargarSFTP(); }
  else if (!r.cancelado) estado(`Error al subir: ${(r.fallos || [r.error]).join("; ")}`);
});
$("#sftp-carpeta").addEventListener("click", async () => {
  if (!activa) return;
  const nombre = prompt("Nombre de la carpeta:");
  if (!nombre) return;
  await window.termix.sftpAccion(activa.id, "mkdir", `${activa.sftpRuta.replace(/\/$/, "")}/${nombre}`);
  recargarSFTP();
});

// ── túneles ────────────────────────────────────────────────────────────────
async function pintarTuneles() {
  const lista = $("#lista-tuneles");
  lista.innerHTML = "";
  if (!activa || activa.tipo !== "ssh") {
    lista.innerHTML = '<li class="vacio-lista">Conecta a un host primero.</li>';
    return;
  }
  const reglas = await window.termix.forwardListar(activa.id);
  if (!reglas.length) {
    lista.innerHTML = '<li class="vacio-lista">Sin reenvíos activos.</li>';
    return;
  }
  for (const r of reglas) {
    const li = document.createElement("li");
    li.innerHTML = `<code>127.0.0.1:${r.puertoLocal}</code> → ${esc(r.destino)}:${r.puertoDestino}
      <button class="borrar" data-p="${r.puertoLocal}">×</button>`;
    li.querySelector("button").addEventListener("click", async (e) => {
      await window.termix.forwardCerrar(activa.id, Number(e.target.dataset.p));
      pintarTuneles();
    });
    lista.append(li);
  }
}

$("#form-tunel").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  if (!activa) return estado("Conecta a un host primero");
  const datos = Object.fromEntries(new FormData(evento.target));
  const r = await window.termix.forwardAbrir(activa.id, {
    puertoLocal: Number(datos.puertoLocal),
    destino: datos.destino,
    puertoDestino: Number(datos.puertoDestino),
  });
  if (!r.ok) estado(`Túnel: ${r.error}`);
  pintarTuneles();
});

// ── vault ──────────────────────────────────────────────────────────────────
function abrirDesbloqueo() {
  $("#vault-error").textContent = "";
  $("#form-vault").reset();
  $("#dlg-vault").showModal();
  setTimeout(() => $("#form-vault").elements.clave.focus(), 100);
}

$("#form-vault").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const clave = evento.target.elements.clave.value;
  const r = await window.termix.vaultDesbloquear(clave);
  if (!r.ok) {
    $("#vault-error").textContent = r.error || "No se pudo desbloquear";
    return;
  }
  hosts = r.hosts || [];
  snippets = r.snippets || [];
  pintarHosts();
  pintarSnippets();
  $("#dlg-vault").close();
  estado("Vault desbloqueado");
});

function refrescarConfig() {
  window.termix.vaultEstado().then((v) => {
    $("#cfg-sin-vault").hidden = v.existe;
    $("#cfg-con-vault").hidden = !v.existe;
    $("#cfg-error").textContent = "";
    $("#cfg-error2").textContent = "";
  });
}

$("#btn-vault-crear").addEventListener("click", async () => {
  const c1 = $("#cfg-clave1").value;
  const c2 = $("#cfg-clave2").value;
  if (c1.length < 6) return ($("#cfg-error").textContent = "Usa al menos 6 caracteres");
  if (c1 !== c2) return ($("#cfg-error").textContent = "Las contraseñas no coinciden");
  const r = await window.termix.vaultActivar(c1);
  if (!r.ok) return ($("#cfg-error").textContent = r.error || "No se pudo cifrar");
  $("#dlg-config").close();
  estado("Vault cifrado con contraseña maestra");
});

$("#btn-vault-cambiar").addEventListener("click", async () => {
  const actual = $("#cfg-actual").value;
  const nueva = $("#cfg-nueva").value;
  if (nueva.length < 6) return ($("#cfg-error2").textContent = "La nueva debe tener 6+ caracteres");
  const r = await window.termix.vaultCambiarClave(actual, nueva);
  if (!r.ok) return ($("#cfg-error2").textContent = r.error || "Error");
  $("#dlg-config").close();
  estado("Contraseña maestra cambiada");
});

$("#btn-vault-quitar").addEventListener("click", async () => {
  if (!confirm("¿Quitar el cifrado? Los datos quedarán en claro en tu equipo.")) return;
  const r = await window.termix.vaultDesactivar($("#cfg-actual").value);
  if (!r.ok) return ($("#cfg-error2").textContent = r.error || "Error");
  $("#dlg-config").close();
  estado("Cifrado desactivado");
});

// pestaña fija de inicio
$('.pestana[data-vista="inicio"]').addEventListener("click", () => {
  $$(".pestana").forEach((t) => t.classList.remove("activa"));
  $('.pestana[data-vista="inicio"]').classList.add("activa");
  mostrarVista("inicio");
});
