"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * NIVEAU MICRO (Web Audio) — alimente l'anneau de visualisation du réacteur.
 */
export function useMicLevel() {
  const levelRef = useRef(0);
  const [active, setActive] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    levelRef.current = 0;
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current || typeof navigator === "undefined" || !navigator.mediaDevices) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new Ctx();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.55;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        const n = Math.min(48, data.length);
        for (let i = 0; i < n; i++) sum += data[i];
        const level = Math.min(1, (sum / n / 255) * 2.6);
        levelRef.current += (level - levelRef.current) * 0.35;
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
      setActive(true);
    } catch {
      stop();
    }
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { levelRef, active, start, stop };
}
