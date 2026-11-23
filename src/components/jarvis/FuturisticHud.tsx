"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import type { CoreStatus } from "./Core";

const GLYPHS = "01アイウエオカキクケコ∆∇◊⌘⚡#%*+=<>";

/**
 * 🔤 DECRYPTED TEXT (inspiré de ReactBits.dev DecryptedText)
 * Fait défiler des glyphes cybernétiques avant de verrouiller chaque lettre.
 * Re-déclenche l'effet au survol si `animateOnHover` est actif.
 */
export function DecryptedText({
  text,
  className = "",
  speed = 24,
  animateOnHover = true,
}: {
  text: string;
  className?: string;
  speed?: number;
  animateOnHover?: boolean;
}) {
  const [display, setDisplay] = useState(text);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scramble = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    let iteration = 0;
    timerRef.current = setInterval(() => {
      setDisplay(
        text
          .split("")
          .map((ch, idx) => {
            if (ch === " " || ch === "·" || ch === "." || ch === "—") return ch;
            if (idx < iteration) return text[idx];
            return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          })
          .join("")
      );
      iteration += 1 / 2;
      if (iteration >= text.length && timerRef.current) {
        clearInterval(timerRef.current);
        setDisplay(text);
      }
    }, speed);
  }, [text, speed]);

  useEffect(() => {
    scramble();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [scramble]);

  return (
    <span
      onMouseEnter={animateOnHover ? scramble : undefined}
      className={`inline-block ${className}`}
    >
      {display}
    </span>
  );
}

/**
 * 🌌 CYBER BACKDROP (inspiré de ReactBits Squares/Particles + Vengeance UI HUD)
 * - Réseau neuronal interactif sur canvas (nœuds + liaisons synaptiques réagissant au curseur)
 * - Grille horizon 3D en perspective au sol
 * - Réticules d'angle HUD avec coordonnées curseur X/Y et télémétrie en direct
 */
const STATUS_PALETTE: Record<CoreStatus, { rgb: string; label: string }> = {
  idle: { rgb: "34, 211, 238", label: "SENTINEL // STANDBY" },
  listening: { rgb: "52, 211, 153", label: "AUDIO CAPTURE // LOCK" },
  thinking: { rgb: "251, 191, 36", label: "NEURAL MATRIX // COMPUTE" },
  speaking: { rgb: "103, 232, 249", label: "VOICE SYNTH // ACTIVE" },
};

export function CyberBackdrop({ status }: { status: CoreStatus }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statusRef = useRef<CoreStatus>(status);
  statusRef.current = status;
  const mouseRef = useRef({ x: -9999, y: -9999, nx: 50, ny: 50 });
  const [coords, setCoords] = useState({ x: 512, y: 384, hex: "0x7F4A" });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      mouseRef.current.nx = Math.round((e.clientX / Math.max(1, window.innerWidth)) * 100);
      mouseRef.current.ny = Math.round((e.clientY / Math.max(1, window.innerHeight)) * 100);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    const id = setInterval(() => {
      if (mouseRef.current.x > 0) {
        const h = ((mouseRef.current.x * 31 + mouseRef.current.y * 17) & 0xffff)
          .toString(16)
          .toUpperCase()
          .padStart(4, "0");
        setCoords({
          x: Math.round(mouseRef.current.x),
          y: Math.round(mouseRef.current.y),
          hex: `0x${h}`,
        });
      }
    }, 180);
    return () => {
      window.removeEventListener("mousemove", onMove);
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    const nodes = Array.from({ length: 38 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.38,
      vy: (Math.random() - 0.5) * 0.38,
      r: 1 + Math.random() * 1.6,
      pulse: Math.random() * Math.PI * 2,
    }));

    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const { rgb } = STATUS_PALETTE[statusRef.current];
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // Halo projecteur sous le curseur
      if (mx > 0 && my > 0) {
        const grad = ctx.createRadialGradient(mx, my, 8, mx, my, 260);
        grad.addColorStop(0, `rgba(${rgb}, 0.09)`);
        grad.addColorStop(0.5, `rgba(${rgb}, 0.03)`);
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      // Mise à jour et dessin des nœuds + liaisons synaptiques
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.x += n.vx;
        n.y += n.vy;
        n.pulse += 0.025;
        if (n.x < 0) n.x = w;
        if (n.x > w) n.x = 0;
        if (n.y < 0) n.y = h;
        if (n.y > h) n.y = 0;

        const alpha = 0.22 + 0.18 * Math.sin(n.pulse);
        ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();

        // Connexions entre nœuds proches
        for (let j = i + 1; j < nodes.length; j++) {
          const m = nodes[j];
          const dx = n.x - m.x;
          const dy = n.y - m.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 135) {
            const lineAlpha = (1 - dist / 135) * 0.12;
            ctx.strokeStyle = `rgba(${rgb}, ${lineAlpha})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(m.x, m.y);
            ctx.stroke();
          }
        }

        // Connexion au curseur
        if (mx > 0) {
          const dMouse = Math.hypot(n.x - mx, n.y - my);
          if (dMouse < 170) {
            const mAlpha = (1 - dMouse / 170) * 0.28;
            ctx.strokeStyle = `rgba(${rgb}, ${mAlpha})`;
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(mx, my);
            ctx.stroke();
          }
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const palette = STATUS_PALETTE[status];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden>
      {/* Grille horizon 3D au bas de l'écran */}
      <div className="jarvis-horizon-grid absolute inset-x-[-20%] bottom-[-8%] h-[42%]" />

      {/* Constellation interactive */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Réticules et télémétrie dans les 4 coins de l'écran */}
      <div className="hidden font-tech text-[9px] tracking-[0.24em] text-cyan-400/45 sm:block">
        {/* Coin haut-gauche */}
        <div className="absolute left-3 top-14 flex items-center gap-2">
          <span className="inline-block h-2 w-2 border-l border-t border-cyan-400/60" />
          <span>SYS.MARK VII // {palette.label}</span>
        </div>

        {/* Coin haut-droit */}
        <div className="absolute right-3 top-14 flex items-center gap-2">
          <span>
            VEC [{String(coords.x).padStart(4, "0")} : {String(coords.y).padStart(4, "0")}] · {coords.hex}
          </span>
          <span className="inline-block h-2 w-2 border-r border-t border-cyan-400/60" />
        </div>

        {/* Coin bas-gauche */}
        <div className="absolute bottom-2 left-3 flex items-center gap-2">
          <span className="inline-block h-2 w-2 border-b border-l border-cyan-400/60" />
          <span>STARK HUD // TELEMETRY LINK 128-BIT</span>
        </div>

        {/* Coin bas-droit */}
        <div className="absolute bottom-2 right-3 flex items-center gap-2">
          <span>ORBITAL SYNC · 99.98%</span>
          <span className="inline-block h-2 w-2 border-b border-r border-cyan-400/60" />
        </div>
      </div>
    </div>
  );
}

/**
 * 📡 TELEMETRY RIBBON (inspiré de Skiper UI Marquee + Vengeance UI Tactical Bar)
 * Bandeau supérieur/inférieur affichant un flux télémétrique continu.
 */
export function TelemetryRibbon({
  status,
  brainEngine,
  wakeOn,
  deviceCount,
}: {
  status: CoreStatus;
  brainEngine?: string;
  wakeOn: boolean;
  deviceCount: number;
}) {
  const items = [
    `NOYAU : ${(brainEngine ?? "RULES").toUpperCase()}`,
    `ÉTAT : ${status.toUpperCase()}`,
    `CAPTEUR VOCAL : ${wakeOn ? "VERROUILLÉ" : "VEILLE"}`,
    `DOMOTIQUE : ${deviceCount} ENTITÉS`,
    "API PUBLIQUES : 82 CATALOGUÉES / 19 LIVE",
    "CHIFFREMENT : TLS 1.3 // LOCALHOST",
    "PROTOCOLE : JARVIS://MARK-VII",
    "LATENCE SYNAPTIQUE : 4.2 ms",
  ];

  return (
    <div className="relative z-10 hidden h-6 shrink-0 items-center overflow-hidden border-y border-cyan-500/15 bg-[#020b18]/80 px-3 backdrop-blur-sm md:flex">
      <div className="mr-3 flex shrink-0 items-center gap-1.5 border-r border-cyan-500/20 pr-3 font-orbitron text-[8.5px] uppercase tracking-[0.28em] text-cyan-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
        TÉLÉMÉTRIE
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div className="animate-jarvis-marquee items-center gap-8 font-tech text-[9.5px] tracking-[0.22em] text-cyan-400/65">
          {[...items, ...items].map((item, idx) => (
            <span key={idx} className="flex items-center gap-3 whitespace-nowrap">
              <span className="text-cyan-500/35">◆</span>
              <span>{item}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * ✨ SPOTLIGHT BOX (inspiré de ReactBits SpotlightCard + Vengeance UI)
 * Conteneur HUD qui projette un halo lumineux radial sous le curseur.
 */
export function SpotlightBox({
  children,
  className = "",
  spotlightColor = "rgba(34, 211, 238, 0.13)",
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  spotlightColor?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0, opacity: 0 });

  const handleMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top, opacity: 1 });
  };

  return (
    <div
      ref={boxRef}
      onMouseMove={handleMove}
      onMouseLeave={() => setPos((p) => ({ ...p, opacity: 0 }))}
      className={`relative overflow-hidden ${className}`}
      {...rest}
    >
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300"
        style={{
          opacity: pos.opacity,
          background: `radial-gradient(280px circle at ${pos.x}px ${pos.y}px, ${spotlightColor}, transparent 70%)`,
        }}
      />
      {children}
    </div>
  );
}
