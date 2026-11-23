"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Blinds, Clapperboard, Home, Lightbulb, Loader2, Mic, Moon, Plug,
  Power, SendHorizonal, Smartphone, Sun, Thermometer, Tv, Briefcase, Volume2,
} from "lucide-react";
import type { Device } from "@/components/jarvis/HomePanel";
import { useListen } from "@/hooks/useListen";
import { useVoice } from "@/hooks/useVoice";

const ICONS: Record<string, typeof Lightbulb> = {
  light: Lightbulb, plug: Plug, thermostat: Thermometer, cover: Blinds, media: Tv,
};

const SCENES = [
  { label: "Cinéma", icon: Clapperboard, cmd: "mode cinéma" },
  { label: "Travail", icon: Briefcase, cmd: "mode travail" },
  { label: "Réveil", icon: Sun, cmd: "mode réveil" },
  { label: "Nuit", icon: Moon, cmd: "mode nuit" },
];

interface Entry { id: string; role: "user" | "jarvis"; content: string }

let c = 0;
const uid = () => `m-${Date.now()}-${c++}`;

/** 📱 APP MOBILE COMPAGNON — PWA : voix, domotique, et télécommande du poste principal. */
export default function MobilePage() {
  const [tab, setTab] = useState<"voice" | "home">("voice");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [remoteMode, setRemoteMode] = useState(false);
  const [speakHere, setSpeakHere] = useState(true);

  const voice = useVoice();
  const stt = useListen();
  const scrollRef = useRef<HTMLDivElement>(null);
  const primed = useRef(false);

  const loadDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/devices", { cache: "no-store" });
      const data = await res.json();
      setDevices(data.devices ?? []);
    } catch {
      /* hors-ligne */
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [entries.length]);

  const send = useCallback(
    async (raw: string) => {
      const msg = raw.trim();
      if (!msg || busy) return;
      if (!primed.current) {
        voice.prime();
        primed.current = true;
      }
      setBusy(true);
      setEntries((p) => [...p.slice(-40), { id: uid(), role: "user", content: msg }]);

      try {
        if (remoteMode) {
          // 📡 Télécommande : la commande part vers le poste principal, qui la prononcera
          await fetch("/api/remote", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text: msg, origin: "mobile" }),
          });
          const ack = "Commande transmise au poste principal.";
          setEntries((p) => [...p.slice(-40), { id: uid(), role: "jarvis", content: ack }]);
          if (speakHere) voice.speak(ack);
        } else {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris";
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: msg, tz }),
          });
          const data = await res.json();
          const reply: string = data.reply ?? "Pas de réponse.";
          setEntries((p) => [...p.slice(-40), { id: uid(), role: "jarvis", content: reply }]);
          if (speakHere) voice.speak(reply);
          if (data.action?.type === "open" && data.action.url) {
            window.open(String(data.action.url), "_blank", "noopener,noreferrer");
          }
          if (data.action?.type === "devicesChanged") loadDevices();
        }
      } catch {
        setEntries((p) => [...p.slice(-40), { id: uid(), role: "jarvis", content: "Connexion perdue." }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, loadDevices, remoteMode, speakHere, voice]
  );

  const mic = useCallback(() => {
    if (!primed.current) {
      voice.prime();
      primed.current = true;
    }
    if (stt.listening) {
      stt.stopOnce();
      return;
    }
    stt.startOnce((t) => t && send(t));
  }, [send, stt, voice]);

  const toggleDevice = useCallback(
    async (entityId: string) => {
      await fetch("/api/devices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entityId, toggle: true }),
      });
      loadDevices();
    },
    [loadDevices]
  );

  return (
    <main className="jarvis-scene flex h-[100dvh] flex-col overflow-hidden">
      {/* En-tête */}
      <header className="flex shrink-0 items-center gap-2.5 border-b border-cyan-500/15 px-4 py-3">
        <div className="relative grid h-8 w-8 place-items-center">
          <span className="absolute h-8 w-8 rounded-full border border-cyan-400/40 animate-jarvis-spin-medium [animation-duration:10s] [border-top-color:theme(colors.cyan.300)]" />
          <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.9)]" />
        </div>
        <div className="min-w-0">
          <h1 className="font-orbitron text-sm font-bold tracking-[0.28em] text-cyan-100 jarvis-glow">J.A.R.V.I.S.</h1>
          <p className="flex items-center gap-1 font-tech text-[8.5px] tracking-[0.2em] text-cyan-500/60">
            <Smartphone size={9} /> COMPAGNON MOBILE
          </p>
        </div>
        <button
          onClick={() => setSpeakHere((v) => !v)}
          className={`ml-auto grid h-8 w-8 place-items-center border ${
            speakHere ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-300" : "border-slate-600/40 text-slate-500"
          }`}
          title="Voix sur ce téléphone"
        >
          <Volume2 size={14} />
        </button>
      </header>

      {/* Onglets */}
      <nav className="flex shrink-0 gap-px bg-cyan-500/10">
        {([["voice", "Assistant"], ["home", "Maison"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 bg-[#04101f] py-2.5 font-orbitron text-[9.5px] uppercase tracking-[0.25em] transition-colors ${
              tab === k ? "text-cyan-100 shadow-[inset_0_-2px_0_rgb(34_211_238)]" : "text-cyan-500/50"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "voice" ? (
        <>
          <div ref={scrollRef} className="jarvis-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {entries.length === 0 && (
              <div className="pt-10 text-center">
                <p className="font-tech text-[12px] leading-relaxed text-cyan-500/50">
                  Appuyez sur le micro et parlez.
                  <br />
                  <span className="text-cyan-600/50">« allume le salon » · « météo à Nice »</span>
                </p>
              </div>
            )}
            {entries.map((e) => (
              <div key={e.id} className={`flex ${e.role === "jarvis" ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[85%] border px-3 py-2 text-[13px] leading-relaxed ${
                    e.role === "jarvis"
                      ? "border-cyan-400/25 bg-cyan-400/[0.07] text-cyan-50"
                      : "border-slate-500/25 bg-slate-500/10 text-slate-200"
                  }`}
                >
                  {e.content}
                </div>
              </div>
            ))}
            {stt.listening && (
              <p className="text-center font-tech text-[11px] text-emerald-300/90">
                {stt.interim || "Je vous écoute…"}
              </p>
            )}
          </div>

          {/* Télécommande */}
          <div className="shrink-0 px-4">
            <button
              onClick={() => setRemoteMode((v) => !v)}
              className={`mb-2 flex w-full items-center justify-center gap-2 border py-1.5 font-orbitron text-[8.5px] uppercase tracking-[0.25em] transition-colors ${
                remoteMode
                  ? "border-amber-400/50 bg-amber-400/10 text-amber-300"
                  : "border-cyan-500/20 text-cyan-500/60"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${remoteMode ? "animate-pulse bg-amber-400" : "bg-cyan-700"}`} />
              {remoteMode ? "Télécommande : le poste principal répond" : "Mode local : ce téléphone répond"}
            </button>
          </div>

          {/* Barre de saisie */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const v = text.trim();
              if (v) {
                setText("");
                send(v);
              }
            }}
            className="flex shrink-0 items-center gap-2 border-t border-cyan-500/15 bg-[#04101f]/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <button
              type="button"
              onClick={mic}
              disabled={!stt.supported}
              className={`relative grid h-12 w-12 shrink-0 place-items-center border transition-all ${
                stt.listening
                  ? "border-emerald-400/70 bg-emerald-400/15 text-emerald-300"
                  : "border-cyan-500/40 bg-cyan-400/10 text-cyan-300"
              } disabled:opacity-30`}
            >
              {stt.listening && <span className="absolute inset-0 animate-ping border border-emerald-400/50" />}
              <Mic size={19} />
            </button>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Votre instruction…"
              className="min-w-0 flex-1 bg-transparent font-tech text-[14px] text-cyan-50 placeholder:text-cyan-600/60 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !text.trim()}
              className="grid h-12 w-12 shrink-0 place-items-center border border-cyan-500/40 bg-cyan-400/10 text-cyan-300 disabled:opacity-30"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <SendHorizonal size={18} />}
            </button>
          </form>
        </>
      ) : (
        /* Onglet Maison */
        <div className="jarvis-scroll min-h-0 flex-1 overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mb-3 grid grid-cols-4 gap-2">
            {SCENES.map((s) => (
              <button
                key={s.label}
                onClick={() => send(s.cmd)}
                className="flex flex-col items-center gap-1.5 border border-cyan-500/20 bg-cyan-950/30 py-3 font-tech text-[10px] text-cyan-200/85 active:bg-cyan-400/15"
              >
                <s.icon size={17} className="text-cyan-300" />
                {s.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {devices.map((d) => {
              const Icon = ICONS[d.kind] ?? Plug;
              const isOn = d.state === "on";
              return (
                <button
                  key={d.entityId}
                  onClick={() => toggleDevice(d.entityId)}
                  className={`flex flex-col items-start gap-2 border p-3 text-left transition-colors ${
                    isOn ? "border-cyan-400/40 bg-cyan-400/10" : "border-cyan-500/15 bg-cyan-950/25"
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <Icon size={18} className={isOn ? "text-amber-300" : "text-cyan-600/70"} />
                    <Power size={13} className={isOn ? "text-emerald-400" : "text-cyan-700"} />
                  </div>
                  <div className="min-w-0 w-full">
                    <p className="truncate text-[12px] text-cyan-50">{d.name}</p>
                    <p className="font-tech text-[8.5px] uppercase tracking-[0.15em] text-cyan-500/55">
                      {d.kind === "thermostat" ? `${d.level}°C` : isOn ? `allumé · ${d.room}` : `éteint · ${d.room}`}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => send("éteins tout")}
            className="mt-3 flex w-full items-center justify-center gap-2 border border-rose-400/35 bg-rose-400/[0.07] py-3 font-orbitron text-[10px] uppercase tracking-[0.25em] text-rose-300 active:bg-rose-400/15"
          >
            <Home size={13} /> Tout éteindre
          </button>
        </div>
      )}
    </main>
  );
}
