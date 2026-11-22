# Análisis REA de Termius (clean-room)

Este documento recoge el análisis estático del cliente Termius con la herramienta
[REA](https://github.com/morluto/rea) (`rea-agents@6.7.0`,
`analyze-javascript-application`). Sirve para dos cosas:

1. Saber **qué características** ofrece el cliente de referencia.
2. Decidir qué merece la pena implementar en Termix **con código propio**.

> **Aviso:** Termius es software propietario. Aquí solo se publican *observaciones
> estructurales* del artefacto (recuentos, nombres de rasgos, identificadores de
> evidencia). No se copia ni se redistribuye código, recursos ni binarios de Termius.

## Artefacto analizado

| Dato | Valor |
|---|---|
| Objetivo | bundle de UI (proceso `ui-process`) del `.deb` 10.4.1 |
| SHA-256 (árbol) | `dd2347005f652a5ce53ec47661cdb901aba3a097c96a9bfdc89bc610b2619122` |
| Tamaño | 3,58 MB de JavaScript (un solo fichero empaquetado) |
| Evidencia | `ev_9a08894f3fe00a79c543f20c71124c605b3dd9c2c74d932c3eec88bd1003beb6` |

### Estadísticas del grafo (observado)

```json
{"relevant_files":1,"parsed_javascript_files":1,"parse_failures":0,
 "text_bytes_read":3579526,"visited_ast_nodes":518932,
 "findings":2248,"modules":45}
```

- 759 nodos de grafo: 737 módulos JavaScript, 13 endpoints, 5 *chunks*, 1 *storage*.
- **Storage observado:** `local-storage` con la clave `deviceToken` (token de dispositivo).
- **Rutas observadas:** `/` y `signaling` (sala de señalización para terminal compartida).
- **IPC / preload:** 0 operaciones en este bundle → el puente vive en el proceso
  principal, que **no se pudo analizar** (fichero marcado como *skipped*, 0 nodos).
  Se declara como **desconocido**, no como ausencia.

### Limitaciones declaradas por la herramienta

- Análisis **estático**: el código no se ejecutó.
- Cobertura del grafo incompleta; lo ausente no prueba que no exista.
- Los endpoints detectados son candidatos sintácticos, no pruebas de tráfico.

## Inventario de rasgos (recuento de menciones en el bundle)

| Rasgo | Menciones |
|---|---|
| Autocomplete | 726 |
| Workspace | 473 |
| Vault | 361 |
| Logs | 188 |
| SFTP | 149 |
| Snippets | 189 |
| Serial | 124 |
| Telnet | 92 |
| Mosh | 72 |
| Keychain / Identity | 46 / 152 |
| Port forwarding | 36 |
| Known hosts | 26 |
| Groups | 118 |
| Tags | 20 |
| XTerm | 51 |

**Inferencia:** la interfaz es una SPA (probablemente React) servida dentro de
Electron, con Vault como pantalla principal y módulos separados para SFTP,
snippets, reenvío de puertos, keychain, known hosts, logs, serial, telnet y mosh.

## Termix frente a ese inventario

| Rasgo | Termius | Termix |
|---|---|---|
| Vault con grupos y hosts | ✅ | ✅ (0.4) |
| Buscador de hosts | ✅ | ✅ |
| Pestañas de terminal | ✅ | ✅ |
| SFTP | ✅ | ✅ |
| Reenvío de puertos local | ✅ | ✅ (`-L`) |
| Snippets | ✅ | ✅ |
| Keychain (claves SSH) | ✅ | ✅ (0.5, lista `~/.ssh/*.pub`) |
| Known hosts | ✅ | ✅ (0.5, lee `~/.ssh/known_hosts`) |
| Logs de actividad | ✅ | ✅ (0.5, local) |
| Vault cifrado con contraseña maestra | ✅ | ✅ |
| Serial / Telnet / Mosh | ✅ | ❌ (fuera del alcance SSH) |
| Autocomplete de comandos | ✅ | ❌ pendiente |
| Sincronización en la nube | ✅ | ❌ **por diseño** (sin nube) |
| Reenvío remoto / dinámico (SOCKS) | ✅ | ❌ pendiente |

## Sesión MCP (no solo CLI)

El análisis se hizo contra el **servidor MCP de REA** (`rea --mcp`, versión 6.7.0),
no solo con el comando de un solo uso:

```
initialize → serverInfo {name: "rea", version: "6.7.0"}
tools/list → 207 herramientas
tools/call analyze_javascript_application  → resource_constraint (respuesta > presupuesto stdio)
                                            pero el registro queda RETENIDO
tools/call get_evidence_bundle (summary)   → 1 registro, retention: complete-record
tools/call inspect_analysis_view            → página de módulos y resumen
```

- Registro retenido: `ev_9a08894f3fe00a79c543f20c71124c605b3dd9c2c74d932c3eec88bd1003beb6`
  (`retention: complete-record`, `authority: shipped-artifact`, `confidence: derived`)
- `inspect_analysis_view` → `coverage: {status: "page", examined: 10, total: 738}`
- Vistas `sections`, `symbols`, `javascript-facts`, facetas `linkage`/`mitigations`
  y colecciones `endpoints`/`unknown` responden `invalid_request` para este
  proveedor JavaScript → **desconocido**, no ausencia.

### Limitación honesta

El bundle recupera **738 módulos** pero la página de módulos solo expone
`node_id` y `path` (todos dentro de `ui-process-00678e69.js`): los nombres de
módulo originales se perdieron en el empaquetado. Por eso el inventario de
rasgos de arriba se apoya en literales de la interfaz (recuentos) y no en
nombres de módulo.

## Cómo reproducirlo

```bash
# servidor MCP por stdio (lo que se usó aquí)
npx -y rea-agents@6.7.0 --mcp

# o análisis de un solo uso
npx -y rea-agents@6.7.0 analyze-javascript-application /tmp/termius-ui --json > rea.json
```

Los resultados completos (52 MB de grafo) no se versionan: este documento resume
lo observado y cita el identificador de evidencia para quien quiera rehacerlo.

## Evidencia MCP (ejecución real, 22-nov)

REA quedó conectado al harness como servidor MCP (`rea --mcp`, 207 herramientas) y el
análisis se pidió **por herramientas**, no por CLI:

| Paso | Herramienta MCP | Resultado |
|---|---|---|
| 1 | `analyze_javascript_application` (detail: summary) | vista `ev_3a0936de…` sobre el registro completo `ev_9a08894f…` (`retention: complete-record`) |
| 2 | `inspect_analysis_view` (kind: summary) | 738/759 nodos examinados, `coverage: complete-within-view` |
| 3 | `inspect_analysis_view` (javascript-facts, 2.228 filas) | vista `ev_bff82fa6…`, p. ej. imports dinámicos |
| 4 | `inspect_analysis_view` (javascript-chunk) | vista `ev_b77c940f…`, 5 chunks `webpack-bootstrap` |

### Lo que sí dice la evidencia

- **5 chunks** de arranque webpack (`bootstrap@427583`, `@634161`, `@686482`, `@780483`, `@714943`)
  con rangos de línea exactos en `ui-process-00678e69.js`.
- **2.228 hechos** de aplicación; la primera página son **imports dinámicos** que
  revelan módulos de autocompletado cargados bajo demanda, uno por herramienta:

  `mongoimport`, `osascript`, `micro`, `bazel`, `flutter`, `stow`, `rake`, `zellij`,
  `iex`, `base32`, `task`, `pip3`, `cdk8s`, `whereis`, `df`, `gt`, `pmset`, `rscript`…

  → confirma el rasgo «Autocomplete (726 menciones)»: Termius mantiene **especificaciones
  por comando** y las carga de forma perezosa.
- **Límites del grafo semántico declarados**: se omitieron 28.131 llamadas dinámicas,
  31.721 flujos de objeto ambiguos, 1.949 propiedades dinámicas y 34 temporizadores;
  20.000 incógnitas retenidas. Nada de eso se puede leer como ausencia.
- **Fronteras Electron en este bundle**: 0 ventanas, 0 preloads, 0 canales IPC. El
  puente vive en el proceso principal, que REA marcó como *skipped* → **IPC desconocido**.

### Cómo se pidió (reproducible)

```jsonc
// 1
{"name":"analyze_javascript_application",
 "arguments":{"input_path":"/tmp/termius-ui","detail":"summary"}}
// 2-4, con el evidence_id devuelto
{"name":"inspect_analysis_view",
 "arguments":{"source":{"kind":"retained-evidence","evidence_id":"ev_9a08894f…"},
              "view":{"kind":"javascript-facts","where":{"kinds":["javascript-chunk"]},
                      "property_keys":["specifier","resolution_status"],"limit":12}}}
```

## Siguiente paso derivado de la evidencia

El hallazgo accionable es el **autocompletado por herramienta**: Termix puede cargar
especificaciones propias (JSON) para `docker`, `git`, `systemctl`, `journalctl`, `apt`,
`pacman` y ofrecer sugerencias en el terminal, sin reutilizar nada del original.
