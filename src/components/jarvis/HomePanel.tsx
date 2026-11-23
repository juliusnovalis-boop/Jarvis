"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Blinds, Clapperboard, Coffee, Home, Lightbulb, Moon, Plug, Power,
  Sun, Thermometer, Tv, Briefcase,
} from "lucide-react";

export interface Device {
  id: number;
  entityId: string;
  name: string;
  room: string;
  kind: string;
  state: string;
  level: number;
  source: string;
}

const ICONS: Record<string, typeof Lightbulb> = {
  light: Lightbulb,
  plug: Plug,
  thermostat: Thermometer,
  cover: Blinds,
  media: Tv,
};

const SCENES = [
  { label: "Cinéma", icon: Clapperboard, cmd: "mode cinéma" },
  { label: "Travail", icon: Briefcase, cmd: "mode travail" },
  { label: "Réveil", icon: Sun, cmd: "mode réveil" },
  { label: "Nuit", icon: Moon, cmd: "mode nuit" },
];

interface HomePanelProps {
  devices: Device[];
  homeAssistant: boolean;
  onRefresh: () => void;
  onScene: (cmd: string) => void;
}

export function HomePanel({ devices, homeAssistant, onRefresh, onScene }: HomePanelProps) {
  const [pending, setPending] = useState<string | null>(null);

  const toggle = useCallback(
    async (entityId: string) => {
      setPending(entityId);
      try {
        await fetch("/api/devices", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ entityId, toggle: true }),
        });
        onRefresh();
      } finally {
        setPending(null);
      }
    },
    [onRefresh]
  );

  const setLevel = useCallback(
    async (entityId: string, level: number) => {
      await fetch("/api/devices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entityId, level, state: level > 0 ? "on" : "off" }),
      });
      onRefresh();
    },
    [onRefresh]
  );

  const activeCount = devices.filter((d) => d.state === "on" && d.kind !== "thermostat").length;
  const thermo = devices.find((d) => d.kind === "thermostat");

  return (
    <section className="hud-frame flex flex-col border border-cyan-500/15 bg-[#04101f]/70 backdrop-blur-md">
      <header className="flex items-center gap-2 border-b border-cyan-500/15 px-3 py-2">
        <Home size={13} className="text-cyan-400/70" />
        <p className="font-orbitron text-[10px] uppercase tracking-[0.3em] text-cyan-400/70">Domotique</p>
        <span className="ml-auto font-tech text-[9px] tracking-[0.15em] text-cyan-500/60">
          {homeAssistant ? "HOME ASSISTANT" : "SIMULATION"}
        </span>
      </header>

      {/* Scènes */}
      <div className="grid grid-cols-4 gap-px border-b border-cyan-500/10 bg-cyan-500/10">
        {SCENES.map((s) => (
          <button
            key={s.label}
            onClick={() => onScene(s.cmd)}
            className="flex flex-col items-center gap-1 bg-[#04101f] py-2 font-tech text-[9px] tracking-wide text-cyan-300/75 transition-colors hover:bg-cyan-400/10 hover:text-cyan-100"
          >
            <s.icon size={13} />
            {s.label}
          </button>
        ))}
      </div>

      {/* Appareils */}
      <div className="jarvis-scroll max-h-[210px] space-y-1 overflow-y-auto p-2">
        {devices.length === 0 && (
          <p className="py-4 text-center font-tech text-[11px] text-cyan-500/40">Chargement des appareils…</p>
        )}
        {devices.map((d) => {
          const Icon = ICONS[d.kind] ?? Plug;
          const isOn = d.state === "on";
          const isThermo = d.kind === "thermostat";
          return (
            <div
              key={d.entityId}
              className={`border px-2 py-1.5 transition-colors ${
                isOn ? "border-cyan-400/35 bg-cyan-400/[0.07]" : "border-cyan-500/10 bg-cyan-950/20"
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon size={13} className={isOn ? "shrink-0 text-amber-300" : "shrink-0 text-cyan-600/70"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] leading-tight text-cyan-50">{d.name}</p>
                  <p className="font-tech text-[8.5px] uppercase tracking-[0.15em] text-cyan-500/50">
                    {d.room}
                    {isThermo ? ` · ${d.level}°C` : isOn && d.kind === "light" ? ` · ${d.level}%` : ""}
                  </p>
                </div>
                <button
                  onClick={() => toggle(d.entityId)}
                  disabled={pending === d.entityId}
                  className={`grid h-6 w-6 shrink-0 place-items-center border transition-all ${
                    isOn
                      ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-300"
                      : "border-cyan-500/25 text-cyan-600 hover:border-cyan-400/50 hover:text-cyan-300"
                  } disabled:opacity-40`}
                  title={isOn ? "Éteindre" : "Allumer"}
                >
                  <Power size={11} />
                </button>
              </div>

              {/* Curseur de niveau */}
              {(d.kind === "light" || isThermo || d.kind === "cover") && (
                <input
                  type="range"
                  min={isThermo ? 5 : 0}
                  max={isThermo ? 30 : 100}
                  value={d.level}
                  onChange={(e) => setLevel(d.entityId, Number(e.target.value))}
                  className="mt-1.5 h-1 w-full cursor-pointer appearance-none rounded bg-cyan-950 accent-cyan-400"
                  style={{
                    background: `linear-gradient(to right, rgb(34 211 238 / 0.8) ${
                      isThermo ? ((d.level - 5) / 25) * 100 : d.level
                    }%, rgb(8 51 68 / 0.9) ${isThermo ? ((d.level - 5) / 25) * 100 : d.level}%)`,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <footer className="flex items-center gap-2 border-t border-cyan-500/10 px-3 py-1.5">
        <Coffee size={11} className="text-cyan-500/50" />
        <p className="font-tech text-[9px] tracking-[0.15em] text-cyan-500/50">
          {activeCount} ACTIF{activeCount > 1 ? "S" : ""}
          {thermo ? ` · ${thermo.level}°C` : ""}
        </p>
      </footer>
    </section>
  );
}
