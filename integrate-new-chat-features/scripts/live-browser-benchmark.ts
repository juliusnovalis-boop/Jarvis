import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { browseAnswer, compareSearchProviders, type ProviderSnapshot } from "../src/lib/jarvis/websearch";

interface Case {
  domain: string;
  question: string;
  expected?: string[];
  minExpected?: number;
}

const cases: Case[] = [
  { domain: "géographie", question: "quelle est la capitale de l'Australie", expected: ["canberra"], minExpected: 1 },
  { domain: "géographie", question: "quels sont les pays frontaliers de la France", expected: ["belgique", "allemagne", "espagne", "italie", "suisse"], minExpected: 3 },
  { domain: "science", question: "combien de planètes compte le système solaire", expected: ["8", "huit"], minExpected: 1 },
  { domain: "science", question: "quelle est la distance moyenne entre la Terre et Mars", expected: ["78", "million"], minExpected: 1 },
  { domain: "science", question: "pourquoi le ciel est bleu", expected: ["lumière", "diffusion"], minExpected: 1 },
  { domain: "santé", question: "quels sont les principaux symptômes de la grippe", expected: ["fièvre", "fatigue", "courbature", "toux"], minExpected: 2 },
  { domain: "santé", question: "comment reconnaître une urgence cardiaque", expected: ["douleur", "urgence", "15"], minExpected: 1 },
  { domain: "cuisine", question: "quels sont tous les ingrédients d'une carbonara traditionnelle", expected: ["œuf", "pecorino", "guanciale", "poivre"], minExpected: 2 },
  { domain: "histoire", question: "que s'est-il passé en France en mai 1968", expected: ["grève", "étudiant", "manifestation"], minExpected: 1 },
  { domain: "technologie", question: "compare React et Vue avec leurs avantages et inconvénients", expected: ["react", "vue"], minExpected: 2 },
  { domain: "technologie", question: "quelles sont les nouveautés principales de Python 3.14", expected: ["python", "3.14"], minExpected: 2 },
  { domain: "technologie", question: "comment installer Docker sur Ubuntu étape par étape", expected: ["docker", "apt", "ubuntu"], minExpected: 1 },
  { domain: "finance", question: "quel est le cours du bitcoin aujourd'hui", expected: ["bitcoin"], minExpected: 1 },
  { domain: "finance", question: "quelle différence entre un ETF et une action", expected: ["etf", "action"], minExpected: 2 },
  { domain: "droit", question: "quelles sont les étapes pour créer une association en France", expected: ["statut", "déclaration", "préfecture"], minExpected: 1 },
  { domain: "voyage", question: "quelles sont les meilleures destinations européennes en hiver", expected: ["europe"], minExpected: 1 },
  { domain: "cinéma", question: "quels films sont sortis au cinéma cette semaine en France", expected: ["film"], minExpected: 1 },
  { domain: "actualité", question: "quelles sont les principales actualités technologiques aujourd'hui", expected: ["technolog"], minExpected: 1 },
  { domain: "sport", question: "quels sont les résultats récents du PSG", expected: ["psg", "paris"], minExpected: 1 },
  { domain: "shopping", question: "compare les meilleurs smartphones milieu de gamme actuels", expected: ["smartphone"], minExpected: 1 },
  { domain: "environnement", question: "quelles sont les principales causes du réchauffement climatique", expected: ["gaz", "serre", "fossile"], minExpected: 1 },
  { domain: "éducation", question: "quelles méthodes sont efficaces pour apprendre une langue", expected: ["langue"], minExpected: 1 },
  { domain: "culture", question: "qui a peint Guernica et pourquoi", expected: ["picasso", "guerre"], minExpected: 1 },
  { domain: "mathématiques", question: "explique le théorème de Pythagore avec sa formule", expected: ["triangle", "carré", "hypoténuse"], minExpected: 2 },
];

interface CaseResult {
  domain: string;
  question: string;
  latencyMs: number;
  answer: string | null;
  partial: boolean | null;
  qualityScore: number | null;
  expectedCoverage: number | null;
  sourceCount: number;
  providers: ProviderSnapshot[];
  error?: string;
}

function expectedCoverage(text: string, c: Case): number | null {
  if (!c.expected?.length) return null;
  const low = text.toLowerCase();
  const found = c.expected.filter((x) => low.includes(x.toLowerCase())).length;
  return Number((found / c.expected.length).toFixed(3));
}

async function runCase(c: Case): Promise<CaseResult> {
  const started = performance.now();
  try {
    const [answer, providers] = await Promise.all([
      browseAnswer(c.question),
      compareSearchProviders(c.question),
    ]);
    return {
      domain: c.domain,
      question: c.question,
      latencyMs: Math.round(performance.now() - started),
      answer: answer?.text ?? null,
      partial: answer?.partial ?? null,
      qualityScore: answer?.quality.score ?? null,
      expectedCoverage: expectedCoverage(answer?.text ?? "", c),
      sourceCount: answer?.sources.length ?? 0,
      providers,
    };
  } catch (error) {
    return {
      domain: c.domain, question: c.question,
      latencyMs: Math.round(performance.now() - started),
      answer: null, partial: null, qualityScore: null,
      expectedCoverage: 0, sourceCount: 0, providers: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function pooled<T, R>(items: T[], concurrency: number, fn: (v: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      output[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return output;
}

async function main() {
const started = performance.now();
const results = await pooled(cases, 1, runCase);

const providerNames = [...new Set(results.flatMap((r) => r.providers.map((p) => p.provider)))];
const providerSummary = providerNames.map((name) => {
  const rows = results.flatMap((r) => r.providers).filter((p) => p.provider === name);
  return {
    provider: name,
    cases: rows.length,
    availabilityRate: Number((rows.filter((r) => r.available).length / rows.length * 100).toFixed(1)),
    meanRelevance: Number((rows.reduce((a, r) => a + r.meanRelevance, 0) / rows.length).toFixed(3)),
    meanRelevantResults: Number((rows.reduce((a, r) => a + r.relevantCount, 0) / rows.length).toFixed(2)),
    meanDomainDiversity: Number((rows.reduce((a, r) => a + r.domainDiversity, 0) / rows.length).toFixed(2)),
  };
});

const answered = results.filter((r) => r.answer);
const report = {
  generatedAt: new Date().toISOString(),
  methodology: {
    cases: cases.length,
    concurrency: 1,
    note: "Chrome/Firefox/Edge sont des clients. Comparaison de leurs moteurs usuels : Google, DuckDuckGo, Bing, plus Wikipédia et Jarvis fédéré.",
  },
  durationMs: Math.round(performance.now() - started),
  answerMetrics: {
    answerRate: Number((answered.length / results.length * 100).toFixed(1)),
    transparentPartialRate: Number((answered.filter((r) => r.partial).length / Math.max(1, answered.length) * 100).toFixed(1)),
    meanQualityScore: Number((answered.reduce((a, r) => a + (r.qualityScore ?? 0), 0) / Math.max(1, answered.length)).toFixed(1)),
    meanExpectedCoverage: Number((answered.reduce((a, r) => a + (r.expectedCoverage ?? 0), 0) / Math.max(1, answered.length)).toFixed(3)),
    meanLatencyMs: Math.round(answered.reduce((a, r) => a + r.latencyMs, 0) / Math.max(1, answered.length)),
  },
  providerSummary,
  results,
};

mkdirSync("artifacts", { recursive: true });
writeFileSync("artifacts/live-browser-benchmark.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  durationMs: report.durationMs,
  answerMetrics: report.answerMetrics,
  providerSummary,
  failures: results.filter((r) => r.error || !r.answer).map((r) => ({ question: r.question, error: r.error })),
}, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
