"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Hexagon, Languages, Smartphone, Volume2, VolumeX } from "lucide-react";
import { ApisPanel } from "@/components/jarvis/ApisPanel";
import { Boot } from "@/components/jarvis/Boot";
import { CyberBackdrop, DecryptedText, TelemetryRibbon } from "@/components/jarvis/FuturisticHud";
import { BrainPanel, type BrainInfo, type OllamaInfo } from "@/components/jarvis/BrainPanel";
import { CommandBar } from "@/components/jarvis/CommandBar";
import { Core, type CoreStatus } from "@/components/jarvis/Core";
import { HomePanel, type Device } from "@/components/jarvis/HomePanel";
import { MemoryPanel, type NoteItem, type TaskItem } from "@/components/jarvis/MemoryPanel";
import { StatusPanel } from "@/components/jarvis/StatusPanel";
import { SystemPanel } from "@/components/jarvis/SystemPanel";
import { Transcript, type ChatMessage } from "@/components/jarvis/Transcript";
import { VisionPanel, type VisionHandle } from "@/components/jarvis/VisionPanel";
import { useListen } from "@/hooks/useListen";
import { useMicLevel } from "@/hooks/useMicLevel";
import { useVoice } from "@/hooks/useVoice";

let localCounter = 0;
const localId = () => `local-${Date.now()}-${localCounter++}`;

interface EngineResponse {
  reply: string;
  action?: { type: string; [key: string]: unknown };
  speakText?: string;
  sources?: { title: string; url: string }[];
  cognition?: { route: string; kind: string; confidence: number; reason: string };
  engine?: string;
  model?: string | null;
}

export default function JarvisPage() {
  const [booted, setBooted] = useState(false);
  const [bootTime] = useState(() => Date.now());
  const [status, setStatus] = useState<CoreStatus>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [wakeOn, setWakeOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [messageCount, setMessageCount] = useState(0);
  const [devices, setDevices] = useState<Device[]>([]);
  const [homeAssistant, setHomeAssistant] = useState(false);
  const [brain, setBrain] = useState<BrainInfo | null>(null);
  const [ollamaInfo, setOllamaInfo] = useState<OllamaInfo | null>(null);
  // Mot-clé pris en charge par l'agent du PC (mode application bureau).
  const [agentWake, setAgentWake] = useState(false);
  const [rightTab, setRightTab] = useState<"log" | "vision" | "home" | "system" | "apis">("log");
  const [lang, setLang] = useState<"fr" | "en">("fr");
  const [events, setEvents] = useState<{ id: number; title: string; at: string }[]>([]);

  const visionRef = useRef<VisionHandle>(null);

  const voice = useVoice(lang);
  const stt = useListen(lang);
  // Electron ne fournit pas l'API Web Speech : le micro est pris en charge
  // par l'agent du PC (openWakeWord + dictee locale).
  const [desktopShell, setDesktopShell] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setDesktopShell(
      window.location.protocol === "jarvis:" ||
        /Electron/i.test(navigator.userAgent)
    );
  }, []);
  const mic = useMicLevel();

  const thinkingRef = useRef(false);
  const mutedRef = useRef(false);
  const desktopShellRef = useRef(false);
  const wakeOnRef = useRef(false);
  const userNameRef = useRef<string | null>(null);
  const timeoutsRef = useRef<number[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);

  mutedRef.current = muted;
  desktopShellRef.current = desktopShell;
  wakeOnRef.current = wakeOn;
  userNameRef.current = userName;

  /* ---------- Bip d'activation ---------- */
  const blip = useCallback((freq = 880) => {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = audioCtxRef.current ?? new Ctx();
      audioCtxRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch {
      /* silencieux */
    }
  }, []);

  /* ---------- Voix native de l'agent Windows ---------- */
  const speakViaAgent = useCallback(async (text: string): Promise<boolean> => {
    // L'agent peut mettre 1-2 secondes a enregistrer son micro au demarrage.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await fetch("/api/node", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "speak", text }),
        });
        const data = await res.json();
        if (data?.ok && data?.queued) return true;
      } catch {
        /* nouvel essai */
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
  }, []);

  /* ---------- Parole ---------- */
  const say = useCallback(
    (text: string) => {
      if (mutedRef.current) {
        setStatus("idle");
        return;
      }
      setStatus("speaking");

      if (desktopShellRef.current) {
        // Application Windows : SAPI natif. L'agent verrouille physiquement
        // son micro pendant toute la réponse, puis reprend l'écoute continue.
        void speakViaAgent(text).then((nativeQueued) => {
          if (nativeQueued) {
            const estimate = Math.min(18_000, Math.max(1_800, text.length * 52));
            window.setTimeout(() => setStatus("idle"), estimate);
            return;
          }
          if (voice.supported) {
            voice.speak(text, () => setStatus("idle"));
          } else {
            console.warn("[Jarvis] aucune synthèse vocale disponible");
            setStatus("idle");
          }
        });
        return;
      }

      // Navigateur / espace de travail : Web Speech renforcé.
      if (!voice.supported) {
        console.warn("[Jarvis] synthèse vocale indisponible sur cette plateforme");
        setStatus("idle");
        return;
      }
      voice.speak(text, () => setStatus("idle"));
    },
    [speakViaAgent, voice]
  );

  const pushJarvis = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev.slice(-80),
      { id: localId(), role: "jarvis", content, ts: new Date().toISOString() },
    ]);
  }, []);

  /* ---------- État / historique ---------- */
  const refreshState = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      const data = await res.json();
      setUserName(data.userName ?? null);
      setCity(data.city ?? null);
      setNotes(data.notes ?? []);
      setTasks(data.tasks ?? []);
      setEvents(data.events ?? []);
      setMessageCount(data.messageCount ?? 0);
    } catch {
      /* hors-ligne */
    }
  }, []);

  const loadDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/devices", { cache: "no-store" });
      const data = await res.json();
      setDevices(data.devices ?? []);
      setHomeAssistant(Boolean(data.homeAssistant));
    } catch {
      /* hors-ligne */
    }
  }, []);

  const loadBrain = useCallback(async () => {
    try {
      const d = await fetch("/api/brain", { cache: "no-store" }).then((r) => r.json());
      setBrain(d.brain ?? null);
      setOllamaInfo(d.ollama ?? null);
    } catch {
      /* moteur momentanément indisponible */
    }
  }, []);

  useEffect(() => {
    loadDevices();
    loadBrain();
  }, [loadDevices, loadBrain]);

  // L'agent du PC gère le mot-clé en mode bureau : on suit son état réel.
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const d = await fetch("/api/node", { cache: "no-store" }).then((r) => r.json());
        const online = Array.isArray(d.nodes) && d.nodes.some((n: { online: boolean }) => n.online);
        if (alive) setAgentWake(online);
      } catch {
        if (alive) setAgentWake(false);
      }
    };
    check();
    const id = setInterval(check, 6000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/history", { cache: "no-store" });
        const data = await res.json();
        setMessages(
          (data.messages ?? []).map((m: { id: number; role: string; content: string; ts: string }) => ({
            id: `db-${m.id}`,
            role: (m.role === "jarvis" ? "jarvis" : "user") as "jarvis" | "user",
            content: m.content,
            ts: m.ts,
          }))
        );
      } catch {
        /* silencieux */
      }
      refreshState();
    })();
  }, [refreshState]);

  /* ---------- Actions retournées par le moteur ---------- */
  const applyAction = useCallback(
    (action: EngineResponse["action"]): { mutedNow: boolean } => {
      if (!action) return { mutedNow: mutedRef.current };
      switch (action.type) {
        case "open": {
          const url = String(action.url ?? "");
          if (url) window.open(url, "_blank", "noopener,noreferrer");
          break;
        }
        case "timer": {
          const seconds = Number(action.seconds ?? 0);
          const label = String(action.label ?? "");
          if (seconds > 0) {
            const id = window.setTimeout(() => {
              const content = `Minuteur de ${label} terminé.`;
              pushJarvis(content);
              say(content);
              blip(660);
            }, seconds * 1000);
            timeoutsRef.current.push(id);
          }
          break;
        }
        case "reminder": {
          const seconds = Number(action.seconds ?? 0);
          const text = String(action.text ?? "");
          if (seconds > 0) {
            const id = window.setTimeout(() => {
              const content = `Rappel : ${text}.`;
              pushJarvis(content);
              say(content);
              blip(660);
              try {
                if ("Notification" in window && Notification.permission === "granted") {
                  new Notification("J.A.R.V.I.S. — Rappel", { body: text });
                }
              } catch {
                /* silencieux */
              }
            }, seconds * 1000);
            timeoutsRef.current.push(id);
          }
          break;
        }
        case "voiceRate": {
          if (typeof action.set === "number") voice.setRate(action.set);
          else if (typeof action.delta === "number") {
            voice.setRate((r) => Math.max(0.5, Math.min(1.8, Math.round((r + (action.delta as number)) * 100) / 100)));
          }
          break;
        }
        case "volume": {
          if (typeof action.delta === "number") {
            voice.setVolume((v) => Math.max(0, Math.min(1, Math.round((v + (action.delta as number)) * 100) / 100)));
          }
          break;
        }
        case "mute": {
          setMuted(true);
          mutedRef.current = true;
          voice.cancel();
          return { mutedNow: true };
        }
        case "unmute": {
          setMuted(false);
          mutedRef.current = false;
          break;
        }
        // 👁️ VISION — active la caméra, analyse puis prononce la description
        case "vision": {
          setRightTab("vision");
          // analyze() déclenche onVisionResult, qui se charge d'afficher et de prononcer
          void visionRef.current?.analyze();
          break;
        }
        case "visionOff": {
          visionRef.current?.disable();
          break;
        }
        // 🖥️ ANALYSE D'ÉCRAN — capture d'écran puis description vocale
        case "visionScreen": {
          setRightTab("vision");
          void (async () => {
            const ok = await visionRef.current?.enableScreen?.();
            if (ok) await visionRef.current?.analyze();
          })();
          break;
        }
        // 🏠 DOMOTIQUE — rafraîchit l'état des appareils
        case "devicesChanged": {
          setRightTab("home");
          void loadDevices();
          break;
        }
        // 💻 Ouvre un panneau précis (console, agents…)
        case "openPanel": {
          const p = String(action.panel ?? "log");
          if (p === "vision" || p === "home" || p === "system" || p === "log" || p === "apis") setRightTab(p);
          break;
        }
      }
      return { mutedNow: mutedRef.current };
    },
    [blip, loadDevices, pushJarvis, say, voice]
  );

  /* ---------- Envoi d'une commande ---------- */
  const send = useCallback(
    async (raw: string, onRemoteReply?: (reply: string) => void) => {
      const text = raw.trim();
      if (!text || thinkingRef.current) return;
      thinkingRef.current = true;
      setThinking(true);
      setStatus("thinking");
      voice.cancel();
      setMessages((prev) => [
        ...prev.slice(-80),
        { id: localId(), role: "user", content: text, ts: new Date().toISOString() },
      ]);

      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris";
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: text, tz, lang }),
        });
        const data: EngineResponse = await res.json();
        const reply = data.reply ?? "Je n'ai pas de réponse pour cela.";
        const { mutedNow } = applyAction(data.action);
        // 🎨 Action image : on attache l'URL au message Jarvis pour l'afficher dans le journal
        const imageUrl =
          data.action?.type === "image" && typeof data.action.url === "string"
            ? (data.action.url as string)
            : undefined;
        setMessages((prev) => [
          ...prev.slice(-80),
          {
            id: localId(), role: "jarvis", content: reply,
            ts: new Date().toISOString(), imageUrl, sources: data.sources,
            cognition: data.cognition,
            engine: data.engine,
            model: data.model,
          },
        ]);
        refreshState();
        if (mutedNow) setStatus("idle");
        else say(data.speakText ?? reply);
        // 📱 Rapatrie la réponse à l'app mobile (commande venue de /api/remote)
        onRemoteReply?.(reply);
      } catch {
        const fallback = "Interférence détectée sur le canal. Reformulez votre demande.";
        setMessages((prev) => [
          ...prev.slice(-80),
          { id: localId(), role: "jarvis", content: fallback, ts: new Date().toISOString() },
        ]);
        say(fallback);
        onRemoteReply?.(fallback);
      } finally {
        thinkingRef.current = false;
        setThinking(false);
      }
    },
    [applyAction, lang, refreshState, say, voice]
  );

  /* ---------- 📱 Commandes venues de l'app mobile ---------- */
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    if (!booted) return;
    const id = setInterval(async () => {
      if (thinkingRef.current) return;
      try {
        const res = await fetch("/api/remote", { cache: "no-store" });
        const data = await res.json();
        const cmds: { id: number; text: string }[] = data.commands ?? [];
        if (cmds.length) {
          blip(1180);
          const { id, text } = cmds[0];
          sendRef.current(text, (reply) => {
            // La réponse repart vers l'app mobile via PATCH /api/remote
            void fetch("/api/remote", {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id, reply }),
            }).catch(() => undefined);
          });
        }
      } catch {
        /* hors-ligne */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [booted, blip]);

  /* ---------- 👁️ Résultat d'une analyse vision manuelle ---------- */
  const onVisionResult = useCallback(
    (summary: string, engine: string) => {
      const prefix = engine === "local" ? "" : "";
      pushJarvis(prefix + summary);
      if (!mutedRef.current) {
        setStatus("speaking");
        voice.speak(summary, () => setStatus("idle"));
      }
    },
    [pushJarvis, voice]
  );

  /* ---------- Écoute permanente (aucun bouton à presser) ---------- */
  const wakeHandlersRef = useRef({
    onWake: () => {
      blip(990);
    },
    onCommand: (text: string) => {
      blip(990);
      send(text);
    },
    onDead: () => {
      setWakeOn(false);
      wakeOnRef.current = false;
    },
  });
  wakeHandlersRef.current = {
    onWake: () => blip(990),
    onCommand: (text: string) => {
      blip(990);
      send(text);
    },
    onDead: () => {
      setWakeOn(false);
      wakeOnRef.current = false;
    },
  };

  /** Démarre l'écoute permanente : Jarvis entend sans qu'on touche à rien. */
  const startListening = useCallback(() => {
    if (desktopShellRef.current) {
      void fetch("/api/node", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "listen", enabled: true }),
      });
      setAgentWake(true);
      return;
    }
    if (wakeOnRef.current || !stt.supported) return;
    setWakeOn(true);
    wakeOnRef.current = true;
    mic.start();
    // false = conversation directe : aucun mot-cle obligatoire.
    stt.startWake(wakeHandlersRef.current, false);
  }, [mic, stt]);

  /** Coupe totalement le micro (déclenché par le bouton son de l'en-tête). */
  const stopListening = useCallback(() => {
    if (desktopShellRef.current) {
      void fetch("/api/node", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "listen", enabled: false }),
      });
      setAgentWake(false);
    }
    stt.stopWake();
    stt.stopOnce();
    mic.stop();
    setWakeOn(false);
    wakeOnRef.current = false;
  }, [mic, stt]);

  // Le réacteur passe en « écoute » dès qu'une voix est captée
  useEffect(() => {
    if (!wakeOn || thinkingRef.current || voice.speaking) return;
    if (stt.interim) {
      setStatus("listening");
      return;
    }
    const id = setTimeout(() => {
      if (!thinkingRef.current && !voice.speaking) setStatus("idle");
    }, 900);
    return () => clearTimeout(id);
  }, [stt.interim, wakeOn, voice.speaking]);

  // Pendant que Jarvis parle, on suspend l'écoute continue (anti-écho)
  useEffect(() => {
    if (!booted) return;
    if (voice.speaking && wakeOnRef.current) {
      stt.pauseWake();
    } else if (!voice.speaking && wakeOnRef.current) {
      const id = setTimeout(() => stt.resumeWake(wakeHandlersRef.current), 500);
      return () => clearTimeout(id);
    }
  }, [voice.speaking, booted, stt]);

  useEffect(() => () => timeoutsRef.current.forEach(clearTimeout), []);

  /* ---------- Initialisation ---------- */
  const init = useCallback(() => {
    voice.prime();
    try {
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => undefined);
      }
    } catch {
      /* silencieux */
    }
    setBooted(true);
    window.setTimeout(async () => {
      const hour = new Date().getHours();
      const greet = hour >= 18 || hour < 5 ? "Bonsoir" : "Bonjour";
      const name = userNameRef.current;
      const content =
        `${greet}${name ? ` ${name}` : ""}. Tous mes systèmes sont opérationnels : voix, mémoire, météo, calcul, minuterie et recherche. ` +
        `Je vous écoute en permanence. Parlez simplement, sans mot-clé. Comment puis-je vous aider ?`;
      pushJarvis(content);

      // Installation Windows : SAPI natif via l'agent (fiable sans geste web).
      // Preview navigateur : moteur speechSynthesis renforcé en repli.
      const nativeQueued = desktopShellRef.current
        ? await speakViaAgent(content)
        : false;
      if (!nativeQueued) say(content);
    }, 700);
    // L'écoute navigateur démarre seule hors Electron ; dans l'app bureau,
    // l'agent openWakeWord est déjà actif au niveau du PC.
    window.setTimeout(() => startListening(), 1200);
  }, [pushJarvis, say, speakViaAgent, startListening, voice]);

  /* ---------- 🎙️ Ouverture par le mot-clé « Jarvis » du PC ---------- */
  // L'agent local ouvre /?wake=1 après avoir entendu « Jarvis » : on démarre
  // alors l'interface sans clic et on arme directement l'écoute.
  const autoWakeDone = useRef(false);
  useEffect(() => {
    if (booted || autoWakeDone.current) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const launchedByAgent = params.get("wake") === "1";
    const desktopApp = params.get("desktop") === "1" || window.location.protocol === "jarvis:";
    if (!launchedByAgent && !desktopApp) return;
    autoWakeDone.current = true;
    const t = setTimeout(() => init(), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted]);

  const voiceOptions = voice.langVoices.length > 0 ? voice.langVoices : voice.voices;

  return (
    <main className="jarvis-scene relative flex h-screen flex-col overflow-hidden">
      {/* Décor holographique & constellation neuronale interactive */}
      <div className="jarvis-grid pointer-events-none absolute inset-0" />
      <CyberBackdrop status={status} />
      <div className="jarvis-scanlines pointer-events-none absolute inset-0 opacity-55" />
      <div className="jarvis-scanband pointer-events-none" />

      {/* Barre supérieure */}
      <header className="relative z-10 flex items-center gap-3 px-4 py-2.5 lg:px-6">
        <div className="relative grid h-9 w-9 place-items-center">
          <Hexagon size={36} className="absolute text-cyan-400/40" strokeWidth={1} />
          <Hexagon size={36} className="absolute animate-jarvis-spin-medium text-cyan-300/80 [animation-duration:12s]" strokeWidth={1} />
          <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.9)]" />
        </div>
        <div>
          <h1 className="font-orbitron text-lg font-bold tracking-[0.35em] text-cyan-100 jarvis-glow">
            <DecryptedText text="J.A.R.V.I.S." speed={30} />
          </h1>
          <p className="hidden font-tech text-[9px] tracking-[0.28em] text-cyan-500/60 sm:block">
            JUST A RATHER VERY INTELLIGENT SYSTEM
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <a
            href="/install"
            className="cyber-btn hidden items-center gap-1.5 border border-emerald-400/40 bg-emerald-400/[0.08] px-3 py-1.5 font-orbitron text-[9px] uppercase tracking-[0.2em] text-emerald-300/90 transition-colors hover:border-emerald-300 hover:text-emerald-100 sm:flex"
            title="Installer Jarvis complet sur Windows 11 / Android"
          >
            <Download size={11} /> Installer
          </a>
          <button
            onClick={() => {
              const next = lang === "fr" ? "en" : "fr";
              setLang(next);
              voice.setVoiceURI(null);
              pushJarvis(
                next === "en"
                  ? "Language module switched to English. My ears and my voice now think in English."
                  : "Module linguistique repassé en français."
              );
            }}
            className="cyber-btn hidden items-center gap-1.5 border border-cyan-500/25 px-3 py-1.5 font-orbitron text-[9px] uppercase tracking-[0.25em] text-cyan-400/75 transition-colors hover:border-cyan-400/55 hover:text-cyan-200 sm:flex"
            title="Basculer FR / EN (voix + écoute + cerveau)"
          >
            <Languages size={11} /> {lang === "fr" ? "FR" : "EN"}
          </button>
          <a
            href="/mobile"
            target="_blank"
            rel="noopener noreferrer"
            className="cyber-btn hidden items-center gap-1.5 border border-cyan-500/25 px-3 py-1.5 font-orbitron text-[9px] uppercase tracking-[0.25em] text-cyan-400/75 transition-colors hover:border-cyan-400/55 hover:text-cyan-200 md:flex"
            title="Ouvrir l'app compagnon mobile"
          >
            <Smartphone size={11} /> Mobile
          </a>
          <span
            className={`hidden items-center gap-2 border px-3 py-1.5 font-orbitron text-[9px] uppercase tracking-[0.3em] sm:flex ${
              status === "idle"
                ? "border-cyan-500/30 text-cyan-300/80"
                : status === "listening"
                  ? "border-emerald-400/50 text-emerald-300"
                  : status === "thinking"
                    ? "border-amber-400/50 text-amber-300"
                    : "border-sky-400/50 text-sky-300"
            }`}
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            {status === "idle" ? "En veille" : status === "listening" ? "Écoute" : status === "thinking" ? "Analyse" : "Parole"}
          </span>

          <select
            value={voice.voiceURI ?? ""}
            onChange={(e) => voice.setVoiceURI(e.target.value || null)}
            className="hidden max-w-[150px] border border-cyan-500/25 bg-[#04101f] px-2 py-1.5 font-tech text-[10px] text-cyan-200/80 focus:outline-none md:block"
            title="Voix de Jarvis"
          >
            {voiceOptions.length === 0 && <option value="">Voix système</option>}
            {voiceOptions.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name.length > 20 ? v.name.slice(0, 20) + "…" : v.name}
              </option>
            ))}
          </select>

          {/* Coupe-circuit unique : micro ET voix. Aucun autre bouton à presser. */}
          <button
            onClick={() => {
              if (muted) {
                setMuted(false);
                mutedRef.current = false;
                startListening();
              } else {
                setMuted(true);
                mutedRef.current = true;
                voice.cancel();
                stopListening();
                setStatus("idle");
              }
            }}
            className={`grid h-9 w-9 place-items-center border transition-colors ${
              muted
                ? "border-rose-400/50 bg-rose-400/10 text-rose-300"
                : "border-cyan-500/30 bg-cyan-400/5 text-cyan-300 hover:bg-cyan-400/15"
            }`}
            title={muted ? "Réactiver le micro et la voix" : "Couper le micro et la voix"}
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
        </div>
      </header>

      {/* Bandeau télémétrique défilant (Skiper UI / Vengeance UI) */}
      <TelemetryRibbon
        status={status}
        brainEngine={brain?.engine}
        wakeOn={wakeOn || agentWake}
        deviceCount={devices.length}
      />

      {/* Corps */}
      <div className="relative z-10 flex min-h-0 flex-1 gap-4 px-4 pb-3 pt-2 lg:px-6">
        <StatusPanel
          status={status}
          sttOk={stt.supported}
          ttsOk={voice.supported}
          wakeOn={wakeOn || agentWake}
          wakeSource={wakeOn ? "interface" : agentWake ? "agent PC" : null}
          voiceName={voiceOptions.find((v) => v.voiceURI === voice.voiceURI)?.name ?? null}
          bootTime={bootTime}
          messageCount={messageCount}
        />

        {/* Colonne centrale */}
        <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
          <div className="grid min-h-0 w-full flex-1 place-items-center">
            <Core status={status} ampRef={voice.ampRef} micRef={mic.levelRef} micActive={mic.active} />
          </div>
          <CommandBar
            thinking={thinking}
            listening={stt.listening}
            interim={stt.interim}
            sttOk={stt.supported}
            wakeOn={wakeOn}
            micMuted={muted && !wakeOn}
            desktopShell={desktopShell}
            onSend={send}
          />
          {/* Transcript compact mobile */}
          <div className="flex h-48 w-full max-w-2xl lg:hidden">
            <Transcript messages={messages} speaking={voice.speaking} />
          </div>
        </div>

        {/* Colonne droite */}
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="hidden w-[380px] shrink-0 flex-col gap-3 xl:flex"
        >
          {/* Onglets de la colonne droite avec indicateur à ressort (Skiper UI) */}
          <nav className="hud-frame flex shrink-0 gap-px border border-cyan-500/20 bg-cyan-500/10 p-0.5">
            {([["log", "Journal"], ["vision", "Vision"], ["home", "Maison"], ["apis", "APIs"], ["system", "Système"]] as const).map(([k, label]) => {
              const active = rightTab === k;
              return (
                <button
                  key={k}
                  onClick={() => setRightTab(k)}
                  className={`relative flex-1 py-2 font-orbitron text-[9px] uppercase tracking-[0.22em] transition-colors ${
                    active ? "text-cyan-50" : "text-cyan-500/55 hover:text-cyan-200"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="jarvis-right-tab"
                      transition={{ type: "spring", stiffness: 420, damping: 30 }}
                      className="absolute inset-0 border border-cyan-400/45 bg-cyan-400/15 shadow-[inset_0_-2px_0_rgb(34_211_238),0_0_16px_rgba(34,211,238,0.25)]"
                    />
                  )}
                  <span className="relative z-10">{label}</span>
                </button>
              );
            })}
          </nav>

          <div className={rightTab === "log" ? "flex min-h-0 flex-1 flex-col gap-3" : "hidden"}>
            <Transcript messages={messages} speaking={voice.speaking} />
            <MemoryPanel userName={userName} city={city} notes={notes} tasks={tasks} events={events} />
          </div>

          {/* VisionPanel reste monté en permanence : la caméra survit au changement d'onglet */}
          <div className={rightTab === "vision" ? "flex min-h-0 flex-1 flex-col gap-3" : "hidden"}>
            <VisionPanel ref={visionRef} onResult={onVisionResult} />
            <BrainPanel brain={brain} ollama={ollamaInfo} onRefresh={loadBrain} />
          </div>

          <div className={rightTab === "home" ? "flex min-h-0 flex-1 flex-col gap-3" : "hidden"}>
            <HomePanel
              devices={devices}
              homeAssistant={homeAssistant}
              onRefresh={loadDevices}
              onScene={send}
            />
            <BrainPanel brain={brain} ollama={ollamaInfo} onRefresh={loadBrain} />
          </div>

          {/* Système : PC liés + console intégrée + agents (monté en permanence) */}
          <div className={rightTab === "system" ? "flex min-h-0 flex-1 flex-col gap-3" : "hidden"}>
            <SystemPanel />
          </div>

          {/* 🌐 API publiques : catalogue public-apis + tests live */}
          <div className={rightTab === "apis" ? "flex min-h-0 flex-1 flex-col gap-3" : "hidden"}>
            <ApisPanel />
          </div>
        </motion.div>
      </div>

      {/* Boot */}
      <AnimatePresence>{!booted && <Boot key="boot" onInit={init} />}</AnimatePresence>
    </main>
  );
}
