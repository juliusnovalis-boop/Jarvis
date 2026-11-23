import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { commandQueue } from "@/db/schema";

export const dynamic = "force-dynamic";

/** L'app mobile interroge cette route pour récupérer la réponse de Jarvis. */
export async function GET(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get("id");
  if (idParam) {
    const id = Number(idParam);
    const rows = await db.select().from(commandQueue).where(eq(commandQueue.id, id)).limit(1);
    const row = rows[0];
    return NextResponse.json({
      status: row?.status ?? "unknown",
      reply: row?.reply ?? null,
    });
  }
  const recent = await db.select().from(commandQueue).orderBy(desc(commandQueue.id)).limit(10);
  return NextResponse.json({
    commands: recent.map((c) => ({
      id: c.id, text: c.text, status: c.status, reply: c.reply, ts: c.createdAt.toISOString(),
    })),
  });
}
