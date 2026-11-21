#!/usr/bin/env bash
# Instala Termix en el menú: lanzador en ~/.local/bin y entrada .desktop.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

mkdir -p "$HOME/.local/bin" "$HOME/.local/share/applications"
cat > "$HOME/.local/bin/termix" <<EOF
#!/usr/bin/env bash
exec "$DIR/node_modules/electron/dist/electron" "$DIR" --no-sandbox "\$@"
EOF
chmod +x "$HOME/.local/bin/termix"

cat > "$HOME/.local/share/applications/termix-ssh.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Termix (SSH)
Comment=Cliente SSH libre y en español
Exec=$HOME/.local/bin/termix %U
Icon=utilities-terminal
Terminal=false
Categories=Development;Network;
EOF
echo "Instalado: ~/.local/bin/termix y «Termix (SSH)» en el menú."
