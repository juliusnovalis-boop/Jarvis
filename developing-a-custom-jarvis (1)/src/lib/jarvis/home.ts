/**
 * 🏠 MODULE DOMOTIQUE
 *  - Par défaut : maison simulée persistée en PostgreSQL (fonctionne sans matériel)
 *  - Si HOMEASSISTANT_URL + HOMEASSISTANT_TOKEN sont définis : pilotage réel via l'API REST
 */

import { and, eq, like, or } from "drizzle-orm";
import { db } from "@/db";
import { devices } from "@/db/schema";

export interface DeviceRow {
  id: number;
  entityId: string;
  name: string;
  room: string;
  kind: string;
  state: string;
  level: number;
  source: string;
}

const HA_URL = () => (process.env.HOMEASSISTANT_URL ?? "").replace(/\/$/, "");
const HA_TOKEN = () => process.env.HOMEASSISTANT_TOKEN ?? "";
export const haConfigured = () => Boolean(HA_URL() && HA_TOKEN());

/* ------------------------------------------------------------------ */
/* Maison de démonstration                                             */
/* ------------------------------------------------------------------ */

const SEED: Omit<DeviceRow, "id">[] = [
  { entityId: "light.salon", name: "Lumière du salon", room: "salon", kind: "light", state: "off", level: 80, source: "sim" },
  { entityId: "light.cuisine", name: "Lumière de la cuisine", room: "cuisine", kind: "light", state: "off", level: 100, source: "sim" },
  { entityId: "light.chambre", name: "Lumière de la chambre", room: "chambre", kind: "light", state: "off", level: 40, source: "sim" },
  { entityId: "light.bureau", name: "Lumière du bureau", room: "bureau", kind: "light", state: "on", level: 70, source: "sim" },
  { entityId: "climate.thermostat", name: "Thermostat", room: "maison", kind: "thermostat", state: "on", level: 20, source: "sim" },
  { entityId: "switch.cafetiere", name: "Cafetière", room: "cuisine", kind: "plug", state: "off", level: 0, source: "sim" },
  { entityId: "switch.tv", name: "Télévision", room: "salon", kind: "media", state: "off", level: 25, source: "sim" },
  { entityId: "cover.volets", name: "Volets roulants", room: "salon", kind: "cover", state: "off", level: 0, source: "sim" },
];

export async function ensureSeeded(): Promise<void> {
  const existing = await db.select({ id: devices.id }).from(devices).limit(1);
  if (existing.length) return;
  await db.insert(devices).values(SEED).onConflictDoNothing();
}

export async function listDevices(): Promise<DeviceRow[]> {
  await ensureSeeded();
  if (haConfigured()) {
    const live = await fetchHaStates();
    if (live.length) return live;
  }
  const rows = await db.select().from(devices);
  return rows.map(toRow).sort((a, b) => a.room.localeCompare(b.room) || a.name.localeCompare(b.name));
}

function toRow(d: typeof devices.$inferSelect): DeviceRow {
  return {
    id: d.id, entityId: d.entityId, name: d.name, room: d.room,
    kind: d.kind, state: d.state, level: d.level, source: d.source,
  };
}

/* ------------------------------------------------------------------ */
/* Home Assistant réel                                                 */
/* ------------------------------------------------------------------ */

async function fetchHaStates(): Promise<DeviceRow[]> {
  try {
    const res = await fetch(`${HA_URL()}/api/states`, {
      headers: { authorization: `Bearer ${HA_TOKEN()}` },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data as { entity_id: string; state: string; attributes: Record<string, unknown> }[])
      .filter((e) => /^(light|switch|climate|cover|media_player)\./.test(e.entity_id))
      .slice(0, 40)
      .map((e, i) => {
        const domain = e.entity_id.split(".")[0];
        const kind =
          domain === "light" ? "light"
          : domain === "climate" ? "thermostat"
          : domain === "cover" ? "cover"
          : domain === "media_player" ? "media"
          : "plug";
        const attrs = e.attributes ?? {};
        const level =
          kind === "thermostat" ? Math.round(Number(attrs.temperature ?? 20))
          : kind === "cover" ? Math.round(Number(attrs.current_position ?? 0))
          : Math.round((Number(attrs.brightness ?? 0) / 255) * 100);
        return {
          id: i + 1,
          entityId: e.entity_id,
          name: String(attrs.friendly_name ?? e.entity_id),
          room: String(attrs.area ?? "maison"),
          kind,
          state: e.state === "on" || e.state === "open" || e.state === "playing" ? "on" : "off",
          level: Number.isFinite(level) ? level : 0,
          source: "homeassistant",
        } satisfies DeviceRow;
      });
  } catch {
    return [];
  }
}

async function callHaService(domain: string, service: string, entityId: string, data: Record<string, unknown> = {}) {
  try {
    await fetch(`${HA_URL()}/api/services/${domain}/${service}`, {
      method: "POST",
      headers: { authorization: `Bearer ${HA_TOKEN()}`, "content-type": "application/json" },
      body: JSON.stringify({ entity_id: entityId, ...data }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* on retombe sur le simulateur */
  }
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

export async function setDevice(
  entityId: string,
  patch: { state?: string; level?: number }
): Promise<DeviceRow | null> {
  await ensureSeeded();
  if (haConfigured()) {
    const domain = entityId.split(".")[0];
    if (patch.state) {
      const service =
        domain === "cover" ? (patch.state === "on" ? "open_cover" : "close_cover")
        : patch.state === "on" ? "turn_on" : "turn_off";
      await callHaService(domain, service, entityId);
    }
    if (typeof patch.level === "number") {
      if (domain === "light") await callHaService("light", "turn_on", entityId, { brightness_pct: patch.level });
      else if (domain === "climate") await callHaService("climate", "set_temperature", entityId, { temperature: patch.level });
      else if (domain === "cover") await callHaService("cover", "set_cover_position", entityId, { position: patch.level });
    }
  }
  const updated = await db
    .update(devices)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(devices.entityId, entityId))
    .returning();
  return updated[0] ? toRow(updated[0]) : null;
}

/* ------------------------------------------------------------------ */
/* Compréhension du langage naturel                                    */
/* ------------------------------------------------------------------ */

const ROOM_WORDS = ["salon", "cuisine", "chambre", "bureau", "salle de bain", "garage", "couloir", "entrée", "jardin"];

/** Détecte et exécute une commande domotique. Renvoie null si ce n'est pas du domotique. */
export async function homeSkill(input: string): Promise<string | null> {
  const all = await listDevices();

  /* --- Etat général : "état de la maison" --- */
  if (/(état|etat|statut) de la maison|quelles? (lumières?|lampes?) sont allumées|résumé de la maison/.test(input)) {
    const on = all.filter((d) => d.state === "on");
    const thermo = all.find((d) => d.kind === "thermostat");
    const parts: string[] = [];
    parts.push(
      on.length === 0
        ? "Tout est éteint dans la maison."
        : `${on.length} appareil${on.length > 1 ? "s sont allumés" : " est allumé"} : ${on.map((d) => d.name).join(", ")}.`
    );
    if (thermo) parts.push(`Le thermostat est réglé sur ${thermo.level} degrés.`);
    parts.push(haConfigured() ? "Données issues de Home Assistant." : "Maison en mode simulation.");
    return parts.join(" ");
  }

  /* --- Scènes / routines (inspiré d'Alexa & Bixby) --- */
  if (/(mode|scène|scene|ambiance) (cinéma|cinema|film)/.test(input)) {
    await Promise.all([
      setDevice("light.salon", { state: "on", level: 15 }),
      setDevice("light.cuisine", { state: "off" }),
      setDevice("switch.tv", { state: "on" }),
      setDevice("cover.volets", { state: "off", level: 0 }),
    ]);
    return "Mode cinéma activé. Lumières tamisées à quinze pour cent, volets fermés, télévision allumée. Bon film.";
  }
  if (/(mode|scène|scene) (nuit|dodo|sommeil)|bonne nuit|je vais (me coucher|dormir)/.test(input)) {
    await Promise.all(
      all.filter((d) => d.kind !== "thermostat").map((d) => setDevice(d.entityId, { state: "off" }))
    );
    await setDevice("climate.thermostat", { level: 18 });
    return "Mode nuit engagé. Tous les appareils sont éteints et le thermostat descend à dix-huit degrés. Bonne nuit.";
  }
  if (/(mode|scène|scene) (travail|bureau|concentration)|je (me mets au|vais) travail/.test(input)) {
    await Promise.all([
      setDevice("light.bureau", { state: "on", level: 100 }),
      setDevice("switch.tv", { state: "off" }),
      setDevice("cover.volets", { state: "on", level: 100 }),
    ]);
    return "Mode travail activé. Bureau éclairé à pleine puissance, volets ouverts, télévision coupée. Au travail.";
  }
  if (/(mode|scène|scene) (réveil|reveil|matin)|bonjour la maison/.test(input)) {
    await Promise.all([
      setDevice("light.cuisine", { state: "on", level: 100 }),
      setDevice("cover.volets", { state: "on", level: 100 }),
      setDevice("switch.cafetiere", { state: "on" }),
      setDevice("climate.thermostat", { level: 21 }),
    ]);
    return "Mode réveil lancé. Volets ouverts, cuisine éclairée, café en préparation et thermostat à vingt et un degrés.";
  }
  if (/(éteins|eteins|coupe) tout|tout éteindre|tout couper/.test(input)) {
    const toOff = all.filter((d) => d.kind !== "thermostat" && d.state === "on");
    await Promise.all(toOff.map((d) => setDevice(d.entityId, { state: "off" })));
    return toOff.length
      ? `${toOff.length} appareil${toOff.length > 1 ? "s éteints" : " éteint"}. La maison est au repos.`
      : "Tout était déjà éteint.";
  }

  /* --- Thermostat --- */
  const tempM = input.match(/(?:thermostat|chauffage|température).{0,24}?(\d{1,2})\s*(?:degrés?|°)?/) ??
                input.match(/(?:mets?|règle|monte|baisse).{0,24}?(\d{1,2})\s*degrés/);
  if (tempM && /(thermostat|chauffage|température|degrés)/.test(input)) {
    const t = Math.max(5, Math.min(30, parseInt(tempM[1], 10)));
    await setDevice("climate.thermostat", { state: "on", level: t });
    return `Thermostat réglé sur ${t} degrés.`;
  }
  if (/(monte|augmente) (le )?(chauffage|thermostat|la température)/.test(input)) {
    const th = all.find((d) => d.kind === "thermostat");
    const t = Math.min(30, (th?.level ?? 20) + 2);
    await setDevice("climate.thermostat", { state: "on", level: t });
    return `J'augmente le chauffage à ${t} degrés.`;
  }
  if (/(baisse|réduis|diminue) (le )?(chauffage|thermostat|la température)/.test(input)) {
    const th = all.find((d) => d.kind === "thermostat");
    const t = Math.max(5, (th?.level ?? 20) - 2);
    await setDevice("climate.thermostat", { state: "on", level: t });
    return `Je baisse le chauffage à ${t} degrés.`;
  }

  /* --- Volets --- */
  if (/(ouvre|lève|leve) les volets/.test(input)) {
    await setDevice("cover.volets", { state: "on", level: 100 });
    return "J'ouvre les volets.";
  }
  if (/(ferme|baisse|descends) les volets/.test(input)) {
    await setDevice("cover.volets", { state: "off", level: 0 });
    return "Je ferme les volets.";
  }

  /* --- Allumer / éteindre un appareil nommé --- */
  const onOff = input.match(/^(?:jarvis[,\s]*)?(allume|allumer|démarre|lance|active|éteins|eteins|éteindre|coupe|arrête|désactive)\s+(.+)/);
  if (onOff) {
    const verb = onOff[1];
    const wantOn = /^(allume|allumer|démarre|lance|active)/.test(verb);
    let target = onOff[2].replace(/[.?!]+$/, "").trim();
    target = target.replace(/^(la |le |les |l'|mon |ma |mes )/, "");

    // Luminosité éventuelle : "allume le salon à 30%"
    const pctM = target.match(/\s+(?:à|a)\s+(\d{1,3})\s*(?:%|pour ?cent)?$/);
    let pct: number | null = null;
    if (pctM) {
      pct = Math.max(0, Math.min(100, parseInt(pctM[1], 10)));
      target = target.slice(0, pctM.index).trim();
    }

    const match = findDevice(all, target);
    if (match) {
      await setDevice(match.entityId, { state: wantOn ? "on" : "off", ...(pct != null ? { level: pct } : {}) });
      const suffix = pct != null ? ` à ${pct} pour cent` : "";
      const label = withArticle(match.name);
      return wantOn ? `J'allume ${label}${suffix}.` : `J'éteins ${label}.`;
    }

    // Pièce entière : "éteins le salon"
    const room = ROOM_WORDS.find((r) => target.includes(r));
    if (room) {
      const inRoom = all.filter((d) => d.room === room && d.kind !== "thermostat");
      if (inRoom.length) {
        await Promise.all(inRoom.map((d) => setDevice(d.entityId, { state: wantOn ? "on" : "off" })));
        return `${wantOn ? "J'allume" : "J'éteins"} tout dans ${room === "cuisine" || room === "chambre" ? "la" : "le"} ${room}.`;
      }
    }
  }

  /* --- Luminosité seule : "mets la lumière du salon à 40%" --- */
  const dimM = input.match(/(?:mets?|règle|regle|passe)\s+(.+?)\s+(?:à|a)\s+(\d{1,3})\s*(?:%|pour ?cent)/);
  if (dimM) {
    const match = findDevice(all, dimM[1].replace(/^(la |le |les |l')/, ""));
    if (match) {
      const pct = Math.max(0, Math.min(100, parseInt(dimM[2], 10)));
      await setDevice(match.entityId, { state: pct > 0 ? "on" : "off", level: pct });
      const label = withArticle(match.name);
      return `Je règle ${label} à ${pct} pour cent.`;
    }
  }

  return null;
}

/** Ajoute l'article défini français devant le nom d'un appareil. */
function withArticle(name: string): string {
  const n = name.toLowerCase();
  if (/^(la |le |les |l'|un |une )/.test(n)) return n;
  if (/^[aeiouéèêîô]/.test(n)) return `l'${n}`;
  // Noms féminins courants du catalogue
  if (/^(lumière|lampe|cafetière|télévision|prise|climatisation)/.test(n)) return `la ${n}`;
  if (/^(volets|lumières|lampes)/.test(n)) return `les ${n}`;
  return `le ${n}`;
}

function findDevice(all: DeviceRow[], target: string): DeviceRow | null {
  const t = target.toLowerCase().trim();
  if (t.length < 3) return null;
  // Correspondance exacte du nom
  let m = all.find((d) => d.name.toLowerCase() === t);
  if (m) return m;
  // Le nom contient la cible, ou l'inverse
  m = all.find((d) => d.name.toLowerCase().includes(t) || t.includes(d.name.toLowerCase()));
  if (m) return m;
  // Mot-clé type + pièce : "lumière du salon"
  const room = ROOM_WORDS.find((r) => t.includes(r));
  if (room) {
    const kindWanted =
      /lumi|lampe|éclairage|eclairage/.test(t) ? "light"
      : /t[ée]l[ée]|tv/.test(t) ? "media"
      : /caf/.test(t) ? "plug"
      : /volet/.test(t) ? "cover"
      : null;
    m = all.find((d) => d.room === room && (kindWanted ? d.kind === kindWanted : d.kind === "light"));
    if (m) return m;
  }
  // Mot simple : "cafetière", "télé", "volets"
  const simple: Record<string, string> = {
    "café": "switch.cafetiere", "cafetière": "switch.cafetiere", "cafetiere": "switch.cafetiere",
    "télé": "switch.tv", "tele": "switch.tv", "tv": "switch.tv", "télévision": "switch.tv",
    "volet": "cover.volets", "volets": "cover.volets",
  };
  for (const [k, id] of Object.entries(simple)) {
    if (t.includes(k)) {
      const found = all.find((d) => d.entityId === id);
      if (found) return found;
    }
  }
  return null;
}
