"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Gamepad2, Pause, Play, RotateCcw } from "lucide-react";

type Kind = "player" | "platform" | "coin";
interface Body {
  id: string;
  name: string;
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
}

const W = 640;
const H = 360;
const GRAVITY = 1150;
const SPEED = 210;
const JUMP = 430;

function initialWorld(): Body[] {
  return [
    { id: "ground", name: "Sol", kind: "platform", x: 0, y: H - 28, w: W, h: 28 },
    { id: "p1", name: "Plateforme_A", kind: "platform", x: 70, y: 268, w: 130, h: 16 },
    { id: "p2", name: "Plateforme_B", kind: "platform", x: 250, y: 210, w: 120, h: 16 },
    { id: "p3", name: "Plateforme_C", kind: "platform", x: 420, y: 150, w: 150, h: 16 },
    { id: "p4", name: "Plateforme_D", kind: "platform", x: 140, y: 120, w: 110, h: 16 },
    { id: "coin1", name: "Pièce_1", kind: "coin", x: 120, y: 236, w: 18, h: 18 },
    { id: "coin2", name: "Pièce_2", kind: "coin", x: 300, y: 178, w: 18, h: 18 },
    { id: "coin3", name: "Pièce_3", kind: "coin", x: 480, y: 118, w: 18, h: 18 },
    { id: "coin4", name: "Pièce_4", kind: "coin", x: 185, y: 88, w: 18, h: 18 },
    { id: "coin5", name: "Pièce_5", kind: "coin", x: 560, y: 300, w: 18, h: 18 },
    { id: "player", name: "Joueur", kind: "player", x: 30, y: 300, w: 22, h: 26 },
  ];
}

interface Physics {
  vx: number;
  vy: number;
  onGround: boolean;
  taken: Set<string>;
  time: number;
}

/** 🎮 STUDIO DE JEU — mini-moteur 2D jouable, hiérarchie de scène et inspecteur. */
export function GameStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<Body[]>(initialWorld());
  const physRef = useRef<Physics>({ vx: 0, vy: 0, onGround: false, taken: new Set(), time: 0 });
  const keysRef = useRef<Record<string, boolean>>({});
  const runningRef = useRef(false);

  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState("player");
  const [, setTick] = useState(0);
  const [hud, setHud] = useState({ score: 0, time: 0, fps: 0, won: false });

  const reset = useCallback(() => {
    worldRef.current = initialWorld();
    physRef.current = { vx: 0, vy: 0, onGround: false, taken: new Set(), time: 0 };
    setHud({ score: 0, time: 0, fps: 0, won: false });
    setTick((t) => t + 1);
  }, []);

  /* ---------- Clavier ---------- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!runningRef.current) return;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", " ", "a", "d", "w", "q", "z"].includes(e.key)) {
        e.preventDefault();
        keysRef.current[e.key.toLowerCase()] = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  /* ---------- Boucle de jeu ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = W;
    canvas.height = H;

    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let fpsAt = performance.now();
    let hudAt = 0;

    const step = (dt: number) => {
      const world = worldRef.current;
      const phys = physRef.current;
      const player = world.find((b) => b.kind === "player");
      if (!player) return;
      phys.time += dt;

      const k = keysRef.current;
      const left = k["arrowleft"] || k["a"] || k["q"];
      const right = k["arrowright"] || k["d"];
      const jump = k["arrowup"] || k[" "] || k["w"] || k["z"];

      phys.vx = left && !right ? -SPEED : right && !left ? SPEED : 0;
      if (jump && phys.onGround) {
        phys.vy = -JUMP;
        phys.onGround = false;
      }
      phys.vy = Math.min(700, phys.vy + GRAVITY * dt);

      const solids = world.filter((b) => b.kind === "platform");

      // Horizontal
      player.x += phys.vx * dt;
      for (const s of solids) {
        if (player.x < s.x + s.w && player.x + player.w > s.x && player.y < s.y + s.h && player.y + player.h > s.y) {
          player.x = phys.vx > 0 ? s.x - player.w : s.x + s.w;
        }
      }
      player.x = Math.max(0, Math.min(W - player.w, player.x));

      // Vertical
      player.y += phys.vy * dt;
      phys.onGround = false;
      for (const s of solids) {
        if (player.x < s.x + s.w && player.x + player.w > s.x && player.y < s.y + s.h && player.y + player.h > s.y) {
          if (phys.vy > 0) {
            player.y = s.y - player.h;
            phys.onGround = true;
          } else {
            player.y = s.y + s.h;
          }
          phys.vy = 0;
        }
      }
      if (player.y > H) {
        player.x = 30;
        player.y = 300;
        phys.vy = 0;
      }

      // Pièces
      for (const c of world.filter((b) => b.kind === "coin")) {
        if (phys.taken.has(c.id)) continue;
        if (player.x < c.x + c.w && player.x + player.w > c.x && player.y < c.y + c.h && player.y + player.h > c.y) {
          phys.taken.add(c.id);
        }
      }
    };

    const draw = () => {
      const world = worldRef.current;
      const phys = physRef.current;

      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#041224");
      g.addColorStop(1, "#01040c");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // Grille
      ctx.strokeStyle = "rgba(34,211,238,0.08)";
      for (let x = 0; x <= W; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y <= H; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      for (const b of world) {
        if (b.kind === "coin") {
          if (phys.taken.has(b.id)) continue;
          const pulse = 1 + Math.sin(phys.time * 5 + b.x) * 0.12;
          ctx.save();
          ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
          ctx.scale(pulse, pulse);
          ctx.fillStyle = "#fbbf24";
          ctx.shadowColor = "rgba(251,191,36,0.9)";
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(0, 0, b.w / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = "#7c5200";
          ctx.font = "bold 11px monospace";
          ctx.textAlign = "center";
          ctx.fillText("J", b.x + b.w / 2, b.y + b.h / 2 + 4);
          ctx.textAlign = "left";
        } else if (b.kind === "platform") {
          ctx.fillStyle = b.id === "ground" ? "#0e7490" : "#155e75";
          ctx.fillRect(b.x, b.y, b.w, b.h);
          ctx.fillStyle = "rgba(34,211,238,0.85)";
          ctx.fillRect(b.x, b.y, b.w, 2);
        } else {
          const glow = phys.onGround ? 16 : 10;
          ctx.save();
          ctx.shadowColor = "rgba(34,211,238,0.9)";
          ctx.shadowBlur = glow;
          ctx.fillStyle = "#22d3ee";
          ctx.fillRect(b.x, b.y, b.w, b.h);
          ctx.restore();
          ctx.fillStyle = "#01040c";
          ctx.fillRect(b.x + 5, b.y + 7, 4, 4);
          ctx.fillRect(b.x + b.w - 9, b.y + 7, 4, 4);
        }

        // Surbrillance de la sélection
        if (b.id === selected) {
          ctx.strokeStyle = "rgba(255,255,255,0.85)";
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
          ctx.setLineDash([]);
        }
      }

      const total = world.filter((b) => b.kind === "coin").length;
      ctx.font = "12px 'Share Tech Mono', monospace";
      ctx.fillStyle = "rgba(165,243,252,0.9)";
      ctx.fillText(`PIÈCES ${phys.taken.size}/${total}`, 12, 22);
      ctx.fillText(`TEMPS ${phys.time.toFixed(1)}s`, 12, 40);

      if (phys.taken.size === total && total > 0) {
        ctx.fillStyle = "rgba(1,4,12,0.72)";
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = "center";
        ctx.font = "700 30px Orbitron, sans-serif";
        ctx.fillStyle = "#a5f3fc";
        ctx.shadowColor = "rgba(34,211,238,0.9)";
        ctx.shadowBlur = 24;
        ctx.fillText("NIVEAU TERMINÉ", W / 2, H / 2);
        ctx.shadowBlur = 0;
        ctx.font = "13px 'Share Tech Mono', monospace";
        ctx.fillStyle = "rgba(165,243,252,0.75)";
        ctx.fillText(`Toutes les pièces en ${phys.time.toFixed(1)} secondes`, W / 2, H / 2 + 30);
        ctx.textAlign = "left";
      }
    };

    const loop = (t: number) => {
      const dt = Math.min(0.033, (t - last) / 1000);
      last = t;
      if (runningRef.current) step(dt);
      draw();
      frames++;
      if (t - fpsAt > 500) {
        const fps = Math.round((frames * 1000) / (t - fpsAt));
        frames = 0;
        fpsAt = t;
        if (t - hudAt > 400) {
          hudAt = t;
          const total = worldRef.current.filter((b) => b.kind === "coin").length;
          setHud({
            score: physRef.current.taken.size,
            time: physRef.current.time,
            fps,
            won: physRef.current.taken.size === total && total > 0,
          });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [selected]);

  const toggleRun = () => {
    runningRef.current = !running;
    setRunning(runningRef.current);
  };

  const sel = worldRef.current.find((b) => b.id === selected) ?? null;
  const updateSel = (patch: Partial<Body>) => {
    const b = worldRef.current.find((x) => x.id === selected);
    if (!b) return;
    Object.assign(b, patch);
    setTick((t) => t + 1);
  };

  const toggle = (id: string) => {
    const b = worldRef.current.find((x) => x.id === id);
    if (!b) return;
    if (physRef.current.taken.has(id)) physRef.current.taken.delete(id);
    else physRef.current.taken.add(id);
    setTick((t) => t + 1);
  };

  return (
    <section className="hud-frame flex flex-col border border-cyan-500/20 bg-[#04101f]/75 backdrop-blur-md">
      <header className="flex items-center gap-2 border-b border-cyan-500/15 px-4 py-2.5">
        <Gamepad2 size={13} className="text-cyan-400/80" />
        <p className="font-orbitron text-[10px] uppercase tracking-[0.3em] text-cyan-400/80">
          Studio de jeux vidéo
        </p>
        <span className="ml-auto font-tech text-[9px] tracking-[0.16em] text-cyan-500/60">
          MOTEUR 2D · {hud.fps} IPS · {hud.score} PIÈCES
        </span>
      </header>

      <div className="grid gap-3 p-3 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <div className="relative overflow-hidden border border-cyan-500/20 bg-black">
            <canvas
              ref={canvasRef}
              className="block h-auto w-full"
              style={{ imageRendering: "pixelated" }}
            />
            <div className="pointer-events-none absolute inset-0 jarvis-scanlines opacity-25" />
            {hud.won && (
              <span className="absolute right-2 top-2 border border-emerald-400/50 bg-black/70 px-2 py-0.5 font-tech text-[9px] tracking-[0.18em] text-emerald-300">
                VICTOIRE
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              onClick={toggleRun}
              className={`cyber-btn flex items-center gap-1.5 border px-3 py-1.5 font-tech text-[10px] uppercase tracking-[0.16em] transition-colors ${
                running
                  ? "border-amber-400/50 bg-amber-400/15 text-amber-200"
                  : "border-cyan-400/45 bg-cyan-400/12 text-cyan-50 hover:bg-cyan-400/25"
              }`}
            >
              {running ? <Pause size={12} /> : <Play size={12} />}
              {running ? "Pause" : "Jouer"}
            </button>
            <button
              onClick={reset}
              className="cyber-btn flex items-center gap-1 border border-cyan-500/30 px-2.5 py-1.5 font-tech text-[9.5px] uppercase tracking-[0.14em] text-cyan-300 hover:bg-cyan-400/15"
            >
              <RotateCcw size={11} /> Reset
            </button>
            <span className="font-tech text-[9.5px] tracking-[0.14em] text-cyan-500/60">
              ← → / A D déplacer · ESPACE sauter
            </span>
          </div>
        </div>

        {/* Hiérarchie + inspecteur */}
        <div className="flex min-h-0 flex-col gap-2">
          <div className="jarvis-scroll max-h-44 overflow-y-auto border border-cyan-500/15 bg-[#020a16]/70 p-2">
            <p className="mb-1.5 font-tech text-[9px] uppercase tracking-[0.18em] text-cyan-500/60">
              Hiérarchie de scène
            </p>
            {worldRef.current.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelected(b.id)}
                onDoubleClick={() => b.kind === "coin" && toggle(b.id)}
                className={`flex w-full items-center gap-2 px-1.5 py-1 text-left font-tech text-[10.5px] transition-colors ${
                  selected === b.id
                    ? "bg-cyan-400/15 text-cyan-50"
                    : "text-cyan-200/75 hover:bg-cyan-400/[0.07]"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    b.kind === "player"
                      ? "bg-cyan-300"
                      : b.kind === "coin"
                        ? physRef.current.taken.has(b.id)
                          ? "bg-emerald-400"
                          : "bg-amber-300"
                        : "bg-sky-700"
                  }`}
                />
                <span className="truncate">{b.name}</span>
                <span className="ml-auto font-tech text-[8.5px] uppercase tracking-[0.12em] text-cyan-500/45">
                  {b.kind === "platform" ? "solide" : b.kind}
                </span>
              </button>
            ))}
          </div>

          <div className="border border-cyan-500/15 bg-[#020a16]/70 p-2.5">
            <p className="mb-2 font-tech text-[9px] uppercase tracking-[0.18em] text-cyan-500/60">
              Inspecteur
            </p>
            {!sel ? (
              <p className="font-tech text-[10.5px] text-cyan-500/45">Aucun objet sélectionné.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {(["x", "y", "w", "h"] as const).map((k) => (
                  <label key={k} className="font-tech text-[9px] uppercase tracking-[0.14em] text-cyan-500/60">
                    {k === "w" ? "largeur" : k === "h" ? "hauteur" : k}
                    <input
                      type="number"
                      value={Math.round(sel[k])}
                      onChange={(e) => updateSel({ [k]: Number(e.target.value) } as Partial<Body>)}
                      className="mt-0.5 w-full border border-cyan-500/25 bg-[#04101f] px-2 py-1 font-tech text-[11px] tabular-nums text-cyan-100 focus:border-cyan-300/60 focus:outline-none"
                    />
                  </label>
                ))}
                <div className="col-span-2 flex items-center justify-between font-tech text-[9.5px] text-cyan-400/70">
                  <span>{sel.name}</span>
                  <span className="uppercase text-cyan-500/55">{sel.kind}</span>
                </div>
                {sel.kind === "coin" && (
                  <button
                    onClick={() => toggle(sel.id)}
                    className="cyber-btn col-span-2 border border-cyan-400/35 bg-cyan-400/10 py-1 font-tech text-[9.5px] uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-400/25"
                  >
                    {physRef.current.taken.has(sel.id) ? "Remettre la pièce" : "Marquer comme prise"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
