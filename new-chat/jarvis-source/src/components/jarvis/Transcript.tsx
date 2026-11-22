"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bot, Globe, Terminal, User } from "lucide-react";

export interface ChatMessage {
  id: string;
  role: "user" | "jarvis";
  content: string;
  ts: string;
  /** Image générée par le module créatif. */
  imageUrl?: string;
  /** Pages web consultées par Jarvis pour répondre. */
  sources?: { title: string; url: string }[];
  cognition?: { route: string; kind: string; confidence: number; reason: string };
  engine?: string;
  model?: string | null;
}

const CODE_LIKE = /(```|function |const |=>|def |class |SELECT |console\.)/;

function MessageContent({ content }: { content: string }) {
  if (CODE_LIKE.test(content) || content.split("\n").length >= 4) {
    return (
      <pre className="jarvis-scroll mt-1 max-h-72 overflow-auto border border-cyan-500/20 bg-[#020a16] p-2.5 text-left font-tech text-[11px] leading-relaxed text-cyan-100/90">
        <code>{content}</code>
      </pre>
    );
  }
  return <>{content}</>;
}

function Typewriter({ text, active }: { text: string; active: boolean }) {
  const [n, setN] = useState(active ? 0 : text.length);

  useEffect(() => {
    if (!active) {
      setN(text.length);
      return;
    }
    setN(0);
    const id = setInterval(() => {
      setN((v) => {
        if (v >= text.length) {
          clearInterval(id);
          return v;
        }
        return v + 3;
      });
    }, 24);
    return () => clearInterval(id);
  }, [text, active]);

  return (
    <span>
      {text.slice(0, n)}
      {n < text.length && <span className="jarvis-caret ml-0.5 inline-block h-3 w-1.5 bg-cyan-300 align-middle" />}
    </span>
  );
}

export function Transcript({ messages, speaking }: { messages: ChatMessage[]; speaking: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, messages[messages.length - 1]?.content]);

  const lastId = messages[messages.length - 1]?.id;

  return (
    <section className="hud-frame flex min-h-0 flex-1 flex-col border border-cyan-500/15 bg-[#04101f]/70 backdrop-blur-md">
      <header className="flex items-center gap-2 border-b border-cyan-500/15 px-4 py-2.5">
        <Terminal size={13} className="text-cyan-400/70" />
        <p className="font-orbitron text-[10px] uppercase tracking-[0.35em] text-cyan-400/70">Transcription</p>
        <span className="ml-auto flex items-center gap-1.5 font-tech text-[9px] tracking-[0.2em] text-emerald-400/80">
          <span className="h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
          LIVE
        </span>
      </header>

      <div ref={scrollRef} className="jarvis-scroll min-h-[200px] flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="pt-8 text-center font-tech text-xs leading-relaxed text-cyan-500/50">
            Aucun échange pour l&apos;instant.
            <br />
            Parlez-moi, ou écrivez une instruction ci-dessous.
          </p>
        )}
        {messages.map((m) => {
          const isJarvis = m.role === "jarvis";
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className={`flex gap-2.5 ${isJarvis ? "" : "flex-row-reverse"}`}
            >
              <div
                className={`grid h-6 w-6 shrink-0 place-items-center border ${
                  isJarvis
                    ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                    : "border-slate-500/40 bg-slate-500/10 text-slate-300"
                }`}
              >
                {isJarvis ? <Bot size={13} /> : <User size={13} />}
              </div>
              <div className={`min-w-0 max-w-[85%] ${isJarvis ? "" : "text-right"}`}>
                <p
                  className={`font-tech text-[9px] uppercase tracking-[0.25em] ${
                    isJarvis ? "text-cyan-500/60" : "text-slate-500/60"
                  }`}
                >
                  {isJarvis ? "Jarvis" : "Vous"} ·{" "}
                  {new Date(m.ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </p>
                <div
                  className={`mt-1 whitespace-pre-wrap text-[13px] leading-relaxed ${
                    isJarvis ? "text-cyan-50" : "text-slate-200"
                  }`}
                >
                  {isJarvis && m.id === lastId && !CODE_LIKE.test(m.content) ? (
                    <Typewriter text={m.content} active />
                  ) : (
                    <MessageContent content={m.content} />
                  )}
                </div>
                {m.cognition && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <span
                      title={m.cognition.reason}
                      className={`border px-1.5 py-0.5 font-tech text-[8px] uppercase tracking-[0.16em] ${
                        m.cognition.route === "local"
                          ? "border-emerald-400/35 bg-emerald-400/[0.07] text-emerald-300"
                          : m.cognition.route === "hybrid"
                            ? "border-violet-400/35 bg-violet-400/[0.07] text-violet-300"
                            : "border-sky-400/35 bg-sky-400/[0.07] text-sky-300"
                      }`}
                    >
                      {m.cognition.route === "local" ? "LOCAL" : m.cognition.route === "hybrid" ? "HYBRIDE" : "INTERNET"}
                    </span>
                    <span className="font-tech text-[8px] tracking-wide text-cyan-600/60">
                      {m.cognition.kind} · {Math.round(m.cognition.confidence * 100)} %
                      {m.model ? ` · ${m.model}` : ""}
                    </span>
                  </div>
                )}
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {m.sources.slice(0, 4).map((s, i) => {
                      let host = s.url;
                      try { host = new URL(s.url).hostname.replace(/^www\./, ""); } catch { /* brut */ }
                      return (
                        <a
                          key={`${m.id}-src-${i}`}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={s.title}
                          className="flex items-center gap-1 border border-cyan-500/25 bg-cyan-950/40 px-1.5 py-0.5 font-tech text-[9px] text-cyan-300/80 transition-colors hover:border-cyan-400/60 hover:text-cyan-100"
                        >
                          <Globe size={8} />
                          {host.slice(0, 24)}
                        </a>
                      );
                    })}
                  </div>
                )}
                {m.imageUrl && (
                  <a
                    href={m.imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block overflow-hidden border border-cyan-500/30 transition-all hover:border-cyan-300/70 hover:shadow-[0_0_24px_rgba(34,211,238,0.25)]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.imageUrl}
                      alt="Génération Jarvis"
                      className="h-auto w-full object-cover"
                      loading="lazy"
                    />
                  </a>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
