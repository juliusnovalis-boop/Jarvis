"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot, ChevronRight, Download, Loader2, MonitorSmartphone, MousePointer2,
  Network, SquareTerminal, Trash2, Workflow,
} from "lucide-react";

interface NodeInfo { id: number; name: string; platform: string; online: boolean; lastSeenAt: string | null }
interface JobInfo { id: number; kind: string; status: string; output: string; ts: string }
interface AgentInfo { id: number; name: string; role: string }

interface Line { id: string; prompt: string; output: string; ok: boolean; target: string }

let lc = 0;
const lid = () => `l-${Date.now()}-${lc++}`;

/** 💻 PANNEAU SYSTÈME — PC liés, console intégrée, agents IA. */
export function SystemPanel() {
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [target, setTarget] = useState("auto");
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<Line[]>([
    {
      id: lid(),
      prompt: "J.A.R.V.I.S. — console intégrée",
      output:
        "Tapez une commande ci-dessous. Cible « auto » = votre PC s'il est relié, sinon cette console (lecture seule).\n" +
        "Exemples : pwd, ls, node --version… ou liez votre PC pour le shell complet.",
      ok: true,
      target: "system",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [n, a] = await Promise.all([
        fetch("/api/node", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/agents", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setNodes(n.nodes ?? []);
      setJobs(n.jobs ?? []);
      setAgents(a.agents ?? []);
    } catch {
      /* hors-ligne */
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines.length]);

  const run = useCallback(
    async (cmd: string) => {
      const command = cmd.trim();
      if (!command || busy) return;
      setBusy(true);
      setInput("");
      const prompt = `${target.startsWith("node:") ? "pc" : target === "auto" ? "auto" : "srv"}:~$`;
      try {
        const res = await fetch("/api/console", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command, target }),
        });
        const data = await res.json();
        setLines((p) => [
          ...p.slice(-60),
          { id: lid(), prompt, output: data.output ?? "(aucune sortie)", ok: data.status === "done", target: data.target ?? target },
        ]);
      } catch {
        setLines((p) => [...p.slice(-60), { id: lid(), prompt, output: "Échec réseau.", ok: false, target }]);
      } finally {
        setBusy(false);
        refresh();
      }
    },
    [busy, refresh, target]
  );

  const online = nodes.filter((n) => n.online);

  return (
    <section className="hud-frame flex min-h-0 flex-1 flex-col border border-cyan-500/15 bg-[#04101f]/70 backdrop-blur-md">
      <header className="flex items-center gap-2 border-b border-cyan-500/15 px-3 py-2">
        <SquareTerminal size={13} className="text-cyan-400/70" />
        <p className="font-orbitron text-[10px] uppercase tracking-[0.3em] text-cyan-400/70">Système</p>
        <span className="ml-auto flex items-center gap-1.5 font-tech text-[9px] tracking-[0.15em]">
          <Network size={10} className={online.length ? "text-emerald-400" : "text-slate-500"} />
          <span className={online.length ? "text-emerald-400/90" : "text-slate-500"}>
            {online.length ? `${online.length} PC EN LIGNE` : "AUCUN PC"}
          </span>
        </span>
      </header>

      <div className="jarvis-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {/* ---- PC liés ---- */}
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 font-tech text-[9px] uppercase tracking-[0.2em] text-cyan-400/60">
            <MonitorSmartphone size={11} /> PC liés
          </p>
          {nodes.length === 0 ? (
            <div className="border border-dashed border-cyan-500/25 p-2.5">
              <p className="font-tech text-[10.5px] leading-relaxed text-cyan-300/75">
                Installez <strong className="text-cyan-100">tout Jarvis</strong> sur Windows 11 : interface,
                serveur local, Node.js, PostgreSQL, base de données, agent PC et mot-clé vocal.
              </p>

              <a
                href="/api/download?f=Jarvis-Complete-Setup.exe"
                className="mt-2 flex flex-col items-center gap-1 border border-emerald-400/60 bg-emerald-400/10 px-3 py-2.5 transition-all hover:bg-emerald-400/20 hover:shadow-[0_0_18px_rgba(52,211,153,0.25)]"
              >
                <span className="flex items-center gap-2 font-orbitron text-[10px] uppercase tracking-[0.16em] text-emerald-200">
                  <Download size={13} /> Jarvis Complete — Windows 11
                </span>
                <span className="font-tech text-[8.5px] normal-case tracking-normal text-emerald-300/60">
                  App bureau · 378,2 MiB · SHA-256 5c6571420bb7218e…
                </span>
              </a>
              <p className="mt-1 text-center font-tech text-[8.5px] text-cyan-500/50">
                Une installation, aucune dépendance externe, démarrage automatique
              </p>

              <a
                href="/api/download?f=Jarvis-Complete-Portable.zip"
                className="mt-2 flex flex-col items-center gap-1 border border-cyan-400/35 bg-cyan-400/[0.07] px-3 py-2 transition-all hover:bg-cyan-400/15"
              >
                <span className="flex items-center gap-2 font-orbitron text-[9px] uppercase tracking-[0.14em] text-cyan-200">
                  <Download size={11} /> Version portable complète
                </span>
                <span className="font-tech text-[8px] normal-case tracking-normal text-cyan-400/60">
                  ZIP · 357,7 MiB · SHA-256 b354d1e2422598e9…
                </span>
              </a>
              <p className="mt-1 font-tech text-[9px] leading-relaxed text-cyan-300/60">
                Portable : décompressez puis lancez <code className="text-amber-200/90">PREMIERE-INSTALLATION.bat</code>.
              </p>

              <details className="mt-2 border border-amber-400/20 bg-amber-400/[0.04] px-2 py-1.5">
                <summary className="cursor-pointer font-tech text-[9px] tracking-wide text-amber-200/75">
                  SmartScreen / Chrome affiche un avertissement ?
                </summary>
                <p className="mt-1 font-tech text-[9px] leading-relaxed text-amber-100/65">
                  L&apos;installateur n&apos;a pas de certificat commercial. Chrome : « Conserver ».
                  SmartScreen : « Informations complémentaires » → « Exécuter quand même ».
                  Prenez la version portable si votre antivirus retire les .exe des archives.
                </p>
              </details>

              <p className="mt-2 border-l border-emerald-400/40 pl-2 font-tech text-[10px] leading-relaxed text-emerald-200/80">
                🎙️ Une fois installé, dites <span className="text-emerald-100">« Jarvis »</span> : l&apos;interface
                locale s&apos;ouvre automatiquement sur votre PC, même si votre navigateur était fermé.
              </p>

              <details className="mt-1.5 border border-cyan-500/15 px-2 py-1">
                <summary className="cursor-pointer font-tech text-[8.5px] text-cyan-500/60">
                  Agent seul pour Linux/macOS (expert)
                </summary>
                <a href="/api/download?f=jarvis-agent.py" className="mt-1 inline-flex items-center gap-1 font-tech text-[9px] text-cyan-300">
                  <Download size={9} /> jarvis-agent.py
                </a>
              </details>
            </div>
          ) : (
            <ul className="space-y-1">
              {nodes.map((n) => (
                <li key={n.id} className={`flex items-center gap-2 border px-2 py-1.5 ${n.online ? "border-emerald-400/30 bg-emerald-400/[0.06]" : "border-cyan-500/10 bg-cyan-950/20"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${n.online ? "animate-pulse bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]" : "bg-slate-600"}`} />
                  <p className="min-w-0 flex-1 truncate text-[11.5px] text-cyan-50">{n.name}</p>
                  <p className="font-tech text-[9px] uppercase tracking-wide text-cyan-500/60">{n.platform}</p>
                  {n.online && (
                    <button
                      onClick={() => setTarget(`node:${n.id}`)}
                      className="border border-cyan-500/30 px-1.5 py-0.5 font-tech text-[8.5px] tracking-wider text-cyan-300 hover:bg-cyan-400/10"
                    >
                      CIBLER
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ---- Console ---- */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="flex items-center gap-1.5 font-tech text-[9px] uppercase tracking-[0.2em] text-cyan-400/60">
              <SquareTerminal size={11} /> Console
            </p>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="border border-cyan-500/25 bg-[#020a16] px-1.5 py-0.5 font-tech text-[9.5px] text-cyan-200/85 focus:outline-none"
            >
              <option value="auto">auto (PC sinon serveur)</option>
              <option value="server">serveur (lecture seule)</option>
              {nodes.filter((n) => n.online).map((n) => (
                <option key={n.id} value={`node:${n.id}`}>pc : {n.name}</option>
              ))}
            </select>
          </div>

          <div ref={scrollRef} className="jarvis-scroll max-h-[220px] overflow-y-auto border border-cyan-500/15 bg-[#01060f] p-2">
            {lines.map((l) => (
              <div key={l.id} className="mb-1.5">
                <p className="font-tech text-[10px] text-emerald-400/90">
                  <ChevronRight size={9} className="mr-0.5 inline" />{l.prompt}
                </p>
                <pre className={`whitespace-pre-wrap break-all font-tech text-[10.5px] leading-snug ${l.ok ? "text-cyan-100/85" : "text-amber-200/80"}`}>
                  {l.output}
                </pre>
              </div>
            ))}
            {busy && (
              <p className="font-tech text-[10px] text-cyan-400/70">
                <Loader2 size={10} className="mr-1 inline animate-spin" /> exécution…
              </p>
            )}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); run(input); }}
            className="mt-1.5 flex items-center gap-1.5 border border-cyan-500/25 bg-[#01060f] px-2 py-1.5 focus-within:border-cyan-400/50"
          >
            <span className="shrink-0 font-tech text-[11px] text-emerald-400/90">$</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='commande shell — ou dites « exécute … »'
              className="min-w-0 flex-1 bg-transparent font-tech text-[11.5px] text-cyan-50 placeholder:text-cyan-700/60 focus:outline-none"
            />
          </form>

          {/* Commandes rapides */}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {["pwd && ls", "whoami", "node --version", "dir %USERPROFILE%\\Desktop"].map((c) => (
              <button
                key={c}
                onClick={() => run(c)}
                disabled={busy}
                className="border border-cyan-500/20 px-1.5 py-0.5 font-tech text-[9px] text-cyan-300/70 hover:bg-cyan-400/10 disabled:opacity-40"
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* ---- Agents ---- */}
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 font-tech text-[9px] uppercase tracking-[0.2em] text-cyan-400/60">
            <Workflow size={11} /> Agents IA
          </p>
          {agents.length === 0 ? (
            <p className="font-tech text-[10.5px] leading-relaxed text-cyan-500/50">
              Dites : « crée un agent nommé Codeur qui m&apos;aide à programmer »
              puis « @Codeur, explique-moi les closures ».
            </p>
          ) : (
            <ul className="space-y-1">
              {agents.map((a) => (
                <li key={a.id} className="group flex items-start gap-2 border border-cyan-500/10 bg-cyan-950/20 px-2 py-1.5">
                  <Bot size={12} className="mt-0.5 shrink-0 text-cyan-300/80" />
                  <div className="min-w-0 flex-1">
                    <p className="font-tech text-[11px] text-cyan-50">
                      <span className="text-amber-200/90">@{a.name}</span>
                    </p>
                    <p className="truncate font-tech text-[9.5px] text-cyan-500/60">{a.role}</p>
                  </div>
                  <button
                    onClick={async () => {
                      await fetch("/api/agents", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: a.id }) });
                      refresh();
                    }}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    title="Supprimer"
                  >
                    <Trash2 size={11} className="text-rose-300/80" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ---- Derniers travaux PC ---- */}
        {jobs.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 font-tech text-[9px] uppercase tracking-[0.2em] text-cyan-400/60">
              <MousePointer2 size={11} /> Derniers travaux exécutés
            </p>
            <ul className="space-y-1">
              {jobs.slice(0, 6).map((j) => (
                <li key={j.id} className="flex items-center gap-2 font-tech text-[9.5px] text-cyan-300/70">
                  <span className={`h-1 w-1 shrink-0 rounded-full ${j.status === "done" ? "bg-emerald-400" : j.status === "error" ? "bg-rose-400" : "bg-amber-400"}`} />
                  <span className="uppercase tracking-wider text-cyan-400/70">{j.kind}</span>
                  <span className="truncate">{j.output.slice(0, 60) || "—"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
