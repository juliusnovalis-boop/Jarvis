#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  Chaîne de construction J.A.R.V.I.S. COMPLETE
#  Reproduit packaging/windows/Construire-Jarvis-Complet.ps1 décrit au
#  §9 du README, en bash (poste de construction Linux).
#
#    Étape « stage »   → payload complet dans packaging/windows/.stage
#    Étape « package » → Jarvis-Complete-Portable.zip
#                        + Jarvis-Complete-Setup.exe
#                          compilé par LE script du dépôt :
#                          packaging/windows/JarvisComplete.nsi
#
#  Prérequis : nsis, zip, unzip, python3, réseau (1er passage)
#  Usage     : ./scripts/build-complete-installer.sh [stage|package|all]
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STAGE="$ROOT/packaging/windows/.stage"
NSISDIR="$ROOT/packaging/windows/.nsis"
CACHE="$ROOT/scripts/.cache"
OUT="$ROOT/public/jarvis-node"
PACK="$ROOT/packaging/windows"
PHASE="${1:-all}"

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
die()  { echo "ERREUR : $1" >&2; exit 1; }

command -v makensis >/dev/null || die "nsis manquant (sudo apt-get update && sudo apt-get install -y nsis)"
command -v zip >/dev/null || die "zip manquant"
command -v unzip >/dev/null || die "unzip manquant"
mkdir -p "$CACHE" "$OUT"

# ── 1. Application autonome ────────────────────────────────────────
stage_app() {
  step "Build Next.js autonome (assistant, studio 3D, montage, MCP…)"
  NEXT_OUTPUT=standalone npx next build

  step "Schéma SQL (11 tables)"
  if ! ls drizzle/*.sql >/dev/null 2>&1; then npx drizzle-kit generate; fi
  local schema
  schema="$(ls drizzle/*.sql | head -1)"
  echo "   $schema"

  step "Assemblage du payload"
  rm -rf "$STAGE"
  mkdir -p "$STAGE/app" "$STAGE"

  cp -a .next-standalone/standalone/. "$STAGE/app/"
  mkdir -p "$STAGE/app/.next-standalone"
  cp -a .next-standalone/static "$STAGE/app/.next-standalone/static"

  rm -rf "$STAGE/app/public"
  cp -a public "$STAGE/app/public"
  # Le paquet n'embarque jamais ses propres installateurs
  find "$STAGE/app/public/jarvis-node" -type f \( -name '*.exe' -o -name '*.zip' \) -delete 2>/dev/null || true
  # Jamais la configuration du développeur
  rm -f "$STAGE/app/.env"
  cp "$PACK/.env.modele" "$STAGE/app/.env.modele"
  cp .env.example "$STAGE/app/.env.example"
  mkdir -p "$STAGE/app/packaging/windows"
  cp "$PACK/.env.modele" "$STAGE/app/packaging/windows/.env.modele"

  # Fichiers suivis par le tracer, inutiles à l'exécution
  rm -rf "$STAGE/app/docs" "$STAGE/app/android" "$STAGE/app/scripts" \
         "$STAGE/app/src" "$STAGE/app/packaging/windows/desktop" \
         "$STAGE/app/README.md" "$STAGE/app/package-lock.json" 2>/dev/null || true
  rm -f "$STAGE/app/nsis_3.08"*.deb 2>/dev/null || true

  # schema.sql : racine (convention du dépôt) + app/ (pour setup-db.js)
  sed 's/-- statement-breakpoint//g' "$schema" > "$STAGE/schema.sql"
  cp "$STAGE/schema.sql" "$STAGE/app/schema.sql"
  cp "$PACK/setup-db.js" "$STAGE/app/setup-db.js"
}

# ── 2. Runtimes ────────────────────────────────────────────────────
stage_runtimes() {
  step "Node.js 22 x64"
  local nz="$CACHE/node-22.23.0-win-x64.zip"
  [ -f "$nz" ] || curl -sSL --max-time 600 -o "$nz" "https://nodejs.org/dist/v22.23.0/node-v22.23.0-win-x64.zip"
  rm -rf "$CACHE/node-x" && mkdir -p "$CACHE/node-x"
  unzip -q "$nz" -d "$CACHE/node-x"
  mkdir -p "$STAGE/runtime"
  rm -rf "$STAGE/runtime/node"
  mv "$CACHE/node-x"/node-v22.23.0-win-x64 "$STAGE/runtime/node"
  echo "   $(du -sh "$STAGE/runtime/node" | cut -f1)"

  step "Shell Electron (Jarvis.exe natif, protocole jarvis://)"
  local ez="$CACHE/electron-win.zip"
  [ -f "$ez" ] || curl -sSL --max-time 600 -o "$ez" "https://github.com/electron/electron/releases/download/v34.3.4/electron-v34.3.4-win32-x64.zip"
  rm -rf "$STAGE/runtime/electron" && mkdir -p "$STAGE/runtime/electron"
  unzip -q "$ez" -d "$STAGE/runtime/electron"
  mv "$STAGE/runtime/electron/electron.exe" "$STAGE/runtime/electron/Jarvis.exe"
  echo "   $(du -sh "$STAGE/runtime/electron" | cut -f1)"

  step "PostgreSQL 16 portable (Windows)"
  local pj="$CACHE/postgres-windows-x86_64-16.4.0.jar"
  [ -f "$pj" ] || curl -sSL --max-time 600 -o "$pj" \
    "https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-windows-amd64/16.4.0/embedded-postgres-binaries-windows-amd64-16.4.0.jar"
  if [ ! -f "$CACHE/pgsql/bin/initdb.exe" ]; then
    rm -rf "$CACHE/pgsql" "$CACHE/bin" "$CACHE/lib" "$CACHE/share"
    python3 -c "import io,os,sys,tarfile,zipfile;jar,out=sys.argv[1],os.path.join(sys.argv[2],'pgsql');d=zipfile.ZipFile(jar).read('postgres-windows-x86_64.txz');tarfile.open(fileobj=io.BytesIO(d),mode='r:xz').extractall(out)" "$pj" "$CACHE"
  fi
  rm -rf "$STAGE/runtime/postgres"
  cp -a "$CACHE/pgsql" "$STAGE/runtime/postgres"
  echo "   $(du -sh "$STAGE/runtime/postgres" | cut -f1)"

  step "Visual C++ Redistributable"
  [ -f "$CACHE/vc_redist.x64.exe" ] || curl -sSL --max-time 600 -o "$CACHE/vc_redist.x64.exe" -L "https://aka.ms/vs/17/release/vc_redist.x64.exe"
  cp "$CACHE/vc_redist.x64.exe" "$STAGE/runtime/vc_redist.x64.exe"
  echo "   $(du -h "$CACHE/vc_redist.x64.exe" | cut -f1)"

  step "Coquillage bureau (desktop/)"
  rm -rf "$STAGE/desktop" && mkdir -p "$STAGE/desktop"
  cp -a "$PACK/desktop/." "$STAGE/desktop/"
  cp "$PACK/assets/jarvis.ico" "$STAGE/desktop/jarvis.ico"
}

# ── 3. Agent vocal : Python embarqué + dépendances Windows ────────
stage_agent() {
  step "Python 3.11 embarqué"
  local pz="$CACHE/py-embed.zip"
  [ -f "$pz" ] || curl -sSL --max-time 600 -o "$pz" "https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip"
  rm -rf "$STAGE/agent" && mkdir -p "$STAGE/agent"
  unzip -q "$pz" -d "$STAGE/agent/python"
  printf 'python311.zip\nDLLs\n.\n..\\lib\\site-packages\n\nimport site\n' > "$STAGE/agent/python/python311._pth"

  step "Dépendances Python (wheels win_amd64 + sdists purs)"
  local wl="$CACHE/wheels-full"
  if [ ! -d "$wl" ] || [ "$(ls -A "$wl" 2>/dev/null | wc -l)" -lt 30 ]; then
    rm -rf "$wl" && mkdir -p "$wl"
    python3 -m pip download --dest "$wl" --platform win_amd64 --python-version 3.11 \
      --implementation cp --only-binary=:all: \
      requests pillow ddgs openwakeword sounddevice numpy pyttsx3 pywin32 \
      comtypes SpeechRecognition send2trash
    python3 -m pip download --dest "$wl" --no-deps \
      pyautogui pygetwindow pyscreeze pyrect pyperclip mouseinfo
  fi
  local sp="$STAGE/agent/lib/site-packages"
  mkdir -p "$sp"
  python3 "$ROOT/scripts/_unpack_wheels.py" "$wl" "$sp"

  # Allègement identique au dépôt : utiles à l'entraînement uniquement
  rm -rf "$sp/scipy" "$sp/scikit_learn" "$sp/joblib" "$sp/threadpoolctl" "$sp/narwhals" 2>/dev/null || true
  rm -rf "$sp"/scipy-*.dist-info "$sp"/scikit_learn-*.dist-info "$sp"/joblib-*.dist-info \
         "$sp"/threadpoolctl-*.dist-info "$sp"/narwhals-*.dist-info 2>/dev/null || true
  rm -rf "$sp"/__pycache__ "$sp"/pywin32_system32 2>/dev/null || true
  echo "   $(du -sh "$sp" | cut -f1)"

  step "Agent, modèles vocaux et lanceurs"
  cp "$OUT/jarvis-agent.py" "$STAGE/agent/jarvis-agent.py"

  # Amorçage minimal : ne charge pas les modules d'entraînement au démarrage
  cat > "$sp/openwakeword/__init__.py" <<'OWW'
from openwakeword.model import Model
from openwakeword.vad import VAD

def train_custom_verifier(*args, **kwargs):
    raise NotImplementedError("Entrainement non inclus dans l'agent package.")

__all__ = ["Model", "VAD", "train_custom_verifier"]
OWW

  mkdir -p "$STAGE/agent/models"
  local mdir="$sp/openwakeword/resources/models"
  if [ -d "$mdir" ]; then
    local m
    for m in hey_jarvis_v0.1.onnx melspectrogram.onnx embedding_model.onnx; do
      if [ -f "$mdir/$m" ]; then cp "$mdir/$m" "$STAGE/agent/models/"; fi
    done
  fi
  echo "   modèles : $(ls "$STAGE/agent/models" 2>/dev/null | wc -l) fichier(s)"

  cat > "$STAGE/agent/Jarvis-Silencieux.vbs" <<'VBS'
Set shell = CreateObject("Wscript.Shell")
Set fso   = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = dir
shell.Run """" & dir & "\python\pythonw.exe""" """ & dir & "\jarvis-agent.py""", 0, False
VBS

  cat > "$STAGE/agent/Jarvis-Console.bat" <<'BAT'
@echo off
cd /d "%~dp0"
python\python.exe jarvis-agent.py
pause
BAT

  printf 'http://127.0.0.1:3210' > "$STAGE/agent/server_url.txt"
}

# ── 4. Scripts de démarrage à la racine ────────────────────────────
stage_scripts() {
  step "Scripts de démarrage"
  local f
  for f in Start-Jarvis.ps1 Stop-Jarvis.ps1 Stop-Jarvis.bat Diagnostic-Jarvis.ps1 \
           Jarvis-Silencieux.vbs Ouvrir-Jarvis.vbs Jarvis-Console.bat Ouvrir-Cles.ps1 \
           LISEZ-MOI-WINDOWS-11.txt; do
    cp "$PACK/$f" "$STAGE/$f"
  done
  cp "$PACK/LICENCE.txt" "$STAGE/LICENCE.txt"
  echo "   $(ls "$STAGE" | wc -l) entrées en racine"
}

# ── 5. Archives ────────────────────────────────────────────────────
package_portable() {
  step "Version portable (JarvisComplete/…)"
  local port="$CACHE/portable"
  rm -rf "$port" && mkdir -p "$port/JarvisComplete"
  cp -a "$STAGE/." "$port/JarvisComplete/"
  rm -f "$OUT/Jarvis-Complete-Portable.zip"
  ( cd "$port" && zip -9 -q -r "$OUT/Jarvis-Complete-Portable.zip" JarvisComplete )
  rm -rf "$port"
  echo "   $(du -h "$OUT/Jarvis-Complete-Portable.zip" | cut -f1)"
}

package_nsis() {
  step "Archive de payload pour l'installateur"
  rm -rf "$NSISDIR" && mkdir -p "$NSISDIR"
  ( cd "$STAGE" && zip -9 -q -r "$NSISDIR/jarvis-complete-payload.zip" . )
  cp "$PACK/Extract-Complete.ps1" "$NSISDIR/"
  cp "$PACK/JarvisComplete.nsi"   "$NSISDIR/"
  cp "$PACK/JarvisLauncher.nsi"   "$NSISDIR/"
  cp "$PACK/Ouvrir-Jarvis.vbs"    "$NSISDIR/"
  cp "$PACK/LICENCE.txt"          "$NSISDIR/"
  cp "$PACK/LISEZ-MOI-WINDOWS-11.txt" "$NSISDIR/"
  mkdir -p "$NSISDIR/assets"
  cp "$PACK/assets/jarvis.ico" "$NSISDIR/assets/jarvis.ico"
  cp "$CACHE/vc_redist.x64.exe" "$NSISDIR/vc_redist.x64.exe"
  echo "   $(du -h "$NSISDIR/jarvis-complete-payload.zip" | cut -f1)"
}

# ── 6. Installateur : scripts NSIS du dépôt ────────────────────────
build_installer() {
  step "JarvisLauncher.nsi → Jarvis.exe (lanceur natif)"
  ( cd "$NSISDIR" && makensis -V1 JarvisLauncher.nsi )
  test -f "$NSISDIR/Jarvis.exe" || die "Jarvis.exe non produit"

  step "JarvisComplete.nsi → Jarvis-Complete-Setup.exe"
  ( cd "$NSISDIR" && makensis -V1 JarvisComplete.nsi )
  test -f "$NSISDIR/Jarvis-Complete-Setup.exe" || die "installateur non produit"

  cp "$NSISDIR/Jarvis-Complete-Setup.exe" "$OUT/"
  rm -rf "$STAGE" "$NSISDIR"
  step "Bilan"
  ls -la "$OUT/Jarvis-Complete-Setup.exe" "$OUT/Jarvis-Complete-Portable.zip"
  sha256sum "$OUT/Jarvis-Complete-Setup.exe" "$OUT/Jarvis-Complete-Portable.zip"
}

case "$PHASE" in
  stage)   stage_app; stage_runtimes; stage_agent; stage_scripts
           echo "✔ Payload prêt dans $STAGE ($(du -sh "$STAGE" | cut -f1))" ;;
  portable) package_portable ;;
  nsis)     package_nsis; build_installer ;;
  package)  package_portable; package_nsis; build_installer ;;
  all)      stage_app; stage_runtimes; stage_agent; stage_scripts
            package_portable; package_nsis; build_installer ;;
  *)        die "phase inconnue : $PHASE (stage | portable | nsis | package | all)" ;;
esac
