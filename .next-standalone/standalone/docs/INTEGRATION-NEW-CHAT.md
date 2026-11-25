# Intégration des nouveautés `new-chat/` dans le projet central

**Date :** 23/11/2026 · **Source :** dépôt `juliusnovalis-boop/Jarvis`, dossier `new-chat/`
**Cible :** le projet central (`developing-a-custom-jarvis (1)/`), transposé dans ce workspace.

Les 4 documents d'origine (`PLAN-INTEGRATION-DOUBAO.md`, `PATCH-DOUBAO-prets.md`,
`DEMARRAGE-GRATUIT.md`, `RAPPORT-AUDIT-JARVIS.md`), `env.example-doubao.txt`,
`deploy-pc/` et `agent-test/` sont conservés dans `docs/`.

---

## 1. Cerveau Doubao (fournisseur prioritaire)

`src/lib/jarvis/brain.ts`

- `BrainEngine` enrichi de `"doubao"`.
- Constantes : `DOUBAO_KEY`, `DOUBAO_BASE` (Ark / ModelArk), `DOUBAO_MODEL`,
  `DOUBAO_FIRST` (défaut `0` : après Ollama local et les clés gratuites).
- `brainStatus()` : candidat `doubao` dans la liste, moteur actif quand
  `DOUBAO_API_KEY` est présent **et** `DOUBAO_FIRST=1`.
- `askBrain()` : bloc **Priorité 1** (tout en tête, avant Ollama) et bloc
  **repli** (juste avant OpenAI), tous deux réutilisant `askOpenAICompatible()`.
- Sans clé → la cascade existante est strictement inchangée.

`src/components/jarvis/BrainPanel.tsx` : entrée
`doubao: { name: "Doubao", icon: Zap, tag: "ARK" }`.

## 2. Vision multimodale Doubao

`src/lib/jarvis/vision.ts` — `VisionEngine` enrichi de `"doubao"`, bloc entre
Ollama LLaVA et OpenAI : `POST {DOUBAO_BASE}/chat/completions` avec
`content: [text, image_url]`, modèle `DOUBAO_VISION_MODEL ?? DOUBAO_MODEL`.

## 3. Contrôle du PC « façon humaine »

`src/lib/jarvis/engine.ts`

- Raccourcis clavier : copier / couper / coller / tout sélectionner /
  enregistrer (sous…) / annuler / rétablir / nouveau document / gras / italique.
- Fermer une application nommée (`ferme word`, `quitte chrome`…).
- Créer un dossier (`crée un dossier Projet dans le bureau`).
- Modifier un document Word existant (`ajoute … dans le document …`) et
  `ouvre le document …`.
- Correctif : clés dupliquées `discord` / `spotify` dans `appLocals`
  (erreur `TS1117` introduite par le patch) + mapping `code → vscode`.

`public/jarvis-node/jarvis-agent.py` : table `HOTKEY_ACTIONS`, `do_hotkey`,
presse-papiers (`_set_clipboard_text` / `_get_clipboard_text`), fermeture
d'applications, édition Word, et nouveaux raccourcis d'applications
(Telegram, WhatsApp, Obsidian, Notepad++, OneDrive, Teams, Code).
Nouveau : `public/jarvis-node/word_helper.ps1`.

## 4. File de commandes mobile → PC → mobile

Audit §6.2 : « la réponse du poste principal n'est pas rapatriée ».

- `src/app/api/remote/route.ts` : `GET` marque la commande consommée en
  `running` (au lieu de `done`), `PATCH` la passe en `done` avec la réponse.
- `src/app/page.tsx` : `send(text, onRemoteReply?)` renvoie la réponse de
  Jarvis ; le consommateur de la file appelle `PATCH /api/remote` avec
  `{ id, reply }`.
- `src/app/mobile/page.tsx` : après l'accusé « Commande transmise… »,
  `pollRemoteReply()` interroge `/api/remote/status?id=` toutes les 2 s
  (20 essais max), remplace l'accusé par la réponse et la prononce.

## 5. Robustesse et lanceur Windows

- `src/app/api/node/route.ts` : un payload JSON corrompu passe en `error`
  au lieu de bloquer toute la file de jobs.
- `packaging/windows/Start-Jarvis.ps1` : chargement automatique des variables
  du fichier `.env` (clés LLM, Doubao, options gratuites) avant le démarrage
  de Node.

## 6. Configuration

- `.env.example` (racine) : toutes les variables, `DOUBAO_*` en tête.
- `docs/env.example-doubao.txt` : modèle fourni avec les notes d'installation.

## Vérifications

| Contrôle | Résultat |
|---|---|
| `npx next typegen` / `tsc --noEmit` / `npm run build` | ✅ |
| `GET /api/health` | `{"ok":true}` |
| `GET /api/brain` (sans clé) | candidat `doubao: configured false`, repli `rules` |
| `GET /api/brain` avec `DOUBAO_API_KEY` + `DOUBAO_FIRST=1` | `engine: "doubao"`, `configured: true` |
| `POST /api/chat` | réponse du moteur de règles + historique PostgreSQL |
| `GET /api/search?q=…` | `200`, repli DuckDuckGo + Wikipédia |
| Boucle `POST /api/remote` → `GET` → `PATCH` → `GET status` | `done` + réponse rapatriée |

### Activation réelle de Doubao

Renseigner `DOUBAO_API_KEY` (et `DOUBAO_MODEL` = nom ou endpoint `ep-…`)
dans `.env`, puis `DOUBAO_FIRST=1` si Doubao doit répondre en premier.
