// Termix — interfaz. Sin frameworks: DOM + xterm.js. Todo en español.
const $ = (sel) => document.querySelector(sel);

let hosts = [];
let sesiones = []; // { id, titulo, host, term, fit, contenedor, pestana }
let activa = null;

// ── arranque ───────────────────────────────────────────────────────────────
(async function init() {
  hosts = (await window.termix.cargarHosts()) || [];
  pintarHosts();
})();

// ── hosts ──────────────────────────────────────────────────────────────────
function pintarHosts() {
  const lista = $("#lista-hosts");
  lista.innerHTML = "";
  for (const host of hosts) {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="nombre" title="${esc(host.nombre)}">${esc(host.nombre)}</span>
      <span class="destino">${esc(host.user)}@${esc(host.host)}</span>
      <button class="borrar" title="Borrar">×</button>`;
    li.addEventListener("click", (e) => {
      if (e.target.classList.contains("borrar")) {
        hosts = hosts.filter((h) => h !== host);
        window.termix.guardarHosts(hosts);
        pintarHosts();
        return;
      }
      conectar(host);
    });
    lista.append(li);
  }
}

function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ── formulario de host ─────────────────────────────────────────────────────
const dlg = $("#dlg-host");
let editando = null;

$("#btn-nuevo").addEventListener("click", () => {
  editando = null;
  $("#dlg-titulo").textContent = "Nuevo host";
  $("#form-host").reset();
  dlg.showModal();
});

$("#btn-clave").addEventListener("click", async () => {
  const ruta = await window.termix.elegirClave();
  if (ruta) $("#form-host").elements.keyPath.value = ruta;
});

$("#form-host").addEventListener("submit", (evento) => {
  if (evento.submitter?.value === "cancelar") return;
  evento.preventDefault();
  const datos = Object.fromEntries(new FormData(evento.target));
  if (editando) Object.assign(editando, datos);
  else hosts.push({ ...datos, port: Number(datos.port) || 22 });
  window.termix.guardarHosts(hosts);
  pintarHosts();
  dlg.close();
});

// ── pestañas y terminales ──────────────────────────────────────────────────
function crearPestana(host) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const pestana = document.createElement("div");
  pestana.className = "pestana";
  pestana.innerHTML = `<span class="punto"></span><span>${esc(host.nombre)}</span><button class="cerrar">×</button>`;

  const contenedor = document.createElement("div");
  contenedor.className = "panel-term";

  const term = new Terminal({
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    fontSize: 13,
    theme: {
      background: "#0b0e13",
      foreground: "#e6e9ef",
      cursor: "#2f81f7",
      selectionBackground: "#2f81f755",
    },
    scrollback: 5000,
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);

  $("#terminales").append(contenedor);
  $("#pestanas").append(pestana);

  const sesion = { id, titulo: host.nombre, host, term, fit, contenedor, pestana };
  sesiones.push(sesion);
  activar(sesion);

  // xterm se abre cuando el contenedor ya tiene tamaño y está visible
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
    }
  }
}

// ── conexión ───────────────────────────────────────────────────────────────
async function conectar(host) {
  const sesion = crearPestana(host);
  const { term } = sesion;
  term.writeln(`\x1b[90mConectando a ${host.user}@${host.host}:${host.port || 22}…\x1b[0m`);
  try { sesion.fit.fit(); } catch {}

  window.termix.onDatos(sesion.id, (datos) => term.write(datos));
  window.termix.onFin(sesion.id, () => {
    sesion.pestana.querySelector(".punto")?.classList.add("malo");
    term.writeln("\r\n\x1b[90m[sesión cerrada]\x1b[0m");
  });

  term.onData((datos) => window.termix.escribir(sesion.id, datos));
  term.onResize(({ cols, rows }) => window.termix.redimensionar(sesion.id, cols, rows));

  const resultado = await window.termix.conectar(sesion.id, host);
  if (!resultado.ok) {
    sesion.pestana.querySelector(".punto")?.classList.add("malo");
    term.writeln(`\x1b[31mError: ${resultado.error}\x1b[0m`);
  }
}

// ── pie ────────────────────────────────────────────────────────────────────
$("#btn-config").addEventListener("click", () => window.termix.abrirConfig());
