import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memories } from "@/db/schema";

export const dynamic = "force-dynamic";

export interface SkillDef {
  id: string;
  name: string;
  cat: string;
  desc: string;
  custom?: boolean;
}

/** 🧠 Les 12 skills de base — même catalogue que le DEV STUDIO (/code). */
export const BUILTIN_SKILLS: SkillDef[] = [
  { id: "react", name: "React / Next.js", cat: "Front", desc: "App Router, Server Components, hooks" },
  { id: "three", name: "Three.js / WebGL", cat: "3D", desc: "Scènes, shaders, optimisation" },
  { id: "blender-py", name: "Blender Python", cat: "3D", desc: "bpy : modélisation et rendu scriptés" },
  { id: "unity-cs", name: "Unity C#", cat: "Jeu", desc: "GameObjects, coroutines, ECS" },
  { id: "gdscript", name: "GDScript / Godot", cat: "Jeu", desc: "Nœuds, signaux, scènes" },
  { id: "shader", name: "GLSL / Shaders", cat: "3D", desc: "Vertex, fragment, post-processing" },
  { id: "node-api", name: "API Node & Drizzle", cat: "Back", desc: "Routes, ORM PostgreSQL, jobs" },
  { id: "python", name: "Python agentique", cat: "Back", desc: "pyautogui, agents, automatisation" },
  { id: "mcp", name: "Protocole MCP", cat: "Agents", desc: "Outils, ressources, prompts" },
  { id: "rag", name: "RAG & embeddings", cat: "Agents", desc: "Chunks, similarité, citations" },
  { id: "ffmpeg", name: "FFmpeg / montage", cat: "Média", desc: "Transcodage, timecode, sous-titres" },
  { id: "docker", name: "Docker & CI", cat: "Ops", desc: "Images, workflows, déploiement" },
];

const KEY = "jarvis_studio_skills_v1";
const MAX_CUSTOM = 30;
export const SKILL_CATS = ["Front", "3D", "Jeu", "Back", "Agents", "Média", "Ops", "Domotique", "Voix"];

function isSkill(value: unknown): value is SkillDef {
  if (!value || typeof value !== "object") return false;
  const s = value as SkillDef;
  return typeof s.id === "string" && s.id.length > 0 && s.id.length <= 80 && typeof s.name === "string" && s.name.trim().length > 0 && s.name.length <= 60 && typeof s.cat === "string" && s.cat.length <= 30 && typeof s.desc === "string" && s.desc.length <= 240;
}

async function loadCustom(): Promise<SkillDef[]> {
  try {
    const [row] = await db.select().from(memories).where(eq(memories.key, KEY)).limit(1);
    if (!row) return [];
    const parsed: unknown = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed.filter(isSkill).slice(0, MAX_CUSTOM) : [];
  } catch (error) {
    console.error("[skills] lecture impossible", error);
    return [];
  }
}

async function saveCustom(list: SkillDef[]) {
  await db.insert(memories).values({ key: KEY, value: JSON.stringify(list) }).onConflictDoUpdate({ target: memories.key, set: { value: JSON.stringify(list), updatedAt: new Date() } });
}

export async function GET() {
  try {
    const custom = await loadCustom();
    return NextResponse.json({ skills: [...BUILTIN_SKILLS, ...custom], builtin: BUILTIN_SKILLS.length, custom: custom.length, cats: SKILL_CATS });
  } catch (error) {
    console.error("[skills] GET", error);
    return NextResponse.json({ skills: BUILTIN_SKILLS, builtin: BUILTIN_SKILLS.length, custom: 0, cats: SKILL_CATS, degraded: true });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim().slice(0, 60);
    const cat = String(body?.cat ?? "Ops").trim().slice(0, 30) || "Ops";
    const desc = String(body?.desc ?? "").trim().slice(0, 240);
    if (!name || !desc) return NextResponse.json({ error: "name et desc requis" }, { status: 400 });
    const custom = await loadCustom();
    if (custom.length >= MAX_CUSTOM) return NextResponse.json({ error: `Limite de ${MAX_CUSTOM} skills personnalisés atteinte.` }, { status: 409 });
    if (custom.some(s => s.name.toLowerCase() === name.toLowerCase()) || BUILTIN_SKILLS.some(s => s.name.toLowerCase() === name.toLowerCase())) return NextResponse.json({ error: "Un skill porte déjà ce nom." }, { status: 409 });
    const skill: SkillDef = { id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name, cat, desc, custom: true };
    await saveCustom([...custom, skill]);
    return NextResponse.json({ ok: true, skill });
  } catch (error) {
    console.error("[skills] POST", error);
    return NextResponse.json({ error: "Échec de la création du skill." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id ?? "");
    if (!id.startsWith("custom-")) return NextResponse.json({ error: "Les skills de base ne peuvent pas être supprimés." }, { status: 400 });
    const custom = await loadCustom();
    const next = custom.filter(s => s.id !== id);
    if (next.length === custom.length) return NextResponse.json({ error: "Skill introuvable." }, { status: 404 });
    await saveCustom(next);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[skills] DELETE", error);
    return NextResponse.json({ error: "Échec de la suppression." }, { status: 500 });
  }
}
