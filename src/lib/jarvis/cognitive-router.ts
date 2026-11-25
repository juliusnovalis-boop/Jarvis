import { classifyQuestion, type AnswerContract, type QuestionDomain } from "@/lib/jarvis/question-quality";

export type CognitiveRoute = "local" | "web" | "hybrid";
export type RequestKind =
  | "current_fact"
  | "timeless_knowledge"
  | "reasoning"
  | "creative"
  | "personal"
  | "high_stakes"
  | "recommendation"
  | "ambiguous_action";

export interface CognitivePlan {
  route: CognitiveRoute;
  kind: RequestKind;
  confidence: number;
  reason: string;
  contract: AnswerContract;
  needsFreshFacts: boolean;
  needsReasoning: boolean;
  privacyRequested: boolean;
  shouldCite: boolean;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const EXPLICIT_WEB = /\b(internet|sur le web|cherche en ligne|recherche en ligne|google|sources? recentes?|verifie en ligne|nouvelles? du jour)\b/;
const EXPLICIT_PRIVATE = /\b(sans internet|hors ligne|en local|localement|prive|confidentiel|n'envoie rien|uniquement ollama)\b/;
const CREATIVE = /\b(invente|imagine|ecris|redige|reformule|resume|poeme|histoire|scenario|idee|brainstorm|nom de marque|discours|lettre)\b/;
const REASONING = /\b(raisonne|analyse|deduis|conclus|pourquoi|explique|resous|strategie|plan d'action|avantages?|inconvenients?|compare|hypothese|si .* alors|que se passerait|qu'arriverait|aide-moi a choisir|decision)\b/;
const PERSONAL = /\b(selon mes|mes notes|mes taches|mon projet|pour moi|mon cas|notre conversation|souviens-toi|d'apres ce que tu sais de moi)\b/;
const IMPERATIVE = /^(ouvre|ferme|lance|demarre|cree|ecris|copie|deplace|supprime|installe|execute|envoie|clique|tape|mets|allume|eteins)\b/;

function recommendationNeedsWeb(domain: QuestionDomain, q: string) {
  return ["shopping", "travel", "finance", "technology", "entertainment"].includes(domain) ||
    /\b(prix|acheter|meilleur|actuel|202[4-9]|disponible|sortie|avis)\b/.test(q);
}

/**
 * Routeur deterministic et testable. Le LLM ne choisit jamais seul un outil
 * dangereux : les actions reelles sont traitees avant ce routeur dans engine.ts.
 */
export function planCognitiveRoute(input: string): CognitivePlan {
  const q = norm(input);
  const contract = classifyQuestion(input);
  const privacyRequested = EXPLICIT_PRIVATE.test(q);
  const explicitWeb = EXPLICIT_WEB.test(q);
  const creative = CREATIVE.test(q);
  const reasoning = REASONING.test(q) || contract.intent === "comparison" || contract.intent === "procedure";
  const personal = PERSONAL.test(q);
  const highStakes = contract.highStakes;
  const recommendation = contract.intent === "recommendation";
  const needsFreshFacts = contract.timeSensitive || explicitWeb;

  if (privacyRequested) {
    return {
      route: "local",
      kind: personal ? "personal" : reasoning ? "reasoning" : "timeless_knowledge",
      confidence: 0.98,
      reason: "L'utilisateur demande explicitement un traitement local/prive.",
      contract,
      needsFreshFacts: false,
      needsReasoning: reasoning || creative || personal,
      privacyRequested: true,
      shouldCite: false,
    };
  }

  if (explicitWeb) {
    return {
      route: reasoning || highStakes ? "hybrid" : "web",
      kind: needsFreshFacts ? "current_fact" : "timeless_knowledge",
      confidence: 0.98,
      reason: "L'utilisateur demande explicitement une verification Internet.",
      contract,
      needsFreshFacts: true,
      needsReasoning: reasoning,
      privacyRequested: false,
      shouldCite: true,
    };
  }

  if (highStakes) {
    return {
      route: "hybrid",
      kind: "high_stakes",
      confidence: 0.93,
      reason: "Le domaine sensible exige faits recoupes et raisonnement prudent.",
      contract,
      needsFreshFacts: true,
      needsReasoning: true,
      privacyRequested: false,
      shouldCite: true,
    };
  }

  if (needsFreshFacts) {
    return {
      route: reasoning || recommendation ? "hybrid" : "web",
      kind: "current_fact",
      confidence: 0.95,
      reason: "La demande contient une contrainte temporelle ou des donnees volatiles.",
      contract,
      needsFreshFacts: true,
      needsReasoning: reasoning || recommendation,
      privacyRequested: false,
      shouldCite: true,
    };
  }

  if (recommendation && recommendationNeedsWeb(contract.domain, q)) {
    return {
      route: "hybrid",
      kind: "recommendation",
      confidence: 0.88,
      reason: "Une recommandation utile combine options actuelles et analyse des criteres.",
      contract,
      needsFreshFacts: true,
      needsReasoning: true,
      privacyRequested: false,
      shouldCite: true,
    };
  }

  if (creative) {
    return {
      route: "local",
      kind: "creative",
      confidence: 0.92,
      reason: "La creation ne necessite pas de recherche Internet.",
      contract,
      needsFreshFacts: false,
      needsReasoning: true,
      privacyRequested: false,
      shouldCite: false,
    };
  }

  if (personal) {
    return {
      route: "local",
      kind: "personal",
      confidence: 0.94,
      reason: "La reponse depend de la memoire et du contexte utilisateur.",
      contract,
      needsFreshFacts: false,
      needsReasoning: true,
      privacyRequested: false,
      shouldCite: false,
    };
  }

  // Une action imperative inconnue arrive ici seulement si aucun outil ne l'a
  // comprise. Le modele doit clarifier, jamais pretendre l'avoir executee.
  if (IMPERATIVE.test(q)) {
    return {
      route: "local",
      kind: "ambiguous_action",
      confidence: 0.83,
      reason: "Action non reconnue par les outils : interpretation et clarification requises.",
      contract,
      needsFreshFacts: false,
      needsReasoning: true,
      privacyRequested: false,
      shouldCite: false,
    };
  }

  return {
    route: "local",
    kind: reasoning ? "reasoning" : "timeless_knowledge",
    confidence: reasoning ? 0.9 : 0.82,
    reason: reasoning
      ? "La demande exige une analyse mais pas de donnee recente."
      : "Connaissance stable : le modele local est prioritaire.",
    contract,
    needsFreshFacts: false,
    needsReasoning: reasoning,
    privacyRequested: false,
    shouldCite: false,
  };
}
