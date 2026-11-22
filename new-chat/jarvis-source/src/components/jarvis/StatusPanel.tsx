"use client";

import { useEffect, useState } from "react";
import { Activity, Clock, Database, Ear, Radio, Volume2 } from "lucide-react";
import type { CoreStatus } from "./Core";

interface StatusPanelProps {
  status: CoreStatus;
  sttOk: boolean;
  ttsOk: boolean;
  wakeOn: boolean;
  /** D'où vient l'écoute : interface web ou agent installé sur le PC. */
  wakeSource?: string | null;
  voiceName: string | null;
  bootTime: number;
  messageCount: number;
}

function useBars() {
  const [bars, setBars] = useState([34, 52, 21, 44]);
  useEffect(() => {
    const id = setInterval(() => {
      setBars((prev) =>
        prev.map((v) => {
          const next = v + (Math.random() * 26 - 13);
          return Math.max(8, Math.min(94, Math.round(next)));
        })
      );
    }, 1400);
    return () => clearInterval(id);
  }, []);
  return bars;
}

function useUptime(bootTime: number) {
  const [up, setUp] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setUp(Math.floor((Date.now() - bootTime) / 1000)), 1000);
    return () => clearInterval(id);
  }, [bootTime]);
  const h = String(Math.floor(up / 3600)).padStart(2, "0");
  const m = String(Math.floor((up % 3600) / 60)).padStart(2, "0");
  const s = String(up % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function StatusPanel({ status, sttOk, ttsOk, wakeOn, wakeSource, voiceName, bootTime, messageCount }: StatusPanelProps) {
  const [now, setNow] = useState(new Date());
  const bars = useBars();
  const uptime = useUptime(bootTime);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const barDefs = [
    { label: "CPU NEURONAL", value: status === "thinking" ? Math.max(bars[0], 72) : bars[0] },
    { label: "MÉMOIRE", value: bars[1] },
    { label: "RÉSEAU", value: bars[2] },
    { label: "TEMP. CŒUR", value: status === "speaking" ? Math.max(bars[3], 58) : bars[3] },
  ];

  const checks = [
    { icon: Database, label: "BASE DE DONNÉES", ok: true, detail: "PostgreSQL" },
    {
      icon: Ear,
      label: "RECONNAISSANCE",
      ok: sttOk || wakeOn,
      detail: sttOk ? "fr-FR · interface" : wakeOn ? "fr-FR · agent PC" : "absente",
    },
    { icon: Volume2, label: "SYNTHÈSE", ok: ttsOk, detail: voiceName ?? "—" },
    {
      icon: Radio,
      label: "ÉCOUTE VOCALE CONTINUE",
      ok: wakeOn,
      detail: wakeOn ? `active · ${wakeSource ?? "actif"}` : "en attente du micro",
    },
  ];

  return (
    <aside className="hud-frame hidden w-64 shrink-0 flex-col gap-5 border border-cyan-500/15 bg-[#04101f]/70 p-5 backdrop-blur-md lg:flex">
      <div>
        <p className="font-orbitron text-[10px] uppercase tracking-[0.35em] text-cyan-400/70">Systèmes</p>
        <div className="mt-3 flex items-baseline gap-2">
          <Clock size={13} className="translate-y-px text-cyan-300/70" />
          <span className="font-tech text-2xl tabular-nums text-cyan-100 jarvis-glow">
            {now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        </div>
        <p className="mt-1 font-tech text-[11px] capitalize tracking-wider text-cyan-400/70">
          {now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <p className="mt-2 font-tech text-[10px] tracking-[0.2em] text-cyan-500/50">SESSION {uptime}</p>
      </div>

      <div className="h-px bg-gradient-to-r from-cyan-500/40 to-transparent" />

      <div className="space-y-3">
        {barDefs.map((b) => (
          <div key={b.label}>
            <div className="mb-1 flex items-center justify-between font-tech text-[10px] tracking-[0.18em] text-cyan-300/70">
              <span>{b.label}</span>
              <span className="tabular-nums text-cyan-200">{b.value}%</span>
            </div>
            <div className="h-[5px] w-full overflow-hidden rounded-sm bg-cyan-950/80">
              <div
                className="h-full rounded-sm bg-gradient-to-r from-cyan-600 via-cyan-400 to-cyan-200 transition-all duration-1000 ease-out"
                style={{ width: `${b.value}%`, boxShadow: "0 0 8px rgba(34,211,238,0.6)" }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="h-px bg-gradient-to-r from-cyan-500/40 to-transparent" />

      <div className="space-y-2.5">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-2.5">
            <c.icon size={13} className="shrink-0 text-cyan-400/60" />
            <div className="min-w-0 flex-1">
              <p className="font-tech text-[10px] tracking-[0.15em] text-cyan-200/80">{c.label}</p>
              <p className="truncate font-tech text-[9px] text-cyan-500/50">{c.detail}</p>
            </div>
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.ok ? "bg-emerald-400" : "bg-rose-400"}`}
              style={{ boxShadow: c.ok ? "0 0 8px rgba(52,211,153,0.9)" : "0 0 8px rgba(251,113,133,0.9)" }}
            />
          </div>
        ))}
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-cyan-500/10 pt-3">
        <Activity size={12} className="text-cyan-400/60" />
        <p className="font-tech text-[9px] tracking-[0.2em] text-cyan-500/50">
          {messageCount} ÉCHANGES ARCHIVÉS
        </p>
      </div>
    </aside>
  );
}
