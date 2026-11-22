/**
 * 🌐 MODULE NAVIGATEUR DE JARVIS
 *
 *  Donne à Jarvis les capacités d'un vrai navigateur : chercher sur le web,
 *  ouvrir les pages, lire leur contenu, puis répondre en citant ses sources.
 *
 *  CHAÎNE DE RECHERCHE (dégradation gracieuse, du meilleur au toujours-disponible)
 *   1. SearXNG auto-hébergé   → SEARXNG_URL            (illimité, privé)
 *   2. Brave Search API       → BRAVE_SEARCH_API_KEY   (2000 req/mois gratuites)
 *   3. Tavily (orienté IA)    → TAVILY_API_KEY         (1000 req/mois gratuites)
 *   4. Serper (Google)        → SERPER_API_KEY         (2500 req gratuites)
 *   5. DuckDuckGo via lecteur Jina                      (GRATUIT, par défaut)
 *   6. L'agent du PC de l'utilisateur                   (sort par son IP maison)
 *
 *  LECTURE DE PAGE : r.jina.ai (gratuit) → requête directe → agent PC
 */

import { firstOnlineNode, enqueueJob, waitJob } from "@/lib/jarvis/nodes";
import { askBrain } from "@/lib/jarvis/brain";
import {
  classifyQuestion,
  verifyCompleteness,
  type AnswerContract,
  type QualityVerdict,
} from "@/lib/jarvis/question-quality";

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
  provider?: string;
  relevance?: number;
}

export interface BrowseAnswer {
  text: string;
  sources: { title: string; url: string }[];
  provider: string;
  contract: AnswerContract;
  quality: QualityVerdict;
  partial: boolean;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface CacheEntry { at: number; text: string }
const jinaCache = new Map<string, CacheEntry>();
const jinaInflight = new Map<string, Promise<string | null>>();
let jinaQueue: Promise<unknown> = Promise.resolve();
let lastJinaAt = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Accès discipliné au lecteur Jina : sérialisation, cache, backoff.
 * Empêche les 429 observés pendant le benchmark multi-domaines.
 */
async function jinaText(targetUrl: string, ttlMs: number): Promise<string | null> {
  const proxyUrl = `https://r.jina.ai/${targetUrl}`;
  const cached = jinaCache.get(proxyUrl);
  if (cached && Date.now() - cached.at < ttlMs) return cached.text;
  const existing = jinaInflight.get(proxyUrl);
  if (existing) return existing;

  const task = async (): Promise<string | null> => {
    const gap = Date.now() - lastJinaAt;
    if (gap < 450) await sleep(450 - gap);
    lastJinaAt = Date.now();

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(proxyUrl, {
          cache: "no-store",
          signal: AbortSignal.timeout(25_000),
          headers: { "user-agent": UA, "accept-language": "fr-FR,fr;q=0.9,en;q=0.8", "x-respond-with": "markdown" },
        });
        if (res.ok) {
          const text = await res.text();
          if (text.length > 80) {
            jinaCache.set(proxyUrl, { at: Date.now(), text });
            // Cache borné pour éviter une croissance infinie du serveur.
            if (jinaCache.size > 300) jinaCache.delete(jinaCache.keys().next().value as string);
            return text;
          }
        }
        if (![429, 500, 502, 503, 504].includes(res.status)) return null;
      } catch {
        /* nouvelle tentative */
      }
      await sleep(800 * 2 ** attempt);
    }
    return null;
  };

  const queued = jinaQueue.then(task, task);
  jinaQueue = queued.then(() => undefined, () => undefined);
  jinaInflight.set(proxyUrl, queued);
  try {
    return await queued;
  } finally {
    jinaInflight.delete(proxyUrl);
  }
}

async function httpText(url: string, ms: number, headers: Record<string, string> = {}): Promise<string | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(ms),
      headers: { "user-agent": UA, "accept-language": "fr-FR,fr;q=0.9,en;q=0.8", ...headers },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function httpJson<T>(url: string, ms: number, headers: Record<string, string> = {}): Promise<T | null> {
  const txt = await httpText(url, ms, { accept: "application/json", ...headers });
  if (!txt) return null;
  try {
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

/* ══════════════════════════ RECHERCHE ══════════════════════════ */

async function viaSearxng(q: string): Promise<WebResult[]> {
  const base = (process.env.SEARXNG_URL ?? "").replace(/\/$/, "");
  if (!base) return [];
  const data = await httpJson<{ results?: { title: string; url: string; content?: string }[] }>(
    `${base}/search?q=${encodeURIComponent(q)}&format=json&language=fr&safesearch=0`,
    9000
  );
  return (data?.results ?? []).slice(0, 8).map((r) => ({
    title: r.title ?? "", url: r.url ?? "", snippet: (r.content ?? "").slice(0, 320),
  }));
}

async function viaBrave(q: string): Promise<WebResult[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return [];
  const data = await httpJson<{ web?: { results?: { title: string; url: string; description?: string }[] } }>(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&country=fr&search_lang=fr&count=8`,
    9000,
    { "x-subscription-token": key, accept: "application/json" }
  );
  return (data?.web?.results ?? []).map((r) => ({
    title: r.title ?? "", url: r.url ?? "", snippet: stripTags(r.description ?? "").slice(0, 320),
  }));
}

async function viaTavily(q: string): Promise<WebResult[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_key: key, query: q, max_results: 6, search_depth: "basic", include_answer: true }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const out: WebResult[] = (data?.results ?? []).map((r: { title: string; url: string; content?: string }) => ({
      title: r.title ?? "", url: r.url ?? "", snippet: (r.content ?? "").slice(0, 320),
    }));
    if (data?.answer) out.unshift({ title: "Synthèse Tavily", url: "", snippet: String(data.answer).slice(0, 600) });
    return out;
  } catch {
    return [];
  }
}

async function viaSerper(q: string): Promise<WebResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: { "x-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ q, gl: "fr", hl: "fr", num: 8 }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const out: WebResult[] = [];
    if (data?.answerBox?.answer || data?.answerBox?.snippet) {
      out.push({ title: "Réponse directe", url: data.answerBox.link ?? "", snippet: String(data.answerBox.answer ?? data.answerBox.snippet).slice(0, 500) });
    }
    for (const r of data?.organic ?? []) {
      out.push({ title: r.title ?? "", url: r.link ?? "", snippet: (r.snippet ?? "").slice(0, 320) });
    }
    return out;
  } catch {
    return [];
  }
}

/** GRATUIT par défaut : DuckDuckGo lu à travers le lecteur Jina. */
async function viaJinaDuck(q: string): Promise<WebResult[]> {
  const md = await httpText(
    `https://r.jina.ai/https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`,
    20_000,
    { "x-respond-with": "markdown" }
  );
  if (!md) return [];
  const out: WebResult[] = [];
  const re = /^\d+\.\[(.+?)\]\((https?:\/\/[^)]+)\)\s*\n([^\n]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) && out.length < 8) {
    let url = m[2];
    if (url.includes("duckduckgo.com/l/?uddg=")) {
      try {
        const inner = new URL(url).searchParams.get("uddg");
        if (inner) url = decodeURIComponent(inner);
      } catch {
        /* conserve l'URL d'origine */
      }
    }
    if (!/^https?:\/\//.test(url) || /duckduckgo\.com/.test(url)) continue;
    out.push({
      title: clean(m[1]).slice(0, 110),
      url: url.split("&rut=")[0],
      snippet: clean(m[3]).slice(0, 300),
    });
  }
  return out;
}

/** Bing (moteur d'Edge), utilisé pour le benchmark différentiel. */
async function viaJinaBing(q: string): Promise<WebResult[]> {
  const md = await jinaText(
    `https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=fr`,
    2 * 60_000
  );
  if (!md) return [];
  const out: WebResult[] = [];
  const re = /^## \[(.+?)\]\((https:\/\/www\.bing\.com\/ck\/a[^)]*)\)\s*\n\s*\n([^\n]+)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) && out.length < 8) {
    let url = m[2].replace(/&amp;/g, "&");
    try {
      const encoded = new URL(url).searchParams.get("u");
      if (encoded?.startsWith("a1")) {
        const decoded = Buffer.from(encoded.slice(2), "base64url").toString("utf8");
        if (/^https?:\/\//.test(decoded)) url = decoded;
      }
    } catch {
      /* garde le redirect Bing */
    }
    out.push({ title: clean(m[1]), url, snippet: clean(m[3]), provider: "Bing" });
  }
  return out;
}

/** Ultime recours : la recherche part du PC de l'utilisateur (IP domestique). */
async function viaPcAgent(q: string): Promise<WebResult[]> {
  const node = await firstOnlineNode();
  if (!node) return [];
  const jobId = await enqueueJob(node.id, "web_search", { query: q, limit: 6 });
  const res = await waitJob(jobId, 25_000);
  if (res.status !== "done") return [];
  try {
    const parsed = JSON.parse(res.output);
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

/** Wikipédia sert de contre-source structurée, pas de moteur unique. */
async function viaGoogleNews(q: string): Promise<WebResult[]> {
  const xml = await httpText(
    `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=fr&gl=FR&ceid=FR%3Afr`,
    10_000
  );
  if (!xml) return [];
  const out: WebResult[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) && out.length < 10) {
    const item = m[1];
    const val = (tag: string) => {
      const hit = item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
      return (hit?.[1] ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    };
    const title = stripTags(val("title")).trim();
    const url = val("link").trim();
    const date = val("pubDate").trim();
    if (title && url) out.push({ title, url, snippet: date ? `Publié : ${date}` : title, provider: "Google News" });
  }
  return out;
}

async function viaWikipedia(q: string): Promise<WebResult[]> {
  const data = await httpJson<{
    query?: { search?: { title: string; snippet?: string; pageid: number }[] };
  }>(
    `https://fr.wikipedia.org/w/api.php?action=query&list=search&format=json&utf8=1&srlimit=5&srsearch=${encodeURIComponent(q)}`,
    8000
  );
  return (data?.query?.search ?? []).map((r) => ({
    title: r.title,
    url: `https://fr.wikipedia.org/?curid=${r.pageid}`,
    snippet: stripTags(r.snippet ?? "").replace(/&quot;/g, '"').replace(/&#039;/g, "'").slice(0, 320),
    provider: "Wikipédia",
  }));
}

function searchTokens(q: string): string[] {
  const stop = new Set(["quel", "quelle", "quels", "quelles", "combien", "comment", "pourquoi", "avec", "dans", "pour", "sur", "sont", "est", "une", "des", "les", "aux", "tout", "tous", "cette", "aujourd'hui"]);
  return q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w));
}

function resultRelevance(query: string, r: WebResult): number {
  const tokens = searchTokens(query);
  if (!tokens.length) return 0.5;
  const title = `${r.title} ${r.snippet}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const hits = tokens.filter((t) => title.includes(t)).length;
  const titleHits = tokens.filter((t) => r.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(t)).length;
  return Math.min(1, hits / tokens.length * 0.7 + titleHits / tokens.length * 0.3);
}

function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"].forEach((k) => u.searchParams.delete(k));
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}${u.search}`.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function hostname(raw: string): string {
  try { return new URL(raw).hostname.replace(/^www\./, ""); } catch { return "unknown"; }
}

/** Un moteur à la fois, avec repli en chaîne. */
async function searchSingle(query: string): Promise<{ results: WebResult[]; provider: string }> {
  const chain: { name: string; fn: () => Promise<WebResult[]> }[] = [
    { name: "SearXNG", fn: () => viaSearxng(query) },
    { name: "Brave", fn: () => viaBrave(query) },
    { name: "Tavily", fn: () => viaTavily(query) },
    { name: "Serper", fn: () => viaSerper(query) },
    { name: "DuckDuckGo", fn: () => viaJinaDuck(query) },
    // Bing peut être bruyant : ses résultats passent ensuite par resultRelevance.
    { name: "Bing", fn: () => viaJinaBing(query) },
    { name: "PC-DDGS", fn: () => viaPcAgent(query) },
  ];
  for (const p of chain) {
    try {
      const results = await p.fn();
      // Ne pas considérer « moteur joignable » comme « résultats utiles ».
      const relevant = results.filter((r) => resultRelevance(query, r) >= 0.18);
      if (relevant.length) return { results: relevant.map((r) => ({ ...r, provider: p.name })), provider: p.name };
    } catch {
      /* source suivante */
    }
  }
  return { results: [], provider: "aucune" };
}

/**
 * Recherche fédérée : plusieurs formulations + moteur web + Wikipédia.
 * Les résultats sont dédupliqués et reclassés par pertinence ; maximum deux
 * pages par domaine afin qu'un seul site ne monopolise jamais la réponse.
 */
export async function webSearch(
  query: string,
  contract: AnswerContract = classifyQuestion(query)
): Promise<{ results: WebResult[]; provider: string }> {
  const variantCount = contract.exhaustive ? 3 : contract.timeSensitive || contract.intent === "comparison" ? 2 : 1;
  const variants = contract.queryVariants.slice(0, variantCount);
  const wikiUseful = ["definition", "fact", "list", "count", "comparison"].includes(contract.intent) && !contract.timeSensitive;

  const [batches, wiki, news] = await Promise.all([
    Promise.all(variants.map((q) => searchSingle(q))),
    wikiUseful ? viaWikipedia(query).catch(() => []) : Promise.resolve([]),
    contract.timeSensitive || contract.domain === "news" ? viaGoogleNews(query).catch(() => []) : Promise.resolve([]),
  ]);

  const providers = new Set<string>();
  const merged: WebResult[] = [];
  batches.forEach((b, variantIndex) => {
    providers.add(b.provider);
    b.results.forEach((r, rank) => {
      const relevance = resultRelevance(query, r) + Math.max(0, 0.12 - variantIndex * 0.04) + Math.max(0, 0.08 - rank * 0.01);
      merged.push({ ...r, relevance: Math.min(1, relevance) });
    });
  });
  if (wiki.length) {
    providers.add("Wikipédia");
    wiki.forEach((r, rank) => merged.push({ ...r, relevance: Math.min(1, resultRelevance(query, r) + 0.05 - rank * 0.01) }));
  }
  if (news.length) {
    providers.add("Google News");
    news.forEach((r, rank) => merged.push({ ...r, relevance: Math.min(1, resultRelevance(query, r) + 0.08 - rank * 0.008) }));
  }

  const seen = new Set<string>();
  const perHost = new Map<string, number>();
  const ranked = merged
    .filter((r) => r.url && r.title && (r.relevance ?? 0) >= 0.22)
    .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))
    .filter((r) => {
      const key = canonicalUrl(r.url);
      if (seen.has(key)) return false;
      const host = hostname(r.url);
      const n = perHost.get(host) ?? 0;
      if (n >= 2) return false;
      seen.add(key);
      perHost.set(host, n + 1);
      return true;
    })
    .slice(0, 12);

  return { results: ranked, provider: [...providers].filter((p) => p !== "aucune").join("+") || "aucune" };
}

export interface ProviderSnapshot {
  provider: string;
  available: boolean;
  resultCount: number;
  relevantCount: number;
  domainDiversity: number;
  meanRelevance: number;
  topTitles: string[];
}

function snapshot(provider: string, query: string, results: WebResult[]): ProviderSnapshot {
  const scored = results.map((r) => resultRelevance(query, r));
  return {
    provider,
    available: results.length > 0,
    resultCount: results.length,
    relevantCount: scored.filter((s) => s >= 0.35).length,
    domainDiversity: new Set(results.map((r) => hostname(r.url))).size,
    meanRelevance: scored.length ? Number((scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(3)) : 0,
    topTitles: results.slice(0, 3).map((r) => r.title),
  };
}

/** Comparaison honnête des moteurs utilisés par les navigateurs. */
export async function compareSearchProviders(query: string): Promise<ProviderSnapshot[]> {
  const contract = classifyQuestion(query);
  const [jarvis, ddg, bing, wiki, google] = await Promise.all([
    webSearch(query, contract),
    viaJinaDuck(query).catch(() => []),
    viaJinaBing(query).catch(() => []),
    viaWikipedia(query).catch(() => []),
    viaSerper(query).catch(() => []), // Google via API si une clé est configurée
  ]);
  return [
    snapshot(`Jarvis fédéré (${jarvis.provider})`, query, jarvis.results),
    snapshot("DuckDuckGo / Firefox-compatible", query, ddg),
    snapshot("Bing / Edge", query, bing),
    snapshot("Wikipédia", query, wiki),
    snapshot(process.env.SERPER_API_KEY ? "Google / Chrome (Serper)" : "Google / Chrome (clé absente)", query, google),
  ];
}

/* ══════════════════════════ LECTURE DE PAGE ══════════════════════════ */

/**
 * Extrait le CORPS DE L'ARTICLE avec Mozilla Readability (moteur du mode
 * lecture de Firefox) : supprime menus, fils d'Ariane, bandeaux et pieds de page.
 */
async function readableArticle(html: string, url: string): Promise<string | null> {
  try {
    const { JSDOM } = await import("jsdom");
    const { Readability } = await import("@mozilla/readability");
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document, { charThreshold: 200 }).parse();
    const text = (article?.textContent ?? "").replace(/\n{2,}/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
    return text.length > 250 ? text : null;
  } catch {
    return null;
  }
}

export async function readPage(url: string, maxChars = 6000): Promise<string | null> {
  // 1. HTML direct + Readability → le meilleur résultat quand le site répond
  const html = await httpText(url, 12_000);
  if (html && html.length > 500) {
    const article = await readableArticle(html, url);
    if (article) return article.slice(0, maxChars);
  }

  // 2. Lecteur Jina (exécute le JavaScript, contourne les blocages)
  const md = await httpText(`https://r.jina.ai/${url}`, 22_000, { "x-respond-with": "markdown" });
  if (md && md.length > 200) return tidyMarkdown(md).slice(0, maxChars);

  // 3. Extraction maison sur le HTML brut
  if (html && html.length > 200) {
    const txt = htmlToText(html);
    if (txt.length > 200) return txt.slice(0, maxChars);
  }

  // 3. Par le PC de l'utilisateur
  const node = await firstOnlineNode();
  if (node) {
    const jobId = await enqueueJob(node.id, "fetch_url", { url });
    const res = await waitJob(jobId, 25_000);
    if (res.status === "done" && res.output.length > 120) return res.output.slice(0, maxChars);
  }
  return null;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}

function clean(s: string): string {
  return s.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

function tidyMarkdown(md: string): string {
  return md
    .replace(/^Title:.*$/m, "")
    .replace(/^URL Source:.*$/m, "")
    .replace(/^Published Time:.*$/m, "")
    .replace(/^Markdown Content:/m, "")
    .replace(/\[?!\[[^\]]*\]\([^)]*\)\]?\([^)]*\)/g, " ")  // images cliquables
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")                  // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")                // liens → texte
    .replace(/\(?blob:[^\s)]*\)?/g, " ")                    // résidus blob:
    .replace(/\(?data:image[^\s)]*\)?/g, " ")
    .replace(/[*_`>#|]/g, " ")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/* ───────── Détection du contenu parasite (menus, bandeaux, pubs) ───────── */

const BOILERPLATE =
  /(accepter|refuser|cookies?|consentement|newsletter|s'inscrire|inscrivez|connexion|se connecter|créer un compte|mon compte|menu|navigation|plan du site|mentions légales|tous droits réservés|publicité|abonnez|abonnement|politique de confidentialité|conditions générales|partager|suivez-nous|skip to|accessibility|voir plus|lire la suite|chargement|rechercher|filtrer|trier par|paramétrer|gérer mes choix|nos partenaires|mesure d'audience|fonctionnalités liées|contenu personnalisé|mesure de performance|développer et améliorer|données de géolocalisation|identification par analyse|stocker ou accéder|profils? (?:publicitaires?|de contenu)|annonces? personnalisées?|finalités|vie privée|votre expérience|third.?part|privacy|terms of)/i;

/** Retire les blocs de consentement RGPD / bandeaux, fréquents en tête de page. */
function stripConsent(text: string): string {
  const lines = text.split(/\n+/);
  const kept = lines.filter((l) => {
    const t = l.trim();
    if (t.length < 3) return false;
    if (BOILERPLATE.test(t) && t.length < 160) return false;
    return true;
  });
  return kept.join("\n");
}

/** Fil d'Ariane / barre de menu : « Accueil, Santé, Maladies, Grippe ». */
function isBreadcrumb(s: string): boolean {
  const segs = s.split(/\s*[,|›>»·•]\s*/).map((x) => x.trim()).filter(Boolean);
  if (segs.length < 3) return false;
  const shortTitled = segs.filter((x) => x.length < 28 && /^[A-ZÀ-Ý0-9]/.test(x)).length;
  return shortTitled / segs.length >= 0.6;
}

/** Une phrase ressemble-t-elle à de la prose informative ? */
function isProse(s: string): boolean {
  if (s.length < 45 || s.length > 400) return false;
  if (BOILERPLATE.test(s)) return false;
  if (isBreadcrumb(s)) return false;
  // Notes de bas de page et références (Wikipédia), légendes de média
  if (/^[↑^]|^\s*«\s*$|^(source|crédit|photo|vidéo|illustration)\s*(de la vidéo)?\s*:/i.test(s.trim())) return false;
  if (/\[\[\d+\]\]|\bcite note\b/.test(s)) return false;

  const words = s.split(/\s+/);
  if (words.length < 8) return false;

  // Suite de titres de menu : beaucoup de mots capitalisés isolés
  const capRatio = words.filter((w) => /^[A-ZÀ-Ý]/.test(w)).length / words.length;
  if (capRatio > 0.5) return false;

  // Une vraie phrase contient des mots-outils
  if (!/\b(le|la|les|un|une|des|du|de|est|sont|a|ont|et|ou|en|dans|pour|par|avec|qui|que|se|sur|au|aux|ce|cette|il|elle|on|plus|the|is|are|was|were|of|and|to|in)\b/i.test(s))
    return false;

  // Trop de ponctuation de liste
  const seps = (s.match(/[|•·\t]/g) ?? []).length;
  if (seps > 2) return false;

  // Densité de caractères alphabétiques
  const alpha = (s.match(/[a-zà-ÿA-ZÀ-Ý]/g) ?? []).length;
  if (alpha / s.length < 0.55) return false;

  return true;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|nav|footer|header|aside|noscript|svg|form)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/* ══════════════════════════ SYNTHÈSE ══════════════════════════ */

const STOP = new Set([
  "le","la","les","un","une","des","du","de","et","ou","à","a","au","aux","en","dans","sur","pour","par",
  "que","qui","quoi","est","sont","ce","cette","ces","mon","ma","mes","son","sa","ses","il","elle","on",
  "je","tu","nous","vous","ils","elles","plus","moins","avec","sans","quel","quelle","quels","quelles",
  "combien","comment","pourquoi","quand","où","ou","the","of","and","is","to","in","jarvis","dis","moi",
]);

function keywords(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/**
 * Résumé extractif multi-sources : on note chaque phrase de CHAQUE page,
 * on écarte les menus/bandeaux, et on garde les meilleures, variées.
 */
function extractive(query: string, corpus: { text: string; title: string }[], want = 3): string {
  const kw = keywords(query);
  if (!kw.length) return "";
  const scored: { s: string; score: number; doc: number }[] = [];

  corpus.forEach((doc, di) => {
    const sentences = doc.text
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(isProse);

    for (const s of sentences.slice(0, 200)) {
      const low = s.toLowerCase();
      const hits = kw.filter((k) => low.includes(k)).length;
      if (!hits) continue;
      let score = hits * 2;
      score += hits / kw.length;                       // couverture de la question
      if (/\d/.test(s)) score += 0.8;                  // présence de faits chiffrés
      if (/\b(est|sont|signifie|correspond|permet|consiste|désigne|compte|mesure)\b/i.test(s)) score += 0.6;
      if (s.length > 90 && s.length < 260) score += 0.4;
      if (di === 0) score += 0.3;                      // léger bonus au meilleur résultat
      scored.push({ s, score, doc: di });
    }
  });

  scored.sort((a, b) => b.score - a.score);

  const picked: string[] = [];
  const usedDocs = new Set<number>();
  // 1er passage : au plus une phrase par page (diversité des sources)
  for (const c of scored) {
    if (picked.length >= want) break;
    if (usedDocs.has(c.doc)) continue;
    if (picked.some((p) => similar(p, c.s))) continue;
    picked.push(c.s);
    usedDocs.add(c.doc);
  }
  // 2e passage : on complète avec les meilleures restantes
  for (const c of scored) {
    if (picked.length >= want) break;
    if (picked.some((p) => similar(p, c.s))) continue;
    picked.push(c.s);
  }
  return picked.join(" ");
}

/**
 * Extrait une énumération (listes à puces) RÉELLEMENT liée à la question.
 * Exigeant : chaque item doit contenir un mot-clé de la question, sinon on
 * récolterait les listes de consentement et les menus.
 */
function extractList(query: string, corpus: { text: string; title: string }[], max = 10): string[] {
  const kw = keywords(query);
  if (kw.length < 1) return [];
  const items: string[] = [];
  const seen = new Set<string>();
  let relevant = 0;

  for (const doc of corpus) {
    for (const raw of doc.text.split(/\n+/)) {
      const isBullet = /^\s*(?:[-–—•*·]|\d{1,2}[.)])\s+/.test(raw);
      if (!isBullet) continue;
      const line = raw.replace(/^\s*(?:[-–—•*·]|\d{1,2}[.)])\s*/, "").replace(/\s+/g, " ").trim();
      if (line.length < 4 || line.length > 130) continue;
      if (BOILERPLATE.test(line)) continue;
      if (/^(https?:|www\.)/i.test(line)) continue;

      const low = line.toLowerCase();
      const key = low.slice(0, 40);
      if (seen.has(key)) continue;
      seen.add(key);
      if (kw.some((k) => low.includes(k))) relevant++;
      items.push(line);
      if (items.length >= max * 2) break;
    }
  }
  // La liste n'est retenue que si elle parle vraiment du sujet
  if (items.length < 3 || relevant / items.length < 0.25) return [];
  return items.slice(0, max);
}

function similar(a: string, b: string): boolean {
  const A = new Set(a.toLowerCase().split(/\s+/));
  const B = new Set(b.toLowerCase().split(/\s+/));
  let common = 0;
  B.forEach((w) => { if (A.has(w)) common++; });
  return common / Math.max(1, Math.min(A.size, B.size)) > 0.6;
}

/** Nettoie la sortie pour qu'elle soit agréable à écouter. */
function speakable(s: string): string {
  return s
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s*\|\s*/g, ", ")
    .replace(/\s*[·•]\s*/g, ", ")
    // Sépare les phrases collées (« …parfaite.Il est… »), sans casser les mots type JavaScript
    .replace(/([a-zà-ÿ]{2})([.!?])([A-ZÀ-Ý])/g, "$1$2 $3")
    .replace(/(\d)\s*-\s*(\d)/g, "$1 à $2")        // « 1 - 2 » → « 1 à 2 »
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/(\.\s*){2,}/g, ". ")
    .trim();
}

function estimateItems(text: string, contract: AnswerContract): number {
  if (contract.intent === "count") {
    const m = text.match(/(?:j'en compte|il y (?:en )?a|compte|total(?: de)?|sont au nombre de)\s+(\d{1,4})/i);
    if (m) return Number(m[1]);
  }
  if (contract.intent === "list" || contract.intent === "count" || contract.intent === "procedure") {
    const semis = (text.match(/;/g) ?? []).length;
    if (semis) return semis + 1;
    const numbered = text.match(/(?:^|\s)\d{1,2}[.)]\s/g)?.length ?? 0;
    if (numbered) return numbered;
    const commas = (text.match(/,/g) ?? []).length;
    return commas >= 2 ? Math.min(20, commas + 1) : 0;
  }
  return 0;
}

function estimateAspects(text: string): number {
  const contrast = text.match(/\b(contrairement|alors que|tandis que|avantage|inconvénient|différence|plus|moins|cependant|en revanche)\b/gi)?.length ?? 0;
  const sentences = text.split(/[.!?;]+/).filter((s) => s.trim().length > 25).length;
  return Math.min(6, Math.max(contrast, sentences));
}

function finalizeAnswer(
  rawText: string,
  contract: AnswerContract,
  sources: { title: string; url: string }[],
  provider: string,
  explicitItems = 0
): BrowseAnswer {
  const day = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const sourceCount = new Set(sources.map((s) => hostname(s.url))).size;
  const itemCount = Math.max(explicitItems, estimateItems(rawText, contract));
  const aspectCount = estimateAspects(rawText);
  const boilerHits = (rawText.match(BOILERPLATE) ?? []).length;

  const pre = verifyCompleteness(contract, {
    sourceCount,
    itemCount,
    aspectCount,
    hasScope: !contract.mustStateScope,
    hasDate: !contract.timeSensitive,
    answerLength: rawText.length,
    boilerplateRatio: boilerHits ? 0.3 : 0,
  });

  // Les limites factuelles ne sont jamais masquées : elles sont annoncées.
  const substantiveMissing = pre.missing.filter((m) => !["scope", "date"].includes(m));
  const partial = substantiveMissing.length > 0;
  let text = speakable(rawText);

  if (contract.timeSensitive) text += ` Informations vérifiées le ${day}.`;
  if (contract.mustStateScope) {
    if (partial) {
      text += ` Réponse partielle transparente : ${sourceCount} source${sourceCount > 1 ? "s" : ""} indépendante${sourceCount > 1 ? "s" : ""} consultée${sourceCount > 1 ? "s" : ""}`;
      if (itemCount) text += `, ${itemCount} élément${itemCount > 1 ? "s" : ""} confirmé${itemCount > 1 ? "s" : ""}`;
      text += "; je ne peux pas garantir que la liste soit exhaustive.";
    } else {
      text += ` Périmètre : ${sourceCount} source${sourceCount > 1 ? "s" : ""} indépendante${sourceCount > 1 ? "s" : ""} consultée${sourceCount > 1 ? "s" : ""}`;
      if (itemCount) text += `, ${itemCount} élément${itemCount > 1 ? "s" : ""} recoupé${itemCount > 1 ? "s" : ""}`;
      text += ".";
    }
  }
  if (contract.highStakes) {
    text += contract.domain === "health"
      ? " Ces informations ne remplacent pas l'avis d'un professionnel de santé."
      : contract.domain === "legal"
        ? " Vérifiez ce point avec un professionnel du droit ou le texte officiel applicable."
        : " Pour une décision financière, vérifiez les données de marché auprès de votre intermédiaire.";
  }

  const quality = verifyCompleteness(contract, {
    sourceCount,
    itemCount,
    aspectCount,
    hasScope: true,
    hasDate: true,
    answerLength: text.length,
    boilerplateRatio: boilerHits ? 0.3 : 0,
  });

  // Les listes complètes peuvent être longues : ne plus les tronquer à 900 caractères.
  const maxLength = contract.exhaustive || contract.intent === "list" || contract.intent === "count" ? 2600 : 1500;
  return { text: text.slice(0, maxLength), sources, provider, contract, quality, partial };
}

/**
 * 🧭 NAVIGATION COMPLÈTE : chercher → ouvrir les pages → lire → répondre.
 */
export async function browseAnswer(query: string, lang: "fr" | "en" = "fr"): Promise<BrowseAnswer | null> {
  const contract = classifyQuestion(query);
  const { results, provider } = await webSearch(query, contract);
  if (!results.length) return null;

  const sources = results.filter((r) => r.url).slice(0, 4).map((r) => ({ title: r.title, url: r.url }));

  // Type de réponse attendue
  const wantsList = /\b(quels?|quelles?|liste|lister|cite|énumère|enumere|tous les|toutes les|exemples?|étapes?|ingr[ée]dients?)\b/i.test(query);
  const wantsCount = /\bcombien\b/i.test(query);

  // Lecture en parallèle des 3 meilleures pages (comme ouvrir trois onglets)
  const toRead = results.filter((r) => r.url).slice(0, 3);
  const pages = await Promise.all(
    toRead.map(async (r) => {
      const raw = (await readPage(r.url, 7000)) ?? "";
      return { title: r.title, text: stripConsent(raw) };
    })
  );
  const corpus = pages.filter((p) => p.text.length > 150);

  // Contexte = extraits de pages + résumés des résultats
  const snippetBlock = results.slice(0, 5).map((r, i) => `[${i + 1}] ${r.title} — ${r.snippet}`).join("\n");
  const pageBlock = corpus.map((p, i) => `=== PAGE ${i + 1} : ${p.title} ===\n${p.text.slice(0, 3500)}`).join("\n\n");

  // 1) Synthèse par le cerveau LLM si disponible
  try {
    const llm = await askBrain(
      query,
      [],
      `Tu viens de naviguer sur le web. Voici ce que tu as lu (date du jour : ${new Date().toLocaleDateString("fr-FR")}).\n\n` +
        `RÉSULTATS DE RECHERCHE :\n${snippetBlock}\n\n${pageBlock}\n\n` +
        (wantsList
          ? "L'utilisateur demande une LISTE : énumère TOUS les éléments trouvés, séparés par des virgules, sans en omettre. "
          : wantsCount
            ? "L'utilisateur demande un NOMBRE : donne le compte exact puis détaille brièvement. "
            : "Réponds en 2 à 4 phrases, avec les chiffres et noms exacts. ") +
        "Utilise UNIQUEMENT ces informations. Si l'information n'y est pas, dis-le franchement. " +
        "Pas de markdown ni d'URL : ta réponse sera lue à voix haute." +
        (lang === "en" ? " Answer in English." : " Réponds en français.")
    );
    if (llm?.text) return finalizeAnswer(llm.text, contract, sources, provider);
  } catch {
    /* repli extractif */
  }

  // 2) Repli sans LLM
  const site = sources[0]?.url ? new URL(sources[0].url).hostname.replace(/^www\./, "") : "le web";

  // 2a. Question de type liste → on énumère vraiment
  if ((wantsList || wantsCount) && corpus.length) {
    const items = extractList(query, corpus, 10);
    if (items.length >= 3) {
      const head = wantsCount ? `J'en compte ${items.length} d'après les pages consultées` : "Éléments confirmés";
      return finalizeAnswer(`${head} : ${items.join(" ; ")}.`, contract, sources, provider, items.length);
    }
  }

  // 2b. Synthèse extractive multi-pages (plus de phrases pour les listes)
  const fromPages = corpus.length ? extractive(query, corpus, wantsList ? 4 : 3) : "";
  let body = fromPages;

  // 2c. Complément par les résumés de recherche si la moisson est maigre
  if (body.length < 140) {
    const snips = results
      .map((r) => r.snippet)
      .filter((s) => s.length > 50 && !BOILERPLATE.test(s))
      .slice(0, 3);
    const merged = [body, ...snips].filter(Boolean).join(" ");
    body = merged;
  }

  if (!body || body.length < 40) return null;
  return finalizeAnswer(`D'après ${site} : ${body}`, contract, sources, provider);
}
