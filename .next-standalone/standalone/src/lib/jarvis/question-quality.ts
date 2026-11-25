/**
 * CONTRATS DE RÉPONSE JARVIS
 *
 * Une réponse « correcte » ne se juge pas seulement à sa longueur. Ce module
 * classe la demande et décrit les preuves minimales attendues avant de répondre.
 * Il est partagé par la production et le banc d'audit d'un million de questions.
 */

export type QuestionIntent =
  | "count"
  | "list"
  | "comparison"
  | "procedure"
  | "recommendation"
  | "current"
  | "definition"
  | "fact";

export type QuestionDomain =
  | "sports"
  | "finance"
  | "weather"
  | "news"
  | "health"
  | "legal"
  | "technology"
  | "science"
  | "history"
  | "geography"
  | "travel"
  | "shopping"
  | "food"
  | "entertainment"
  | "general";

export interface AnswerContract {
  intent: QuestionIntent;
  domain: QuestionDomain;
  exhaustive: boolean;
  timeSensitive: boolean;
  highStakes: boolean;
  minSources: number;
  minItems: number;
  minAspects: number;
  mustStateScope: boolean;
  queryVariants: string[];
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const DOMAIN_RULES: { domain: QuestionDomain; re: RegExp }[] = [
  { domain: "sports", re: /\b(match|football|foot|liga|ligue|championnat|score|club|psg|real madrid|nba|tennis|rugby|formule 1|grand prix)\b/ },
  { domain: "finance", re: /\b(action|bourse|cours|bitcoin|crypto|euro|dollar|taux|inflation|cac 40|nasdaq|finance|prix de l'or)\b/ },
  { domain: "weather", re: /\b(meteo|temperature|pluie|neige|vent|orage|climat|temps fera|prevision)\b/ },
  { domain: "health", re: /\b(sante|symptome|maladie|medicament|traitement|dose|diagnostic|grippe|douleur|medecin|vaccin)\b/ },
  { domain: "legal", re: /\b(loi|legal|juridique|droit|contrat|tribunal|avocat|impot|fiscal|reglementation)\b/ },
  { domain: "technology", re: /\b(code|logiciel|python|javascript|typescript|react|vue|ordinateur|ia|intelligence artificielle|api|linux|windows|iphone|android)\b/ },
  { domain: "science", re: /\b(science|physique|chimie|biologie|espace|planete|terre|mars|soleil|atome|energie|quantique)\b/ },
  { domain: "history", re: /\b(histoire|historique|guerre|revolution|siecle|empire|mai 1968|antiquite|moyen age)\b/ },
  { domain: "geography", re: /\b(pays|capitale|frontiere|fleuve|montagne|continent|population|superficie|ville|geographie)\b/ },
  { domain: "travel", re: /\b(voyage|destination|hotel|vol|vacances|visiter|tourisme|itineraire|visa)\b/ },
  { domain: "shopping", re: /\b(acheter|achat|meilleur prix|comparatif|promotion|soldes|produit|boutique|amazon)\b/ },
  { domain: "food", re: /\b(recette|cuisine|ingredient|plat|carbonara|cuisson|restaurant|nutrition)\b/ },
  { domain: "entertainment", re: /\b(film|cinema|serie|musique|album|artiste|acteur|jeu video|netflix|sortie)\b/ },
  // News arrive après les sujets : « actualité santé » reste du domaine santé.
  { domain: "news", re: /\b(actualite|actualites|news|dernieres nouvelles|en direct|ce qui se passe)\b/ },
];

export function detectDomain(question: string): QuestionDomain {
  const q = normalize(question);
  return DOMAIN_RULES.find((r) => r.re.test(q))?.domain ?? "general";
}

export function detectIntent(question: string): QuestionIntent {
  const q = normalize(question);
  // Priorité aux constructions sémantiques fortes. Un suffixe « cite tes
  // sources » ne doit jamais écraser l'intention principale.
  if (/\b(combien|nombre de|quantite de|how many|how much)\b/.test(q)) return "count";
  if (/\b(compare|comparaison|difference|differentes?|versus|\bvs\b|avantages?.*inconvenients?|meilleur entre|difference between)\b/.test(q)) return "comparison";
  if (/^(comment faire|comment puis|quelles? etapes?|etapes?|procedure|tutoriel|guide|recette|how to|mode d'emploi|installer|configurer)\b/.test(q)) return "procedure";
  if (/\b(recommande|conseille|meilleur|meilleure|top \d+|choisir|ou aller|que visiter|recommend)\b/.test(q)) return "recommendation";
  if (/^(c'est quoi|qu'est-ce que|qu'est ce que|definis?|definition|qui est|que signifie|what is|who is)\b/.test(q)) return "definition";
  if (/^(quels sont|quelles sont|quels |quelles |liste |lister |enumere |cite |donne[- ]moi les |what are |which are )|\b(tous les|toutes les)\b/.test(q)) return "list";
  if (/\b(aujourd'hui|ce soir|demain|hier|maintenant|actuellement|en direct|cette semaine|ce mois|dernier|derniere|recent|recente|cours de|prix de|meteo|programme)\b/.test(q)) return "current";
  return "fact";
}

const TEMPORAL = /\b(aujourd'hui|ce soir|demain|hier|maintenant|actuel|actuelle|actuels|actuelles|actuellement|en direct|cette semaine|ce mois|dernier|derniere|recent|recente|202[4-9]|cours de|prix de|meteo|programme|sortie)\b/;
const HIGH_STAKES = new Set<QuestionDomain>(["health", "legal", "finance"]);

/** Génère plusieurs formulations de recherche afin de réduire l'angle mort d'un moteur. */
export function buildQueryVariants(question: string, intent?: QuestionIntent, domain?: QuestionDomain): string[] {
  const q = question.replace(/[?!.]+$/g, "").trim();
  const i = intent ?? detectIntent(q);
  const d = domain ?? detectDomain(q);
  const year = new Date().getFullYear();
  const variants = [q];

  if (i === "count" || i === "list") {
    variants.push(`${q} liste complète`);
    variants.push(`${q} tous les éléments ${year}`);
  } else if (i === "comparison") {
    variants.push(`${q} comparatif détaillé critères avantages inconvénients`);
    variants.push(`${q} documentation officielle`);
  } else if (i === "procedure") {
    variants.push(`${q} étapes détaillées guide officiel`);
    variants.push(`${q} tutoriel ${year}`);
  } else if (i === "current") {
    variants.push(`${q} ${year} aujourd'hui source officielle`);
    variants.push(`${q} dernières informations en direct`);
  } else if (i === "recommendation") {
    variants.push(`${q} comparatif ${year}`);
    variants.push(`${q} avis experts critères`);
  }

  if (d === "health") variants.push(`${q} site:ameli.fr OR site:who.int OR site:has-sante.fr`);
  if (d === "legal") variants.push(`${q} site:service-public.fr OR site:legifrance.gouv.fr`);
  if (d === "finance") variants.push(`${q} données temps réel source officielle`);
  if (d === "technology") variants.push(`${q} documentation officielle`);

  return [...new Set(variants)].slice(0, 4);
}

export function classifyQuestion(question: string): AnswerContract {
  const intent = detectIntent(question);
  const domain = detectDomain(question);
  const q = normalize(question);
  const timeSensitive = TEMPORAL.test(q) || ["weather", "news", "finance", "sports"].includes(domain);
  const exhaustive = intent === "count" || intent === "list" || /\b(complet|exhaustif|tous|toutes|sans oublier)\b/.test(q);
  const highStakes = HIGH_STAKES.has(domain);

  let minSources = 1;
  let minItems = 0;
  let minAspects = 0;
  if (timeSensitive || highStakes) minSources = 2;
  if (intent === "comparison" || intent === "recommendation") minSources = Math.max(minSources, 2);
  if (intent === "count" || intent === "list") minItems = 3;
  if (intent === "procedure") minItems = 3;
  if (intent === "comparison") minAspects = 2;

  return {
    intent,
    domain,
    exhaustive,
    timeSensitive,
    highStakes,
    minSources,
    minItems,
    minAspects,
    mustStateScope: exhaustive || timeSensitive,
    queryVariants: buildQueryVariants(question, intent, domain),
  };
}

export interface QualityEvidence {
  sourceCount: number;
  itemCount: number;
  aspectCount: number;
  hasScope: boolean;
  hasDate: boolean;
  answerLength: number;
  boilerplateRatio?: number;
}

export interface QualityVerdict {
  pass: boolean;
  score: number;
  missing: string[];
}

/** Vérifie que la réponse satisfait le contrat, sans prétendre juger sa vérité. */
export function verifyCompleteness(contract: AnswerContract, evidence: QualityEvidence): QualityVerdict {
  const missing: string[] = [];
  if (evidence.sourceCount < contract.minSources) missing.push(`sources:${evidence.sourceCount}/${contract.minSources}`);
  if (evidence.itemCount < contract.minItems) missing.push(`items:${evidence.itemCount}/${contract.minItems}`);
  if (evidence.aspectCount < contract.minAspects) missing.push(`aspects:${evidence.aspectCount}/${contract.minAspects}`);
  if (contract.mustStateScope && !evidence.hasScope) missing.push("scope");
  if (contract.timeSensitive && !evidence.hasDate) missing.push("date");
  if (evidence.answerLength < 35) missing.push("too-short");
  if ((evidence.boilerplateRatio ?? 0) > 0.2) missing.push("boilerplate");

  const total = 6;
  const score = Math.max(0, Math.round(((total - missing.length) / total) * 100));
  return { pass: missing.length === 0, score, missing };
}
