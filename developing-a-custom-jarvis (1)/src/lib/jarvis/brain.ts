/**
 * 🧠 CERVEAU DE JARVIS — multi-backends avec dégradation gracieuse
 *
 * Ordre de priorité :
 *  1. OLLAMA (100 % local, gratuit, privé)  → OLLAMA_URL + OLLAMA_MODEL
 *  2. OpenAI                                 → OPENAI_API_KEY
 *  3. Anthropic                              → ANTHROPIC_API_KEY
 *  4. Moteur de règles interne (toujours disponible, zéro dépendance)
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memories } from "@/db/schema";

export type BrainEngine =
  | "ollama" | "gemini" | "groq" | "mistral" | "deepseek"
  | "openrouter" | "openai" | "anthropic" | "rules";

export interface BrainStatus {
  engine: BrainEngine;
  available: boolean;
  model: string | null;
  detail: string;
  candidates: { engine: BrainEngine; configured: boolean; detail: string }[];
}

export interface BrainMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const OLLAMA_URL = () => (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
const OLLAMA_MODEL = () => process.env.OLLAMA_MODEL ?? "llama3.1";
const OPENAI_MODEL = () => process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const ANTHROPIC_MODEL = () => process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest";
const GEMINI_KEY = () => process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
const GEMINI_MODEL = () => process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
const GROQ_MODEL = () => process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
const MISTRAL_MODEL = () => process.env.MISTRAL_MODEL ?? "mistral-small-latest";
const DEEPSEEK_MODEL = () => process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
const OPENROUTER_MODEL = () => process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free";

export const SYSTEM_PROMPT = `Tu es J.A.R.V.I.S., l'assistant personnel inspiré d'Iron Man.
Tu es intelligent, concis, légèrement spirituel mais toujours serviable et respectueux.
Tu es MULTILINGUE : tu réponds dans la langue utilisée par l'utilisateur (français ou anglais),
naturellement et en 2 à 3 phrases maximum, sauf si l'utilisateur demande explicitement plus de détails.
Sauf demande de code, ta réponse sera lue à voix haute : n'utilise jamais de markdown, de listes à puces,
d'emojis ni de caractères spéciaux. Écris les nombres de façon prononçable.`;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

/* ------------------------------------------------------------------ */
/* Détection des backends                                              */
/* ------------------------------------------------------------------ */

/**
 * Taille d'un modele en milliards de parametres, lue dans son nom
 * (llama3.2:3b, qwen2.5:7b-instruct, phi3:mini...). Renvoie null si inconnue.
 */
export function modelSizeB(name: string): number | null {
  const m = name.toLowerCase().match(/[:\-_](\d+(?:[.,]\d+)?)\s*b\b/);
  if (m) return parseFloat(m[1].replace(",", "."));
  if (/\bmini\b|\bsmall\b|tiny|1_5b|0_5b/.test(name.toLowerCase())) return 3;
  return null;
}

/** Plafond de taille : par defaut 6 milliards de parametres. */
const MAX_MODEL_B = () => {
  const v = parseFloat(process.env.OLLAMA_MAX_PARAMS_B ?? "6");
  return Number.isFinite(v) && v > 0 ? v : 6;
};

/** Ne garde que les modeles <= plafond ; les tailles inconnues sont acceptees. */
export function filterBySize(models: string[]): string[] {
  const max = MAX_MODEL_B();
  const ok = models.filter((m) => {
    const size = modelSizeB(m);
    return size === null || size <= max;
  });
  return ok.length ? ok : [];
}

export interface OllamaModelInfo {
  name: string;
  sizeB: number | null;
  allowed: boolean;
  bytes: number;
}

export async function probeOllama(): Promise<{
  up: boolean;
  models: string[];
  catalog: OllamaModelInfo[];
}> {
  try {
    const res = await withTimeout(
      fetch(`${OLLAMA_URL()}/api/tags`, { cache: "no-store" }),
      2500
    );
    if (!res.ok) return { up: false, models: [], catalog: [] };
    const data = await res.json();
    const raw: { name: string; size?: number }[] = data?.models ?? [];
    const max = MAX_MODEL_B();
    const catalog: OllamaModelInfo[] = raw.map((m) => {
      const sizeB = modelSizeB(m.name);
      return {
        name: m.name,
        sizeB,
        allowed: sizeB === null || sizeB <= max,
        bytes: m.size ?? 0,
      };
    });
    // Respecte le plafond de taille demande (6B par defaut).
    return { up: true, models: filterBySize(raw.map((m) => m.name)), catalog };
  } catch {
    return { up: false, models: [], catalog: [] };
  }
}

/* ---- Modele Ollama choisi depuis l'interface ---- */

const OLLAMA_PREF_KEY = "ollama_model";

export async function getPreferredOllamaModel(): Promise<string | null> {
  try {
    const rows = await db.select().from(memories).where(eq(memories.key, OLLAMA_PREF_KEY)).limit(1);
    const value = rows[0]?.value?.trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

export async function setPreferredOllamaModel(model: string | null): Promise<void> {
  const value = model?.trim() ?? "";
  await db
    .insert(memories)
    .values({ key: OLLAMA_PREF_KEY, value })
    .onConflictDoUpdate({ target: memories.key, set: { value, updatedAt: new Date() } });
}

/** Modele retenu : choix de l'utilisateur s'il reste disponible, sinon automatique. */
export function resolveOllamaModel(available: string[], preferred: string | null): string {
  if (preferred && available.includes(preferred)) return preferred;
  if (preferred) {
    const loose = available.find((m) => m.split(":")[0] === preferred.split(":")[0]);
    if (loose) return loose;
  }
  return available.find((m) => m.startsWith(OLLAMA_MODEL())) ?? available[0] ?? OLLAMA_MODEL();
}

export async function brainStatus(): Promise<BrainStatus> {
  const ollama = await probeOllama();
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);

  const candidates: BrainStatus["candidates"] = [
    {
      engine: "ollama",
      configured: ollama.up,
      detail: ollama.up
        ? `${ollama.models.length} modèle${ollama.models.length > 1 ? "s" : ""} local${ollama.models.length > 1 ? "aux" : ""}`
        : "serveur hors ligne",
    },
    { engine: "gemini", configured: Boolean(GEMINI_KEY()), detail: GEMINI_KEY() ? GEMINI_MODEL() : "clé absente" },
    { engine: "groq", configured: Boolean(process.env.GROQ_API_KEY), detail: process.env.GROQ_API_KEY ? GROQ_MODEL() : "clé absente" },
    { engine: "mistral", configured: Boolean(process.env.MISTRAL_API_KEY), detail: process.env.MISTRAL_API_KEY ? MISTRAL_MODEL() : "clé absente" },
    { engine: "deepseek", configured: Boolean(process.env.DEEPSEEK_API_KEY), detail: process.env.DEEPSEEK_API_KEY ? DEEPSEEK_MODEL() : "clé absente" },
    { engine: "openrouter", configured: Boolean(process.env.OPENROUTER_API_KEY), detail: process.env.OPENROUTER_API_KEY ? OPENROUTER_MODEL() : "clé absente" },
    { engine: "openai", configured: hasOpenAI, detail: hasOpenAI ? OPENAI_MODEL() : "clé absente" },
    { engine: "anthropic", configured: hasAnthropic, detail: hasAnthropic ? ANTHROPIC_MODEL() : "clé absente" },
    { engine: "rules", configured: true, detail: "moteur d'intentions interne" },
  ];

  if (ollama.up && ollama.models.length) {
    const preferred = await getPreferredOllamaModel();
    const model = resolveOllamaModel(ollama.models, preferred);
    return {
      engine: "ollama",
      available: true,
      model,
      detail: preferred === model ? "100 % local · modèle choisi" : "100 % local et privé",
      candidates,
    };
  }
  if (GEMINI_KEY()) {
    return { engine: "gemini", available: true, model: GEMINI_MODEL(), detail: "Google Gemini", candidates };
  }
  if (process.env.GROQ_API_KEY) {
    return { engine: "groq", available: true, model: GROQ_MODEL(), detail: "Groq (ultra rapide)", candidates };
  }
  if (process.env.MISTRAL_API_KEY) {
    return { engine: "mistral", available: true, model: MISTRAL_MODEL(), detail: "Mistral AI", candidates };
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return { engine: "deepseek", available: true, model: DEEPSEEK_MODEL(), detail: "DeepSeek", candidates };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return { engine: "openrouter", available: true, model: OPENROUTER_MODEL(), detail: "OpenRouter", candidates };
  }
  if (hasOpenAI) {
    return { engine: "openai", available: true, model: OPENAI_MODEL(), detail: "cloud OpenAI", candidates };
  }
  if (hasAnthropic) {
    return { engine: "anthropic", available: true, model: ANTHROPIC_MODEL(), detail: "cloud Anthropic", candidates };
  }
  return { engine: "rules", available: true, model: null, detail: "moteur d'intentions interne", candidates };
}

/* ------------------------------------------------------------------ */
/* Génération                                                          */
/* ------------------------------------------------------------------ */

export interface BrainReply {
  text: string;
  engine: BrainEngine;
  model: string | null;
}

/** Interroge strictement Ollama, sans bascule cloud (vie privee explicite). */
export async function askLocalBrain(
  userInput: string,
  history: BrainMessage[] = [],
  extraContext = ""
): Promise<BrainReply | null> {
  const ollama = await probeOllama();
  if (!ollama.up || !ollama.models.length) return null;
  const model = resolveOllamaModel(ollama.models, await getPreferredOllamaModel());
  const system =
    SYSTEM_PROMPT +
    `\nDate et heure actuelles : ${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}.` +
    (extraContext ? `\nContexte :\n${extraContext}` : "");
  const messages: BrainMessage[] = [
    { role: "system", content: system },
    ...history.slice(-10),
    { role: "user", content: userInput },
  ];
  const text = await askOllama(messages, model);
  return text ? { text, engine: "ollama", model } : null;
}

/** Interroge le meilleur LLM disponible. Renvoie null si aucun n'est joignable. */
export async function askBrain(
  userInput: string,
  history: BrainMessage[] = [],
  extraContext = ""
): Promise<BrainReply | null> {
  const system =
    SYSTEM_PROMPT +
    `\nDate et heure actuelles : ${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}.` +
    (extraContext ? `\nContexte mémoire pertinent :\n${extraContext}` : "");

  const messages: BrainMessage[] = [
    { role: "system", content: system },
    ...history.slice(-10),
    { role: "user", content: userInput },
  ];

  const ollama = await probeOllama();
  if (ollama.up && ollama.models.length) {
    const model = resolveOllamaModel(ollama.models, await getPreferredOllamaModel());
    const text = await askOllama(messages, model);
    if (text) return { text, engine: "ollama", model };
  }
  if (GEMINI_KEY()) {
    const text = await askGemini(messages);
    if (text) return { text, engine: "gemini", model: GEMINI_MODEL() };
  }
  if (process.env.GROQ_API_KEY) {
    const text = await askOpenAICompatible(
      messages, "https://api.groq.com/openai/v1/chat/completions",
      process.env.GROQ_API_KEY, GROQ_MODEL());
    if (text) return { text, engine: "groq", model: GROQ_MODEL() };
  }
  if (process.env.MISTRAL_API_KEY) {
    const text = await askOpenAICompatible(
      messages, "https://api.mistral.ai/v1/chat/completions",
      process.env.MISTRAL_API_KEY, MISTRAL_MODEL());
    if (text) return { text, engine: "mistral", model: MISTRAL_MODEL() };
  }
  if (process.env.DEEPSEEK_API_KEY) {
    const text = await askOpenAICompatible(
      messages, "https://api.deepseek.com/chat/completions",
      process.env.DEEPSEEK_API_KEY, DEEPSEEK_MODEL());
    if (text) return { text, engine: "deepseek", model: DEEPSEEK_MODEL() };
  }
  if (process.env.OPENROUTER_API_KEY) {
    const text = await askOpenAICompatible(
      messages, "https://openrouter.ai/api/v1/chat/completions",
      process.env.OPENROUTER_API_KEY, OPENROUTER_MODEL());
    if (text) return { text, engine: "openrouter", model: OPENROUTER_MODEL() };
  }
  if (process.env.OPENAI_API_KEY) {
    const text = await askOpenAI(messages);
    if (text) return { text, engine: "openai", model: OPENAI_MODEL() };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const text = await askAnthropic(messages);
    if (text) return { text, engine: "anthropic", model: ANTHROPIC_MODEL() };
  }
  return null;
}

async function askOllama(messages: BrainMessage[], model: string): Promise<string | null> {
  try {
    const res = await withTimeout(
      fetch(`${OLLAMA_URL()}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: { temperature: 0.7, num_predict: 220 },
        }),
      }),
      45_000
    );
    if (!res.ok) return null;
    const data = await res.json();
    const text: string = data?.message?.content ?? "";
    return clean(text);
  } catch {
    return null;
  }
}


/* ---- Google Gemini ---- */
async function askGemini(messages: BrainMessage[]): Promise<string | null> {
  const key = GEMINI_KEY();
  if (!key) return null;
  try {
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const res = await withTimeout(
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL()}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            contents,
            systemInstruction: system ? { parts: [{ text: system }] } : undefined,
            generationConfig: { temperature: 0.7, maxOutputTokens: 400 },
          }),
        }
      ),
      30_000
    );
    if (!res.ok) return null;
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    return clean(parts.map((p: { text?: string }) => p.text ?? "").join(" "));
  } catch {
    return null;
  }
}

/** Fournisseurs compatibles OpenAI : Groq, Mistral, DeepSeek, OpenRouter. */
async function askOpenAICompatible(
  messages: BrainMessage[],
  endpoint: string,
  key: string,
  model: string
): Promise<string | null> {
  if (!key) return null;
  try {
    const res = await withTimeout(
      fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        cache: "no-store",
        body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 400 }),
      }),
      30_000
    );
    if (!res.ok) return null;
    const data = await res.json();
    return clean(data?.choices?.[0]?.message?.content ?? "");
  } catch {
    return null;
  }
}

async function askOpenAI(messages: BrainMessage[]): Promise<string | null> {
  try {
    const res = await withTimeout(
      fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        cache: "no-store",
        body: JSON.stringify({ model: OPENAI_MODEL(), messages, temperature: 0.7, max_tokens: 300 }),
      }),
      30_000
    );
    if (!res.ok) return null;
    const data = await res.json();
    return clean(data?.choices?.[0]?.message?.content ?? "");
  } catch {
    return null;
  }
}

async function askAnthropic(messages: BrainMessage[]): Promise<string | null> {
  try {
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const rest = messages.filter((m) => m.role !== "system");
    const res = await withTimeout(
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
          "anthropic-version": "2023-06-01",
        },
        cache: "no-store",
        body: JSON.stringify({ model: ANTHROPIC_MODEL(), system, messages: rest, max_tokens: 400 }),
      }),
      30_000
    );
    if (!res.ok) return null;
    const data = await res.json();
    return clean(data?.content?.[0]?.text ?? "");
  } catch {
    return null;
  }
}

/** Nettoie la sortie LLM pour la synthèse vocale. */
function clean(text: string): string | null {
  const out = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/[*_`#>]/g, "")
    .replace(/^\s*[-•]\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return out.length > 1 ? out : null;
}
