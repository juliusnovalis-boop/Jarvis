import { planCognitiveRoute, type CognitiveRoute } from "../src/lib/jarvis/cognitive-router";

const cases: { input: string; route: CognitiveRoute; kind?: string }[] = [
  // Internet obligatoire : informations volatiles
  { input: "Quel est le prix du bitcoin aujourd'hui ?", route: "hybrid", kind: "high_stakes" },
  { input: "Qui a gagné le dernier match du PSG ?", route: "web", kind: "current_fact" },
  { input: "Quelles sont les actualités technologiques du jour ?", route: "web", kind: "current_fact" },
  { input: "Cherche sur Internet les horaires du musée demain", route: "web", kind: "current_fact" },
  { input: "Quel temps fera-t-il demain à Lyon ?", route: "web", kind: "current_fact" },

  // Hybride : faits + raisonnement / prudence
  { input: "Compare les meilleurs téléphones actuels pour mon budget", route: "hybrid", kind: "current_fact" },
  { input: "Quels symptômes peuvent indiquer une grippe ?", route: "hybrid", kind: "high_stakes" },
  { input: "Que dit la loi actuelle sur ce contrat ?", route: "hybrid", kind: "high_stakes" },
  { input: "Aide-moi à choisir un hôtel à Rome", route: "hybrid", kind: "recommendation" },

  // Local prioritaire : raisonnement, création, contexte personnel
  { input: "Explique pourquoi le ciel est bleu", route: "local", kind: "reasoning" },
  { input: "Résous cette énigme logique", route: "local", kind: "reasoning" },
  { input: "Rédige une lettre polie à mon propriétaire", route: "local", kind: "creative" },
  { input: "Fais-moi un plan pour terminer mon projet", route: "local", kind: "personal" },
  { input: "Selon mes notes, que dois-je faire en premier ?", route: "local", kind: "personal" },
  { input: "Que se passerait-il si la Terre arrêtait de tourner ?", route: "local", kind: "reasoning" },
  { input: "Définis la photosynthèse", route: "local", kind: "timeless_knowledge" },

  // Vie privée explicite : Internet et cloud interdits
  { input: "Analyse ce problème en local sans Internet", route: "local", kind: "reasoning" },
  { input: "C'est confidentiel, réponds uniquement avec Ollama", route: "local" },

  // Action non comprise : raisonnement/clarification, jamais fausse confirmation
  { input: "Envoie ça à la bonne personne", route: "local", kind: "ambiguous_action" },
  { input: "Installe le truc dont on parlait", route: "local", kind: "ambiguous_action" },
];

let failures = 0;
for (const c of cases) {
  const p = planCognitiveRoute(c.input);
  const ok = p.route === c.route && (!c.kind || p.kind === c.kind);
  console.log(`${ok ? "✓" : "✗"} ${c.input}`);
  console.log(`   ${p.route} / ${p.kind} / ${Math.round(p.confidence * 100)} % — ${p.reason}`);
  if (!ok) {
    console.log(`   ATTENDU : ${c.route}${c.kind ? ` / ${c.kind}` : ""}`);
    failures++;
  }
}

console.log(`\n${cases.length - failures}/${cases.length} décisions cognitives conformes`);
process.exitCode = failures ? 1 : 0;
