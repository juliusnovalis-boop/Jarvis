import { askBrain, askLocalBrain, type BrainMessage } from "@/lib/jarvis/brain";
import { planCognitiveRoute, type CognitivePlan } from "@/lib/jarvis/cognitive-router";
import { browseAnswer } from "@/lib/jarvis/websearch";

export interface OrchestratorResult {
  reply: string;
  engine: string;
  model?: string | null;
  sources?: { title: string; url: string }[];
  plan: CognitivePlan;
}

const REASONING_INSTRUCTION = `
MODE DE RAISONNEMENT JARVIS :
- Analyse silencieusement l'objectif reel de l'utilisateur avant de repondre.
- Decompose mentalement les problemes complexes en etapes.
- Verifie la coherence des faits, nombres et conclusions.
- Distingue les faits, les hypotheses et les recommandations.
- Ne revele pas une chaine de pensee privee : donne seulement une synthese claire,
  les etapes utiles et, si necessaire, les hypotheses retenues.
- Pour une action PC non executee par un outil, ne pretend jamais qu'elle a reussi :
  demande la precision manquante ou explique ce qu'il faut faire.
`;

function contextForPlan(plan: CognitivePlan, memoryContext: string, lang: "fr" | "en") {
  return [
    REASONING_INSTRUCTION,
    `PLAN DU ROUTEUR : ${plan.route}; type : ${plan.kind}; confiance : ${Math.round(plan.confidence * 100)} %.`,
    `MOTIF : ${plan.reason}`,
    plan.kind === "ambiguous_action"
      ? "La demande ressemble a une action mais aucun outil deterministe ne l'a comprise. Clarifie la cible; ne simule aucune execution."
      : "",
    plan.contract.highStakes
      ? "Domaine sensible : reste prudent, signale les limites et ne remplace pas un professionnel."
      : "",
    lang === "en" ? "Answer in English." : "Reponds en francais.",
    memoryContext ? `MEMOIRE UTILISATEUR :\n${memoryContext}` : "",
  ].filter(Boolean).join("\n");
}

/**
 * Orchestrateur cognitif : choisit une source, raisonne, puis verifie qu'il ne
 * pretend pas disposer de faits frais lorsqu'Internet a echoue.
 */
export async function orchestrateRequest(args: {
  input: string;
  history?: BrainMessage[];
  memoryContext?: string;
  lang?: "fr" | "en";
}): Promise<OrchestratorResult> {
  const { input, history = [], memoryContext = "", lang = "fr" } = args;
  const plan = planCognitiveRoute(input);
  const context = contextForPlan(plan, memoryContext, lang);

  if (plan.route === "local") {
    const brain = plan.privacyRequested
      ? await askLocalBrain(input, history, context)
      : await askBrain(input, history, context);

    if (brain) {
      return {
        reply: brain.text,
        engine: `${plan.route}:${brain.engine}`,
        model: brain.model,
        plan,
      };
    }

    // Une connaissance stable peut etre recuperee sur le web en dernier recours,
    // sauf si l'utilisateur a explicitement exige le mode prive.
    if (!plan.privacyRequested && plan.kind !== "creative" && plan.kind !== "personal") {
      const web = await browseAnswer(input, lang);
      if (web) {
        return {
          reply: web.text,
          engine: `fallback-web:${web.provider}`,
          sources: web.sources,
          plan,
        };
      }
    }

    return {
      reply: plan.privacyRequested
        ? "Le mode prive est bien respecte, mais aucun modele Ollama local de six milliards de parametres ou moins ne repond. Lancez Ollama ou choisissez un modele local dans le panneau Cerveau."
        : "Je comprends la demande, mais aucun modele de raisonnement n'est disponible. Lancez Ollama localement ou configurez Gemini, Groq, Mistral, DeepSeek, OpenRouter, OpenAI ou Anthropic.",
      engine: "unavailable",
      plan,
    };
  }

  // browseAnswer lit plusieurs pages et utilise lui-meme le meilleur cerveau
  // disponible pour synthetiser et recouper. C'est donc deja un pipeline hybride.
  const web = await browseAnswer(input, lang);
  if (web) {
    return {
      reply: web.text,
      engine: `${plan.route}:${web.provider}`,
      sources: web.sources,
      plan,
    };
  }

  // Internet en echec : un modele peut expliquer ses connaissances, mais doit
  // indiquer clairement qu'il n'a pas pu verifier les faits frais.
  const fallback = await askBrain(
    input,
    history,
    `${context}\nIMPORTANT : la recherche Internet a echoue. Si la demande concerne une information actuelle, dis explicitement qu'elle n'a pas pu etre verifiee en direct.`
  );
  if (fallback) {
    return {
      reply: plan.needsFreshFacts
        ? `Je n'ai pas pu verifier Internet en direct. ${fallback.text}`
        : fallback.text,
      engine: `web-failed:${fallback.engine}`,
      model: fallback.model,
      plan,
    };
  }

  return {
    reply: "Je comprends votre demande, mais mes sources Internet et mes modeles de raisonnement sont momentanement indisponibles. Je prefere vous le dire plutot que d'inventer une reponse.",
    engine: "unavailable",
    plan,
  };
}
