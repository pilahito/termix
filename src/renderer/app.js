// Termix — interfaz (sin frameworks): hosts, pestañas y terminales xterm.
const $ = (sel) => document.querySelector(sel);

let hosts = [];
let filtro = "";
let sesiones = [];
let activa = null;

// ── arranque ───────────────────────────────────────────────────────────────
(async function init() {
  hosts = (await window.termix.cargarHosts()) || [];
  pintarHosts();
  $("#buscar").addEventListener("input", (e) => {
    filtro = e.target.value.trim().toLowerCase();
    pintarHosts();
  });
})();

// ── lista de hosts ─────────────────────────────────────────────────────────
function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function pintarHosts() {
  const lista = $("#lista-hosts");
  lista.innerHTML = "";
  const visibles = hosts.filter((h) =>
    !filtro || `${h.nombre} ${h.user} ${h.host}`.toLowerCase().includes(filtro));

  if (!visibles.length) {
    const vacio = document.createElement("li");
    vacio.className = "vacio-lista";
    vacio.textContent = hosts.length ? "Ningún host coincide." : "Aún no hay hosts. Pulsa + para añadir uno.";
    lista.append(vacio);
    return;
  }

  for (const host of visibles) {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="avatar">${esc((host.nombre || "?").slice(0, 2).toUpperCase())}</span>
      <span class="datos">
        <span class="nombre">${esc(host.nombre)}</span>
        <span class="destino">${esc(host.user)}@${esc(host.host)}:${esc(host.port || 22)}</span>
      </span>
      <button class="borrar" title="Borrar host">×</button>`;

    li.addEventListener("click", (e) => {
      if (e.target.classList.contains("borrar")) {
        hosts = hosts.filter((h) => h !== host);
        window.termix.guardarHosts(hosts);
        pintarHosts();
        estado(`Host «${host.nombre}» borrado`);
        return;
      }
      conectar(host);
    });
    lista.append(li);
  }
}

function estado(texto, host) {
  $("#estado-texto").textContent = texto;
  $("#estado-host").textContent = host || "";
}

// ── formulario ─────────────────────────────────────────────────────────────
const dlg = $("#dlg-host");

function abrirFormulario() {
  $("#dlg-titulo").textContent = "Nueva conexión";
  $("#form-host").reset();
  dlg.showModal();
}

$("#btn-nuevo").addEventListener("click", abrirFormulario);
$("#hero-nuevo").addEventListener("click", abrirFormulario);
$("#btn-nueva-pestana").addEventListener("click", abrirFormulario);
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
    e.preventDefault();
    abrirFormulario();
  }
});

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
  dlg.close();
  conectar(host);
});

// ── importar ~/.ssh/config ─────────────────────────────────────────────────
async function importar() {
  const importados = await window.termix.importarSSHConfig();
  if (!importados?.length) {
    estado("No encontré hosts en ~/.ssh/config");
    return;
  }
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

$("#btn-importar").addEventListener("click", importar);
$("#hero-importar").addEventListener("click", importar);

// ── acercar de ─────────────────────────────────────────────────────────────
$("#btn-acerca").addEventListener("click", () => $("#dlg-acerca").showModal());
$("#cerrar-acerca").addEventListener("click", () => $("#dlg-acerca").close());

// ── pestañas y terminales ──────────────────────────────────────────────────
function crearPestana(host) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const pestana = document.createElement("div");
  pestana.className = "pestana";
  pestana.innerHTML = `<span class="punto"></span><span>${esc(host.nombre)}</span><button class="cerrar">×</button>`;

  const contenedor = document.createElement("div");
  contenedor.className = "panel-term";

  const term = new Terminal({
    fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
    fontSize: 13.5,
    lineHeight: 1.2,
    cursorBlink: true,
    theme: {
      background: "#06080d",
      foreground: "#e7ebf3",
      cursor: "#3b82f6",
      cursorAccent: "#06080d",
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

  const sesion = { id, titulo: host.nombre, host, term, fit, contenedor, pestana };
  sesiones.push(sesion);
  activar(sesion);

  term.open(contenedor);
  try { fit.fit(); } catch {}
  setTimeout(() => { try { fit.fit(); } catch {} }, 250);

  pestana.addEventListener("click", (e) => {
    if (e.target.classList.contains("cerrar")) {
      cerrarSesion(sesion);
      return;
    }
    activar(sesion);
  });

  window.addEventListener("resize", () => fit.fit());
  return sesion;
}

function activar(sesion) {
  activa = sesion;
  for (const s of sesiones) {
    s.pestana.classList.toggle("activa", s === sesion);
    s.contenedor.classList.toggle("visible", s === sesion);
  }
  $("#bienvenida").style.display = sesiones.length ? "none" : "grid";
  try { sesion.fit.fit(); } catch {}
  sesion.term.focus();
  estado("Conectado", `${sesion.host.user}@${sesion.host.host}`);
}

function cerrarSesion(sesion) {
  window.termix.cerrar(sesion.id);
  sesion.term.dispose();
  sesion.contenedor.remove();
  sesion.pestana.remove();
  sesiones = sesiones.filter((s) => s !== sesion);
  if (activa === sesion) {
    if (sesiones.length) activar(sesiones[sesiones.length - 1]);
    else {
      activa = null;
      $("#bienvenida").style.display = "grid";
      estado("Listo");
    }
  }
}

// ── conexión ───────────────────────────────────────────────────────────────
async function conectar(host) {
  const sesion = crearPestana(host);
  const { term } = sesion;
  estado(`Conectando a ${host.nombre}…`, `${host.user}@${host.host}`);
  term.writeln(`\x1b[90mConectando a ${host.user}@${host.host}:${host.port || 22}…\x1b[0m`);

  window.termix.onDatos(sesion.id, (datos) => term.write(datos));
  window.termix.onFin(sesion.id, () => {
    sesion.pestana.querySelector(".punto")?.classList.add("malo");
    term.writeln("\r\n\x1b[90m[sesión cerrada]\x1b[0m");
    estado("Sesión cerrada", host.nombre);
  });

  term.onData((datos) => window.termix.escribir(sesion.id, datos));
  term.onResize(({ cols, rows }) => window.termix.redimensionar(sesion.id, cols, rows));

  const resultado = await window.termix.conectar(sesion.id, host);
  if (!resultado.ok) {
    sesion.pestana.querySelector(".punto")?.classList.add("malo");
    term.writeln(`\x1b[31mError: ${resultado.error}\x1b[0m`);
    estado("Error de conexión", host.nombre);
  } else {
    estado("Conectado", `${host.user}@${host.host}`);
  }
}

// ── pie ────────────────────────────────────────────────────────────────────
$("#btn-config").addEventListener("click", () => window.termix.abrirConfig());
