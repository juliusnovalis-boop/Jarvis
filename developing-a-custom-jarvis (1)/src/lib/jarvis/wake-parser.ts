/** Parseur pur du mot-clé — partagé par le hook et les tests. */

export type WakeDecision =
  | { type: "ignore" }
  | { type: "wake"; armedUntil: number }
  | { type: "command"; command: string; armedUntil: number };

const WAKE = /\b(?:jarvis|jarvice|jarviss|jarvisse|jervis)\b/i;

export function parseDirectTranscript(text: string, isFinal: boolean): string | null {
  if (!isFinal) return null;
  const clean = normalizeVoiceText(text);
  return clean.length >= 2 ? clean : null;
}

export function normalizeVoiceText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[,:;.!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Comprend les deux façons naturelles de parler :
 *   « Jarvis, ouvre Word »          (une seule phrase)
 *   « Jarvis » [pause] « ouvre Word » (deux phrases)
 */
export function parseWakeTranscript(args: {
  text: string;
  isFinal: boolean;
  armedUntil: number;
  now?: number;
  armMs?: number;
}): WakeDecision {
  const now = args.now ?? Date.now();
  const armMs = args.armMs ?? 8000;
  const clean = normalizeVoiceText(args.text);
  if (!clean) return { type: "ignore" };

  const wake = WAKE.exec(clean);
  if (wake) {
    const after = clean.slice((wake.index ?? 0) + wake[0].length).trim();
    // Une longue hypothèse intermédiaire est suffisamment stable ; sinon on
    // attend isFinal pour ne pas couper « Jarvis, ouvre le... » trop tôt.
    if (after.length >= 2 && (args.isFinal || after.split(/\s+/).length >= 5)) {
      return { type: "command", command: after, armedUntil: 0 };
    }
    return { type: "wake", armedUntil: now + armMs };
  }

  // Le mot-clé a été dit dans l'énoncé précédent : la phrase suivante est la commande.
  if (args.armedUntil > now && args.isFinal && clean.length >= 2) {
    return { type: "command", command: clean, armedUntil: 0 };
  }

  return { type: "ignore" };
}
