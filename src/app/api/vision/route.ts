import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { visionLogs } from "@/db/schema";
import { describeFromMetrics, describeImage, type VisionMetrics } from "@/lib/jarvis/vision";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const rows = await db.select().from(visionLogs).orderBy(desc(visionLogs.id)).limit(8);
  return NextResponse.json({
    logs: rows.map((r) => ({
      id: r.id, summary: r.summary, engine: r.engine,
      faces: r.faces, ts: r.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const image: string | undefined = typeof body?.image === "string" ? body.image : undefined;
    const metrics: VisionMetrics = {
      brightness: clamp(body?.metrics?.brightness),
      contrast: clamp(body?.metrics?.contrast),
      motion: clamp(body?.metrics?.motion),
      faces: Math.max(0, Math.min(20, Math.round(Number(body?.metrics?.faces ?? 0)))),
      hue: typeof body?.metrics?.hue === "string" ? body.metrics.hue : "neutre",
      sharpness: clamp(body?.metrics?.sharpness),
    };

    let summary = describeFromMetrics(metrics);
    let engine: string = "local";

    if (image) {
      const semantic = await describeImage(image);
      if (semantic) {
        engine = semantic.engine;
        const faceNote =
          metrics.faces > 0
            ? ` Capteurs : ${metrics.faces} visage${metrics.faces > 1 ? "s" : ""} détecté${metrics.faces > 1 ? "s" : ""}.`
            : "";
        summary = semantic.text + faceNote;
      }
    }

    await db.insert(visionLogs).values({
      summary, engine,
      faces: metrics.faces,
      brightness: metrics.brightness,
      motion: metrics.motion,
    });

    return NextResponse.json({ summary, engine, metrics });
  } catch (error) {
    console.error("[JARVIS /api/vision]", error);
    return NextResponse.json(
      { summary: "Mon module optique rencontre une interférence.", engine: "local" },
      { status: 200 }
    );
  }
}

function clamp(v: unknown): number {
  const n = Math.round(Number(v ?? 0));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}
