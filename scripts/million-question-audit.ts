import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  classifyQuestion,
  detectDomain,
  detectIntent,
  verifyCompleteness,
  type QuestionDomain,
  type QuestionIntent,
} from "../src/lib/jarvis/question-quality";

interface Bucket { domain: QuestionDomain; anchor: string; subject: string }

const buckets: Bucket[] = [
  { domain: "sports", anchor: "football", subject: "match de championnat" },
  { domain: "finance", anchor: "bourse", subject: "action cotée" },
  { domain: "weather", anchor: "météo", subject: "prévision météo" },
  { domain: "news", anchor: "actualités", subject: "actualité internationale" },
  { domain: "health", anchor: "santé", subject: "symptôme de maladie" },
  { domain: "legal", anchor: "droit", subject: "règle juridique" },
  { domain: "technology", anchor: "logiciel", subject: "outil logiciel" },
  { domain: "science", anchor: "science", subject: "phénomène scientifique" },
  { domain: "history", anchor: "histoire", subject: "événement historique" },
  { domain: "geography", anchor: "géographie", subject: "pays frontalier" },
  { domain: "travel", anchor: "voyage", subject: "destination de voyage" },
  { domain: "shopping", anchor: "acheter", subject: "produit à acheter" },
  { domain: "food", anchor: "recette", subject: "ingrédient de recette" },
  { domain: "entertainment", anchor: "cinéma", subject: "film de cinéma" },
  { domain: "general", anchor: "culture générale", subject: "notion de culture générale" },
  { domain: "technology", anchor: "Python", subject: "fonction Python" },
  { domain: "science", anchor: "espace", subject: "planète du système solaire" },
  { domain: "health", anchor: "médicament", subject: "traitement médical" },
  { domain: "finance", anchor: "bitcoin", subject: "crypto-actif" },
  { domain: "sports", anchor: "tennis", subject: "tournoi de tennis" },
];

const templates: { intent: QuestionIntent; make: (s: string) => string }[] = [
  { intent: "count", make: (s) => `Combien de ${s} existe-t-il` },
  { intent: "count", make: (s) => `Quel est le nombre de ${s}` },
  { intent: "count", make: (s) => `How many ${s} sont recensés` },
  { intent: "list", make: (s) => `Quels sont les ${s}` },
  { intent: "list", make: (s) => `Liste tous les ${s}` },
  { intent: "list", make: (s) => `Cite les ${s}` },
  { intent: "comparison", make: (s) => `Compare ${s} avec son alternative` },
  { intent: "comparison", make: (s) => `Quelle différence entre ${s} et son concurrent` },
  { intent: "comparison", make: (s) => `${s} vs alternative` },
  { intent: "procedure", make: (s) => `Comment faire avec ${s}` },
  { intent: "procedure", make: (s) => `Quelles étapes pour utiliser ${s}` },
  { intent: "procedure", make: (s) => `Guide pour installer ${s}` },
  { intent: "recommendation", make: (s) => `Recommande-moi ${s}` },
  { intent: "recommendation", make: (s) => `Quel est le meilleur ${s}` },
  { intent: "recommendation", make: (s) => `Que choisir pour ${s}` },
  { intent: "current", make: (s) => `Quel est l'état de ${s} aujourd'hui` },
  { intent: "current", make: (s) => `Actualité récente sur ${s}` },
  { intent: "definition", make: (s) => `C'est quoi ${s}` },
  { intent: "definition", make: (s) => `Qui est lié à ${s}` },
  { intent: "fact", make: (s) => `Explique précisément ${s}` },
];

const contexts = [
  "en France", "en Europe", "dans le monde", "pour un débutant", "pour un expert",
  "avec des sources", "de façon détaillée", "dans un cas concret", "selon les données publiques", "sans jargon",
];

const suffixes = [
  "?", " s'il te plaît ?", " avec une réponse complète ?", " sans rien oublier ?", " et cite tes sources ?",
  " en français ?", " avec les chiffres exacts ?", " en vérifiant plusieurs sites ?", " avec le périmètre ?", " de manière fiable ?",
];

const expectedDomain = (b: Bucket): QuestionDomain => b.domain;

let total = 0;
let failures = 0;
let unique = 0;
let last = "";
const samples: { question: string; reason: string }[] = [];
const reasonCounts: Record<string, number> = {};
const intents: Record<string, number> = {};
const domains: Record<string, number> = {};
const signatures = new Set<number>();

function fail(question: string, reason: string) {
  failures++;
  const family = reason.replace(/=.*/, "").replace(/:.*/, "");
  reasonCounts[family] = (reasonCounts[family] ?? 0) + 1;
  if (samples.length < 30) samples.push({ question, reason });
}

const started = performance.now();

for (let bi = 0; bi < buckets.length; bi++) {
  const b = buckets[bi];
  for (let si = 0; si < 25; si++) {
    const subject = `${b.subject} ${b.anchor} catégorie ${si + 1}`;
    for (let ti = 0; ti < templates.length; ti++) {
      const tpl = templates[ti];
      for (let ci = 0; ci < contexts.length; ci++) {
        for (let vi = 0; vi < suffixes.length; vi++) {
          const question = `${tpl.make(subject)} ${contexts[ci]}${suffixes[vi]}`;
          total++;
          last = question;
          const signature = ((((bi * 25 + si) * templates.length + ti) * contexts.length + ci) * suffixes.length + vi);
          if (!signatures.has(signature)) { signatures.add(signature); unique++; }

          const contract = classifyQuestion(question);
          intents[contract.intent] = (intents[contract.intent] ?? 0) + 1;
          domains[contract.domain] = (domains[contract.domain] ?? 0) + 1;

          // Toute météo est temporelle par nature, même formulée « explique la météo ».
          const expectedIntent: QuestionIntent = tpl.intent === "fact" && b.domain === "weather" ? "current" : tpl.intent;
          if (contract.intent !== expectedIntent) fail(question, `intent=${contract.intent}, attendu=${expectedIntent}`);
          const expectedDom: QuestionDomain = b.domain === "general" && question.toLowerCase().startsWith("actualité") ? "news" : expectedDomain(b);
          if (contract.domain !== expectedDom) fail(question, `domain=${contract.domain}, attendu=${expectedDom}`);
          if (!contract.queryVariants.length || contract.queryVariants[0].length < 3) fail(question, "queryVariants vide");
          if (new Set(contract.queryVariants).size !== contract.queryVariants.length) fail(question, "queryVariants dupliqués");
          if (["count", "list"].includes(contract.intent)) {
            if (!contract.exhaustive) fail(question, "liste/décompte non exhaustif");
            if (contract.minItems < 3) fail(question, "minItems insuffisant");
            if (!contract.mustStateScope) fail(question, "périmètre non exigé");
          }
          if (contract.timeSensitive && contract.minSources < 2) fail(question, "actualité avec moins de 2 sources");
          if (contract.highStakes && contract.minSources < 2) fail(question, "domaine sensible avec moins de 2 sources");
          if (contract.intent === "comparison" && contract.minAspects < 2) fail(question, "comparaison avec moins de 2 axes");

          // Le vérificateur doit rejeter une réponse volontairement partielle.
          const weak = verifyCompleteness(contract, {
            sourceCount: 1, itemCount: 1, aspectCount: 1,
            hasScope: false, hasDate: false, answerLength: 20, boilerplateRatio: 0.4,
          });
          if (weak.pass) fail(question, "réponse faible acceptée");
        }
      }
    }
  }
}

const durationMs = Math.round(performance.now() - started);
const report = {
  generatedAt: new Date().toISOString(),
  total,
  unique,
  collisions: total - unique,
  failures,
  passRate: Number((((total - failures) / total) * 100).toFixed(6)),
  durationMs,
  throughputPerSecond: Math.round(total / (durationMs / 1000)),
  intentDistribution: intents,
  domainDistribution: domains,
  failureFamilies: reasonCounts,
  failureSamples: samples,
  lastQuestion: last,
};

mkdirSync("artifacts", { recursive: true });
writeFileSync("artifacts/million-question-audit.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failures > 0) process.exitCode = 1;
