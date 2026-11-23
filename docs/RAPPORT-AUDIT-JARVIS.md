# Rapport d'audit J.A.R.V.I.S. — Code source vs README vs version PC

**Date** : 2026-11-22 (Libreville, UTC+1)
**Périmètre** : `D:\developing-a-custom-jarvis.zip` (code source) et `C:\Program Files\Jarvis` (version PC installée)
**Méthode** : extraction du ZIP, lecture des modules source, comparaisons de hachages, tests HTTP manuels sur la version installée, requêtes PostgreSQL, analyse des logs de lancement.

---

## 1. Synthèse exécutive

1. **Le code source correspond au README dans la très grande majorité.** Les 14 routes API, les 11 tables PostgreSQL, les modules annoncés (moteur d'intentions, cascade LLM, recherche fédérée, sport, domotique, vision, pont PC, parole) existent réellement dans le code et ne sont pas des fonctions factices.
2. **La version PC installée est le build de ce code source.** Les fichiers non compilés (agent Python, shell Electron, scripts de lancement) sont **byte-pour-byte identiques** ; le serveur web compilé contient bien tous les fournisseurs et fonctionnalités du code source.
3. **Bloquage fonctionnel principal : aucun cerveau LLM n'est alimenté.** Les 8 fournisseurs cloud n'ont pas de clé (`/api/brain` renvoie `configured: false` partout) et Ollama n'est pas installé. Les questions ouvertes répondent donc « aucun modèle de raisonnement disponible » ; seules les compétences déterministes (heure, calcul, météo, sport, web fédéré, domotique, tâches, images, etc.) fonctionnent.
4. **État machine au moment de l'audit** : PostgreSQL 16.15 fonctionne (port 55432) ; le serveur web (port 3210) était arrêté et l'agent PC hors ligne. Un démarrage manuel du serveur a réussi (~9 s) et les tests d'API ont passé ; l'instance de test a été refermée après l'audit.
5. **Écarts README ↔ code : mineurs et documentés en section 7** (ex. : `POST /api/brain` ne pose pas de question ; le retour des réponses mobiles via PATCH n'est pas câblé dans l'interface ; aucun script `npm test` déclaré).
6. **Prochaine étape « Jarvis = Doubao personnel »** : plan détaillé dans `PLAN-INTEGRATION-DOUBAO.md`. L'architecture accueille un fournisseur compatible OpenAI avec un patch limité à `brain.ts` (et `vision.ts` en option) ; les clés se décideront ensemble.

**Verdict global** : projet cohérent, largement implanté et en partie testé en direct ; il manque principalement (a) une clé de LLM pour activer le raisonnement, (b) le démarrage régulier de l'agent PC, et (c) quelques raccordements documentaires mineurs.

---

## 2. Périmètre technique

| Élément | Code source (ZIP) | Version PC installée |
|---|---|---|
| Application web | Next.js 16.2.6, React 19, TypeScript, sorties `standalone` | `app\` build standalone (server.js + `.next`) |
| Base de données | Drizzle ORM + `src\db\schema.ts` (11 tables) | PostgreSQL **16.15** portable, schéma `schema.sql` (11 tables) |
| Cerveau | `src\lib\jarvis\brain.ts` : cascade Ollama → Gemini → Groq → Mistral → DeepSeek → OpenRouter → OpenAI → Anthropic | Identique au build ; aucune clé présente |
| Agent PC | `public\jarvis-node\jarvis-agent.py` (63 803 octets) | `agent\jarvis-agent.py` + Python 3.11 embarqué + paquets |
| Bureau | `packaging\windows\desktop\main.js` (Electron) | `desktop\main.js` + `runtime\electron\Jarvis.exe` |
| Runtime Node | `package.json` (Next 16.2.6) | Node **v22.23.0** embarqué (`runtime\node`) |
| Packaging | `packaging\windows\JarvisComplete.nsi` (NSIS) | `Jarvis.exe`, `Desinstaller-Jarvis.exe`, scripts `.bat`/`.vbs` |

### Comparaison d'empreintes (SHA256 / MD5)

| Fichier | Statut PC installé |
|---|---|
| `jarvis-agent.py` | **IDENTIQUE** (63 803 octets) |
| `desktop\main.js` | **IDENTIQUE** (7 675 octets) |
| `app\package.json` | **IDENTIQUE** (922 octets) |
| `Start-Jarvis.ps1` | **IDENTIQUE** |
| `Stop-Jarvis.ps1` | **IDENTIQUE** |
| `Diagnostic-Jarvis.ps1` | **IDENTIQUE** |
| `Jarvis-Console.bat` / `Stop-Jarvis.bat` | **IDENTIQUES** |
| `Ouvrir-Jarvis.vbs` / `Jarvis-Silencieux.vbs` | **IDENTIQUES** |
| `LISEZ-MOI-WINDOWS-11.txt`, `LICENCE.txt` | **IDENTIQUES** |
| Routes compilées `.next\server\app\api\*` | 13 dossiers de routes + `remote\status` (14 routes) en correspondance avec la source |
| Marqueurs fournisseurs (gemini, groq, mistral, deepseek, openrouter, anthropic, pollinations, thesportsdb, homeassistant, llava) | Présents dans les chunks compilés |
| `LANCER-JARVIS.bat`, `PREMIERE-INSTALLATION.bat`, `Jarvis.exe`, `Desinstaller-Jarvis.exe` | Présents uniquement dans l'installateur (scripts NSIS d'emballage, absents du ZIP source) |

**Conclusion parité** : la version PC est un build cohérent du ZIP. Aucune fonctionnalité du code source n'a été supprimée dans la version installée.

---

## 3. Vérification fonction par fonction (README → code → test PC)

Légende : ✅ implémenté et vérifié en direct · 🟡 implémenté, non vérifié en direct à cause d'une condition (clé, modèle, agent hors ligne) · 🔵 implémenté et relu dans le code, non exercé pendant l'audit · ⚠️ écart ou fragilité notée.

### 3.1 Cerveau et raisonnement

| Fonction annoncée (README) | Implémentation | Statut |
|---|---|---|
| Cascade Ollama → Gemini → Groq → Mistral → DeepSeek → OpenRouter → OpenAI → Anthropic | `brain.ts` `askBrain()` dans cet ordre exact | ✅ code ; `/api/brain` live : tous les fournisseurs `configured: false`, Ollama hors-ligne → moteur `rules` |
| Ollama local avec sélection automatique (limite paramètres) | `probeOllama`, `resolveOllamaModel`, `OLLAMA_MAX_PARAMS_B` | 🟡 Ollama absent de la machine |
| Prompt système « J.A.R.V.I.S. » FR/EN, historique, température, max tokens | `SYSTEM_PROMPT`, `BrainMessage[]` | 🔵 relu |
| Routeur cognitif (local / web / agent / raisonnement) | `cognitive-router.ts` | ✅ routage observé sur les tests (`local`, `web:...`) |
| Orchestrateur de repli multi-compétences | `orchestrator.ts` | ✅ déclenché sur question générale sans LLM |
| Contrats de qualité (intent, domaine, sources minimales, variantes de requête) | `question-quality.ts`, `websearch.ts` | ✅ `classifyQuestion` utilisé par la recherche |

### 3.2 Voix

| Fonction | Implémentation | Statut |
|---|---|---|
| Écoute continue web, dictée FR/EN, bouton et mode mains libres | `hooks/useListen.ts` (`continuous`, `startOnce`/`stopOnce`) | 🔵 code relu ; test `test-wake.mjs` fourni |
| Mot-clé « Jarvis » (tolérance orthographe), fenêtre d'armement 8 s | `wake-parser.ts` `parseWakeTranscript` | 🔵 code relu |
| Synthèse FR/EN anti-bugs Chromium (voies tardives, watchdog, chunks) | `speech-engine.ts`, `hooks/useVoice.ts` | 🔵 code relu |
| Agent vocal Python : SAPI `speak`, boucle de jobs, `--wake` openWakeWord (`hey_jarvis_v0.1.onnx`) | `jarvis-agent.py` + `agent\models\*.onnx` | 🟡 agent hors ligne lors de l'audit ; historique : jobs `speak` et `listen_control` `done` |
| Coupe-circuit micro (`listen_control`) | route PUT `/api/node` + agent | 🟡 historique job 73 `done` |

### 3.3 Internet et connaissance

| Fonction | Implémentation | Statut |
|---|---|---|
| Recherche fédérée SearXNG → Brave → Tavily → Serper → DDG (Jina) → Bing (Jina) → agent DDGS | `websearch.ts` `searchSingle` | ✅ live via repli DDG+Wikipédia |
| Recherche multi-variantes, dédoublonnage, 2 résultats max/domaine, top 12 | `webSearch()` | ✅ `/api/search` live |
| Lecture de page : Readability (jsdom) → Markdown Jina → extraction HTML → agent `fetch_url` | `readPage()` | 🔵 chaîne relue |
| Synthèse citant les sources (`browseAnswer`, vérification de complétude) | `websearch.ts` | ✅ live : 4 sources citées pour « capitale du Gabon » |
| Wikipédia résumés FR | `engine.ts` `wikiSkill` | 🔵 relu |
| Météo par géocodage + Open-Meteo | `engine.ts` `weatherSkill` | ✅ live Libreville : « ciel couvert, 26°, humidité 87 %, vent 8 km/h » |
| Sport TheSportsDB : Ligue 1, Ligue 2, LDC, Premier League, Liga, Serie A, Bundesliga (journée ±1) | `sports.ts` | ✅ live Ligue 1 : 3 matchs renvoyés avec horaires TZ |
| Actualités HN / Google News selon contrat | `engine.ts`, `websearch.ts` | 🔵 relu |
| Images générées (Pollinations) | `engine.ts` branche `image` | ✅ live : `action: image` renvoyé (URL externe) |

### 3.4 Contrôle du PC (agent Python)

| Fonction | Code agent | Statut |
|---|---|---|
| Macros clavier/souris (`macro`, `mouse_*`, `type`) | gestionnaire de jobs + `pyautogui` installé | 🟡 agent hors ligne ; code présent |
| Fichiers CRUD + corbeille (`file`, `send2trash` installé) | `file_op()` | 🟡 code présent |
| Word COM (`create_word_document`, `write_document`) via `win32com` | `pywin32` installé | 🟡 nécessite Word installé |
| Capture écran (`screenshot`) | fonction présente | 🟡 |
| Verrouillage session / extinction / annulation (`lock`, `shutdown`, `cancel_shutdown`) | fonctions présentes | 🟡 |
| Lancement universel de logiciels (registry, Start Menu, `Get-StartApps`) | `resolve_windows_app` + branche web `open` | 🔵 relu ; historique job « lancer Word » `done` (2026-11-11) |
| Console double : serveur en lecture seule (whitelist) / PC complet (`shell`) | `api/console/route.ts` | ✅ route relue ; ⚠️ `cwd: "/tmp"` inadapté à Windows sans agent |
| Pont PC : enregistrement token, poll, résultats, état vivant (wake, micro) | `api/node/route.ts`, `nodes.ts` | ✅ `GET /api/node` live : 1 nœud `DESKTOP-F1B3CHG` hors ligne depuis le 14/11 ; historique 73 jobs |
| Recherche web côté agent (DDGS) | `web_search` | ⚠️ historiques jobs 65/67 en `error []` (DDGS injoignable depuis ce réseau) ; la recherche web du serveur, elle, fonctionne |

### 3.5 Domotique, vision, mémoire, mobile

| Fonction | Implémentation | Statut |
|---|---|---|
| Maison simulée persistée (8 appareils) + scènes (cinéma, nuit, travail, réveil) + thermostat/volets/luminosité | `home.ts`, `api/devices` | ✅ `GET /api/devices` live : 8 appareils |
| Pilotage Home Assistant réel (REST `api/states`, services) si `HOMEASSISTANT_URL/TOKEN` | `home.ts` | 🟡 non configuré |
| Vision locale : luminosité, contraste, mouvement, visages (FaceDetector), teinte, netteté | `vision.ts` + `VisionPanel` | ✅ `GET /api/vision` live : 4 logs locaux (11/09) |
| Vision sémantique : Ollama LLaVA → OpenAI GPT-4o → Anthropic Claude | `describeImage()` | 🟡 sans modèle ni clé, repli métriques |
| Mémoire : messages, notes, tâches, agenda (events), KV (memories), agents nommés | 11 tables Drizzle | ✅ `GET /api/state` live : 1 tâche, compteur de messages ; branche tâches testée en UTF-8 |
| AgendA « rappelle-moi », notes « note » | `engine.ts` | 🔵 relu |
| Agents nommés (assistant, code, sport, domotique, vision, multi-PC) + CRUD `/api/agents` | `agents` route + branche `agent` | ✅ route relue ; table vide actuellement |
| Page mobile `/mobile` (voix locale + domotique + mode télécommande) | `app/mobile/page.tsx` | ✅ page compilée présente ; ⚠️ mode télécommande unidirectionnel (voir 7.5) |
| Installation pas à pas `/install` + téléchargement robuste `/api/download` (reprise ranges) | `app/install/page.tsx`, `api/download/route.ts` | ✅ route relue ; fichiers de payload présents dans `app\public\jarvis-node` |

### 3.6 Base de données et API

- **11 tables** (`schema.ts` ↔ `schema.sql` identiques en périmètre) : `messages, notes, tasks, memories, devices, command_queue, events, pc_nodes, node_jobs, agents, vision_logs`. ✅
- **14 routes** vérifiées dans le code et/ou en direct : `agents, brain, chat, console, devices, download, health, history, node, remote, remote/status, search, state, vision`. ✅
- État réel en base (audit) : messages 126 (dont ~24 échanges de diagnostic ajoutés par nos tests), tâches 1, devices 8, vision_logs 4, agents 0, jobs agent 73.

### 3.7 Tests et artefacts

| Artefact | Contenu | Statut |
|---|---|---|
| `artifacts/million-question-audit.json` | 1 000 000 questions uniques, 0 collision, 0 échec, `passRate: 100`, distribution intent/domaine | ✅ présent et cohérent |
| `artifacts/live-browser-benchmark.json` | 24 cas, comparaison Jarvis fédéré / DDG / Bing / Wikipédia / Serper | ✅ présent |
| 8 scripts `test-*.mjs` | cascade, console, moteur, mémoire CRUD, réseau, chaîne de recherche, vision, wake | 🔵 présents ; non réexécutés ici (pas de `node_modules` dev dans le ZIP) |

---

## 4. Résultats des tests manuels sur la version PC

Un serveur de test a été lancé manuellement (`runtime\node\node.exe server.js`, `DATABASE_URL` pointant sur le PostgreSQL existant) puis refermé après les tests.

| Requête | Résultat observé | Verdict |
|---|---|---|
| `GET /api/health` | `{"ok":true}` après ~9 s de démarrage | ✅ |
| `GET /api/brain` | `engine: rules` ; candidats : Ollama hors-ligne, 8 providers cloud sans clé | ✅ conforme au code |
| `GET /api/state` | profil, 1 tâche « tester jarvis », compteur de messages | ✅ |
| `GET /api/devices` | 8 appareils simulés persistés | ✅ |
| `GET /api/node` | 1 nœud enregistré hors ligne ; jobs `speak`/`listen_control` `done` ; `web_search` `error []` | ✅ lecture ; ⚠️ DDGS |
| `GET /api/vision` | 4 logs locaux | ✅ |
| `GET /api/remote/status` | 5 commandes historisées `done` | ✅ |
| `POST /api/chat` « quelle heure est-il » | « Il est 9:45. » | ✅ |
| « calcule 128 fois 46 » | 5 888 | ✅ |
| « qui es-tu » | identité J.A.R.V.I.S. | ✅ |
| « quelles sont mes tâches » (UTF-8) | « Vous avez 1 tâche en cours. 1 : tester jarvis. » | ✅ |
| « quelle météo fait-il à Libreville » | ciel couvert 26°, humidité 87 %, vent 8 km/h | ✅ |
| « quels matchs ce soir en Ligue 1 » | 3 matchs avec horaires | ✅ |
| « cherche sur internet la capitale du Gabon » | réponse synthétisée + 4 sources DDG+Wikipédia | ✅ |
| « blague » | blague FR | ✅ |
| « dessine-moi un phénix mécanique » | `action: image` (Pollinations) | ✅ |
| Question générale sans LLM | « aucun modèle de raisonnement n'est disponible… » | ⚠️ attendu sans clé/Ollama |

---

## 5. État de l'installation Windows (constaté)

**Processus**
- PostgreSQL : **actif** (port 55432, démarré 08:53).
- Serveur web Node : **arrêté** au début de l'audit (`node.pid` obsolète, port 3210 fermé) ; démarrage manuel OK.
- Agent Python (`pythonw.exe`) : **absent** ; nœud PC marqué hors ligne.
- Bureau Electron : pas de fenêtre ouverte pendant l'audit.

**Intégration Windows**
- Autostart : `HKCU\...\Run\JarvisComplete` → `Jarvis-Silencieux.vbs` ✅.
- Raccourcis menu Démarrer : `Ouvrir Jarvis.lnk`, `Arrêter Jarvis.lnk` ✅ ; aucun raccourci bureau trouvé (section NSIS optionnelle possiblement décochée).
- Données : `%LOCALAPPDATA%\JarvisCompleteData\` (postgres, logs, `node.pid`, `schema-v1.installed`).
- **Aucun fichier `.env`** trouvé ; aucune clé cloud dans l'environnement.

**Logs de lancement (`launcher.log`)**
- Fonctionnement régulier observé les 09/11, 10/11 (D:\Jarvis), 11/11, 14/11 (C:\Program Files\Jarvis) : « Serveur Jarvis opérationnel », « Agent vocal armé », « Interface ouverte ».
- Échecs répétés du healthcheck : 10/11 18:30, 11/11 16:45, 13/11 21:16, 14/11 14:48, 21/11 13:02 ; `jarvis-server-error.log` reste à 0 octet. Démarrage manuel réussi : le serveur compile à froid en ~9 s ; le healthcheck du lanceur (30 s) peut tomber devant un scan antivirus (Avast présent) ou un disque lent, et le `WorkingDirectory` a déjà provoqué une erreur explicite le 14/11 14:54.
- Le 22/11 08:53 : PostgreSQL démarré, puis plus aucune ligne du lanceur (script interrompu avant la phase web).

---

## 6. Écarts entre le README et l'implémentation (mineurs)

1. **`POST /api/brain`** : le README suggère qu'il « pose une question au cerveau » ; en réalité il **choisit le modèle Ollama préféré**. Le raisonnement passe par `POST /api/chat` (orchestrateur → `askBrain`).
2. **`PATCH /api/remote` existe mais n'est appelé par aucun frontend** : le mode télécommande de la page mobile envoie la commande et affiche un accusé local ; la réponse du poste principal n'est pas rapatriée (`remote/status` ne sert que la consultation directe).
3. **Aucun script `npm run test:*`** dans `package.json` ; les 8 tests `.mjs` se lancent à la main (`node test-xxx.mjs`), et les `devDependencies` (tsx, drizzle-kit…) ne sont pas présentes dans le build PC.
4. **`drizzle.config.ts` listé dans l'arborescence README §3** : absent du ZIP ; le schéma est appliqué manuellement via `schema.sql`.
5. **`dotenv` est déclaré en dépendance mais jamais importé** ; aucun chargement `.env` explicite dans le code (Next charge les `.env` côté serveur au démarrage, mais aucun fichier n'est livré).
6. **Console serveur** : `cwd: "/tmp"` (convention Linux) ; sur Windows, sans agent PC, les commandes read-only renvoient une erreur de répertoire.
7. **En-tête `schema.sql` généré sous PostgreSQL 15.19** alors que le runtime embarqué est 16.15 : sans impact fonctionnel, mais à régénérer pour la cohérence.
8. **Reconnaissance vocale hors-ligne (Vosk)** absente : la dictée web repose sur la reconnaissance Google (Internet) ; conforme au README qui la présente comme optionnelle.
9. **Météo** : fournisseur réel Open-Meteo (le README ne le nomme pas) ; fonctionne en ligne.
10. **Agent `web_search` (DDGS Python)** en échec historique `[]` sur ce réseau ; la recherche fédérée du serveur (Jina/Wikipédia) reste disponible.

---

## 7. Limites connues confirmées (README §14) + renforts

- Modèles cloud et Ollama : indisponibles sans clé / installation — **confirmé live** (brain rules uniquement).
- Domotique matérielle : simulateur tant que Home Assistant n'est pas configuré — **confirmé**.
- Vosk FR hors-ligne : absent — **confirmé**.
- Word COM : nécessite Microsoft Word — non testé.
- Vision sémantique : nécessite LLaVA ou une clé visuelle — **confirmé** (repli métriques).
- LLM local dimensionné par `OLLAMA_MAX_PARAMS_B` (défaut 6 B) — code présent, Ollama absent.

---

## 8. Recommandations immédiates

1. **Redémarrer proprement** via `LANCER-JARVIS.bat` ; si le healthcheck échoue à nouveau : supprimer le `node.pid` obsolète, porter la fenêtre du healthcheck de 30 s à ~90 s dans `Start-Jarvis.ps1`, et exclure le dossier `C:\Program Files\Jarvis` de l'antivirus.
2. **Démarrer l'agent PC** (`Jarvis-Silencieux.vbs` ou `agent\Jarvis-Console.bat`) et vérifier le micro ; ensuite les tâches `speak`, `shell`, fichiers, Word, souris/clavier deviennent actives.
3. **Clés LLM** : aucune n'existe ; voir `PLAN-INTEGRATION-DOUBAO.md` pour le branchement Doubao et l'emplacement recommandé du fichier `.env`.
4. **Optionnel – nettoyage des messages de diagnostic** de l'audit (102 → 126 messages environ) :
   ```sql
   -- exemple, à ajuster après vérification des ids
   DELETE FROM messages WHERE created_at >= '2026-11-22 08:45:00+01';
   ```
5. Raccordements mineurs à programmer si souhaités : appel `PATCH /api/remote` depuis la page mobile, scripts `npm test` déclarés, régénération du `schema.sql` sous PG16, console serveur compatible Windows.

---

## 9. Annexe : variables d'environnement reliées au code (README §8)

| Variable | Lue dans le code | Présente sur PC |
|---|---|---|
| `DATABASE_URL` | `db/index.ts` | Posée par `Start-Jarvis.ps1` |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY`, `GEMINI_MODEL` | `brain.ts` | non |
| `GROQ_API_KEY`, `GROQ_MODEL` | `brain.ts` | non |
| `MISTRAL_API_KEY`, `MISTRAL_MODEL` | `brain.ts` | non |
| `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` | `brain.ts` | non |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | `brain.ts` | non |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_VISION_MODEL` | `brain.ts`, `vision.ts` | non |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_VISION_MODEL` | `brain.ts`, `vision.ts` | non |
| `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_MAX_PARAMS_B` | `brain.ts`, `vision.ts` | non (Ollama absent) |
| `SEARXNG_URL`, `BRAVE_API_KEY`, `TAVILY_API_KEY`, `SERPER_API_KEY` | `websearch.ts` | non (repli DDG/Jina opérationnel) |
| `HOMEASSISTANT_URL`, `HOMEASSISTANT_TOKEN` | `home.ts` | non (simulateur actif) |
