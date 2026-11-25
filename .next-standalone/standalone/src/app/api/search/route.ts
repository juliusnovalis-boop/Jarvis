import { NextRequest, NextResponse } from "next/server";
import { browseAnswer, compareSearchProviders, readPage, webSearch } from "@/lib/jarvis/websearch";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 🌐 API NAVIGATEUR
 *   ?q=…            → recherche + lecture + réponse synthétisée (mode "navigateur")
 *   ?q=…&raw=1      → uniquement la liste des résultats
 *   ?url=…          → lecture du contenu d'une page précise
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  const url = req.nextUrl.searchParams.get("url");
  const raw = req.nextUrl.searchParams.get("raw") === "1";
  const compare = req.nextUrl.searchParams.get("compare") === "1";
  const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "fr";

  try {
    if (url) {
      const text = await readPage(url, 8000);
      return NextResponse.json({ url, text: text ?? null, ok: Boolean(text) });
    }
    if (!q) return NextResponse.json({ error: "Paramètre q requis." }, { status: 400 });

    if (compare) {
      const providers = await compareSearchProviders(q);
      return NextResponse.json({ query: q, providers });
    }

    if (raw) {
      const { results, provider } = await webSearch(q);
      return NextResponse.json({ query: q, provider, results });
    }

    const answer = await browseAnswer(q, lang);
    if (!answer) return NextResponse.json({ query: q, answer: null, sources: [], provider: "aucune" });
    return NextResponse.json({ query: q, answer: answer.text, sources: answer.sources, provider: answer.provider });
  } catch (error) {
    console.error("[JARVIS /api/search]", error);
    return NextResponse.json({ error: "Navigation indisponible." }, { status: 500 });
  }
}
