# Installateurs Windows — construction et vérification

**Date :** 23/11/2026

## 1. Constat initial

Sur `/install`, les boutons **Installateur .exe** et **Version portable** ne
produisaient rien : `GET /api/download?f=Jarvis-Complete-Setup.exe` renvoyait
**404 « Fichier absent du serveur »**. Les deux artefacts n'avaient **jamais été
construits** — or `packaging/windows/assets/` (l'icône `jarvis.ico` exigée par
`JarvisLauncher.nsi` **et** `JarvisComplete.nsi`) était absent du dépôt, ce qui
rendait la compilation NSIS impossible même sur la machine d'origine.

Les téléchargements `.env` et `.apk` fonctionnaient déjà car ils sont produits
dans le dépôt.

## 2. Correctifs appliqués

| Élément | Action |
|---|---|
| `packaging/windows/assets/jarvis.ico` | **Créé** (32/16/48 px, PNG-in-ICO généré : réacteur cyan sur disque sombre) |
| `packaging/windows/PREMIERE-INSTALLATION.bat` | **Créé** — cité par la page d'installation, lance `Start-Jarvis.ps1 -ConsoleMode` |
| `next.config.ts` | `output: "standalone"` → produit `.next/standalone/server.js` (serveur Node autonome, exigé par le paquet Windows) |
| `src/app/install/page.tsx` | Tailles et SHA-256 **réels** remplaçant les valeurs d'exemple |
| `public/jarvis-node/Jarvis-Complete-Setup.exe` | **Construit** (402 258 836 o) |
| `public/jarvis-node/Jarvis-Complete-Portable.zip` | **Construit** (382 558 785 o) |

## 3. Chaîne de construction utilisée (Linux)

```bash
# a. Application autonome
npm run build                      # → .next/standalone/server.js

# b. Runtimes Windows (simplement des archives, téléchargeables depuis Linux)
node-v22.23.0-win-x64.zip  → runtime/node/
electron-v34.3.4            → runtime/electron/  (+ electron.exe → Jarvis.exe)
postgresql 16 (EDB)         → runtime/postgres/{bin,lib,share}
python-3.11.9-embed         → agent/python/      (+ python311._pth)
vc_redist.x64.exe           → runtime/

# c. Dépendances Python de l'agent, wheels win_amd64
pip install --target agent/lib/site-packages \
  --platform win_amd64 --python-version 3.11 --implementation cp --abi cp311 \
  --only-binary=:all: numpy pillow pywin32 comtypes sounddevice onnxruntime
pip install --target agent/lib/site-packages --no-deps \
  requests pyautogui pyttsx3 SpeechRecognition send2trash ddgs pyperclip openwakeword …

# d. Assemblage : app (standalone + static + public + .env.modele), schema.sql
#    (drizzle-kit generate), scripts de démarrage, agent, desktop, PREMIERE-INSTALLATION.bat

# e. NSIS (paquets Debian extraits du pool, l'index apt du sandbox ne le référence pas)
curl -O https://deb.debian.org/debian/pool/main/n/nsis/nsis_3.08-3+deb12u1_amd64.deb
curl -O …/nsis-common_3.08-3+deb12u1_all.deb
curl -O …/nsis-pluginapi_3.08-3+deb12u1_all.deb
dpkg -x *.deb /tmp/nsis/root
export NSISDIR=/tmp/nsis/root/usr/share/nsis
export LD_LIBRARY_PATH=/tmp/nsis/root/usr/lib/x86_64-linux-gnu

# f. Les deux exécutables
makensis JarvisLauncher.nsi   # → Jarvis.exe      (93 269 o, lanceur natif)
makensis JarvisComplete.nsi   # → Jarvis-Complete-Setup.exe (402 Mo, 5 sections, désinstalleur)
```

Sur Windows d'origine, la commande reste :
`powershell -ExecutionPolicy Bypass -File packaging\windows\Construire-Jarvis-Complet.ps1 -WithExe`

## 4. Contenu livré

**`Jarvis-Complete-Setup.exe`** — installateur NSIS MUI2 en français :
assistant (licence, composants, dossier), extraction du payload, installation
du VC++ runtime, `app\.env` créé depuis `.env.modele` (jamais écrasé), raccourcis
bureau + menu Démarrer (dont « Mes clés (.env) »), auto-démarrage silencieux,
protocole `jarvis://`, entrée « Applications installées » et désinstalleur.

**`Jarvis-Complete-Portable.zip`** — dossier `JarvisComplete/` (17 061 fichiers) :
`PREMIERE-INSTALLATION.bat`, scripts, `app/` (serveur autonome), `runtime/`
(Node, PostgreSQL, Electron, VC++), `agent/` (Python embarqué + dépendances),
`desktop/`, `schema.sql`, `.env.modele`.

## 5. Vérifications

| Test | Résultat |
|---|---|
| `GET /api/download?f=Jarvis-Complete-Setup.exe` | 200 · 402 258 836 o · `filename="Jarvis-Complete-Setup.exe"` |
| `GET /api/download?f=Jarvis-Complete-Portable.zip` | 200 · 382 558 785 o · `filename="Jarvis-Complete-Portable.zip"` |
| `GET /api/download?f=Jarvis.apk` | 200 · 12 715 o |
| `GET /api/download?f=.env` | 200 · 1 583 o |
| En-tête PE du `.exe` | `MZ` (vrai exécutable Windows) |
| `npx next typegen` / `tsc --noEmit` / `npm run build` | ✅ |
| `next start` + assets `/_next/static/*` | 200 (CSS 81 o… JS 229 o) |
| `GET /`, `/install`, `/mobile`, `/api/brain`, `/api/apis` | 200 |
| `POST /api/chat` (« convertis 50 euros en dollars ») | réponse Frankfurter réelle |

### Empreintes

```
Jarvis-Complete-Setup.exe    402 258 836 o
  SHA-256 23e3eac9a200eaa74442f422f50099075171f6a5726c55fd4b235c6c60865170
Jarvis-Complete-Portable.zip 382 558 785 o
  SHA-256 e0aa8ca8a43ea8c006f60fe40ec520ef88c2aeb144505fad2dd4a87b2b88c372
```

Ces valeurs sont affichées en clair sur `/install`.
