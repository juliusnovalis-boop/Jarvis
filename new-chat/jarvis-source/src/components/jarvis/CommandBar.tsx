"use client";

import { useState, type FormEvent } from "react";
import { Loader2, MicOff, SendHorizonal, Waves } from "lucide-react";

const CHIPS = [
  "Météo à Tokyo",
  "Allume le salon",
  "Mode cinéma",
  "Dessine-moi un phénix mécanique",
  "Ajoute rendez-vous dentiste demain à 14h",
  "Mon agenda",
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
  thinking, listening, interim, sttOk, wakeOn, micMuted, desktopShell, onSend,
}: CommandBarProps) {
  const [text, setText] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v || thinking) return;
    setText("");
    onSend(v);
  };

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
          <p className="flex items-center gap-2 font-tech text-[11px] tracking-[0.18em] text-emerald-400/80">
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
          <p className="flex items-center gap-2 font-tech text-[11px] tracking-[0.2em] text-emerald-400/80">
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

      <form
        onSubmit={submit}
        className={`flex items-center gap-2 border bg-[#04101f]/80 p-2 backdrop-blur-md transition-colors focus-within:border-cyan-400/60 ${
          listening && !micMuted ? "border-emerald-400/50" : "border-cyan-500/25"
        }`}
        style={{ boxShadow: "0 0 30px rgba(8,145,178,0.15), inset 0 0 20px rgba(8,145,178,0.08)" }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={thinking ? "Analyse en cours…" : "Parlez, ou écrivez ici si vous préférez…"}
          disabled={thinking}
          className="min-w-0 flex-1 bg-transparent px-2 font-tech text-[14px] tracking-wide text-cyan-50 placeholder:text-cyan-600/60 focus:outline-none disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={thinking || !text.trim()}
          className="grid h-11 w-11 shrink-0 place-items-center border border-cyan-500/40 bg-cyan-400/10 text-cyan-300 transition-all hover:bg-cyan-400/20 disabled:opacity-30"
          title="Envoyer"
        >
          {thinking ? <Loader2 size={17} className="animate-spin" /> : <SendHorizonal size={17} />}
        </button>
      </form>

      {/* Chips de commandes rapides */}
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {CHIPS.map((c) => (
          <button
            key={c}
            onClick={() => !thinking && onSend(c)}
            className="border border-cyan-500/20 bg-cyan-950/40 px-3 py-1 font-tech text-[11px] text-cyan-300/80 transition-all hover:border-cyan-400/50 hover:bg-cyan-400/10 hover:text-cyan-100"
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
