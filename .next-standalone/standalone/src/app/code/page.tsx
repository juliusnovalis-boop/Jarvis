import Link from "next/link";
import { ArrowLeft, Code2, Gamepad2, Plug, Wrench } from "lucide-react";
import { McpHub } from "@/components/studio/McpHub";
import { VideoStudio } from "@/components/studio/VideoStudio";

import { SkillsAgents } from "@/components/studio/SkillsAgents";

export const metadata = {
  title: "DEV STUDIO — J.A.R.V.I.S.",
  description:
    "Espace de programmation : connexions MCP (Blender, Unity, Godot), skills, agents IA, studio de montage vidéo et studio de jeux vidéo.",
};

/** 💻 DEV STUDIO — programmation, MCP, skills, agents IA, montage et jeux. */
export default function CodePage() {
  return (
    <main className="jarvis-scene relative min-h-screen overflow-x-hidden px-4 py-6 text-cyan-50">
      <div className="jarvis-grid pointer-events-none absolute inset-0" />
      <div className="jarvis-scanlines pointer-events-none absolute inset-0 opacity-45" />
      <div className="jarvis-scanband pointer-events-none" />

      <section className="relative z-10 mx-auto max-w-[1500px] space-y-4">
        <header className="flex flex-wrap items-end gap-4 border-b border-cyan-500/20 pb-4">
          <Link
            href="/"
            className="cyber-btn flex items-center gap-1.5 border border-cyan-500/30 px-3 py-2 font-tech text-[10px] uppercase tracking-[0.18em] text-cyan-300 transition-colors hover:border-cyan-400/60 hover:text-cyan-100"
          >
            <ArrowLeft size={12} /> Retour
          </Link>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-tech text-[10px] uppercase tracking-[0.4em] text-cyan-400/65">
              <Code2 size={13} /> Espace programmation
            </p>
            <h1 className="mt-1.5 font-orbitron text-2xl font-bold tracking-[0.22em] text-cyan-100 jarvis-glow sm:text-4xl">
              DEV STUDIO
            </h1>
            <p className="mt-1.5 max-w-2xl font-tech text-[11.5px] leading-relaxed text-cyan-200/70">
              Connexions <strong className="text-cyan-100">MCP</strong> (Blender, Unity, Godot, VS Code),
              bibliothèque de <strong className="text-cyan-100">skills</strong>,{" "}
              <strong className="text-cyan-100">agents IA</strong> en base,{" "}
              <strong className="text-cyan-100">studio de montage</strong> multi-pistes et{" "}
              <strong className="text-cyan-100">studio de jeux vidéo</strong> jouable.
            </p>
          </div>

          <div className="hidden gap-2 sm:flex">
            {[
              { icon: Plug, label: "MCP", value: "10 endpoints" },
              { icon: Wrench, label: "Skills", value: "12 modules" },
              { icon: Gamepad2, label: "Moteur", value: "3D · PBR" },
            ].map((s) => (
              <div
                key={s.label}
                className="hud-frame border border-cyan-500/20 bg-[#04101f]/70 px-3 py-2 text-center"
              >
                <s.icon size={13} className="mx-auto text-cyan-400/75" />
                <p className="mt-1 font-tech text-[8.5px] uppercase tracking-[0.18em] text-cyan-500/60">
                  {s.label}
                </p>
                <p className="font-tech text-[11px] text-cyan-100">{s.value}</p>
              </div>
            ))}
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-4">
            <McpHub />
            <VideoStudio />
            <Link href="/studio" className="hud-frame flex items-center gap-5 border border-lime-300/30 bg-[#18251b] p-7 transition-colors hover:bg-[#233323]">
              <Gamepad2 size={36} className="shrink-0 text-lime-200" />
              <div>
                <h2 className="font-orbitron text-lg text-lime-100">JARVIS STUDIO 3D ↗</h2>
                <p className="mt-2 font-tech text-xs leading-relaxed text-lime-100/70">Un véritable éditeur 3D plein écran : mondes procéduraux, matériaux PBR, portail animé, exploration jouable, sauvegarde et export GLB.</p>
              </div>
            </Link>
          </div>
          <div className="min-w-0">
            <SkillsAgents />
          </div>
        </div>

        <footer className="border-t border-cyan-500/15 pt-4 text-center font-tech text-[10px] tracking-[0.2em] text-cyan-500/45">
          J.A.R.V.I.S. DEV STUDIO · MCP + SKILLS + AGENTS + MONTAGE + JEU
        </footer>
      </section>
    </main>
  );
}
