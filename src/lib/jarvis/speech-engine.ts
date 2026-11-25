/**
 * MOTEUR DE PAROLE DE JARVIS
 *
 * Isolé de React pour être testable. Il contourne trois défauts connus de
 * Chromium / Electron qui empêchaient la phrase d'accueil d'être prononcée :
 *
 *  1. getVoices() renvoie [] pendant les premières centaines de ms.
 *  2. speak() appelé immédiatement après cancel() est silencieusement ignoré.
 *  3. Une élocution peut ne jamais démarrer : il faut un chien de garde
 *     sur l'événement onstart, puis réessayer.
 */

export interface SpeechHost {
  synth: SpeechSynthesis;
  makeUtterance: (text: string) => SpeechSynthesisUtterance;
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
}

export interface SpeakOptions {
  voiceURI?: string | null;
  lang: "fr" | "en";
  rate: number;
  volume: number;
  pitch?: number;
  onStart?: () => void;
  onBoundary?: () => void;
  onEnd?: () => void;
  /** Diagnostic : chaque étape importante du cycle de parole. */
  onTrace?: (step: string) => void;
}

/** Délai minimal entre un cancel() et le speak() suivant (défaut Chromium). */
export const CANCEL_SETTLE_MS = 140;
/** Si onstart ne survient pas dans ce délai, on considère l'élocution perdue. */
export const START_WATCHDOG_MS = 1500;
/** Nombre de reprises avant d'abandonner. */
export const MAX_RETRIES = 2;

export function pickVoiceForLang(
  list: SpeechSynthesisVoice[],
  lang: "fr" | "en"
): SpeechSynthesisVoice | null {
  if (!list.length) return null;
  const main = lang === "en" ? "en-us" : "fr-fr";
  const score = (v: SpeechSynthesisVoice) => {
    const l = (v.lang ?? "").toLowerCase().replace("_", "-");
    const n = (v.name ?? "").toLowerCase();
    let s = 0;
    if (l === main) s += 5;
    else if (l.startsWith(lang)) s += 3;
    else return -1;
    if (n.includes("google")) s += 3;
    if (n.includes("natural") || n.includes("neural") || n.includes("online")) s += 2;
    if (n.includes("thomas") || n.includes("denise") || n.includes("henri")) s += 2;
    if (n.includes("amélie") || n.includes("amelie") || n.includes("audrey")) s += 1;
    if (n.includes("samantha") || n.includes("daniel") || n.includes("aria")) s += 1;
    return s;
  };
  const ranked = list
    .map((v) => ({ v, s: score(v) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s);
  // Aucune voix dans la langue demandée : on prend la première disponible
  // plutôt que de rester muet.
  return ranked[0]?.v ?? list[0] ?? null;
}

/** Nettoie le texte pour la synthèse vocale. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "lien")
    .replace(/[*#_>`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Découpe en morceaux prononçables (~180 caractères). */
export function splitIntoChunks(clean: string, max = 180): string[] {
  const sentences = clean.match(/[^.!?…]+[.!?…]+["»)]?|[^.!?…]+$/g) ?? [clean];
  const chunks: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + s).length > max && buf) {
      chunks.push(buf.trim());
      buf = s;
    } else {
      buf += s;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

export function createSpeechEngine(host: SpeechHost) {
  let speaking = false;
  let generation = 0;

  /** Attend que la liste des voix soit peuplée (elle arrive de façon asynchrone). */
  function waitForVoices(maxMs: number, done: (voices: SpeechSynthesisVoice[]) => void) {
    const started = Date.now();
    const tick = () => {
      const voices = host.synth.getVoices();
      if (voices.length > 0 || Date.now() - started >= maxMs) {
        done(voices);
        return;
      }
      host.setTimeout(tick, 100);
    };
    tick();
  }

  function stop() {
    generation++;
    speaking = false;
    try {
      host.synth.cancel();
    } catch {
      /* rien à annuler */
    }
  }

  /** Prépare le moteur : débloque l'audio après le premier geste utilisateur. */
  function prime() {
    try {
      host.synth.getVoices();
      const u = host.makeUtterance(" ");
      u.volume = 0;
      host.synth.speak(u);
      // On laisse l'élocution muette se terminer seule : un cancel() ici
      // remettrait Chromium dans l'état défaillant qu'on cherche à éviter.
    } catch {
      /* moteur indisponible */
    }
  }

  function speak(text: string, options: SpeakOptions) {
    const trace = options.onTrace ?? (() => undefined);
    const clean = cleanForSpeech(text);
    if (!clean) {
      options.onEnd?.();
      return;
    }

    const myGeneration = ++generation;
    const chunks = splitIntoChunks(clean);
    const alive = () => myGeneration === generation;

    // 1. On annule l'élocution en cours, puis on laisse Chromium respirer.
    try {
      if (host.synth.speaking || host.synth.pending) {
        host.synth.cancel();
        trace("cancel");
      }
    } catch {
      /* ignoré */
    }

    host.setTimeout(() => {
      if (!alive()) {
        trace("abandon:remplacé");
        return;
      }
      // 2. On attend d'avoir une voix avant de parler.
      waitForVoices(3000, (voices) => {
        if (!alive()) {
          trace("abandon:remplacé");
          return;
        }
        trace(`voix:${voices.length}`);
        const voice =
          voices.find((v) => v.voiceURI === options.voiceURI) ??
          pickVoiceForLang(voices, options.lang);

        let index = 0;
        let ended = false;
        let retries = 0;

        const finish = (reason: string) => {
          if (ended) return;
          ended = true;
          if (myGeneration === generation) speaking = false;
          trace(`fin:${reason}`);
          options.onEnd?.();
        };

        const speakChunk = () => {
          if (!alive()) {
            trace("abandon:remplacé");
            return;
          }
          if (index >= chunks.length) {
            finish("terminé");
            return;
          }
          const current = chunks[index];
          const u = host.makeUtterance(current);
          if (voice) {
            u.voice = voice;
            u.lang = voice.lang;
          } else {
            u.lang = options.lang === "en" ? "en-US" : "fr-FR";
          }
          u.rate = options.rate;
          u.pitch = options.pitch ?? 0.92;
          u.volume = Math.max(0, Math.min(1, options.volume));

          let started = false;
          let watchdog: number | null = null;

          const clearWatchdog = () => {
            if (watchdog !== null) {
              host.clearTimeout(watchdog);
              watchdog = null;
            }
          };

          u.onstart = () => {
            started = true;
            clearWatchdog();
            speaking = true;
            trace(`début:${index + 1}/${chunks.length}`);
            options.onStart?.();
          };
          u.onboundary = () => options.onBoundary?.();
          u.onend = () => {
            clearWatchdog();
            index++;
            speakChunk();
          };
          u.onerror = () => {
            clearWatchdog();
            trace("erreur:utterance");
            index++;
            speakChunk();
          };

          try {
            host.synth.speak(u);
          } catch {
            trace("erreur:speak");
            finish("exception");
            return;
          }

          // 3. Chien de garde : si rien ne démarre, on réessaie proprement.
          watchdog = host.setTimeout(() => {
            if (started || ended || !alive()) return;
            if (retries < MAX_RETRIES) {
              retries++;
              trace(`reprise:${retries}`);
              try {
                host.synth.cancel();
              } catch {
                /* ignoré */
              }
              host.setTimeout(speakChunk, CANCEL_SETTLE_MS);
            } else {
              trace("abandon:silencieux");
              finish("inaudible");
            }
          }, START_WATCHDOG_MS);
        };

        speaking = true;
        speakChunk();
      });
    }, CANCEL_SETTLE_MS);
  }

  return { speak, stop, prime, isSpeaking: () => speaking };
}
