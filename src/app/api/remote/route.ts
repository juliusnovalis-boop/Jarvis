import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { commandQueue } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * 📱 PASSERELLE MOBILE
 *  POST  → l'app compagnon pousse une commande dans la file
 *  GET   → le poste principal récupère les commandes en attente et les marque traitées
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text: string = typeof body?.text === "string" ? body.text.trim().slice(0, 500) : "";
    if (!text) return NextResponse.json({ error: "Commande vide" }, { status: 400 });

    const inserted = await db
      .insert(commandQueue)
      .values({ text, origin: String(body?.origin ?? "mobile").slice(0, 32) })
      .returning();

    return NextResponse.json({ ok: true, id: inserted[0]?.id ?? null, queued: text });
  } catch (error) {
    console.error("[JARVIS /api/remote POST]", error);
    return NextResponse.json({ error: "Échec de la mise en file" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const peek = req.nextUrl.searchParams.get("peek") === "1";
  const pending = await db
    .select()
    .from(commandQueue)
    .where(eq(commandQueue.status, "pending"))
    .orderBy(asc(commandQueue.id))
    .limit(5);

  if (!peek && pending.length) {
    // Le poste principal consomme la commande : elle passe en « running ».
    // Elle ne devient « done » que quand PATCH renvoie la réponse de Jarvis,
    // ce qui permet à l'app mobile d'attendre le vrai résultat.
    await Promise.all(
      pending.map((c) =>
        db.update(commandQueue).set({ status: "running" }).where(eq(commandQueue.id, c.id))
      )
    );
  }

  return NextResponse.json({
    commands: pending.map((c) => ({ id: c.id, text: c.text, origin: c.origin, ts: c.createdAt.toISOString() })),
  });
}

/** Le poste principal renvoie la réponse de Jarvis pour que le mobile l'affiche. */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = Number(body?.id);
    const reply = String(body?.reply ?? "").slice(0, 2000);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "id requis" }, { status: 400 });
    await db.update(commandQueue).set({ reply, status: "done" }).where(eq(commandQueue.id, id));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Échec" }, { status: 500 });
  }
}
