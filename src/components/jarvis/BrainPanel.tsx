"use client";

import { useState } from "react";
import { Check, Cloud, Cpu, HardDrive, Loader2, ShieldCheck, Zap } from "lucide-react";

export interface BrainInfo {
  engine: string;
  model: string | null;
  detail: string;
  candidates: { engine: string; configured: boolean; detail: string }[];
}

export interface OllamaModel {
  name: string;
  sizeB: number | null;
  allowed: boolean;
  gib: number | null;
}

export interface OllamaInfo {
  up: boolean;
  preferred: string | null;
  active: string | null;
  maxParamsB: number;
  models: OllamaModel[];
}

const LABELS: Record<string, { name: string; icon: typeof Cpu; tag: string }> = {
  ollama: { name: "Ollama", icon: HardDrive, tag: "100% LOCAL" },
  doubao: { name: "Doubao", icon: Zap, tag: "ARK" },
  gemini: { name: "Google Gemini", icon: Cloud, tag: "CLOUD" },
  groq: { name: "Groq", icon: Cloud, tag: "RAPIDE" },
  mistral: { name: "Mistral AI", icon: Cloud, tag: "CLOUD" },
  deepseek: { name: "DeepSeek", icon: Cloud, tag: "CLOUD" },
  openrouter: { name: "OpenRouter", icon: Cloud, tag: "CLOUD" },
  openai: { name: "OpenAI", icon: Cloud, tag: "CLOUD" },
  anthropic: { name: "Claude", icon: Cloud, tag: "CLOUD" },
  rules: { name: "Moteur d'intentions", icon: Zap, tag: "EMBARQUÉ" },
};

interface BrainPanelProps {
  brain: BrainInfo | null;
  ollama?: OllamaInfo | null;
  onRefresh?: () => void;
}

export function BrainPanel({ brain, ollama, onRefresh }: BrainPanelProps) {
  const active = brain ? LABELS[brain.engine] : null;
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const chooseModel = async (name: string) => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/brain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: name }),
      });
      const data = await res.json();
      setNotice(
        data.ok
          ? name
            ? `Modèle actif : ${name}`
            : "Sélection automatique rétablie"
          : data.error ?? "Choix impossible"
      );
      onRefresh?.();
    } catch {
      setNotice("Le moteur local n'a pas répondu.");
    } finally {
      setSaving(false);
    }
  };

  const usable = ollama?.models.filter((m) => m.allowed) ?? [];
  const blocked = ollama?.models.filter((m) => !m.allowed) ?? [];

  return (
    <section className="hud-frame flex flex-col border border-cyan-500/15 bg-[#04101f]/70 backdrop-blur-md">
      <header className="flex items-center gap-2 border-b border-cyan-500/15 px-3 py-2">
        <Cpu size={13} className="text-cyan-400/70" />
        <p className="font-orbitron text-[10px] uppercase tracking-[0.3em] text-cyan-400/70">Cerveau</p>
        {brain?.engine === "ollama" && (
          <span className="ml-auto flex items-center gap-1 font-tech text-[8.5px] tracking-[0.15em] text-emerald-400/90">
            <ShieldCheck size={10} /> PRIVÉ
          </span>
        )}
      </header>

      <div className="jarvis-scroll max-h-[320px] overflow-y-auto p-2.5">
        {active && brain ? (
          <div className="mb-2 border border-cyan-400/30 bg-cyan-400/[0.07] px-2.5 py-2">
            <div className="flex items-center gap-2">
              <active.icon size={14} className="text-cyan-300" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] text-cyan-50">
                  {active.name}
                  {brain.model ? <span className="text-cyan-400/70"> · {brain.model}</span> : ""}
                </p>
                <p className="font-tech text-[8.5px] uppercase tracking-[0.15em] text-cyan-500/60">
                  {brain.detail}
                </p>
              </div>
              <span className="shrink-0 border border-emerald-400/40 px-1.5 py-0.5 font-tech text-[7.5px] tracking-[0.12em] text-emerald-300">
                {active.tag}
              </span>
            </div>
          </div>
        ) : (
          <p className="py-2 text-center font-tech text-[11px] text-cyan-500/40">Détection des backends…</p>
        )}

        {/* ---- Choix du modèle Ollama ---- */}
        {ollama?.up && (
          <div className="mb-2.5 border border-cyan-500/20 bg-cyan-950/30 px-2.5 py-2">
            <div className="mb-1.5 flex items-center gap-1.5">
              <HardDrive size={11} className="text-cyan-300/80" />
              <p className="font-tech text-[9px] uppercase tracking-[0.2em] text-cyan-300/80">
                Modèle Ollama
              </p>
              {saving && <Loader2 size={10} className="ml-auto animate-spin text-cyan-400" />}
            </div>

            {usable.length === 0 ? (
              <p className="font-tech text-[9.5px] leading-relaxed text-amber-200/70">
                Aucun modèle ≤ {ollama.maxParamsB} B installé. Dans un terminal :{" "}
                <code className="text-amber-100">ollama pull llama3.2:3b</code>
              </p>
            ) : (
              <>
                <button
                  onClick={() => chooseModel("")}
                  disabled={saving}
                  className={`mb-1 flex w-full items-center gap-2 border px-2 py-1 text-left transition-colors disabled:opacity-50 ${
                    !ollama.preferred
                      ? "border-emerald-400/50 bg-emerald-400/10"
                      : "border-cyan-500/15 hover:border-cyan-400/40"
                  }`}
                >
                  {!ollama.preferred ? (
                    <Check size={10} className="shrink-0 text-emerald-400" />
                  ) : (
                    <span className="w-[10px] shrink-0" />
                  )}
                  <span className="font-tech text-[10px] text-cyan-100">Automatique</span>
                  <span className="ml-auto font-tech text-[8.5px] text-cyan-500/50">
                    {ollama.active ?? "—"}
                  </span>
                </button>

                {usable.map((m) => {
                  const selected = ollama.preferred === m.name;
                  return (
                    <button
                      key={m.name}
                      onClick={() => chooseModel(m.name)}
                      disabled={saving}
                      className={`mb-1 flex w-full items-center gap-2 border px-2 py-1 text-left transition-colors disabled:opacity-50 ${
                        selected
                          ? "border-emerald-400/50 bg-emerald-400/10"
                          : "border-cyan-500/15 hover:border-cyan-400/40"
                      }`}
                    >
                      {selected ? (
                        <Check size={10} className="shrink-0 text-emerald-400" />
                      ) : (
                        <span className="w-[10px] shrink-0" />
                      )}
                      <span className="truncate font-tech text-[10px] text-cyan-100">{m.name}</span>
                      <span className="ml-auto shrink-0 font-tech text-[8.5px] text-cyan-500/50">
                        {m.sizeB ? `${m.sizeB} B` : ""}
                        {m.gib ? ` · ${m.gib} Go` : ""}
                      </span>
                    </button>
                  );
                })}
              </>
            )}

            {blocked.length > 0 && (
              <p className="mt-1 font-tech text-[8.5px] leading-relaxed text-cyan-600/60">
                Écartés (&gt; {ollama.maxParamsB} B) : {blocked.map((m) => m.name).join(", ")}
              </p>
            )}

            {notice && (
              <p className="mt-1.5 border-l border-cyan-400/40 pl-2 font-tech text-[9px] text-cyan-200/80">
                {notice}
              </p>
            )}
          </div>
        )}

        <div className="space-y-1">
          {brain?.candidates.map((c) => {
            const meta = LABELS[c.engine];
            if (!meta) return null;
            const isActive = c.engine === brain.engine;
            return (
              <div
                key={c.engine}
                className={`flex items-center gap-2 px-1.5 py-1 ${isActive ? "opacity-100" : "opacity-55"}`}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    c.configured ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" : "bg-slate-700"
                  }`}
                />
                <p className="font-tech text-[10px] tracking-wide text-cyan-200/80">{meta.name}</p>
                <p className="ml-auto truncate font-tech text-[9px] text-cyan-500/50">{c.detail}</p>
              </div>
            );
          })}
        </div>

        {brain?.engine === "rules" && (
          <p className="mt-2 border-l border-amber-400/40 pl-2 font-tech text-[9.5px] leading-relaxed text-amber-200/70">
            Lancez <span className="text-amber-100">ollama serve</span> puis{" "}
            <span className="text-amber-100">ollama pull llama3.2:3b</span> pour un cerveau local,
            gratuit et privé. Ou ajoutez une clé Gemini, Groq ou Mistral.
          </p>
        )}
      </div>
    </section>
  );
}
