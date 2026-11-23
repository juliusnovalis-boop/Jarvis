# Plan — Faire de J.A.R.V.I.S. un Doubao personnel

**Objectif** : brancher le cerveau de Jarvis (`brain.ts`) sur un modèle **Doubao** (ByteDance / Volcengine) comme assistant personnel, tout en conservant la cascade de secours actuelle (Ollama local puis autres clouds, puis règles déterministes).
**Principe** : Doubao expose une API **compatible OpenAI** (`/chat/completions`) ; le projet possède déjà une fonction générique `askOpenAICompatible()`. Le patch est donc petit, localisé et réversible.

---

## 1. Où vit le cerveau aujourd'hui

- `src/lib/jarvis/brain.ts`
  - `askBrain(messages)` : cascade actuelle **Ollama → Gemini → Groq → Mistral → DeepSeek → OpenRouter → OpenAI → Anthropic**, puis `null` (le moteur de règles répond alors).
  - `brainStatus()` : statut affiché par l'onglet Cerveau (`GET /api/brain`).
  - `askOpenAICompatible(messages, endpoint, key, model)` : fonction générique utilisable par Groq, Mistral, DeepSeek, OpenRouter. **Doubao peut l'utiliser telle quelle.**
- `src/lib/jarvis/vision.ts` : vision sémantique Ollama LLaVA → OpenAI → Anthropic (extension Doubao visuel optionnelle).
- `src/lib/jarvis/websearch.ts` : la synthèse des réponses web appelle déjà `askBrain()` ; elle hérite automatiquement de Doubao sans autre changement.
- `src/app/api/brain/route.ts` : aucun changement nécessaire (statut et modèle Ollama uniquement).

## 2. Choix possibles pour « Doubao »

| Option | Clé requise | Effort | Commentaire |
|---|---|---|---|
| **A. Volcengine Ark natif** (`ark.cn-beijing.volces.com`, compat OpenAI) | `DOUBAO_API_KEY` (console Volcengine / ARK) | Petit patch `brain.ts` | Cible directe « modèle Doubao » ; modèles texte et multimodaux |
| **B. OpenRouter avec un modèle doubao** | `OPENROUTER_API_KEY` (clé déjà attendue par le code) | **Zéro code** si un modèle doubao est disponible sur OpenRouter | Rebouclage immédiat ; dépend du catalogue OpenRouter |
| **C. Autre endpoint compatible OpenAI** (proxy, déploiement privé) | `DOUBAO_API_KEY` + `DOUBAO_BASE_URL` | Petit patch identique à A | Utile si un reverse proxy existe |

> À décider ensemble (questions en section 8). Le patch ci-dessous couvre A et C ; B se fait par simple variable d'environnement.

## 3. Variables d'environnement proposées

| Variable | Rôle | Défaut conseillé |
|---|---|---|
| `DOUBAO_API_KEY` | Clé secrète Ark / compatible | _(à renseigner ensemble)_ |
| `DOUBAO_BASE_URL` | Base API | `https://ark.cn-beijing.volces.com/api/v3` |
| `DOUBAO_MODEL` | Modèle texte (ID Ark `ep-…` ou nom `doubao-…`) | `doubao-seed-1-6-flash-250615` (à confirmer selon le compte) |
| `DOUBAO_VISION_MODEL` | Modèle image (optionnel) | identique au texte si le modèle est multimodal |
| `DOUBAO_FIRST` | `1` = Doubao répond en premier ; `0` = après Ollama local | `1` (comportement « Doubao personnel ») |
| `DOUBAO_MAX_TOKENS` | Longueur de réponse | `400` (cohérent avec les autres fournisseurs) |

Modèles Ark usuels à vérifier dans la console Volcengine (les identités exactes dépendent des accès du compte) : familles **Doubao-Seed 1.6**, **Doubao-1.5-pro / lite / vision**. La console fournit soit un **endpoint ID** (`ep-2025xxxxxx-yyyyy`) à placer dans `DOUBAO_MODEL`, soit un nom de modèle directement.

## 4. Patch proposé (source `src/lib/jarvis/brain.ts`)

### 4.1 Type et constantes

```ts
export type BrainEngine =
  | "ollama" | "doubao" | "gemini" | "groq" | "mistral" | "deepseek"
  | "openrouter" | "openai" | "anthropic" | "rules";
```

```ts
const DOUBAO_KEY = () => process.env.DOUBAO_API_KEY ?? "";
const DOUBAO_BASE = () =>
  (process.env.DOUBAO_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "");
const DOUBAO_MODEL = () => process.env.DOUBAO_MODEL ?? "doubao-seed-1-6-flash-250615";
const DOUBAO_FIRST = () => ["1", "true", "yes", "first"].includes((process.env.DOUBAO_FIRST ?? "1").toLowerCase());
```

### 4.2 Statut (`brainStatus()`, liste `candidates`)

```ts
{ engine: "doubao", configured: Boolean(DOUBAO_KEY()),
  detail: DOUBAO_KEY() ? DOUBAO_MODEL() : "clé absente" },
```

Et la sélection du moteur actif, par exemple juste après le bloc Ollama local :

```ts
if (DOUBAO_KEY()) {
  return { engine: "doubao", available: true, model: DOUBAO_MODEL(),
           detail: "Doubao (Volcengine Ark)", candidates };
}
```

### 4.3 Cascade (`askBrain`) — appel réutilisant `askOpenAICompatible`

```ts
// T1 : Doubao prioritaire (assistant personnel par défaut)
if (DOUBAO_FIRST() && DOUBAO_KEY()) {
  const text = await askOpenAICompatible(
    messages,
    `${DOUBAO_BASE()}/chat/completions`,
    DOUBAO_KEY(),
    DOUBAO_MODEL()
  );
  if (text) return { text, engine: "doubao", model: DOUBAO_MODEL() };
}

// ... bloc Ollama/Gemini existant ...

// T2 : si DOUBAO_FIRST=0, repli cloud avant OpenAI
if (!DOUBAO_FIRST() && DOUBAO_KEY()) {
  const text = await askOpenAICompatible(
    messages,
    `${DOUBAO_BASE()}/chat/completions`,
    DOUBAO_KEY(),
    DOUBAO_MODEL()
  );
  if (text) return { text, engine: "doubao", model: DOUBAO_MODEL() };
}
```

`askOpenAICompatible` envoie déjà `{ model, messages, temperature: 0.7, max_tokens }` avec en-tête `Authorization: Bearer …`, ce qui est exactement le contrat Ark/OpenAI.

### 4.4 Interface (cosmétique)

`components/jarvis/BrainPanel.tsx` : ajouter une entrée dans `LABELS`, par ex.

```ts
doubao: { name: "Doubao", icon: Sparkles, tag: "PRIORITAIRE" },
```

### 4.5 Vision optionnelle (`src/lib/jarvis/vision.ts`)

Après le bloc Ollama LLaVA, avant OpenAI :

```ts
if (process.env.DOUBAO_API_KEY) {
  // POST ${DOUBAO_BASE()}/chat/completions avec content: [ {type:"text",…}, {type:"image_url", image_url:{url:dataUrl}} ]
  // model: process.env.DOUBAO_VISION_MODEL ?? DOUBAO_MODEL()
  // engine: "doubao"
}
```

(À n'activer que si le compte dispose d'un modèle visuel ; sinon les replis OpenAI/Anthropic restent seuls disponibles.)

## 5. Où ranger la clé (sécurité avant tout)

Règles : **jamais dans le ZIP ni dans Git**, jamais en clair dans les scripts versionnés, jamais partagé dans les journaux.

| Méthode | Mise en œuvre | Avantages | Inconvénients |
|---|---|---|---|
| **1. `app\.env`** (recommandé) | Fichier `C:\Program Files\Jarvis\app\.env` ; Next charge les variables serveur au démarrage | Central, non versionné, redémarrage suffisant | Nécessite les droits administrateur pour écrire sous `Program Files` |
| **2. Bloc env dans `Start-Jarvis.ps1`** | Ajouter `$env:DOUBAO_API_KEY = "…"` avant le démarrage Node | Aucun autre fichier à créer | Clé visible dans le script (protéger par ACL) |
| **3. Données `%LOCALAPPDATA%\JarvisCompleteData\.env`** + lecture par le lanceur | Lecture PowerShell et injection dans l'environnement enfant | Hors `Program Files`, persistant | Nécessite une petite modification du `.ps1` |

Modèle de fichier fourni à côté de ce rapport : **`env.example-doubao.txt`** (à copier en `.env` après renseignement de la clé).

## 6. Mise en œuvre technique (build et déploiement)

Le ZIP source ne contient pas `node_modules` ; le build se fait sur une machine Node (le PC embarque Node 22, mais pour la compilation il vaut mieux le Node de développement avec npm).

1. **Préparer le dossier source** (déjà extrait dans ce projet sous `jarvis-source\`).
2. `npm install` dans `jarvis-source\`.
3. Appliquer le patch section 4 (ou me demander de l'appliquer directement).
4. `npm run build` → sortie `.next/standalone` (configuration `output: "standalone"` déjà présente).
5. Déployer :
   - remplacer le contenu de `C:\Program Files\Jarvis\app\` par `standalone\` + `.next\static` + `public\` (avec droits administrateur) ;
   - **ne pas toucher** à `runtime\`, `agent\`, `desktop\`, ni à `%LOCALAPPDATA%\JarvisCompleteData\postgres\`.
6. Créer le `.env` (section 5).
7. Redémarrer via `LANCER-JARVIS.bat` (ou `Arrêter Jarvis.bat` puis `Ouvrir Jarvis.lnk`).
8. Vérifications (section 7).

> Variante rapide sans rebuild : si l'option B (OpenRouter) est retenue, seule la variable `OPENROUTER_API_KEY` + `OPENROUTER_MODEL=doubao/…` est nécessaire, car le code appelle déjà OpenRouter.

## 7. Campagne de recette après branchement

| Test | Attendu |
|---|---|
| `GET /api/brain` | `brain.engine: "doubao"`, candidat `doubao` `configured: true`, détail = nom du modèle |
| `POST /api/chat` « explique-moi simplement la photosynthèse » | `engine: "doubao"`, réponse concise FR, sans markdown |
| Question web « capitale du Gabon » | synthèse produite par Doubao **avec sources** (la recherche fédérée alimente le contexte) |
| `POST /api/chat` « quelle heure est-il » | reste déterministe (rules/engine local), sans appel LLM |
| Sans clé (retrait du `.env`) | repli sur Ollama puis autres fournisseurs puis règles ; aucune erreur bloquante |
| `POST /api/vision` (si modèle visuel) | `engine: "doubao"` ; sinon repli métriques locales |
| Persistance | réponses enregistrées dans `messages` ; tâches/notes inchangées |

## 8. Décisions à trancher ensemble avant le code

1. **Fournisseur** : Ark natif (A), OpenRouter avec modèle doubao (B), autre endpoint (C) ?
2. **Position de Doubao** : prioritaire (`DOUBAO_FIRST=1`, comportement « assistant Doubao ») ou secondaire derrière Ollama local ?
3. **Modèle texte** : modèle rapide par défaut (type flash/seed-lite) ou modèle puissant (pro) ; ID exact depuis la console si Ark.
4. **Emplacement de la clé** : `app\.env`, `Start-Jarvis.ps1`, ou dossier données `%LOCALAPPDATA%` ?
5. **Personnalité** : conserver l'identité « J.A.R.V.I.S. » avec la voix de réponse FR actuelle, ou adopter un prompt personnel (nom de l'utilisateur, ton, domaine favori — la table `memories` stocke déjà `user_name` et `default_city`) ?
6. **Vision Doubao** : activer la description d'image multimodale maintenant, ou plus tard ?

## 9. Garde-fous et limites à garder en tête

- Les commandes locales (heure, calcul, fichiers, PC, domotique, sport) restent **déterministes et hors LLM** : pas de dépendance réseau pour les actions critiques.
- Les clés cloud sortent vers l'API : les prompts et le contexte local partagé (notes, tâches) partent au fournisseur. Pour un usage strictement privé, garder Ollama local en priorité et Doubao en secours.
- Le quotient/appel Ark est facturé au token ; `max_tokens: 400` et température 0.7 conservent un coût maîtrisé, comme les autres providers.
- Aucune clé ne doit être écrite dans `RAPPORT-AUDIT-JARVIS.md`, dans le README, ni dans les artifacts remis au présent projet.
