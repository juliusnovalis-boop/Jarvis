export type Vec3 = [number, number, number];
export type ObjectKind = "terrain" | "portal" | "tree" | "rock" | "crystal" | "platform" | "spawn" | "light";
export type TransformTool = "select" | "translate" | "rotate" | "scale";
export type EnvironmentMode = "sunset" | "day" | "night";

export interface SceneObject {
  id: string;
  name: string;
  kind: ObjectKind;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  color: string;
  visible: boolean;
  locked: boolean;
  roughness: number;
  metalness: number;
}

export interface SceneSettings {
  environment: EnvironmentMode;
  exposure: number;
  bloom: boolean;
  shadows: boolean;
  grid: boolean;
  quality: "high" | "balanced";
}

export interface StudioProject {
  version: 1;
  name: string;
  objects: SceneObject[];
  settings: SceneSettings;
  updatedAt: string | null;
}

export const KIND_LABELS: Record<ObjectKind, string> = {
  terrain: "Île flottante", portal: "Portail ancien", tree: "Arbre sylvestre", rock: "Roche sculptée",
  crystal: "Cristal d’éther", platform: "Dalle de pierre", spawn: "Point de départ", light: "Lumière ponctuelle",
};

export const ASSETS: { kind: ObjectKind; name: string; category: string; color: string; tag?: string }[] = [
  { kind: "terrain", name: "Île flottante", category: "Terrains", color: "#739853", tag: "PRÉFAB" },
  { kind: "tree", name: "Arbre sylvestre", category: "Végétation", color: "#628c47" },
  { kind: "rock", name: "Roche ancienne", category: "Nature", color: "#8b9291" },
  { kind: "portal", name: "Portail d’éther", category: "Architecture", color: "#8ce7c3", tag: "ANIMÉ" },
  { kind: "crystal", name: "Cristaux lumineux", category: "Nature", color: "#85dcdf", tag: "ÉMISSIF" },
  { kind: "platform", name: "Dalle de pierre", category: "Architecture", color: "#b7b5a3" },
  { kind: "light", name: "Lumière douce", category: "Lumières", color: "#ffe2a3" },
  { kind: "spawn", name: "Point de départ", category: "Gameplay", color: "#d5ed9a" },
];

export function makeObject(kind: ObjectKind, index = 1, position?: Vec3): SceneObject {
  const colors: Record<ObjectKind, string> = { terrain: "#769251", portal: "#8be4cf", tree: "#71964f", rock: "#858c87", crystal: "#8cded5", platform: "#b5b8a0", spawn: "#d5ed9a", light: "#ffe2a3" };
  return {
    id: `${kind}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + index}`,
    name: `${KIND_LABELS[kind]} ${String(index).padStart(2, "0")}`,
    kind, position: position ?? [1.5, kind === "terrain" ? -1 : 0.18, 2],
    rotation: [0, 0, 0], scale: kind === "terrain" ? [0.4, 0.4, 0.4] : [1, 1, 1],
    color: colors[kind], visible: true, locked: false, roughness: 0.82, metalness: 0.05,
  };
}

export function createDefaultProject(): StudioProject {
  const item = (id: string, kind: ObjectKind, name: string, position: Vec3, scale: Vec3 = [1, 1, 1], rotation: Vec3 = [0, 0, 0]): SceneObject => ({
    id, kind, name, position, scale, rotation, color: ({ terrain: "#779655", portal: "#8be4cf", tree: "#71964f", rock: "#858c87", crystal: "#8cded5", platform: "#b5b8a0", spawn: "#d5ed9a", light: "#ffe2a3" })[kind],
    visible: true, locked: kind === "terrain", roughness: 0.86, metalness: 0.03,
  });
  return {
    version: 1,
    name: "Les îles d’Éther",
    updatedAt: null,
    settings: { environment: "sunset", exposure: 1.06, bloom: true, shadows: true, grid: false, quality: "high" },
    objects: [
      item("island-main", "terrain", "Île principale", [0, -0.05, 0]),
      item("portal-main", "portal", "Portail d’Éther", [0, 0.18, -0.65], [1, 1, 1], [0, 0.35, 0]),
      item("tree-01", "tree", "Arbre sylvestre", [-3.9, 0.1, -1.8], [1.35, 1.35, 1.35], [0, 0.7, 0]),
      item("tree-02", "tree", "Arbre sylvestre.002", [3.6, 0.14, -2.5], [0.95, 1.1, 0.95], [0, -0.5, 0]),
      item("tree-03", "tree", "Arbre sylvestre.003", [-4.2, 0.1, 1.9], [0.52, 0.65, 0.52]),
      item("rock-01", "rock", "Rocher moussu", [3.65, 0.26, 1.9], [1.1, 0.85, 0.9], [0.1, 0.5, 0.1]),
      item("rock-02", "rock", "Rocher moussu.002", [-2.9, 0.1, 2.65], [0.8, 0.5, 0.7], [0.2, 1.4, 0]),
      item("crystal-01", "crystal", "Cristaux d’Éther", [2.85, 0.1, 2.8], [0.8, 0.8, 0.8]),
      item("crystal-02", "crystal", "Cristaux d’Éther.002", [-2.25, 0.12, -0.75], [0.6, 0.6, 0.6]),
      item("path-01", "platform", "Chemin · 01", [0.8, 0.15, 1.4], [1, 0.65, 1], [0, 0.25, 0]),
      item("path-02", "platform", "Chemin · 02", [1.3, 0.12, 2.3], [0.9, 0.55, 0.9], [0, -0.25, 0]),
      item("path-03", "platform", "Chemin · 03", [1.5, 0.08, 3.3], [0.8, 0.5, 0.8], [0, 0.3, 0]),
      item("spawn-main", "spawn", "Point de départ", [1.5, 0.26, 3.35]),
      item("island-far-01", "terrain", "Île lointaine · Ouest", [-13, -2.2, -9], [0.43, 0.55, 0.43], [0, 1, 0]),
      item("island-far-02", "terrain", "Île lointaine · Est", [10, -0.9, -12], [0.5, 0.65, 0.5], [0, -1, 0]),
      item("island-far-03", "terrain", "Îlot suspendu", [-9.5, -2.1, 3.5], [0.18, 0.32, 0.18]),
    ],
  };
}

export function validateProject(value: unknown): StudioProject | null {
  if (!value || typeof value !== "object") return null;
  const p = value as StudioProject;
  const kinds = Object.keys(KIND_LABELS);
  const vec = (v: unknown, scale = false): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 10000 && (!scale || (n >= 0.02 && n <= 100)));
  if (p.version !== 1 || typeof p.name !== "string" || !p.name.trim() || p.name.length > 100 || !Array.isArray(p.objects) || p.objects.length > 160) return null;
  const ids = new Set<string>();
  for (const o of p.objects) {
    if (!o || typeof o.id !== "string" || o.id.length > 100 || ids.has(o.id) || typeof o.name !== "string" || o.name.length > 100 || !kinds.includes(o.kind) || !vec(o.position) || !vec(o.rotation) || !vec(o.scale, true) || !/^#[0-9a-f]{6}$/i.test(o.color) || typeof o.visible !== "boolean" || typeof o.locked !== "boolean" || !Number.isFinite(o.roughness) || o.roughness < 0 || o.roughness > 1 || !Number.isFinite(o.metalness) || o.metalness < 0 || o.metalness > 1) return null;
    ids.add(o.id);
  }
  const s = p.settings;
  if (!s || !["sunset", "day", "night"].includes(s.environment) || !Number.isFinite(s.exposure) || s.exposure < 0.2 || s.exposure > 3 || typeof s.bloom !== "boolean" || typeof s.shadows !== "boolean" || typeof s.grid !== "boolean" || !["high", "balanced"].includes(s.quality)) return null;
  return { version: 1, name: p.name.trim(), objects: p.objects, settings: s, updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : null };
}
