"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";

export type CoreStatus = "idle" | "listening" | "thinking" | "speaking";

const STATUS_COLORS: Record<CoreStatus, string> = {
  idle: "#22d3ee",
  listening: "#34d399",
  thinking: "#fbbf24",
  speaking: "#67e8f9",
};

interface CoreProps {
  status: CoreStatus;
  ampRef: MutableRefObject<number>;
  micRef: MutableRefObject<number>;
  micActive: boolean;
}

/** Réacteur JARVIS : anneaux rotatifs + anneau de visualisation audio + poussières orbitales. */
export function Core({ status, ampRef, micRef, micActive }: CoreProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef(status);
  statusRef.current = status;
  const color = STATUS_COLORS[status];

  const ticks = useMemo(() => Array.from({ length: 72 }, (_, i) => (i * 360) / 72), []);
  const arcTicks = useMemo(() => Array.from({ length: 4 }, (_, i) => i * 90), []);

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

    const particles = Array.from({ length: 42 }, () => ({
      angle: Math.random() * Math.PI * 2,
      radius: 0.42 + Math.random() * 0.56,
      speed: (0.0006 + Math.random() * 0.0022) * (Math.random() > 0.5 ? 1 : -1),
      size: 0.5 + Math.random() * 1.6,
      alpha: 0.15 + Math.random() * 0.5,
      wobble: Math.random() * Math.PI * 2,
    }));

    let t = 0;
    let raf = 0;
    const BAR_COUNT = 96;

    const loop = () => {
      t += 0.016;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const unit = w / 400; // l'espace SVG fait 400
      const st = statusRef.current;
      const col = STATUS_COLORS[st];

      // Niveau source
      let level: number;
      if (st === "listening" && micActive) level = Math.max(0.06, micRef.current);
      else if (st === "speaking") level = ampRef.current;
      else if (st === "thinking") level = 0.3 + 0.22 * Math.sin(t * 6);
      else level = 0.07 + 0.035 * Math.sin(t * 1.4);

      // Échelle du réacteur central
      if (centerRef.current) {
        const s = 1 + Math.min(1, level) * 0.12;
        centerRef.current.style.transform = `translate(-50%, -50%) scale(${s})`;
      }

      // Anneau de barres audio
      const baseR = 168 * unit;
      ctx.save();
      ctx.translate(cx, cy);
      for (let i = 0; i < BAR_COUNT; i++) {
        const angle = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
        const jitter = 0.75 + 0.25 * Math.sin(i * 3.7 + t * 5.2);
        const harmonics = 1 + 0.35 * Math.sin(i * 0.31 + t * 2.1);
        const len = (3 + level * 42 * jitter * harmonics) * unit;
        const alpha = 0.16 + Math.min(0.8, level * 1.15);
        ctx.strokeStyle = hexToRgba(col, alpha);
        ctx.lineWidth = 2 * unit;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * baseR, Math.sin(angle) * baseR);
        ctx.lineTo(Math.cos(angle) * (baseR + len), Math.sin(angle) * (baseR + len));
        ctx.stroke();
      }
      ctx.restore();

      // Poussières orbitales
      for (const p of particles) {
        p.angle += p.speed * (st === "thinking" ? 3 : 1);
        const wob = Math.sin(t * 1.3 + p.wobble) * 0.012;
        const r = (p.radius + wob) * 200 * unit * 0.98;
        ctx.fillStyle = hexToRgba(col, p.alpha * (0.4 + 0.6 * Math.min(1, level + 0.25)));
        ctx.beginPath();
        ctx.arc(cx + Math.cos(p.angle) * r, cy + Math.sin(p.angle) * r, p.size * unit, 0, Math.PI * 2);
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
    <div ref={wrapRef} className="relative aspect-square w-full max-w-[540px]" style={{ ["--core" as string]: color }}>
      {/* Halo d'ambiance */}
      <div
        className="absolute inset-[8%] rounded-full blur-3xl transition-all duration-700"
        style={{ background: `radial-gradient(circle, ${hexToRgba(color, 0.16)} 0%, transparent 70%)` }}
      />

      {/* Canvas : barres audio + particules */}
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

        {/* Graduations externes */}
        <g className="origin-center animate-jarvis-spin-slowest">
          {ticks.map((a, i) => (
            <line
              key={i}
              x1="200" y1="6" x2="200" y2={i % 6 === 0 ? "18" : "12"}
              stroke={hexToRgba(color, i % 6 === 0 ? 0.7 : 0.32)}
              strokeWidth={i % 6 === 0 ? 1.6 : 0.8}
              transform={`rotate(${a} 200 200)`}
            />
          ))}
        </g>

        {/* Anneau pointillé */}
        <circle
          cx="200" cy="200" r="188" fill="none"
          stroke={hexToRgba(color, 0.35)} strokeWidth="1"
          strokeDasharray="1.5 9"
          className="origin-center animate-jarvis-spin-rev"
        />

        {/* Segments d'arc */}
        <circle
          cx="200" cy="200" r="150" fill="none"
          stroke={hexToRgba(color, 0.55)} strokeWidth="3"
          strokeDasharray="120 55 34 90 20 615"
          className="origin-center animate-jarvis-spin-medium"
        />
        <circle
          cx="200" cy="200" r="143" fill="none"
          stroke={hexToRgba(color, 0.22)} strokeWidth="7"
          strokeDasharray="46 180 200 514"
          className="origin-center animate-jarvis-spin-rev-fast"
        />

        {/* Crochets cardinaux */}
        <g className="origin-center animate-jarvis-spin-rev">
          {arcTicks.map((a) => (
            <path
              key={a}
              d="M 200 74 A 126 126 0 0 1 244.4 79.8"
              fill="none" stroke={hexToRgba(color, 0.75)} strokeWidth="2.5"
              transform={`rotate(${a} 200 200)`}
            />
          ))}
        </g>

        {/* Engrenage interne */}
        <circle
          cx="200" cy="200" r="98" fill="none"
          stroke={hexToRgba(color, 0.4)} strokeWidth="1.5"
          strokeDasharray="5 12"
          className="origin-center animate-jarvis-spin-fast"
        />
        <circle cx="200" cy="200" r="86" fill="none" stroke={hexToRgba(color, 0.25)} strokeWidth="0.8" />
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
            boxShadow: `0 0 34px 8px ${hexToRgba(color, 0.55)}, 0 0 90px 26px ${hexToRgba(color, 0.28)}, inset 0 0 24px ${hexToRgba("#ffffff", 0.35)}`,
          }}
        />
        <div
          className="absolute inset-[16%] rounded-full opacity-70 animate-jarvis-spin-fast"
          style={{
            background: `conic-gradient(from 0deg, transparent 0deg, ${hexToRgba("#ffffff", 0.75)} 24deg, transparent 60deg, transparent 180deg, ${hexToRgba("#ffffff", 0.4)} 205deg, transparent 250deg)`,
            maskImage: "radial-gradient(circle, transparent 42%, black 55%, black 78%, transparent 90%)",
            WebkitMaskImage: "radial-gradient(circle, transparent 42%, black 55%, black 78%, transparent 90%)",
          }}
        />
      </div>

      {/* État */}
      <div className="absolute inset-x-0 -bottom-2 text-center">
        <span
          className="font-orbitron text-[10px] uppercase tracking-[0.5em] transition-colors duration-500"
          style={{ color: hexToRgba(color, 0.9), textShadow: `0 0 14px ${hexToRgba(color, 0.6)}` }}
        >
          {status === "idle" ? "En veille" : status === "listening" ? "Écoute" : status === "thinking" ? "Analyse" : "Parole"}
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
