import { NextRequest, NextResponse } from "next/server";
import { apiCategories, callPublicApi, listPublicApis } from "@/lib/jarvis/publicapis";

export const dynamic = "force-dynamic";

/**
 * 🌐 API PUBLIQUES (catalogue github.com/public-apis/public-apis)
 *   GET /api/apis                 → catalogue + catégories
 *   GET /api/apis?id=…&q=…        → appel live d'une API branchée
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    const apis = listPublicApis();
    return NextResponse.json({
      apis,
      categories: apiCategories(),
      wired: apis.filter((a) => a.wired).length,
      total: apis.length,
      source: "https://github.com/public-apis/public-apis",
    });
  }

  const q = req.nextUrl.searchParams.get("q") ?? "";
  try {
    const hit = await callPublicApi(id, q);
    return NextResponse.json(hit, { status: hit.ok ? 200 : 502 });
  } catch (error) {
    console.error("[JARVIS /api/apis]", error);
    return NextResponse.json(
      { ok: false, text: "Interférence sur le canal API.", source: "J.A.R.V.I.S." },
      { status: 500 }
    );
  }
}
