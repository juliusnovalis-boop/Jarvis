/**
 * ⚽ MODULE SPORT — réponses COMPLÈTES
 *
 *  Problème résolu : l'endpoint gratuit `eventsnextleague` ne renvoie qu'UN match.
 *  Solution : on récupère le numéro de journée (intRound) puis on interroge
 *  `eventsround`, qui renvoie la JOURNÉE ENTIÈRE (10 matchs), scores compris.
 */

const KEY = () => process.env.THESPORTSDB_KEY ?? "123";
const API = (path: string) => `https://www.thesportsdb.com/api/v1/json/${KEY()}/${path}`;

export interface Fixture {
  home: string;
  away: string;
  date: string | null;    // YYYY-MM-DD
  time: string | null;    // HH:MM:SS (UTC)
  ts: string | null;
  homeScore: number | null;
  awayScore: number | null;
  round: string | null;
}

export interface LeagueInfo {
  id: string;
  name: string;
  aliases: RegExp;
}

export const LEAGUES: LeagueInfo[] = [
  { id: "4480", name: "Ligue des Champions", aliases: /ligue des champions|champions league|\bldc\b|c1\b/ },
  { id: "4401", name: "Ligue 2", aliases: /ligue 2|ligue deux/ },
  { id: "4334", name: "Ligue 1", aliases: /ligue 1|ligue un|championnat de france/ },
  { id: "4328", name: "Premier League", aliases: /premier league|premiere league|championnat anglais/ },
  { id: "4332", name: "Serie A", aliases: /série a|serie a|championnat italien/ },
  { id: "4331", name: "Bundesliga", aliases: /bundesliga|championnat allemand/ },
  { id: "4335", name: "Liga", aliases: /la liga|liga espagnole|\bliga\b|championnat espagnol/ },
];

export function detectLeague(input: string): LeagueInfo | null {
  return LEAGUES.find((l) => l.aliases.test(input)) ?? null;
}

async function getJson<T>(url: string, ms = 9000): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(ms) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface RawEvent {
  strEvent?: string; strHomeTeam?: string; strAwayTeam?: string;
  dateEvent?: string; strTime?: string; strTimestamp?: string;
  intHomeScore?: string | null; intAwayScore?: string | null;
  intRound?: string; strSeason?: string;
}

function toFixture(e: RawEvent): Fixture {
  const parts = (e.strEvent ?? "").split(/\s+vs?\.?\s+/i);
  return {
    home: e.strHomeTeam || parts[0] || "?",
    away: e.strAwayTeam || parts[1] || "?",
    date: e.dateEvent ?? null,
    time: e.strTime ?? null,
    ts: e.strTimestamp ?? (e.dateEvent && e.strTime ? `${e.dateEvent}T${e.strTime}` : null),
    homeScore: e.intHomeScore != null && e.intHomeScore !== "" ? Number(e.intHomeScore) : null,
    awayScore: e.intAwayScore != null && e.intAwayScore !== "" ? Number(e.intAwayScore) : null,
    round: e.intRound ?? null,
  };
}

/** Journée courante complète (10 matchs) + journées adjacentes si besoin. */
export async function fetchRounds(leagueId: string): Promise<Fixture[]> {
  // 1. Repère la journée en cours via le prochain match (et le dernier joué)
  const [next, past] = await Promise.all([
    getJson<{ events?: RawEvent[] }>(API(`eventsnextleague.php?id=${leagueId}`)),
    getJson<{ results?: RawEvent[]; events?: RawEvent[] }>(API(`eventspastleague.php?id=${leagueId}`)),
  ]);
  const seed = next?.events?.[0] ?? past?.results?.[0] ?? past?.events?.[0];
  if (!seed?.intRound || !seed?.strSeason) {
    const fallback = [...(next?.events ?? []), ...(past?.results ?? past?.events ?? [])];
    return fallback.map(toFixture);
  }

  const round = parseInt(seed.intRound, 10);
  const season = seed.strSeason;

  // 2. Journée courante + précédente + suivante → couverture complète
  const wanted = [round, round - 1, round + 1].filter((r) => r > 0);
  const batches = await Promise.all(
    wanted.map((r) =>
      getJson<{ events?: RawEvent[] }>(API(`eventsround.php?id=${leagueId}&r=${r}&s=${encodeURIComponent(season)}`))
    )
  );

  const all: Fixture[] = [];
  const seen = new Set<string>();
  for (const b of batches) {
    for (const e of b?.events ?? []) {
      const f = toFixture(e);
      const key = `${f.home}|${f.away}|${f.date}`;
      if (!seen.has(key)) {
        seen.add(key);
        all.push(f);
      }
    }
  }
  if (!all.length) {
    return [...(next?.events ?? []), ...(past?.results ?? past?.events ?? [])].map(toFixture);
  }
  all.sort((a, b) => (a.ts ?? "").localeCompare(b.ts ?? ""));
  return all;
}

/* ─────────────────────────── Formatage ─────────────────────────── */

export function fixtureTime(f: Fixture, tz: string): string {
  if (!f.ts && !f.date) return "";
  const iso = f.ts ? (f.ts.endsWith("Z") ? f.ts : `${f.ts.replace(" ", "T")}Z`) : `${f.date}T20:00:00Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const [h, m] = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: tz }).split(":");
  return m === "00" ? `${parseInt(h, 10)} heures` : `${parseInt(h, 10)} heures ${parseInt(m, 10)}`;
}

export function fixtureDayLabel(f: Fixture, tz: string): string {
  const iso = f.ts ? (f.ts.endsWith("Z") ? f.ts : `${f.ts.replace(" ", "T")}Z`) : `${f.date}T20:00:00Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: tz });
}

/** Timestamp UTC du match. */
export function fixtureTs(f: Fixture): number {
  const iso = f.ts ? (f.ts.endsWith("Z") ? f.ts : `${f.ts.replace(" ", "T")}Z`) : f.date ? `${f.date}T20:00:00Z` : null;
  if (!iso) return NaN;
  return new Date(iso).getTime();
}

export function isPlayed(f: Fixture): boolean {
  return f.homeScore != null && f.awayScore != null;
}

/** « Valence reçoit le Real Madrid à 21 heures » ou « Séville 2 à 1 Alavés ». */
export function describeFixture(f: Fixture, tz: string, withDay = false): string {
  const day = withDay ? `${fixtureDayLabel(f, tz)}, ` : "";
  if (isPlayed(f)) {
    return `${day}${f.home} ${f.homeScore} à ${f.awayScore} contre ${f.away}`;
  }
  const t = fixtureTime(f, tz);
  return `${day}${f.home} reçoit ${f.away}${t ? ` à ${t}` : ""}`;
}
