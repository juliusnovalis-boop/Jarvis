# J.A.R.V.I.S. — Assistant vocal, agent de PC et application bureau

**Just A Rather Very Intelligent System.** Un assistant personnel qui écoute en
permanence, répond à voix haute, raisonne avec un LLM (local ou cloud), navigue
sur Internet comme un navigateur, et pilote réellement le PC sur lequel il est
installé : souris, clavier, logiciels, fichiers, console, Microsoft Word.

Deux processus, aucune dépendance cloud obligatoire :

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Fenêtre J.A.R.V.I.S.  (jarvis://app) — Electron, sans barre d'adresse │
│  interface HUD : réacteur, transcription, vision, domotique, console    │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │  HTTP interne (localhost uniquement)
┌──────────────────────────────▼──────────────────────────────────────────┐
│  MOTEUR WEB  — Next.js 16 standalone + PostgreSQL 16 portable           │
│  /api/chat → moteur d'intentions → routeur cognitif → orchestrateur     │
│  → Ollama / cloud / Internet / outils PC                                │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │  file de travaux JSON (register/poll/result)
┌──────────────────────────────▼──────────────────────────────────────────┐
│  AGENT PC  — Python embarqué, arrière-plan                              │
│  micro & diction · openWakeWord · souris/clavier · fichiers · Word COM  │
│  lancement universel des logiciels · voix SAPI · métarecherche DDGS     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Table des matières

1. [Capacités](#1-capacités)
2. [Architecture](#2-architecture)
3. [Arborescence](#3-arborescence)
4. [Cœur logique — `src/lib/jarvis`](#4-cœur-logique--srclibjarvis)
5. [Modèle de données](#5-modèle-de-données)
6. [API HTTP](#6-api-http)
7. [Chaîne vocale](#7-chaîne-vocale)
8. [Cerveau LLM et recherche web](#8-cerveau-llm-et-recherche-web)
9. [Packaging Windows 11](#9-packaging-windows-11)
10. [Agent PC Python](#10-agent-pc-python)
11. [Développement](#11-développement)
12. [Tests](#12-tests)
13. [Qualité et sécurité](#13-qualité-et-sécurité)
14. [Limitations connues](#14-limitations-connues)
15. [Licence](#15-licence)

---

## 1. Capacités

| Domaine | Ce qui est implémenté |
|---|---|
| **Voix** | Écoute continue sans bouton ni mot-clé, dictée, synthèse vocale FR/EN, mot-clé `Jarvis` en option, coupe-circuit unique (bouton haut-parleur) |
| **Raisonnement** | Routeur cognitif (local / Internet / hybride) + orchestrateur qui planifie, exécute et vérifie avant de répondre |
| **Internet** | Recherche fédérée multi-moteurs, lecture des pages (Readability), réponses avec sources citées |
| **Sport temps réel** | Journées complètes (Ligue 1, LDC, Premier League, Liga, Serie A, Bundesliga), scores et horaires dans le fuseau de l'utilisateur |
| **Contrôle PC** | Souris, clavier, macros multi-étapes, captures d'écran, verrouillage, extinction annulable |
| **Logiciels** | Lancement universel : alias, `PATH`, registre `App Paths`, menu Démarrer, apps Store (`Get-StartApps`) |
| **Microsoft Word** | Automatisation COM native : page vierge, texte, `SaveAs2(.docx)`, fermeture, vérification du fichier, réouverture |
| **Fichiers** | Lire, écrire, créer, copier, déplacer, supprimer (corbeille), lister, chercher, exécuter |
| **Console double** | Shell du serveur (whitelist lecture seule) + shell complet du PC via l'agent |
| **Domotique** | Maison simulée persistée ou Home Assistant réel (`HOMEASSISTANT_URL`) |
| **Vision** | Caméra (luminosité, mouvement, visages), capture d'écran, description sémantique LLaVA/GPT-4o si disponible |
| **Mémoire** | Conversations, notes, tâches, agenda dicté, mémoire clé-valeur, agents nommés |
| **App mobile** | `/mobile` : voix, maison, télécommande du poste principal |
| **Images** | Génération à la demande (Pollinations) |

---

## 2. Architecture

### 2.1 Flux d'une demande

```
voix / texte
   │
   ▼
┌─────────────────────────────┐
│ Skills déterministes        │  horloge, météo, calcul, minuteries,
│ (engine.ts, ~40 branches)   │  rappels, notes, tâches, agenda, sport,
│                             │  domotique, fichiers, logiciels, macros,
│                             │  vision, agents… → exécutés AVANT tout LLM
└──────────────┬──────────────┘
               │ aucune branche n'a répondu
               ▼
┌─────────────────────────────┐
│ cognitive-router.ts (pur)   │  classe la demande : route local | web |
│                             │  hybrid + raison + confiance
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│ orchestrator.ts             │  1. exécute la route choisie
│                             │  2. vérifie les preuves (sources, faits)
│                             │  3. si Internet échoue → le dit explicitement
└──────────────┬──────────────┘
               ▼
   réponse + sources + badge LOCAL / INTERNET / HYBRIDE
```

Point de conception important : **les actions réelles ne sont jamais
confiées au LLM**. Ouvrir un logiciel, taper au clavier ou écrire un fichier
passe par les skills déterministes ; le modèle ne fait que comprendre,
raisonner et formuler. Une action non comprise devient `ambiguous_action` :
Jarvis demande une clarification au lieu de prétendre l'avoir exécutée.

### 2.2 Routage cognitif

| Route | Déclencheurs | Exécution |
|---|---|---|
| `local` | raisonnement, création, mémoire personnelle, `sans Internet` / `confidentiel` | `askBrain` → Ollama ≤ 6 B puis cloud configuré |
| `web` | `aujourd'hui`, `demain`, `prix`, `dernier`, `actualités`, demande explicite `sur Internet` | `browseAnswer` (recherche + lecture + synthèse) |
| `hybrid` | domaine sensible (santé, droit, finance), comparatif avec contrainte temporelle, recommandation | recherche d'abord, puis analyse du LLM sur les pages lues |

Le badge `LOCAL` / `INTERNET` / `HYBRIDE` affiché dans la transcription est
repris directement de cette décision (`cognition` dans la réponse).

### 2.3 Pourquoi Electron et non une page web

Chromium ne fournit **pas** l'API Web Speech hors Chrome (clé Google
intégrée). La reconnaissance vocale de l'application installée est donc
déléguée à l'agent Python (`sounddevice` + `SpeechRecognition`), et la
synthèse à SAPI Windows. `jarvis://app` est un protocole applicatif
enregistré : l'interface n'a jamais d'URL `http://127.0.0.1` visible.

---

## 3. Arborescence

```
.
├── src/
│   ├── app/
│   │   ├── page.tsx                 HUD principal (réacteur, transcription)
│   │   ├── mobile/page.tsx          app compagnon
│   │   ├── install/page.tsx         page de téléchargement des installateurs
│   │   └── api/                     14 routes (voir §6)
│   ├── components/jarvis/           Core (réacteur SVG+canvas), Boot, panneaux
│   │                                Status/Command/Transcript/Memory/Brain/
│   │                                Home/Vision/System
│   ├── hooks/                       useVoice, useListen, useMicLevel
│   ├── lib/jarvis/                  cœur logique (voir §4)
│   └── db/                          schéma Drizzle + client PostgreSQL
├── public/jarvis-node/
│   ├── jarvis-agent.py              agent PC (~1500 lignes, voir §10)
│   ├── Jarvis-Complete-*.exe/zip    artefacts de construction (ignorés par git)
│   └── LISEZ-MOI*.txt               guides utilisateur
├── packaging/windows/
│   ├── Construire-Jarvis-Complet.ps1  chaîne de construction complète
│   ├── JarvisLauncher.nsi             → Jarvis.exe (lanceur natif)
│   ├── JarvisComplete.nsi             → Jarvis-Complete-Setup.exe
│   ├── Start/Stop-Jarvis.ps1          ordre de démarrage / arrêt propre
│   ├── Ouvrir-Jarvis.vbs              lanceur visible (raccourcis)
│   ├── Jarvis-Silencieux.vbs          autostart silencieux
│   ├── Diagnostic-Jarvis.ps1          contrôle de santé des composants
│   └── desktop/                       shell Electron (main.js)
├── scripts/                          bancs de test (voir §12)
├── next.config.ts                    output: "standalone" (requis packaging)
├── drizzle.config.json
└── PUBLICATION-GITHUB.md             procédure de publication sur GitHub
```

---

## 4. Cœur logique — `src/lib/jarvis`

| Module | Responsabilité | Détails notables |
|---|---|---|
| `engine.ts` | Moteur d'intentions (~1400 lignes) | Environ 40 skills déterministes exécutés dans un ordre de priorité ; retourne `reply`, `action`, `sources`, `cognition` |
| `cognitive-router.ts` | Décision de route | **Pur et testable** (aucune I/O) : `planCognitiveRoute()` → `{route, kind, confidence, reason}` |
| `orchestrator.ts` | Exécution + vérification | Applique la route, détecte les faits frais non vérifiables, refuse d'inventer |
| `brain.ts` | Accès aux LLM | Cascade Ollama → Gemini → Groq → Mistral → DeepSeek → OpenRouter → OpenAI → Anthropic ; `askLocalBrain()` force le mode privé ; catalogue Ollama avec **plafond 6 B** (`OLLAMA_MAX_PARAMS_B`) |
| `websearch.ts` | Navigateur | Chaîne SearXNG → Brave → Tavily → Serper → DuckDuckGo/Bing (via lecteur Jina) → agent PC (DDGS) ; déduplication, plafond 2 résultats par domaine, classement par pertinence ; lecture via **Mozilla Readability** puis Jina puis fetch direct puis agent ; synthèse extractive + LLM |
| `question-quality.ts` | Contrats de réponse | Intent/domaine, sources minimes, éléments attendus, `verifyCompleteness()` ; partagé avec l'audit d'un million de questions |
| `sports.ts` | Sport en direct | TheSportsDB : journée courante via `eventsround` (les endpoints gratuits ne renvoient qu'un match), agrégation de 3 journées, fuseau utilisateur |
| `home.ts` | Domotique | Scènes, langage naturel, maisons simulées persistées, repli Home Assistant REST |
| `vision.ts` | Analyse d'image | Métriques locales + `describeImage()` : Ollama/LLaVA → OpenAI → Anthropic |
| `nodes.ts` | Pont PC | File `node_jobs`, attente de résultat avec timeout, `runOnPc()` renvoie `{ok}` — **aucune confirmation sans résultat agent** |
| `speech-engine.ts` | Synthèse vocale | Pur et testé : attend les voix, délai `cancel→speak`, chien de garde `onstart`, reprises ; contourne les bugs Chromium/Electron |
| `wake-parser.ts` | Parseur de voix | Pur : mot-clé + **armement 8 s** (« Jarvis » puis « ouvre Word » en deux phrases), variantes `Jarvice/Jervis` |

---

## 5. Modèle de données

`src/db/schema.ts` — Drizzle ORM / PostgreSQL, 11 tables :

| Table | Rôle |
|---|---|
| `messages` | Historique des échanges (rôle, contenu) |
| `memories` | Mémoire clé-valeur : prénom, ville, modèle Ollama choisi |
| `notes` / `tasks` | Notes dictées / tâches avec état |
| `events` | Agenda dicté (date interprétée dans le fuseau utilisateur) |
| `devices` | Appareils domotiques (simulés ou miroir Home Assistant) |
| `pc_nodes` | PC liés : id, plateforme, jeton, dernière vue |
| `node_jobs` | File de travaux PC : `kind`, `payload`, `status`, `result`, `attachment` |
| `command_queue` | File mobile : l'app pousse, le poste consomme et répond |
| `agents` | Agents IA nommés (mission, invocation `@nom`) |
| `vision_logs` | Journal des analyses de caméra |

Initialisation : `npx drizzle-kit push` (ou génération SQL autonome via
`drizzle-kit generate --schema ./src/db/schema.ts`).

---

## 6. API HTTP

Toutes les routes sont sous `/api`. État : **écoute sur `127.0.0.1` uniquement**
(port 3210) ; PostgreSQL sur 55432, localhost seulement.

| Route | Méthodes | Rôle |
|---|---|---|
| `/api/chat` | POST | Cœur : `{message, tz, lang}` → `{reply, action?, sources?, cognition?, engine?}` |
| `/api/brain` | GET, POST | État du cerveau + catalogue Ollama ; POST `{model}` pour choisir (vide = automatique) |
| `/api/node` | GET, POST, **PUT** | Pont PC : `register` / `poll` (+ état micro) / `result` ; PUT `speak` (voix SAPI) et `listen` (coupe-circuit micro) |
| `/api/console` | POST | Exécution shell : serveur (whitelist lecture seule) ou PC lié |
| `/api/devices` | GET, POST | Domotique : état, `toggle`, `level` |
| `/api/search` | GET | Navigation : `?q=` (réponse + sources), `&raw=1`, `&compare=1`, `?url=` (lecture) |
| `/api/vision` | GET, POST | Journal des analyses ; POST `{image, metrics}` |
| `/api/agents` | GET, POST, DELETE | Agents IA nommés |
| `/api/remote` | GET, POST, PATCH | File mobile (télécommande du poste) |
| `/api/remote/status` | GET | Suivi des commandes mobiles |
| `/api/history` | GET | Derniers échanges |
| `/api/state` | GET | Mémoire, notes, tâches, agenda |
| `/api/download` | GET, HEAD | Livraison des installateurs (`?f=Jarvis-Complete-Setup.exe`), reprise `Range` |
| `/api/health` | GET | `{ok}` — contrôle de santé PostgreSQL |

---

## 7. Chaîne vocale

### 7.1 Application installée (Electron) — voix gérée par l'agent

```
Agent : sounddevice, flux unique
   │  openWakeWord « hey_jarvis » (seuil 0.08, calibré voix française)
   │  — OU — écoute continue sans mot-clé (défaut : continuous_listener)
   ▼
fin de phrase détectée (1 s de silence)
   │  le flux est FERMÉ avant la dictée → jamais deux micros ouverts
   ▼
SpeechRecognition : Google (gratuit) — ou Vosk local si models/vosk-fr présent
   │
   ▼
POST /api/remote → /api/chat → réponse
   │
   ▼
réponse prononcée par SAPI via un travail « speak »
   │  AUDIO_OUTPUT_ACTIVE verrouille le micro pendant toute la parole
   ▼
réarmement de l'écoute
```

Options agent : `--wake` (mot-clé obligatoire, mode historique), `--no-wake`,
`--wake-threshold`, `--selftest fichier.wav`.

### 7.2 Espace de travail (navigateur)

Web Speech API de Chromium, armement 8 s après « Jarvis » (facultatif),
suspension anti-écho pendant la parole, `speech-engine.ts` pour contourner
les bugs `getVoices()`/`cancel→speak`.

### 7.3 Coupe-circuit

Le bouton haut-parleur de l'en-tête commande **réellement** l'agent
(`PUT /api/node {action:"listen", enabled:false}`) et non seulement l'affichage.

---

## 8. Cerveau LLM et recherche web

### Cascade du cerveau (ordre de priorité)

```
Ollama (local, privé, modèle ≤ 6 B choisi dans l'interface)
→ Gemini → Groq → Mistral → DeepSeek → OpenRouter → OpenAI → Anthropic
→ moteur d'intentions interne (toujours disponible)
```

Aucune clé n'est requise pour démarrer. `askLocalBrain()` n'utilise jamais le
cloud, invoqué quand l'utilisateur demande un traitement privé.

### Chaîne de recherche

```
SearXNG (SEARXNG_URL) → Brave → Tavily → Serper
→ DuckDuckGo → Bing (via r.jina.ai) → agent PC (DDGS, IP résidentielle)
+ Google News RSS (sujets d'actualité) + Wikipédia (connaissances stables)
lecture : Mozilla Readability → r.jina.ai → fetch direct → agent PC
```

Le lecteur Jina est **sérialisé et mis en cache** (450 ms entre requêtes,
backoff exponentiel) pour éviter les 429 observés en charge.

### Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `DATABASE_URL` | **Requis** — PostgreSQL | — |
| `OLLAMA_URL` | Cerveau local | `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | Modèle Ollama choisi automatiquement | `llama3.1` |
| `OLLAMA_MAX_PARAMS_B` | Plafond de taille des modèles locaux | `6` |
| `OLLAMA_VISION_MODEL` | Vision locale | `llava` |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | Google Gemini | — |
| `GEMINI_MODEL` | | `gemini-2.0-flash` |
| `GROQ_API_KEY` / `GROQ_MODEL` | Groq | `llama-3.3-70b-versatile` |
| `MISTRAL_API_KEY` / `MISTRAL_MODEL` | Mistral | `mistral-small-latest` |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` | DeepSeek | `deepseek-chat` |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | OpenRouter | `meta-llama/llama-3.3-70b-instruct:free` |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | OpenAI | `gpt-4o-mini` |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Anthropic | `claude-3-5-haiku-latest` |
| `OPENAI_VISION_MODEL` / `ANTHROPIC_VISION_MODEL` | Vision cloud | `gpt-4o-mini` / `claude-3-5-sonnet-latest` |
| `SEARXNG_URL` | Méta-recherche auto-hébergée | — |
| `BRAVE_SEARCH_API_KEY` | Brave Search API | — |
| `TAVILY_API_KEY` | Tavily | — |
| `SERPER_API_KEY` | Google via Serper | — |
| `THESPORTSDB_KEY` | Sport (clé gratuite par défaut) | `123` |
| `HOMEASSISTANT_URL` + `HOMEASSISTANT_TOKEN` | Domotique réelle | — |

---

## 9. Packaging Windows 11

Chaîne complète, tout est embarqué (Node, Electron, PostgreSQL, Python,
pywin32, modèles ONNX) : **aucune dépendance à installer sur le poste cible**.

### 9.1 Construction

```powershell
# Sur un PC Windows avec Node.js 20+ et (optionnel) NSIS :
powershell -ExecutionPolicy Bypass -File packaging\windows\Construire-Jarvis-Complet.ps1 [-WithExe]
```

Le script exécute : `npm install` → `drizzle-kit generate` → `next build`
(standalone) → téléchargement de Node 22 x64, Electron 34 (renommé
`Jarvis.exe`), PostgreSQL 16 binaire, VC++ Redist, Python 3.11 embarqué +
`pip install --target` (pyautogui, openwakeword, ddgs, SpeechRecognition,
send2trash, **pywin32**…) → compression portable → NSIS optionnel.

Artefacts : `dist/Jarvis-Complete-Portable.zip` et `dist/Jarvis-Complete-Setup.exe`.

### 9.2 Installateur (`JarvisComplete.nsi`)

Assistant MUI2 (bienvenue, licence, composants, dossier, fin) + :

- `Jarvis.exe` natif (NSIS silencieux) en racine — **cible de tous les
  raccourcis** (bureau, menu Démarrer, protocole `jarvis://`, entrée
  Applications installées) ;
- métadonnées de version (`VIProductVersion`, description, éditeur) ;
- icône réacteur, licence, autostart `HKCU\Run`, désinstallateur HKLM
  qui propose de conserver ou supprimer `%LOCALAPPDATA%\JarvisCompleteData` ;
- extraction du payload par PowerShell (NSIS plante sur des dizaines de
  milliers de fichiers — le payload est une archive unique).

### 9.3 Ordre de démarrage (`Start-Jarvis.ps1`)

```
initdb (premier lancement) → pg_ctl start (55432) → schema.sql (11 tables)
→ node server.js (3210) → healthcheck /api/health
→ agent pythonw (silencieux) → ouverture de la fenêtre Electron
```

Échec → message lisible + `logs\launcher.log`. Arrêt propre :
`Stop-Jarvis.ps1` (Electron, agent, node, pg_ctl). Diagnostic :
`Diagnostic-Jarvis.ps1`.

### 9.4 Shell Electron (`desktop/main.js`)

- protocole `jarvis://app` enregistré (`registerSchemesAsPrivileged`) avec
  proxy vers le moteur interne : **aucune URL localhost visible** ;
- instance unique (un second clic remet la fenêtre au premier plan) ;
- permissions micro/caméra limitées à l'origine `jarvis://` ;
- liens externes ouverts dans le navigateur système ;
- splash pendant le démarrage, position/taille mémorisées ;
- repli explicite si le shell manque (plus d'ouverture silencieuse de Chrome).

---

## 10. Agent PC Python

`public/jarvis-node/jarvis-agent.py` — fichier unique, ~1500 lignes,
exécuté par le Python embarqué du paquet.

**Contrôle du PC**

- souris : `moveTo`/`moveRel`, clic, double-clic, clic droit (PyAutoGUI) ;
- clavier : `typewrite`, `hotkey`, `press`, presse-papiers pour les accents ;
- macros ordonnées (`macro`) et scénario Word (`word_document`) ;
- lancement universel : alias → `PATH` → registre `App Paths` → raccourcis
  menu Démarrer → `Get-StartApps` (UWP) → message explicite si absent ;
- fichiers : read / write / append / copy / move / delete (corbeille via
  `send2trash`) / list / search / info / execute / mkdir ;
- console, capture d'écran, verrouillage, extinction avec délai annulable.

**Microsoft Word (COM / pywin32)**

`Documents.Add()` → `Content.Text` → `SaveAs2(.docx, 16)` → `Close()` →
vérification `os.path` → `Quit()` ; `reopen=True` rouvre le fichier. Repli
clavier/souris si COM indisponible.

**Voix** : écoute continue sans mot-clé par défaut (flux unique, fermeture
avant dictée), `speak_local(text, wait=True)` en SAPI (verrou anti-écho),
`list_installed_apps()`, métarecherche DDGS et lecture de pages.

**Sécurité** : verrou de singleton (un seul agent), garde-fou commandes
destructrices (`--unsafe` pour désactiver), failsafe PyAutoGUI (coin
supérieur gauche), tout en ASCII (Windows PowerShell 5.1 lit les accents en
ANSI — source d'erreurs de syntaxe historiques).

---

## 11. Développement

```bash
npm install
npx drizzle-kit push            # crée les 11 tables
npm run dev                     # http://localhost:3000
npm run build && npm start      # production

npm run typecheck               # tsc --noEmit
npm run lint
```

Le serveur exige `DATABASE_URL` (`.env`). Pour un serveur autonome de test :

```bash
npm run build
DATABASE_URL=postgresql://... PORT=3211 HOSTNAME=127.0.0.1 \
  node .next/standalone/server.js
```

`next.config.ts` doit conserver `output: "standalone"` : le packaging Windows
en dépend.

---

## 12. Tests

Chaque banc couvre une chaîne différente ; tous passent à l'état courant.

| Commande | Ce qu'elle prouve | Prérequis |
|---|---|---|
| `npx tsx scripts/million-question-audit.ts` | **1 000 000 questions uniques** : intents, domaines, contrats de réponse — 0 échec | aucun |
| `npx tsx scripts/cognitive-router-test.ts` | 20 décisions local/web/hybride (dont actions ambiguës et domaines sensibles) | aucun |
| `npx tsx scripts/speech-engine-test.ts` | Synthèse sous défauts Chromium simulés (voix tardives, `speak` cassé après `cancel`) — l'ancienne version échouait 3/6, la nouvelle 6/6 | aucun |
| `npx tsx scripts/wake-parser-test.ts` | Mot-clé, armement 8 s en deux phrases, écoute directe sans mot-clé | aucun |
| `python3 scripts/agent-audio-pipeline-test.py` | Micro exclusif : wake → fermeture → dictée → commande → réarmement, **max 1 flux simultané** | `numpy`, `requests` |
| `python3 scripts/agent-pc-control-test.py` | Souris/clavier, lancement d'un logiciel inconnu via menu Démarrer, **Word COM** : page vierge → texte → `SaveAs2` → fermeture → fichier vérifié sur disque | `requests` |
| `python3 public/jarvis-node/jarvis-agent.py --selftest *.wav` | Détection du mot-clé sur de vrais WAV (positifs/négatifs) | `openwakeword` |
| `npx tsx scripts/live-browser-benchmark.ts` | Comparaison moteurs (DuckDuckGo, Bing, Wikipédia) — réseau requis | réseau |

Contrôle de l'état live : `curl localhost:3000/api/health`,
`/api/brain` (cerveau + catalogue Ollama), `/api/node` (PC liés).

---

## 13. Qualité et sécurité

- **Aucun port exposé** : moteur 3210 et PostgreSQL 55432 sur `127.0.0.1`.
- **Le LLM n'exécute aucune action** : skills déterministes pour le PC,
  validation `ok` obligatoire avant toute confirmation (les délais d'agent
  produisent une erreur, jamais un faux succès).
- **Réponses traçables** : sources web affichées, badge de route, refus
  explicite quand Internet ou un modèle est indisponible plutôt qu'une
  invention.
- **Micro** : un seul flux audio à la fois ; verrou pendant la parole
  (anti-auto-écho) ; coupe-circuit utilisateur réellement câblé.
- **Fail-safe** : PyAutoGUI coin haut-gauche, garde-fou des commandes
  destructrices, verrou de singleton de l'agent.
- **Scripts Windows en ASCII pur** — condition de fonctionnement sous
  PowerShell 5.1 (les accents y sont lus en ANSI).
- Les gros artefacts (`*.exe`, `*.zip`) sont exclus de git ; ils sont
  produits par la chaîne de construction ou livrés via `/api/download`.

---

## 14. Limitations connues

- **Reconnaissance vocale** : Electron ne fournit pas Web Speech ; la dictée
  passe par l'agent. Google Speech est gratuit mais nécessite Internet —
  ajoutez un modèle Vosk FR dans `agent/models/vosk-fr` pour un mode hors ligne.
- **Word** : l'automatisation COM exige Microsoft Word installé ; sinon
  repli clavier/souris, sensible à la version et à la langue d'Office.
- **Installateur non signé** : SmartScreen/Chrome affichent un avertissement
  (« Informations complémentaires → Exécuter quand même ») ; le ZIP portable
  évite le filtre des `.exe`.
- **Modèles locaux** : plafond 6 B par défaut (voir `OLLAMA_MAX_PARAMS_B`),
  choix persisté en base et visible dans le panneau Cerveau.
- **Vision sémantique** : nécessite un modèle vision local (LLaVA) ou une
  clé cloud ; les métriques de caméra fonctionnent sans rien.
- **Distribution** : les liens de téléchargement tiers expirent — la source
  de vérité est le dépôt et `Construire-Jarvis-Complet.ps1`.

---

## 15. Licence

© 2026 — Jarvis Project. Licence du projet : [packaging/windows/LICENCE.txt](packaging/windows/LICENCE.txt).
Les composants tiers (Python, Node.js, PostgreSQL, Electron, PyAutoGUI,
openWakeWord, DDGS, Mozilla Readability, pywin32…) conservent leurs licences
respectives, listées dans le dossier d'installation.

Publication sur GitHub : voir [PUBLICATION-GITHUB.md](PUBLICATION-GITHUB.md).
