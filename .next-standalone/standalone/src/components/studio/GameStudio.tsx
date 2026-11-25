"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Bot, Box, Camera, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, CloudCheck, CloudOff, Code2, Copy, Download, Ellipsis, Expand, Eye, EyeOff, FileBox, FileJson, Film, Focus, Folder, FolderOpen, Gamepad2, Gem, Grid2X2, Grip, Hand, History, ImageIcon, Keyboard, Layers3, Lightbulb, LoaderCircle, LockKeyhole, Maximize2, Monitor, MousePointer2, Move3D, PanelLeftClose, Pause, Play, Plug, Plus, Redo2, Wrench, Rotate3D, Save, Scaling, Search, Settings2, SlidersHorizontal, Sparkles, Square, Sun, Terminal, Trash2, Triangle, Undo2, Upload, X, type LucideIcon } from "lucide-react";
import { ASSETS, createDefaultProject, makeObject, validateProject, type ObjectKind, type SceneObject, type SceneSettings, type StudioProject, type TransformTool, type Vec3 } from "@/lib/studio/scene";
import { AssetArt, InspectorPanel, ObjectIcon } from "./StudioPanels";
import { AgentsPanel, McpPanel, SkillsPanel } from "./StudioConnect";
import { ModalShell } from "./StudioModal";
import type { RenderStats, ViewportApi, ViewRequest } from "./StudioViewport";
import "./studio.css";

const StudioViewport = dynamic(() => import("./StudioViewport"), { ssr: false, loading: () => <div className="studio-render-loading"><div className="loading-orbit" /><span>Préparation de votre monde…</span></div> });
const LOCAL_KEY = "jarvis-studio-draft-v1";
type Modal = "export" | "assistant" | "help" | "project" | "assets" | null;
type Log = { id: number; time: string; text: string; type: "info" | "success" | "warning" };

function StudioLogo() {
  return <svg width="27" height="31" viewBox="0 0 27 31" fill="none" aria-hidden="true"><path d="m13.5 1 12 7v14l-12 7-12-7V8Z" stroke="currentColor" strokeWidth="1.6" /><path d="m1.5 8 12 7 12-7M13.5 15v14M7.5 4.5l12 7v7l-6 3.5-6-3.5v-7l12-7" stroke="currentColor" strokeWidth="1.2" /><path d="m7.5 11.5 6 3.5 6-3.5-6-3.5Z" fill="currentColor" /></svg>;
}

function IconButton({ icon: Icon, label, onClick, active, disabled = false, className = "" }: { icon: LucideIcon; label: string; onClick?: () => void; active?: boolean; disabled?: boolean; className?: string }) {
  return <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className={`icon-button ${active ? "active" : ""} ${className}`}><Icon size={16} strokeWidth={1.7} /></button>;
}

export function GameStudio() {
  const [project, setProject] = useState<StudioProject>(createDefaultProject);
  const projectRef = useRef(project); projectRef.current = project;
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>("portal-main");
  const [tool, setTool] = useState<TransformTool>("select");
  const [playState, setPlayState] = useState<"edit" | "playing" | "paused">("edit");
  const [inspectorTab, setInspectorTab] = useState<"object" | "world">("object");
  const [bottomTab, setBottomTab] = useState<"mcp" | "skills" | "agents" | "assets" | "console">("mcp");
  const [counts, setCounts] = useState({ mcp: 10, skills: 12, agents: 0 });
  const [category, setCategory] = useState("Tout");
  const [assetQuery, setAssetQuery] = useState("");
  const [query, setQuery] = useState("");
  const [farExpanded, setFarExpanded] = useState(false);
  const [worldExpanded, setWorldExpanded] = useState(true);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [zen, setZen] = useState(false);
  const [sidePanel, setSidePanel] = useState<"none" | "explorer" | "inspector">("none");
  const [modal, setModal] = useState<Modal>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "dirty" | "local">("saved");
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [historyTick, setHistoryTick] = useState(0);
  const [viewRequest, setViewRequest] = useState<ViewRequest>({ id: 0, type: "reset" });
  const [stats, setStats] = useState<RenderStats>({ fps: 0, triangles: 0, calls: 0, elapsed: 0, collected: 0, won: false });
  const [logs, setLogs] = useState<Log[]>([{ id: 0, time: "—", text: "Initialisation du moteur Three.js…", type: "info" }]);
  const [exportFormat, setExportFormat] = useState<"glb" | "json" | "png">("glb");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportImage, setExportImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [projectName, setProjectName] = useState(project.name);
  const [newProject, setNewProject] = useState(false);
  const [template, setTemplate] = useState<"aether" | "empty">("aether");
  const past = useRef<StudioProject[]>([]), future = useRef<StudioProject[]>([]);
  const saveChain = useRef(Promise.resolve());
  const savedFingerprint = useRef(JSON.stringify(project));
  const apiRef = useRef<ViewportApi | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const logId = useRef(1);

  const notify = useCallback((text: string, error = false) => setToast({ text, error }), []);
  const log = useCallback((text: string, type: Log["type"] = "info") => setLogs(prev => [...prev.slice(-79), { id: logId.current++, time: new Date().toLocaleTimeString("fr-FR"), text, type }]), []);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 4200); return () => clearTimeout(id); }, [toast]);

  useEffect(() => {
    let cancelled = false;
    let local: StudioProject | null = null;
    try { const raw = localStorage.getItem(LOCAL_KEY); if (raw) local = validateProject(JSON.parse(raw)); } catch { /* Storage may be unavailable in private browsing. */ }
    fetch("/api/studio/project", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Serveur indisponible");
      const data = await response.json();
      const remote = validateProject(data.project) ?? createDefaultProject();
      if (cancelled) return;
      const newerLocal = local && new Date(local.updatedAt ?? 0).getTime() > new Date(remote.updatedAt ?? 0).getTime();
      const chosen = newerLocal ? local! : remote;
      projectRef.current = chosen; setProject(chosen);
      savedFingerprint.current = JSON.stringify(remote);
      setSaveStatus(newerLocal ? "dirty" : "saved");
      log(newerLocal ? "Brouillon local restauré. Synchronisation en cours." : "Scène principale chargée. Votre espace est prêt.", "success");
    }).catch(() => {
      if (cancelled) return;
      if (local) { projectRef.current = local; setProject(local); }
      setSaveStatus("local"); log("Mode local activé. Vos modifications restent sur cet appareil.", "warning");
    }).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [log]);

  const commit = useCallback((next: StudioProject | ((previous: StudioProject) => StudioProject)) => {
    const previous = projectRef.current;
    const value = typeof next === "function" ? next(previous) : next;
    past.current = [...past.current.slice(-39), previous]; future.current = [];
    const changed = { ...value, updatedAt: new Date().toISOString() };
    projectRef.current = changed; setProject(changed); setHistoryTick(n => n + 1); setSaveStatus("dirty");
  }, []);

  const save = useCallback((manual = false) => {
    saveChain.current = saveChain.current.catch(() => {}).then(async () => {
      const snapshot = projectRef.current;
      const body = JSON.stringify(snapshot);
      if (body === savedFingerprint.current && !manual) return;
      setSaveStatus("saving");
      try { localStorage.setItem(LOCAL_KEY, body); } catch { /* Server saving still works. */ }
      try {
        const response = await fetch("/api/studio/project", { method: "PUT", headers: { "Content-Type": "application/json" }, body });
        if (!response.ok) throw new Error("Sauvegarde impossible");
        savedFingerprint.current = body;
        setSaveStatus(JSON.stringify(projectRef.current) === body ? "saved" : "dirty");
        if (manual) { notify("Votre monde est enregistré."); log("Projet sauvegardé dans PostgreSQL.", "success"); }
      } catch {
        setSaveStatus("local");
        if (manual) { notify("Serveur indisponible. Copie locale conservée.", true); log("Sauvegarde locale uniquement. Réessayez avec Ctrl + S.", "warning"); }
      }
    });
  }, [notify, log]);

  useEffect(() => {
    if (!loaded || JSON.stringify(project) === savedFingerprint.current) return;
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(project)); } catch { /* no-op */ }
    const id = window.setTimeout(() => save(), 1600);
    return () => window.clearTimeout(id);
  }, [project, loaded, save]);

  const undo = useCallback(() => {
    const previous = past.current.pop(); if (!previous) return;
    future.current.push(projectRef.current);
    const changed = { ...previous, updatedAt: new Date().toISOString() };
    projectRef.current = changed; setProject(changed); setHistoryTick(n => n + 1); setSaveStatus("dirty");
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop(); if (!next) return;
    past.current.push(projectRef.current);
    const changed = { ...next, updatedAt: new Date().toISOString() };
    projectRef.current = changed; setProject(changed); setHistoryTick(n => n + 1); setSaveStatus("dirty");
  }, []);

  const updateObject = useCallback((id: string, patch: Partial<SceneObject>) => commit(previous => ({ ...previous, objects: previous.objects.map(o => o.id === id ? { ...o, ...patch } : o) })), [commit]);
  const updateSettings = useCallback((patch: Partial<SceneSettings>) => commit(previous => ({ ...previous, settings: { ...previous.settings, ...patch } })), [commit]);
  const selectObject = useCallback((id: string | null) => { setSelectedId(id); if (id) { setInspectorTab("object"); if (window.innerWidth <= 900) setSidePanel("inspector"); } }, []);
  const requestView = useCallback((type: ViewRequest["type"]) => setViewRequest(previous => ({ id: previous.id + 1, type })), []);
  const readyCallback = useCallback(() => { setReady(true); }, []);
  const statsCallback = useCallback((value: RenderStats) => setStats(value), []);
  const selected = project.objects.find(o => o.id === selectedId) ?? null;

  const addObject = useCallback((kind: ObjectKind) => {
    const current = projectRef.current;
    if (current.objects.length >= 160) return notify("La scène contient déjà 160 objets.", true);
    const count = current.objects.filter(o => o.kind === kind).length + 1;
    const object = makeObject(kind, count);
    if (kind === "terrain") object.position = [8 + count, -1, -3];
    else { const a = count * 2.4; object.position = [Math.cos(a) * 3.5, .18, Math.sin(a) * 3.5]; }
    commit({ ...current, objects: [...current.objects, object] }); selectObject(object.id);
    notify(`${object.name} ajouté à la scène.`); log(`Nouvel objet : ${object.name}`, "success");
  }, [commit, notify, log, selectObject]);

  const duplicate = useCallback(() => {
    const object = projectRef.current.objects.find(o => o.id === selectedId);
    if (!object || projectRef.current.objects.length >= 160) return;
    const copy = { ...object, id: `${object.kind}-${crypto.randomUUID()}`, name: `${object.name.slice(0, 90)} · copie`, locked: false, position: [object.position[0] + 1.4, object.position[1], object.position[2] + .8] as Vec3 };
    commit(previous => ({ ...previous, objects: [...previous.objects, copy] })); selectObject(copy.id); log(`Objet dupliqué : ${object.name}`);
  }, [selectedId, commit, selectObject, log]);

  const remove = useCallback(() => {
    const object = projectRef.current.objects.find(o => o.id === selectedId); if (!object) return;
    if (object.locked) return notify("Déverrouillez cet objet dans l’inspecteur pour le supprimer.", true);
    commit(previous => ({ ...previous, objects: previous.objects.filter(o => o.id !== selectedId) })); setSelectedId(null); log(`Objet supprimé : ${object.name}`);
  }, [selectedId, commit, log, notify]);

  const startPlay = useCallback(() => { setStats(previous => ({ ...previous, elapsed: 0, collected: 0, won: false })); setSidePanel("none"); setPlayState("playing"); setMenu(null); log("Exploration lancée. Collectez les cristaux, puis rejoignez le portail.", "success"); }, [log]);
  const stopPlay = useCallback(() => { setPlayState("edit"); requestView("reset"); log("Retour à l’éditeur. La scène d’origine est préservée."); }, [requestView, log]);

  const openProject = useCallback((fresh = false) => { setProjectName(fresh ? "Mon nouveau monde" : projectRef.current.name); setNewProject(fresh); setModal("project"); setMenu(null); }, []);
  const openExport = useCallback(() => { try { setExportImage(apiRef.current?.screenshot() ?? null); } catch { setExportImage(null); } setModal("export"); setMenu(null); }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]");
      if (e.key === "Escape") { if (modal) { setModal(null); return; } setMenu(null); setSidePanel("none"); if (playState !== "edit") stopPlay(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(true); return; }
      if (typing || modal) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); return; }
      if (playState !== "edit") return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
        if (e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
        if (e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(); }
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(); }
      if (e.key.toLowerCase() === "v") setTool("select");
      if (e.key.toLowerCase() === "w") setTool("translate");
      if (e.key.toLowerCase() === "e") setTool("rotate");
      if (e.key.toLowerCase() === "r") setTool("scale");
      if (e.key.toLowerCase() === "f") requestView("focus");
      if (e.key.toLowerCase() === "g") updateSettings({ grid: !projectRef.current.settings.grid });
      if (e.key === " ") { e.preventDefault(); startPlay(); }
      if (e.key === "?") setModal("help");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [modal, playState, save, undo, redo, duplicate, remove, requestView, startPlay, stopPlay, updateSettings]);

  useEffect(() => {
    if (!menu) return;
    const click = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest("[data-menu-trigger]")) setMenu(null); };
    window.addEventListener("mousedown", click);
    return () => window.removeEventListener("mousedown", click);
  }, [menu]);

  const importProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 500_000) throw new Error("Ce fichier dépasse la limite de 500 Ko.");
      const value = validateProject(JSON.parse(await file.text()));
      if (!value) throw new Error("Ce fichier n’est pas un projet JARVIS valide.");
      commit(value); setSelectedId(value.objects[0]?.id ?? null); requestView("reset"); notify(`Projet « ${value.name} » importé.`); log(`Projet importé : ${file.name}`, "success");
    } catch (error) { notify(error instanceof Error ? error.message : "Le fichier ne peut pas être lu.", true); }
    event.target.value = "";
  };

  const download = (blob: Blob, name: string) => { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const exportProject = async () => {
    setExportBusy(true);
    const name = project.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/-$/, "");
    try {
      if (exportFormat === "json") download(new Blob([JSON.stringify(projectRef.current, null, 2)], { type: "application/json" }), `${name}.jarvis.json`);
      else if (exportFormat === "png") { const data = apiRef.current?.screenshot(); if (!data) throw new Error("Le rendu n’est pas encore prêt."); const response = await fetch(data); download(await response.blob(), `${name}.png`); }
      else { if (!apiRef.current) throw new Error("Le rendu n’est pas encore prêt."); download(new Blob([await apiRef.current.exportGlb()], { type: "model/gltf-binary" }), `${name}.glb`); }
      log(`Export ${exportFormat.toUpperCase()} terminé.`, "success"); notify("Export terminé. À vous de jouer."); setModal(null);
    } catch (error) { notify(error instanceof Error ? error.message : "L’export a échoué.", true); }
    finally { setExportBusy(false); }
  };

  const createWithJarvis = (text = prompt) => {
    const clean = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const words: Partial<Record<ObjectKind, string>> = { tree: "arbres?|trees?|foret", rock: "rochers?|roches?|rocks?", crystal: "crista(?:l|ux)|crystals?", portal: "portails?|portals?", light: "lumieres?|lights?|lampes?", platform: "dalles?|plateformes?|platforms?", terrain: "iles?|islands?", spawn: "depart|spawn|joueur" };
    const counts: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8 };
    const additions: SceneObject[] = [];
    for (const [kind, word] of Object.entries(words)) {
      if (!new RegExp(`\\b(?:${word})\\b`).test(clean)) continue;
      const countMatch = clean.match(new RegExp(`(\\d+|un|une|deux|trois|quatre|cinq|six|sept|huit)\\s+(?:${word})\\b`));
      const count = Math.min(8, countMatch ? (counts[countMatch[1]] ?? Number(countMatch[1])) : clean.includes("foret") && kind === "tree" ? 5 : 1);
      for (let i = 0; i < count; i++) {
        const index = additions.length + 1, a = index * 2.4 + projectRef.current.objects.length, r = 2.8 + (i % 3) * .65;
        const object = makeObject(kind as ObjectKind, projectRef.current.objects.filter(o => o.kind === kind).length + i + 1, kind === "terrain" ? [9 + i * 5, -1, -5] : [Math.cos(a) * r, .18, Math.sin(a) * r]);
        if (kind === "tree") object.scale = [.65 + (i % 3) * .15, .75 + (i % 3) * .15, .65 + (i % 3) * .15];
        additions.push(object);
      }
    }
    const environment = /nuit|nocturne|crepuscule/.test(clean) ? "night" : /jour|soleil|matin/.test(clean) ? "day" : /coucher|doree/.test(clean) ? "sunset" : null;
    if (!additions.length && !environment) return notify("Essayez « Ajoute trois arbres et deux cristaux » ou « Passe en ambiance nocturne ».", true);
    const limited = additions.slice(0, Math.min(20, 160 - projectRef.current.objects.length));
    commit(previous => ({ ...previous, objects: [...previous.objects, ...limited], settings: { ...previous.settings, ...(environment ? { environment } : {}) } }));
    if (limited[0]) selectObject(limited[0].id);
    if (environment) setInspectorTab("world");
    log(`JARVIS : ${limited.length} objet(s) ajouté(s)${environment ? ", ambiance mise à jour" : ""}.`, "success");
    notify(limited.length ? `${limited.length} objet${limited.length > 1 ? "s" : ""} ajouté${limited.length > 1 ? "s" : ""}. Votre monde prend forme.` : "La lumière de votre monde a changé.");
    setPrompt(""); setModal(null);
  };

  const filteredAssets = ASSETS.filter(a => (category === "Tout" || a.category === category) && a.name.toLowerCase().includes(assetQuery.toLowerCase()));
  const sceneObjects = project.objects.filter(o => !o.id.startsWith("island-far"));
  const farObjects = project.objects.filter(o => o.id.startsWith("island-far"));
  const totalCrystals = project.objects.filter(o => o.kind === "crystal" && o.visible).length;
  const renderObjectRow = (object: SceneObject) => <div key={object.id} className={`scene-tree-row ${object.id === selectedId ? "selected" : ""} ${!object.visible ? "object-hidden" : ""}`}><button className="object-select" onClick={() => selectObject(object.id)} onDoubleClick={() => { selectObject(object.id); requestView("focus"); }}><span className="tree-branch" /><ObjectIcon kind={object.kind} /><span>{object.name}</span></button>{object.locked ? <LockKeyhole size={10} className="tree-lock" /> : null}<button className="tree-eye" aria-label={object.visible ? `Masquer ${object.name}` : `Afficher ${object.name}`} onClick={() => updateObject(object.id, { visible: !object.visible })}>{object.visible ? <Eye size={12} /> : <EyeOff size={12} />}</button></div>;
  const menuAction = (fn: () => void) => () => { fn(); setMenu(null); };
  void historyTick;

  return <main ref={shellRef} className={`game-studio mobile-panel-${sidePanel} ${zen ? "studio-zen" : ""} ${!explorerOpen ? "explorer-closed" : ""}`} data-playing={playState !== "edit"}>
    <input hidden ref={fileRef} type="file" accept=".json,application/json" onChange={importProject} />
    <header className="studio-header">
      <Link href="/" className="studio-brand" aria-label="JARVIS Studio, accueil"><span className="brand-mark"><StudioLogo /></span><strong>JARVIS<span>STUDIO</span></strong><span className="brand-edition">3D</span></Link>
      <div className="header-divider" />
      <button className="project-switch" onClick={() => openProject()}><span className="project-symbol"><Box size={14} /></span><span>{project.name}</span><ChevronDown size={12} /></button>
      <span className="personal-project">Projet personnel</span>
      <div className="header-spacer" />
      <button className={`save-indicator save-${saveStatus}`} onClick={() => save(true)} title="Enregistrer le projet · Ctrl + S">{saveStatus === "saving" ? <LoaderCircle size={14} className="spin" /> : saveStatus === "local" ? <CloudOff size={15} /> : <CloudCheck size={15} />}<span>{saveStatus === "saving" ? "Enregistrement…" : saveStatus === "dirty" ? "Modifications en cours" : saveStatus === "local" ? "Sauvegarde locale" : "Tout est enregistré"}</span></button>
      <div className="header-history"><IconButton icon={Undo2} label="Annuler · Ctrl + Z" onClick={undo} disabled={!past.current.length || playState !== "edit"} /><IconButton icon={Redo2} label="Rétablir · Ctrl + Maj + Z" onClick={redo} disabled={!future.current.length || playState !== "edit"} /></div>
      <button className="studio-export-button" onClick={openExport}><Upload size={14} /><span>Exporter</span><ChevronDown size={11} /></button>
      {playState !== "edit" && <IconButton icon={playState === "playing" ? Pause : Play} label={playState === "playing" ? "Mettre en pause" : "Reprendre"} onClick={() => setPlayState(playState === "playing" ? "paused" : "playing")} />}
      <button className={`studio-play-button ${playState !== "edit" ? "playing" : ""}`} onClick={playState === "edit" ? startPlay : stopPlay} disabled={!ready}>{playState === "edit" ? <Play size={13} fill="currentColor" /> : <Square size={12} fill="currentColor" />}<span>{playState === "edit" ? "Lancer le jeu" : "Arrêter"}</span><kbd>{playState === "edit" ? "⌁" : "ESC"}</kbd></button>
      <button className="studio-avatar" title="Paramètres du projet" onClick={() => openProject()}>JD</button>
    </header>

    <div className="studio-menubar"><nav>{["Fichier", "Édition", "Affichage"].map(label => <button key={label} data-menu-trigger className={menu === label ? "active" : ""} onClick={() => setMenu(menu === label ? null : label)}>{label}</button>)}<button onClick={() => setModal("help")}>Aide</button></nav><div className="workspace-breadcrumb"><FolderOpen size={12} /><span>Espace de création</span><ChevronRight size={10} /><strong>Scène principale</strong></div><div className="engine-ready"><span className={ready ? "status-dot" : "status-dot pending"} />{ready ? "Moteur opérationnel" : "Initialisation du moteur"}<span className="engine-version">v2.0</span></div>
      {menu && ["Fichier", "Édition", "Affichage", "add", "view", "render"].includes(menu) && <div ref={menuRef} className={`studio-dropdown dropdown-${menu}`}>
        {menu === "Fichier" && <><button onClick={menuAction(() => openProject(true))}><Plus size={14} />Nouveau monde<kbd>+</kbd></button><button onClick={menuAction(() => fileRef.current?.click())}><FolderOpen size={14} />Importer un projet<kbd>JSON</kbd></button><button onClick={menuAction(() => save(true))}><Save size={14} />Enregistrer<kbd>⌘ S</kbd></button><hr /><button onClick={menuAction(openExport)}><Download size={14} />Exporter la scène<ArrowUpRight size={12} /></button></>}
        {menu === "Édition" && <><button disabled={!past.current.length} onClick={menuAction(undo)}><Undo2 size={14} />Annuler<kbd>⌘ Z</kbd></button><button disabled={!future.current.length} onClick={menuAction(redo)}><Redo2 size={14} />Rétablir<kbd>⇧ ⌘ Z</kbd></button><hr /><button disabled={!selected} onClick={menuAction(duplicate)}><Copy size={14} />Dupliquer<kbd>⌘ D</kbd></button><button disabled={!selected} onClick={menuAction(remove)}><Trash2 size={14} />Supprimer<kbd>SUPPR</kbd></button></>}
        {(menu === "Affichage" || menu === "view") && <><button onClick={menuAction(() => requestView("reset"))}><Box size={14} />Perspective<Check size={12} /></button><button onClick={menuAction(() => requestView("top"))}><Grid2X2 size={14} />Vue de dessus</button><button onClick={menuAction(() => requestView("front"))}><Square size={14} />Vue de face</button><hr /><button onClick={menuAction(() => requestView("focus"))}><Focus size={14} />Cadrer la sélection<kbd>F</kbd></button><button onClick={menuAction(() => updateSettings({ grid: !project.settings.grid }))}><Grid2X2 size={14} />Grille de travail{project.settings.grid && <Check size={12} />}</button><button onClick={menuAction(() => setZen(v => !v))}><Expand size={14} />Mode concentration</button></>}
        {menu === "render" && <><button onClick={menuAction(() => { setInspectorTab("world"); updateSettings({ environment: "sunset" }); })}><Sun size={14} />Heure dorée</button><button onClick={menuAction(() => { setInspectorTab("world"); updateSettings({ environment: "day" }); })}><Sun size={14} />Jour clair</button><button onClick={menuAction(() => { setInspectorTab("world"); updateSettings({ environment: "night" }); })}><Sparkles size={14} />Crépuscule</button><hr /><button onClick={menuAction(() => updateSettings({ grid: !project.settings.grid }))}><Grid2X2 size={14} />{project.settings.grid ? "Masquer" : "Afficher"} la grille</button></>}
        {menu === "add" && <><div className="dropdown-label">AJOUTER À LA SCÈNE</div>{ASSETS.map(a => <button key={a.kind} onClick={menuAction(() => addObject(a.kind))}><ObjectIcon kind={a.kind} />{a.name}<Plus size={11} /></button>)}</>}
      </div>}
    </div>

    <div className="studio-workspace">
      <aside className="studio-activity"><div><button className="activity-button active" aria-label="Explorateur de scène" title="Explorateur de scène" onClick={() => { if (window.innerWidth <= 900) setSidePanel(v => v === "explorer" ? "none" : "explorer"); else setExplorerOpen(v => !v); }}><Layers3 size={20} strokeWidth={1.65} /><span /></button><button className="activity-button" aria-label="Bibliothèque de ressources" title="Bibliothèque de ressources" onClick={() => { setModal("assets"); setCategory("Tout"); }}><ShapesIcon /></button><button className="activity-button" aria-label="Connexions MCP" title="Connexions MCP" onClick={() => { setBottomTab("mcp"); setZen(false); }}><Plug size={20} strokeWidth={1.5} /></button><button className="activity-button" aria-label="Skills" title="Skills" onClick={() => { setBottomTab("skills"); setZen(false); }}><Wrench size={19} strokeWidth={1.5} /></button><button className="activity-button" aria-label="Agents IA" title="Agents IA" onClick={() => { setBottomTab("agents"); setZen(false); }}><Bot size={19} strokeWidth={1.5} /></button><button className="activity-button" aria-label="Environnement" title="Environnement et éclairage" onClick={() => { setInspectorTab("world"); setSidePanel("inspector"); }}><Sun size={20} strokeWidth={1.5} /></button><span className="activity-divider" /><button className="activity-button jarvis-activity" aria-label="Créer avec JARVIS" title="Créer avec JARVIS" onClick={() => setModal("assistant")}><Sparkles size={20} strokeWidth={1.6} /></button></div><div><Link className="activity-button" aria-label="Ouvrir l’assistant JARVIS" title="Assistant JARVIS" href="/assistant"><Bot size={20} strokeWidth={1.5} /></Link><button className="activity-button" title="Raccourcis clavier" aria-label="Aide et raccourcis" onClick={() => setModal("help")}><CircleHelp size={19} strokeWidth={1.5} /></button><button className="activity-button" title="Paramètres du projet" aria-label="Paramètres du projet" onClick={() => openProject()}><Settings2 size={19} strokeWidth={1.5} /></button></div></aside>

      <aside className="studio-explorer"><div className="panel-title"><h2>Explorateur</h2><div><IconButton icon={Plus} label="Ajouter un objet" onClick={() => setModal("assets")} /><IconButton icon={PanelLeftClose} label="Masquer l’explorateur" onClick={() => { setExplorerOpen(false); setSidePanel("none"); }} /></div></div><div className="explorer-tabs"><button className="active">Scène</button><button onClick={() => openProject()}>Projet</button><span>{project.objects.length}</span></div><div className="explorer-search"><Search size={13} /><input ref={searchRef} aria-label="Rechercher dans la scène" placeholder="Rechercher un objet…" value={query} onChange={e => setQuery(e.target.value)} /><kbd>⌘ K</kbd></div>
        <div className="scene-tree studio-scroll">
          <div className="scene-root"><ChevronDown size={12} /><Box size={14} /><strong>Scène principale</strong><span className="root-dot" /></div>
          {!query && <><button className="tree-folder" onClick={() => setInspectorTab("world")}><ChevronRight size={11} /><Sun size={14} /><span>Environnement</span><span className="folder-count">3</span></button><button className="tree-folder world-folder" onClick={() => setWorldExpanded(v => !v)}>{worldExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}<FolderOpen size={14} /><span>Monde d’Éther</span><span className="folder-count">{sceneObjects.length}</span></button></>}
          {(query ? project.objects.filter(o => o.name.toLowerCase().includes(query.toLowerCase())) : worldExpanded ? sceneObjects : []).map(renderObjectRow)}
          {query && !project.objects.some(o => o.name.toLowerCase().includes(query.toLowerCase())) && <p className="no-results">Aucun objet trouvé.</p>}
          {!query && farObjects.length > 0 && <><button className="tree-folder far-folder" onClick={() => setFarExpanded(v => !v)}>{farExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}<Folder size={14} /><span>Îles lointaines</span><span className="folder-count">{farObjects.length}</span></button>{farExpanded && farObjects.map(renderObjectRow)}</>}
          <button className="tree-add" onClick={() => setModal("assets")}><Plus size={12} /> Ajouter un objet</button>
        </div>
        <div className="explorer-project"><div className="project-cover"><AssetArt kind="terrain" /><span className="project-cover-label">VOTRE UNIVERS, SANS LIMITES.</span></div><div className="project-card-meta"><span><strong>{project.name}</strong><small>Exploration · Fantastique</small></span><IconButton icon={Ellipsis} label="Détails du projet" onClick={() => openProject()} /></div><div className="project-card-bottom"><span className="status-dot" /><span>Scène principale</span><span>01</span></div></div>
      </aside>

      <section className="studio-center"><div className="scene-tabs"><button className={playState === "edit" ? "active" : ""} onClick={() => { if (playState !== "edit") stopPlay(); }}><Box size={13} /><span>Scène principale</span><i /></button><button className={playState !== "edit" ? "active" : ""} onClick={() => { if (playState === "edit") startPlay(); }}><Gamepad2 size={14} /><span>Aperçu du jeu</span></button><div className="scene-tab-spacer" /><IconButton className="mobile-properties" icon={SlidersHorizontal} label="Afficher l’inspecteur" onClick={() => setSidePanel(v => v === "inspector" ? "none" : "inspector")} /><IconButton icon={Camera} label="Capturer la scène" onClick={() => { setExportFormat("png"); openExport(); }} /><IconButton icon={zen ? PanelLeftClose : Maximize2} label={zen ? "Quitter le mode concentration" : "Mode concentration"} onClick={() => setZen(v => !v)} /></div>
        <div className="studio-viewport" role="region" aria-label="Scène 3D interactive : îles flottantes et portail d’Éther">
          <StudioViewport objects={project.objects} settings={project.settings} selectedId={selectedId} tool={tool} playState={playState} viewRequest={viewRequest} apiRef={apiRef} onSelect={selectObject} onTransform={updateObject} onStats={statsCallback} onReady={readyCallback} />
          <div className="viewport-topbar"><div className="viewport-select-group"><button data-menu-trigger onClick={() => setMenu(menu === "view" ? null : "view")}><Box size={12} />Perspective<ChevronDown size={10} /></button><span /><button data-menu-trigger onClick={() => setMenu(menu === "render" ? null : "render")}><Sun size={12} />Éclairé<ChevronDown size={10} /></button></div><div className="live-render"><span />Rendu temps réel</div></div>
          {playState === "edit" && <div className="viewport-tools">{([{ key: "select", icon: MousePointer2, label: "Sélectionner · V" }, { key: "translate", icon: Move3D, label: "Déplacer · W" }, { key: "rotate", icon: Rotate3D, label: "Rotation · E" }, { key: "scale", icon: Scaling, label: "Échelle · R" }] as const).map(t => <IconButton key={t.key} icon={t.icon} label={t.label} active={tool === t.key} onClick={() => setTool(t.key)} />)}<span /><IconButton icon={Grid2X2} label="Grille de travail · G" active={project.settings.grid} onClick={() => updateSettings({ grid: !project.settings.grid })} /><IconButton icon={Focus} label="Cadrer la sélection · F" onClick={() => requestView("focus")} /></div>}
          <div className="viewport-world-label"><span><i /> {playState === "edit" ? "UN MONDE À INVENTER" : "À VOUS D’EXPLORER"}</span><h1>{project.name}</h1><p>{playState === "edit" ? "Imaginez. Construisez. Donnez vie." : "Collectez les cristaux et rejoignez le portail."}</p></div>
          <div className="viewport-axis"><button className="axis-y" title="Vue de dessus" onClick={() => requestView("top")}>Y</button><button className="axis-z" title="Vue en perspective" onClick={() => requestView("reset")}>Z</button><button className="axis-x" title="Vue de face" onClick={() => requestView("front")}>X</button><span /><small>Persp</small></div>
          <div className="viewport-hints"><MousePointer2 size={10} /><span>{playState === "edit" ? "Glisser pour orbiter" : "ZQSD / WASD pour explorer"}</span><i /><span>{playState === "edit" ? "Molette pour zoomer" : "Espace pour sauter"}</span></div>
          <span className="viewport-fps"><i />{stats.fps || "—"} <small>FPS</small></span>
          {playState !== "edit" && <div className="game-hud"><span><Gem size={16} />{stats.collected} / {totalCrystals}<small>CRISTAUX</small></span><span className="game-time">{Math.floor(stats.elapsed / 60).toString().padStart(2, "0")}:{Math.floor(stats.elapsed % 60).toString().padStart(2, "0")}</span>{playState === "paused" && <b>EN PAUSE</b>}</div>}
          {playState === "playing" && !stats.won && <div className="touch-game-controls"><div className="touch-direction-pad"><TouchKey value="ArrowUp" label="Avancer" className="touch-up">↑</TouchKey><TouchKey value="ArrowLeft" label="Aller à gauche" className="touch-left">←</TouchKey><TouchKey value="ArrowDown" label="Reculer" className="touch-down">↓</TouchKey><TouchKey value="ArrowRight" label="Aller à droite" className="touch-right">→</TouchKey></div><TouchKey value=" " label="Sauter" className="touch-jump">Saut</TouchKey></div>}
          {playState !== "edit" && stats.won && <div className="victory-overlay"><div><Sparkles size={28} /><span>EXPLORATION TERMINÉE</span><h2>L’Éther vous appartient.</h2><p>Tous les cristaux retrouvés en {stats.elapsed.toFixed(1)} secondes.</p><button className="studio-play-button" onClick={stopPlay}><ArrowLeft size={14} />Retour à la création</button></div></div>}
        </div>
        <section className="studio-library"><div className="library-header"><div className="library-tabs"><button className={bottomTab === "mcp" ? "active" : ""} onClick={() => setBottomTab("mcp")}><Plug size={13} />MCP<span>{counts.mcp}</span></button><button className={bottomTab === "skills" ? "active" : ""} onClick={() => setBottomTab("skills")}><Wrench size={13} />Skills<span>{counts.skills}</span></button><button className={bottomTab === "agents" ? "active" : ""} onClick={() => setBottomTab("agents")}><Bot size={13} />Agents<span>{counts.agents}</span></button><button className={bottomTab === "assets" ? "active" : ""} onClick={() => setBottomTab("assets")}><FolderOpen size={13} />Bibliothèque<span>{ASSETS.length}</span></button><button className={bottomTab === "console" ? "active" : ""} onClick={() => setBottomTab("console")}><Terminal size={13} />Console{logs.some(l => l.type === "warning") && <i />}</button></div><div className="library-actions"><button onClick={() => fileRef.current?.click()}><Upload size={12} /><span>Importer une scène</span></button><button className="create-resource" onClick={() => setModal("assets")}><Plus size={12} />Créer</button></div></div>
          {bottomTab === "mcp" ? <McpPanel notify={notify} log={log} onCounts={n => setCounts(c => ({ ...c, mcp: n }))} /> : bottomTab === "skills" ? <SkillsPanel notify={notify} log={log} onCounts={n => setCounts(c => ({ ...c, skills: n }))} /> : bottomTab === "agents" ? <AgentsPanel notify={notify} log={log} onCounts={n => setCounts(c => ({ ...c, agents: n }))} /> : bottomTab === "assets" ? <><div className="library-filterbar"><div className="library-crumb"><Folder size={11} />Ressources<ChevronRight size={10} /><strong>{category === "Tout" ? "Tout" : category}</strong></div><div className="asset-filters">{["Tout", "Végétation", "Nature", "Architecture"].map(c => <button key={c} className={category === c ? "active" : ""} onClick={() => setCategory(c)}>{c}</button>)}</div><label className="asset-search"><Search size={11} /><input aria-label="Rechercher des ressources" placeholder="Rechercher…" value={assetQuery} onChange={e => setAssetQuery(e.target.value)} /></label><IconButton icon={SlidersHorizontal} label="Afficher toutes les catégories" onClick={() => setModal("assets")} /></div><div className="asset-grid studio-scroll">{filteredAssets.map(asset => <button key={asset.kind} className="asset-card" disabled={playState !== "edit"} title={`Ajouter : ${asset.name}`} onClick={() => addObject(asset.kind)}><div className="asset-card-visual"><AssetArt kind={asset.kind} />{asset.tag && <span className={`asset-tag tag-${asset.kind}`}>{asset.tag}</span>}<span className="asset-add"><Plus size={15} /></span><Box size={10} className="asset-cube" /></div><div className="asset-card-info"><strong>{asset.name}</strong><small>{asset.category}<span>3D</span></small></div></button>)}{!filteredAssets.length && <p className="no-assets">Aucune ressource pour cette recherche.</p>}</div></> : <div className="studio-console studio-scroll"><div className="console-title"><span><span className="status-dot" />Journal du moteur</span><button onClick={() => setLogs([])}><Trash2 size={11} />Effacer</button></div>{logs.map(entry => <div key={entry.id} className={`console-entry log-${entry.type}`}><time>{entry.time}</time><span>{entry.type === "success" ? "✓" : entry.type === "warning" ? "!" : "›"}</span><p>{entry.text}</p></div>)}{!logs.length && <p className="console-empty">Le journal est vide. Tout est prêt pour la suite.</p>}</div>}
        </section>
      </section>
      <InspectorPanel onClose={() => setSidePanel("none")} object={selected} settings={project.settings} tab={inspectorTab} onTab={setInspectorTab} onUpdate={patch => { if (selectedId) updateObject(selectedId, patch); }} onSettings={updateSettings} onFocus={() => requestView("focus")} onAssistant={() => setModal("assistant")} />
    </div>

    <footer className="studio-statusbar"><div><span className="status-dot" /><strong>JARVIS ENGINE</strong><span className="status-divider" /><span>{project.objects.length} objets</span><span className="status-divider" /><Triangle size={10} /><span>{new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(stats.triangles)} triangles</span><span className="status-calls">{stats.calls} draw calls</span></div><div><span className="status-help"><Lightbulb size={11} />Un double-clic dans l’explorateur cadre l’objet.</span><button onClick={() => { setInspectorTab("world"); setSidePanel("inspector"); }}>{stats.adaptive ? "Rendu adaptatif" : project.settings.quality === "high" ? "Haute qualité" : "Équilibré"}<ChevronDown size={10} /></button><span className="status-divider" /><span>WebGL 2</span><CheckCheck size={12} /></div></footer>

    {toast && <div className={`studio-toast ${toast.error ? "toast-error" : ""}`} role="status">{toast.error ? <CloudOff size={16} /> : <Check size={16} />}<span>{toast.text}</span><button aria-label="Fermer la notification" onClick={() => setToast(null)}><X size={13} /></button></div>}

    {modal === "export" && <ModalShell title="Prêt à sortir de l’atelier ?" eyebrow="EXPORTER VOTRE CRÉATION" onClose={() => setModal(null)}><p className="modal-description">Votre monde, dans le format qui vous ressemble.</p>{exportImage && <div className="export-preview"><img src={exportImage} alt="Aperçu actuel de votre scène 3D" /><span><Box size={12} />{project.name}</span></div>}<div className="export-formats">{([{ id: "glb", Icon: FileBox, title: "Modèle 3D", sub: ".glb · Compatible Blender, Unity, Godot" }, { id: "json", Icon: FileJson, title: "Projet JARVIS", sub: ".json · Scène complète et rééditable" }, { id: "png", Icon: ImageIcon, title: "Capture du rendu", sub: ".png · Votre point de vue, en image" }] as const).map(format => <button key={format.id} className={exportFormat === format.id ? "active" : ""} onClick={() => setExportFormat(format.id)}><format.Icon size={19} /><span><strong>{format.title}</strong><small>{format.sub}</small></span><span className="radio-indicator">{exportFormat === format.id && <span />}</span></button>)}</div>{exportFormat === "glb" && <p className="export-note">Géométrie, éclairages et matériaux PBR inclus. Le shader animé du portail est converti en matériau standard.</p>}<div className="modal-footer"><span>Votre projet reste dans le studio.</span><button className="primary-button" onClick={exportProject} disabled={exportBusy || (!ready && exportFormat !== "json")}>{exportBusy ? <LoaderCircle size={14} className="spin" /> : <Download size={14} />}{exportBusy ? "Export en cours…" : "Exporter"}</button></div></ModalShell>}

    {modal === "assistant" && <ModalShell title="Votre intention. Votre monde." eyebrow="CRÉER AVEC JARVIS" onClose={() => setModal(null)}><div className="jarvis-modal-art"><Sparkles size={27} /><span>Un peu d’imagination.<br /><strong>Beaucoup de possibilités.</strong></span></div><p className="modal-description">Décrivez les éléments de la bibliothèque à ajouter, ou changez l’ambiance de votre scène.</p><textarea className="jarvis-prompt" aria-label="Décrivez votre scène" placeholder="Ajoute trois arbres, deux cristaux et une lumière douce…" value={prompt} onChange={e => setPrompt(e.target.value)} rows={4} maxLength={600} /><div className="prompt-suggestions">{["Ajoute trois arbres et deux rochers", "Deux cristaux et un portail", "Passe en ambiance nocturne"].map(suggestion => <button key={suggestion} onClick={() => setPrompt(suggestion)}><Plus size={11} />{suggestion}</button>)}</div><div className="modal-footer"><span>Construction locale · sans clé API</span><button className="primary-button" disabled={!prompt.trim()} onClick={() => createWithJarvis()}><Sparkles size={14} />Donner vie<ArrowRight size={13} /></button></div></ModalShell>}

    {modal === "help" && <ModalShell title="Gardez le rythme créatif." eyebrow="LES BONS RACCOURCIS" onClose={() => setModal(null)}><div className="shortcut-list">{[["Sélectionner", "V"], ["Déplacer / Rotation / Échelle", "W / E / R"], ["Cadrer la sélection", "F"], ["Afficher la grille", "G"], ["Annuler / Rétablir", "⌘ Z / ⇧ ⌘ Z"], ["Dupliquer la sélection", "⌘ D"], ["Enregistrer le projet", "⌘ S"], ["Lancer le jeu / Quitter", "ESPACE / ÉCHAP"], ["Explorer dans le jeu", "ZQSD / WASD / FLÈCHES"], ["Sauter dans le jeu", "ESPACE"]].map(([name, shortcut]) => <div key={name}><span>{name}</span><kbd>{shortcut}</kbd></div>)}</div><p className="help-note"><Hand size={15} />Clic gauche pour orbiter · Clic droit pour déplacer la vue · Molette pour zoomer. Sous Windows et Linux, utilisez Ctrl à la place de ⌘.</p><div className="modal-footer"><Link href="/assistant"><Bot size={14} />L’assistant JARVIS<ArrowUpRight size={12} /></Link><button className="primary-button" onClick={() => setModal(null)}>C’est parti<ArrowRight size={13} /></button></div></ModalShell>}

    {modal === "project" && <ModalShell title={newProject ? "Tout commence par une idée." : "Un monde à votre nom."} eyebrow={newProject ? "NOUVEAU PROJET" : "PARAMÈTRES DU PROJET"} onClose={() => setModal(null)}><p className="modal-description">{newProject ? "Choisissez votre point de départ. Le monde actuel sera remplacé ; exportez-le pour en garder une copie." : "Les modifications de votre scène sont sauvegardées automatiquement."}</p><label className="modal-input-label">Nom du projet<input value={projectName} onChange={e => setProjectName(e.target.value)} maxLength={100} placeholder="Le nom de votre prochain univers" /></label>{newProject ? <div className="project-templates"><button className={template === "aether" ? "active" : ""} onClick={() => setTemplate("aether")}><AssetArt kind="terrain" /><strong>Les îles d’Éther</strong><small>Un monde prêt à explorer</small></button><button className={template === "empty" ? "active" : ""} onClick={() => setTemplate("empty")}><div className="empty-template"><Grid2X2 size={35} /></div><strong>Votre terrain de jeu</strong><small>Une île. Toutes vos idées.</small></button></div> : <div className="project-details"><span><Box size={14} />{project.objects.length} objets dans la scène</span><span><CloudCheck size={14} />Sauvegarde PostgreSQL + copie locale</span><span><History size={14} />{past.current.length} actions dans l’historique</span></div>}<div className="modal-footer">{!newProject ? <button className="text-button" onClick={() => { setNewProject(true); setProjectName("Mon nouveau monde"); }}><Plus size={13} />Nouveau monde</button> : <span>Créez quelque chose d’unique.</span>}<button className="primary-button" disabled={!projectName.trim()} onClick={() => { if (newProject) { const next = createDefaultProject(); next.name = projectName.trim(); if (template === "empty") next.objects = next.objects.filter(o => o.id === "island-main" || o.kind === "spawn"); commit(next); selectObject(next.objects[0]?.id ?? null); requestView("reset"); log(`Nouveau projet : ${next.name}`, "success"); } else commit(previous => ({ ...previous, name: projectName.trim() })); setModal(null); notify(newProject ? "Votre nouveau monde est prêt." : "Le projet a été renommé."); }}>{newProject ? <Plus size={14} /> : <Check size={14} />}{newProject ? "Créer le monde" : "Enregistrer"}</button></div></ModalShell>}

    {modal === "assets" && <ModalShell title="Les briques de votre imagination." eyebrow="BIBLIOTHÈQUE DE RESSOURCES" onClose={() => setModal(null)} wide><p className="modal-description">Des objets procéduraux, prêts à prendre place dans votre univers.</p><div className="modal-asset-filters">{["Tout", "Terrains", "Végétation", "Nature", "Architecture", "Lumières", "Gameplay"].map(c => <button className={category === c ? "active" : ""} key={c} onClick={() => setCategory(c)}>{c}</button>)}</div><div className="modal-assets-grid">{ASSETS.filter(a => category === "Tout" || a.category === category).map(asset => <button className="asset-card" key={asset.kind} onClick={() => { addObject(asset.kind); setModal(null); }}><div className="asset-card-visual"><AssetArt kind={asset.kind} />{asset.tag && <span className="asset-tag">{asset.tag}</span>}<span className="asset-add"><Plus size={15} /></span></div><div className="asset-card-info"><strong>{asset.name}</strong><small>{asset.category}<span>3D</span></small></div></button>)}</div><div className="modal-footer"><span><Box size={13} />100 % procédural · Aucune ressource externe</span><button className="text-button" onClick={() => { setModal(null); fileRef.current?.click(); }}><Upload size={13} />Importer un projet</button></div></ModalShell>}
  </main>;
}

function ShapesIcon() { return <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true"><path d="m6 2 4.5 7h-9L6 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><rect x="2" y="13" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.4" /><circle cx="16.5" cy="16.5" r="3.5" stroke="currentColor" strokeWidth="1.4" /><circle cx="16.5" cy="5.5" r="3.5" stroke="currentColor" strokeWidth="1.4" /></svg>; }

function TouchKey({ value, label, className, children }: { value: string; label: string; className: string; children: ReactNode }) {
  const send = (type: "keydown" | "keyup") => document.querySelector(".studio-viewport canvas")?.dispatchEvent(new KeyboardEvent(type, { key: value, bubbles: true, cancelable: true }));
  return <button className={className} aria-label={label} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); send("keydown"); }} onPointerUp={() => send("keyup")} onPointerCancel={() => send("keyup")} onLostPointerCapture={() => send("keyup")}>{children}</button>;
}
