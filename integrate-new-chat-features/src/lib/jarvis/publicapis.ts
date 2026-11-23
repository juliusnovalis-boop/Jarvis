/**
 * 🌐 MODULE API PUBLIQUES — catalogue issu de github.com/public-apis/public-apis
 *
 *  Deux rôles :
 *   1. Répertoire documenté des API publiques (nom, catégorie, doc, authentification)
 *      affiché par le panneau « API » de l'interface J.A.R.V.I.S.
 *   2. Point d'appel unique `callPublicApi(id, q)` pour les API **sans clé**
 *      branchées dans le moteur d'intentions (commandes vocales/textuelles).
 *
 *  Toutes les API branchées sont gratuites et sans clé : aucun secret requis,
 *  aucune requête facturée. Les entrées « clé requise » restent consultables
 *  dans le catalogue mais l'appel est désactivé tant qu'aucune clé n'existe.
 */

export type ApiAuth = "none" | "key";

export interface PublicApiInfo {
  id: string;
  name: string;
  category: string;
  description: string;
  docs: string;
  auth: ApiAuth;
  /** Déjà branchée dans le moteur d'intentions de Jarvis. */
  wired: boolean;
  /** Requête d'exemple pour le bouton « Tester ». */
  sample: string;
}

export interface ApiHit {
  ok: boolean;
  text: string;
  /** Nom affiché comme source dans le journal. */
  source: string;
  url?: string;
  image?: string;
}

type Handler = (q: string) => Promise<ApiHit>;

const UA = "JARVIS/1.0 (github.com/juliusnovalis-boop/Jarvis)";
const miss = (source: string, why = "le service ne répond pas pour le moment."): ApiHit => ({
  ok: false,
  text: `Impossible d'interroger ${source} : ${why}`,
  source,
});

async function jget(url: string, ms = 9000): Promise<any> {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": UA },
      cache: "no-store",
      signal: AbortSignal.timeout(ms),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const nf = (max = 2) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: max });
const dfr = (iso: string) => {
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(iso));
  } catch {
    return iso;
  }
};

/* ========================================================================== *
 *  GÉOGRAPHIE — géocodage Open-Meteo (réutilisé météo + qualité de l'air)
 * ========================================================================== */

interface Place {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  /** ISO-3166-1 alpha-2 — présent quand le résultat est un pays (PCLI). */
  country_code?: string;
  /** Population du pays (résultat de niveau pays uniquement). */
  population?: number;
}

async function geocode(q: string): Promise<Place | null> {
  const city = (q || "Paris").trim();
  const data = await jget(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr&format=json`,
    7000
  );
  const p = data?.results?.[0];
  if (!p) return null;
  return {
    name: p.name ?? city,
    latitude: p.latitude,
    longitude: p.longitude,
    country: p.country,
    country_code: p.country_code,
    population: typeof p.population === "number" ? p.population : undefined,
  };
}

/** Traduction des libellés Banque mondiale (anglais → français). */
const REGIONS: Record<string, string> = {
  "East Asia & Pacific": "Asie-Pacifique",
  "Europe & Central Asia": "Europe & Asie centrale",
  "Latin America & Caribbean": "Amérique latine & Caraïbes",
  "Middle East & North Africa": "Moyen-Orient & Afrique du Nord",
  "North America": "Amérique du Nord",
  "South Asia": "Asie du Sud",
  "Sub-Saharan Africa": "Afrique subsaharienne",
};
const INCOMES: Record<string, string> = {
  "High income": "élevé",
  "Upper middle income": "intermédiaire supérieur",
  "Lower middle income": "intermédiaire inférieur",
  "Low income": "faible",
};

const WMO: Record<number, string> = {
  0: "ciel dégagé", 1: "peu nuageux", 2: "partiellement nuageux", 3: "couvert",
  45: "brouillard", 48: "brouillard givrant",
  51: "bruine légère", 53: "bruine", 55: "bruine dense",
  56: "bruine verglaçante", 57: "bruine verglaçante dense",
  61: "pluie faible", 63: "pluie", 65: "pluie forte",
  66: "pluie verglaçante", 67: "pluie verglaçante forte",
  71: "neige faible", 73: "neige", 75: "neige forte", 77: "grains de neige",
  80: "averses faibles", 81: "averses", 82: "averses violentes",
  85: "averses de neige", 86: "averses de neige fortes",
  95: "orage", 96: "orage grêle", 99: "orage violent grêle",
};

/* ========================================================================== *
 *  HANDLERS — API sans clé réellement branchées dans Jarvis
 * ========================================================================== */

const CUR: Record<string, string> = {
  dollar: "USD", dollars: "USD", usd: "USD", "€": "EUR", euro: "EUR", euros: "EUR", eur: "EUR",
  livre: "GBP", livres: "GBP", pound: "GBP", pounds: "GBP", gbp: "GBP",
  yen: "JPY", jpy: "JPY", yuan: "CNY", cny: "CNY", rmb: "CNY",
  franc: "CHF", francs: "CHF", chf: "CHF",
  rouble: "RUB", roubles: "RUB", rub: "RUB",
  roupie: "INR", roupies: "INR", inr: "INR",
  real: "BRL", reais: "BRL", brl: "BRL",
  couronne: "SEK", couronnes: "SEK", sek: "SEK", dkk: "DKK", nok: "NOK",
  zloty: "PLN", pln: "PLN", lira: "TRY", try: "TRY",
  won: "KRW", krw: "KRW", hkd: "HKD", aud: "AUD", cad: "CAD", nzd: "NZD",
  rand: "ZAR", zar: "ZAR", mxn: "MXN", ruble: "RUB",
};

function currencyTokens(s: string): string[] {
  const found: string[] = [];
  const words = s.replace(/[^a-zà-ÿ0-9€$ ]/g, " ").split(/\s+/);
  for (const w of words) {
    const bare = w.replace(/[$€]/g, "").trim();
    const code = CUR[bare] ?? (w === "€" ? "EUR" : undefined);
    if (code && !found.includes(code)) found.push(code);
    if (found.length === 2) break;
  }
  return found;
}

const HANDLERS: Record<string, Handler> = {
  /* 💱 Taux de change — Frankfurter (BCE) */
  async currency(q) {
    const tokens = currencyTokens(q);
    const from = tokens[0] ?? "EUR";
    let to = tokens[1];
    if (!to) to = from === "EUR" ? "USD" : "EUR";
    if (from === to) return { ok: true, text: `Le ${from} vaut déjà ${to} : taux 1,00.`, source: "Frankfurter" };
    const amount = (() => {
      const m = q.replace(",", ".").match(/(\d+(?:\.\d+)?)/);
      const v = m ? Number(m[1]) : 1;
      return Number.isFinite(v) && v > 0 ? v : 1;
    })();

    let data = await jget(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
    if (!data?.rates?.[to]) {
      data = await jget(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`);
    }
    const rate = data?.rates?.[to];
    if (!rate) return miss("Frankfurter", `taux ${from}→${to} indisponible.`);
    const out = amount * rate;
    return {
      ok: true,
      text:
        `${nf(0).format(amount)} ${from} = ${nf(out > 100 ? 2 : 4).format(out)} ${to} ` +
        `(1 ${from} = ${nf(4).format(rate)} ${to}, dernier taux BCE ${data.date ? `du ${dfr(data.date)}` : ""}).`.replace("  ", " "),
      source: "Frankfurter · Banque centrale européenne",
      url: "https://www.frankfurter.app/",
    };
  },

  /* 🌍 Fiche pays — géocodage Open-Meteo (code ISO + population)
     + Banque mondiale (capitale, région, niveau de revenu).
     REST Countries est passé en clé (v5) : on utilise deux sources libres. */
  async country(q) {
    const raw = (q || "").trim();
    if (!raw) return { ok: false, text: "Précisez le pays : « capital du Japon ».", source: "Banque mondiale" };
    const place = await geocode(raw.charAt(0).toUpperCase() + raw.slice(1));
    const code = place?.country_code;
    if (!code) return { ok: false, text: `Aucun pays nommé « ${raw} » trouvé.`, source: "Open-Meteo" };

    const [info, pop] = await Promise.all([
      jget(`https://api.worldbank.org/v2/country/${code}?format=json`, 9000),
      jget(`https://api.worldbank.org/v2/country/${code}/indicator/SP.POP.TOTL?format=json&mrnev=1`, 9000),
    ]);
    const c = Array.isArray(info) && Array.isArray(info[1]) ? info[1][0] : null;
    const population = pop?.[1]?.[0]?.value ?? place.population;
    const regionRaw = String(c?.region?.value ?? "").trim();
    const incomeRaw = String(c?.incomeLevel?.value ?? "").trim();
    const region = regionRaw ? (REGIONS[regionRaw] ?? regionRaw) : null;
    const income = incomeRaw ? (INCOMES[incomeRaw] ?? incomeRaw) : null;
    const label = place.name || c?.name || raw;

    const parts = [
      c?.capitalCity ? `Capitale : ${c.capitalCity}` : null,
      population ? `Population : ${nf(0).format(population)}` : null,
      region ? `Région : ${region}` : null,
      income ? `Revenu : ${income}` : null,
      `Code ISO : ${code}`,
    ].filter(Boolean);

    return {
      ok: true,
      text: `${label} — ${parts.join(" · ")}.`,
      source: "Banque mondiale × Open-Meteo",
      url: `https://fr.wikipedia.org/w/index.php?search=${encodeURIComponent(label)}&ns0=1`,
    };
  },

  /* 🪙 Cours de crypto — CoinGecko */
  async crypto(q) {
    const map: Record<string, string> = {
      bitcoin: "bitcoin", btc: "bitcoin", ethereum: "ethereum", eth: "ethereum",
      solana: "solana", sol: "solana", dogecoin: "dogecoin", doge: "dogecoin",
      ripple: "ripple", xrp: "ripple", cardano: "cardano", ada: "cardano",
      litecoin: "litecoin", ltc: "litecoin", "monero": "monero", tron: "tron",
    };
    const key = Object.keys(map).find((k) => q.includes(k));
    const id = key ? map[key] : "bitcoin";
    const data = await jget(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=eur,usd&include_24hr_change=true`
    );
    const row = data?.[id];
    if (!row) return miss("CoinGecko", "cours indisponible (quota atteint ?).");
    const label = id.charAt(0).toUpperCase() + id.slice(1);
    const ch = row.eur_24h_change;
    const sign = typeof ch === "number" ? (ch >= 0 ? "+" : "") : "";
    return {
      ok: true,
      text:
        `${label} : ${nf(2).format(row.eur)} € · ${nf(0).format(row.usd)} $` +
        (typeof ch === "number" ? ` — variation 24 h : ${sign}${nf(2).format(ch)} %` : ""),
      source: "CoinGecko",
      url: `https://www.coingecko.com/fr/coins/${id}`,
    };
  },

  /* 🛰️ Position de l'ISS — Where The ISS At (hôte API, pas le site) */
  async iss() {
    const d = await jget("https://api.wheretheiss.at/v1/satellites/25544");
    if (!d || typeof d.latitude !== "number") return miss("Where The ISS At");
    const ns = d.latitude >= 0 ? "N" : "S";
    const ew = d.longitude >= 0 ? "E" : "O";
    const vis =
      d.visibility === "daylight" ? "au soleil" :
      d.visibility === "sunlight" ? "au soleil" :
      d.visibility === "eclipse" ? "dans l'ombre de la Terre" :
      d.visibility ? String(d.visibility) : "inconnue";
    return {
      ok: true,
      text:
        `L'ISS circule à ${nf(0).format(d.altitude)} km d'altitude, à ${nf(0).format(d.velocity)} km/h, ` +
        `au point ${nf(2).format(Math.abs(d.latitude))}° ${ns} / ${nf(2).format(Math.abs(d.longitude))}° ${ew}. ` +
        `Visibilité : ${vis}.`,
      source: "Where The ISS At",
      url: `https://wheretheiss.at/w/25544/${d.latitude},${d.longitude}`,
    };
  },

  /* 🍳 Recette au hasard — TheMealDB */
  async recipe() {
    const d = await jget("https://www.themealdb.com/api/json/v1/1/random.php");
    const m = d?.meals?.[0];
    if (!m) return miss("TheMealDB");
    const steps = String(m.strInstructions ?? "").replace(/\s+/g, " ").trim();
    return {
      ok: true,
      text:
        `« ${m.strMeal} » — ${m.strCategory ?? "plat"} (${m.strArea ?? "monde"}). ` +
        `${steps.slice(0, 260)}${steps.length > 260 ? "…" : ""}`,
      source: "TheMealDB",
      url: `https://www.themealdb.com/meal/${m.idMeal}`,
    };
  },

  /* 🍸 Cocktail au hasard — TheCocktailDB */
  async cocktail() {
    const d = await jget("https://www.thecocktaildb.com/api/json/v1/1/random.php");
    const c = d?.drinks?.[0];
    if (!c) return miss("TheCocktailDB");
    const ings: string[] = [];
    for (let i = 1; i <= 15; i++) {
      const ing = c[`strIngredient${i}`];
      const mea = c[`strMeasure${i}`];
      if (ing) ings.push(`${String(mea ?? "").trim()} ${ing}`.trim());
      if (ings.length >= 6) break;
    }
    return {
      ok: true,
      text: `${c.strGlass ? `Dans un ${c.strGlass.toLowerCase()} : ` : ""}« ${c.strDrink} » — ${ings.join(", ")}.`,
      source: "TheCocktailDB",
      url: `https://www.thecocktaildb.com/drink/${c.idDrink}`,
    };
  },

  /* 💡 Conseil du jour — Advice Slip */
  async advice() {
    const d = await jget("https://api.adviceslip.com/advice");
    const text = d?.slip?.advice;
    if (!text) return miss("Advice Slip");
    return { ok: true, text, source: "Advice Slip", url: "https://api.adviceslip.com/" };
  },

  /* 🥋 Blague Chuck Norris — chucknorris.io */
  async chuck() {
    const d = await jget("https://api.chucknorris.io/jokes/random");
    if (!d?.value) return miss("chucknorris.io");
    return { ok: true, text: d.value, source: "Chuck Norris API", url: d.url };
  },

  /* 😄 Blague en anglais — JokeAPI */
  async joke() {
    const d = await jget(
      "https://v2.jokeapi.dev/joke/Any?lang=en&blacklistFlags=religious,sexist,racist,explicit"
    );
    if (!d || d.error) return miss("JokeAPI");
    const text = d.type === "single" ? d.joke : `${d.setup} — ${d.delivery}`;
    return { ok: true, text, source: "JokeAPI", url: "https://sv443.net/jokeapi/v2/" };
  },

  /* 🐕 Photo de chien — Dog CEO */
  async dog() {
    const d = await jget("https://dog.ceo/api/breeds/image/random");
    if (!d?.message) return miss("Dog CEO");
    const breed = String(d.message).split("/")[4]?.replace(/-/g, " ") ?? "chien";
    return {
      ok: true,
      text: `Un ${breed} de purges sanguines numériques, au hasard de Dog CEO.`,
      source: "Dog CEO",
      image: d.message,
      url: "https://dog.ceo/dog-api/",
    };
  },

  /* 🐈 Fait sur les chats — Cat Facts */
  async catfact() {
    const d = await jget("https://catfact.ninja/fact");
    if (!d?.fact) return miss("Cat Facts");
    return { ok: true, text: d.fact, source: "Cat Facts", url: "https://catfact.ninja/" };
  },

  /* 📅 Prochain jour férié — Nager.Date (France) */
  async holiday() {
    const year = new Date().getFullYear();
    let days = await jget(`https://date.nager.at/api/v3/PublicHolidays/${year}/FR`);
    if (!Array.isArray(days)) return miss("Nager.Date");
    const today = new Date().toISOString().slice(0, 10);
    let next = days.find((d: any) => d.date >= today);
    if (!next) {
      const nxt = await jget(`https://date.nager.at/api/v3/PublicHolidays/${year + 1}/FR`);
      next = Array.isArray(nxt) ? nxt[0] : null;
    }
    if (!next) return { ok: true, text: "Aucun jour férié trouvé pour la France.", source: "Nager.Date" };
    const left = Math.max(
      0,
      Math.round((new Date(next.date).getTime() - new Date(today).getTime()) / 86400000)
    );
    return {
      ok: true,
      text:
        `Prochain jour férié en France : ${next.localName} le ${dfr(next.date)} ` +
        `(dans ${left} jour${left > 1 ? "s" : ""}).`,
      source: "Nager.Date",
      url: "https://date.nager.at/",
    };
  },

  /* 📖 Définition — Wiktionnaire francophone (MediaWiki API, sans clé) */
  async dictionary(q) {
    const word = (q || "").trim().split(/\s+/)[0] ?? "";
    if (!word) return { ok: false, text: "Donnez un mot : « signification de maison ».", source: "Wiktionnaire" };
    const data = await jget(
      `https://fr.wiktionary.org/w/api.php?action=query&prop=extracts&exchars=1200&explaintext&format=json&origin=*&titles=${encodeURIComponent(word)}`,
      9000
    );
    const pages = data?.query?.pages;
    const page = pages ? (Object.values(pages)[0] as any) : null;
    const extract: string = page?.extract ?? "";
    if (!extract) return miss("Wiktionnaire", `aucune entrée pour « ${word} ».`);

    // On démarre sur la section grammaticale (Nom commun, Verbe…) si elle existe
    const secIdx = extract.search(/={2,}\s*(nom commun|nom propre|verbe|adjectif|adverbe)\s*={2,}/i);
    const source = secIdx > 0 ? extract.slice(secIdx) : extract;
    // Puis on supprime les en-têtes wiki restants
    const cleaned = source
      .split("\n")
      .filter((l: string) => !/^\s*=+/.test(l))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    // On démarre sur la première définition numérotée quand elle est visible
    const defIdx = cleaned.search(/(?:^|\s)1\.\s/);
    const body = defIdx > 0 && defIdx < 400 ? cleaned.slice(defIdx).trim() : cleaned;
    if (body.length < 3) return miss("Wiktionnaire", `aucune définition pour « ${word} ».`);
    const text = body.length > 340 ? `${body.slice(0, 340).replace(/\s+\S*$/, "")}…` : body;

    return {
      ok: true,
      text: `${word} — ${text}`,
      source: "Wiktionnaire (fr.wiktionary.org)",
      url: `https://fr.wiktionary.org/wiki/${encodeURIComponent(word)}`,
    };
  },

  /* 🌐 Traduction — MyMemory */
  async translate(q) {
    const [raw, a, b] = q.split("|").map((s) => s.trim());
    const text = raw ?? "";
    if (!text) return { ok: false, text: "Syntaxe : « traduis bonjour|en ».", source: "MyMemory" };
    let from = "fr";
    let to = "en";
    if (a && b) {
      from = a;
      to = b;
    } else if (a) {
      to = a;
      from = a === "fr" ? "en" : "fr";
    }
    const data = await jget(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`
    );
    const out = data?.responseData?.translatedText;
    if (!out || data?.responseStatus === 403) return miss("MyMemory", "quota de traduction atteint.");
    return {
      ok: true,
      text: `« ${text} » se dit « ${out} » en ${to.toUpperCase()}.`,
      source: "MyMemory",
      url: "https://mymemory.translated.net/",
    };
  },

  /* 🚀 Prochain lancement — SpaceX API, repli Launch Library 2 */
  async spacex() {
    const sx = await jget("https://api.spacexdata.com/v4/launches/upcoming", 8000);
    if (Array.isArray(sx) && sx.length) {
      const next = sx
        .filter((l: any) => l.date_unix)
        .sort((x: any, y: any) => x.date_unix - y.date_unix)[0];
      if (next) {
        const detail = next.details ? ` — ${String(next.details).slice(0, 160)}` : "";
        return {
          ok: true,
          text: `Prochain lancement SpaceX : ${next.name} le ${dfr(next.date_utc)}${detail}.`,
          source: "SpaceX API",
          url: next.links?.webcast ?? next.links?.wikipedia ?? "https://www.spacex.com/launches/",
        };
      }
    }

    // Repli : Launch Library 2 (The Space Devs, sans clé, quota horaire)
    const ll = await jget("https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=1", 9000);
    const l = ll?.results?.[0];
    if (!l) return miss("Launch Library 2", "aucun lancement annoncé.");
    const when = dfr(l.net ?? l.window_start);
    const status = l.status?.name ? ` — statut : ${l.status.name}` : "";
    const mission = l.mission?.description ? ` ${String(l.mission.description).slice(0, 140)}` : "";
    return {
      ok: true,
      text: `Prochain lancement : ${l.name} le ${when}${status}.${mission}`,
      source: "Launch Library 2 · The Space Devs",
      url: `https://ll.thespacedevs.com/2.2.0/launch/${l.id}/`,
    };
  },

  /* 🌫️ Qualité de l'air — Open-Meteo Air Quality */
  async air(q) {
    const place = await geocode(q || "Paris");
    if (!place) return { ok: false, text: `Ville introuvable : « ${q || "Paris"} ».`, source: "Open-Meteo" };
    const d = await jget(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${place.latitude}&longitude=${place.longitude}&current=pm2_5,pm10,us_aqi&timezone=auto`
    );
    const cur = d?.current;
    if (!cur || typeof cur.us_aqi !== "number") return miss("Open-Meteo Air Quality");
    const aqi = cur.us_aqi;
    const label =
      aqi < 50 ? "bonne" : aqi < 100 ? "moyenne" : aqi < 150 ? "dégradée (sensibles)" :
      aqi < 200 ? "mauvaise" : aqi < 300 ? "très mauvaise" : "extrêmement mauvaise";
    return {
      ok: true,
      text:
        `Qualité de l'air à ${place.name} : indice ${nf(0).format(aqi)} — ${label}. ` +
        `PM2.5 ${nf(1).format(cur.pm2_5)} µg/m³ · PM10 ${nf(1).format(cur.pm10)} µg/m³.`,
      source: "Open-Meteo Air Quality",
      url: "https://open-meteo.com/en/docs/air-quality-api",
    };
  },

  /* 📚 Livre — Open Library */
  async book(q) {
    const query = (q || "").trim();
    if (!query) return { ok: false, text: "Donnez un titre : « un livre sur Dune ».", source: "Open Library" };
    const d = await jget(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=1&fields=title,author_name,first_publish_year,key,cover_i`
    );
    const b = d?.docs?.[0];
    if (!b) return miss("Open Library", "aucun ouvrage trouvé.");
    const authors = (b.author_name ?? []).slice(0, 2).join(", ");
    return {
      ok: true,
      text: `« ${b.title} »${authors ? ` — ${authors}` : ""}${b.first_publish_year ? ` (${b.first_publish_year})` : ""}.`,
      source: "Open Library",
      image: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg` : undefined,
      url: b.key ? `https://openlibrary.org${b.key}` : "https://openlibrary.org/",
    };
  },

  /* 📍 Localisation — Nominatim (OpenStreetMap) */
  async place(q) {
    const query = (q || "").trim();
    if (!query) return { ok: false, text: "Donnez un lieu : « localise la Tour Eiffel ».", source: "Nominatim" };
    const d = await jget(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=fr&q=${encodeURIComponent(query)}`
    );
    const p = Array.isArray(d) ? d[0] : null;
    if (!p) return miss("Nominatim", "lieu introuvable.");
    return {
      ok: true,
      text: `${p.display_name} — ${Number(p.lat).toFixed(4)}, ${Number(p.lon).toFixed(4)} (${p.type ?? "lieu"}).`,
      source: "Nominatim · OpenStreetMap",
      url: `https://www.openstreetmap.org/#map=15/${p.lat}/${p.lon}`,
    };
  },

  /* ☀️ Météo — Open-Meteo (le module météo du moteur garde la priorité) */
  async weather(q) {
    const place = await geocode(q || "Paris");
    if (!place) return { ok: false, text: `Ville introuvable : « ${q || "Paris"} ».`, source: "Open-Meteo" };
    const d = await jget(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`
    );
    const c = d?.current;
    if (!c || typeof c.temperature_2m !== "number") return miss("Open-Meteo");
    const sky = WMO[c.weather_code] ?? "ciel variable";
    return {
      ok: true,
      text:
        `${place.name}${place.country ? ` (${place.country})` : ""} : ${nf(0).format(c.temperature_2m)} °C, ` +
        `ressenti ${nf(0).format(c.apparent_temperature)} °C, ${sky}, vent ${nf(0).format(c.wind_speed_10m)} km/h.`,
      source: "Open-Meteo",
      url: "https://open-meteo.com/",
    };
  },
};

/* ========================================================================== *
 *  CATALOGUE — extrait structuré de github.com/public-apis/public-apis
 * ========================================================================== */

function entry(
  id: string,
  name: string,
  category: string,
  description: string,
  docs: string,
  auth: ApiAuth,
  wired = false,
  sample = ""
): PublicApiInfo {
  return { id, name, category, description, docs, auth, wired, sample };
}

export const PUBLIC_APIS: PublicApiInfo[] = [
  /* — Branchées dans Jarvis (sans clé) — */
  entry("currency", "Frankfurter", "Finance", "Taux de change BCE, sans quota", "https://www.frankfurter.app/docs", "none", true, "100 USD en EUR"),
  entry("crypto", "CoinGecko", "Finance", "Cours de crypto en EUR/USD + variation 24 h", "https://www.coingecko.com/en/api", "none", true, "bitcoin"),
  entry("country", "Banque mondiale × Open-Meteo", "Géographie", "Fiche pays : capitale, population, région", "https://datahelpdesk.worldbank.org/knowledgebase/topics/125589", "none", true, "Japon"),
  entry("restcountries", "REST Countries", "Géographie", "Pays, monnaies, langues (passé en clé v5)", "https://restcountries.com/", "key"),
  entry("place", "Nominatim / OpenStreetMap", "Géographie", "Géocodage et coordonnées de n'importe quel lieu", "https://nominatim.org/release-docs/latest/api/Overview/", "none", true, "Tour Eiffel"),
  entry("iss", "Where The ISS At", "Espace", "Position en direct de l'ISS", "https://wheretheiss.at/w/developer", "none", true, ""),
  entry("spacex", "SpaceX × Launch Library", "Espace", "Prochains lancements et résultats de vol", "https://thespacedevs.com/llapi", "none", true, ""),
  entry("recipe", "TheMealDB", "Cuisine", "Recettes aléatoires, catégories, ingrédients", "https://www.themealdb.com/api.php", "none", true, ""),
  entry("cocktail", "TheCocktailDB", "Cuisine", "Cocktails aléatoires et recettes de bar", "https://www.thecocktaildb.com/api.php", "none", true, ""),
  entry("advice", "Advice Slip", "Divertissement", "Conseil aléatoire en anglais", "https://api.adviceslip.com/", "none", true, ""),
  entry("chuck", "Chuck Norris API", "Divertissement", "Blagues Chuck Norris aléatoires", "https://api.chucknorris.io/", "none", true, ""),
  entry("joke", "JokeAPI", "Divertissement", "Blagues sans filtre, filtres optionnels", "https://sv443.net/jokeapi/v2/", "none", true, "joke"),
  entry("dog", "Dog CEO", "Animaux", "Photo de chien aléatoire", "https://dog.ceo/dog-api/", "none", true, ""),
  entry("catfact", "Cat Facts", "Animaux", "Fait amusant sur les chats", "https://catfact.ninja/", "none", true, ""),
  entry("holiday", "Nager.Date", "Temps & dates", "Jours fériés par pays et année", "https://date.nager.at/", "none", true, ""),
  entry("dictionary", "Wiktionnaire (fr)", "Dictionnaires", "Définitions et étymologie en français", "https://fr.wiktionary.org/w/api.php", "none", true, "maison"),
  entry("translate", "MyMemory", "Traduction", "Traduction de textes courts, 5000 mots/jour", "https://mymemory.translated.net/doc/spec.php", "none", true, "bonjour|en"),
  entry("book", "Open Library", "Livres", "Recherche d'ouvrages, auteurs, couvertures", "https://openlibrary.org/developers/api", "none", true, "Dune"),
  entry("air", "Open-Meteo Air Quality", "Environnement", "Indice AQI, PM2.5 et PM10", "https://open-meteo.com/en/docs/air-quality-api", "none", true, "Paris"),
  entry("weather", "Open-Meteo", "Environnement", "Météo mondiale non commerciale", "https://open-meteo.com/en/docs", "none", true, "Paris"),

  /* — Catalogue de référence (non branchées) — */
  entry("jikan", "Jikan", "Divertissement", "API non officielle MyAnimeList", "https://jikan.moe/", "none"),
  entry("cataas", "Cataas", "Animaux", "Chat aléatoire en image", "https://cataas.com/", "none"),
  entry("thedogapi", "The Dog API", "Animaux", "Races et photos de chiens", "https://thedogapi.com/", "key"),
  entry("petfinder", "PetFinder", "Animaux", "Animaux à adopter", "https://www.petfinder.com/developers/", "key"),
  entry("gutendex", "Gutendex", "Livres", "Catalogue Project Gutenberg", "https://gutendex.com/", "none"),
  entry("googlebooks", "Google Books", "Livres", "Recherche et extraits de livres", "https://developers.google.com/books", "key"),
  entry("openfoodfacts", "Open Food Facts", "Cuisine", "Nutrition et barcode produits", "https://world.openfoodfacts.org/data", "none"),
  entry("spoonacular", "Spoonacular", "Cuisine", "Recettes, nutrition, ingrédients", "https://spoonacular.com/food-api", "key"),
  entry("coincap", "CoinCap", "Finance", "Cours crypto en temps réel", "https://docs.coincap.io/", "none"),
  entry("alphavantage", "Alpha Vantage", "Finance", "Actions, forex, indicateurs", "https://www.alphavantage.co/", "key"),
  entry("openexrates", "Open Exchange Rates", "Finance", "Taux de change historiques", "https://openexchangerates.org/", "key"),
  entry("plaid", "Plaid", "Finance", "Connexion comptes bancaires", "https://plaid.com/docs/", "key"),
  entry("merriam", "Merriam-Webster", "Dictionnaires", "Définitions et thesaurus EN", "https://dictionaryapi.com/", "key"),
  entry("libretranslate", "LibreTranslate", "Traduction", "Traduction auto-hébergée", "https://libretranslate.com/docs/", "key"),
  entry("hackernews", "Hacker News", "Actus & web", "Articles HN en direct", "https://github.com/HackerNews/API", "none"),
  entry("devto", "DEV Community", "Actus & web", "Articles de la communauté dev", "https://dev.to/api", "none"),
  entry("newsapi", "NewsAPI", "Actus & web", "Titres de presse mondiaux", "https://newsapi.org/", "key"),
  entry("guardian", "The Guardian", "Actus & web", "Articles du Guardian", "https://open-platform.theguardian.com/", "key"),
  entry("wikipedia", "Wikipedia REST", "Données ouvertes", "Résumés et pages Wikipédia", "https://www.mediawiki.org/wiki/WikiREST_API", "none"),
  entry("worldbank", "Banque mondiale", "Données ouvertes", "Indicateurs pays et séries longues", "https://datahelpdesk.worldbank.org/knowledgebase/topics/125589", "none"),
  entry("eudata", "EU Open Data Portal", "Données ouvertes", "Jeu de données de l'Union européenne", "https://data.europa.eu/api/hub/search/", "none"),
  entry("jsonplaceholder", "JSONPlaceholder", "Développement", "FAKE API REST pour tests", "https://jsonplaceholder.typicode.com/", "none"),
  entry("reqres", "ReqRes", "Développement", "API de test de requêtes HTTP", "https://reqres.in/", "none"),
  entry("github", "GitHub", "Développement", "Repos, issues, actions", "https://docs.github.com/en/rest", "key"),
  entry("npm", "npm Registry", "Développement", "Métadonnées de paquets npm", "https://github.com/npm/registry", "none"),
  entry("openfda", "openFDA", "Santé", "Données FDA médicaments/aliments", "https://open.fda.gov/", "none"),
  entry("disease", "disease.sh", "Santé", "Statistiques épidémiques mondiales", "https://disease.sh/", "none"),
  entry("nutritionix", "Nutritionix", "Santé", "Nutrition par recherche libre", "https://developer.nutritionix.com/", "key"),
  entry("arbeitnow", "Arbeitnow", "Emploi", "Offres d'emploi en direct", "https://www.arbeitnow.com/api/job-api", "none"),
  entry("deezer", "Deezer", "Musique", "Catalogue et pistes audio", "https://developers.deezer.com/api", "key"),
  entry("itunes", "iTunes Search", "Musique", "Recherche médias Apple", "https://performance-partners.apple.com/search-api", "none"),
  entry("lyrics", "Lyrics.ovh", "Musique", "Paroles de chansons", "https://lyricsovh.docs.apiary.io/", "none"),
  entry("solarsystem", "Système solaire", "Espace", "Corps célestes et orbites", "https://api.le-systeme-solaire.net/rest/bodies/", "none"),
  entry("nasa", "NASA", "Espace", "Données NASA (DEMO_KEY)", "https://api.nasa.gov/", "key"),
  entry("numbers", "Numbers API", "Science & maths", "Chiffres et curiosités", "http://numbersapi.com/", "none"),
  entry("openstreetmap-photon", "Photon", "Géographie", "Géocodage Komoot", "https://photon.komoot.io/", "none"),
  entry("mapbox", "Mapbox", "Géographie", "Géocodage, cartes, directions", "https://docs.mapbox.com/", "key"),
  entry("postcodes", "Postcodes.io", "Géographie", "Codes postaux UK", "https://postcodes.io/", "none"),
  entry("thesportsdb", "TheSportsDB", "Sport", "Scores, équipes, compétitions", "https://www.thesportsdb.com/api.php", "key"),
  entry("api-football", "API-Football", "Sport", "Football en direct", "https://www.api-football.com/", "key"),
  entry("ergast", "Ergast F1", "Sport", "Formule 1 : saisons et grands prix", "http://ergast.com/mrd/", "none"),
  entry("hbp", "Have I Been Pwned", "Sécurité", "Fuites de données par e-mail", "https://haveibeenpwned.com/API/v3", "key"),
  entry("shodan", "Shodan", "Sécurité", "Appareils exposés sur Internet", "https://developer.shodan.io/", "key"),
  entry("fakerapi", "FakerAPI", "Données de test", "Données factices multi-entités", "https://fakerapi.it/", "none"),
  entry("dummyjson", "DummyJSON", "Données de test", "Produits, users, paniers fictifs", "https://dummyjson.com/", "none"),
  entry("aftership", "AfterShip", "Suivi", "Suivi de colis multi-transporteurs", "https://www.aftership.com/docs/aftership/quickstart", "key"),
  entry("opensky", "OpenSky Network", "Transport", "Avions en vol en direct", "https://opensky-network.org/apidoc/index.html", "none"),
  entry("transitland", "Transitland", "Transport", "Horaires de transport public", "https://www.transit.land/documentation/", "key"),
  entry("isgd", "is.gd", "Raccourcisseurs", "Raccourcir des URL sans clé", "https://is.gd/apishorteningreference.php", "none"),
  entry("tinyurl", "TinyURL", "Raccourcisseurs", "Raccourcissement et suivi", "https://tinyurl.com/app/dev", "key"),
  entry("nhtsa", "NHTSA vPIC", "Véhicules", "Décodage VIN et fiches constructeur", "https://vpic.nhtsa.dot.gov/api/", "none"),
  entry("fueleconomy", "FuelEconomy", "Véhicules", "Consommation EPA par modèle", "https://www.fueleconomy.gov/feg/ws/", "none"),
  entry("tvmaze", "TVmaze", "Vidéo", "Séries, épisodes, planifications", "https://www.tvmaze.com/api", "none"),
  entry("swapi", "SWAPI", "Vidéo", "Univers Star Wars", "https://swapi.dev/", "none"),
  entry("youtube", "YouTube", "Vidéo", "Recherche et vidéos (OAuth)", "https://developers.google.com/youtube", "key"),
  entry("picsum", "Lorem Picsum", "Photo", "Photos aléatoires libres", "https://picsum.photos/", "none"),
  entry("pexels", "Pexels", "Photo", "Photos et vidéos libres", "https://www.pexels.com/api/", "key"),
  entry("rainviewer", "RainViewer", "Environnement", "Radars de pluie mondiaux", "https://www.rainviewer.com/api.html", "none"),
  entry("aqicn", "AQICN", "Environnement", "Indice qualité de l'air 1000+ villes", "https://aqicn.org/api/", "key"),
  entry("wttr", "wttr.in", "Environnement", "Météo en format terminal", "https://wttr.in/:help", "none"),
  entry("hbnd", "Abstract API", "Validation de données", "E-mail, IP, nom d'entreprise", "https://www.abstractapi.com/", "key"),
  entry("numverify", "Numverify", "Validation de données", "Validation de numéros de téléphone", "https://numverify.com/", "key"),
];

/* ========================================================================== *
 *  API PUBLIQUE DU MODULE
 * ========================================================================== */

/** Catalogue sérialisable (sans les handlers). */
export function listPublicApis(): PublicApiInfo[] {
  return PUBLIC_APIS.map(({ id, name, category, description, docs, auth, wired, sample }) => ({
    id, name, category, description, docs, auth, wired, sample,
  }));
}

export function apiCategories(): string[] {
  return [...new Set(PUBLIC_APIS.map((a) => a.category))].sort((a, b) => a.localeCompare(b, "fr"));
}

export interface PublicApiMatch {
  id: string;
  q: string;
}

const LANGS: Record<string, string> = {
  anglais: "en", english: "en", français: "fr", francais: "fr", espagnol: "es", spanish: "es",
  allemand: "de", german: "de", italien: "it", italian: "it", portugais: "pt", portuguese: "pt",
  arabe: "ar", japanese: "ja", japonais: "ja", russe: "ru", russian: "ru", chinois: "zh",
  chinese: "zh", néerlandais: "nl", neerlandais: "nl", polonais: "pl", turc: "tr", coréen: "ko",
};

/**
 * Détecte la commande publique dans la phrase de l'utilisateur.
 * `input` est déjà normalisé par le moteur (minuscules, apostrophes simples).
 * Les intents spécifiques du moteur (météo, Wikipédia, blagues locales…)
 * sont testés AVANT cet appel : en cas de conflit, ils gardent la priorité.
 */
export function matchPublicApi(input: string): PublicApiMatch | null {
  const s = input.trim();
  if (!s) return null;

  /* 💱 Taux de change — deux devises reliées par « en / vers / to » */
  const tokens = currencyTokens(s);
  const connector = /\s(?:en|vers|to|in|->|→)\s/.test(s);
  if (tokens.length >= 2 && (connector || /taux (de )?change|convertis|conversion/.test(s))) {
    return { id: "currency", q: s };
  }
  if (tokens.length >= 1 && /taux (de )?change|taux (du|de|des) (dollar|euro|livre|yen|franc)/.test(s)) {
    return { id: "currency", q: s };
  }

  /* 🛰️ Station spatiale internationale */
  if (/\biss\b|station spatiale|international space station/.test(s)) return { id: "iss", q: "" };

  /* 🪙 Crypto-monnaies */
  const cryptoM = s.match(
    /\b(bitcoin|btc|ethereum|eth|solana|solana|dogecoin|doge|ripple|xrp|cardano|ada|litecoin|ltc|tron|monero|crypto(?:monnaie)?s?)\b/
  );
  if (cryptoM && /(prix|cours|valeur|vaut|combien|crypto|évolution|evolution)/.test(s)) {
    return { id: "crypto", q: cryptoM[1] };
  }

  /* 🌍 Fiche pays */
  const countryM = s.match(
    /(?:capital|population|superficie|monnaie|drapeau|langue)\s+(?:de|du|d'|des|pour|en)?\s*([a-zà-ÿ'’\- ]{2,40})/
  );
  if (countryM) {
    return { id: "country", q: countryM[1].replace(/^(le |la |l'|les |pays |de |du )/, "").trim() };
  }
  const fp = s.match(/fiche pays\s+([a-zà-ÿ'’\- ]{2,40})/);
  if (fp) return { id: "country", q: fp[1].trim() };

  /* 🍳🍫 Cuisine */
  if (
    /(?:une |un |donne[- ]moi |quelle |quoi )?recette(?:s)?\b/.test(s) &&
    !/programmation|code|fonction/.test(s)
  ) {
    if (/(au hasard|aléatoire|aleatoire|random|de la semaine|du jour|quoi|que )|^\s*(une|un|quelle) recette/.test(s)) {
      return { id: "recipe", q: "" };
    }
  }
  if (/(?:un |donne[- ]moi |quel |quelle )?cocktail|boisson (?:au hasard|aléatoire|aleatoire)/.test(s)) {
    return { id: "cocktail", q: "" };
  }

  /* 💡 Conseil */
  if (/(?:un |donne[- ]moi |quel |quelques? )?conseils?\b/.test(s) && !/juridique|fiscal|legal|juridique/.test(s)) {
    if (/(du jour|pratique|au hasard|aléatoire|aleatoire|pour|sur)/.test(s) || /donne[- ]moi un conseil|un conseil\s*$/.test(s)) {
      return { id: "advice", q: "" };
    }
  }

  /* 🥋 Chuck Norris · 😄 blague en anglais */
  if (/chuck norris/.test(s)) return { id: "chuck", q: "" };
  if (/\bjoke\b|blague en anglais|english joke|une joke/.test(s)) return { id: "joke", q: "" };

  /* 🐕 Animaux */
  if (/(?:photo|image|montre|affiche|envoie).{0,24}(?:chien|chiot)|(?:un|donne[- ]moi un) chien (?:au hasard|aléatoire|aleatoire)/.test(s)) {
    return { id: "dog", q: "" };
  }
  if (/(?:fait|anecdote|histoire) (?:sur|d'|de|du) (?:les? )?chats?|parle[- ]moi du (?:chat|chats)|un fait (?:au hasard|sur)/.test(s)) {
    return { id: "catfact", q: "" };
  }

  /* 📅 Jours fériés */
  if (/jours? fériés?|fériés? (?:de|du|en|pour)|prochain jour férié|calendrier des f[êe]tes/.test(s)) {
    return { id: "holiday", q: "" };
  }

  /* 📖 Définition d'un mot (« signification de … » — « définition de … » reste à Wikipédia) */
  const defM = s.match(
    /(?:signification de|que signifie|définition du mot|definition du mot|dictionnaire)\s+(?:le |la |l'|des |un |une )?([a-zà-ÿ'’\-]{2,30})/
  );
  if (defM) return { id: "dictionary", q: defM[1] };

  /* 🌐 Traduction */
  if (/\btraduis\b|\btraduire\b|\btraduction\b/.test(s)) {
    const body = s.replace(/^(?:traduis|traduire|traduction de)(?:-moi)?\s*/, "").replace(/[.?]$/, "").trim();
    const split = body.match(/^(.*?)\s+(?:en|dans|vers)\s+(.+)$/);
    const text = (split ? split[1] : body).trim();
    const targetWord = split ? split[2].trim() : "";
    const to = LANGS[targetWord] ?? (/^[a-z]{2}$/.test(targetWord) ? targetWord : "en");
    const from = to === "fr" ? "en" : "fr";
    if (text) return { id: "translate", q: `${text}|${from}|${to}` };
  }

  /* 🚀 SpaceX */
  if (/spacex|prochains? (?:lancements?|décollages?|vols?)|lancement (?:de|du|des|spacex)/.test(s)) {
    return { id: "spacex", q: "" };
  }

  /* 🌫️ Qualité de l'air */
  if (/qualité (?:de l'|de l’)?air|pollution (?:à|a|de|en|dans)|\baqi\b|indice de la qualité/.test(s)) {
    const cityM = s.match(/\s(?:à|a|dans|pour|de)\s+([a-zà-ÿ'’\- ]{2,30})$/);
    const city = cityM && !/^(l'|le |la |les )/.test(cityM[1]) ? cityM[1].trim() : "";
    return { id: "air", q: city };
  }

  /* 📚 Livres */
  const bookM =
    s.match(/(?:un |donne[- ]moi |recommande(?:-moi)? |cherche(?:-moi)? )?livre\s+(?:sur|de|d'|du|des|par)\s+([a-zà-ÿ'’\- ]{2,60})/) ??
    s.match(/recommande(?:-moi)?\s+(?:un )?livre\s*([a-zà-ÿ'’\- ]{0,60})/);
  if (bookM) {
    const q = bookM[1].replace(/[.?]$/, "").replace(/^(le |la |l')/, "").trim();
    if (q.length >= 2) return { id: "book", q };
  }

  /* 📍 Localisation */
  const placeM = s.match(
    /(?:localise|localiser|coordonnées (?:de|d'|du|des)|où se trouve|ou se trouve|adresse de)\s+(.{2,60})/
  );
  if (placeM) return { id: "place", q: placeM[1].replace(/[.?]$/, "").trim() };

  return null;
}

/** Appel live d'une API branchée. Renvoie toujours une réponse exploitable. */
export async function callPublicApi(id: string, q = ""): Promise<ApiHit> {
  const handler = HANDLERS[id];
  if (!handler) {
    const info = PUBLIC_APIS.find((a) => a.id === id);
    return {
      ok: false,
      text: info
        ? `${info.name} est répertoriée mais pas encore branchée${info.auth === "key" ? " (clé requise)" : ""}.`
        : `API inconnue : ${id}.`,
      source: info?.name ?? "J.A.R.V.I.S.",
    };
  }
  try {
    return await handler(q);
  } catch (error) {
    console.error("[JARVIS publicapis]", id, error);
    return miss(PUBLIC_APIS.find((a) => a.id === id)?.name ?? id, "erreur réseau.");
  }
}
