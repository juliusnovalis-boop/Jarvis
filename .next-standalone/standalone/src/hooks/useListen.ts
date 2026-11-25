"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseDirectTranscript, parseWakeTranscript } from "@/lib/jarvis/wake-parser";

type AnyRec = any;

/**
 * RECONNAISSANCE VOCALE (fr-FR)
 *  - Mode "commande" : une phrase, puis arrêt (bouton micro)
 *  - Mode "wake word" : écoute continue, activation sur "Jarvis" (façon Mycroft/Alexa)
 */
export function useListen(lang: "fr" | "en" = "fr") {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");

  const recRef = useRef<AnyRec>(null);
  const wakeRef = useRef<AnyRec>(null);
  const wantWakeRef = useRef(false);
  const pausedRef = useRef(false);
  const armedUntilRef = useRef(0);
  const wakeRequiredRef = useRef(true);
  const langRef = useRef(lang);
  langRef.current = lang;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as any;
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const create = useCallback((): AnyRec => {
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return null;
    const rec: AnyRec = new Ctor();
    rec.lang = langRef.current === "en" ? "en-US" : "fr-FR";
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    return rec;
  }, []);

  /** Écoute d'une seule commande (bouton micro). */
  const startOnce = useCallback(
    (onFinal: (text: string) => void) => {
      if (recRef.current) return;
      const rec = create();
      if (!rec) return;
      rec.continuous = false;
      let got = false;
      rec.onresult = (e: any) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
        setInterim(text);
        if (e.results[e.results.length - 1].isFinal && !got) {
          got = true;
          const final = text.trim();
          if (final) onFinal(final);
        }
      };
      rec.onend = () => {
        recRef.current = null;
        setListening(false);
        setInterim("");
      };
      rec.onerror = () => {
        try { rec.stop(); } catch { /* noop */ }
      };
      try {
        rec.start();
        recRef.current = rec;
        setListening(true);
        setInterim("");
      } catch {
        recRef.current = null;
      }
    },
    [create]
  );

  const stopOnce = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    setListening(false);
    setInterim("");
    try { rec?.stop(); } catch { /* noop */ }
  }, []);

  /** Boucle d'écoute continue avec mot-clé "Jarvis". */
  const startWake = useCallback(
    (
      handlers: { onWake: () => void; onCommand: (text: string) => void; onDead?: () => void },
      /** false = conversation directe, aucun mot-clé obligatoire. */
      wakeRequired = true
    ) => {
      if (wakeRef.current || wantWakeRef.current) return;
      wantWakeRef.current = true;
      wakeRequiredRef.current = wakeRequired;
      let session = 0;

      const spawn = () => {
        if (!wantWakeRef.current) return;
        const rec = create();
        if (!rec) {
          wantWakeRef.current = false;
          handlers.onDead?.();
          return;
        }
        rec.continuous = true;
        const mySession = ++session;
        let handled = false;
        rec.onresult = (e: any) => {
          if (handled) return;
          let text = "";
          for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
          const final = e.results[e.results.length - 1].isFinal;

          // Mode mains libres : toute phrase finale devient une commande.
          if (!wakeRequiredRef.current) {
            const direct = parseDirectTranscript(text, final);
            if (direct) {
              handled = true;
              try { rec.abort(); } catch { /* noop */ }
              handlers.onCommand(direct);
              return;
            }
          }

          const decision = parseWakeTranscript({
            text,
            isFinal: final,
            armedUntil: armedUntilRef.current,
          });
          if (decision.type === "command") {
            handled = true;
            armedUntilRef.current = 0;
            try { rec.abort(); } catch { /* noop */ }
            handlers.onCommand(decision.command);
          } else if (decision.type === "wake") {
            const wasArmed = armedUntilRef.current > Date.now();
            armedUntilRef.current = decision.armedUntil;
            // Un seul bip par activation, pas à chaque hypothèse intermédiaire.
            if (!wasArmed) handlers.onWake();
          }
        };
        rec.onend = () => {
          if (wakeRef.current === rec) wakeRef.current = null;
          if (wantWakeRef.current && !pausedRef.current && mySession === session) {
            setTimeout(spawn, 400);
          }
        };
        rec.onerror = (e: any) => {
          if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
            wantWakeRef.current = false;
            handlers.onDead?.();
          }
        };
        try {
          rec.start();
          wakeRef.current = rec;
        } catch {
          wakeRef.current = null;
        }
      };
      spawn();
    },
    [create]
  );

  const stopWake = useCallback(() => {
    wantWakeRef.current = false;
    armedUntilRef.current = 0;
    const rec = wakeRef.current;
    wakeRef.current = null;
    try { rec?.abort(); } catch { /* noop */ }
  }, []);

  /** Suspend l'écoute continue (pendant que Jarvis parle, pour éviter l'écho). */
  const pauseWake = useCallback(() => {
    if (!wantWakeRef.current) return;
    pausedRef.current = true;
    const rec = wakeRef.current;
    wakeRef.current = null;
    try { rec?.abort(); } catch { /* noop */ }
  }, []);

  const resumeWake = useCallback(
    (handlers: { onWake: () => void; onCommand: (text: string) => void; onDead?: () => void }) => {
      if (!wantWakeRef.current) return;
      const wakeRequired = wakeRequiredRef.current;
      pausedRef.current = false;
      if (!wakeRef.current) {
        // On remet wantWake a false avant startWake : sinon le garde-fou
        // prenait la reprise pour une double initialisation et ne relançait rien.
        stopWake();
        window.setTimeout(() => startWake(handlers, wakeRequired), 80);
      }
    },
    [startWake, stopWake]
  );

  return {
    supported,
    listening,
    interim,
    startOnce,
    stopOnce,
    startWake,
    stopWake,
    pauseWake,
    resumeWake,
  };
}
