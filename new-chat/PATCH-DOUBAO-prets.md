# Patch prêt à appliquer — Doubao dans le cerveau J.A.R.V.I.S.

Cibles :
1. `src/lib/jarvis/brain.ts`
2. `src/lib/jarvis/vision.ts` (optionnel, vision multimodale)
3. `src/components/jarvis/BrainPanel.tsx` (étiquette UI)
4. Lanceur : injection des clés (au choix, section 5 du plan)

Tous les blocs sont des ajouts ; aucune ligne existante ne supprime une fonction actuelle. En cas de clé absente, `DOUBAO_KEY()` est vide et la cascade existante se comporte exactement comme avant.

---

## 1. `src/lib/jarvis/brain.ts`

### 1.1 Type `BrainEngine` — ajouter `"doubao"`

```ts
export type BrainEngine =
  | "ollama" | "doubao" | "gemini" | "groq" | "mistral" | "deepseek"
  | "openrouter" | "openai" | "anthropic" | "rules";
```

### 1.2 Constantes — après la ligne `const OPENROUTER_MODEL = ...`

```ts
/* ---- Doubao (Volcengine Ark, compatible OpenAI) ---- */
const DOUBAO_KEY = () => process.env.DOUBAO_API_KEY ?? "";
const DOUBAO_BASE = () =>
  (process.env.DOUBAO_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "");
const DOUBAO_MODEL = () => process.env.DOUBAO_MODEL ?? "doubao-seed-1-6-flash-250615";
const DOUBAO_VISION_MODEL = () => process.env.DOUBAO_VISION_MODEL ?? "";
const DOUBAO_FIRST = () =>
  ["1", "true", "yes", "first"].includes((process.env.DOUBAO_FIRST ?? "1").toLowerCase());
```

### 1.3 `brainStatus()` — liste `candidates` : insérer après le candidat `ollama`

```ts
{
  engine: "doubao",
  configured: Boolean(DOUBAO_KEY()),
  detail: DOUBAO_KEY() ? DOUBAO_MODEL() : "clé absente",
},
```

### 1.4 `brainStatus()` — moteur actif : insérer juste après le bloc Ollama local

```ts
if (DOUBAO_KEY()) {
  return {
    engine: "doubao",
    available: true,
    model: DOUBAO_MODEL(),
    detail: "Doubao (Volcengine Ark)",
    candidates,
  };
}
```

### 1.5 `askBrain(messages)` — deux blocs

Au tout début de `askBrain`, **avant** le bloc Ollama :

```ts
// Priorité 1 : Doubao comme assistant personnel par défaut
if (DOUBAO_FIRST() && DOUBAO_KEY()) {
  const text = await askOpenAICompatible(
    messages,
    `${DOUBAO_BASE()}/chat/completions`,
    DOUBAO_KEY(),
    DOUBAO_MODEL()
  );
  if (text) return { text, engine: "doubao", model: DOUBAO_MODEL() };
}
```

Juste **avant** le bloc `if (process.env.OPENAI_API_KEY)` :

```ts
// Priorité 2 : Doubao en secours cloud si DOUBAO_FIRST=0
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

> `askOpenAICompatible(messages, endpoint, key, model)` existe déjà et envoie
> `{ model, messages, temperature: 0.7, max_tokens: 400 }` avec `Authorization: Bearer <key>`.

---

## 2. `src/lib/jarvis/vision.ts` (optionnel)

### 2.1 Type `VisionEngine`

```ts
export type VisionEngine = "local" | "ollama-llava" | "doubao" | "openai" | "anthropic";
```

### 2.2 Nouveau bloc entre LLaVA et OpenAI

```ts
// 2. Doubao multimodal (Ark, compatible OpenAI vision)
if (process.env.DOUBAO_API_KEY && DOUBAO_VISION_MODEL_OR_FALLBACK()) {
  try {
    const model = process.env.DOUBAO_VISION_MODEL || process.env.DOUBAO_MODEL || "doubao-seed-1-6-flash-250615";
    const res = await fetch(
      `${(process.env.DOUBAO_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.DOUBAO_API_KEY}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(40_000),
        body: JSON.stringify({
          model,
          max_tokens: 220,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: VISION_PROMPT },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${raw}` } },
              ],
            },
          ],
        }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      const text = sanitize(data?.choices?.[0]?.message?.content ?? "");
      if (text) return { text, engine: "doubao" };
    }
  } catch {
    /* backend suivant */
  }
}
```

Condition d'activation pratique : ne créer le bloc que si la console Ark confirme un modèle multimodal ; sinon les replis OpenAI/Anthropic restent seuls actifs.

---

## 3. `src/components/jarvis/BrainPanel.tsx`

Dans l'objet `LABELS` (qui contient déjà `ollama`, `gemini`, `groq`…) :

```ts
doubao: { name: "Doubao", icon: Sparkles, tag: "PRIORITAIRE" },
```

Ajouter `Sparkles` à l'import `lucide-react` si absent.

---

## 4. Variables d'environnement (cf. `env.example-doubao.txt`)

```dotenv
DOUBAO_API_KEY=********
DOUBAO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
DOUBAO_MODEL=doubao-seed-1-6-flash-250615
DOUBAO_VISION_MODEL=
DOUBAO_FIRST=1
```

---

## 5. Injection au lanceur (si choix = `Start-Jarvis.ps1`)

Dans `packaging/windows/Start-Jarvis.ps1`, juste avant le démarrage Node :

```powershell
# --- Cerveau Doubao (clés locales, ne pas versionner) ---
$env:DOUBAO_API_KEY   = "COLLEZ_LA_CLE_ICI"
$env:DOUBAO_BASE_URL  = "https://ark.cn-beijing.volces.com/api/v3"
$env:DOUBAO_MODEL     = "doubao-seed-1-6-flash-250615"
$env:DOUBAO_FIRST     = "1"
```

Si choix = `app\.env` : aucune modification de script nécessaire (Next charge `.env` côté serveur au démarrage, répertoire de travail `app\`).

---

## 6. Build et recette

```powershell
cd jarvis-source
npm install
# appliquer les patchs ci-dessus
npm run build
# copier .next\standalone (et .next\static, public) vers C:\Program Files\Jarvis\app\
# poser .env dans app\ (ou variables dans le .ps1)
# LANCER-JARVIS.bat
```

Vérifications attendues :

1. `GET http://127.0.0.1:3210/api/brain` → `engine: "doubao"`, candidat `doubao` `configured: true`.
2. `POST /api/chat` : question générale → champ `engine: "doubao"`.
3. Question web → sources conservées + synthèse Doubao.
4. Sans clé → repli cascade puis `rules`, aucune erreur 500.

## 7. Points à confirmer avant exécution

- Fournisseur : Ark natif / OpenRouter / autre endpoint.
- Position : `DOUBAO_FIRST=1` ou `0`.
- Modèle texte (ID `ep-…` ou nom exact).
- Emplacement de la clé : `app\.env`, `.ps1`, ou `.env` dans `%LOCALAPPDATA%\JarvisCompleteData`.
- Activation ou non de la vision multimodale Doubao.
