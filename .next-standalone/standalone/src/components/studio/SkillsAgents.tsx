"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bot, Loader2, Plus, Sparkles, Trash2, Wrench } from "lucide-react";

interface Skill {
  id: string;
  name: string;
  cat: string;
  desc: string;
}
interface Agent {
  id: number;
  name: string;
  role: string;
  tools: string;
}

const SKILLS: Skill[] = [
  { id: "react", name: "React / Next.js", cat: "Front", desc: "App Router, Server Components, hooks" },
  { id: "three", name: "Three.js / WebGL", cat: "3D", desc: "Scènes, shaders, optimisation" },
  { id: "blender-py", name: "Blender Python", cat: "3D", desc: "bpy : modélisation et rendu scriptés" },
  { id: "unity-cs", name: "Unity C#", cat: "Jeu", desc: "GameObjects, coroutines, ECS" },
  { id: "gdscript", name: "GDScript / Godot", cat: "Jeu", desc: "Nœuds, signaux, scènes" },
  { id: "shader", name: "GLSL / Shaders", cat: "3D", desc: "Vertex, fragment, post-processing" },
  { id: "node-api", name: "API Node & Drizzle", cat: "Back", desc: "Routes, ORM PostgreSQL, jobs" },
  { id: "python", name: "Python agentique", cat: "Back", desc: "pyautogui, agents, automatisation" },
  { id: "mcp", name: "Protocole MCP", cat: "Agents", desc: "Outils, ressources, prompts" },
  { id: "rag", name: "RAG & embeddings", cat: "Agents", desc: "Chunks, similarité, citations" },
  { id: "ffmpeg", name: "FFmpeg / montage", cat: "Média", desc: "Transcodage, timecode, sous-titres" },
  { id: "docker", name: "Docker & CI", cat: "Ops", desc: "Images, workflows, déploiement" },
];

const CATS = ["Tous", "Front", "3D", "Jeu", "Back", "Agents", "Média", "Ops"];

/** 🧠 SKILLS + AGENTS IA — compétences activables (localStorage) et agents en base. */
export function SkillsAgents() {
  const [active, setActive] = useState<Set<string>>(new Set());
  const [cat, setCat] = useState("Tous");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("jarvis.skills");
      if (raw) setActive(new Set(JSON.parse(raw) as string[]));
    } catch { /* première visite */ }
    fetch("/api/agents", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAgents(d.agents ?? []))
      .catch(() => undefined);
  }, []);

  const toggleSkill = useCallback((id: string) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem("jarvis.skills", JSON.stringify([...next]));
      } catch { /* stockage indisponible */ }
      return next;
    });
  }, []);

  const createAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !role.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), role: role.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setAgents((p) => [
          { id: data.agent.id, name: data.agent.name, role: data.agent.role, tools: "[]" },
          ...p.filter((a) => a.name !== data.agent.name),
        ]);
        setName("");
        setRole("");
      }
    } finally {
      setBusy(false);
    }
  };

  const removeAgent = async (id: number) => {
    setAgents((p) => p.filter((a) => a.id !== id));
    await fetch("/api/agents", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => undefined);
  };

  const visible = SKILLS.filter((s) => cat === "Tous" || s.cat === cat);

  return (
    <div className="flex flex-col gap-3">
      {/* Skills */}
      <section className="hud-frame border border-cyan-500/20 bg-[#04101f]/75 backdrop-blur-md">
        <header className="flex items-center gap-2 border-b border-cyan-500/15 px-4 py-2.5">
          <Wrench size={13} className="text-cyan-400/80" />
          <p className="font-orbitron text-[10px] uppercase tracking-[0.3em] text-cyan-400/80">Skills</p>
          <span className="ml-auto font-tech text-[9px] tracking-[0.16em] text-cyan-500/60">
            {active.size}/{SKILLS.length} ACTIFS
          </span>
        </header>

        <div className="jarvis-scroll flex gap-1 overflow-x-auto border-b border-cyan-500/10 px-2 py-1.5">
          {CATS.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`shrink-0 border px-2 py-0.5 font-tech text-[9px] uppercase tracking-[0.12em] transition-colors ${
                cat === c
                  ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-100"
                  : "border-cyan-500/15 text-cyan-500/60 hover:text-cyan-300"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="grid gap-1.5 p-2.5 sm:grid-cols-2">
          {visible.map((s) => {
            const on = active.has(s.id);
            return (
              <button
                key={s.id}
                onClick={() => toggleSkill(s.id)}
                className={`border px-2.5 py-2 text-left transition-colors ${
                  on
                    ? "border-emerald-400/40 bg-emerald-400/[0.07]"
                    : "border-cyan-500/15 bg-cyan-950/20 hover:border-cyan-400/35"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Sparkles size={10} className={on ? "text-emerald-300" : "text-cyan-600"} />
                  <p className="truncate text-[11.5px] text-cyan-50">{s.name}</p>
                  <span
                    className={`ml-auto h-1.5 w-1.5 rounded-full ${on ? "bg-emerald-400 shadow-[0_0_7px_rgba(52,211,153,0.9)]" : "bg-cyan-800"}`}
                  />
                </div>
                <p className="mt-0.5 truncate font-tech text-[9px] text-cyan-500/55">
                  {s.cat} · {s.desc}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Agents IA */}
      <section className="hud-frame border border-cyan-500/20 bg-[#04101f]/75 backdrop-blur-md">
        <header className="flex items-center gap-2 border-b border-cyan-500/15 px-4 py-2.5">
          <Bot size={13} className="text-cyan-400/80" />
          <p className="font-orbitron text-[10px] uppercase tracking-[0.3em] text-cyan-400/80">
            Agents IA
          </p>
          <span className="ml-auto font-tech text-[9px] tracking-[0.16em] text-cyan-500/60">
            {agents.length} EN BASE
          </span>
        </header>

        <form onSubmit={createAgent} className="space-y-1.5 border-b border-cyan-500/10 p-2.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom (ex. Codeur)"
            maxLength={40}
            className="w-full border border-cyan-500/25 bg-[#04101f] px-2.5 py-1.5 font-tech text-[11.5px] text-cyan-50 placeholder:text-cyan-600/60 focus:border-cyan-300/60 focus:outline-none"
          />
          <textarea
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Mission / prompt système (ex. m'aide à écrire du code propre et testé)"
            rows={2}
            maxLength={500}
            className="w-full resize-none border border-cyan-500/25 bg-[#04101f] px-2.5 py-1.5 font-tech text-[11.5px] text-cyan-50 placeholder:text-cyan-600/60 focus:border-cyan-300/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !name.trim() || !role.trim()}
            className="cyber-btn flex w-full items-center justify-center gap-1.5 border border-cyan-400/45 bg-cyan-400/12 py-1.5 font-tech text-[10px] uppercase tracking-[0.16em] text-cyan-50 transition-colors hover:bg-cyan-400/25 disabled:opacity-40"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            Créer l&apos;agent
          </button>
        </form>

        <div className="jarvis-scroll max-h-52 space-y-1.5 overflow-y-auto p-2.5">
          {agents.length === 0 && (
            <p className="py-3 text-center font-tech text-[10.5px] text-cyan-500/45">
              Aucun agent. Créez « Codeur », « Illustrateur »…
            </p>
          )}
          {agents.map((a) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="group flex items-start gap-2 border border-cyan-500/15 bg-cyan-950/25 px-2.5 py-2"
            >
              <Bot size={12} className="mt-0.5 shrink-0 text-cyan-400/75" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11.5px] text-cyan-50">@{a.name}</p>
                <p className="line-clamp-2 font-tech text-[9.5px] leading-snug text-cyan-500/60">{a.role}</p>
              </div>
              <button
                onClick={() => removeAgent(a.id)}
                className="shrink-0 text-cyan-600/70 transition-colors hover:text-rose-300"
                title="Supprimer"
              >
                <Trash2 size={12} />
              </button>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
