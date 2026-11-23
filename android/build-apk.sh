#!/usr/bin/env bash
# ============================================================================
#  J.A.R.V.I.S. — construction de l'APK Android (aucun Gradle, aucun Android Studio)
#
#    aapt2 link  → manifeste binaire + ressources
#    javac       → classes (contre android.jar du SDK platform)
#    d8          → classes.dex
#    zipalign    → alignement 4 octets
#    apksigner   → signature v1+v2 (keystore de debug, valable 27 ans)
#
#  Prérequis : JDK (javac/keytool), SDK Android décompressé.
#    bash android/build-apk.sh
#
#  Sortie : public/jarvis-node/Jarvis.apk
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
SDK="${ANDROID_SDK:-$HOME/android-sdk}"

BT="$(ls -d "$SDK"/android-1[0-9] 2>/dev/null | head -1 || true)"
AJ="$(ls -d "$SDK"/android-3*/android.jar 2>/dev/null | head -1 || true)"

if [ -z "$BT" ] || [ -z "$AJ" ]; then
  echo "SDK Android introuvable dans $SDK" >&2
  echo "Télécharger build-tools_rXX-linux.zip et platform-34 depuis" >&2
  echo "  https://dl.google.com/android/repository/repository2-1.xml" >&2
  exit 1
fi

AAPT2="$BT/aapt2"; D8="$BT/d8"; ZIPALIGN="$BT/zipalign"; APKSIGNER="$BT/apksigner"
OUT="$ROOT/public/jarvis-node/Jarvis.apk"
WORK="build"

echo "→ build-tools : $BT"
echo "→ android.jar : $AJ"

rm -rf "$WORK"
mkdir -p "$WORK/classes"

# 1. Keystore de signature (une seule fois)
if [ ! -f "$WORK/debug.keystore" ]; then
  echo "→ génération du keystore"
  keytool -genkeypair -keystore "$WORK/debug.keystore" \
    -storepass android -keypass android -alias androiddebugkey \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Android Debug, O=Android, C=US" >/dev/null 2>&1
fi

# 2. Manifeste binaire
echo "→ aapt2 link"
"$AAPT2" link \
  --manifest AndroidManifest.xml \
  -I "$AJ" \
  -o "$WORK/app-unsigned.apk" \
  --min-sdk-version 24 \
  --target-sdk-version 34

# 3. Compilation Java
echo "→ javac"
javac --release 8 -encoding UTF-8 -classpath "$AJ" -d "$WORK/classes" \
  src/com/jarvis/complete/MainActivity.java 2>&1 | grep -v "bootstrap class path" || true

if ! find "$WORK/classes" -name "*.class" | grep -q .; then
  echo "Échec de la compilation Java." >&2
  exit 1
fi

# 4. Conversion DEX
echo "→ d8"
"$D8" --release --lib "$AJ" --output "$WORK" \
  $(find "$WORK/classes" -name "*.class")

# 5. Empaquetage + alignement
echo "→ zipalign"
(cd "$WORK" && zip -q -j app-unsigned.apk classes.dex)
"$ZIPALIGN" -f 4 "$WORK/app-unsigned.apk" "$WORK/app-aligned.apk"

# 6. Signature v1 + v2
echo "→ apksigner"
"$APKSIGNER" sign \
  --ks "$WORK/debug.keystore" \
  --ks-pass pass:android \
  --key-pass pass:android \
  --out "$OUT" \
  "$WORK/app-aligned.apk"

echo "→ vérification"
"$APKSIGNER" verify --print-certs "$OUT" | head -6
"$AAPT2" dump badging "$OUT" 2>/dev/null | grep -E "^package:|application-label:|sdkVersion" || true
ls -lh "$OUT"
echo "OK → $OUT"
