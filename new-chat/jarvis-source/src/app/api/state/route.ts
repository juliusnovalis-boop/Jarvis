import { NextResponse } from "next/server";
import { asc, desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, memories, messages, notes, tasks } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const memRows = await db.select().from(memories);
  const mem = Object.fromEntries(memRows.map((m) => [m.key, m.value]));
  const noteRows = await db.select().from(notes).orderBy(desc(notes.id)).limit(8);
  const taskRows = await db
    .select()
    .from(tasks)
    .orderBy(asc(tasks.done), desc(tasks.id))
    .limit(10);
  const eventRows = await db.select().from(events).orderBy(asc(events.at)).limit(20);
  const futureEvents = eventRows.filter((e) => e.at.getTime() > Date.now() - 3600_000).slice(0, 6);
  const count = await db.select({ n: sql<number>`count(*)::int` }).from(messages);

  return NextResponse.json({
    userName: mem["user_name"] ?? null,
    city: mem["default_city"] ?? null,
    messageCount: count[0]?.n ?? 0,
    notes: noteRows.map((n) => ({ id: n.id, content: n.content, ts: n.createdAt.toISOString() })),
    tasks: taskRows.map((t) => ({ id: t.id, content: t.content, done: t.done, ts: t.createdAt.toISOString() })),
    events: futureEvents.map((e) => ({ id: e.id, title: e.title, at: e.at.toISOString() })),
  });
}
