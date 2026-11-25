"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Bot, Loader2, Plug, Plus, RefreshCw, Sparkles, Trash2, Unplug, Wrench, X } from "lucide-react";
import { ModalShell } from "./StudioModal";

export type Report = (text: string, error?: boolean) => void;

interface McpServer { id: string; name: string; endpoint: string; transport: "local" | "remote"; auth: "aucune" | "clé" | "oauth"; desc: string; custom?: boolean }
interface ProbeResult { id: string; ok: boolean; ms: number; error?: string }
interface SkillDef { id: string; name: string; cat: string; desc: string; custom?: boolean }
interface AgentDef { id: number; name: string; role: string; tools?: string }

const field = "connect-field";
const label = "connect-label";

/* ══════════════════ MCP — les 10 serveurs + ajout personnalisé ══════════════════ */
export function McpPanel({ notify, log, onCounts }: { notify: Report; log: (t: string, type?: "info" | "success" | "warning") => void; onCounts: (n: number) => void }) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [results, setResults] = useState<Record<string, ProbeResult>>({});
  const [probing, setProbing] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", endpoint: "", transport: "local" as "local" | "remote", auth: "aucune" as McpServer["auth"], desc: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetch("/api/mcp", { cache: "no-store" }).then(r => r.json());
      const list = (d.servers ?? []) as McpServer[];
      setServers(list); onCounts(list.length);
    } catch { notify("Catalogue MCP indisponible.", true); }
  }, [notify, onCounts]);
  useEffect(() => { void load(); }, [load]);

  const run = useCallback(async (body: Record<string, unknown>) => {
    setProbing(typeof body.id === "string" ? body.id : "*");
    try {
      const res = await fetch("/api/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "sonde");
      const map: Record<string, ProbeResult> = {};
      for (const r of (data.results ?? []) as ProbeResult[]) map[r.id] = r;
      setResults(prev => ({ ...prev, ...map }));
      setLastScan(new Date().toLocaleTimeString("fr-FR"));
      const up = Object.values(map).filter(r => r.ok).length;
      log(`Sonde MCP : ${up}/${Object.keys(map).length} endpoint(s) joignable(s).`, up ? "success" : "warning");
      return map;
    } catch (e) {
      notify(e instanceof Error ? e.message : "Échec de la sonde MCP.", true);
      return null;
    } finally { setProbing(null); }
  }, [notify, log]);

  const add = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const res = await fetch("/api/mcp", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Échec");
      setServers(p => [...p, data.server]); onCounts(servers.length + 1);
      setOpen(false); setForm({ name: "", endpoint: "", transport: "local", auth: "aucune", desc: "" });
      notify(`Serveur MCP « ${data.server.name} » enregistré.`); log(`MCP ajouté : ${data.server.name} → ${data.server.endpoint}`, "success");
      void run({ id: data.server.id });
    } catch (err) { setError(err instanceof Error ? err.message : "Échec"); }
    finally { setBusy(false); }
  };

  const remove = async (server: McpServer) => {
    const res = await fetch("/api/mcp", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: server.id }) }).catch(() => null);
    if (!res?.ok) return notify("Suppression impossible.", true);
    setServers(p => p.filter(s => s.id !== server.id)); onCounts(servers.length - 1);
    setResults(p => { const n = { ...p }; delete n[server.id]; return n; });
    notify(`Serveur « ${server.name} » retiré.`); log(`MCP supprimé : ${server.name}`);
  };

  const connected = Object.values(results).filter(r => r.ok).length;
  const tested = Object.keys(results).length;
  const scanning = probing !== null;

  return <div className="connect-panel">
    <div className="connect-toolbar">
      <span className="connect-counter"><span className={`dot ${tested ? (connected === tested ? "on" : "off") : "idle"}`} />{tested ? `${connected}/${tested} en ligne` : `${servers.length} serveurs référencés`}{lastScan ? ` · ${lastScan}` : ""}</span>
      <button className="connect-btn ghost" disabled={scanning || !servers.length} onClick={() => run({ all: true })} title="Sonder les serveurs intégrés et personnalisés">{scanning && probing === "*" ? <Loader2 size={11} className="spin" /> : <RefreshCw size={11} />}Tout sonder</button>
      <button className="connect-btn primary" onClick={() => setOpen(true)}><Plus size={11} />Ajouter</button>
    </div>
    <div className="connect-scroll jarvis-scroll">
      <div className="mcp-grid">
        {servers.map(s => {
          const r = results[s.id], busy = probing === s.id || probing === "*";
          return <article key={s.id} className={`mcp-card ${r ? (r.ok ? "is-on" : "is-off") : ""}`}>
            <header><span className={`dot ${r ? (r.ok ? "on" : "off") : "idle"}`} /><h4>{s.name}</h4><span className={`tag ${s.transport}`}>{s.transport === "local" ? "local" : s.auth}</span>{s.custom && <button className="card-x" aria-label={`Supprimer ${s.name}`} onClick={() => remove(s)}><X size={10} /></button>}</header>
            <p className="endpoint">{s.endpoint}</p>
            <p className="desc">{s.desc}</p>
            <footer><button className="connect-btn tiny" disabled={busy} onClick={() => run({ id: s.id })}>{busy ? <Loader2 size={9} className="spin" /> : r?.ok ? <Plug size={9} /> : <Unplug size={9} />}{busy ? "sonde…" : r ? (r.ok ? "connecté" : "hors ligne") : "tester"}</button>{r && <span className="ms">{r.ms} ms</span>}{r && !r.ok && <span className="err">{r.error}</span>}</footer>
          </article>;
        })}
      </div>
      {!servers.length && <p className="connect-empty">Chargement du catalogue MCP…</p>}
    </div>
    <p className="connect-foot">blender-mcp, unity-mcp et godot-mcp démarrent avec leurs applications. Les serveurs distants utilisent OAuth ou une clé.</p>
    {open && <ModalShell title="Brancher un nouveau cerveau." eyebrow="AJOUTER UN SERVEUR MCP" onClose={() => setOpen(false)}>
      <p className="modal-description">Renseignez l’endpoint du serveur Model Context Protocol : JARVIS le sondera dès l’enregistrement.</p>
      <form onSubmit={add} className="connect-form">
        <label className={label}>Nom du serveur<input className={field} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="ex. Blender local" maxLength={60} required /></label>
        <label className={label}>Endpoint<input className={field} value={form.endpoint} onChange={e => setForm({ ...form, endpoint: e.target.value })} placeholder="http://127.0.0.1:9876" inputMode="url" pattern="https?://.+" required /></label>
        <div className="connect-row">
          <label className={label}>Transport<select className={field} value={form.transport} onChange={e => setForm({ ...form, transport: e.target.value as "local" | "remote" })}><option value="local">Local</option><option value="remote">Distant</option></select></label>
          <label className={label}>Authentification<select className={field} value={form.auth} onChange={e => setForm({ ...form, auth: e.target.value as McpServer["auth"] })}><option value="aucune">Aucune</option><option value="clé">Clé API</option><option value="oauth">OAuth</option></select></label>
        </div>
        <label className={label}>Description<textarea className={field} value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} placeholder="Outils exposés par ce serveur…" rows={2} maxLength={240} /></label>
        {error && <p className="connect-error">{error}</p>}
        <div className="modal-footer"><span>Stocké dans PostgreSQL</span><button type="submit" className="primary-button" disabled={busy || !form.name.trim() || !form.endpoint.trim()}>{busy ? <Loader2 size={14} className="spin" /> : <Plug size={14} />}{busy ? "Enregistrement…" : "Enregistrer et sonder"}</button></div>
      </form>
    </ModalShell>}
  </div>;
}

/* ══════════════════ SKILLS — les 12 compétences + ajout ══════════════════ */
export function SkillsPanel({ notify, log, onCounts }: { notify: Report; log: (t: string, type?: "info" | "success" | "warning") => void; onCounts: (n: number) => void }) {
  const [skills, setSkills] = useState<SkillDef[]>([]);
  const [active, setActive] = useState<Set<string>>(new Set());
  const [cats, setCats] = useState<string[]>([]);
  const [cat, setCat] = useState("Tous");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", cat: "3D", desc: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try { const raw = localStorage.getItem("jarvis.skills"); if (raw) setActive(new Set(JSON.parse(raw) as string[])); } catch { /* première visite */ }
    fetch("/api/skills", { cache: "no-store" }).then(r => r.json()).then(d => {
      const list = (d.skills ?? []) as SkillDef[];
      setSkills(list); setCats(d.cats ?? []); onCounts(list.length);
    }).catch(() => notify("Catalogue de skills indisponible.", true));
  }, [notify, onCounts]);

  const toggle = useCallback((s: SkillDef) => {
    setActive(prev => {
      const next = new Set(prev);
      next.has(s.id) ? next.delete(s.id) : next.add(s.id);
      try { localStorage.setItem("jarvis.skills", JSON.stringify([...next])); } catch { /* stockage indisponible */ }
      return next;
    });
    log(`${s.name} ${active.has(s.id) ? "désactivé" : "activé"}.`);
  }, [active, log]);

  const add = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const res = await fetch("/api/skills", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Échec");
      setSkills(p => [...p, data.skill]); onCounts(skills.length + 1);
      setOpen(false); setForm({ name: "", cat: "3D", desc: "" });
      notify(`Skill « ${data.skill.name} » ajouté au catalogue.`); log(`Skill créé : ${data.skill.name} [${data.skill.cat}]`, "success");
    } catch (err) { setError(err instanceof Error ? err.message : "Échec"); }
    finally { setBusy(false); }
  };

  const remove = async (s: SkillDef) => {
    const res = await fetch("/api/skills", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: s.id }) }).catch(() => null);
    if (!res?.ok) return notify("Ce skill de base ne peut pas être supprimé.", true);
    setSkills(p => p.filter(x => x.id !== s.id)); onCounts(skills.length - 1);
    notify(`Skill « ${s.name} » supprimé.`); log(`Skill supprimé : ${s.name}`);
  };

  const visible = skills.filter(s => cat === "Tous" || s.cat === cat);
  const builtin = skills.filter(s => !s.custom).length;

  return <div className="connect-panel">
    <div className="connect-toolbar">
      <span className="connect-counter"><span className={`dot ${active.size ? "on" : "idle"}`} />{active.size}/{builtin || 12} actifs</span>
      <div className="chip-row jarvis-scroll">{["Tous", ...cats].map(c => <button key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}</div>
      <button className="connect-btn primary" onClick={() => setOpen(true)}><Plus size={11} />Ajouter</button>
    </div>
    <div className="connect-scroll jarvis-scroll">
      <div className="skill-grid">
        {visible.map(s => {
          const on = active.has(s.id);
          return <div key={s.id} className={`skill-card ${on ? "is-on" : ""}`}>
            <button className="skill-toggle" onClick={() => toggle(s)} aria-pressed={on} title={on ? "Désactiver" : "Activer"}>
              <Sparkles size={11} /><span className="skill-name">{s.name}</span><span className={`dot ${on ? "on" : "idle"}`} />
            </button>
            <p>{s.cat} · {s.desc}</p>
            {s.custom && <button className="card-x" aria-label={`Supprimer ${s.name}`} onClick={() => remove(s)}><Trash2 size={9} /></button>}
          </div>;
        })}
      </div>
      {!visible.length && <p className="connect-empty">Aucun skill dans « {cat} ».</p>}
    </div>
    <p className="connect-foot">Les skills actifs sont partagés avec JARVIS Assistant et le DEV STUDIO.</p>
    {open && <ModalShell title="Enseigner un nouveau réflexe." eyebrow="AJOUTER UN SKILL" onClose={() => setOpen(false)}>
      <p className="modal-description">Ajoutez une compétence au catalogue partagé : elle apparaîtra immédiatement dans le studio et dans l’assistant.</p>
      <form onSubmit={add} className="connect-form">
        <label className={label}>Nom du skill<input className={field} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="ex. Physique de jeu" maxLength={60} required /></label>
        <label className={label}>Catégorie<select className={field} value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value })}>{cats.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className={label}>Description<textarea className={field} value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} placeholder="Ce que ce skill permet concrètement…" rows={2} maxLength={240} required /></label>
        {error && <p className="connect-error">{error}</p>}
        <div className="modal-footer"><span>12 skills de base inclus</span><button type="submit" className="primary-button" disabled={busy || !form.name.trim() || !form.desc.trim()}>{busy ? <Loader2 size={14} className="spin" /> : <Wrench size={14} />}{busy ? "Ajout…" : "Ajouter le skill"}</button></div>
      </form>
    </ModalShell>}
  </div>;
}

/* ══════════════════ AGENTS IA — base PostgreSQL + création ══════════════════ */
export function AgentsPanel({ notify, log, onCounts }: { notify: Report; log: (t: string, type?: "info" | "success" | "warning") => void; onCounts: (n: number) => void }) {
  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", role: "", tools: "" as string });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetch("/api/agents", { cache: "no-store" }).then(r => r.json());
      const list = (d.agents ?? []) as AgentDef[];
      setAgents(list); onCounts(list.length);
    } catch { notify("Base des agents indisponible.", true); }
  }, [notify, onCounts]);
  useEffect(() => { void load(); }, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    const tools = form.tools.split(",").map(t => t.trim()).filter(Boolean).slice(0, 12);
    try {
      const res = await fetch("/api/agents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.name.trim(), role: form.role.trim(), tools }) });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Échec");
      await load();
      setOpen(false); setForm({ name: "", role: "", tools: "" });
      notify(`Agent « ${data.agent.name} » créé et enregistré.`); log(`Agent IA créé : @${data.agent.name} — ${tools.length} outil(s)`, "success");
    } catch (err) { setError(err instanceof Error ? err.message : "Échec"); }
    finally { setBusy(false); }
  };

  const remove = async (a: AgentDef) => {
    const res = await fetch("/api/agents", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: a.id }) }).catch(() => null);
    if (!res?.ok) return notify("Suppression impossible.", true);
    setAgents(p => p.filter(x => x.id !== a.id)); onCounts(agents.length - 1);
    notify(`Agent « ${a.name} » supprimé.`); log(`Agent supprimé : @${a.name}`);
  };

  const toolList = (a: AgentDef): string[] => { try { const v = JSON.parse(a.tools ?? "[]"); return Array.isArray(v) ? v.filter(x => typeof x === "string") : []; } catch { return []; } };

  return <div className="connect-panel">
    <div className="connect-toolbar">
      <span className="connect-counter"><span className={`dot ${agents.length ? "on" : "idle"}`} />{agents.length} agent{agents.length > 1 ? "s" : ""} en base</span>
      <button className="connect-btn ghost" onClick={() => void load()} title="Recharger la liste"><RefreshCw size={11} />Actualiser</button>
      <button className="connect-btn primary" onClick={() => { setOpen(true); setTimeout(() => nameRef.current?.focus(), 60); }}><Plus size={11} />Créer</button>
    </div>
    <div className="connect-scroll jarvis-scroll">
      <div className="agent-list">
        {agents.map(a => <article key={a.id} className="agent-card">
          <header><span className="agent-avatar"><Bot size={13} /></span><div><h4>@{a.name}</h4><span className="agent-tools">{toolList(a).length ? toolList(a).join(" · ") : "outils par défaut"}</span></div><button className="card-x" aria-label={`Supprimer l’agent ${a.name}`} onClick={() => remove(a)}><Trash2 size={10} /></button></header>
          <p>{a.role}</p>
        </article>)}
        {!agents.length && <div className="connect-empty strong"><Bot size={22} /><p>Aucun agent pour l’instant.</p><span>Créez « Codeur », « Illustrateur » ou « Architecte 3D » pour commencer.</span></div>}
      </div>
    </div>
    <p className="connect-foot">Les agents sont persistés dans PostgreSQL et exposés à tous les modules de JARVIS.</p>
    {open && <ModalShell title="Donner une mission à une IA." eyebrow="CRÉER UN AGENT IA" onClose={() => setOpen(false)}>
      <p className="modal-description">Définissez son nom, sa mission et les domaines d’outils auxquels il aura accès.</p>
      <form onSubmit={add} className="connect-form">
        <label className={label}>Nom de l’agent<input ref={nameRef} className={field} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="ex. Codeur" maxLength={40} required /></label>
        <label className={label}>Mission / prompt système<textarea className={field} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="ex. m’aide à écrire du code propre, testé et documenté" rows={3} maxLength={500} required /></label>
        <label className={label}>Outils autorisés <em>(séparés par des virgules)</em><input className={field} value={form.tools} onChange={e => setForm({ ...form, tools: e.target.value })} placeholder="mcp.blender, mcp.unity, skill.three" maxLength={300} /></label>
        {error && <p className="connect-error">{error}</p>}
        <div className="modal-footer"><span>PostgreSQL · table agents</span><button type="submit" className="primary-button" disabled={busy || !form.name.trim() || !form.role.trim()}>{busy ? <Loader2 size={14} className="spin" /> : <Bot size={14} />}{busy ? "Création…" : "Créer l’agent"}</button></div>
      </form>
    </ModalShell>}
  </div>;
}

export type { ChangeEvent };
