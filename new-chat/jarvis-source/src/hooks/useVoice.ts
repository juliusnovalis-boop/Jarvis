"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createSpeechEngine,
  pickVoiceForLang,
  type SpeechHost,
} from "@/lib/jarvis/speech-engine";

/**
 * SYNTHÈSE VOCALE DE JARVIS
 * S'appuie sur speech-engine.ts (testé hors navigateur) qui contourne les
 * défauts de Chromium / Electron : voix chargées tardivement, speak()
 * ignoré après un cancel(), élocution qui ne démarre jamais.
 */
export function useVoice(lang: "fr" | "en" = "fr") {
  const [supported, setSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string | null>(null);
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [speaking, setSpeaking] = useState(false);

  const speakingRef = useRef(false);
  const ampRef = useRef(0);
  const kickRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const voiceURIRef = useRef<string | null>(null);
  const rateRef = useRef(1);
  const volumeRef = useRef(1);
  const langRef = useRef(lang);

  voiceURIRef.current = voiceURI;
  rateRef.current = rate;
  volumeRef.current = volume;
  langRef.current = lang;

  const engine = useMemo(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
    const host: SpeechHost = {
      synth: window.speechSynthesis,
      makeUtterance: (t) => new SpeechSynthesisUtterance(t),
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (id) => window.clearTimeout(id),
    };
    return createSpeechEngine(host);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);
    const load = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length) {
        setVoices(list);
        setVoiceURI((prev) => prev ?? pickVoiceForLang(list, langRef.current)?.voiceURI ?? null);
      }
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    // Certaines plateformes ne déclenchent jamais voiceschanged : on sonde.
    const poll = window.setInterval(() => {
      if (window.speechSynthesis.getVoices().length) {
        load();
        window.clearInterval(poll);
      }
    }, 400);
    window.setTimeout(() => window.clearInterval(poll), 8000);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.clearInterval(poll);
    };
  }, []);

  // Animation d'amplitude du réacteur pendant la parole
  useEffect(() => {
    let t = 0;
    const loop = () => {
      t += 0.016;
      kickRef.current *= 0.86;
      const target = speakingRef.current
        ? 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(t * 9.7) * Math.sin(t * 3.3)) + kickRef.current
        : 0;
      ampRef.current += (Math.min(1, target) - ampRef.current) * 0.18;
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const prime = useCallback(() => {
    engine?.prime();
  }, [engine]);

  const cancel = useCallback(() => {
    engine?.stop();
    speakingRef.current = false;
    setSpeaking(false);
  }, [engine]);

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!engine) {
        onEnd?.();
        return;
      }
      engine.speak(text, {
        voiceURI: voiceURIRef.current,
        lang: langRef.current,
        rate: rateRef.current,
        volume: volumeRef.current,
        onStart: () => {
          speakingRef.current = true;
          setSpeaking(true);
          kickRef.current = 0.35;
        },
        onBoundary: () => {
          kickRef.current = Math.min(0.65, kickRef.current + 0.22);
        },
        onEnd: () => {
          speakingRef.current = false;
          setSpeaking(false);
          onEnd?.();
        },
        onTrace: (step) => {
          if (process.env.NODE_ENV !== "production") console.debug("[voix]", step);
        },
      });
    },
    [engine]
  );

  return {
    supported,
    voices,
    langVoices: voices.filter((v) => v.lang.toLowerCase().startsWith(lang)),
    voiceURI,
    setVoiceURI,
    rate,
    setRate,
    volume,
    setVolume,
    speaking,
    speakingRef,
    ampRef,
    speak,
    cancel,
    prime,
  };
}
