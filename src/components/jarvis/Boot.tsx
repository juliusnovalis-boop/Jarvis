"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Power, ShieldCheck } from "lucide-react";
import { DecryptedText } from "./FuturisticHud";

const BOOT_LINES = [
  { label: "Vérification du noyau neuronal Mark VII", code: "0x00A1" },
  { label: "Chargement des modules vocaux [fr-FR / en-US]", code: "0x01C4" },
  { label: "Connexion au cluster PostgreSQL local", code: "0x02F8" },
  { label: "Calibration de l'interface holographique HUD", code: "0x03B2" },
  { label: "Synchronisation des 82 API publiques & mémoire", code: "0x04E9" },
  { label: "Tous les systèmes sont en ligne", code: "READY" },
];

export function Boot({ onInit }: { onInit: () => void }) {
  const [progress, setProgress] = useState(0);
  const done = progress >= BOOT_LINES.length;
  const pct = Math.round((progress / BOOT_LINES.length) * 100);

  useEffect(() => {
    const id = setInterval(() => setProgress((p) => Math.min(BOOT_LINES.length, p + 1)), 320);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      className="jarvis-scene fixed inset-0 z-50 grid place-items-center overflow-hidden bg-[#01040c]"
      exit={{ opacity: 0, scale: 1.05, filter: "blur(8px)" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="jarvis-grid pointer-events-none absolute inset-0" />
      <div className="jarvis-scanlines pointer-events-none absolute inset-0 opacity-50" />
      <div className="jarvis-scanband pointer-events-none" />

      <div className="hud-frame relative z-10 w-[min(92vw,560px)] border border-cyan-500/25 bg-[#030e1c]/80 p-8 backdrop-blur-xl">
        {/* En-tête de télémétrie */}
        <div className="mb-6 flex items-center justify-between border-b border-cyan-500/15 pb-2.5 font-tech text-[9.5px] tracking-[0.25em] text-cyan-400/65">
          <span>STARK INDUSTRIES // OS v7.4</span>
          <span className="tabular-nums text-cyan-300">{pct}% SYNC</span>
        </div>

        {/* Mini réacteur holographique */}
        <div className="relative mx-auto mb-8 grid h-28 w-28 place-items-center">
          <div className="absolute h-28 w-28 rounded-full border border-cyan-400/35 animate-jarvis-spin-slowest [border-top-color:theme(colors.cyan.300)]" />
          <div className="absolute h-22 w-22 rounded-full border border-dashed border-cyan-400/45 animate-jarvis-spin-rev" />
          <div className="absolute h-16 w-16 rounded-full border border-cyan-300/30 animate-jarvis-spin-fast [border-bottom-color:theme(colors.emerald.300)]" />
          <div className="h-9 w-9 rounded-full bg-cyan-300 animate-jarvis-breathe shadow-[0_0_36px_8px_rgba(34,211,238,0.6)]" />
        </div>

        <h1 className="text-center font-orbitron text-2xl font-bold tracking-[0.42em] text-cyan-100 jarvis-glow sm:text-3xl">
          <DecryptedText text="J.A.R.V.I.S." speed={34} />
        </h1>
        <p className="mt-2 text-center font-tech text-[11px] tracking-[0.3em] text-cyan-400/65">
          JUST A RATHER VERY INTELLIGENT SYSTEM
        </p>

        <div className="mt-8 space-y-2 border border-cyan-500/15 bg-[#020813]/80 p-4 font-tech text-[12.5px] text-cyan-200/85">
          {BOOT_LINES.slice(0, progress).map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center justify-between gap-4"
            >
              <span className="truncate">
                <span className="mr-1.5 text-cyan-500/70">&gt;</span>
                {item.label}
                {i === BOOT_LINES.length - 1 ? "" : "…"}
              </span>
              <span className="shrink-0 font-tech text-[10px] tracking-[0.18em] text-emerald-400">
                [{item.code}] OK
              </span>
            </motion.div>
          ))}
          {!done && <div className="jarvis-caret h-4 w-2 bg-cyan-300/80" />}
        </div>

        {/* Barre de progression plasma */}
        <div className="mt-5 h-1.5 w-full overflow-hidden bg-cyan-950/80">
          <div
            className="h-full bg-gradient-to-r from-cyan-600 via-cyan-300 to-emerald-300 transition-all duration-300"
            style={{ width: `${pct}%`, boxShadow: "0 0 14px rgba(34,211,238,0.8)" }}
          />
        </div>

        <motion.button
          onClick={onInit}
          initial={false}
          animate={{ opacity: done ? 1 : 0.3, scale: done ? 1 : 0.98 }}
          whileHover={done ? { scale: 1.03, boxShadow: "0 0 42px rgba(34,211,238,0.5)" } : undefined}
          whileTap={done ? { scale: 0.97 } : undefined}
          disabled={!done}
          className="cyber-btn mx-auto mt-8 flex items-center gap-3 border border-cyan-400/65 bg-cyan-400/15 px-8 py-3 font-orbitron text-xs uppercase tracking-[0.3em] text-cyan-100 transition-colors hover:bg-cyan-400/25 disabled:cursor-wait sm:text-sm"
        >
          <Power size={16} className="text-cyan-200" />
          Initialiser l&apos;interface
          {done && <ShieldCheck size={15} className="text-emerald-300" />}
        </motion.button>
        <p className="mt-4 text-center font-tech text-[10px] tracking-[0.2em] text-cyan-500/45">
          L&apos;initialisation active la synthèse vocale et l&apos;écoute neuronale
        </p>
      </div>
    </motion.div>
  );
}
