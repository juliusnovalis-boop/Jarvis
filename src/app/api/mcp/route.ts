import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memories } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * 🔌 API MCP — Model Context Protocol
 *  GET    /api/mcp → catalogue des serveurs MCP (10 intégrés + personnalisés)
 *  POST   /api/mcp → sonde réelle des endpoints (timeout 1,2 s)
 *  PUT    /api/mcp → enregistrer un serveur MCP personnalisé
 *  DELETE /api/mcp → supprimer un serveur MCP personnalisé
 */

export interface McpServerDef {
  id: string;
  name: string;
  endpoint: string;
  transport: "local" | "remote";
  auth: "aucune" | "clé" | "oauth";
  desc: string;
  custom?: boolean;
}

export const MCP_SERVERS: McpServerDef[] = [
  { id: "blender", name: "Blender", endpoint: "http://127.0.0.1:9876", transport: "local", auth: "aucune",
    desc: "Scène, objets, materials, rendu et animation via blender-mcp" },
  { id: "unity", name: "Unity", endpoint: "http://127.0.0.1:6400", transport: "local", auth: "aucune",
    desc: "Scènes, GameObjects, composants et build via unity-mcp" },
  { id: "godot", name: "Godot 4", endpoint: "http://127.0.0.1:3000", transport: "local", auth: "aucune",
    desc: "Nœuds, scripts GDScript, export de scènes" },
  { id: "unreal", name: "Unreal Engine", endpoint: "http://127.0.0.1:30010", transport: "local", auth: "aucune",
    desc: "Blueprints, acteurs, level design via unreal-mcp" },
  { id: "vscode", name: "VS Code", endpoint: "http://127.0.0.1:3001/sse", transport: "local", auth: "aucune",
    desc: "Édition de fichiers, recherche, exécution de commandes" },
  { id: "chrome", name: "Chrome / CDP", endpoint: "http://127.0.0.1:9222/json/version", transport: "local", auth: "aucune",
    desc: "Contrôle du navigateur, automatisation, captures" },
  { id: "photoshop", name: "Photoshop", endpoint: "http://127.0.0.1:3456", transport: "local", auth: "aucune",
    desc: "Calques, retouche, export d'assets" },
  { id: "figma", name: "Figma", endpoint: "https://mcp.figma.com/sse", transport: "remote", auth: "oauth",
    desc: "Lecture des frames et génération de composants" },
  { id: "github", name: "GitHub", endpoint: "https://api.github.com", transport: "remote", auth: "clé",
    desc: "Repos, issues, pull requests, actions" },
  { id: "linear", name: "Linear", endpoint: "https://mcp.linear.app/sse", transport: "remote", auth: "oauth",
    desc: "Tickets, cycles, suivi de sprint" },
];

const KEY = "jarvis_studio_mcp_v1";
const MAX_CUSTOM = 20;

function isServer(value: unknown): value is McpServerDef {
  if (!value || typeof value !== "object") return false;
  const s = value as McpServerDef;
  return typeof s.id === "string" && s.id.startsWith("custom-") && s.id.length <= 80 && typeof s.name === "string" && s.name.trim().length > 0 && s.name.length <= 60 && typeof s.endpoint === "string" && /^https?:\/\/\S{4,300}$/.test(s.endpoint) && (s.transport === "local" || s.transport === "remote") && (s.auth === "aucune" || s.auth === "clé" || s.auth === "oauth") && typeof s.desc === "string" && s.desc.length <= 240;
}

async function loadCustom(): Promise<McpServerDef[]> {
  try {
    const [row] = await db.select().from(memories).where(eq(memories.key, KEY)).limit(1);
    if (!row) return [];
    const parsed: unknown = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed.filter(isServer).slice(0, MAX_CUSTOM) : [];
  } catch (error) {
    console.error("[mcp] lecture impossible", error);
    return [];
  }
}

async function saveCustom(list: McpServerDef[]) {
  await db.insert(memories).values({ key: KEY, value: JSON.stringify(list) }).onConflictDoUpdate({ target: memories.key, set: { value: JSON.stringify(list), updatedAt: new Date() } });
}

async function probe(endpoint: string): Promise<{ ok: boolean; ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    await fetch(endpoint, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
      headers: { accept: "application/json, text/event-stream, */*" },
    });
    // Toute réponse HTTP = endpoint joignable (404/405 courant sur un MCP)
    return { ok: true, ms: Date.now() - t0 };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "injoignable";
    return { ok: false, ms: Date.now() - t0, error: msg.includes("timeout") ? "délai dépassé" : "hors ligne" };
  }
}

export async function GET() {
  try {
    const custom = await loadCustom();
    const servers = [...MCP_SERVERS, ...custom];
    return NextResponse.json({ servers, builtin: MCP_SERVERS.length, custom: custom.length });
  } catch (error) {
    console.error("[mcp] GET", error);
    return NextResponse.json({ servers: MCP_SERVERS, builtin: MCP_SERVERS.length, custom: 0, degraded: true });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const custom = await loadCustom();
    const all = [...MCP_SERVERS, ...custom];
    const only = typeof body?.id === "string" ? [body.id] : null;
    // Sans filtre, on sonde les serveurs locaux ; `all: true` sonde les 10 intégrés + personnalisés.
    const targets = only ? all.filter(s => s.id === only[0]) : body?.all === true ? all : all.filter(s => s.transport === "local");
    if (!targets.length) return NextResponse.json({ error: "Serveur MCP introuvable." }, { status: 404 });
    const results = await Promise.all(
      targets.map(async s => {
        const r = await probe(s.endpoint);
        return { id: s.id, name: s.name, endpoint: s.endpoint, custom: !!s.custom, ...r };
      })
    );
    return NextResponse.json({ results, at: new Date().toISOString() });
  } catch (error) {
    console.error("[JARVIS /api/mcp]", error);
    return NextResponse.json({ error: "Échec de la sonde MCP." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim().slice(0, 60);
    const endpoint = String(body?.endpoint ?? "").trim().slice(0, 300);
    const transport = body?.transport === "remote" ? "remote" : "local";
    const auth = (["aucune", "clé", "oauth"] as const).find(a => a === body?.auth) ?? "aucune";
    const desc = String(body?.desc ?? "").trim().slice(0, 240);
    if (!name || !/^https?:\/\/\S{4,}$/.test(endpoint)) return NextResponse.json({ error: "Nom et endpoint http(s) valides requis." }, { status: 400 });
    const custom = await loadCustom();
    if (custom.length >= MAX_CUSTOM) return NextResponse.json({ error: `Limite de ${MAX_CUSTOM} serveurs MCP atteinte.` }, { status: 409 });
    if (custom.some(s => s.name.toLowerCase() === name.toLowerCase())) return NextResponse.json({ error: "Un serveur porte déjà ce nom." }, { status: 409 });
    const server: McpServerDef = { id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name, endpoint, transport, auth, desc, custom: true };
    await saveCustom([...custom, server]);
    return NextResponse.json({ ok: true, server });
  } catch (error) {
    console.error("[mcp] PUT", error);
    return NextResponse.json({ error: "Échec de l'enregistrement du serveur MCP." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id ?? "");
    if (!id.startsWith("custom-")) return NextResponse.json({ error: "Les serveurs intégrés ne peuvent pas être supprimés." }, { status: 400 });
    const custom = await loadCustom();
    const next = custom.filter(s => s.id !== id);
    if (next.length === custom.length) return NextResponse.json({ error: "Serveur introuvable." }, { status: 404 });
    await saveCustom(next);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[mcp] DELETE", error);
    return NextResponse.json({ error: "Échec de la suppression." }, { status: 500 });
  }
}
