"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Power } from "lucide-react";

const BOOT_LINES = [
  "Vérification du noyau neuronal",
  "Chargement des modules vocaux [fr-FR]",
  "Connexion à la base de données",
  "Calibration de l'interface HUD",
  "Synchronisation de la mémoire long terme",
  "Tous les systèmes sont en ligne",
];

export function Boot({ onInit }: { onInit: () => void }) {
  const [progress, setProgress] = useState(0);
  const done = progress >= BOOT_LINES.length;

  useEffect(() => {
    const id = setInterval(() => setProgress((p) => Math.min(BOOT_LINES.length, p + 1)), 340);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-[#01040c]"
      exit={{ opacity: 0, scale: 1.04, filter: "blur(6px)" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="w-[min(92vw,540px)] px-6">
        {/* Mini réacteur */}
        <div className="mx-auto mb-10 grid h-24 w-24 place-items-center">
          <div className="absolute h-24 w-24 rounded-full border border-cyan-400/30 animate-jarvis-spin-slowest [border-top-color:theme(colors.cyan.300)]" />
          <div className="absolute h-16 w-16 rounded-full border border-dashed border-cyan-400/40 animate-jarvis-spin-rev" />
          <div className="h-8 w-8 rounded-full bg-cyan-300 animate-jarvis-breathe shadow-[0_0_30px_6px_rgba(34,211,238,0.5)]" />
        </div>

        <h1 className="text-center font-orbitron text-2xl font-bold tracking-[0.4em] text-cyan-100 jarvis-glow sm:text-3xl">
          J.A.R.V.I.S.
        </h1>
        <p className="mt-2 text-center font-tech text-[11px] tracking-[0.3em] text-cyan-400/60">
          JUST A RATHER VERY INTELLIGENT SYSTEM
        </p>

        <div className="mt-10 space-y-2 font-tech text-[13px] text-cyan-200/80">
          {BOOT_LINES.slice(0, progress).map((line, i) => (
            <motion.div key={line} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex justify-between gap-4">
              <span>
                <span className="text-cyan-500/70">&gt;</span> {line}
                {i === BOOT_LINES.length - 1 ? "" : "…"}
              </span>
              <span className="text-emerald-400">OK</span>
            </motion.div>
          ))}
          {!done && <div className="jarvis-caret h-4 w-2 bg-cyan-300/80" />}
        </div>

        <div className="mt-8 h-px w-full overflow-hidden bg-cyan-900/60">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-cyan-200 transition-all duration-300"
            style={{ width: `${(progress / BOOT_LINES.length) * 100}%` }}
          />
        </div>

        <motion.button
          onClick={onInit}
          initial={false}
          animate={{ opacity: done ? 1 : 0.25, scale: done ? 1 : 0.98 }}
          whileHover={done ? { scale: 1.03, boxShadow: "0 0 40px rgba(34,211,238,0.45)" } : undefined}
          whileTap={done ? { scale: 0.97 } : undefined}
          disabled={!done}
          className="mx-auto mt-12 flex items-center gap-3 border border-cyan-400/60 bg-cyan-400/10 px-8 py-3 font-orbitron text-sm uppercase tracking-[0.3em] text-cyan-100 transition-colors hover:bg-cyan-400/20 disabled:cursor-wait"
        >
          <Power size={16} />
          Initialiser l&apos;interface
        </motion.button>
        <p className="mt-4 text-center font-tech text-[10px] tracking-[0.2em] text-cyan-500/40">
          L&apos;initialisation active la voix de Jarvis dans votre navigateur
        </p>
      </div>
    </motion.div>
  );
}
