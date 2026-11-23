import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(messages).orderBy(desc(messages.id)).limit(60);
  return NextResponse.json({
    messages: rows.reverse().map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      ts: m.createdAt.toISOString(),
    })),
  });
}
