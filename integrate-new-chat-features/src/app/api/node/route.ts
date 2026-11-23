import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { nodeJobs, pcNodes } from "@/db/schema";
import { enqueueJob, firstOnlineNode, touchNode, listNodes } from "@/lib/jarvis/nodes";

export const dynamic = "force-dynamic";

type RuntimeState = {
  wakeActive: boolean;
  micStatus: string;
  lastError: string;
  at: number;
};

// Etat vivant de l'agent. Il ne merite pas une colonne SQL : le polling le
// reconstruit toutes les deux secondes et il doit expirer avec le processus.
const runtimeByNode = new Map<number, RuntimeState>();

/**
 * 🖥️ API DU PONT PC
 *  GET            → statut des PC liés (pour l'interface)
 *  POST register  → l'agent s'enregistre et reçoit un token
 *  POST poll      → l'agent récupère ses travaux en attente
 *  POST result    → l'agent renvoie la sortie d'un travail
 */

export async function GET() {
  const baseNodes = await listNodes();
  const now = Date.now();
  const nodes = baseNodes.map((node) => {
    const runtime = runtimeByNode.get(node.id);
    const fresh = runtime && now - runtime.at < 15_000 ? runtime : null;
    return {
      ...node,
      wakeActive: Boolean(node.online && fresh?.wakeActive),
      micStatus: fresh?.micStatus ?? (node.online ? "agent connecté" : "hors ligne"),
      lastError: fresh?.lastError ?? "",
    };
  });
  const recent = await db.select().from(nodeJobs).orderBy(asc(nodeJobs.id)).limit(2000);
  const lastJobs = recent.slice(-20).map((j) => ({
    id: j.id, kind: j.kind, status: j.status,
    output: (j.result ?? "").slice(0, 400),
    ts: j.createdAt.toISOString(),
  }));
  return NextResponse.json({ nodes, jobs: lastJobs.reverse() });
}

async function auth(body: Record<string, unknown>): Promise<typeof pcNodes.$inferSelect | null> {
  const nodeId = Number(body?.nodeId);
  const token = String(body?.token ?? "");
  if (!Number.isFinite(nodeId) || !token) return null;
  const rows = await db.select().from(pcNodes).where(eq(pcNodes.id, nodeId)).limit(1);
  const node = rows[0];
  return node && node.token === token ? node : null;
}

/**
 * Interface locale -> agent PC. Limite volontaire : voix native uniquement.
 * Les actions générales passent par le moteur d'intentions et sa file normale.
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body?.action ?? "");
    if (!["speak", "listen"].includes(action)) {
      return NextResponse.json({ ok: false, error: "Action refusée." }, { status: 400 });
    }
    const node = await firstOnlineNode();
    if (!node) return NextResponse.json({ ok: false, queued: false, error: "Aucun agent en ligne." });

    if (action === "listen") {
      const enabled = body?.enabled !== false;
      const jobId = await enqueueJob(node.id, "listen_control", { enabled });
      return NextResponse.json({ ok: true, queued: true, enabled, nodeId: node.id, jobId });
    }

    const text = String(body?.text ?? "").trim().slice(0, 1500);
    if (!text) return NextResponse.json({ ok: false, error: "Texte vide." }, { status: 400 });
    const runtime = runtimeByNode.get(node.id);
    if (!runtime || !runtime.wakeActive || Date.now() - runtime.at > 15_000) {
      return NextResponse.json({ ok: false, queued: false, error: "Agent vocal non armé." });
    }
    const jobId = await enqueueJob(node.id, "speak", { text });
    return NextResponse.json({ ok: true, queued: true, nodeId: node.id, jobId });
  } catch (error) {
    console.error("[JARVIS /api/node PUT]", error);
    return NextResponse.json({ ok: false, error: "Voix native indisponible." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body?.action ?? "");

    if (action === "register") {
      const name = String(body?.name ?? "PC").slice(0, 60);
      const platform = String(body?.platform ?? "unknown").slice(0, 30);
      const token = randomBytes(24).toString("hex");
      const inserted = await db
        .insert(pcNodes)
        .values({ name, platform, token, lastSeenAt: new Date() })
        .returning();
      const n = inserted[0]!;
      return NextResponse.json({ nodeId: n.id, token, name: n.name });
    }

    const node = await auth(body);
    if (!node) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

    if (action === "poll") {
      await touchNode(node.id);
      runtimeByNode.set(node.id, {
        wakeActive: body?.wakeActive === true,
        micStatus: String(body?.micStatus ?? "actif").slice(0, 120),
        lastError: String(body?.lastError ?? "").slice(0, 500),
        at: Date.now(),
      });
      const pending = await db
        .select()
        .from(nodeJobs)
        .where(eq(nodeJobs.status, "pending"))
        .orderBy(asc(nodeJobs.id))
        .limit(5);
      const mine = pending.filter((j) => j.nodeId === node.id);
      if (mine.length) {
        await Promise.all(
          mine.map((j) => db.update(nodeJobs).set({ status: "running" }).where(eq(nodeJobs.id, j.id)))
        );
      }
      // Un payload JSON corrompu ne doit pas bloquer la file : on le marque en erreur.
      const jobs: Array<{ id: number; kind: string; payload: unknown }> = [];
      for (const j of mine) {
        try {
          jobs.push({ id: j.id, kind: j.kind, payload: JSON.parse(j.payload) });
        } catch {
          await db
            .update(nodeJobs)
            .set({ status: "error", result: "Payload JSON invalide pour ce travail." })
            .where(eq(nodeJobs.id, j.id));
        }
      }
      return NextResponse.json({ jobs });
    }

    if (action === "result") {
      const jobId = Number(body?.jobId);
      if (!Number.isFinite(jobId)) return NextResponse.json({ error: "jobId requis" }, { status: 400 });
      const output = String(body?.output ?? "").slice(0, 8000);
      const status = body?.ok === false ? "error" : "done";
      const attachment =
        typeof body?.attachment === "string" && body.attachment.startsWith("data:image/")
          ? body.attachment.slice(0, 2_500_000)
          : null;
      await db
        .update(nodeJobs)
        .set({ status, result: output, attachment, finishedAt: new Date() })
        .where(eq(nodeJobs.id, jobId));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) {
    console.error("[JARVIS /api/node]", error);
    return NextResponse.json({ error: "Pont PC indisponible." }, { status: 500 });
  }
}
