"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, FileText, Inbox, Loader2, Mail, MailPlus, Send, Server, ShieldCheck, Trash2,
} from "lucide-react";
import Link from "next/link";

interface MailMsg {
  id: string;
  from: string;
  subject: string;
  date: string;
  unread: boolean;
  body?: string;
  tag?: string;
}

interface Creds {
  host: string;
  port: string;
  secure: boolean;
  user: string;
  pass: string;
  smtpPort: string;
}

const EMPTY: Creds = { host: "", port: "993", secure: true, user: "", pass: "", smtpPort: "465" };

const DOC_ITEMS = [
  { name: "Facture électricité", when: "à payer le 28", state: "À régler", tone: "amber" },
  { name: "Contrat de prestation", when: "signature attendue", state: "En attente", tone: "cyan" },
  { name: "Déclaration de TVA", when: "dans 6 jours", state: "À préparer", tone: "rose" },
  { name: "Assurance professionnelle", when: "renouvellement mars", state: "Planifié", tone: "emerald" },
];

/** 📁 ADMIN — messagerie (IMAP/SMTP) + suivi administratif. */
export default function AdminPage() {
  const [creds, setCreds] = useState<Creds>(EMPTY);
  const [messages, setMessages] = useState<MailMsg[]>([]);
  const [demo, setDemo] = useState(true);
  const [connected, setConnected] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");

  /* Boîte de démonstration au chargement */
  useEffect(() => {
    fetch("/api/mail", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "inbox" }),
    })
      .then((r) => r.json())
      .then((d) => {
        setMessages(d.messages ?? []);
        setDemo(Boolean(d.demo));
        setSelected(d.messages?.[0]?.id ?? null);
      })
      .catch(() => setStatus("Impossible de joindre le service de messagerie."));
  }, []);

  const call = useCallback(async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/mail", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json();
  }, []);

  const loadInbox = useCallback(async () => {
    setBusy("inbox");
    setStatus(null);
    try {
      const data = await call({ action: "inbox", limit: 25, ...creds });
      if (data.ok) {
        setMessages(data.messages ?? []);
        setDemo(Boolean(data.demo));
        setSelected(data.messages?.[0]?.id ?? null);
        setStatus(
          data.demo
            ? "Aucun identifiant : boîte de démonstration affichée."
            : `Connecté à ${creds.host} — ${(data.messages ?? []).length} message(s).`
        );
      } else {
        setStatus(data.error ?? "Connexion IMAP échouée.");
      }
    } finally {
      setBusy(null);
    }
  }, [call, creds]);

  const connect = useCallback(async () => {
    if (!creds.host || !creds.user || !creds.pass) {
      setStatus("Renseignez hôte, identifiant et mot de passe (IMAP).");
      return;
    }
    setBusy("test");
    setStatus(null);
    try {
      const data = await call({ action: "test", ...creds });
      if (data.ok) {
        setConnected(`${creds.user} @ ${creds.host}`);
        setStatus(`Connexion réussie — ${data.messages} message(s) dans la boîte.`);
        await loadInbox();
      } else {
        setConnected(null);
        setStatus(data.error ?? "Échec de la connexion.");
      }
    } finally {
      setBusy(null);
    }
  }, [call, creds, loadInbox]);

  const send = useCallback(async () => {
    if (!to.trim() || !subject.trim() || !text.trim()) {
      setStatus("Destinataire, objet et message sont requis.");
      return;
    }
    setBusy("send");
    setStatus(null);
    try {
      const data = await call({ action: "send", ...creds, to, subject, text });
      if (data.ok) {
        setStatus(data.demo ? data.error : `Message envoyé à ${to}.`);
        if (!data.demo) {
          setTo("");
          setSubject("");
          setText("");
        }
      } else {
        setStatus(data.error ?? "Échec de l'envoi.");
      }
    } finally {
      setBusy(null);
    }
  }, [call, creds, subject, text, to]);

  const current = messages.find((m) => m.id === selected) ?? null;
  const unread = messages.filter((m) => m.unread).length;

  return (
    <main className="jarvis-scene relative min-h-screen overflow-x-hidden px-4 py-6 text-cyan-50">
      <div className="jarvis-grid pointer-events-none absolute inset-0" />
      <div className="jarvis-scanlines pointer-events-none absolute inset-0 opacity-45" />
      <div className="jarvis-scanband pointer-events-none" />

      <section className="relative z-10 mx-auto max-w-[1500px] space-y-4">
        <header className="flex flex-wrap items-end gap-4 border-b border-cyan-500/20 pb-4">
          <Link
            href="/"
            className="cyber-btn flex items-center gap-1.5 border border-cyan-500/30 px-3 py-2 font-tech text-[10px] uppercase tracking-[0.18em] text-cyan-300 transition-colors hover:border-cyan-400/60 hover:text-cyan-100"
          >
            <ArrowLeft size={12} /> Retour
          </Link>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-tech text-[10px] uppercase tracking-[0.4em] text-cyan-400/65">
              <FileText size={13} /> Gestion administrative
            </p>
            <h1 className="mt-1.5 font-orbitron text-2xl font-bold tracking-[0.22em] text-cyan-100 jarvis-glow sm:text-4xl">
              ADMIN
            </h1>
            <p className="mt-1.5 max-w-2xl font-tech text-[11.5px] leading-relaxed text-cyan-200/70">
              Messagerie complète : <strong className="text-cyan-100">connexion IMAP</strong>, réception,
              lecture, <strong className="text-cyan-100">envoi SMTP</strong> — plus le suivi de vos
              documents et échéances.
            </p>
          </div>

          <div className="hud-frame border border-cyan-500/20 bg-[#04101f]/70 px-3 py-2 text-center">
            <Inbox size={13} className="mx-auto text-cyan-400/75" />
            <p className="mt-1 font-tech text-[8.5px] uppercase tracking-[0.18em] text-cyan-500/60">
              Boîte
            </p>
            <p className="font-tech text-[11px] text-cyan-100">
              {messages.length} msg · {unread} non lus
            </p>
          </div>
        </header>

        {/* Barre de connexion au compte mail */}
        <div className="hud-frame border border-cyan-500/20 bg-[#04101f]/75 p-3 backdrop-blur-md">
          <div className="flex flex-wrap items-end gap-2.5">
            <label className="flex-1 basis-52 font-tech text-[9px] uppercase tracking-[0.16em] text-cyan-500/60">
              Hôte IMAP
              <input
                value={creds.host}
                onChange={(e) => setCreds({ ...creds, host: e.target.value })}
                placeholder="imap.gmail.com"
                className="mt-1 w-full border border-cyan-500/25 bg-[#04101f] px-2.5 py-2 font-tech text-[12px] text-cyan-50 placeholder:text-cyan-600/55 focus:border-cyan-300/60 focus:outline-none"
              />
            </label>
            <label className="w-20 font-tech text-[9px] uppercase tracking-[0.16em] text-cyan-500/60">
              Port
              <input
                value={creds.port}
                onChange={(e) => setCreds({ ...creds, port: e.target.value })}
                inputMode="numeric"
                className="mt-1 w-full border border-cyan-500/25 bg-[#04101f] px-2.5 py-2 font-tech text-[12px] tabular-nums text-cyan-50 focus:border-cyan-300/60 focus:outline-none"
              />
            </label>
            <label className="flex-1 basis-52 font-tech text-[9px] uppercase tracking-[0.16em] text-cyan-500/60">
              Identifiant
              <input
                value={creds.user}
                onChange={(e) => setCreds({ ...creds, user: e.target.value })}
                placeholder="vous@exemple.fr"
                className="mt-1 w-full border border-cyan-500/25 bg-[#04101f] px-2.5 py-2 font-tech text-[12px] text-cyan-50 placeholder:text-cyan-600/55 focus:border-cyan-300/60 focus:outline-none"
              />
            </label>
            <label className="flex-1 basis-44 font-tech text-[9px] uppercase tracking-[0.16em] text-cyan-500/60">
              Mot de passe
              <input
                type="password"
                value={creds.pass}
                onChange={(e) => setCreds({ ...creds, pass: e.target.value })}
                placeholder="••••••••"
                className="mt-1 w-full border border-cyan-500/25 bg-[#04101f] px-2.5 py-2 font-tech text-[12px] text-cyan-50 placeholder:text-cyan-600/55 focus:border-cyan-300/60 focus:outline-none"
              />
            </label>
            <label className="w-24 font-tech text-[9px] uppercase tracking-[0.16em] text-cyan-500/60">
              SMTP
              <input
                value={creds.smtpPort}
                onChange={(e) => setCreds({ ...creds, smtpPort: e.target.value })}
                inputMode="numeric"
                className="mt-1 w-full border border-cyan-500/25 bg-[#04101f] px-2.5 py-2 font-tech text-[12px] tabular-nums text-cyan-50 focus:border-cyan-300/60 focus:outline-none"
              />
            </label>

            <button
              onClick={connect}
              disabled={busy === "test"}
              className="cyber-btn flex items-center gap-1.5 border border-emerald-400/45 bg-emerald-400/12 px-4 py-2.5 font-tech text-[10px] uppercase tracking-[0.16em] text-emerald-100 transition-colors hover:bg-emerald-400/25 disabled:opacity-50"
            >
              {busy === "test" ? <Loader2 size={12} className="animate-spin" /> : <Server size={12} />}
              Connecter
            </button>
            <button
              onClick={loadInbox}
              disabled={busy === "inbox"}
              className="cyber-btn flex items-center gap-1.5 border border-cyan-400/45 bg-cyan-400/12 px-4 py-2.5 font-tech text-[10px] uppercase tracking-[0.16em] text-cyan-50 transition-colors hover:bg-cyan-400/25 disabled:opacity-50"
            >
              {busy === "inbox" ? <Loader2 size={12} className="animate-spin" /> : <Inbox size={12} />}
              Relever
            </button>

            <span
              className={`flex items-center gap-1.5 font-tech text-[10px] tracking-[0.14em] ${
                connected ? "text-emerald-300" : "text-cyan-500/55"
              }`}
            >
              <ShieldCheck size={12} />
              {connected ? `CONNECTÉ · ${connected}` : "NON CONNECTÉ · MODE DÉMO"}
            </span>
          </div>

          {status && (
            <p className="mt-2 border-l-2 border-cyan-400/50 pl-2.5 font-tech text-[11px] text-cyan-100/85">
              {status}
            </p>
          )}
          <p className="mt-1.5 font-tech text-[9.5px] text-cyan-500/50">
            Les identifiants servent uniquement à la requête en cours : ils ne sont ni stockés ni journalisés.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_320px]">
          {/* Liste de messages */}
          <section className="hud-frame flex min-h-[420px] flex-col border border-cyan-500/20 bg-[#04101f]/75 backdrop-blur-md">
            <header className="flex items-center gap-2 border-b border-cyan-500/15 px-4 py-2.5">
              <Mail size={13} className="text-cyan-400/80" />
              <p className="font-orbitron text-[10px] uppercase tracking-[0.3em] text-cyan-400/80">
                Boîte de réception
              </p>
              <span className="ml-auto font-tech text-[9px] tracking-[0.16em] text-cyan-500/60">
                {demo ? "DÉMO" : "IMAP"}
              </span>
            </header>

            <div className="jarvis-scroll min-h-0 flex-1 overflow-y-auto p-2">
              {messages.length === 0 && (
                <p className="py-8 text-center font-tech text-[11px] text-cyan-500/45">
                  Aucun message. Cliquez sur « Relever ».
                </p>
              )}
              {messages.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelected(m.id)}
                  className={`mb-1.5 block w-full border px-3 py-2.5 text-left transition-colors ${
                    selected === m.id
                      ? "border-cyan-400/50 bg-cyan-400/[0.09]"
                      : "border-cyan-500/12 bg-cyan-950/25 hover:border-cyan-400/30"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {m.unread && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_7px_rgba(103,232,249,0.9)]" />
                    )}
                    <p className={`min-w-0 flex-1 truncate text-[12px] ${m.unread ? "text-cyan-50" : "text-cyan-200/75"}`}>
                      {m.from}
                    </p>
                    <span className="shrink-0 font-tech text-[9px] tabular-nums text-cyan-500/55">
                      {new Date(m.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
                    </span>
                  </div>
                  <p className={`mt-1 truncate text-[12.5px] ${m.unread ? "font-semibold text-cyan-100" : "text-cyan-200/85"}`}>
                    {m.subject}
                  </p>
                  {m.tag && (
                    <span className="mt-1.5 inline-block border border-cyan-500/25 px-1.5 py-px font-tech text-[8.5px] uppercase tracking-[0.14em] text-cyan-400/75">
                      {m.tag}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Lecture + composition */}
          <section className="hud-frame flex min-h-[420px] flex-col border border-cyan-500/20 bg-[#04101f]/75 backdrop-blur-md">
            <header className="flex items-center gap-2 border-b border-cyan-500/15 px-4 py-2.5">
              <MailPlus size={13} className="text-cyan-400/80" />
              <p className="font-orbitron text-[10px] uppercase tracking-[0.3em] text-cyan-400/80">
                Message
              </p>
              {current && (
                <button
                  onClick={() => {
                    setTo(current.from.replace(/^.*<|>$/g, ""));
                    setSubject(`Re : ${current.subject}`);
                    setStatus("Brouillon préparé ci-dessous.");
                  }}
                  className="cyber-btn ml-auto border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-1 font-tech text-[9px] uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-400/25"
                >
                  Répondre
                </button>
              )}
            </header>

            <div className="jarvis-scroll min-h-0 flex-1 overflow-y-auto p-4">
              {!current ? (
                <p className="py-10 text-center font-tech text-[11px] text-cyan-500/45">
                  Sélectionnez un message dans la liste.
                </p>
              ) : (
                <motion.article key={current.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <h2 className="text-[15px] leading-snug text-cyan-50">{current.subject}</h2>
                  <p className="mt-1 font-tech text-[11px] text-cyan-400/75">{current.from}</p>
                  <p className="font-tech text-[10px] text-cyan-500/55">
                    {new Date(current.date).toLocaleString("fr-FR")}
                  </p>
                  <div className="mt-3 border-t border-cyan-500/15 pt-3">
                    <pre className="whitespace-pre-wrap font-tech text-[12.5px] leading-relaxed text-cyan-100/90">
                      {current.body?.trim() ||
                        "Le corps complet de ce message n'est pas récupéré dans cette session.\nUtilisez « Répondre » pour saisir votre réponse, puis Envoyer."}
                    </pre>
                  </div>
                </motion.article>
              )}
            </div>

            {/* Composition */}
            <div className="border-t border-cyan-500/15 p-3">
              <p className="mb-2 font-tech text-[9px] uppercase tracking-[0.18em] text-cyan-500/60">
                Nouveau message
              </p>
              <div className="space-y-1.5">
                <input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="destinataire@exemple.fr"
                  className="w-full border border-cyan-500/25 bg-[#04101f] px-2.5 py-1.5 font-tech text-[12px] text-cyan-50 placeholder:text-cyan-600/55 focus:border-cyan-300/60 focus:outline-none"
                />
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Objet"
                  className="w-full border border-cyan-500/25 bg-[#04101f] px-2.5 py-1.5 font-tech text-[12px] text-cyan-50 placeholder:text-cyan-600/55 focus:border-cyan-300/60 focus:outline-none"
                />
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                  placeholder="Votre message…"
                  className="w-full resize-none border border-cyan-500/25 bg-[#04101f] px-2.5 py-2 font-tech text-[12.5px] leading-relaxed text-cyan-50 placeholder:text-cyan-600/55 focus:border-cyan-300/60 focus:outline-none"
                />
                <button
                  onClick={send}
                  disabled={busy === "send"}
                  className="cyber-btn flex w-full items-center justify-center gap-2 border border-emerald-400/45 bg-emerald-400/12 py-2 font-tech text-[10.5px] uppercase tracking-[0.18em] text-emerald-100 transition-colors hover:bg-emerald-400/25 disabled:opacity-50"
                >
                  {busy === "send" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  Envoyer
                </button>
              </div>
            </div>
          </section>

          {/* Suivi administratif */}
          <aside className="hud-frame flex flex-col border border-cyan-500/20 bg-[#04101f]/75 backdrop-blur-md">
            <header className="flex items-center gap-2 border-b border-cyan-500/15 px-4 py-2.5">
              <FileText size={13} className="text-cyan-400/80" />
              <p className="font-orbitron text-[10px] uppercase tracking-[0.3em] text-cyan-400/80">
                Échéances
              </p>
            </header>

            <div className="space-y-2 p-3">
              {DOC_ITEMS.map((d) => (
                <div key={d.name} className="border border-cyan-500/15 bg-cyan-950/25 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[12px] leading-tight text-cyan-50">{d.name}</p>
                    <span
                      className={`shrink-0 border px-1.5 py-px font-tech text-[8px] uppercase tracking-[0.14em] ${
                        d.tone === "amber"
                          ? "border-amber-400/40 text-amber-300"
                          : d.tone === "rose"
                            ? "border-rose-400/40 text-rose-300"
                            : d.tone === "emerald"
                              ? "border-emerald-400/40 text-emerald-300"
                              : "border-cyan-400/40 text-cyan-300"
                      }`}
                    >
                      {d.state}
                    </span>
                  </div>
                  <p className="mt-1 font-tech text-[9.5px] text-cyan-500/60">{d.when}</p>
                </div>
              ))}
            </div>

            <div className="mt-auto border-t border-cyan-500/12 p-3">
              <p className="font-tech text-[9.5px] leading-relaxed text-cyan-500/55">
                <span className="text-cyan-300/80">Astuce :</span> demandez à Jarvis
                « facture », « ajoute rendez-vous… » ou « note que… » — tout est archivé
                dans le journal de la page d&apos;accueil.
              </p>
            </div>
          </aside>
        </div>

        <footer className="border-t border-cyan-500/15 pt-4 text-center font-tech text-[10px] tracking-[0.2em] text-cyan-500/45">
          J.A.R.V.I.S. ADMIN · IMAP + SMTP + SUIVI ADMINISTRATIF
        </footer>
      </section>
    </main>
  );
}
