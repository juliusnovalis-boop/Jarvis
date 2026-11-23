# Installateur, APK et fichier de clés

**Date :** 23/11/2026 — trois demandes utilisateurs couvertes.

---

## 1. Plus aucune fenêtre Python au bureau

L'agent est un programme **sans fenêtre** ; trois sorties restaient capables
d'ouvrir une console visible sur le bureau :

| Source | Avant | Après |
|---|---|---|
| Auto-démarrage Windows (`Run\JarvisAgent`) | `python.exe` → console à chaque connexion | **`pythonw.exe`** (même dossier, si présent) |
| `Ouvrir-Jarvis.vbs` (icône bureau / menu Démarrer) | `shell.Exec(powershell…)` → fenêtre PowerShell visible pendant le démarrage | `shell.Run(..., 0, True)` → **masqué + attente**, message d'erreur via boîte de dialogue si échec |
| Processus enfants de l'agent (`powershell`, `taskkill`, `clip`, `explorer`…) | `subprocess.Popen` sans flags → **une fenêtre par appel** | `CREATE_NO_WINDOW` (`0x08000000`) imposé par patch de `subprocess.Popen` en tête de `jarvis-agent.py` |

Déjà silencieux (inchangé) : `Jarvis-Silencieux.vbs` → `pythonw.exe` style 0,
démarrage de `Start-Jarvis.ps1` via `wscript -WindowStyle Hidden`, serveur Node
en `-WindowStyle Hidden`.

> `Jarvis-Console.bat` (raccourci « Démarrage avec diagnostic ») garde volontairement
> une console : c'est l'outil de dépannage, lancé à la demande — jamais au démarrage.

Le patch agent est appliqué en tête de fichier, après les imports :

```python
if os.name == "nt":
    _CREATE_NO_WINDOW = 0x08000000
    _PopenBase = subprocess.Popen
    class _QuietPopen(_PopenBase):
        def __init__(self, *args, **kwargs):
            kwargs.setdefault("creationflags", _CREATE_NO_WINDOW)
            super().__init__(*args, **kwargs)
    subprocess.Popen = _QuietPopen
```

## 2. Fichier `.apk` dans l'option Installer

`/install` propose désormais **Application Android** → `/api/download?f=Jarvis.apk`.

L'APK est **réellement construit et signé** dans ce dépôt (aucun Gradle,
aucun Android Studio) :

```
android/AndroidManifest.xml      manifeste (com.jarvis.complete, minSdk 24 / target 34)
android/src/…/MainActivity.java  coque WebView + menu « Adresse du serveur »
android/build-apk.sh             aapt2 → javac → d8 → zipalign → apksigner
```

```bash
bash android/build-apk.sh        # sortie : public/jarvis-node/Jarvis.apk (13 Ko)
```

Outils utilisés : JDK 17 (`javac`, `keytool`, `apksigner`), `aapt2`/`d8`/`zipalign`
des Build-Tools, `android.jar` du Platform 34 — décompressés dans
`$HOME/android-sdk`.

**Comportement de l'app** : première ouverture → saisie de l'adresse du PC
(`http://192.168.1.10:3210/mobile`), mémorisée dans les préférences ; menu
*Adresse du serveur / Recharger / Interface complète* ; retour = retour arrière
 WebView ; `usesCleartextTraffic` autorise le HTTP local ; permission `INTERNET`.

Vérification : `apksigner verify` (v1+v2, certificat de debug valide 27 ans),
`aapt2 dump badging` → `package com.jarvis.complete`, `label 'J.A.R.V.I.S.'`.

## 3. Un fichier `.env` livré avec l'installateur `.exe`

| Où | Rôle |
|---|---|
| `packaging/windows/.env.modele` | Modèle de clés (Doubao, Groq, Gemini, OpenRouter, Ollama, recherche, Home Assistant) |
| `Construire-Jarvis-Complet.ps1` | Copie le modèle dans `app\.env.modele` du payload — le `.env` du développeur est supprimé (jamais de clés dans le paquet) |
| `JarvisComplete.nsi` | À l'installation : `app\.env` créé depuis `.env.modele` **s'il n'existe pas** → une mise à jour n'écrase jamais vos clés |
| `Start-Jarvis.ps1` | Au premier démarrage : crée `.env` depuis `.env.modele` si absent, puis le charge dans l'environnement |
| `Ouvrir-Cles.ps1` + raccourci **« Mes clés (.env) »** | Ouvre le fichier dans le Bloc-notes (le crée au besoin) |
| `/api/download?f=.env` | Téléchargement direct depuis `/install` (1 583 octets, `filename=".env"`) |

Le `.env` livré contient `DATABASE_URL` du lanceur plus toutes les clés vides à
remplir ; aucune clé réelle n'est embarquée dans le ZIP ni dans le `.exe`.

## Recette

```bash
npx next typegen && npx tsc --noEmit && npm run build && npm run start
```

| Test | Attendu |
|---|---|
| `python3 -m py_compile public/jarvis-node/jarvis-agent.py` | OK |
| `GET /api/download?f=.env` | 200, `filename=".env"`, 1 583 o |
| `GET /api/download?f=Jarvis.apk` | 200, `application/vnd.android.package-archive`, 12 715 o |
| `GET /install` | cartes « Application Android » et « Fichier .env » |
| `bash android/build-apk.sh` | `apksigner verify` + `badging` OK |
