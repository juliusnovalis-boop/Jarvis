import { NextRequest, NextResponse } from "next/server";
import { createReadStream, existsSync, statSync } from "fs";
import { join } from "path";
import { Readable } from "stream";

export const dynamic = "force-dynamic";

/**
 * 📦 TÉLÉCHARGEMENT ROBUSTE
 *  Route dédiée avec en-têtes complets (reprise, type MIME exécutable,
 *  nom de fichier forcé) — évite les blocages navigateurs silencieux.
 *
 *  /api/download?f=Jarvis-Complete-Setup.exe   installateur Windows
 *  /api/download?f=Jarvis-Complete-Portable.zip version portable
 *  /api/download?f=Jarvis.apk                  application Android
 *  /api/download?f=.env                        fichier de clés (à ajouter)
 */

type Entry = { mime: string; from: string };

const FILES: Record<string, Entry> = {
  "Jarvis-Complete-Setup.exe": {
    mime: "application/vnd.microsoft.portable-executable",
    from: "public/jarvis-node/Jarvis-Complete-Setup.exe",
  },
  "Jarvis-Complete-Portable.zip": { mime: "application/zip", from: "public/jarvis-node/Jarvis-Complete-Portable.zip" },
  // 📱 Application Android construite par android/build-apk.sh
  "Jarvis.apk": { mime: "application/vnd.android.package-archive", from: "public/jarvis-node/Jarvis.apk" },
  // 🔑 Fichier de clés livré avec l'installateur (.env.modele → app\.env)
  ".env": { mime: "text/plain; charset=utf-8", from: "packaging/windows/.env.modele" },
  ".env.example": { mime: "text/plain; charset=utf-8", from: ".env.example" },
  "LISEZ-MOI-WINDOWS-11.txt": { mime: "text/plain; charset=utf-8", from: "public/jarvis-node/LISEZ-MOI-WINDOWS-11.txt" },
  "LICENCE.txt": { mime: "text/plain; charset=utf-8", from: "public/jarvis-node/LICENCE.txt" },
  "jarvis-source.bundle": { mime: "application/octet-stream", from: "public/jarvis-node/jarvis-source.bundle" },
  // Agent seul conservé pour Linux/macOS et les installations expertes.
  "jarvis-agent.py": { mime: "text/x-python; charset=utf-8", from: "public/jarvis-node/jarvis-agent.py" },
  "LISEZ-MOI.txt": { mime: "text/plain; charset=utf-8", from: "public/jarvis-node/LISEZ-MOI.txt" },
};

function resolve(name: string): { entry: Entry; path: string } | null {
  const entry = FILES[name];
  if (!entry) return null;
  const path = join(process.cwd(), entry.from);
  if (!existsSync(path)) return null;
  return { entry, path };
}

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("f") ?? "Jarvis-Complete-Setup.exe";
  const found = resolve(name);
  if (!FILES[name]) return NextResponse.json({ error: "Fichier inconnu." }, { status: 404 });
  if (!found) return NextResponse.json({ error: "Fichier absent du serveur." }, { status: 404 });

  const { entry, path } = found;
  const total = statSync(path).size;
  const range = req.headers.get("range");
  const baseHeaders = {
    "content-type": entry.mime,
    "accept-ranges": "bytes",
    "content-disposition": `attachment; filename="${name}"`,
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
  };

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
          ...baseHeaders,
          "content-length": String(end - start + 1),
          "content-range": `bytes ${start}-${end}/${total}`,
        },
      });
    }
  }

  const stream = Readable.toWeb(createReadStream(path)) as ReadableStream;
  return new NextResponse(stream, {
    status: 200,
    headers: { ...baseHeaders, "content-length": String(total) },
  });
}

export async function HEAD(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("f") ?? "Jarvis-Complete-Setup.exe";
  const found = resolve(name);
  if (!found) return new NextResponse(null, { status: 404 });
  return new NextResponse(null, {
    headers: {
      "content-type": found.entry.mime,
      "content-length": String(statSync(found.path).size),
      "content-disposition": `attachment; filename="${name}"`,
      "x-content-type-options": "nosniff",
    },
  });
}
