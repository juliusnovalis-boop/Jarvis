import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { processCommand } from "@/lib/jarvis/engine";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message: string = typeof body?.message === "string" ? body.message.trim() : "";
    const tz: string = typeof body?.tz === "string" ? body.tz : "Europe/Paris";
    const lang: "fr" | "en" = body?.lang === "en" ? "en" : "fr";
    if (!message) {
      return NextResponse.json({ error: "Message vide." }, { status: 400 });
    }

    await db.insert(messages).values({ role: "user", content: message.slice(0, 2000) });
    const result = await processCommand(message.slice(0, 2000), tz, lang);
    await db.insert(messages).values({ role: "jarvis", content: result.reply });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[JARVIS /api/chat]", error);
    return NextResponse.json({
      reply: "Mes systèmes rencontrent une interférence temporaire. Réessayez dans un instant.",
    });
  }
}
