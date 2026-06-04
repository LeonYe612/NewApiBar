#!/bin/bash
unset NODE_OPTIONS
unset NODE_EXTRA_CA_CERTS
unset ELECTRON_RUN_AS_NODE
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ELECTRON="$SCRIPT_DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
if [ ! -f "$ELECTRON" ]; then
    echo "ERROR: Electron not found at $ELECTRON"
    exit 1
fi
exec "$ELECTRON" "$SCRIPT_DIR/main.js"
