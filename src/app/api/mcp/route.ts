import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 🔌 API MCP — Model Context Protocol
 *  GET  /api/mcp        → catalogue des serveurs MCP référencés
 *  POST /api/mcp        → sonde réelle des endpoints locaux (timeout 1,2 s)
 *
 *  Les serveurs locaux (blender-mcp, unity-mcp…) tournent en Python sur le PC
 *  de l'utilisateur ; on teste simplement la portée du port TCP/HTTP.
 */

export interface McpServerDef {
  id: string;
  name: string;
  endpoint: string;
  transport: "local" | "remote";
  auth: "aucune" | "clé" | "oauth";
  desc: string;
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

async function probe(endpoint: string): Promise<{ ok: boolean; ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(1200),
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
  return NextResponse.json({ servers: MCP_SERVERS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const only = typeof body?.id === "string" ? [body.id] : null;
    const targets = only ? MCP_SERVERS.filter((s) => s.id === only[0]) : MCP_SERVERS.filter((s) => s.transport === "local");
    const results = await Promise.all(
      targets.map(async (s) => {
        const r = await probe(s.endpoint);
        return { id: s.id, name: s.name, endpoint: s.endpoint, ...r };
      })
    );
    return NextResponse.json({ results, at: new Date().toISOString() });
  } catch (error) {
    console.error("[JARVIS /api/mcp]", error);
    return NextResponse.json({ error: "Échec de la sonde MCP." }, { status: 500 });
  }
}
