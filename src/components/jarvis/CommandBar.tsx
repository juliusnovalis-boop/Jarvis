"use client";

import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Loader2, MicOff, SendHorizonal, Sparkles, Terminal, Waves } from "lucide-react";
import { SpotlightBox } from "./FuturisticHud";

const CHIPS = [
  "Météo à Tokyo",
  "Convertis 100 dollars en euros",
  "Prix du bitcoin",
  "Prochain jour férié",
  "Un cocktail au hasard",
  "Où est l'ISS ?",
  "Dessine-moi un phénix mécanique",
  "Ajoute rendez-vous dentiste demain à 14h",
  "Que vois-tu ?",
  "Raconte une blague",
];

interface CommandBarProps {
  thinking: boolean;
  listening: boolean;
  interim: string;
  sttOk: boolean;
  /** Écoute permanente réellement active. */
  wakeOn: boolean;
  /** Micro volontairement coupé par l'utilisateur (bouton son). */
  micMuted: boolean;
  /** Application bureau : le micro est géré par l'agent du PC. */
  desktopShell?: boolean;
  onSend: (text: string) => void;
}

export function CommandBar({
  thinking,
  listening,
  interim,
  sttOk,
  wakeOn,
  micMuted,
  desktopShell,
  onSend,
}: CommandBarProps) {
  const [text, setText] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v || thinking) return;
    setText("");
    onSend(v);
  };

  const activeListen = (listening || wakeOn || desktopShell) && !micMuted;

  return (
    <div className="w-full max-w-2xl">
      {/* État de l'écoute — permanente, sans action de l'utilisateur */}
      <div className="mb-2 flex h-6 items-center justify-center">
        {micMuted ? (
          <p className="flex items-center gap-2 font-tech text-[11px] tracking-[0.18em] text-rose-300/80">
            <MicOff size={12} />
            MICRO COUPÉ · CLIQUEZ SUR LE HAUT-PARLEUR POUR RÉACTIVER
          </p>
        ) : desktopShell ? (
          <p className="flex items-center gap-2 font-tech text-[11px] tracking-[0.18em] text-emerald-400/85">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]" />
            </span>
            MICRO DU PC ACTIF · PARLEZ DIRECTEMENT, SANS MOT-CLÉ
          </p>
        ) : interim ? (
          <p className="truncate font-tech text-[12.5px] tracking-wide text-emerald-200">
            <Waves size={12} className="mr-1.5 inline animate-pulse" />
            {interim}
          </p>
        ) : wakeOn ? (
          <p className="flex items-center gap-2 font-tech text-[11px] tracking-[0.2em] text-emerald-400/85">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]" />
            </span>
            JE VOUS ÉCOUTE · PARLEZ DIRECTEMENT, SANS MOT-CLÉ
          </p>
        ) : sttOk ? (
          <p className="font-tech text-[11px] tracking-[0.2em] text-cyan-500/60">
            ACTIVATION DU MICRO…
          </p>
        ) : (
          <p className="font-tech text-[11px] tracking-[0.18em] text-amber-300/70">
            RECONNAISSANCE VOCALE INDISPONIBLE · UTILISEZ CHROME OU EDGE
          </p>
        )}
      </div>

      <SpotlightBox
        className={`hud-frame border bg-[#04101f]/85 backdrop-blur-md transition-colors focus-within:border-cyan-300/75 ${
          activeListen ? "border-emerald-400/50" : "border-cyan-500/30"
        }`}
        style={{ boxShadow: "0 0 34px rgba(8,145,178,0.18), inset 0 0 22px rgba(8,145,178,0.08)" }}
      >
        <form onSubmit={submit} className="relative z-10 flex items-center gap-2.5 p-2">
          {/* Icône terminal + mini égaliseur vocal */}
          <div className="flex items-center gap-1.5 pl-2 text-cyan-400/70">
            <Terminal size={14} className="shrink-0" />
            <div className="hidden items-end gap-[2px] sm:flex" aria-hidden>
              {[0.55, 0.95, 0.4, 0.8, 0.6].map((h, idx) => (
                <span
                  key={idx}
                  className={`w-[2px] rounded-full transition-all duration-300 ${
                    activeListen ? "animate-pulse bg-emerald-400/80" : "bg-cyan-500/35"
                  }`}
                  style={{ height: `${Math.round((activeListen ? h : 0.3) * 14)}px` }}
                />
              ))}
            </div>
          </div>

          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={thinking ? "Analyse synaptique en cours…" : "Parlez, ou saisissez une commande tactique…"}
            disabled={thinking}
            className="min-w-0 flex-1 bg-transparent px-1 font-tech text-[14px] tracking-wide text-cyan-50 placeholder:text-cyan-600/60 focus:outline-none disabled:opacity-50"
          />

          <button
            type="submit"
            disabled={thinking || !text.trim()}
            className="cyber-btn grid h-11 w-11 shrink-0 place-items-center border border-cyan-400/45 bg-cyan-400/12 text-cyan-200 transition-all hover:border-cyan-300 hover:bg-cyan-400/25 hover:shadow-[0_0_18px_rgba(34,211,238,0.35)] disabled:opacity-30"
            title="Envoyer"
          >
            {thinking ? <Loader2 size={17} className="animate-spin" /> : <SendHorizonal size={17} />}
          </button>
        </form>
      </SpotlightBox>

      {/* Chips de commandes rapides avec effet cyber-btn + ressort Framer Motion */}
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {CHIPS.map((c, idx) => (
          <motion.button
            key={c}
            whileHover={{ y: -2, scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
            onClick={() => !thinking && onSend(c)}
            className="cyber-btn group flex items-center gap-1.5 border border-cyan-500/25 bg-[#041326]/75 px-3 py-1 font-tech text-[11px] text-cyan-300/85 transition-colors hover:border-cyan-300/70 hover:bg-cyan-400/15 hover:text-cyan-50"
          >
            <Sparkles
              size={9}
              className={`transition-transform duration-300 group-hover:rotate-45 ${
                idx < 3 ? "text-emerald-400/80" : "text-cyan-400/65"
              }`}
            />
            {c}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
