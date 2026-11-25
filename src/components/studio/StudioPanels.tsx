"use client";

import { Box, ChevronDown, Circle, Crosshair, Flame, Focus, Gem, Lamp, Leaf, LockKeyhole, Mountain, RotateCcw, Shapes, Sparkles, Sun, TreePine, UnlockKeyhole, Waves, X, type LucideIcon } from "lucide-react";
import { KIND_LABELS, type ObjectKind, type SceneObject, type SceneSettings, type Vec3 } from "@/lib/studio/scene";

export const OBJECT_ICONS: Record<ObjectKind, LucideIcon> = { terrain: Mountain, portal: Circle, tree: TreePine, rock: Shapes, crystal: Gem, platform: Box, spawn: Crosshair, light: Lamp };

export function ObjectIcon({ kind, size = 15 }: { kind: ObjectKind; size?: number }) {
  const Icon = OBJECT_ICONS[kind];
  return <Icon size={size} strokeWidth={1.55} className={`object-icon object-${kind}`} />;
}

export function AssetArt({ kind, className = "" }: { kind: ObjectKind; className?: string }) {
  return <div className={`asset-art art-${kind} ${className}`}><svg viewBox="0 0 180 108" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id={`grass-${kind}`} x1="35" y1="25" x2="135" y2="85" gradientUnits="userSpaceOnUse"><stop stopColor="#b8bd7a" /><stop offset="1" stopColor="#6d884f" /></linearGradient>
      <linearGradient id={`rock-${kind}`} x1="40" y1="50" x2="125" y2="105" gradientUnits="userSpaceOnUse"><stop stopColor="#a2a799" /><stop offset="1" stopColor="#535e5c" /></linearGradient>
      <radialGradient id={`portal-${kind}`}><stop stopColor="#244943" /><stop offset=".65" stopColor="#448c76" /><stop offset="1" stopColor="#b0f0c7" /></radialGradient>
    </defs>
    <ellipse cx="90" cy="94" rx="45" ry="5" fill="#000" opacity=".15" />
    {kind === "terrain" && <g><path d="m38 48 20 35 35 19 34-22 17-34-55-16Z" fill={`url(#rock-${kind})`} /><path d="m38 48 38 13 17 41-35-19Z" fill="#78877a" /><path d="m76 61 49 0-32 41Z" fill="#91978b" /><path d="m89 30 55 16-19 15-49 0-38-13 19-14Z" fill={`url(#grass-${kind})`} /><path d="m47 45 31 10 49-1 12-8-50-13-31 6Z" fill="#a6b277" opacity=".6" /><path d="m54 60 4 20 11 10-4-26Z" fill="#a2a894" /><path d="m120 72-11 18 15-10 10-19Z" fill="#68766b" /><path d="m34 78 7 7 3-11Z" fill="#85967c" /><path d="m142 64 6 9 4-13Z" fill="#86957f" /><path d="m71 36 2-9 3 12m29 0 4-10 1 12m-48 1 3-6 2 8" stroke="#ccd1a0" strokeWidth="2" /></g>}
    {kind === "tree" && <g><path d="m85 88 3-38 7-2 1 40Z" fill="#9a8b68" /><path d="m90 65-20-21m23 14 20-22" stroke="#a49774" strokeWidth="5" /><path d="m88 89-11 3 12-11 12 12-8-4" fill="#8a7a5d" /><path d="m46 42 9-17 29-11 35 8 17 23-20 14-31 2-28-8Z" fill="#7f9a59" /><path d="m46 42 28 3 10-31-29 11Z" fill="#a2b078" /><path d="m74 45 42 14 20-14-17-23-35-8Z" fill="#8fa66a" /><path d="m74 45 22-20 23-3-35-8Z" fill="#b2bd85" /><path d="m74 45 11 16 31-2Z" fill="#5f804d" /><path d="m40 55 15-18 23 7-5 19-20 1Z" fill="#8aa15d" /><path d="m104 52 16-16 22 10-3 18-26 2Z" fill="#6b8b52" /></g>}
    {kind === "rock" && <g><path d="m46 72 11-36 40-15 34 25 9 33-45 15Z" fill={`url(#rock-${kind})`} /><path d="m57 36 32 25 8-40Z" fill="#b5baa8" /><path d="m89 61 42-15-34-25Z" fill="#929f90" /><path d="m46 72 43-11 6 33Z" fill="#8c998a" /><path d="m57 36 13-8 28-8 19 15-27 8-17-2Z" fill="#9eac71" /><path d="m124 75 17-9 12 17-17 10-16-6Z" fill="#929d8e" /></g>}
    {kind === "portal" && <g><path d="m49 84 41-14 43 15-42 15Z" fill="#8a9580" /><path d="m49 80 41-14 43 15-42 15Z" fill="#afb49a" /><ellipse cx="91" cy="51" rx="26" ry="33" fill={`url(#portal-${kind})`} /><path d="M59 78V48a32 35 0 0 1 64 0v30" stroke="#a0a58c" strokeWidth="12" /><path d="M65 78V48a26 29 0 0 1 52 0v30" stroke="#abedd0" strokeWidth="2" /><path d="m59 56 8-1m-7-17 8 3m1-19 6 7m11-15 1 10m16-9-3 9m17 4-7 6m12 10-8 3m9 13-8-1" stroke="#697b6c" strokeWidth="2" /><path d="M80 58c-10-20 33-26 22-2S79 76 88 53" stroke="#92d9b1" strokeWidth="1" opacity=".6" /><path d="m53 79 14 1v8H53Zm63 0 14 1v8h-14Z" fill="#bdc1a4" /></g>}
    {kind === "crystal" && <g><path d="m55 87 15-17 45 0 16 18-33 10Z" fill="#657e73" /><path d="m86 74-6-40 14-25 14 25-9 45Z" fill="#b5e2cc" /><path d="m94 9 0 68 14-43Z" fill="#73bca9" /><path d="m80 34 14 43-14-43 14-25Z" fill="#c8f0db" /><path d="m105 81 4-30 14-13 7 20-16 29Z" fill="#87c9b1" /><path d="m68 86-9-25 4-18 17 17 4 26Z" fill="#98d9c0" /><path d="m63 43 9 37 8-20Z" fill="#d0f0da" /></g>}
    {kind === "platform" && <g><path d="m38 61 23-23 63 0 23 22-22 20H62Z" fill="#c1c2a6" /><path d="m38 61 24 19h63l22-20v11l-22 20H62L38 73Z" fill="#899480" /><path d="m62 80 0 11m63-11v11" stroke="#a9b197" /><path d="m61 38 13 16 31 6 19-22" stroke="#9ea68c" strokeWidth="1" /><path d="m74 54-12 26m43-20 20 20" stroke="#a9af94" /></g>}
    {kind === "light" && <g><circle cx="90" cy="48" r="32" fill="#ffe2a3" opacity=".08" /><circle cx="90" cy="48" r="23" fill="#ffe2a3" opacity=".13" /><circle cx="90" cy="48" r="11" fill="#f6e2ae" /><path d="M90 9v9m0 60v9m-39-39h9m60 0h9M62 20l7 7m42 42 7 7m0-56-7 7M69 69l-7 7" stroke="#e8d49d" strokeWidth="2" strokeLinecap="round" /><ellipse cx="90" cy="94" rx="20" ry="3" fill="#ffe2a3" opacity=".2" /></g>}
    {kind === "spawn" && <g><ellipse cx="90" cy="86" rx="33" ry="10" fill="#b9d38c" opacity=".13" /><ellipse cx="90" cy="86" rx="33" ry="10" stroke="#bddb91" strokeWidth="2" /><path d="M84 85V24l33 13-33 13" stroke="#d6eba9" strokeWidth="3" strokeLinejoin="round" /><path d="m85 25 31 12-31 12Z" fill="#bedb8d" opacity=".6" /></g>}
  </svg></div>;
}

function VectorFields({ label, value, type, onChange }: { label: string; value: Vec3; type: "position" | "rotation" | "scale"; onChange: (v: Vec3) => void }) {
  return <div className="transform-row"><span>{label}</span><div className="vector-fields">{value.map((n, index) => <label key={index} className={`axis-field axis-${index}`}><span>{["X", "Y", "Z"][index]}</span><input aria-label={`${label} ${["X", "Y", "Z"][index]}`} type="number" step={type === "rotation" ? 5 : .1} min={type === "scale" ? .02 : undefined} max={type === "scale" ? 100 : undefined} value={Number((type === "rotation" ? n * 180 / Math.PI : n).toFixed(2))} onChange={e => { const next = [...value] as Vec3; const v = Number(e.target.value); if (!Number.isFinite(v)) return; next[index] = type === "rotation" ? v * Math.PI / 180 : type === "scale" ? Math.max(.02, Math.min(100, v)) : v; onChange(next); }} /></label>)}</div></div>;
}

interface InspectorProps {
  object: SceneObject | null;
  settings: SceneSettings;
  tab: "object" | "world";
  onTab: (tab: "object" | "world") => void;
  onUpdate: (patch: Partial<SceneObject>) => void;
  onSettings: (patch: Partial<SceneSettings>) => void;
  onFocus: () => void;
  onAssistant: () => void;
  onClose: () => void;
}

export function InspectorPanel({ object, settings, tab, onTab, onUpdate, onSettings, onFocus, onAssistant, onClose }: InspectorProps) {
  return <aside className="studio-inspector">
    <div className="inspector-tabs"><button className={tab === "object" ? "active" : ""} onClick={() => onTab("object")}>Inspecteur</button><button className={tab === "world" ? "active" : ""} onClick={() => onTab("world")}>Environnement</button><button className="inspector-close icon-button" aria-label="Fermer l’inspecteur" onClick={onClose}><X size={14} /></button></div>
    <div className="inspector-scroll studio-scroll">
      {tab === "object" ? object ? <>
        <div className="selected-object"><div className={`selected-object-icon object-${object.kind}`}><ObjectIcon kind={object.kind} size={22} /></div><div><input aria-label="Nom de l’objet" value={object.name} maxLength={100} onChange={e => onUpdate({ name: e.target.value })} /><span>{KIND_LABELS[object.kind]} <i>•</i> Objet 3D</span></div><button className="icon-button" title={object.locked ? "Déverrouiller l’objet" : "Verrouiller l’objet"} onClick={() => onUpdate({ locked: !object.locked })}>{object.locked ? <LockKeyhole size={13} /> : <UnlockKeyhole size={13} />}</button></div>
        <section className="inspector-section"><header><ChevronDown size={12} /><h3>Transformation</h3><button className="icon-button" title="Réinitialiser la transformation" onClick={() => onUpdate({ position: [0, .18, 0], rotation: [0, 0, 0], scale: [1, 1, 1] })}><RotateCcw size={12} /></button></header>
          <VectorFields label="Position" type="position" value={object.position} onChange={position => onUpdate({ position })} />
          <VectorFields label="Rotation" type="rotation" value={object.rotation} onChange={rotation => onUpdate({ rotation })} />
          <VectorFields label="Échelle" type="scale" value={object.scale} onChange={scale => onUpdate({ scale })} />
          <button className="focus-object" onClick={onFocus}><Focus size={12} /> Cadrer l’objet <kbd>F</kbd></button>
        </section>
        <section className="inspector-section"><header><ChevronDown size={12} /><h3>Matériau</h3><span className="section-badge">PBR</span></header>
          <div className="material-card"><div className={`material-orb orb-${object.kind}`} style={{ "--material-color": object.color } as React.CSSProperties} /><div><strong>{object.kind === "portal" ? "Énergie d’Éther" : object.kind === "tree" || object.kind === "terrain" ? "Mousse sylvestre" : object.kind === "crystal" ? "Cristal translucide" : "Pierre naturelle"}</strong><span>Standard physique</span></div><span className="material-check">✓</span></div>
          <label className="property-row"><span>Couleur de base</span><div className="color-control"><input type="color" aria-label="Couleur du matériau" value={object.color} onChange={e => onUpdate({ color: e.target.value })} /><span>{object.color.toUpperCase()}</span></div></label>
          <label className="slider-property"><span>Rugosité</span><input type="range" min="0" max="1" step=".01" value={object.roughness} onChange={e => onUpdate({ roughness: Number(e.target.value) })} /><output>{object.roughness.toFixed(2)}</output></label>
          <label className="slider-property"><span>Métallique</span><input type="range" min="0" max="1" step=".01" value={object.metalness} onChange={e => onUpdate({ metalness: Number(e.target.value) })} /><output>{object.metalness.toFixed(2)}</output></label>
        </section>
        <section className="inspector-section"><header><ChevronDown size={12} /><h3>Composants</h3><span className="muted-number">2</span></header>
          <div className="component-row"><Box size={15} /><div><strong>Mesh Renderer</strong><span>Géométrie procédurale</span></div><label className="studio-switch" title="Visibilité de l’objet"><input aria-label="Afficher l’objet" type="checkbox" checked={object.visible} onChange={e => onUpdate({ visible: e.target.checked })} /><span /></label></div>
          <div className="component-row">{object.kind === "portal" ? <Waves size={15} /> : object.kind === "crystal" ? <Gem size={15} /> : object.kind === "tree" || object.kind === "terrain" ? <Leaf size={15} /> : <Shapes size={15} />}<div><strong>{object.kind === "portal" ? "Portail animé" : object.kind === "crystal" ? "Objet à collecter" : object.kind === "spawn" ? "Départ du joueur" : object.kind === "terrain" ? "Collision de terrain" : object.kind === "tree" || object.kind === "rock" ? "Collision statique" : object.kind === "light" ? "Éclairage dynamique" : "Objet de décor"}</strong><span>{object.kind === "portal" ? "Shader · temps réel" : object.kind === "crystal" ? "Exploration · proximité" : object.kind === "terrain" ? "Gravité · surface solide" : "Actif dans la scène"}</span></div><span className="component-active" /></div>
        </section>
      </> : <div className="inspector-empty"><Box size={30} strokeWidth={1} /><h3>Chaque détail compte.</h3><p>Sélectionnez un objet dans la scène pour lui donner votre touche.</p></div> : <>
        <div className="world-intro"><Sun size={21} /><h3>L’atmosphère de votre monde.</h3><p>La bonne lumière change tout.</p></div>
        <section className="inspector-section"><header><ChevronDown size={12} /><h3>Ambiance</h3></header><div className="environment-presets">{([{ key: "sunset", label: "Heure dorée" }, { key: "day", label: "Jour clair" }, { key: "night", label: "Crépuscule" }] as const).map(env => <button key={env.key} onClick={() => onSettings({ environment: env.key })} className={`${settings.environment === env.key ? "active" : ""} environment-${env.key}`}><span /><small>{env.label}</small></button>)}</div><label className="slider-property exposure"><span>Exposition</span><input type="range" min=".2" max="3" step=".05" value={settings.exposure} onChange={e => onSettings({ exposure: Number(e.target.value) })} /><output>{settings.exposure.toFixed(2)}</output></label></section>
        <section className="inspector-section"><header><ChevronDown size={12} /><h3>Rendu</h3></header>{([{ key: "bloom", label: "Lueur cinématique", sub: "Bloom sélectif", Icon: Sparkles }, { key: "shadows", label: "Ombres douces", sub: "Éclairage directionnel", Icon: Sun }, { key: "grid", label: "Grille de travail", sub: "Repères métriques", Icon: Shapes }] as const).map(row => <div className="component-row" key={row.key}><row.Icon size={15} /><div><strong>{row.label}</strong><span>{row.sub}</span></div><label className="studio-switch"><input type="checkbox" aria-label={row.label} checked={settings[row.key]} onChange={e => onSettings({ [row.key]: e.target.checked })} /><span /></label></div>)}<label className="property-row quality-row"><span>Qualité du rendu</span><select value={settings.quality} onChange={e => onSettings({ quality: e.target.value as SceneSettings["quality"] })}><option value="high">Haute qualité</option><option value="balanced">Équilibré</option></select></label></section>
        <section className="inspector-section rendering-note"><Flame size={15} /><p>Rendu WebGL 2 avec tone mapping ACES, matériaux PBR et anti-aliasing multisample en haute qualité.</p></section>
      </>}
    </div>
    <div className="inspector-assistant"><div className="assistant-sparkle"><Sparkles size={17} /></div><strong>Une idée ? Donnez-lui vie.</strong><p>Construisez votre scène avec un petit coup de pouce de JARVIS.</p><button onClick={onAssistant}><Sparkles size={12} /> Créer avec JARVIS <span>↗</span></button></div>
  </aside>;
}
