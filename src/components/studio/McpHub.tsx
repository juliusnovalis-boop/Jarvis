"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Plug, RefreshCw, Unplug } from "lucide-react";

interface McpServer {
  id: string;
  name: string;
  endpoint: string;
  transport: "local" | "remote";
  auth: "aucune" | "clé" | "oauth";
  desc: string;
}
interface ProbeResult {
  id: string;
  name: string;
  endpoint: string;
  ok: boolean;
  ms: number;
  error?: string;
}

/** 🔌 HUB MCP — connexion aux serveurs Model Context Protocol (Blender, Unity…). */
export function McpHub() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [results, setResults] = useState<Record<string, ProbeResult>>({});
  const [probing, setProbing] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/mcp", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setServers(d.servers ?? []))
      .catch(() => undefined);
  }, []);

  const probeAll = useCallback(async () => {
    setProbing("*");
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const data = await res.json();
      const map: Record<string, ProbeResult> = {};
      for (const r of (data.results ?? []) as ProbeResult[]) map[r.id] = r;
      setResults(map);
      setLastScan(new Date().toLocaleTimeString("fr-FR"));
    } finally {
      setProbing(null);
    }
  }, []);

  const probeOne = useCallback(async (id: string) => {
    setProbing(id);
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      const r = (data.results ?? [])[0] as ProbeResult | undefined;
      if (r) setResults((p) => ({ ...p, [r.id]: r }));
    } finally {
      setProbing(null);
    }
  }, []);

  const connected = Object.values(results).filter((r) => r.ok).length;
  const localCount = servers.filter((s) => s.transport === "local").length;

  return (
    <section className="hud-frame flex flex-col border border-cyan-500/20 bg-[#04101f]/75 backdrop-blur-md">
      <header className="flex items-center gap-2 border-b border-cyan-500/15 px-4 py-2.5">
        <Plug size={13} className="text-cyan-400/80" />
        <p className="font-orbitron text-[10px] uppercase tracking-[0.3em] text-cyan-400/80">
          Connexions MCP
        </p>
        <span className="ml-auto font-tech text-[9px] tracking-[0.16em] text-cyan-500/60">
          {connected}/{localCount + servers.filter((s) => s.transport === "remote").length} EN LIGNE
          {lastScan ? ` · ${lastScan}` : ""}
        </span>
        <button
          onClick={probeAll}
          disabled={probing !== null}
          className="cyber-btn flex items-center gap-1.5 border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-1 font-tech text-[9.5px] uppercase tracking-[0.14em] text-cyan-100 transition-colors hover:bg-cyan-400/25 disabled:opacity-50"
        >
          {probing === "*" ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
          Scanner
        </button>
      </header>

      <div className="grid gap-2 p-3 sm:grid-cols-2">
        {servers.map((s) => {
          const r = results[s.id];
          const busy = probing === s.id || probing === "*";
          return (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`border px-3 py-2.5 transition-colors ${
                r?.ok
                  ? "border-emerald-400/40 bg-emerald-400/[0.06]"
                  : r
                    ? "border-rose-400/30 bg-rose-400/[0.04]"
                    : "border-cyan-500/15 bg-cyan-950/25"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    r?.ok ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" : r ? "bg-rose-400" : "bg-cyan-700"
                  }`}
                />
                <p className="min-w-0 flex-1 truncate text-[12px] text-cyan-50">{s.name}</p>
                <span
                  className={`shrink-0 border px-1 py-px font-tech text-[7.5px] uppercase tracking-[0.14em] ${
                    s.transport === "local"
                      ? "border-cyan-400/35 text-cyan-300/85"
                      : "border-violet-400/35 text-violet-300/85"
                  }`}
                >
                  {s.transport === "local" ? "local" : s.auth}
                </span>
              </div>
              <p className="mt-1 truncate font-tech text-[9.5px] text-cyan-500/55">{s.endpoint}</p>
              <p className="mt-1 line-clamp-2 font-tech text-[9.5px] leading-snug text-cyan-200/65">{s.desc}</p>

              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => probeOne(s.id)}
                  disabled={busy}
                  className="cyber-btn flex items-center gap-1 border border-cyan-400/35 bg-cyan-400/10 px-2 py-0.5 font-tech text-[9px] uppercase tracking-[0.14em] text-cyan-100 transition-colors hover:bg-cyan-400/25 disabled:opacity-50"
                >
                  {busy ? <Loader2 size={9} className="animate-spin" /> : r?.ok ? <Plug size={9} /> : <Unplug size={9} />}
                  {busy ? "sonde…" : r ? (r.ok ? "connecté" : "hors ligne") : "tester"}
                </button>
                {r && (
                  <span className="font-tech text-[9px] tabular-nums text-cyan-500/55">{r.ms} ms</span>
                )}
                {r && !r.ok && (
                  <span className="truncate font-tech text-[9px] text-rose-300/75">{r.error}</span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <footer className="border-t border-cyan-500/10 px-4 py-2 font-tech text-[9.5px] leading-relaxed text-cyan-500/55">
        Les serveurs locaux démarrent avec leurs applications (blender-mcp, unity-mcp, godot-mcp).
        Ajoutez un serveur dans <span className="text-cyan-300/85">src/app/api/mcp/route.ts</span>.
      </footer>
    </section>
  );
}
