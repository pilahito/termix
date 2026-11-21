// Termix — interfaz (sin frameworks): hosts, snippets, pestañas, terminales y SFTP.
const $ = (sel) => document.querySelector(sel);

let hosts = [];
let snippets = [];
let filtro = "";
let sesiones = [];
let activa = null;
let sftpVisible = false;

const esc = (texto) =>
  String(texto ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

const humano = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

function estado(texto, host) {
  $("#estado-texto").textContent = texto;
  $("#estado-host").textContent = host || "";
}

// ── arranque ───────────────────────────────────────────────────────────────
(async function init() {
  [hosts, snippets] = await Promise.all([
    window.termix.cargarHosts(),
    window.termix.snippetsCargar(),
  ]);
  hosts = hosts || [];
  snippets = snippets || [];
  pintarHosts();
  pintarSnippets();

  $("#buscar").addEventListener("input", (e) => {
    filtro = e.target.value.trim().toLowerCase();
    pintarHosts();
  });
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
})();

// ── hosts ──────────────────────────────────────────────────────────────────
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

// ── snippets ───────────────────────────────────────────────────────────────
function pintarSnippets() {
  const lista = $("#lista-snippets");
  lista.innerHTML = "";
  if (!snippets.length) {
    const vacio = document.createElement("li");
    vacio.className = "vacio-lista";
    vacio.textContent = "Ninguno. Pulsa + para crear uno.";
    lista.append(vacio);
    return;
  }
  for (const snip of snippets) {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="avatar snippet">›_</span>
      <span class="datos">
        <span class="nombre">${esc(snip.nombre)}</span>
        <span class="destino">${esc(snip.texto)}</span>
      </span>
      <button class="borrar" title="Borrar snippet">×</button>`;
    li.title = snip.texto;
    li.addEventListener("click", (e) => {
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
    lista.append(li);
  }
}

$("#btn-snippet-nuevo").addEventListener("click", () => {
  $("#form-snippet").reset();
  $("#dlg-snippet").showModal();
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

// ── formulario de host ─────────────────────────────────────────────────────
const dlg = $("#dlg-host");

function abrirFormulario() {
  $("#dlg-titulo").textContent = "Nueva conexión";
  $("#form-host").reset();
  dlg.showModal();
}

$("#btn-nuevo").addEventListener("click", abrirFormulario);
$("#hero-nuevo").addEventListener("click", abrirFormulario);
$("#btn-nueva-pestana").addEventListener("click", abrirFormulario);

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
$("#btn-acerca").addEventListener("click", () => $("#dlg-acerca").showModal());
$("#cerrar-acerca").addEventListener("click", () => $("#dlg-acerca").close());

// ── pestañas ───────────────────────────────────────────────────────────────
function crearSesion({ titulo, host, tipo }) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const pestana = document.createElement("div");
  pestana.className = "pestana";
  pestana.innerHTML = `<span class="punto"></span><span>${esc(titulo)}</span><button class="cerrar">×</button>`;

  const contenedor = document.createElement("div");
  contenedor.className = "panel-term";

  const term = new Terminal({
    fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
    fontSize: 13.5,
    lineHeight: 1.2,
    cursorBlink: true,
    theme: {
      background: "#06080d", foreground: "#e7ebf3", cursor: "#3b82f6", cursorAccent: "#06080d",
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

  const sesion = { id, titulo, host, tipo, term, fit, contenedor, pestana, sftpRuta: null };
  sesiones.push(sesion);
  activar(sesion);

  term.open(contenedor);
  try { fit.fit(); } catch {}
  setTimeout(() => { try { fit.fit(); } catch {} }, 250);

  pestana.addEventListener("click", (e) => {
    if (e.target.classList.contains("cerrar")) return cerrarSesion(sesion);
    activar(sesion);
  });

  window.addEventListener("resize", () => fit.fit());

  term.onData((datos) => {
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
  $("#bienvenida").style.display = sesiones.length ? "none" : "grid";
  try { sesion.fit.fit(); } catch {}
  sesion.term.focus();
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
    if (sesiones.length) activar(sesiones[sesiones.length - 1]);
    else {
      activa = null;
      $("#bienvenida").style.display = "grid";
      estado("Listo");
      alternarSFTP(false);
    }
  }
}

// ── conexión SSH ───────────────────────────────────────────────────────────
async function conectar(host) {
  const sesion = crearSesion({ titulo: host.nombre, host, tipo: "ssh" });
  const { term } = sesion;
  estado(`Conectando a ${host.nombre}…`, `${host.user}@${host.host}`);
  term.writeln(`\x1b[90mConectando a ${host.user}@${host.host}:${host.port || 22}…\x1b[0m`);

  const resultado = await window.termix.conectar(sesion.id, host);
  if (!resultado.ok) {
    sesion.pestana.querySelector(".punto")?.classList.add("malo");
    term.writeln(`\x1b[31mError: ${resultado.error}\x1b[0m`);
    estado("Error de conexión", host.nombre);
  } else {
    estado("Conectado", `${host.user}@${host.host}`);
  }
}

// ── terminal local ─────────────────────────────────────────────────────────
$("#btn-local").addEventListener("click", async () => {
  const sesion = crearSesion({ titulo: "Terminal local", host: null, tipo: "local" });
  const r = await window.termix.abrirLocal(sesion.id);
  if (!r?.ok) sesion.term.writeln(`\x1b[31mNo se pudo abrir la shell: ${r?.error || "?"}\x1b[0m`);
});

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
    const icono = e.directorio ? "🗀" : "🗎";
    li.innerHTML = `
      <span class="icono">${icono}</span>
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
      } else if (op === "borrar") {
        if (!e.directorio) {
          await window.termix.sftpAccion(activa.id, "borrar", ruta);
          recargarSFTP();
        }
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

$("#btn-sftp").addEventListener("click", () => alternarSFTP());
$("#sftp-cerrar").addEventListener("click", () => alternarSFTP(false));
$("#sftp-recargar").addEventListener("click", recargarSFTP);
$("#sftp-arriba").addEventListener("click", () => {
  if (!activa) return;
  activa.sftpRuta = activa.sftpRuta.replace(/\/[^/]+\/?$/, "") || "/";
  recargarSFTP();
});
$("#sftp-ruta").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
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
    lista.innerHTML = '<li class="vacio-lista">Sin túneles activos.</li>';
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

$("#btn-tuneles").addEventListener("click", () => {
  pintarTuneles();
  $("#dlg-tuneles").showModal();
});
$("#cerrar-tuneles").addEventListener("click", () => $("#dlg-tuneles").close());

$("#form-tunel").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  if (!activa) return;
  const datos = Object.fromEntries(new FormData(evento.target));
  const regla = {
    puertoLocal: Number(datos.puertoLocal),
    destino: datos.destino,
    puertoDestino: Number(datos.puertoDestino),
  };
  const r = await window.termix.forwardAbrir(activa.id, regla);
  if (!r.ok) estado(`Túnel: ${r.error}`);
  pintarTuneles();
});
