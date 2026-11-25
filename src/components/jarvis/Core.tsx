"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
} from "react";
import { DecryptedText } from "./FuturisticHud";

export type CoreStatus = "idle" | "listening" | "thinking" | "speaking";

const STATUS_COLORS: Record<CoreStatus, string> = {
  idle: "#22d3ee",
  listening: "#34d399",
  thinking: "#fbbf24",
  speaking: "#67e8f9",
};

const STATUS_LABELS: Record<CoreStatus, { fr: string; code: string; freq: string }> = {
  idle: { fr: "En veille", code: "ARC // IDLE-01", freq: "432.0 Hz" },
  listening: { fr: "Écoute", code: "SONAR // LOCK-IN", freq: "528.4 Hz" },
  thinking: { fr: "Analyse", code: "NEURAL // SYNAPSE", freq: "864.2 Hz" },
  speaking: { fr: "Parole", code: "VOCAL // STREAM", freq: "639.1 Hz" },
};

interface CoreProps {
  status: CoreStatus;
  ampRef: MutableRefObject<number>;
  micRef: MutableRefObject<number>;
  micActive: boolean;
}

/**
 * ⚛️ RÉACTEUR HOLOGRAPHIQUE J.A.R.V.I.S. (Mark VII)
 * Inclinaison 3D interactive + double spectre audio (barres + onde plasma)
 * + géométrie hexagonale & réticules + balises télémétriques flottantes.
 */
export function Core({ status, ampRef, micRef, micActive }: CoreProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef(status);
  statusRef.current = status;
  const color = STATUS_COLORS[status];
  const meta = STATUS_LABELS[status];

  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  const ticks = useMemo(() => Array.from({ length: 72 }, (_, i) => (i * 360) / 72), []);
  const arcTicks = useMemo(() => Array.from({ length: 4 }, (_, i) => i * 90), []);
  const hexPoints = useMemo(() => {
    const r = 64;
    return Array.from({ length: 6 }, (_, i) => {
      const a = (i * Math.PI) / 3 - Math.PI / 6;
      return `${200 + Math.cos(a) * r},${200 + Math.sin(a) * r}`;
    }).join(" ");
  }, []);

  const onMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ rx: -ny * 14, ry: nx * 14 });
  };

  const onMouseLeave = () => setTilt({ rx: 0, ry: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    const particles = Array.from({ length: 52 }, () => ({
      angle: Math.random() * Math.PI * 2,
      radius: 0.36 + Math.random() * 0.6,
      speed: (0.0007 + Math.random() * 0.0024) * (Math.random() > 0.5 ? 1 : -1),
      size: 0.6 + Math.random() * 1.8,
      alpha: 0.18 + Math.random() * 0.55,
      wobble: Math.random() * Math.PI * 2,
    }));

    let t = 0;
    let raf = 0;
    const BAR_COUNT = 96;
    const WAVE_POINTS = 120;

    const loop = () => {
      t += 0.016;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const unit = w / 400;
      const st = statusRef.current;
      const col = STATUS_COLORS[st];

      // Niveau d'énergie audio / cognitif
      let level: number;
      if (st === "listening" && micActive) level = Math.max(0.08, micRef.current);
      else if (st === "speaking") level = Math.max(0.12, ampRef.current);
      else if (st === "thinking") level = 0.34 + 0.24 * Math.sin(t * 6.2);
      else level = 0.08 + 0.04 * Math.sin(t * 1.5);

      // Échelle dynamique du noyau central
      if (centerRef.current) {
        const s = 1 + Math.min(1, level) * 0.14;
        centerRef.current.style.transform = `translate(-50%, -50%) scale(${s})`;
      }

      ctx.save();
      ctx.translate(cx, cy);

      // 1. Anneau extérieur de barres spectrales
      const baseR = 166 * unit;
      for (let i = 0; i < BAR_COUNT; i++) {
        const angle = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
        const jitter = 0.72 + 0.28 * Math.sin(i * 3.7 + t * 5.4);
        const harmonics = 1 + 0.38 * Math.sin(i * 0.31 + t * 2.3);
        const len = (3.5 + level * 44 * jitter * harmonics) * unit;
        const alpha = 0.18 + Math.min(0.82, level * 1.2);
        ctx.strokeStyle = hexToRgba(col, alpha);
        ctx.lineWidth = (i % 4 === 0 ? 2.4 : 1.7) * unit;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * baseR, Math.sin(angle) * baseR);
        ctx.lineTo(Math.cos(angle) * (baseR + len), Math.sin(angle) * (baseR + len));
        ctx.stroke();
      }

      // 2. Onde plasma harmonique interne (type ReactBits Orb)
      const waveR = 114 * unit;
      ctx.beginPath();
      for (let i = 0; i <= WAVE_POINTS; i++) {
        const a = (i / WAVE_POINTS) * Math.PI * 2;
        const ripple =
          Math.sin(a * 6 + t * 4.2) * (4 + level * 18) +
          Math.cos(a * 10 - t * 6.5) * (2 + level * 11);
        const r = waveR + ripple * unit;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = hexToRgba(col, 0.42 + Math.min(0.45, level * 0.8));
      ctx.lineWidth = 1.4 * unit;
      ctx.stroke();

      ctx.restore();

      // 3. Particules orbitales et liaisons courtes
      for (const p of particles) {
        p.angle += p.speed * (st === "thinking" ? 3.2 : st === "speaking" ? 1.8 : 1);
        const wob = Math.sin(t * 1.4 + p.wobble) * 0.014;
        const r = (p.radius + wob) * 200 * unit * 0.98;
        const px = cx + Math.cos(p.angle) * r;
        const py = cy + Math.sin(p.angle) * r;
        ctx.fillStyle = hexToRgba(col, p.alpha * (0.45 + 0.55 * Math.min(1, level + 0.25)));
        ctx.beginPath();
        ctx.arc(px, py, p.size * unit, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [ampRef, micRef, micActive]);

  return (
    <div
      ref={wrapRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="relative aspect-square w-full max-w-[540px] select-none"
      style={{
        ["--core" as string]: color,
        perspective: "1100px",
      }}
    >
      {/* Balises télémétriques flottantes dans les 4 coins du réacteur */}
      <div className="pointer-events-none absolute inset-2 hidden sm:block">
        <div className="absolute left-0 top-2 border-l-2 border-cyan-400/50 bg-[#031022]/75 px-2.5 py-1 font-tech text-[9px] tracking-[0.22em] text-cyan-300/80 backdrop-blur-sm">
          <div className="text-[7.5px] text-cyan-500/60">PROTOCOL</div>
          <div>{meta.code}</div>
        </div>

        <div className="absolute right-0 top-2 border-r-2 border-cyan-400/50 bg-[#031022]/75 px-2.5 py-1 text-right font-tech text-[9px] tracking-[0.22em] text-cyan-300/80 backdrop-blur-sm">
          <div className="text-[7.5px] text-cyan-500/60">RESONANCE</div>
          <div>{meta.freq}</div>
        </div>

        <div className="absolute bottom-6 left-0 border-l-2 border-cyan-400/50 bg-[#031022]/75 px-2.5 py-1 font-tech text-[9px] tracking-[0.22em] text-cyan-300/80 backdrop-blur-sm">
          <div className="text-[7.5px] text-cyan-500/60">ARC OUTPUT</div>
          <div>3.48 GJ/s · NOMINAL</div>
        </div>

        <div className="absolute bottom-6 right-0 border-r-2 border-cyan-400/50 bg-[#031022]/75 px-2.5 py-1 text-right font-tech text-[9px] tracking-[0.22em] text-cyan-300/80 backdrop-blur-sm">
          <div className="text-[7.5px] text-cyan-500/60">AUDIO LINK</div>
          <div>{micActive ? "DIRECT STREAM" : "STANDBY"}</div>
        </div>
      </div>

      {/* Conteneur incliné en 3D */}
      <div
        className="relative h-full w-full transition-transform duration-200 ease-out"
        style={{
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          transformStyle: "preserve-3d",
        }}
      >
        {/* Halo d'ambiance */}
        <div
          className="absolute inset-[8%] rounded-full blur-3xl transition-all duration-700"
          style={{ background: `radial-gradient(circle, ${hexToRgba(color, 0.22)} 0%, transparent 70%)` }}
        />

        {/* Onde de choc pulsée en mode actif */}
        {status !== "idle" && (
          <div
            className="animate-jarvis-pulse-ring pointer-events-none absolute inset-[16%] rounded-full border"
            style={{ borderColor: hexToRgba(color, 0.45) }}
          />
        )}

        {/* Canvas : barres audio + onde plasma + particules */}
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

        {/* Anneaux SVG */}
        <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <radialGradient id="coreGrad" cx="50%" cy="45%" r="60%">
              <stop offset="0%" stopColor="#f0feff" />
              <stop offset="35%" stopColor={color} />
              <stop offset="78%" stopColor={hexToRgba(color, 0.35)} />
              <stop offset="100%" stopColor={hexToRgba(color, 0.05)} />
            </radialGradient>
          </defs>

          {/* Réticules de visée externes */}
          <g stroke={hexToRgba(color, 0.35)} strokeWidth="0.9">
            <line x1="200" y1="0" x2="200" y2="14" />
            <line x1="200" y1="386" x2="200" y2="400" />
            <line x1="0" y1="200" x2="14" y2="200" />
            <line x1="386" y1="200" x2="400" y2="200" />
          </g>

          {/* Graduations externes */}
          <g className="origin-center animate-jarvis-spin-slowest">
            {ticks.map((a, i) => (
              <line
                key={i}
                x1="200"
                y1="6"
                x2="200"
                y2={i % 6 === 0 ? "18" : "12"}
                stroke={hexToRgba(color, i % 6 === 0 ? 0.75 : 0.32)}
                strokeWidth={i % 6 === 0 ? 1.6 : 0.8}
                transform={`rotate(${a} 200 200)`}
              />
            ))}
          </g>

          {/* Anneau pointillé */}
          <circle
            cx="200"
            cy="200"
            r="188"
            fill="none"
            stroke={hexToRgba(color, 0.38)}
            strokeWidth="1"
            strokeDasharray="1.5 9"
            className="origin-center animate-jarvis-spin-rev"
          />

          {/* Segments d'arc */}
          <circle
            cx="200"
            cy="200"
            r="150"
            fill="none"
            stroke={hexToRgba(color, 0.6)}
            strokeWidth="3"
            strokeDasharray="120 55 34 90 20 615"
            className="origin-center animate-jarvis-spin-medium"
          />
          <circle
            cx="200"
            cy="200"
            r="143"
            fill="none"
            stroke={hexToRgba(color, 0.24)}
            strokeWidth="7"
            strokeDasharray="46 180 200 514"
            className="origin-center animate-jarvis-spin-rev-fast"
          />

          {/* Crochets cardinaux */}
          <g className="origin-center animate-jarvis-spin-rev">
            {arcTicks.map((a) => (
              <path
                key={a}
                d="M 200 74 A 126 126 0 0 1 244.4 79.8"
                fill="none"
                stroke={hexToRgba(color, 0.8)}
                strokeWidth="2.5"
                transform={`rotate(${a} 200 200)`}
              />
            ))}
          </g>

          {/* Engrenage interne */}
          <circle
            cx="200"
            cy="200"
            r="98"
            fill="none"
            stroke={hexToRgba(color, 0.45)}
            strokeWidth="1.5"
            strokeDasharray="5 12"
            className="origin-center animate-jarvis-spin-fast"
          />
          <circle cx="200" cy="200" r="86" fill="none" stroke={hexToRgba(color, 0.25)} strokeWidth="0.8" />

          {/* Treillis hexagonal Stark */}
          <polygon
            points={hexPoints}
            fill="none"
            stroke={hexToRgba(color, 0.42)}
            strokeWidth="1.1"
            strokeDasharray="8 4"
            className="origin-center animate-jarvis-spin-medium"
          />
        </svg>

        {/* Cœur lumineux */}
        <div
          ref={centerRef}
          className="absolute left-1/2 top-1/2 h-[29%] w-[29%] -translate-x-1/2 -translate-y-1/2 will-change-transform"
        >
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle at 45% 42%, #eafcff 0%, ${color} 38%, ${hexToRgba(color, 0.28)} 72%, transparent 100%)`,
              boxShadow: `0 0 36px 8px ${hexToRgba(color, 0.6)}, 0 0 95px 28px ${hexToRgba(color, 0.3)}, inset 0 0 26px ${hexToRgba("#ffffff", 0.4)}`,
            }}
          />
          <div
            className="absolute inset-[16%] rounded-full opacity-75 animate-jarvis-spin-fast"
            style={{
              background: `conic-gradient(from 0deg, transparent 0deg, ${hexToRgba("#ffffff", 0.8)} 24deg, transparent 60deg, transparent 180deg, ${hexToRgba("#ffffff", 0.45)} 205deg, transparent 250deg)`,
              maskImage: "radial-gradient(circle, transparent 42%, black 55%, black 78%, transparent 90%)",
              WebkitMaskImage: "radial-gradient(circle, transparent 42%, black 55%, black 78%, transparent 90%)",
            }}
          />
        </div>
      </div>

      {/* État avec effet DecryptedText */}
      <div className="absolute inset-x-0 -bottom-2 flex flex-col items-center">
        <span
          className="font-orbitron text-[10px] uppercase tracking-[0.5em] transition-colors duration-500"
          style={{ color: hexToRgba(color, 0.95), textShadow: `0 0 14px ${hexToRgba(color, 0.65)}` }}
        >
          <DecryptedText text={meta.fr} speed={28} />
        </span>
      </div>
    </div>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
