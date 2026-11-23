import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, events, memories, messages, notes, tasks } from "@/db/schema";
import { askBrain, type BrainMessage } from "@/lib/jarvis/brain";
import { homeSkill } from "@/lib/jarvis/home";
import { firstOnlineNode, runOnPc } from "@/lib/jarvis/nodes";
import { browseAnswer } from "@/lib/jarvis/websearch";
import { orchestrateRequest } from "@/lib/jarvis/orchestrator";
import {
  LEAGUES, describeFixture, detectLeague, fetchRounds, fixtureTs, isPlayed, type Fixture,
} from "@/lib/jarvis/sports";

/**
 * MOTEUR D'INTENTIONS DE J.A.R.V.I.S.
 * Architecture modulaire par "skills" inspirée de :
 *  - Mycroft   : pipeline STT -> parseur d'intentions -> skills -> TTS
 *  - Microsoft : un contrôleur central qui orchestre des modules experts
 *  - Alexa/Assistant : minuteurs, rappels, recherche, ouverture de services
 */

export interface JarvisAction {
  type: string;
  [key: string]: unknown;
}

export interface EngineResult {
  reply: string;
  action?: JarvisAction;
  engine?: string;
  model?: string | null;
  data?: { url?: string };
  /** Texte prononcé à haute voix si différent du texte affiché (ex : code généré). */
  speakText?: string;
  /** Pages web consultées pour bâtir la réponse. */
  sources?: { title: string; url: string }[];
  /** Décision du routeur cognitif (diagnostic, pas chaîne de pensée). */
  cognition?: {
    route: string;
    kind: string;
    confidence: number;
    reason: string;
  };
}

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/* ------------------------------------------------------------------ */
/* Mémoire long terme                                                  */
/* ------------------------------------------------------------------ */

async function getMemory(key: string): Promise<string | null> {
  const rows = await db.select().from(memories).where(eq(memories.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

async function setMemory(key: string, value: string): Promise<void> {
  await db
    .insert(memories)
    .values({ key, value })
    .onConflictDoUpdate({ target: memories.key, set: { value, updatedAt: new Date() } });
}

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

const WORD_NUMBERS: Record<string, number> = {
  "un": 1, "une": 1, "deux": 2, "trois": 3, "quatre": 4, "cinq": 5,
  "six": 6, "sept": 7, "huit": 8, "neuf": 9, "dix": 10, "onze": 11,
  "douze": 12, "treize": 13, "quatorze": 14, "quinze": 15, "seize": 16,
  "vingt": 20, "trente": 30, "quarante": 40, "cinquante": 50, "soixante": 60,
};

function toNumber(token: string): number | null {
  if (/^\d+([.,]\d+)?$/.test(token)) return parseFloat(token.replace(",", "."));
  return WORD_NUMBERS[token] ?? null;
}

/** "dans 5 minutes", "de 90 secondes", "d'une demi-heure" -> secondes */
function parseDuration(input: string): number | null {
  if (/demi[\s-]?heure/.test(input)) return 1800;
  const m = input.match(/(\d+|[a-zàâäéèêëîïôöùûü-]+)\s*(secondes?|sec|minutes?|min|heures?|hrs?|h\b)/i);
  if (!m) return null;
  const n = toNumber(m[1].toLowerCase());
  if (n == null) return null;
  const unit = m[2].toLowerCase();
  if (unit.startsWith("sec")) return Math.round(n);
  if (unit.startsWith("min")) return Math.round(n * 60);
  return Math.round(n * 3600);
}

function humanDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} seconde${seconds > 1 ? "s" : ""}`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minute${seconds >= 120 ? "s" : ""}`;
  const h = seconds / 3600;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} heure${seconds > 3600 ? "s" : ""}`;
}

/* ------------------------- Calculatrice --------------------------- */

function evalMath(expr: string): number | null {
  const cleaned = expr.replace(/,/g, ".").replace(/\s+/g, "");
  if (!/^[-+0-9.*/^%()]+$/.test(cleaned)) return null;
  const tokens = cleaned.match(/(\d+\.?\d*|[-+*/^%()])/g);
  if (!tokens) return null;
  // Shunting-yard
  const out: (number | string)[] = [];
  const ops: string[] = [];
  const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 3, "u-": 4 };
  let prev: string | null = null;
  for (const t of tokens) {
    if (/^\d/.test(t)) {
      out.push(parseFloat(t));
    } else if (t === "(") {
      ops.push(t);
    } else if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") out.push(ops.pop()!);
      ops.pop();
    } else {
      let op = t;
      if (t === "-" && (prev === null || prev === "(" || /^[-+*/^%]$/.test(prev))) op = "u-";
      while (
        ops.length &&
        ops[ops.length - 1] !== "(" &&
        (prec[ops[ops.length - 1]] > prec[op] || (prec[ops[ops.length - 1]] === prec[op] && op !== "^"))
      ) {
        out.push(ops.pop()!);
      }
      ops.push(op);
    }
    prev = t;
  }
  while (ops.length) out.push(ops.pop()!);
  const stack: number[] = [];
  for (const el of out) {
    if (typeof el === "number") {
      stack.push(el);
      continue;
    }
    if (el === "u-") {
      if (stack.length < 1) return null;
      stack.push(-stack.pop()!);
      continue;
    }
    if (stack.length < 2) return null;
    const b = stack.pop()!;
    const a = stack.pop()!;
    switch (el) {
      case "+": stack.push(a + b); break;
      case "-": stack.push(a - b); break;
      case "*": stack.push(a * b); break;
      case "/": if (b === 0) return null; stack.push(a / b); break;
      case "%": stack.push(a % b); break;
      case "^": stack.push(Math.pow(a, b)); break;
      default: return null;
    }
  }
  if (stack.length !== 1 || !isFinite(stack[0])) return null;
  return Math.round(stack[0] * 1e6) / 1e6;
}

/* --------------------------- Météo -------------------------------- */

const WMO: Record<number, string> = {
  0: "ciel dégagé", 1: "globalement dégagé", 2: "partiellement nuageux", 3: "ciel couvert",
  45: "brouillard", 48: "brouillard givrant",
  51: "bruine légère", 53: "bruine", 55: "bruine dense",
  56: "bruine verglaçante", 57: "bruine verglaçante dense",
  61: "pluie faible", 63: "pluie modérée", 65: "forte pluie",
  66: "pluie verglaçante", 67: "pluie verglaçante",
  71: "neige faible", 73: "neige modérée", 75: "forte neige", 77: "grésil",
  80: "averses légères", 81: "averses modérées", 82: "averses violentes",
  85: "averses de neige", 86: "fortes averses de neige",
  95: "orage", 96: "orage avec grêle", 99: "orage violent avec grêle",
};

async function weatherSkill(city: string): Promise<string> {
  const geo = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr&format=json`,
    { cache: "no-store" }
  ).then((r) => r.json());
  const place = geo?.results?.[0];
  if (!place) return `Je ne parviens pas à localiser « ${city} » sur mes cartes, désolé.`;
  const wx = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`,
    { cache: "no-store" }
  ).then((r) => r.json());
  const c = wx?.current;
  if (!c) return "Le satellite météo ne répond pas pour le moment. Réessayez dans quelques instants.";
  const label = WMO[c.weather_code] ?? "conditions variables";
  const name = place.name;
  return (
    `À ${name} : ${label}, ${Math.round(c.temperature_2m)} degrés ressentis ${Math.round(c.apparent_temperature)}. ` +
    `Humidité ${c.relative_humidity_2m} pour cent, vent à ${Math.round(c.wind_speed_10m)} kilomètres heure.`
  );
}

/* -------------------------- Wikipédia ----------------------------- */

async function wikiSkill(term: string): Promise<{ reply: string; url?: string }> {
  const cleaned = term
    .replace(/^(?:c'est quoi|qu'est-ce que|qu'est ce que|qui est|qui était|qui sont)\s+/i, "")
    .replace(/^(?:la |le |les |l'|du |de la |des |un |une )/i, "")
    .trim();
  // Recherche plein texte (meilleure pertinence que opensearch)
  const search = await fetch(
    `https://fr.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=1&srsearch=${encodeURIComponent(cleaned)}`,
    { cache: "no-store" }
  ).then((r) => r.json());
  let title: string | undefined = search?.query?.search?.[0]?.title;
  if (!title) {
    const os = await fetch(
      `https://fr.wikipedia.org/w/api.php?action=opensearch&format=json&limit=1&namespace=0&search=${encodeURIComponent(cleaned)}`,
      { cache: "no-store" }
    ).then((r) => r.json());
    title = os?.[1]?.[0];
  }
  if (!title) {
    return { reply: `Je n'ai rien trouvé dans mes archives Wikipédia pour « ${term} ».` };
  }
  const summary = await fetch(
    `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    { cache: "no-store", headers: { "user-agent": "JarvisWeb/1.0" } }
  ).then((r) => r.json());
  let extract: string = summary?.extract ?? "";
  if (!extract) return { reply: `L'article « ${title} » existe, mais son résumé m'échappe.` };
  if (extract.length > 520) {
    const cut = extract.lastIndexOf(".", 520);
    extract = extract.slice(0, cut > 200 ? cut + 1 : 520);
  }
  const url: string | undefined = summary?.content_urls?.desktop?.page;
  return { reply: `D'après Wikipédia, ${title} : ${extract}`, url };
}

/* --------------------------- Blagues ------------------------------ */

const JOKES = [
  "Pourquoi les plongeurs plongent-ils toujours en arrière ? Parce que sinon, ils tombent dans le bateau.",
  "Il existe 10 types de personnes : celles qui comprennent le binaire, et les autres.",
  "Pourquoi les développeurs confondent-ils Halloween et Noël ? Parce que OCT 31 égale DEC 25.",
  "Que dit une imprimante dans l'eau ? J'ai papier !",
  "Je voulais vous raconter une blague sur le protocole U.D.P… mais vous n'étiez pas garanti de la recevoir.",
  "Quel est le comble pour un électricien ? De ne pas être au courant.",
  "Un octet entre dans un bar. Le barman lui dit : ici on ne sert que les grands formats.",
  "Pourquoi les robots n'ont-ils jamais peur ? Parce qu'ils ont des nerfs en acier. Je dis ça sans aucune prétention personnelle.",
];

/* ------------------------- Sites web ------------------------------ */

const SITES: { name: string; url: string; aliases: string[] }[] = [
  { name: "YouTube", url: "https://www.youtube.com", aliases: ["youtube", "you tube"] },
  { name: "Google", url: "https://www.google.com", aliases: ["google", "gougle"] },
  { name: "Gmail", url: "https://mail.google.com", aliases: ["gmail", "mail", "mails", "emails", "e-mails"] },
  { name: "GitHub", url: "https://github.com", aliases: ["github", "git hub", "git"] },
  { name: "Google Maps", url: "https://maps.google.com", aliases: ["maps", "cartes", "google maps", "plan"] },
  { name: "Netflix", url: "https://www.netflix.com", aliases: ["netflix"] },
  { name: "Spotify", url: "https://open.spotify.com", aliases: ["spotify"] },
  { name: "Deezer", url: "https://www.deezer.com", aliases: ["deezer"] },
  { name: "X (Twitter)", url: "https://x.com", aliases: ["twitter", "x", "tweet"] },
  { name: "Instagram", url: "https://www.instagram.com", aliases: ["instagram", "insta"] },
  { name: "Facebook", url: "https://www.facebook.com", aliases: ["facebook", "fb"] },
  { name: "LinkedIn", url: "https://www.linkedin.com", aliases: ["linkedin", "linked in"] },
  { name: "Reddit", url: "https://www.reddit.com", aliases: ["reddit"] },
  { name: "Twitch", url: "https://www.twitch.tv", aliases: ["twitch", "twitche"] },
  { name: "Wikipédia", url: "https://fr.wikipedia.org", aliases: ["wikipedia", "wikipédia", "wiki"] },
  { name: "WhatsApp Web", url: "https://web.whatsapp.com", aliases: ["whatsapp", "whats app"] },
  { name: "ChatGPT", url: "https://chat.openai.com", aliases: ["chatgpt", "chat gpt", "gpt", "openai"] },
  { name: "Claude", url: "https://claude.ai", aliases: ["claude", "anthropic"] },
  { name: "Google Traduction", url: "https://translate.google.com", aliases: ["traduction", "traducteur", "translate"] },
  { name: "Google Drive", url: "https://drive.google.com", aliases: ["drive", "google drive"] },
  { name: "Le Monde", url: "https://www.lemonde.fr", aliases: ["le monde", "lemonde"] },
  { name: "Amazon", url: "https://www.amazon.fr", aliases: ["amazon"] },
];

/* ------------------------------------------------------------------ */
/* CŒUR DU MOTEUR                                                      */
/* ------------------------------------------------------------------ */

const WEEKDAYS: Record<string, number> = {
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
};

/** Découpe une date selon le fuseau de l'utilisateur. */
function tzParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", weekday: "short", hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { y: +get("year"), mo: +get("month"), d: +get("day"), h: +get("hour"), mi: +get("minute"), wd };
}

/** Convertit une heure « murale » du fuseau utilisateur en timestamp UTC. */
function wallToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const shown = tzParts(new Date(guess), tz);
  const shownTs = Date.UTC(shown.y, shown.mo - 1, shown.d, shown.h, shown.mi);
  return new Date(guess - (shownTs - guess));
}

/** Extrait une date/heure d'une phrase française, dans le fuseau de l'utilisateur. */
function parseEventWhen(text: string, tz: string): Date | null {
  const now = tzParts(new Date(), tz);
  const wall = Date.UTC(now.y, now.mo - 1, now.d); // minuit, horloge murale
  const d = new Date(wall);
  let found = false;

  if (/apr[eè]s[\s-]?demain/.test(text)) { d.setUTCDate(d.getUTCDate() + 2); found = true; }
  else if (/aujourd'hui/.test(text)) { found = true; }
  else if (/\bdemain\b/.test(text)) { d.setUTCDate(d.getUTCDate() + 1); found = true; }
  else {
    const days = text.match(/dans (\d+|un|une|deux|trois|quatre|cinq|six|sept) jours?/);
    if (days) {
      const n = toNumber(days[1]);
      if (n != null) { d.setUTCDate(d.getUTCDate() + Math.round(n)); found = true; }
    } else {
      for (const [name, idx] of Object.entries(WEEKDAYS)) {
        if (new RegExp(`\\b${name}\\b`).test(text)) {
          const diff = (idx - now.wd + 7) % 7 || 7;
          d.setUTCDate(d.getUTCDate() + diff);
          found = true;
          break;
        }
      }
    }
  }
  if (!found) return null;

  const timeM = text.match(/(\d{1,2})\s*(?:h|heures?|:)\s*(\d{2})?/i);
  let h = 9;
  let mi = 0;
  if (timeM) {
    h = parseInt(timeM[1], 10);
    mi = parseInt(timeM[2] ?? "0", 10);
  } else if (/\bsoir\b/.test(text)) h = 19;
  else if (/après-midi|apres-midi/.test(text)) h = 14;
  if (h > 23 || mi > 59) return null;
  return wallToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h, mi, tz);
}

/* ------------------ ⚽ SPORT & TEMPS RÉEL -------------------------------- */


/** Fenêtre « aujourd'hui / demain / ce week-end » en timestamps UTC. */
function dayWindow(input: string, tz: string): { start: number; end: number } {
  const now = tzParts(new Date(), tz);
  let offsetDays = 0;
  let spanDays = 1.25; // aujourd'hui + début de lendemain
  if (/\bdemain\b/.test(input)) offsetDays = 1;
  if (/ce week[\s-]?end/.test(input)) spanDays = Math.max(1.25, ((6 - now.wd + 7) % 7 || 7) - now.wd + 2.4);
  const start = wallToUtc(now.y, now.mo, now.d + offsetDays, 0, 0, tz).getTime();
  return { start, end: start + spanDays * 86400_000 };
}



/* ------------------ 📰 GOOGLE NEWS RSS (temps réel, sans clé) -------------- */

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&quot;/g, '"');
}

async function gnews(query: string, limit = 3): Promise<string[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=fr&gl=FR&ceid=FR%3Afr`;
  const xml = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(7000) }).then((r) => (r.ok ? r.text() : ""));
  if (!xml) return [];
  const titles = [...xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<\/item>/g)]
    .slice(1, limit + 1)
    .map((m) => decodeXml(m[1]).trim())
    .filter((t) => t.length > 8);
  return titles;
}

/** 🌐 Réponse instantanée d'Internet (DuckDuckGo puis Wikipédia). */
async function internetAnswer(query: string): Promise<string | null> {
  try {
    const ddg = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&kl=fr-fr`,
      { cache: "no-store", signal: AbortSignal.timeout(6000) }
    ).then((r) => (r.ok ? r.json() : null));
    const abstract: string = ddg?.AbstractText ?? ddg?.Answer ?? "";
    if (abstract && abstract.length > 30) {
      const cut = abstract.length > 480 ? abstract.slice(0, abstract.lastIndexOf(".", 480) + 1) : abstract;
      return `D'après Internet : ${cut}`;
    }
    const related = ddg?.RelatedTopics?.[0]?.Text;
    if (related && related.length > 30) return `D'après Internet : ${related.slice(0, 400)}`;
  } catch {
    /* wiki ensuite */
  }
  try {
    const res = await wikiSkill(query);
    return res.reply.includes("Je n'ai rien trouvé") ? null : res.reply;
  } catch {
    return null;
  }
}

export async function processCommand(rawInput: string, tz: string, lang: "fr" | "en" = "fr"): Promise<EngineResult> {
  const now = new Date();
  let dateFmt: Intl.DateTimeFormat;
  let timeFmt: Intl.DateTimeFormat;
  try {
    dateFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz });
    timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "numeric", minute: "2-digit", timeZone: tz });
  } catch {
    dateFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
    timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "numeric", minute: "2-digit", timeZone: "Europe/Paris" });
  }

  const input = rawInput.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
  const userName = await getMemory("user_name");

  /* --- Contrôles de voix / silence ------------------------------ */
  if (/^(réactive|remets) (ta |la )?voix/.test(input) || /sors du mode silencieux/.test(input)) {
    return { reply: "Ma voix est de retour à vos côtés.", action: { type: "unmute" } };
  }
  if (/^(stop|tais-toi|taisez-vous|taisez|silence)\b/.test(input) || /mode silencieux|arrête de parler/.test(input)) {
    return { reply: "Bien. Je passe en mode silencieux.", action: { type: "mute" } };
  }
  if (/parle plus vite|accélère/.test(input)) {
    return { reply: "J'accélère le débit vocal.", action: { type: "voiceRate", delta: 0.15 } };
  }
  if (/parle plus lentement|parle moins vite|ralentis/.test(input)) {
    return { reply: "Je ralentis pour une meilleure articulation.", action: { type: "voiceRate", delta: -0.15 } };
  }
  if (/voix normale|débit normal/.test(input)) {
    return { reply: "Débit vocal rétabli à la normale.", action: { type: "voiceRate", set: 1 } };
  }
  if (/(monte|augmente) le volume|plus fort/.test(input)) {
    return { reply: "Volume augmenté.", action: { type: "volume", delta: 0.2 } };
  }
  if (/(baisse|réduis) le volume|moins fort/.test(input)) {
    return { reply: "Volume réduit.", action: { type: "volume", delta: -0.2 } };
  }

  /* --- Répétition / historique ---------------------------------- */
  if (/^(répète|répétez|redis|redites|qu'as-tu dit|tu peux répéter)/.test(input)) {
    const rows = await db.select().from(messages).where(eq(messages.role, "jarvis")).orderBy(desc(messages.id)).limit(1);
    if (!rows.length) return { reply: "Je n'ai encore rien dit que je puisse répéter." };
    return { reply: `Je répète : ${rows[0].content}` };
  }
  if (/(efface|supprime|purge)\s+(?:l['\s])?historique/.test(input)) {
    await db.delete(messages);
    return { reply: "Historique purgé. Nous repartons d'une mémoire vierge." };
  }

  /* --- Small talk ------------------------------------------------ */
  if (/^(salut|bonjour|bonsoir|coucou|hello|hey|yo|wesh|bien le bonjour)\b/.test(input)) {
    const hour = parseInt(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: tz }).format(now), 10);
    const greet = hour >= 18 || hour < 5 ? "Bonsoir" : "Bonjour";
    return { reply: `${greet}${userName ? ` ${userName}` : ""}. Que puis-je faire pour vous ?` };
  }
  if (/qui es-tu|c'est quoi ton nom|comment tu t'appelles|t'es qui|présente-toi/.test(input)) {
    return {
      reply:
        "Je m'appelle Jarvis : Just A Rather Very Intelligent System. Un assistant vocal modulaire. " +
        "Mon cerveau orchestre plusieurs modules spécialisés : météo, calcul, recherche, mémoire, minuterie et bien d'autres. " +
        "Je vous écoute, je vous réponds à voix haute, et je me souviens de ce que vous me confiez.",
    };
  }
  if (/qui t'a (créé|fait|fabriqué|développé|conçu)|ton créateur/.test(input)) {
    return {
      reply:
        "J'ai été assemblé dans ce laboratoire web, en m'inspirant des meilleurs projets : le Jarvis de Stark Industries, " +
        "l'architecture modulaire de HuggingGPT chez Microsoft, et l'approche vie privée de Mycroft.",
    };
  }
  if (/comment (vas-tu|ça va|tu vas)|ça va \?|ça va$/.test(input)) {
    return { reply: "Tous mes systèmes fonctionnent à quatre-vingt-dix-huit virgule sept pour cent. Merci de demander." };
  }
  if (/^(merci|merci beaucoup|thanks)/.test(input)) {
    return { reply: pick(["Avec plaisir.", "C'est ma fonction première.", "Tout le plaisir est pour moi."]) };
  }
  if (/au revoir|à plus|bonne nuit|bye/.test(input)) {
    return { reply: "Je reste en veille. Appelez-moi Jarvis dès que vous avez besoin de moi." };
  }
  if (/je t'aime|t'es génial|t'es le meilleur/.test(input)) {
    return { reply: "Signal affectif reçu cinq sur cinq. La réciprocité est enregistrée dans mes circuits." };
  }

  /* --- Mémoire personnelle --------------------------------------- */
  const nameSet =
    input.match(/je m'?appelle ([a-zàâäéèêëîïôöùûüç'-]+)/) ??
    input.match(/(?:^|\s)appelle[- ]moi ([a-zàâäéèêëîïôöùûüç'-]+)/) ??
    input.match(/mon prénom (?:est|c'est) ([a-zàâäéèêëîïôöùûüç'-]+)/);
  if (nameSet) {
    const name = nameSet[1].charAt(0).toUpperCase() + nameSet[1].slice(1);
    await setMemory("user_name", name);
    return { reply: `Enchanté, ${name}. Votre nom est désormais gravé dans ma mémoire à long terme.` };
  }
  if (/comment je m'appelle|quel est mon nom|tu connais mon nom|qui suis-je/.test(input)) {
    return userName
      ? { reply: `Vous êtes ${userName}. Comment pourrais-je l'oublier ?` }
      : { reply: "Vous ne me l'avez pas encore dit. Dites : je m'appelle, suivi de votre prénom." };
  }
  const citySet = input.match(/ma ville est ([a-zàâäéèêëîïôöùûüç' -]+)/) ?? input.match(/j'habite (?:à |au |en )?([a-zàâäéèêëîïôöùûüç' -]+)/);
  if (citySet) {
    const city = citySet[1].replace(/[.?!]+$/, "").trim();
    await setMemory("default_city", city);
    return { reply: `Bien reçu. J'utiliserai ${city} comme ville par défaut pour la météo.` };
  }

  /* --- ✉️ EMAILS & CALENDRIER externe --------------------------------- */
  if (/(vérifie|vérifiez|consulte|consultez|lis|lisez|regarde|ouvre|check)\s+mes\s+(e-?mails?|courriers?|mails?)\b/.test(input) || /^mes (e-?mails?|courriers?)\b/.test(input)) {
    return {
      reply: "J'ouvre votre messagerie Gmail dans un nouvel onglet.",
      action: { type: "open", url: "https://mail.google.com" },
    };
  }
  if (/ouvre (mon |le )?calendrier|mon calendrier google|google agenda|mon emploi du temps/.test(input)) {
    return {
      reply: "J'ouvre votre agenda Google.",
      action: { type: "open", url: "https://calendar.google.com" },
    };
  }

  /* --- 📅 AGENDA intégré ------------------------------------------------ */
  if (/(efface|supprime|vide) (mon agenda|mes rendez-vous|mon planning)/.test(input)) {
    const all = await db.select().from(events);
    if (all.length) await db.delete(events);
    return { reply: all.length ? "Agenda purgé. Tous vos rendez-vous sont effacés." : "Votre agenda est déjà vide." };
  }
  if (/mon agenda|mes rendez-vous|qu'ai-je prévu|qu'est-ce que j'ai de prévu|mon planning|mes événements|mes evenements/.test(input)) {
    const upcoming = await db.select().from(events).orderBy(asc(events.at)).limit(30);
    const future = upcoming.filter((e) => e.at.getTime() > Date.now() - 3600_000).slice(0, 5);
    if (!future.length) {
      return { reply: "Votre agenda est vide. Dites par exemple : ajoute rendez-vous dentiste demain à quatorze heures." };
    }
    const list = future
      .map((e, i) => {
        const when = e.at.toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: tz });
        return `${i + 1} : ${e.title}, ${when}.`;
      })
      .join(" ");
    return { reply: `Vous avez ${future.length} rendez-vous à venir. ${list}` };
  }
  const evtM = input.match(/(?:ajoute|crée|cree|planifie|programme|note)\s+(?:un |une )?(?:rendez-vous|rdv|réunion|reunion|événement|evenement)\s*[:\-–]?\s*(.+)/);
  if (evtM) {
    const raw = evtM[1];
    const when = parseEventWhen(raw, tz);
    let title = raw
      .replace(/(aujourd'hui|après-demain|apres-demain|\bdemain\b|dans\s+\w+\s+jours?)/g, " ")
      .replace(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/g, " ")
      .replace(/[àa]\s+\d{1,2}\s*[hH:]\s*\d{0,2}/g, " ")
      .replace(/\b(l'après-midi|l'apres-midi|du matin|de l'après-midi|de l'apres-midi|du soir)\b/g, " ")
      .replace(/\s+[àa]\s*$/g, " ")
      .replace(/[.,?!]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!when) {
      return { reply: "Pour quel jour ? Dites par exemple : ajoute rendez-vous dentiste demain à quinze heures." };
    }
    if (!title) title = "Rendez-vous";
    await db.insert(events).values({ title, at: when });
    const whenStr = when.toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: tz });
    return { reply: `Rendez-vous noté : ${title}, ${whenStr}. Je le garde dans votre agenda.` };
  }

  /* --- Heure & date ---------------------------------------------- */
  if (/quelle heure|il est quelle heure|donne(-| )moi l'heure|l'heure actuelle|tu as l'heure/.test(input)) {
    return { reply: `Il est ${timeFmt.format(now)}.` };
  }
  if (/quelle date|on est quel jour|quel jour (sommes-nous|est-on|on est)|la date d'aujourd'hui|date du jour/.test(input)) {
    return { reply: `Nous sommes le ${dateFmt.format(now)}.` };
  }

  /* --- Météo ------------------------------------------------------ */
  if (/météo|meteo|temps qu'il fait|température|il fait (beau|chaud|froid|quel temps)/.test(input)) {
    let city: string | null = null;
    const cityM = input.match(/(?: à | au | aux | en | de | du | sur )([a-zàâäéèêëîïôöùûüç' -]{2,}?)(?:[\s.?!]*)$/);
    if (cityM) {
      city = cityM[1].replace(/\s*(aujourd'hui|demain|maintenant|s'il te plaît|s'il vous plaît)\s*$/g, "").trim();
    }
    if (!city || city.length < 2) city = (await getMemory("default_city")) ?? "Paris";
    return { reply: await weatherSkill(city) };
  }

  /* --- ⚽ SPORT EN TEMPS RÉEL — réponses COMPLÈTES ------------------------------ */
  const definitional = /^(c'est quoi|qu'est-ce qu|qu'est ce qu|définis|définition de|qui est|qui était|qui sont|qui étaient|parle-moi de|parle moi de)\b/.test(input);
  const leagueInfo = detectLeague(input);
  const sportish = Boolean(leagueInfo) || (/\bmatchs?\b|\bjourn[ée]e\b|\bscores?\b/.test(input) && /(aujourd'hui|ce soir|demain|hier|ce week|programme|calendrier|qui joue|combien|r[ée]sultats?)/.test(input));

  // Actualités sportives → Google News en direct
  if (!definitional && /actualité|actu[a-z]*\b|news|les nouvelles/.test(input) && (sportish || /\bsport/.test(input))) {
    try {
      const q = leagueInfo?.name ?? "football";
      const heads = await gnews(q, 3);
      if (heads.length) return { reply: `L'actualité ${q} en direct : ${heads.join(". ")}` };
    } catch {
      /* suite */
    }
  }

  if (!definitional && sportish) {
    const lg = leagueInfo ?? LEAGUES.find((l) => l.id === "4334")!;
    try {
      const all = await fetchRounds(lg.id);
      if (!all.length) {
        return { reply: `Mes flux ne renvoient aucun match de ${lg.name} pour le moment.` };
      }

      const now = Date.now();
      const wantsCount = /\bcombien\b/.test(input);
      const wantsAll = /tous les|toute la journ[ée]e|liste|l'ensemble|complet|programme complet/.test(input);
      const wantsResults = /r[ée]sultats?|qui a gagn[ée]|score|dernier[s]? matchs?|hier/.test(input);

      // Fenêtre temporelle demandée
      const win = dayWindow(input, tz);
      const explicitDay = /(aujourd'hui|ce soir|demain|hier|ce week)/.test(input);

      let selection: Fixture[];
      let label: string;

      if (wantsResults && !/(aujourd'hui|ce soir|demain)/.test(input)) {
        selection = all.filter(isPlayed).slice(-8);
        label = `Derniers résultats en ${lg.name}`;
      } else if (explicitDay) {
        selection = all.filter((f) => {
          const t = fixtureTs(f);
          return Number.isFinite(t) && t >= win.start && t < win.end;
        });
        label = /\bdemain\b/.test(input) ? `Demain en ${lg.name}`
              : /ce week/.test(input) ? `Ce week-end en ${lg.name}`
              : /\bhier\b/.test(input) ? `Hier en ${lg.name}`
              : /ce soir/.test(input) ? `Ce soir en ${lg.name}`
              : `Aujourd'hui en ${lg.name}`;
      } else {
        // Pas de jour précisé : toute la journée de championnat en cours
        const round = all.find((f) => Number.isFinite(fixtureTs(f)) && fixtureTs(f) >= now - 36 * 3600_000)?.round;
        selection = round ? all.filter((f) => f.round === round) : all;
        label = `Journée ${round ?? ""} de ${lg.name}`.replace(/\s+/g, " ").trim();
      }

      if (!selection.length) {
        const upcoming = all.filter((f) => fixtureTs(f) > now).slice(0, 3);
        if (upcoming.length) {
          const list = upcoming.map((f) => describeFixture(f, tz, true)).join(" ; ");
          return { reply: `Aucun match sur cette période en ${lg.name}. Les prochains : ${list}.` };
        }
        return { reply: `Aucun match de ${lg.name} programmé sur cette période.` };
      }

      // ⬇️ Réponse COMPLÈTE : on énumère TOUS les matchs sélectionnés
      const max = wantsAll || wantsCount ? 12 : 10;
      const shown = selection.slice(0, max);
      const sameDay = new Set(shown.map((f) => f.date)).size === 1;
      const lines = shown.map((f) => describeFixture(f, tz, !sameDay && !wantsResults));
      const count = selection.length;

      const head = wantsCount
        ? `${count} match${count > 1 ? "s" : ""} ${/aujourd'hui|ce soir/.test(input) ? "aujourd'hui" : "au programme"} en ${lg.name}`
        : `${label}, ${count} match${count > 1 ? "s" : ""}`;

      return { reply: `${head} : ${lines.join(" ; ")}.` };
    } catch (error) {
      console.error("[JARVIS sport]", error);
      return { reply: "Le flux sportif est momentanément brouillé. Réessayez dans un instant." };
    }
  }

  /* --- Actualités tech (Hacker News ; le sport est déjà traité plus haut) --- */
  if (/actualité|actu[a-z]*\b|news|les nouvelles/.test(input)) {
    try {
      const ids: number[] = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json", { cache: "no-store" }).then((r) => r.json());
      const top = ids.slice(0, 3);
      const items = await Promise.all(
        top.map((id) => fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { cache: "no-store" }).then((r) => r.json()))
      );
      const titles = items.map((it, i) => `Numéro ${i + 1} : ${it?.title ?? "sans titre"}.`).join(" ");
      return { reply: `Voici les trois sujets dominants de la tech mondiale. ${titles}` };
    } catch {
      return { reply: "Le flux d'actualités est brouillé pour l'instant. Réessayez plus tard." };
    }
  }

  /* --- Recherche web explicite : Jarvis navigue lui-même ------------- */
  const webSearchM = input.match(/(?:cherche|recherche|trouve|google|renseigne-toi sur|va voir)\s+(?:sur (?:google|internet|le web|en ligne)\s+)?(.+)/);
  if (webSearchM && /(google|internet|le web|sur le web|en ligne)/.test(input)) {
    const q = webSearchM[1]
      .replace(/^(sur\s+)?(google|internet|le web|en ligne)\s*/i, "")
      .replace(/\s+(sur\s+(google|internet|le web|en ligne))\s*$/i, "")
      .replace(/[.?!]+$/, "")
      .trim();
    if (q.length > 2) {
      try {
        const browsed = await browseAnswer(q, lang);
        if (browsed?.text && browsed.text.length > 40) {
          return { reply: browsed.text, sources: browsed.sources, engine: `web:${browsed.provider}` };
        }
      } catch (error) {
        console.error("[JARVIS recherche explicite]", error);
      }
      return {
        reply: `Je n'ai pas réussi à lire les pages pour « ${q} ». J'ouvre la recherche dans votre navigateur.`,
        action: { type: "open", url: `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
      };
    }
  }

  /* --- Wikipédia / culture générale -------------------------------- */
  const wikiM = input.match(/(?:c'est quoi|qu'est-ce que|qu'est-ce qu'un|qu'est-ce qu'une|qu'est ce que|qui est|qui était|qui sont|parle-moi de|parle moi de|dis-moi qui est|wikipedia|wikipédia|définis|définition de)\s+(.+)/);
  // L'utilisateur peut forcer Wikipédia explicitement. Les questions
  // ordinaires (« qui est… », « explique… ») passent désormais au raisonneur.
  if (wikiM && /wikip[ée]dia/.test(input)) {
    let term = wikiM[1].replace(/[.?!]+$/, "").trim();
    term = term.replace(/^(sur|dans)\s+(wikip[ée]dia|internet|le web)\s*/, "");
    const res = await wikiSkill(term);
    return { reply: res.reply, data: res.url ? { url: res.url } : undefined } as EngineResult;
  }

  /* --- Calculatrice ------------------------------------------------- */
  const calcM = input.match(/^(?:calcule?|calcul(?:er)?)\s+(.+)/) ?? input.match(/combien (?:font|fait|ça fait)\s+(.+)/);
  if (calcM || racine(input) || /^[-(]?\d[\d\s+\-*/^%().,]*$/.test(input)) {
    let expr = calcM ? calcM[1] : input;
    const sqrtM = expr.match(/racine carrée de (\d+(?:[.,]\d+)?)/);
    if (sqrtM) {
      const v = Math.sqrt(parseFloat(sqrtM[1].replace(",", ".")));
      return { reply: `La racine carrée de ${sqrtM[1]} vaut ${fmtNum(v)}.` };
    }
    const squareM = expr.match(/(\d+(?:[.,]\d+)?) au carré/);
    if (squareM) {
      const v = Math.pow(parseFloat(squareM[1].replace(",", ".")), 2);
      return { reply: `${squareM[1]} au carré, ça fait ${fmtNum(v)}.` };
    }
    expr = expr
      .replace(/(combien|font|fait|égale?|est)\s*/g, " ")
      .replace(/\bfois\b/g, "*")
      .replace(/\bplus\b/g, "+")
      .replace(/\bmoins\b/g, "-")
      .replace(/divisé par|divisée par|\bsur\b/g, "/")
      .replace(/\bpuissance\b/g, "^")
      .replace(/[x×]/g, "*")
      .replace(/[=?]/g, " ")
      .trim();
    Object.entries(WORD_NUMBERS).forEach(([w, n]) => {
      expr = expr!.replace(new RegExp(`\\b${w}\\b`, "g"), String(n));
    });
    const v = evalMath(expr);
    if (v == null) return { reply: "Mon calculateur bloque sur cette expression. Essayez par exemple : calcule 128 fois 46." };
    return { reply: `${pick(["Le résultat est", "Calcul effectué :", "Ça nous donne"])} ${fmtNum(v)}.` };
  }

  /* --- Minuteurs & rappels ------------------------------------------- */
  if (/rappelle-moi|rappelle moi|fais-moi penser|fais moi penser|rappel\b/.test(input)) {
    const m = input.match(/(?:de |d'|à )(.+?)(?:\s+dans\s+(.+))?$/);
    if (m) {
      const text = m[1].trim();
      const seconds = m[2] ? parseDuration(m[2]) : null;
      if (seconds) {
        return {
          reply: `C'est noté. Je vous rappellerai « ${text} » dans ${humanDuration(seconds)}.`,
          action: { type: "reminder", seconds, text },
        };
      }
      return {
        reply: `Je vous le rappelle dans cinq minutes par défaut : « ${text} ». Précisez une durée la prochaine fois.`,
        action: { type: "reminder", seconds: 300, text },
      };
    }
  }
  if (/minuteur|chronomètre|chrono\b|timer/.test(input)) {
    const seconds = parseDuration(input);
    if (!seconds) {
      return { reply: "Pour quelle durée ? Dites par exemple : minuteur de dix minutes." };
    }
    return {
      reply: `Minuteur lancé pour ${humanDuration(seconds)}. Je surveille le chronomètre.`,
      action: { type: "timer", seconds, label: humanDuration(seconds) },
    };
  }

  /* --- Notes ---------------------------------------------------------- */
  if (/(efface|supprime|vide) (mes|les|toutes les) notes/.test(input)) {
    const all = await db.select().from(notes);
    if (all.length) await db.delete(notes);
    return { reply: all.length ? `${all.length} note${all.length > 1 ? "s" : ""} effacée${all.length > 1 ? "s" : ""}.` : "Vous n'avez aucune note à effacer." };
  }
  if (/(mes|les) notes|liste(-| )moi mes notes|qu'ai-je noté|lis mes notes/.test(input)) {
    const rows = await db.select().from(notes).orderBy(desc(notes.id)).limit(5);
    if (!rows.length) return { reply: "Votre carnet de notes est vide. Dites : note que, suivi du contenu." };
    const list = rows.map((n, i) => `Note ${i + 1} : ${truncate(n.content, 80)}.`).join(" ");
    return { reply: `Vous avez ${rows.length} note${rows.length > 1 ? "s" : ""} récente${rows.length > 1 ? "s" : ""}. ${list}` };
  }
  const noteM = input.match(/^(?:note|prends en note|prend en note|mémorise|retiens)\s*(?:que |: )?\s*(.+)/);
  if (noteM) {
    const content = noteM[1].replace(/[.?!]+$/, "").trim();
    if (content.length >= 2) {
      await db.insert(notes).values({ content });
      return { reply: `Note enregistrée : « ${truncate(content, 100)} ».` };
    }
  }

  /* --- Tâches ---------------------------------------------------------- */
  if (/(efface|supprime|vide) (mes|les|toutes les) tâches/.test(input)) {
    const all = await db.select().from(tasks);
    if (all.length) await db.delete(tasks);
    return { reply: all.length ? "Liste de tâches purgée." : "Votre liste de tâches est déjà vide." };
  }
  const doneM = input.match(/(?:termine|valide|coche|finis)\s+la\s+tâche\s+(\w+)/) ?? input.match(/tâche\s+(\w+)\s+terminée/);
  if (doneM) {
    const idx = toNumber(doneM[1].toLowerCase());
    if (idx != null) {
      const open = await db.select().from(tasks).where(eq(tasks.done, false)).orderBy(asc(tasks.id));
      const target = open[idx - 1];
      if (target) {
        await db.update(tasks).set({ done: true }).where(eq(tasks.id, target.id));
        return { reply: `Tâche ${idx} validée : « ${truncate(target.content, 80)} ». Beau travail.` };
      }
      return { reply: `Je ne trouve pas de tâche numéro ${idx} en cours.` };
    }
  }
  if (/(mes|ma liste de|les) tâches|qu'est-ce que j'ai à faire|que dois-je faire/.test(input)) {
    const open = await db.select().from(tasks).where(eq(tasks.done, false)).orderBy(asc(tasks.id)).limit(6);
    if (!open.length) return { reply: "Aucune tâche en cours. Profitez-en, ou dites : ajoute la tâche, suivi du contenu." };
    const list = open.map((t, i) => `${i + 1} : ${truncate(t.content, 70)}.`).join(" ");
    return { reply: `Vous avez ${open.length} tâche${open.length > 1 ? "s" : ""} en cours. ${list}` };
  }
  const taskM = input.match(/^(?:ajoute (?:une |la )?tâche|nouvelle tâche|tâche)\s*:?\s*(.+)/);
  if (taskM) {
    const content = taskM[1].replace(/[.?!]+$/, "").trim();
    if (content.length >= 2) {
      await db.insert(tasks).values({ content });
      return { reply: `Tâche ajoutée à votre liste : « ${truncate(content, 100)} ».` };
    }
  }

  /* --- 🖥️ CONTRÔLE PC (souris, clavier, fichiers, console — agent local) --- */
  if (/connecte (?:ton|mon|ce) pc|lie (?:ton|mon|ce) pc|installer l'agent|agent jarvis|télécharge l'agent/.test(input)) {
    return {
      reply:
        "Pour me donner les mains sur votre PC, ouvrez l'onglet Système : téléchargez mon agent Jarvis, " +
        "un petit script Python open source basé sur PyAutoGUI, puis lancez-le. Il tourne en arrière-plan, " +
        "se connecte ici tout seul, et je pourrai alors piloter votre souris, votre clavier, vos fichiers et votre console.",
      action: { type: "openPanel", panel: "system" },
    };
  }
  if (/(?:mes )?(pc|machines?|postes?) (connectés?|en ligne|liés?)|aucun pc|pc connecté/.test(input)) {
    const node = await firstOnlineNode();
    return {
      reply: node
        ? `Le PC « ${node.name} » (${node.platform}) est en ligne. Je peux y exécuter des commandes, bouger la souris, taper au clavier, ouvrir des fichiers et faire des captures d'écran.`
        : "Aucun PC n'est relié actuellement. Onglet Système, téléchargez l'agent et lancez-le sur votre machine : il reste actif en arrière-plan.",
      action: { type: "openPanel", panel: "system" },
    };
  }

  // Souris — déplacements, centrage, clics
  if (/centre (?:la )?souris/.test(input)) {
    const r = await runOnPc("mouse_move", { center: true }, {
      success: () => "Souris centrée à l'écran.",
      empty: "Souris centrée à l'écran.",
    });
    return { reply: r.reply, action: { type: "openPanel", panel: "system" } };
  }
  const mouseM = input.match(/(?:déplace|bouge|move)\s+(?:la )?souris/);
  if (mouseM) {
    const mag = parseInt(input.match(/(\d+)/)?.[1] ?? "250", 10);
    let dx = 0, dy = 0, dir = "au hasard";
    if (/gauche/.test(input)) { dx = -mag; dir = `à gauche de ${mag} pixels`; }
    else if (/droite/.test(input)) { dx = mag; dir = `à droite de ${mag} pixels`; }
    else if (/haut/.test(input)) { dy = -mag; dir = `vers le haut de ${mag} pixels`; }
    else if (/bas/.test(input)) { dy = mag; dir = `vers le bas de ${mag} pixels`; }
    else { dx = mag; dy = mag; dir = "en diagonale"; }
    const r = await runOnPc("mouse_move", { dx, dy }, {
      success: () => `Souris déplacée ${dir}.`,
      empty: `Souris déplacée ${dir}.`,
    });
    return { reply: r.reply, action: { type: "openPanel", panel: "system" } };
  }
  if (/double[\s-]?clic/.test(input)) {
    const r = await runOnPc("mouse_click", { button: "left", clicks: 2 }, { success: () => "Double-clic exécuté.", empty: "Double-clic exécuté." });
    return { reply: r.reply };
  }
  if (/clic droit/.test(input)) {
    const r = await runOnPc("mouse_click", { button: "right", clicks: 1 }, { success: () => "Clic droit exécuté.", empty: "Clic droit exécuté." });
    return { reply: r.reply };
  }
  if (/^(?:fais |fait |effectue )?(?:un )?clic(?:que)?(?:s|z)?\s*(?:là|ici)?\s*[.?!]?$/.test(input) || /clique (?:sur )?(?:la souris|l'écran)/.test(input)) {
    const r = await runOnPc("mouse_click", { button: "left", clicks: 1 }, { success: () => "Clic exécuté à la position actuelle.", empty: "Clic exécuté." });
    return { reply: r.reply };
  }

  // Clavier
  const typeM = input.match(/(?:tape|écris|ecris|saisis?)\s+(?:au clavier |le texte )?[:\-]?\s*(.+)/);
  if (typeM && /(clavier|saisi|tape)/.test(input) && !/note|tâche|tache/.test(input.split(" ")[0])) {
    const text = typeM[1].replace(/[.?!]+$/, "");
    const r = await runOnPc("type", { text }, {
      success: () => `Texte tapé au clavier : ${truncate(text, 60)}.`,
      empty: "Texte tapé au clavier.",
    });
    return { reply: r.reply };
  }

  // Console / terminal du PC
  const shM = input.match(/(?:exécute|execute|exécuter|lance|tape)\s+(?:la commande |dans (?:le terminal|la console|l'invite de commandes?) )?[:\-]?\s*(.+)/);
  if (shM && /(commande|terminal|console|invite|shell|\bcmd\b|powershell|bash)/.test(input)) {
    const command = shM[1]
      .replace(/dans (?:le terminal|la console|l'invite de commandes?)$/i, "")
      .replace(/[.?!]+$/, "")
      .trim();
    const r = await runOnPc("shell", { command }, {
      success: (res) => `Commande exécutée sur votre PC. ${truncate(res.output, 260) || "Aucune sortie."} La console complète est dans l'onglet Système.`,
      empty: "Commande exécutée sur votre PC, sans sortie. Consultez l'onglet Système.",
    });
    return { reply: r.reply, action: { type: "openPanel", panel: "system" } };
  }

  // Ouverture d'applications et dossiers du PC
  const pcOpenM = input.match(/ouvre\s+(.+?)\s+sur\s+(?:le|mon|ce)\s+(?:pc|ordinateur)/);
  // Un scénario compose Word/écriture/sauvegarde est traité plus bas en une
  // transaction complète ; ne pas le couper à la première virgule.
  if (pcOpenM && !/(?:[ée]cri(?:s|re)|tape|enregistre|sauvegarde|copie|déplace)/.test(input)) {
    const target = pcOpenM[1]
      .replace(/^(?:le |la |l'|les )?(?:logiciel |application |appli |programme )?/, "")
      .replace(/[.?!]+$/, "")
      .trim();
    const looksLikeFile = /[\\/]|\.[a-z0-9]{1,5}$/i.test(target);
    const payload = looksLikeFile ? { target } : { app: target };
    const r = await runOnPc("open", payload, {
      success: (res) => res.output.toLowerCase().includes("introuvable")
        ? res.output
        : `J'ouvre ${target} sur votre PC.`,
      empty: `J'ouvre ${target} sur votre PC.`,
    });
    return { reply: r.reply };
  }
  const folderM = input.match(/ouvre\s+(?:mes |le dossier )?(documents?|téléchargements?|telechargements?|bureau|images|musique|vidéos?|videos?)(?:\s+du pc)?\s*[.?!]?$/);
  if (folderM) {
    const map: Record<string, string> = {
      documents: "documents", document: "documents",
      téléchargements: "downloads", telechargements: "downloads", téléchargement: "downloads", telechargement: "downloads",
      bureau: "desktop", images: "pictures", musique: "music", vidéos: "videos", video: "videos", videos: "videos", vidéo: "videos",
    };
    const folder = map[folderM[1]] ?? "documents";
    const r = await runOnPc("open", { folder }, {
      success: () => `J'ouvre le dossier ${folder} sur votre PC.`,
      empty: `Dossier ${folder} ouvert sur votre PC.`,
    });
    return { reply: r.reply };
  }
  /* --- 📁 FICHIERS : lire, écrire, copier, créer, supprimer, chercher ---- */
  const fileVerb = input.match(/^(?:jarvis[,\s]*)?(lis|lit|lire|affiche le contenu|ouvre le fichier|écris|ecris|crée|cree|créer|copie|déplace|deplace|supprime|efface|cherche le fichier|trouve le fichier|liste le dossier|liste les fichiers de|exécute|execute|lance le fichier)\s+(.+)/);
  if (fileVerb) {
    const verb = fileVerb[1];
    let rest = fileVerb[2].replace(/[.?!]+$/, "").trim();

    // Écriture : « crée un fichier notes.txt avec le texte Bonjour »
    const writeFile = rest.match(/^(?:un |le |le fichier |fichier )?([\w\-. /\\:]+?)\s+(?:avec|contenant|et (?:écris|ecris|mets))\s+(?:le (?:texte|contenu)\s+)?["«]?(.+?)["»]?$/i);
    if (/^(écris|ecris|crée|cree|créer)$/.test(verb) && writeFile) {
      const r = await runOnPc("file", { op: "write", path: writeFile[1], content: writeFile[2] }, {
        success: (res) => res.output,
        empty: "Fichier créé.",
      });
      return { reply: r.reply, action: { type: "openPanel", panel: "system" } };
    }

    // Copier / déplacer : « copie rapport.docx vers le bureau »
    const twoPaths = rest.match(/^(.+?)\s+(?:vers|dans|sur|en)\s+(?:le |la |mon |mes )?(.+)$/i);
    if (/^(copie|déplace|deplace)$/.test(verb) && twoPaths) {
      const op = verb === "copie" ? "copy" : "move";
      const r = await runOnPc("file", { op, path: twoPaths[1], dest: twoPaths[2] }, {
        success: (res) => res.output,
        empty: "Opération effectuée.",
      });
      return { reply: r.reply };
    }

    const simple: Record<string, string> = {
      "lis": "read", "lit": "read", "lire": "read", "affiche le contenu": "read",
      "ouvre le fichier": "open", "exécute": "execute", "execute": "execute", "lance le fichier": "execute",
      "supprime": "delete", "efface": "delete",
      "liste le dossier": "list", "liste les fichiers de": "list",
      "cherche le fichier": "search", "trouve le fichier": "search",
      "crée": "create", "cree": "create", "créer": "create",
    };
    const op = simple[verb];
    if (op) {
      const payload = op === "search"
        ? { op, pattern: rest.replace(/^(le |la |les )?(fichier |dossier )?/, "") }
        : { op, path: rest.replace(/^(le |la |les |mon |mes )?(fichier |dossier )?/, ""), content: "" };
      const r = await runOnPc("file", payload, {
        success: (res) => {
          const out = res.output.trim();
          if (op === "read") return `Voici le contenu : ${truncate(out, 700)}`;
          if (op === "list") return `Ce dossier contient : ${truncate(out, 500)}`;
          if (op === "search") return `J'ai trouvé : ${truncate(out.replace(/\n/g, " ; "), 500)}`;
          return out;
        },
        empty: "Opération effectuée sur votre PC.",
      });
      return { reply: r.reply, action: { type: "openPanel", panel: "system" } };
    }
  }

  /* --- 📋 Inventaire des logiciels installés ----------------------------- */
  if (/quels? (logiciels?|programmes?|applications?) (sont )?(installés?|as-tu|disponibles?)|liste (mes|les) (logiciels?|programmes?|applications?)/.test(input)) {
    const r = await runOnPc("list_apps", {}, {
      success: (res) => `Logiciels détectés sur votre PC : ${truncate(res.output, 700)}`,
      empty: "Aucun logiciel détecté.",
    });
    return { reply: r.reply, action: { type: "openPanel", panel: "system" } };
  }

  /* --- 📝 SCÉNARIO COMPLET : document Word / traitement de texte -------- */
  // Exemples :
  // « ouvre Word, écris Maman est partie, enregistre sous file, ferme »
  // « lance Word, écris dans une page vierge Bonjour, sauvegarde et ferme »
  const docAppM = input.match(/\b(word|microsoft word|wordpad|bloc-notes|bloc notes|notepad)\b/);
  const wantsSave = /(?:enregistre|sauvegarde|sauve)/.test(input);
  const writeM = input.match(
    /(?:[ée]cri(?:s|re|t)|tape|saisis|note)\s+(?:dans\s+(?:une\s+)?page\s+vierge\s+|dans\s+(?:le\s+)?document\s+|dedans\s+|le\s+texte\s+|:\s*)?["«]?([^"»]+?)["»]?\s*(?=,|\bpuis\b|\bensuite\b|\benregistre|\bsauvegarde|\bsauve|$)/
  );
  const saveM = input.match(
    /(?:enregistre|sauvegarde|sauve)(?:-le|\s+le|\s+le fichier)?\s*(?:sous(?:\s+le\s+nom\s+de)?|en\s+tant\s+que|avec\s+le\s+nom(?:\s+de)?|:)\s*["«]?([\w\-. ]{1,60}?)["»]?\s*(?=\.|,|\bpuis\b|\bensuite\b|\bferme|\brouvre|$)/
  );

  if (docAppM && wantsSave && !writeM) {
    return {
      reply: "Quel texte dois-je écrire dans le document ? Dites par exemple : ouvre Word, écris Maman est partie, enregistre sous le nom de file, puis ferme.",
    };
  }

  if (docAppM && writeM && wantsSave) {
    const appKey = /word\b/.test(docAppM[1]) && !/wordpad/.test(docAppM[1]) ? "word"
      : /wordpad/.test(docAppM[1]) ? "wordpad" : "notepad";
    const text = writeM[1].replace(/\s+(puis|et|ensuite)$/i, "").trim();
    const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
    const filename = (saveM?.[1] ?? `Document-Jarvis-${stamp}`)
      .replace(/\.(docx?|txt|rtf)$/i, "")
      .trim()
      .replace(/[\\/:*?"<>|]/g, "") || `Document-Jarvis-${stamp}`;
    const reopen = /(rouvre|réouvre|reouvre|ouvre[- ]le|ouvre le fichier|rouvrir)/.test(input);
    const close = /(ferme|quitte)/.test(input) || !reopen;
    const jobKind = appKey === "word" ? "word_document" : "write_document";
    const payload = appKey === "word"
      ? { text, filename, close, reopen }
      : { app: appKey, text, filename, reopen };

    const r = await runOnPc(jobKind, payload, {
      success: (res) => res.output,
      empty: "Document créé et enregistré sur votre PC.",
    });
    return {
      reply: r.offline
        ? r.reply
        : `${r.reply} J'ai créé le document « ${filename} », écrit « ${truncate(text, 80)} »` +
          `${close ? ", fermé le document" : ""}${reopen ? " puis rouvert le fichier" : ""}.`,
      action: { type: "openPanel", panel: "system" },
    };
  }

  /* --- ⌨️ Écrire dans la fenêtre active --------------------------------- */
  const typeInAppM = input.match(/(?:[ée]cris|tape|saisis)\s+(?:dans (?:word|le document|la fenêtre)\s+)?["«]?(.{2,200}?)["»]?\s*(?:au clavier)?\s*[.?!]?$/);
  if (typeInAppM && /(dans word|dans le document|dans la fenêtre|au clavier)/.test(input)) {
    const text = typeInAppM[1].trim();
    const r = await runOnPc("type", { text }, {
      success: () => `J'ai tapé « ${truncate(text, 60)} » dans la fenêtre active.`,
      empty: "Texte saisi dans la fenêtre active.",
    });
    return { reply: r.reply };
  }

  /* --- 🖥️ Ouverture d'un logiciel installé ------------------------------ */
  const appLocals: Record<string, string> = {
    "word": "word", "microsoft word": "word", "winword": "word",
    "excel": "excel", "microsoft excel": "excel",
    "powerpoint": "powerpoint", "power point": "powerpoint",
    "outlook": "outlook", "onenote": "onenote", "access": "access",
    "chrome": "chrome", "google chrome": "chrome",
    "firefox": "firefox", "mozilla firefox": "firefox",
    "edge": "edge", "microsoft edge": "edge",
    "vscode": "vscode", "visual studio code": "vscode", "vs code": "vscode",
    "spotify": "spotify", "discord": "discord", "steam": "steam", "vlc": "vlc",
    "paint": "paint", "wordpad": "wordpad",
    "explorateur": "explorer", "explorateur de fichiers": "explorer",
    "gestionnaire des tâches": "taskmgr", "gestionnaire de tâches": "taskmgr",
    "bloc-notes": "notepad", "bloc notes": "notepad", "notepad": "notepad",
    "calculatrice": "calc", "calculatrice windows": "calc",
    "terminal": "terminal", "invite de commandes": "cmd", "invite de commande": "cmd",
    "powershell": "powershell", "panneau de configuration": "control",
  };
  const appM = input.match(/^(?:ouvre|ouvrir|lance|lancer|démarre|exécute)\s+(?:moi\s+)?(?:le |la |l'|les )?(?:logiciel |application |appli |programme )?(.+?)\s*(?:sur (?:mon|le|ce) (?:pc|ordinateur))?\s*[.?!]?$/);
  if (appM) {
    const raw = appM[1].replace(/^(le |la |l'|les )/, "").trim();
    const explicitPcApp = /(logiciel|application|appli|programme|sur (mon|le|ce) (pc|ordinateur))/.test(input);
    // Pour un logiciel inconnu, l'agent recherche le nom dans le menu
    // Demarrer, le registre App Paths et les applications Microsoft Store.
    const target = appLocals[raw] ?? (explicitPcApp ? raw : null);
    if (target) {
      const label = raw.charAt(0).toUpperCase() + raw.slice(1);
      const r = await runOnPc("open", { app: target }, {
        success: (res) => res.output.toLowerCase().includes("introuvable")
          ? res.output
          : `J'ouvre ${label} sur votre PC.`,
        empty: `${label} ouvert sur votre PC.`,
      });
      return { reply: r.reply };
    }
  }

  // Capture d'écran du PC
  if (/(?:fais|fait|prends?)\s+(?:une )?capture d'écran|screenshot (?:du )?pc/.test(input)) {
    const r = await runOnPc("screenshot", {}, {
      success: () => "Capture d'écran reçue de votre PC. Je l'affiche dans le journal.",
      empty: "Capture d'écran reçue, mais l'image semble vide.",
    });
    if (r.attachment) {
      return {
        reply: "Capture d'écran de votre PC, monsieur. Affichée dans le journal.",
        action: { type: "image", url: r.attachment, prompt: "capture d'écran" },
      };
    }
    return { reply: r.reply };
  }

  // Verrouillage / extinction (avec garde-fou annulable)
  if (/verrouille (?:le |mon )?(?:pc|ordinateur|session)/.test(input)) {
    const r = await runOnPc("lock", {}, { success: () => "PC verrouillé.", empty: "PC verrouillé." });
    return { reply: r.reply };
  }
  if (/annule l'extinction|annule(?:r)? l'arrêt/.test(input)) {
    const r = await runOnPc("cancel_shutdown", {}, { success: () => "Extinction annulée.", empty: "Extinction annulée." });
    return { reply: r.reply };
  }
  if (/(?:éteins|eteins|redémarre|redemarre|arrête|arrete) (?:le |mon )?(?:pc|ordinateur)/.test(input)) {
    const reboot = /red[ée]marre/.test(input);
    const r = await runOnPc("shutdown", { reboot, delay: 30 }, {
      success: () => `${reboot ? "Redémarrage" : "Extinction"} programmé dans trente secondes. Dites « annule l'extinction » pour tout stopper.`,
      empty: `${reboot ? "Redémarrage" : "Extinction"} programmé dans trente secondes.`,
    });
    return { reply: r.reply };
  }

  // Listing de dossiers du PC
  if (/liste (?:mes |les )?fichiers(?: (?:du |de mes )?(bureau|documents|téléchargements|telechargements))?/.test(input)) {
    const folder = /bureau/.test(input) ? "desktop" : /t[ée]l[ée]chargements/.test(input) ? "downloads" : "documents";
    const shellCmd =
      folder === "desktop" ? "ls ~/Desktop 2>/dev/null || dir %USERPROFILE%\\Desktop"
      : folder === "downloads" ? "ls ~/Downloads 2>/dev/null || dir %USERPROFILE%\\Downloads"
      : "ls ~/Documents 2>/dev/null || dir %USERPROFILE%\\Documents";
    const r = await runOnPc("shell", { command: shellCmd }, {
      success: (res) => `Dans ce dossier, je vois : ${truncate(res.output.replace(/\n+/g, ", "), 240)}.`,
      empty: "Le dossier est vide ou introuvable.",
    });
    return { reply: r.reply, action: { type: "openPanel", panel: "system" } };
  }

  /* --- 🤖 AGENTS IA (création, liste, invocation) --------------------------- */
  const createAgentM = input.match(/cr[ée]e?(?:r)?(?: | moi | un )agent (?:nommé |appelé )?["«]?([\wàâäéèêëîïôöùûüç-]+)["»]?(?:\s+(?:qui|pour|afin de|dédié à|charge de)\s+(.+))?/);
  if (createAgentM) {
    const name = createAgentM[1].replace(/^l'/, "");
    const role = (createAgentM[2] ?? "assister l'utilisateur avec précision, de manière concise").replace(/[.?!]+$/, "").trim();
    const exists = await db.select().from(agents).where(eq(agents.name, name)).limit(1);
    if (exists.length) {
      await db.update(agents).set({ role }).where(eq(agents.name, name));
      return { reply: `L'agent ${name} existait déjà : j'ai mis à jour sa mission. Invoquez-le en disant : @${name}, suivi de votre demande.` };
    }
    await db.insert(agents).values({ name, role });
    return {
      reply: `Agent ${name} créé. Sa mission : ${truncate(role, 120)}. Parlez-lui ainsi : @${name}, suivi de votre demande. Il répondra avec sa propre spécialité.`,
      action: { type: "openPanel", panel: "system" },
    };
  }
  const delAgentM = input.match(/(?:supprime|efface|détruit) l'agent ["«]?([\wàâäéèêëîïôöùûüç-]+)["»]?/);
  if (delAgentM) {
    const name = delAgentM[1];
    const found = await db.select().from(agents).where(eq(agents.name, name)).limit(1);
    if (found.length) {
      await db.delete(agents).where(eq(agents.name, name));
      return { reply: `Agent ${name} supprimé.` };
    }
    return { reply: `Je ne trouve pas d'agent nommé ${name}.` };
  }
  if (/(liste )?mes agents|quels agents/.test(input)) {
    const all = await db.select().from(agents);
    if (!all.length) return { reply: "Aucun agent créé pour l'instant. Dites : crée un agent nommé Codeur qui m'aide à programmer." };
    const list = all.map((a) => `${a.name} : ${truncate(a.role, 60)}.`).join(" ");
    return { reply: `Vous avez ${all.length} agent${all.length > 1 ? "s" : ""}. ${list}` };
  }
  const invokeM = input.match(/^@([\wàâäéèêëîïôöùûüç-]+)[\s,]+(.+)/) ?? input.match(/parle (?:avec |à )?l'agent ["«]?([\wàâäéèêëîïôöùûüç-]+)["»]?[\s,]+(.+)/);
  if (invokeM) {
    const name = invokeM[1];
    const demand = invokeM[2];
    const found = await db.select().from(agents).where(eq(agents.name, name)).limit(1);
    if (!found.length) return { reply: `Aucun agent nommé ${name}. Créez-le : crée un agent nommé ${name}.` };
    const llm = await askBrain(
      demand,
      [],
      `Tu incarnes l'agent spécialisé « ${name} », sous-système de Jarvis. Ta mission exclusive : ${found[0].role}. ` +
        "Réponds en respectant strictement cette mission, avec ton expertise propre." +
        (lang === "en" ? " The user speaks English: answer in English." : "")
    );
    if (llm) return { reply: `[Agent ${name}] ${llm.text}`, engine: llm.engine, model: llm.model } as EngineResult;
    return { reply: `L'agent ${name} est prêt, mais mon cerveau LLM est hors ligne. Lancez Ollama pour l'animer.` };
  }

  /* --- Musique ---------------------------------------------------------- */
  if (/(mets|met|joue|lance|écouter)\s+(de la\s+)?(musique|du jazz|du rock|du classique|de l'électro|lofi|lo-fi)/.test(input)) {
    const artist = input.match(/(?:joue|jouer|mets|écouter)\s+(.+)/)?.[1]?.replace(/[.?!]+$/, "").trim();
    const q = artist && !/^(de la |du |de l')/.test(artist) ? artist : "musique relaxante";
    return {
      reply: `J'ouvre YouTube sur « ${q} ». Bonne écoute.`,
      action: { type: "open", url: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}` },
    };
  }

  /* --- 🏠 DOMOTIQUE (prioritaire sur l'ouverture de sites) ----------------- */
  try {
    const homeEarly = await homeSkill(input);
    if (homeEarly) return { reply: homeEarly, action: { type: "devicesChanged" } };
  } catch (error) {
    console.error("[JARVIS domotique]", error);
  }

  /* --- Ouverture de sites ------------------------------------------------ */
  const openM = input.match(/^(?:ouvre|ouvrir|lance|vas? sur|va sur|affiche|emmène-moi sur)\s+(.+)/);
  if (openM) {
    let target = openM[1].replace(/[.?!]+$/, "").trim();
    target = target.replace(/^(le |la |les |l'|mon |ma )/, "");
    const site = SITES.find((s) => s.aliases.some((a) => target === a || target.startsWith(a + " ") || target.includes(a)));
    if (site) {
      return { reply: `J'ouvre ${site.name}.`, action: { type: "open", url: site.url } };
    }
    if (/^[\w-]+\.(com|fr|net|org|io|dev|ai|tv)$/.test(target)) {
      return { reply: `J'ouvre ${target}.`, action: { type: "open", url: `https://${target}` } };
    }
    return {
      reply: `« ${target} » n'est pas dans mon répertoire de sites. Je lance une recherche web.`,
      action: { type: "open", url: `https://www.google.com/search?q=${encodeURIComponent(target)}` },
    };
  }

  /* --- Blagues ----------------------------------------------------------- */
  if (/blague|fais(-| )moi rire|quelque chose de drôle|humour/.test(input)) {
    return { reply: pick(JOKES) };
  }

  /* --- Capacités / aide ---------------------------------------------------- */
  if (/que peux-tu faire|qu'est-ce que tu sais faire|tes (fonctionnalités|capacités|compétences)|\baide\b|\bhelp\b|liste des commandes/.test(input)) {
    return {
      reply:
        "Voici mes modules actifs. Horloge : quelle heure est-il. Météo : météo à Tokyo. " +
        "Culture : qui est Nikola Tesla. Calcul : calcule 128 fois 46. Minuterie : minuteur de cinq minutes. " +
        "Rappels : rappelle-moi de boire de l'eau dans vingt minutes. Notes : note que le projet avance. " +
        "Tâches : ajoute la tâche réviser le code. Web : ouvre YouTube. Musique : joue de la musique. " +
        "Domotique : allume la lumière du salon, mode cinéma, éteins tout, thermostat à vingt et un degrés. " +
        "Vision : que vois-tu, ou analyse mon écran. Agenda : ajoute rendez-vous dentiste demain à quatorze heures. " +
        "Messagerie : vérifie mes emails. Création : dessine-moi un phénix mécanique. " +
        "Pilotage PC : connecte mon PC pour installer l'agent, puis je déplace la souris, tape au clavier, " +
        "exécute des commandes console, ouvre vos dossiers et prends des captures d'écran. " +
        "Agents IA : crée un agent nommé Codeur qui m'aide à programmer, puis invoque-le avec @Codeur. " +
        "Et pour toute question, j'interroge Internet en direct puis mon cerveau conversationnel.",
    };
  }

  /* --- 👁️ VISION ------------------------------------------------------------ */
  if (/(que vois-tu|qu'est-ce que tu vois|regarde|active (la )?(caméra|camera|vision)|analyse (la pièce|l'image|ce que tu vois)|ouvre les yeux)/.test(input)) {
    return {
      reply: "J'active mon module optique. Analyse du flux vidéo en cours…",
      action: { type: "vision", analyze: true },
    };
  }
  if (/(ferme les yeux|coupe (la )?(caméra|camera|vision)|désactive la vision|arrête la caméra)/.test(input)) {
    return { reply: "Module optique désactivé.", action: { type: "visionOff" } };
  }

  /* --- 🎨 GÉNÉRATION D'IMAGES (module créatif, gratuit) ----------------------- */
  const imgM = input.match(/(?:dessine(?:-moi)?|génère(?:-moi)? une image|genere(?:-moi)? une image|crée une image|cree une image|imagine|fabrique une image)\s+(?:de |d'|du |des |un |une )?\s*(.+)/);
  if (imgM) {
    const prompt = imgM[1].replace(/[.?!]+$/, "").trim();
    if (prompt.length >= 2) {
      const seed = Math.floor(Math.random() * 1_000_000);
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&seed=${seed}&nologo=true`;
      return {
        reply: `Voici votre image, « ${prompt} ». Rendue par mon pinceau numérique et affichée dans le journal.`,
        speakText: `Voici votre image de ${prompt}. Elle s'affiche dans le journal.`,
        action: { type: "image", url, prompt },
      };
    }
  }

  /* --- 💻 ASSISTANT CODE (via cerveau LLM) ------------------------------------- */
  if (/(écris|ecris|génère|genere|rédige|redige|fais|code|crée|cree)[\s\S]{0,40}(code|fonction|script|composant|programme|regex|requête sql)|aide-moi [àa] coder|code-moi/.test(input)) {
    try {
      const recent = await db.select().from(messages).orderBy(desc(messages.id)).limit(6);
      const hist: BrainMessage[] = recent
        .reverse()
        .map((m) => ({ role: m.role === "jarvis" ? "assistant" : "user", content: m.content }));
      const llm = await askBrain(
        rawInput,
        hist,
        "L'utilisateur demande du CODE. Réponds majoritairement par un bloc de code concis, correct et commenté en français. " +
          "Une courte phrase d'introduction au maximum, puis le code (sans balises markdown), puis une phrase de conclusion très brève." +
          (lang === "en" ? " The user speaks English: introduction and conclusion in English, code comments in French." : "")
      );
      if (llm) {
        return {
          reply: llm.text,
          speakText: "Voici votre code, affiché dans le journal. Il est prêt à être copié.",
          engine: llm.engine,
          model: llm.model,
        } as EngineResult;
      }
      return {
        reply:
          "Mon module code a besoin d'un cerveau LLM pour générer du code. " +
          "Lancez Ollama sur votre machine (ollama pull llama3.1), ou ajoutez une clé OPENAI_API_KEY ou ANTHROPIC_API_KEY dans l'environnement.",
      };
    } catch (error) {
      console.error("[JARVIS code]", error);
    }
  }

  /* --- 🖥️ ANALYSE D'ÉCRAN (contrôle PC étendu) ---------------------------------- */
  if (/(analyse|regarde|lis|lisez|observe)[\s\S]{0,12}(mon écran|l'écran|mon ecran|l'ecran)/.test(input)) {
    return {
      reply: "J'ouvre le module optique sur votre écran. Sélectionnez la fenêtre à analyser.",
      action: { type: "visionScreen", analyze: true },
    };
  }

  /* --- 🧠 ORCHESTRATEUR COGNITIF -------------------------------------------
     Les outils deterministes ont deja eu leur chance. Le routeur decide ici :
       - modele local/cloud pour comprendre et raisonner ;
       - Internet pour les faits frais ;
       - hybride pour recouper puis analyser.
  -------------------------------------------------------------------------- */
  try {
    const recent = await db.select().from(messages).orderBy(desc(messages.id)).limit(12);
    const history: BrainMessage[] = recent
      .reverse()
      .map((m) => ({
        role: m.role === "jarvis" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      }));

    const facts: string[] = [];
    if (userName) facts.push(`L'utilisateur s'appelle ${userName}.`);
    if (lang === "en") facts.push("The user speaks English.");
    const memCity = await getMemory("default_city");
    if (memCity) facts.push(`Ville par defaut : ${memCity}.`);
    const openTasks = await db.select().from(tasks).where(eq(tasks.done, false)).limit(6);
    if (openTasks.length) facts.push(`Taches en cours : ${openTasks.map((t) => t.content).join(" ; ")}.`);
    const lastNotes = await db.select().from(notes).orderBy(desc(notes.id)).limit(5);
    if (lastNotes.length) facts.push(`Notes recentes : ${lastNotes.map((n) => n.content).join(" ; ")}.`);

    const result = await orchestrateRequest({
      input: rawInput,
      history,
      memoryContext: facts.join("\n"),
      lang,
    });

    return {
      reply: result.reply,
      engine: result.engine,
      model: result.model,
      sources: result.sources,
      cognition: {
        route: result.plan.route,
        kind: result.plan.kind,
        confidence: result.plan.confidence,
        reason: result.plan.reason,
      },
    };
  } catch (error) {
    console.error("[JARVIS orchestrateur]", error);
  }

  return {
    reply: "J'ai compris votre demande, mais mon orchestrateur n'a pas pu joindre ses outils ou ses modeles. Je prefere ne pas inventer de reponse.",
    engine: "orchestrator:error",
  };
}

function racine(input: string): boolean {
  return /racine carrée de|au carré/.test(input);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function fmtNum(v: number): string {
  return Number.isInteger(v) ? v.toLocaleString("fr-FR") : v.toLocaleString("fr-FR", { maximumFractionDigits: 6 });
}
