"use client";

import { useState } from "react";
import {
  Bell, BookOpen, Brain, Calculator, CheckCircle2, Circle, Clock, CloudSun,
  Cpu, Globe, ListChecks, Music, Newspaper, NotebookPen, Sparkles, Timer,
} from "lucide-react";

export interface NoteItem { id: number; content: string; ts: string }
export interface TaskItem { id: number; content: string; done: boolean; ts: string }
export interface EventItem { id: number; title: string; at: string }

interface MemoryPanelProps {
  userName: string | null;
  city: string | null;
  notes: NoteItem[];
  tasks: TaskItem[];
  events: EventItem[];
}

const MODULES = [
  { icon: Clock, label: "Horloge" },
  { icon: CloudSun, label: "Météo" },
  { icon: BookOpen, label: "Wikipédia" },
  { icon: Calculator, label: "Calcul" },
  { icon: Timer, label: "Minuteur" },
  { icon: Bell, label: "Rappels" },
  { icon: NotebookPen, label: "Notes" },
  { icon: ListChecks, label: "Tâches" },
  { icon: Globe, label: "Web" },
  { icon: Music, label: "Musique" },
  { icon: Newspaper, label: "Actus tech" },
  { icon: Sparkles, label: "Humour" },
];

export function MemoryPanel({ userName, city, notes, tasks, events }: MemoryPanelProps) {
  const [tab, setTab] = useState<"memory" | "modules">("memory");

  return (
    <section className="hud-frame hidden max-h-[300px] w-full shrink-0 flex-col border border-cyan-500/15 bg-[#04101f]/70 backdrop-blur-md lg:flex">
      <header className="flex items-center gap-1 border-b border-cyan-500/15 px-3 py-1.5">
        <button
          onClick={() => setTab("memory")}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-orbitron text-[9px] uppercase tracking-[0.25em] transition-colors ${
            tab === "memory" ? "bg-cyan-400/15 text-cyan-100" : "text-cyan-500/50 hover:text-cyan-300"
          }`}
        >
          <Brain size={11} /> Mémoire
        </button>
        <button
          onClick={() => setTab("modules")}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-orbitron text-[9px] uppercase tracking-[0.25em] transition-colors ${
            tab === "modules" ? "bg-cyan-400/15 text-cyan-100" : "text-cyan-500/50 hover:text-cyan-300"
          }`}
        >
          <Cpu size={11} /> Modules
        </button>
      </header>

      <div className="jarvis-scroll min-h-0 flex-1 overflow-y-auto p-3.5">
        {tab === "memory" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="border border-cyan-500/15 bg-cyan-950/30 px-2.5 py-2">
                <p className="font-tech text-[9px] uppercase tracking-[0.2em] text-cyan-500/60">Identité</p>
                <p className="mt-0.5 truncate text-[12px] text-cyan-100">{userName ?? "Inconnue"}</p>
              </div>
              <div className="border border-cyan-500/15 bg-cyan-950/30 px-2.5 py-2">
                <p className="font-tech text-[9px] uppercase tracking-[0.2em] text-cyan-500/60">Ville</p>
                <p className="mt-0.5 truncate text-[12px] capitalize text-cyan-100">{city ?? "Paris (défaut)"}</p>
              </div>
            </div>

            <div>
              <p className="mb-1.5 font-tech text-[9px] uppercase tracking-[0.25em] text-cyan-400/60">
                Agenda
              </p>
              {events.length === 0 ? (
                <p className="font-tech text-[11px] text-cyan-500/40">
                  Dites : « ajoute rendez-vous dentiste demain à 14h »
                </p>
              ) : (
                <ul className="space-y-1">
                  {events.slice(0, 4).map((e) => (
                    <li key={e.id} className="truncate border-l border-amber-400/40 pl-2 text-[11px] text-cyan-100/85">
                      <span className="text-amber-200/90">
                        {new Date(e.at).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                        {" "}
                        {new Date(e.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </span>{" "}
                      · {e.title}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-1.5 font-tech text-[9px] uppercase tracking-[0.25em] text-cyan-400/60">
                Notes récentes
              </p>
              {notes.length === 0 ? (
                <p className="font-tech text-[11px] text-cyan-500/40">
                  Dites : « note que … »
                </p>
              ) : (
                <ul className="space-y-1">
                  {notes.slice(0, 4).map((n) => (
                    <li key={n.id} className="truncate border-l border-cyan-500/30 pl-2 text-[11px] text-cyan-100/85">
                      {n.content}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-1.5 font-tech text-[9px] uppercase tracking-[0.25em] text-cyan-400/60">
                Tâches
              </p>
              {tasks.length === 0 ? (
                <p className="font-tech text-[11px] text-cyan-500/40">
                  Dites : « ajoute la tâche … »
                </p>
              ) : (
                <ul className="space-y-1">
                  {tasks.slice(0, 5).map((t) => (
                    <li key={t.id} className="flex items-center gap-1.5 text-[11px] text-cyan-100/85">
                      {t.done ? (
                        <CheckCircle2 size={11} className="shrink-0 text-emerald-400" />
                      ) : (
                        <Circle size={11} className="shrink-0 text-cyan-500/60" />
                      )}
                      <span className={`truncate ${t.done ? "text-cyan-500/40 line-through" : ""}`}>{t.content}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {MODULES.map((m) => (
              <div
                key={m.label}
                className="group flex flex-col items-center gap-1.5 border border-cyan-500/15 bg-cyan-950/30 px-1 py-2.5 transition-colors hover:border-cyan-400/40 hover:bg-cyan-400/10"
              >
                <m.icon size={15} className="text-cyan-300/80 transition-transform group-hover:scale-110" />
                <p className="font-tech text-[9px] tracking-wide text-cyan-200/80">{m.label}</p>
                <span className="flex items-center gap-1 font-tech text-[7.5px] tracking-[0.2em] text-emerald-400/90">
                  <span className="h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,1)]" />
                  ACTIF
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
