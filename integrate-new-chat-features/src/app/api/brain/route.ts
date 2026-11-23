import { NextRequest, NextResponse } from "next/server";
import {
  brainStatus,
  getPreferredOllamaModel,
  probeOllama,
  resolveOllamaModel,
  setPreferredOllamaModel,
} from "@/lib/jarvis/brain";
import { haConfigured } from "@/lib/jarvis/home";

export const dynamic = "force-dynamic";

/** État du cerveau + catalogue des modèles Ollama disponibles. */
export async function GET() {
  const [brain, ollama, preferred] = await Promise.all([
    brainStatus(),
    probeOllama(),
    getPreferredOllamaModel(),
  ]);

  const active = ollama.up && ollama.models.length
    ? resolveOllamaModel(ollama.models, preferred)
    : null;

  return NextResponse.json({
    brain,
    homeAssistant: haConfigured(),
    vision: {
      semantic:
        Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) ||
        brain.engine === "ollama",
    },
    ollama: {
      up: ollama.up,
      preferred,
      active,
      maxParamsB: Number(process.env.OLLAMA_MAX_PARAMS_B ?? "6"),
      models: ollama.catalog.map((m) => ({
        name: m.name,
        sizeB: m.sizeB,
        allowed: m.allowed,
        gib: m.bytes ? Math.round((m.bytes / 1024 ** 3) * 10) / 10 : null,
      })),
    },
  });
}

/** Choix du modèle Ollama depuis l'interface. Corps : { model: string | null } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const raw = typeof body?.model === "string" ? body.model.trim() : "";

    // Chaîne vide = retour au choix automatique.
    if (!raw) {
      await setPreferredOllamaModel(null);
      return NextResponse.json({ ok: true, preferred: null, mode: "automatique" });
    }

    const ollama = await probeOllama();
    const info = ollama.catalog.find((m) => m.name === raw);
    if (!info) {
      return NextResponse.json(
        { ok: false, error: `Le modèle « ${raw} » n'est pas installé dans Ollama.` },
        { status: 400 }
      );
    }
    if (!info.allowed) {
      const max = process.env.OLLAMA_MAX_PARAMS_B ?? "6";
      return NextResponse.json(
        {
          ok: false,
          error: `« ${raw} » fait ${info.sizeB} milliards de paramètres : au-delà de la limite de ${max} B que vous avez fixée.`,
        },
        { status: 400 }
      );
    }

    await setPreferredOllamaModel(raw);
    return NextResponse.json({ ok: true, preferred: raw, mode: "manuel" });
  } catch (error) {
    console.error("[JARVIS /api/brain POST]", error);
    return NextResponse.json({ ok: false, error: "Choix du modèle impossible." }, { status: 500 });
  }
}
