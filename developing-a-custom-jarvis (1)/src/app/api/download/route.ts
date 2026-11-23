import { NextRequest, NextResponse } from "next/server";
import { createReadStream, existsSync, statSync } from "fs";
import { join } from "path";
import { Readable } from "stream";

export const dynamic = "force-dynamic";

/**
 * 📦 TÉLÉCHARGEMENT ROBUSTE DE L'AGENT
 *  Route dédiée avec en-têtes complets (reprise, type MIME exécutable,
 *  nom de fichier forcé) — évite les blocages navigteurs silencieux sur .exe.
 *  /api/download?f=Jarvis-Complete-Setup.exe | Jarvis-Complete-Portable.zip
 */

const FILES: Record<string, string> = {
  "Jarvis-Complete-Setup.exe": "application/vnd.microsoft.portable-executable",
  "Jarvis-Complete-Portable.zip": "application/zip",
  "LISEZ-MOI-WINDOWS-11.txt": "text/plain; charset=utf-8",
  "LICENCE.txt": "text/plain; charset=utf-8",
  "jarvis-source.bundle": "application/octet-stream",
  // Agent seul conservé pour Linux/macOS et les installations expertes.
  "jarvis-agent.py": "text/x-python; charset=utf-8",
  "LISEZ-MOI.txt": "text/plain; charset=utf-8",
};

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("f") ?? "Jarvis-Complete-Setup.exe";
  const mime = FILES[name];
  if (!mime) return NextResponse.json({ error: "Fichier inconnu." }, { status: 404 });

  const path = join(process.cwd(), "public", "jarvis-node", name);
  if (!existsSync(path)) {
    return NextResponse.json({ error: "Fichier absent du serveur." }, { status: 404 });
  }

  const total = statSync(path).size;
  const range = req.headers.get("range");

  // Reprise de téléchargement (Accept-Ranges)
  if (range) {
    const m = range.match(/bytes=(\d+)-(\d*)/);
    if (m) {
      const start = parseInt(m[1], 10);
      const end = m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1;
      if (start >= total || end < start) {
        return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${total}` } });
      }
      const stream = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
      return new NextResponse(stream, {
        status: 206,
        headers: {
          "content-type": mime,
          "content-length": String(end - start + 1),
          "content-range": `bytes ${start}-${end}/${total}`,
          "accept-ranges": "bytes",
          "content-disposition": `attachment; filename="${name}"`,
          "x-content-type-options": "nosniff",
          "cache-control": "no-store",
        },
      });
    }
  }

  const stream = Readable.toWeb(createReadStream(path)) as ReadableStream;
  return new NextResponse(stream, {
    status: 200,
    headers: {
      "content-type": mime,
      "content-length": String(total),
      "accept-ranges": "bytes",
      "content-disposition": `attachment; filename="${name}"`,
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    },
  });
}

export async function HEAD(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("f") ?? "Jarvis-Complete-Setup.exe";
  const mime = FILES[name];
  const path = join(process.cwd(), "public", "jarvis-node", name);
  if (!mime || !existsSync(path)) return new NextResponse(null, { status: 404 });
  return new NextResponse(null, {
    headers: {
      "content-type": mime,
      "content-length": String(statSync(path).size),
      "accept-ranges": "bytes",
      "content-disposition": `attachment; filename="${name}"`,
      "x-content-type-options": "nosniff",
    },
  });
}
