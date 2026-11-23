"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clapperboard, Pause, Play, Plus, RotateCcw, Scissors, Trash2 } from "lucide-react";

interface Clip {
  id: string;
  track: string;
  start: number;
  dur: number;
  name: string;
  color: string;
}
interface Track {
  id: string;
  label: string;
  kind: "video" | "title" | "audio";
}

const DURATION = 60; // secondes de séquence
const FPS = 25;

const TRACKS: Track[] = [
  { id: "v1", label: "V1 · VIDÉO", kind: "video" },
  { id: "t1", label: "TITRE", kind: "title" },
  { id: "a1", label: "A1 · AUDIO", kind: "audio" },
];

const INITIAL: Clip[] = [
  { id: "c1", track: "v1", start: 0, dur: 14, name: "Ouverture_aerial.mp4", color: "#22d3ee" },
  { id: "c2", track: "v1", start: 15, dur: 18, name: "Interview_studio.mp4", color: "#34d399" },
  { id: "c3", track: "v1", start: 34, dur: 22, name: "Montage_final.mp4", color: "#818cf8" },
  { id: "c4", track: "t1", start: 2, dur: 7, name: "J.A.R.V.I.S. — générique", color: "#fbbf24" },
  { id: "c5", track: "t1", start: 36, dur: 9, name: "Fin · crédits", color: "#f472b6" },
  { id: "c6", track: "a1", start: 0, dur: 32, name: "Ambiance_synth.wav", color: "#38bdf8" },
  { id: "c7", track: "a1", start: 34, dur: 22, name: "Voix_off_FR.wav", color: "#a78bfa" },
];

function timecode(sec: number): string {
  const s = Math.max(0, sec);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(Math.floor(s % 60)).padStart(2, "0");
  const ff = String(Math.floor((s % 1) * FPS)).padStart(2, "0");
  return `00:${mm}:${ss}:${ff}`;
}

/** 🎬 STUDIO DE MONTAGE — timeline multi-pistes, lecture, découpe, preview procédurale. */
export function VideoStudio() {
  const [clips, setClips] = useState<Clip[]>(INITIAL);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>("c1");
  const [zoom, setZoom] = useState(26); // px par seconde

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const timelineRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; mode: "move" | "head"; offset: number } | null>(null);

  /* ---------- Lecture ---------- */
  useEffect(() => {
    if (!playing) return;
    lastRef.current = performance.now();
    const loop = (t: number) => {
      const dt = (t - lastRef.current) / 1000;
      lastRef.current = t;
      setPlayhead((p) => (p + dt >= DURATION ? 0 : p + dt));
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  /* ---------- Preview procédurale ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = (canvas.width = 640);
    const h = (canvas.height = 360);

    let raf = 0;
    const draw = () => {
      const t = playhead;
      const active = clips.find((c) => c.track === "v1" && t >= c.start && t < c.start + c.dur);
      const title = clips.find((c) => c.track === "t1" && t >= c.start && t < c.start + c.dur);
      const audio = clips.find((c) => c.track === "a1" && t >= c.start && t < c.start + c.dur);

      // Fond "footage" procédural
      const g = ctx.createLinearGradient(0, 0, w, h);
      const hue = active ? 185 + Math.sin(t * 0.4) * 40 : 210;
      g.addColorStop(0, `hsl(${hue} 70% ${active ? 16 : 7}%)`);
      g.addColorStop(1, `hsl(${hue + 30} 65% 5%)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      if (active) {
        // Bandes mouvantes (simulation de mouvement caméra)
        for (let i = 0; i < 7; i++) {
          const y = ((i * 60 + t * 46) % (h + 80)) - 40;
          ctx.fillStyle = `hsla(${hue + i * 8} 85% 60% / 0.07)`;
          ctx.fillRect(0, y, w, 34);
        }
        // Grille de perspective
        ctx.strokeStyle = `hsla(${hue} 90% 70% / 0.16)`;
        ctx.lineWidth = 1;
        for (let i = 0; i <= 12; i++) {
          ctx.beginPath();
          ctx.moveTo((i * w) / 12, 0);
          ctx.lineTo(w / 2 + (i - 6) * 46, h);
          ctx.stroke();
        }
        ctx.font = "600 13px 'Share Tech Mono', monospace";
        ctx.fillStyle = `hsla(${hue} 90% 75% / 0.9)`;
        ctx.fillText(`REC ● ${active.name}`, 18, 28);
        ctx.fillText(timecode(t), 18, h - 18);
      } else {
        ctx.fillStyle = "rgba(148,163,184,0.45)";
        ctx.font = "13px 'Share Tech Mono', monospace";
        ctx.fillText("— pas de clip sur V1 à cette position —", 18, h / 2);
      }

      // Titre superposé
      if (title) {
        const k = Math.min(1, (t - title.start) / 0.6);
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, k));
        ctx.textAlign = "center";
        ctx.font = "700 34px Orbitron, sans-serif";
        ctx.fillStyle = "#e0f7ff";
        ctx.shadowColor = "rgba(34,211,238,0.85)";
        ctx.shadowBlur = 22;
        ctx.fillText(title.name, w / 2, h / 2 + 6);
        ctx.restore();
        ctx.textAlign = "left";
      }

      // Formes d'onde audio
      if (audio) {
        ctx.fillStyle = "rgba(56,189,248,0.75)";
        const base = h - 34;
        for (let x = 0; x < w; x += 5) {
          const n = Math.abs(Math.sin(x * 0.07 + t * 6) * Math.cos(x * 0.013 - t * 3));
          const bh = 4 + n * 26;
          ctx.fillRect(x, base - bh / 2, 3, bh);
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [playhead, clips]);

  /* ---------- Interactions timeline ---------- */
  const secFromEvent = useCallback(
    (clientX: number) => {
      const el = timelineRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      return Math.max(0, Math.min(DURATION, (clientX - rect.left) / zoom));
    },
    [zoom]
  );

  const onTimelineDown = (e: React.PointerEvent) => {
    setPlayhead(secFromEvent(e.clientX));
    dragRef.current = { id: "", mode: "head", offset: 0 };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onClipDown = (e: React.PointerEvent, c: Clip) => {
    e.stopPropagation();
    setSelected(c.id);
    dragRef.current = { id: c.id, mode: "move", offset: secFromEvent(e.clientX) - c.start };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === "head") setPlayhead(secFromEvent(e.clientX));
    else if (d.id) {
      const t = secFromEvent(e.clientX) - d.offset;
      setClips((prev) =>
        prev.map((c) =>
          c.id === d.id ? { ...c, start: Math.max(0, Math.min(DURATION - c.dur, t)) } : c
        )
      );
    }
  };

  const onUp = () => {
    dragRef.current = null;
  };

  /* ---------- Édition ---------- */
  const sel = clips.find((c) => c.id === selected) ?? null;

  const addClip = (track: string) => {
    const palette = ["#22d3ee", "#34d399", "#fbbf24", "#f472b6", "#a78bfa"];
    const id = `c${Date.now()}`;
    setClips((p) => [
      ...p,
      {
        id,
        track,
        start: Math.min(DURATION - 6, Math.round(playhead)),
        dur: 6,
        name:
          track === "v1" ? `Plan_${p.length + 1}.mp4` : track === "t1" ? "Nouveau titre" : `Piste_${p.length + 1}.wav`,
        color: palette[p.length % palette.length],
      },
    ]);
    setSelected(id);
  };

  const splitSelected = () => {
    if (!sel || sel.dur < 2) return;
    const cut = playhead - sel.start;
    if (cut < 1 || cut > sel.dur - 1) return;
    const id = `c${Date.now()}`;
    setClips((p) => [
      ...p.filter((c) => c.id !== sel.id),
      { ...sel, dur: cut },
      { ...sel, id, start: sel.start + cut, dur: sel.dur - cut, name: `${sel.name} ·B` },
    ]);
    setSelected(id);
  };

  const deleteSelected = () => {
    if (!sel) return;
    setClips((p) => p.filter((c) => c.id !== sel.id));
    setSelected(null);
  };

  const updateSel = (patch: Partial<Clip>) => {
    if (!sel) return;
    setClips((p) => p.map((c) => (c.id === sel.id ? { ...c, ...patch } : c)));
  };

  return (
    <section className="hud-frame flex flex-col border border-cyan-500/20 bg-[#04101f]/75 backdrop-blur-md">
      <header className="flex items-center gap-2 border-b border-cyan-500/15 px-4 py-2.5">
        <Clapperboard size={13} className="text-cyan-400/80" />
        <p className="font-orbitron text-[10px] uppercase tracking-[0.3em] text-cyan-400/80">
          Studio de montage
        </p>
        <span className="ml-auto font-tech text-[9px] tracking-[0.16em] text-cyan-500/60">
          {FPS} IPS · {clips.length} CLIPS · {timecode(playhead)}
        </span>
      </header>

      {/* Preview + inspecteur */}
      <div className="grid gap-3 border-b border-cyan-500/12 p-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="relative overflow-hidden border border-cyan-500/20 bg-black">
          <canvas ref={canvasRef} className="block h-auto w-full" />
          <div className="pointer-events-none absolute inset-0 jarvis-scanlines opacity-30" />
          <span className="absolute right-2 top-2 border border-cyan-400/40 bg-black/60 px-1.5 py-0.5 font-tech text-[9px] tracking-[0.18em] text-cyan-300">
            {timecode(playhead)}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPlaying((p) => !p)}
              className="cyber-btn flex items-center gap-1.5 border border-cyan-400/45 bg-cyan-400/12 px-3 py-1.5 font-tech text-[10px] uppercase tracking-[0.16em] text-cyan-50 hover:bg-cyan-400/25"
            >
              {playing ? <Pause size={12} /> : <Play size={12} />}
              {playing ? "Pause" : "Lecture"}
            </button>
            <button
              onClick={() => {
                setPlaying(false);
                setPlayhead(0);
              }}
              className="cyber-btn grid h-8 w-8 place-items-center border border-cyan-500/30 text-cyan-300 hover:bg-cyan-400/15"
              title="Retour au début"
            >
              <RotateCcw size={13} />
            </button>
            <button
              onClick={splitSelected}
              className="cyber-btn flex items-center gap-1 border border-cyan-500/30 px-2 py-1.5 font-tech text-[9.5px] uppercase tracking-[0.14em] text-cyan-300 hover:bg-cyan-400/15"
              title="Scinder le clip sélectionné à la tête de lecture"
            >
              <Scissors size={11} /> Couper
            </button>
            <button
              onClick={deleteSelected}
              disabled={!sel}
              className="cyber-btn flex items-center gap-1 border border-rose-400/35 px-2 py-1.5 font-tech text-[9.5px] uppercase tracking-[0.14em] text-rose-300 hover:bg-rose-400/15 disabled:opacity-40"
            >
              <Trash2 size={11} /> Suppr.
            </button>
          </div>

          {/* Inspecteur */}
          <div className="flex-1 border border-cyan-500/15 bg-[#020a16]/70 p-2.5">
            {!sel ? (
              <p className="py-6 text-center font-tech text-[10.5px] text-cyan-500/45">
                Sélectionnez un clip dans la timeline.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="truncate font-tech text-[11px] text-cyan-100">{sel.name}</p>
                <label className="block font-tech text-[9px] uppercase tracking-[0.16em] text-cyan-500/60">
                  Début
                  <input
                    type="number"
                    min={0}
                    max={DURATION - sel.dur}
                    step={0.5}
                    value={Number(sel.start.toFixed(1))}
                    onChange={(e) => updateSel({ start: Number(e.target.value) })}
                    className="mt-0.5 w-full border border-cyan-500/25 bg-[#04101f] px-2 py-1 font-tech text-[11px] text-cyan-100 focus:border-cyan-300/60 focus:outline-none"
                  />
                </label>
                <label className="block font-tech text-[9px] uppercase tracking-[0.16em] text-cyan-500/60">
                  Durée
                  <input
                    type="number"
                    min={1}
                    max={DURATION}
                    step={0.5}
                    value={Number(sel.dur.toFixed(1))}
                    onChange={(e) => updateSel({ dur: Math.max(1, Number(e.target.value)) })}
                    className="mt-0.5 w-full border border-cyan-500/25 bg-[#04101f] px-2 py-1 font-tech text-[11px] text-cyan-100 focus:border-cyan-300/60 focus:outline-none"
                  />
                </label>
                <div className="flex items-center justify-between font-tech text-[9.5px] text-cyan-400/70">
                  <span>PISTE</span>
                  <span className="uppercase">{TRACKS.find((t) => t.id === sel.track)?.label ?? sel.track}</span>
                </div>
                <div className="flex items-center justify-between font-tech text-[9.5px] text-cyan-400/70">
                  <span>FIN</span>
                  <span className="tabular-nums">{timecode(sel.start + sel.dur)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transport + zoom */}
      <div className="flex flex-wrap items-center gap-3 border-b border-cyan-500/12 px-3 py-2">
        <span className="font-orbitron text-[11px] tabular-nums tracking-[0.14em] text-cyan-200 jarvis-glow">
          {timecode(playhead)}
        </span>
        <div className="flex items-center gap-1.5">
          {TRACKS.map((t) => (
            <button
              key={t.id}
              onClick={() => addClip(t.id)}
              className="cyber-btn flex items-center gap-1 border border-cyan-500/30 px-2 py-1 font-tech text-[9px] uppercase tracking-[0.12em] text-cyan-300 hover:bg-cyan-400/15"
            >
              <Plus size={9} /> {t.label.split(" ")[0]}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 font-tech text-[9px] uppercase tracking-[0.14em] text-cyan-500/60">
          Zoom
          <input
            type="range"
            min={10}
            max={60}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-1 w-28 accent-cyan-400"
          />
        </label>
      </div>

      {/* Timeline */}
      <div className="jarvis-scroll overflow-x-auto p-3">
        <div
          ref={timelineRef}
          onPointerDown={onTimelineDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          className="relative min-w-full select-none"
          style={{ width: DURATION * zoom }}
        >
          {/* Règle de temps */}
          <div className="relative mb-1 h-5 border-b border-cyan-500/20">
            {Array.from({ length: DURATION / 5 + 1 }, (_, i) => i * 5).map((s) => (
              <span
                key={s}
                className="absolute top-0 font-tech text-[8.5px] tabular-nums text-cyan-500/55"
                style={{ left: s * zoom + 2 }}
              >
                {String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}
              </span>
            ))}
            {Array.from({ length: DURATION + 1 }, (_, s) => (
              <span
                key={`t${s}`}
                className="absolute bottom-0 h-1.5 w-px bg-cyan-500/25"
                style={{ left: s * zoom }}
              />
            ))}
          </div>

          {/* Pistes */}
          <div className="space-y-1.5">
            {TRACKS.map((tr) => (
              <div
                key={tr.id}
                className="relative h-12 border border-cyan-500/12 bg-[#020a16]/70"
              >
                <span className="absolute left-1.5 top-1 z-10 font-tech text-[8px] uppercase tracking-[0.16em] text-cyan-500/55">
                  {tr.label}
                </span>
                {clips
                  .filter((c) => c.track === tr.id)
                  .map((c) => (
                    <div
                      key={c.id}
                      onPointerDown={(e) => onClipDown(e, c)}
                      className={`absolute bottom-1 top-4 cursor-grab overflow-hidden border px-1.5 py-0.5 transition-shadow active:cursor-grabbing ${
                        selected === c.id
                          ? "border-white/70 shadow-[0_0_14px_rgba(255,255,255,0.25)]"
                          : "border-white/25 hover:border-white/50"
                      }`}
                      style={{
                        left: c.start * zoom,
                        width: Math.max(10, c.dur * zoom),
                        background: `linear-gradient(180deg, ${c.color}44, ${c.color}1f)`,
                      }}
                      title={`${c.name} — ${c.dur}s`}
                    >
                      <p className="truncate font-tech text-[9px] leading-tight text-white/90">{c.name}</p>
                      <p className="truncate font-tech text-[8px] text-white/55">{c.dur.toFixed(1)} s</p>
                    </div>
                  ))}
              </div>
            ))}
          </div>

          {/* Tête de lecture */}
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.9)]"
            style={{ left: playhead * zoom }}
          >
            <span className="absolute -left-1.5 -top-1 h-2.5 w-2.5 rotate-45 bg-amber-300" />
          </div>
        </div>
      </div>
    </section>
  );
}
