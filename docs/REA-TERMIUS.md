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
