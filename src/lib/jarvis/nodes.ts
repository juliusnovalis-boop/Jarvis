/**
 * 🖥️ PONT PC — architecture « cerveau web + agent local » (comme Open Interpreter)
 *
 *  L'agent jarvis-agent.py tourne sur le PC de l'utilisateur, en arrière-plan,
 *  et interroge /api/node en boucle. Le web dépose des travaux, l'agent les
 *  exécute (souris, clavier, shell, fichiers, captures) et renvoie le résultat.
 */

import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { nodeJobs, pcNodes } from "@/db/schema";

const ONLINE_WINDOW_MS = 12_000;

export interface NodeView {
  id: number;
  name: string;
  platform: string;
  online: boolean;
  lastSeenAt: string | null;
}

export async function listNodes(): Promise<NodeView[]> {
  const rows = await db.select().from(pcNodes).orderBy(desc(pcNodes.lastSeenAt));
  const now = Date.now();
  return rows.map((n) => ({
    id: n.id,
    name: n.name,
    platform: n.platform,
    online: Boolean(n.lastSeenAt && now - n.lastSeenAt.getTime() < ONLINE_WINDOW_MS),
    lastSeenAt: n.lastSeenAt?.toISOString() ?? null,
  }));
}

export async function touchNode(nodeId: number): Promise<void> {
  await db.update(pcNodes).set({ lastSeenAt: new Date() }).where(eq(pcNodes.id, nodeId));
}

export async function enqueueJob(
  nodeId: number,
  kind: string,
  payload: Record<string, unknown>
): Promise<number> {
  const rows = await db
    .insert(nodeJobs)
    .values({ nodeId, kind, payload: JSON.stringify(payload) })
    .returning();
  return rows[0]!.id;
}

export interface JobResult {
  status: string;
  output: string;
  attachment: string | null;
}

/** Attend le résultat d'un travail (l'agent poll toutes les ~2 s). */
export async function waitJob(jobId: number, timeoutMs = 15_000): Promise<JobResult> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await db.select().from(nodeJobs).where(eq(nodeJobs.id, jobId)).limit(1);
    const job = rows[0];
    if (job && (job.status === "done" || job.status === "error")) {
      return { status: job.status, output: job.result ?? "", attachment: job.attachment ?? null };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { status: "timeout", output: "L'agent n'a pas répondu à temps.", attachment: null };
}

/** Le premier PC en ligne, ou null. */
export async function firstOnlineNode(): Promise<NodeView | null> {
  const nodes = await listNodes();
  return nodes.find((n) => n.online) ?? null;
}

/** Exécute un travail sur un PC connecté et formule la réponse. */
export async function runOnPc(
  kind: string,
  payload: Record<string, unknown>,
  opts: { success: (out: JobResult) => string; empty: string }
): Promise<{ reply: string; attachment: string | null; offline: boolean }> {
  const node = await firstOnlineNode();
  if (!node) {
    return {
      reply:
        "Aucun PC n'est relié pour l'instant. Ouvrez l'onglet Système, téléchargez mon agent Jarvis et lancez-le sur votre machine. " +
        "Il tournera en arrière-plan et me donnera les mains sur votre PC : souris, clavier, fichiers et console.",
      attachment: null,
      offline: true,
    };
  }
  const jobId = await enqueueJob(node.id, kind, payload);
  const result = await waitJob(jobId);
  if (result.status === "done") {
    const out = result.output.trim();
    return {
      reply: out ? opts.success(result) : opts.empty,
      attachment: result.attachment,
      offline: false,
    };
  }
  return {
    reply: result.status === "timeout" ? result.output : `La commande a échoué sur ${node.name} : ${(result.output || "erreur inconnue").slice(0, 300)}`,
    attachment: result.attachment,
    offline: false,
  };
}
