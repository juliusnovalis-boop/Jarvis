import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(agents).orderBy(desc(agents.id)).limit(50);
  return NextResponse.json({
    agents: rows.map((a) => ({ id: a.id, name: a.name, role: a.role, tools: a.tools })),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body?.name ?? "").trim().slice(0, 40);
    const role = String(body?.role ?? "").trim().slice(0, 500);
    if (!name || !role) return NextResponse.json({ error: "name et role requis" }, { status: 400 });
    const inserted = await db
      .insert(agents)
      .values({ name, role, tools: JSON.stringify(body.tools ?? []) })
      .onConflictDoUpdate({ target: agents.name, set: { role } })
      .returning();
    return NextResponse.json({ ok: true, agent: { id: inserted[0]!.id, name, role } });
  } catch (error) {
    console.error("[JARVIS /api/agents]", error);
    return NextResponse.json({ error: "Échec" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const id = Number(body?.id);
    if (Number.isFinite(id)) await db.delete(agents).where(eq(agents.id, id));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Échec" }, { status: 500 });
  }
}
