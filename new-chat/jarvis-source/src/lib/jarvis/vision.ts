/**
 * 👁️ MODULE VISION — inspiré de Gemini Live / GPT-4V
 *
 *  Niveau 1 (toujours actif) : métriques calculées dans le navigateur
 *      luminosité, contraste, mouvement, visages (FaceDetector), teinte dominante
 *  Niveau 2 (si disponible)  : description sémantique par un modèle multimodal
 *      Ollama + LLaVA  →  GPT-4o  →  Claude
 */

export interface VisionMetrics {
  brightness: number;  // 0-100
  contrast: number;    // 0-100
  motion: number;      // 0-100
  faces: number;
  hue: string;         // nom de la teinte dominante
  sharpness: number;   // 0-100
}

export type VisionEngine = "local" | "ollama-llava" | "openai" | "anthropic";

const OLLAMA_URL = () => (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
const VISION_MODEL = () => process.env.OLLAMA_VISION_MODEL ?? "llava";

const VISION_PROMPT =
  "Tu es Jarvis, l'assistant d'Iron Man. Décris en français ce que tu vois sur cette image, " +
  "en deux phrases maximum, sur un ton posé et factuel. Pas de markdown, pas d'emoji. " +
  "Commence directement par la description.";

/** Analyse sémantique via un modèle multimodal. Renvoie null si aucun n'est disponible. */
export async function describeImage(
  base64Jpeg: string
): Promise<{ text: string; engine: VisionEngine } | null> {
  const raw = base64Jpeg.replace(/^data:image\/\w+;base64,/, "");

  // 1. Ollama + LLaVA (100 % local)
  try {
    const tags = await fetch(`${OLLAMA_URL()}/api/tags`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    }).then((r) => (r.ok ? r.json() : null));
    const models: string[] = (tags?.models ?? []).map((m: { name: string }) => m.name);
    const visionModel = models.find((m) => /llava|bakllava|llama3.2-vision|moondream|minicpm-v|qwen2.5vl/i.test(m));
    if (visionModel) {
      const res = await fetch(`${OLLAMA_URL()}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(90_000),
        body: JSON.stringify({
          model: visionModel,
          prompt: VISION_PROMPT,
          images: [raw],
          stream: false,
          options: { temperature: 0.4, num_predict: 160 },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = sanitize(data?.response ?? "");
        if (text) return { text, engine: "ollama-llava" };
      }
    }
  } catch {
    /* backend suivant */
  }

  // 2. OpenAI GPT-4o
  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(40_000),
        body: JSON.stringify({
          model: process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini",
          max_tokens: 220,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: VISION_PROMPT },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${raw}`, detail: "low" } },
              ],
            },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = sanitize(data?.choices?.[0]?.message?.content ?? "");
        if (text) return { text, engine: "openai" };
      }
    } catch {
      /* backend suivant */
    }
  }

  // 3. Anthropic Claude
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(40_000),
        body: JSON.stringify({
          model: process.env.ANTHROPIC_VISION_MODEL ?? "claude-3-5-sonnet-latest",
          max_tokens: 250,
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: "image/jpeg", data: raw } },
                { type: "text", text: VISION_PROMPT },
              ],
            },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = sanitize(data?.content?.[0]?.text ?? "");
        if (text) return { text, engine: "anthropic" };
      }
    } catch {
      /* fin de chaîne */
    }
  }

  return null;
}

/** Description déduite des seules métriques locales (toujours disponible, zéro réseau). */
export function describeFromMetrics(m: VisionMetrics): string {
  const parts: string[] = [];

  if (m.faces > 0) {
    parts.push(
      m.faces === 1
        ? "Je détecte une personne dans le champ de la caméra."
        : `Je détecte ${m.faces} personnes dans le champ de la caméra.`
    );
  } else {
    parts.push("Aucun visage détecté dans le champ pour l'instant.");
  }

  const lum =
    m.brightness < 18 ? "La scène est très sombre"
    : m.brightness < 38 ? "L'éclairage est faible"
    : m.brightness < 68 ? "L'éclairage est correct"
    : m.brightness < 86 ? "La scène est lumineuse"
    : "La scène est très lumineuse, presque surexposée";
  parts.push(`${lum}, à ${m.brightness} pour cent de luminosité, avec une dominante ${m.hue}.`);

  if (m.motion > 55) parts.push("Beaucoup de mouvement est en cours.");
  else if (m.motion > 18) parts.push("Je perçois un léger mouvement.");
  else parts.push("La scène est stable.");

  if (m.sharpness < 25) parts.push("L'image manque de netteté, pensez à ajuster la mise au point.");

  return parts.join(" ");
}

function sanitize(text: string): string | null {
  const out = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return out.length > 3 ? out : null;
}
