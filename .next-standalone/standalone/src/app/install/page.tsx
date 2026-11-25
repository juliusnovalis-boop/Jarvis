import { createHash } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import {
  AppWindow, CheckCircle2, Download, FileText, HardDrive, KeyRound, Mic2, Package, ShieldAlert,
  Smartphone, TerminalSquare,
} from "lucide-react";

export const metadata = {
  title: "Télécharger J.A.R.V.I.S. — installateur complet Windows, portable et Android",
  description:
    "Installez J.A.R.V.I.S. en une fois : assistant IA, JARVIS Studio 3D, montage vidéo, MCP, skills et agents — avec Node.js et PostgreSQL embarqués.",
};

const PUBLIC_DIR = join(process.cwd(), "public", "jarvis-node");

const ROOT_FILES: Record<string, string> = {
  ".env": "packaging/windows/.env.modele",
  ".env.example": ".env.example",
};

type Meta = { file: string; available: boolean; size: number; sha: string };

/** Métadonnées réelles : taille et SHA-256 lus sur le fichier livré. */
async function meta(file: string): Promise<Meta> {
  const root = ROOT_FILES[file];
  const path = root ? join(process.cwd(), root) : join(PUBLIC_DIR, file);
  const safe = root ? true : path.startsWith(PUBLIC_DIR + sep);
  if (!safe || !existsSync(path) || !statSync(path).isFile()) return { file, available: false, size: 0, sha: "" };
  const size = statSync(path).size;
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  return { file, available: true, size, sha: hash.digest("hex") };
}

const formatSize = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1048576).toFixed(1).replace(".", ",")} Mo`
    : `${Math.max(1, Math.round(n / 1024))} Ko`;

const download = (file: string) => `/api/download?f=${encodeURIComponent(file)}`;

const INCLUDED = [
  "Assistant IA — accueil, voix, mémoire, contrôle du PC",
  "JARVIS Studio 3D — éditeur de mondes, jeu, matériaux PBR",
  "DEV STUDIO — MCP, skills, agents IA, montage vidéo multi-pistes",
  "Modules Admin (IMAP/SMTP), mobile et installateur",
  "Moteur Next.js autonome + Node.js 22 embarqué",
  "PostgreSQL 16 portable, base créée au premier lancement",
  "Agent PC : souris, clavier, fichiers, console, diction",
  "Modèle de clés API (.env) jamais écrasé par une mise à jour",
];

export default async function InstallPage() {
  const [setup, portable, agentSetup, agentZip, apk, envFile, notice, licence, envExample, agent] =
    await Promise.all([
      meta("Jarvis-Complete-Setup.exe"),
      meta("Jarvis-Complete-Portable.zip"),
      meta("Jarvis-Agent-Setup.exe"),
      meta("Jarvis-Agent-Portable.zip"),
      meta("Jarvis.apk"),
      meta(".env"),
      meta("LISEZ-MOI-WINDOWS-11.txt"),
      meta("LICENCE.txt"),
      meta(".env.example"),
      meta("jarvis-agent.py"),
    ]);

  const light = [
    { m: agentSetup, label: "Agent seul · .exe", hint: "PC agent + lanceurs" },
    { m: agentZip, label: "Agent seul · .zip", hint: "sans installation" },
  ].filter(x => x.m.available);

  return (
    <main className="jarvis-scene relative min-h-screen overflow-hidden px-4 py-10 text-cyan-50">
      <div className="jarvis-grid pointer-events-none absolute inset-0" />
      <div className="jarvis-scanlines pointer-events-none absolute inset-0 opacity-40" />

      <section className="relative z-10 mx-auto max-w-3xl">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon.svg"
            alt="Icône J.A.R.V.I.S."
            className="mx-auto mb-5 h-24 w-24 drop-shadow-[0_0_34px_rgba(34,211,238,0.5)]"
          />
          <p className="font-tech text-[10px] uppercase tracking-[0.4em] text-cyan-400/60">Windows 11 · 64 bits</p>
          <h1 className="mt-3 font-orbitron text-3xl font-bold tracking-[0.18em] text-cyan-100 jarvis-glow sm:text-5xl">
            J.A.R.V.I.S. COMPLETE
          </h1>
          <p className="mx-auto mt-4 max-w-2xl font-tech text-sm leading-relaxed text-cyan-200/75">
            Un seul installateur pour <strong className="text-cyan-100">toutes les interfaces</strong> : assistant IA,
            JARVIS Studio 3D, montage vidéo, MCP, skills et agents. Node.js et PostgreSQL sont embarqués — aucun
            runtime à installer à part.
          </p>
        </div>

        {/* ── Installateur complet ─────────────────────────────── */}
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <a
            href={setup.available ? download(setup.file) : undefined}
            aria-disabled={!setup.available}
            className={`hud-frame group border p-6 transition-all ${
              setup.available
                ? "border-emerald-400/45 bg-emerald-400/[0.08] hover:border-emerald-300 hover:bg-emerald-400/[0.14] hover:shadow-[0_0_35px_rgba(52,211,153,0.2)]"
                : "border-amber-400/35 bg-amber-400/[0.05] opacity-90"
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`grid h-11 w-11 place-items-center border ${
                  setup.available ? "border-emerald-400/40 bg-emerald-400/10" : "border-amber-400/40 bg-amber-400/10"
                }`}
              >
                <Download size={20} className={setup.available ? "text-emerald-300" : "text-amber-300"} />
              </span>
              <div>
                <p className="font-orbitron text-sm uppercase tracking-[0.15em] text-emerald-100">
                  Installateur .exe
                </p>
                <p className="font-tech text-[10px] text-emerald-300/60">
                  {setup.available
                    ? `Tout inclus · ${formatSize(setup.size)} · Windows x64`
                    : "Non construit sur ce serveur"}
                </p>
              </div>
            </div>
            <p className="mt-4 font-tech text-[11px] leading-relaxed text-cyan-100/70">
              {setup.available
                ? "Assistant IA, Studio 3D, montage vidéo, MCP/skills/agents, Node.js 22 et PostgreSQL 16 dans C:\\Program Files\\JARVIS."
                : "Compilez-le avec scripts/build-complete-installer.sh, puis rechargez cette page."}
            </p>
            {setup.available ? (
              <code className="mt-3 block break-all font-tech text-[8.5px] text-emerald-400/55">
                SHA-256 {setup.sha}
              </code>
            ) : (
              <code className="mt-3 block break-all font-tech text-[8.5px] text-amber-300/70">
                ./scripts/build-complete-installer.sh
              </code>
            )}
          </a>

          <a
            href={portable.available ? download(portable.file) : undefined}
            aria-disabled={!portable.available}
            className={`hud-frame group border p-6 transition-all ${
              portable.available
                ? "border-cyan-400/35 bg-cyan-400/[0.06] hover:border-cyan-300 hover:bg-cyan-400/[0.12] hover:shadow-[0_0_35px_rgba(34,211,238,0.2)]"
                : "border-amber-400/35 bg-amber-400/[0.05] opacity-90"
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`grid h-11 w-11 place-items-center border ${
                  portable.available ? "border-cyan-400/40 bg-cyan-400/10" : "border-amber-400/40 bg-amber-400/10"
                }`}
              >
                <HardDrive size={20} className={portable.available ? "text-cyan-300" : "text-amber-300"} />
              </span>
              <div>
                <p className="font-orbitron text-sm uppercase tracking-[0.15em] text-cyan-100">
                  Version portable
                </p>
                <p className="font-tech text-[10px] text-cyan-300/60">
                  {portable.available
                    ? `ZIP complet · ${formatSize(portable.size)} · sans installation`
                    : "Non construit sur ce serveur"}
                </p>
              </div>
            </div>
            <p className="mt-4 font-tech text-[11px] leading-relaxed text-cyan-100/70">
              {portable.available
                ? "Décompressez puis lancez PREMIERE-INSTALLATION.bat. Idéal si SmartScreen bloque le setup."
                : "Même contenu que l'installateur, à produire avec la commande ci-dessous."}
            </p>
            {portable.available ? (
              <code className="mt-3 block break-all font-tech text-[8.5px] text-cyan-400/55">
                SHA-256 {portable.sha}
              </code>
            ) : (
              <code className="mt-3 block break-all font-tech text-[8.5px] text-amber-300/70">
                ./scripts/build-complete-installer.sh
              </code>
            )}
          </a>
        </div>

        {/* ── Android + clés ─────────────────────────────────────── */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div
            aria-disabled={!apk.available}
            className={`hud-frame border p-5 ${
              apk.available
                ? "border-violet-400/40 bg-violet-400/[0.07]"
                : "border-amber-400/30 bg-amber-400/[0.04]"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center border border-violet-400/40 bg-violet-400/10">
                <Smartphone size={18} className="text-violet-300" />
              </span>
              <div>
                <p className="font-orbitron text-xs uppercase tracking-[0.15em] text-violet-100">
                  Application Android
                </p>
                <p className="font-tech text-[10px] text-violet-300/60">
                  {apk.available ? `Fichier .apk · ${formatSize(apk.size)} · Android 7+` : "APK non compilé sur ce serveur"}
                </p>
              </div>
            </div>
            <p className="mt-3 font-tech text-[11px] leading-relaxed text-cyan-100/70">
              Coque WebView de l&apos;interface mobile : saisissez l&apos;adresse de votre PC —{" "}
              <code className="text-violet-200">http://192.168.1.10:3210/mobile</code> — elle est mémorisée ensuite.
            </p>
            {apk.available ? (
              <a
                href={download(apk.file)}
                className="mt-3 inline-flex items-center gap-1.5 font-tech text-[9.5px] uppercase tracking-[0.16em] text-violet-300/85 hover:text-violet-100"
              >
                <Download size={10} /> Télécharger Jarvis.apk
              </a>
            ) : (
              <code className="mt-3 block break-all font-tech text-[9px] text-amber-300/75">
                ./android/build-apk.sh
              </code>
            )}
          </div>

          <a
            href={envFile.available ? download(envFile.file) : undefined}
            aria-disabled={!envFile.available}
            className="hud-frame group border border-amber-400/40 bg-amber-400/[0.06] p-5 transition-all hover:border-amber-300 hover:bg-amber-400/[0.12] hover:shadow-[0_0_30px_rgba(251,191,36,0.15)]"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center border border-amber-400/40 bg-amber-400/10">
                <KeyRound size={18} className="text-amber-300" />
              </span>
              <div>
                <p className="font-orbitron text-xs uppercase tracking-[0.15em] text-amber-100">
                  Fichier .env
                </p>
                <p className="font-tech text-[10px] text-amber-300/60">
                  Vos clés API · {envFile.available ? formatSize(envFile.size) : "indisponible"}
                </p>
              </div>
            </div>
            <p className="mt-3 font-tech text-[11px] leading-relaxed text-cyan-100/70">
              Ajoutez vos clés (Doubao, Groq, Gemini, Ollama…) dans{" "}
              <code className="text-amber-200">{"C:\\Program Files\\JARVIS\\app\\.env"}</code>, puis redémarrez
              Jarvis — jamais écrasé par une mise à jour.
            </p>
            <span className="mt-3 inline-flex items-center gap-1.5 font-tech text-[9.5px] uppercase tracking-[0.16em] text-amber-300/85">
              <Download size={10} /> Télécharger .env
            </span>
          </a>
        </div>

        {/* ── Contenu de l'installateur ─────────────────────────── */}
        <div className="hud-frame mt-6 border border-cyan-500/20 bg-[#04101f]/75 p-5">
          <h2 className="flex items-center gap-2 font-orbitron text-xs uppercase tracking-[0.2em] text-cyan-200">
            <Package size={15} /> Ce que contient l&apos;installateur
          </h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {INCLUDED.map(item => (
              <li key={item} className="flex items-start gap-2 font-tech text-[11px] leading-relaxed text-cyan-100/75">
                <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-400" /> {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-cyan-500/15 pt-3 font-tech text-[10.5px] leading-relaxed text-cyan-200/70">
            Au premier lancement, <code className="text-cyan-100">Start-Jarvis.ps1</code> initialise PostgreSQL dans{" "}
            <code className="text-cyan-100">%LOCALAPPDATA%\JarvisCompleteData</code>, crée la base et applique le
            schéma, puis ouvre l&apos;interface sur{" "}
            <code className="text-cyan-100">http://127.0.0.1:3210</code> — l&apos;assistant d&apos;abord, le studio
            ensuite. L&apos;agent vocal a besoin de Python 3 sur le poste ; tout le reste fonctionne sans lui.
          </p>
          <pre className="mt-3 overflow-x-auto border border-cyan-500/20 bg-[#020a16] p-3 font-tech text-[10.5px] leading-relaxed text-cyan-200/85">
{`# Reconstruction des artefacts depuis les sources
./scripts/build-complete-installer.sh`}
          </pre>
        </div>

        {/* ── Versions légères ──────────────────────────────────── */}
        {light.length > 0 && (
          <div className="mt-4 border border-cyan-500/20 bg-[#04101f]/70 p-4">
            <h2 className="flex items-center gap-2 font-orbitron text-[10px] uppercase tracking-[0.2em] text-cyan-300/85">
              <AppWindow size={14} /> Versions légères — agent PC seul
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {light.map(item => (
                <a
                  key={item.label}
                  href={download(item.m.file)}
                  className="inline-flex items-center gap-2 border border-cyan-500/30 px-3 py-2 font-tech text-[10px] tracking-[0.1em] text-cyan-300/85 transition-colors hover:border-cyan-300 hover:bg-cyan-400/10 hover:text-cyan-100"
                >
                  <Download size={11} /> {item.label}
                  <span className="text-cyan-500/55">· {formatSize(item.m.size)} · {item.hint}</span>
                </a>
              ))}
            </div>
            <p className="mt-3 font-tech text-[10px] leading-relaxed text-cyan-500/60">
              Sans l&apos;interface web : utile pour équiper un second PC qui pilote seulement souris, clavier et
              diction.
            </p>
          </div>
        )}

        {/* ── Notices ────────────────────────────────────────────── */}
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { m: notice, label: "LISEZ-MOI-WINDOWS-11.txt" },
            { m: licence, label: "LICENCE.txt" },
            { m: envExample, label: ".env.example" },
            { m: agent, label: "jarvis-agent.py" },
          ].map(item => (
            <a
              key={item.label}
              href={item.m.available ? download(item.m.file) : undefined}
              aria-disabled={!item.m.available}
              className={`inline-flex items-center gap-1.5 border px-3 py-1.5 font-tech text-[10px] tracking-[0.1em] transition-colors ${
                item.m.available
                  ? "border-cyan-500/30 text-cyan-300/85 hover:border-cyan-300 hover:bg-cyan-400/10 hover:text-cyan-100"
                  : "cursor-not-allowed border-cyan-500/15 text-cyan-500/40"
              }`}
            >
              <FileText size={11} /> {item.label}
            </a>
          ))}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[1.35fr_0.65fr]">
          <div className="hud-frame border border-cyan-500/20 bg-[#04101f]/75 p-5">
            <h2 className="flex items-center gap-2 font-orbitron text-xs uppercase tracking-[0.2em] text-cyan-200">
              <TerminalSquare size={15} /> Après l&apos;installation
            </h2>
            <ul className="mt-4 grid gap-2">
              {[
                "« Démarrer JARVIS » dans le menu Démarrer (ou le raccourci bureau)",
                "La fenêtre s'ouvre sur l'assistant : dites « Jarvis » ou tapez votre demande",
                "« Studio 3D » dans la barre supérieure pour l'éditeur de mondes",
                "« Dev » pour MCP, skills, agents IA et montage vidéo",
                "« Ouvrir les clés API » pour renseigner votre LLM préféré",
              ].map(item => (
                <li key={item} className="flex items-start gap-2 font-tech text-[11px] leading-relaxed text-cyan-100/75">
                  <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-cyan-400" /> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="hud-frame border border-amber-400/20 bg-amber-400/[0.04] p-5">
            <h2 className="flex items-center gap-2 font-orbitron text-[10px] uppercase tracking-[0.18em] text-amber-200">
              <ShieldAlert size={14} /> SmartScreen
            </h2>
            <p className="mt-3 font-tech text-[10.5px] leading-relaxed text-amber-100/65">
              Le setup n&apos;a pas de certificat commercial. Cliquez « Informations complémentaires » puis
              « Exécuter quand même ». Sinon utilisez le ZIP portable.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3 border-l-2 border-emerald-400/60 bg-emerald-400/[0.06] px-4 py-3">
          <Mic2 size={18} className="shrink-0 text-emerald-300" />
          <p className="font-tech text-[11px] leading-relaxed text-emerald-100/80">
            Après installation, dites <strong>« Jarvis »</strong> : le PC répond et ouvre automatiquement
            l&apos;interface locale sur http://127.0.0.1:3210.
          </p>
        </div>

        <div className="mt-8 text-center">
          <a href="/" className="font-tech text-[11px] tracking-[0.2em] text-cyan-400/60 hover:text-cyan-200">
            ← RETOUR À JARVIS
          </a>
        </div>
      </section>
    </main>
  );
}
