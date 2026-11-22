import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { firstOnlineNode, enqueueJob, waitJob } from "@/lib/jarvis/nodes";

export const dynamic = "force-dynamic";

const execAsync = promisify(exec);

/**
 * 💻 CONSOLE INTÉGRÉE
 *  - target = PC lié  → travail envoyé à l'agent (shell du PC)
 *  - target = serveur → console du serveur,restreinte aux commandes en lecture seule
 */

const SERVER_WHITELIST =
  /^\s*(pwd|ls\s*.*|ll\s*.*|dir\b.*|echo\s+.*|cat\s+[^\n]*|head\s+.*|tail\s+.*|date|whoami|hostname|uname\s*-?a?|uptime|node\s+--version|npm\s+--version|git\s+(status|log\s+.*|branch)|df\s+-h?|free\s+-m)\s*$/;

const BLOCKED = /(rm\s+-|del\s|mkfs|format\s|shutdown|reboot|kill\s|pkill|>\s*\/|:(){|fork|DROP\s+TABLE)/i;

/** Accepte les chaînes « cmd && cmd » si chaque segment est sûr. */
function serverAllowed(command: string): boolean {
  if (BLOCKED.test(command)) return false;
  return command.split("&&").every((part) => SERVER_WHITELIST.test(part.trim()));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const command = String(body?.command ?? "").trim().slice(0, 800);
    if (!command) return NextResponse.json({ error: "Commande vide." }, { status: 400 });

    const target = String(body?.target ?? "auto");

    /* ---------- Cible : un PC de l'utilisateur ---------- */
    let nodeId: number | null = null;
    if (target.startsWith("node:")) nodeId = Number(target.slice(5));
    if (target === "auto") {
      const node = await firstOnlineNode();
      nodeId = node?.id ?? null;
    }

    if (nodeId != null && Number.isFinite(nodeId)) {
      const jobId = await enqueueJob(nodeId, "shell", { command });
      const result = await waitJob(jobId, 20_000);
      return NextResponse.json({
        output: result.output || (result.status === "timeout" ? "L'agent n'a pas répondu à temps." : "(aucune sortie)"),
        target: `pc-${nodeId}`,
        status: result.status,
      });
    }

    /* ---------- Cible : serveur (bac à sable, lecture seule) ---------- */
    if (!serverAllowed(command) || /\benv\b/.test(command)) {
      return NextResponse.json({
        output:
          "Commande refusée sur la console serveur : mode lecture seule. " +
          "Liez votre PC avec l'agent Jarvis (onglet Système) pour une console complète — la vôtre, sans garde-fous.",
        target: "server",
        status: "error",
      });
    }

    try {
      const { stdout, stderr } = await execAsync(command, { timeout: 8000, maxBuffer: 512 * 1024, cwd: "/tmp" });
      return NextResponse.json({ output: (stdout + stderr).trim() || "(aucune sortie)", target: "server", status: "done" });
    } catch (e) {
      const msg = e instanceof Error && "message" in e ? String((e as { stderr?: string }).stderr ?? e.message) : "erreur";
      return NextResponse.json({ output: msg.slice(0, 4000), target: "server", status: "error" });
    }
  } catch (error) {
    console.error("[JARVIS /api/console]", error);
    return NextResponse.json({ output: "Console indisponible.", target: "server", status: "error" });
  }
}
