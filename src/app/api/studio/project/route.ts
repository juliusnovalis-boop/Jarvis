import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memories } from "@/db/schema";
import { createDefaultProject, validateProject } from "@/lib/studio/scene";

export const dynamic = "force-dynamic";
const PROJECT_KEY = "jarvis_studio_project_v1";

export async function GET() {
  try {
    const [row] = await db.select().from(memories).where(eq(memories.key, PROJECT_KEY)).limit(1);
    const project = row ? validateProject(JSON.parse(row.value)) : null;
    return NextResponse.json({ project: project ?? createDefaultProject(), persisted: !!project });
  } catch (error) {
    console.error("[studio] Lecture du projet impossible", error);
    return NextResponse.json({ error: "Le projet est temporairement indisponible." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.text();
    if (body.length > 500_000) return NextResponse.json({ error: "Projet trop volumineux (500 Ko maximum)." }, { status: 413 });
    let input: unknown;
    try { input = JSON.parse(body); } catch { return NextResponse.json({ error: "JSON non valide." }, { status: 400 }); }
    const project = validateProject(input);
    if (!project) return NextResponse.json({ error: "Le format de la scène n’est pas valide." }, { status: 400 });
    project.updatedAt = new Date().toISOString();
    await db.insert(memories).values({ key: PROJECT_KEY, value: JSON.stringify(project) }).onConflictDoUpdate({ target: memories.key, set: { value: JSON.stringify(project), updatedAt: new Date() } });
    return NextResponse.json({ ok: true, updatedAt: project.updatedAt });
  } catch (error) {
    console.error("[studio] Sauvegarde impossible", error);
    return NextResponse.json({ error: "La sauvegarde serveur a échoué. Votre copie locale est conservée." }, { status: 503 });
  }
}
