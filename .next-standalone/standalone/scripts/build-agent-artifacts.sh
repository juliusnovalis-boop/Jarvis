#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  Construit les artefacts de téléchargement servis par /api/download
#
#    public/jarvis-node/Jarvis-Agent-Setup.exe    installateur NSIS
#    public/jarvis-node/Jarvis-Agent-Portable.zip version portable
#
#  Prérequis : nsis (apt-get install nsis), zip
#  Usage    : ./scripts/build-agent-artifacts.sh
#
#  Le paquet bureau complet (383 Mo : Node + PostgreSQL + moteur Next)
#  se construit sous Windows avec
#  packaging/windows/Construire-Jarvis-Complet.ps1 — voir docs/INSTALLATEURS.md
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/public/jarvis-node"

command -v makensis >/dev/null || { echo "ERREUR : nsis manquant (apt-get install nsis)"; exit 1; }
command -v zip >/dev/null || { echo "ERREUR : zip manquant (apt-get install zip)"; exit 1; }

mkdir -p "$OUT"

echo "▶ Installateur NSIS…"
( cd "$ROOT/packaging/windows" && makensis -V2 JarvisAgent.nsi )
[ -f "$OUT/Jarvis-Agent-Setup.exe" ] || { echo "ERREUR : l'exécutable n'a pas été produit"; exit 1; }

echo "▶ Version portable (ZIP)…"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/desktop"

cp "$OUT/jarvis-agent.py" "$OUT/word_helper.ps1" "$OUT/LISEZ-MOI.txt" \
   "$OUT/LISEZ-MOI-WINDOWS-11.txt" "$OUT/LICENCE.txt" "$STAGE/"

cp "$ROOT/packaging/windows/Start-Jarvis.ps1" \
   "$ROOT/packaging/windows/Stop-Jarvis.ps1" \
   "$ROOT/packaging/windows/Stop-Jarvis.bat" \
   "$ROOT/packaging/windows/Jarvis-Console.bat" \
   "$ROOT/packaging/windows/Ouvrir-Cles.ps1" \
   "$ROOT/packaging/windows/Ouvrir-Jarvis.vbs" \
   "$ROOT/packaging/windows/Jarvis-Silencieux.vbs" \
   "$ROOT/packaging/windows/Diagnostic-Jarvis.ps1" \
   "$ROOT/packaging/windows/PREMIERE-INSTALLATION.bat" "$STAGE/"

cp "$ROOT/packaging/windows/.env.modele" "$STAGE/.env"
cp "$ROOT/packaging/windows/desktop/main.js" \
   "$ROOT/packaging/windows/desktop/package.json" \
   "$ROOT/packaging/windows/desktop/README.txt" "$STAGE/desktop/"

rm -f "$OUT/Jarvis-Agent-Portable.zip"
( cd "$STAGE" && zip -9 -q -r "$OUT/Jarvis-Agent-Portable.zip" . )

echo "✔ Artefacts prêts :"
ls -la "$OUT/Jarvis-Agent-Setup.exe" "$OUT/Jarvis-Agent-Portable.zip"
echo
echo "SHA-256 :"
sha256sum "$OUT/Jarvis-Agent-Setup.exe" "$OUT/Jarvis-Agent-Portable.zip"
echo
echo "Ces empreintes sont affichées automatiquement sur /install."
