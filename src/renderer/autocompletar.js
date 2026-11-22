// Termix — autocompletado por herramienta (clean-room, specs propias).
// Cada spec describe una orden y sus subórdenes más usadas con una ayuda corta.
window.TermixCompletar = (() => {
  const SPECS = {
    git: {
      ayuda: "control de versiones",
      sub: {
        status: "estado del árbol", add: "preparar cambios", commit: "crear un commit",
        push: "subir al remoto", pull: "traer del remoto", fetch: "actualizar referencias",
        log: "historial", diff: "cambios", checkout: "cambiar de rama/fichero",
        switch: "cambiar de rama", branch: "ramas", merge: "fusionar", rebase: "reordenar commits",
        stash: "guardar cambios aparte", remote: "remotos", clone: "clonar",
        tag: "etiquetas", reset: "deshacer", restore: "restaurar ficheros",
        worktree: "árboles de trabajo", show: "mostrar objeto", blame: "autoría por línea",
      },
    },
    docker: {
      ayuda: "contenedores",
      sub: {
        ps: "contenedores", images: "imágenes", run: "ejecutar", exec: "entrar a un contenedor",
        logs: "ver logs", pull: "descargar imagen", push: "subir imagen", build: "construir imagen",
        compose: "docker compose", rm: "borrar contenedor", stop: "parar", start: "arrancar",
        restart: "reiniciar", stats: "consumo", inspect: "metadatos", volume: "volúmenes",
        network: "redes", system: "mantenimiento", cp: "copiar ficheros",
      },
    },
    systemctl: {
      ayuda: "servicios systemd",
      sub: {
        status: "estado", start: "arrancar", stop: "parar", restart: "reiniciar",
        reload: "recargar", enable: "activar al inicio", disable: "desactivar al inicio",
        "daemon-reload": "recargar unidades", "list-units": "unidades activas",
        "list-unit-files": "unidades instaladas", "is-active": "¿activo?", "is-enabled": "¿habilitado?",
        "status": "estado", mask: "enmascarar", unmask: "desenmascarar",
      },
    },
    journalctl: {
      ayuda: "logs de systemd",
      sub: {
        "-u": "filtrar por unidad", "-f": "seguir en vivo", "-n": "últimas N líneas",
        "-b": "arranque actual", "--since": "desde fecha", "--until": "hasta fecha",
        "-xe": "errores extendidos", "--no-pager": "sin paginador", "-p": "prioridad",
        "--disk-usage": "espacio usado", "--vacuum-time": "limpiar por tiempo",
      },
    },
    pacman: {
      ayuda: "paquetes Arch",
      sub: {
        "-S": "instalar", "-Syu": "actualizar sistema", "-Ss": "buscar", "-Si": "info",
        "-R": "quitar", "-Rns": "quitar con dependencias", "-Q": "instalados",
        "-Qe": "instalados explícitos", "-Sc": "limpiar caché", "-F": "buscar en ficheros",
        "-U": "instalar paquete local",
      },
    },
    apt: {
      ayuda: "paquetes Debian",
      sub: {
        install: "instalar", update: "actualizar índices", upgrade: "actualizar paquetes",
        remove: "quitar", purge: "quitar con configuración", search: "buscar", show: "info",
        list: "listar", autoremove: "quitar huérfanos", "full-upgrade": "actualización completa",
      },
    },
    ssh: {
      ayuda: "conexión SSH",
      sub: {
        "-p": "puerto", "-i": "clave", "-L": "túnel local", "-R": "túnel remoto",
        "-D": "SOCKS dinámico", "-N": "sin orden remota", "-f": "a segundo plano",
        "-v": "modo depuración", "-J": "host de salto", "user@host": "destino",
      },
    },
    tar: {
      ayuda: "archivos tar",
      sub: {
        "-czf": "crear .tar.gz", "-xzf": "extraer .tar.gz", "-cjf": "crear .tar.bz2",
        "-xjf": "extraer .tar.bz2", "-tf": "listar contenido", "-C": "cambiar directorio",
      },
    },
  };

  const HISTORIAL = []; // órdenes usadas en esta sesión de la app

  function anotar(texto) {
    const limpia = texto.trim();
    if (limpia.length < 2) return;
    const i = HISTORIAL.indexOf(limpia);
    if (i >= 0) HISTORIAL.splice(i, 1);
    HISTORIAL.unshift(limpia);
    if (HISTORIAL.length > 200) HISTORIAL.pop();
  }

  // Devuelve [{texto, ayuda}] a partir de la línea actual del terminal.
  function sugerencias(linea) {
    const texto = linea.trimStart();
    if (!texto) return [];
    const trozos = texto.split(/\s+/);
    const orden = trozos[0];

    // 1. Completar el nombre de la orden
    if (trozos.length === 1 && !linea.endsWith(" ")) {
      const salida = [];
      for (const nombre of Object.keys(SPECS)) {
        if (nombre.startsWith(orden)) salida.push({ texto: nombre, ayuda: SPECS[nombre].ayuda });
      }
      for (const h of HISTORIAL) {
        if (h.startsWith(orden) && !salida.some((s) => s.texto === h)) {
          salida.push({ texto: h, ayuda: "historial" });
        }
      }
      return salida.slice(0, 6);
    }

    // 2. Completar suborden
    const spec = SPECS[orden];
    const parcial = trozos[1] || "";
    if (spec && trozos.length <= 2) {
      return Object.entries(spec.sub)
        .filter(([clave]) => clave.startsWith(parcial))
        .map(([clave, ayuda]) => ({ texto: `${orden} ${clave}`, ayuda }))
        .slice(0, 6);
    }
    return [];
  }

  return { SPECS, sugerencias, anotar, HISTORIAL };
})();
