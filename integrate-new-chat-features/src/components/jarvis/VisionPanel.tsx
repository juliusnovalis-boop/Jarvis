"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { Camera, CameraOff, Eye, Loader2, MonitorSmartphone, ScanLine } from "lucide-react";

export interface VisionHandle {
  enable: () => Promise<void>;
  /** 🖥️ Capture d'écran (getDisplayMedia) — renvoie true si réussie. */
  enableScreen: () => Promise<boolean>;
  disable: () => void;
  analyze: () => Promise<string | null>;
  isOn: () => boolean;
}

interface VisionPanelProps {
  onResult: (summary: string, engine: string) => void;
}

interface Metrics {
  brightness: number;
  contrast: number;
  motion: number;
  faces: number;
  hue: string;
  sharpness: number;
}

const EMPTY: Metrics = { brightness: 0, contrast: 0, motion: 0, faces: 0, hue: "neutre", sharpness: 0 };

/**
 * 👁️ PANNEAU VISION — caméra + analyse d'image
 *   Métriques calculées localement à 4 Hz (luminosité, contraste, mouvement, netteté, visages)
 *   Description sémantique envoyée à /api/vision (LLaVA / GPT-4o si disponible)
 */
export const VisionPanel = forwardRef<VisionHandle, VisionPanelProps>(function VisionPanel(
  { onResult },
  ref
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const workRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);
  const metricsRef = useRef<Metrics>(EMPTY);
  const detectorRef = useRef<any>(null);
  const facesRef = useRef<{ x: number; y: number; w: number; h: number }[]>([]);
  const onRef = useRef(false);

  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics>(EMPTY);
  const [screenMode, setScreenMode] = useState(false);

  const disable = useCallback(() => {
    onRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    prevFrameRef.current = null;
    facesRef.current = [];
    metricsRef.current = EMPTY;
    setMetrics(EMPTY);
    setScreenMode(false);
    setOn(false);
  }, []);

  const enable = useCallback(async () => {
    if (onRef.current) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      onRef.current = true;
      setOn(true);
      // Détecteur de visages natif (Chrome/Edge)
      try {
        const FD = (window as any).FaceDetector;
        if (FD) detectorRef.current = new FD({ fastMode: true, maxDetectedFaces: 8 });
      } catch {
        detectorRef.current = null;
      }
    } catch {
      setError("Accès caméra refusé ou indisponible.");
      setOn(false);
    }
  }, []);

  useEffect(() => () => disable(), [disable]);

  /* ---------- Boucle d'analyse locale ---------- */
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    let last = 0;
    let faceTick = 0;

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      if (t - last < 250) {
        drawOverlay();
        return;
      }
      last = t;

      const W = 96;
      const H = 72;
      workRef.current ??= document.createElement("canvas");
      const work = workRef.current;
      work.width = W;
      work.height = H;
      const wctx = work.getContext("2d", { willReadFrequently: true });
      if (!wctx) return;
      wctx.drawImage(video, 0, 0, W, H);
      const frame = wctx.getImageData(0, 0, W, H);
      const d = frame.data;

      let sum = 0, sumSq = 0, rS = 0, gS = 0, bS = 0, diff = 0, edge = 0;
      const prev = prevFrameRef.current;
      const gray = new Float32Array(W * H);
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        gray[p] = lum;
        sum += lum;
        sumSq += lum * lum;
        rS += r; gS += g; bS += b;
        if (prev) diff += Math.abs(lum - (0.299 * prev[i] + 0.587 * prev[i + 1] + 0.114 * prev[i + 2]));
      }
      // Netteté : gradient horizontal moyen
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const p = y * W + x;
          edge += Math.abs(gray[p] - gray[p + 1]) + Math.abs(gray[p] - gray[p + W]);
        }
      }
      prevFrameRef.current = new Uint8ClampedArray(d);

      const n = W * H;
      const mean = sum / n;
      const variance = Math.max(0, sumSq / n - mean * mean);
      const hue = dominantHue(rS / n, gS / n, bS / n);

      const next: Metrics = {
        brightness: Math.round((mean / 255) * 100),
        contrast: Math.round(Math.min(100, (Math.sqrt(variance) / 80) * 100)),
        motion: Math.round(Math.min(100, (diff / n / 12) * 100)),
        faces: facesRef.current.length,
        hue,
        sharpness: Math.round(Math.min(100, (edge / n / 22) * 100)),
      };
      metricsRef.current = next;
      setMetrics(next);

      // Détection de visages toutes les ~1 s
      faceTick++;
      if (detectorRef.current && faceTick % 4 === 0) {
        detectorRef.current
          .detect(video)
          .then((faces: any[]) => {
            facesRef.current = faces.map((f) => ({
              x: f.boundingBox.x / (video.videoWidth || 640),
              y: f.boundingBox.y / (video.videoHeight || 480),
              w: f.boundingBox.width / (video.videoWidth || 640),
              h: f.boundingBox.height / (video.videoHeight || 480),
            }));
          })
          .catch(() => undefined);
      }
      drawOverlay();
    };

    const drawOverlay = () => {
      const cv = overlayRef.current;
      const video = videoRef.current;
      if (!cv || !video) return;
      const rect = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== rect.width * dpr) {
        cv.width = rect.width * dpr;
        cv.height = rect.height * dpr;
      }
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, cv.width, cv.height);
      // Réticules de visages façon HUD
      ctx.strokeStyle = "rgba(52, 211, 153, 0.95)";
      ctx.lineWidth = 2 * dpr;
      for (const f of facesRef.current) {
        const x = f.x * cv.width;
        const y = f.y * cv.height;
        const w = f.w * cv.width;
        const h = f.h * cv.height;
        const c = Math.min(w, h) * 0.26;
        ctx.beginPath();
        ctx.moveTo(x, y + c); ctx.lineTo(x, y); ctx.lineTo(x + c, y);
        ctx.moveTo(x + w - c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + c);
        ctx.moveTo(x + w, y + h - c); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - c, y + h);
        ctx.moveTo(x + c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - c);
        ctx.stroke();
        ctx.fillStyle = "rgba(52, 211, 153, 0.95)";
        ctx.font = `${10 * dpr}px monospace`;
        ctx.fillText("SUJET", x, Math.max(11 * dpr, y - 5 * dpr));
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [on]);

  /* ---------- Analyse sémantique ---------- */
  const analyze = useCallback(async (): Promise<string | null> => {
    if (!onRef.current) {
      await enable();
      await new Promise((r) => setTimeout(r, 900));
    }
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    setBusy(true);
    try {
      const snap = document.createElement("canvas");
      snap.width = 512;
      snap.height = Math.round((video.videoHeight / (video.videoWidth || 640)) * 512) || 384;
      const sctx = snap.getContext("2d");
      sctx?.drawImage(video, 0, 0, snap.width, snap.height);
      const image = snap.toDataURL("image/jpeg", 0.72);

      const res = await fetch("/api/vision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image, metrics: metricsRef.current }),
      });
      const data = await res.json();
      onResult(data.summary, data.engine);
      return data.summary as string;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  }, [enable, onResult]);

  /* ---------- 🖥️ Capture d'écran ---------- */
  const enableScreen = useCallback(async (): Promise<boolean> => {
    setError(null);
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: false });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      setScreenMode(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      onRef.current = true;
      setOn(true);
      // Quand l'utilisateur arrête le partage depuis le navigateur
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        disable();
        setScreenMode(false);
      });
      return true;
    } catch {
      setError("Partage d'écran annulé ou indisponible.");
      return false;
    }
  }, [disable]);

  useImperativeHandle(
    ref,
    () => ({ enable, enableScreen, disable, analyze, isOn: () => onRef.current }),
    [enable, enableScreen, disable, analyze]
  );

  const bars = [
    { label: "LUM", v: metrics.brightness },
    { label: "CTR", v: metrics.contrast },
    { label: "MOV", v: metrics.motion },
    { label: "NET", v: metrics.sharpness },
  ];

  return (
    <section className="hud-frame flex flex-col border border-cyan-500/15 bg-[#04101f]/70 backdrop-blur-md">
      <header className="flex items-center gap-2 border-b border-cyan-500/15 px-3 py-2">
        <Eye size={13} className="text-cyan-400/70" />
        <p className="font-orbitron text-[10px] uppercase tracking-[0.3em] text-cyan-400/70">Vision</p>
        <span className="ml-auto flex items-center gap-1.5 font-tech text-[9px] tracking-[0.18em]">
          <span className={`h-1 w-1 rounded-full ${on ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,1)]" : "bg-slate-600"}`} />
          <span className={on ? "text-emerald-400/90" : "text-slate-500"}>{on ? "ACTIVE" : "HORS LIGNE"}</span>
        </span>
      </header>

      <div className="relative aspect-video w-full overflow-hidden bg-black/60">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`h-full w-full object-cover opacity-90 ${screenMode ? "" : "scale-x-[-1]"}`}
        />
        <canvas
          ref={overlayRef}
          className={`pointer-events-none absolute inset-0 h-full w-full ${screenMode ? "" : "scale-x-[-1]"}`}
        />

        {/* Grille HUD */}
        {on && (
          <>
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(34,211,238,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.12) 1px, transparent 1px)",
                backgroundSize: "28px 28px",
              }}
            />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/40">
              <div className="absolute left-1/2 top-1/2 h-px w-7 -translate-x-1/2 -translate-y-1/2 bg-cyan-400/50" />
              <div className="absolute left-1/2 top-1/2 h-7 w-px -translate-x-1/2 -translate-y-1/2 bg-cyan-400/50" />
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-full">
              <div className="jarvis-scanband" style={{ animationDuration: "3.5s" }} />
            </div>
            <p className="pointer-events-none absolute bottom-1.5 left-2 font-tech text-[9px] tracking-[0.18em] text-cyan-300/80">
              {metrics.faces > 0 ? `${metrics.faces} SUJET${metrics.faces > 1 ? "S" : ""} VERROUILLÉ${metrics.faces > 1 ? "S" : ""}` : "BALAYAGE…"}
            </p>
            <p className="pointer-events-none absolute bottom-1.5 right-2 font-tech text-[9px] tracking-[0.18em] text-cyan-300/60">
              {metrics.hue.toUpperCase()}
            </p>
          </>
        )}

        {!on && (
          <div className="absolute inset-0 grid place-items-center">
            <p className="text-center font-tech text-[11px] leading-relaxed text-cyan-500/50">
              {error ?? "Module optique en veille"}
              <br />
              <span className="text-cyan-600/50">Dites « que vois-tu ? »</span>
            </p>
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-[2px]">
            <div className="flex items-center gap-2 font-tech text-[11px] tracking-[0.2em] text-cyan-200">
              <Loader2 size={14} className="animate-spin" /> ANALYSE…
            </div>
          </div>
        )}
      </div>

      {/* Métriques */}
      <div className="grid grid-cols-4 gap-px bg-cyan-500/10">
        {bars.map((b) => (
          <div key={b.label} className="bg-[#04101f] px-1.5 py-1.5 text-center">
            <p className="font-tech text-[8px] tracking-[0.15em] text-cyan-500/60">{b.label}</p>
            <p className="font-tech text-[12px] tabular-nums text-cyan-100">{b.v}</p>
            <div className="mt-0.5 h-[2px] w-full bg-cyan-950">
              <div className="h-full bg-cyan-400 transition-all duration-300" style={{ width: `${b.v}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-px bg-cyan-500/10">
        <button
          onClick={() => (on ? (disable(), setScreenMode(false)) : enable())}
          className="flex flex-1 items-center justify-center gap-1.5 bg-[#04101f] py-2 font-orbitron text-[9px] uppercase tracking-[0.2em] text-cyan-300/80 transition-colors hover:bg-cyan-400/10 hover:text-cyan-100"
        >
          {on ? <CameraOff size={12} /> : <Camera size={12} />}
          {on ? "Couper" : "Caméra"}
        </button>
        <button
          onClick={() => enableScreen()}
          className="flex flex-1 items-center justify-center gap-1.5 bg-[#04101f] py-2 font-orbitron text-[9px] uppercase tracking-[0.2em] text-cyan-300/80 transition-colors hover:bg-cyan-400/10 hover:text-cyan-100"
          title="Analyser votre écran"
        >
          <MonitorSmartphone size={12} /> Écran
        </button>
        <button
          onClick={() => void analyze()}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 bg-[#04101f] py-2 font-orbitron text-[9px] uppercase tracking-[0.2em] text-cyan-300/80 transition-colors hover:bg-cyan-400/10 hover:text-cyan-100 disabled:opacity-40"
        >
          <ScanLine size={12} /> Analyser
        </button>
      </div>
    </section>
  );
});

function dominantHue(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 18) return max > 170 ? "claire" : max < 70 ? "sombre" : "neutre";
  if (r === max) return g > b ? "orangée" : "rougeâtre";
  if (g === max) return r > b ? "jaune-vert" : "verdâtre";
  return r > g ? "violacée" : "bleutée";
}
