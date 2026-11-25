import { NextRequest, NextResponse } from "next/server";
import { createReadStream, existsSync, statSync } from "fs";
import { join, sep } from "path";
import { Readable } from "stream";

export const dynamic = "force-dynamic";

/**
 * 📦 TÉLÉCHARGEMENT ROBUSTE
 *
 *  /api/download?f=Jarvis-Agent-Setup.exe    installateur Windows (NSIS)
 *  /api/download?f=Jarvis-Agent-Portable.zip version portable de l'agent
 *  /api/download?f=Jarvis.apk                application Android
 *  /api/download?f=.env                      modèle de clés API
 *  /api/download?f=LISEZ-MOI-WINDOWS-11.txt  notice d'installation
 *
 *  Règle de sécurité : un nom de fichier ne peut jamais sortir de
 *  public/jarvis-node (ni `..`, ni séparateur, ni chemin absolu).
 *  Les deux seuls fichiers hors de ce dossier sont déclarés en dur ci-dessous.
 */

const PUBLIC_DIR = join(process.cwd(), "public", "jarvis-node");

/** Fichiers de dépôt explicitement exposés (modèle de clés, exemple). */
const ROOT_FILES: Record<string, { mime: string; from: string }> = {
  ".env": { mime: "text/plain; charset=utf-8", from: "packaging/windows/.env.modele" },
  ".env.example": { mime: "text/plain; charset=utf-8", from: ".env.example" },
};

const MIME: Record<string, string> = {
  ".exe": "application/vnd.microsoft.portable-executable",
  ".zip": "application/zip",
  ".apk": "application/vnd.android.package-archive",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".py": "text/x-python; charset=utf-8",
  ".ps1": "text/plain; charset=utf-8",
  ".bat": "text/plain; charset=utf-8",
  ".vbs": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".bundle": "application/octet-stream",
};

function safeBasename(name: string): boolean {
  if (!name || name.length > 120) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("\0")) return false;
  if (name === "." || name === ".." || name.includes("..")) return false;
  if (!/^[\w][\w.\- ()]*$/.test(name)) return false;
  return true;
}

type Resolved = { mime: string; path: string; name: string };

function resolve(name: string): Resolved | null {
  if (!name) return null;

  const root = ROOT_FILES[name];
  if (root) {
    const path = join(process.cwd(), root.from);
    if (!existsSync(path)) return null;
    return { mime: root.mime, path, name };
  }

  if (!safeBasename(name)) return null;
  const path = join(PUBLIC_DIR, name);
  // Vérification définitive : le fichier résolu doit rester dans public/jarvis-node.
  if (!path.startsWith(PUBLIC_DIR + sep)) return null;
  if (!existsSync(path) || !statSync(path).isFile()) return null;
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return { mime: MIME[ext] ?? "application/octet-stream", path, name };
}

function notFound(name: string) {
  return NextResponse.json(
    {
      error: `Fichier absent du serveur : ${name || "(aucun nom)"}.`,
      hint: "Les artefacts se construisent avec packaging/windows/JarvisAgent.nsi (makensis) et android/build-apk.sh. Voir /install.",
      directory: "public/jarvis-node",
    },
    { status: 404 }
  );
}

function headersFor(found: Resolved, total: number) {
  return {
    "content-type": found.mime,
    "accept-ranges": "bytes",
    "content-disposition": `attachment; filename="${found.name.replace(/"/g, "")}"`,
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
    "content-length": String(total),
  };
}

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("f") ?? "";
  const found = resolve(name);
  if (!found) return notFound(name);

  const total = statSync(found.path).size;
  const base = headersFor(found, total);
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
      const stream = Readable.toWeb(createReadStream(found.path, { start, end })) as ReadableStream;
      return new NextResponse(stream, {
        status: 206,
        headers: { ...base, "content-length": String(end - start + 1), "content-range": `bytes ${start}-${end}/${total}` },
      });
    }
  }

  const stream = Readable.toWeb(createReadStream(found.path)) as ReadableStream;
  return new NextResponse(stream, { status: 200, headers: base });
}

export async function HEAD(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("f") ?? "";
  const found = resolve(name);
  if (!found) return new NextResponse(null, { status: 404 });
  return new NextResponse(null, { headers: headersFor(found, statSync(found.path).size) });
}
