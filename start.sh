#!/usr/bin/env bash
# Arranca Termix (evita el problema del cli de electron con node 26).
cd "$(dirname "$0")"
exec ./node_modules/electron/dist/electron . --no-sandbox "$@"
