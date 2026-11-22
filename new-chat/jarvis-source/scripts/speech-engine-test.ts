/**
 * Banc d'essai du moteur de parole.
 * Simule les comportements réels de Chromium / Electron, y compris ses
 * défauts, et vérifie que la phrase d'accueil est bien prononcée.
 */
import { createSpeechEngine, type SpeechHost } from "../src/lib/jarvis/speech-engine";

/* ---------- Simulateur de SpeechSynthesis façon Chromium ---------- */

interface FakeVoice {
  voiceURI: string;
  name: string;
  lang: string;
  default: boolean;
  localService: boolean;
}

interface SimOptions {
  /** Délai avant que getVoices() ne renvoie enfin les voix (ms). */
  voicesReadyAfterMs: number;
  /** Reproduit le bug : speak() juste après cancel() est ignoré. */
  breakSpeakAfterCancel: boolean;
  /** Fenêtre pendant laquelle speak() reste cassé après un cancel (ms). */
  brokenWindowMs: number;
  /** Aucune voix française disponible (cas Electron minimal). */
  voices: FakeVoice[];
}

class ChromiumSim {
  speaking = false;
  pending = false;
  spokenText: string[] = [];
  private lastCancelAt = -1e9;
  private now = 0;
  private timers: { at: number; fn: () => void; id: number }[] = [];
  private nextId = 1;

  constructor(private opts: SimOptions) {}

  /* --- horloge virtuelle --- */
  setTimeout = (fn: () => void, ms: number): number => {
    const id = this.nextId++;
    this.timers.push({ at: this.now + Math.max(0, ms), fn, id });
    return id;
  };
  clearTimeout = (id: number) => {
    this.timers = this.timers.filter((t) => t.id !== id);
  };
  /** Avance le temps simulé jusqu'à épuisement ou limite. */
  run(maxMs = 30000) {
    let guard = 0;
    while (this.timers.length && guard++ < 100000) {
      this.timers.sort((a, b) => a.at - b.at);
      const next = this.timers.shift()!;
      if (next.at > this.now + maxMs) break;
      this.now = next.at;
      next.fn();
    }
  }

  getVoices = (): SpeechSynthesisVoice[] =>
    (this.now >= this.opts.voicesReadyAfterMs
      ? this.opts.voices
      : []) as unknown as SpeechSynthesisVoice[];

  cancel = () => {
    this.lastCancelAt = this.now;
    this.speaking = false;
    this.pending = false;
  };

  speak = (u: SpeechSynthesisUtterance) => {
    const broken =
      this.opts.breakSpeakAfterCancel &&
      this.now - this.lastCancelAt < this.opts.brokenWindowMs;
    if (broken) {
      // Le bug Chromium : l'utterance est acceptée mais ne démarre jamais.
      this.pending = true;
      return;
    }
    this.pending = true;
    const text = (u as unknown as { text: string }).text;
    this.setTimeout(() => {
      this.pending = false;
      this.speaking = true;
      if (text.trim()) this.spokenText.push(text);
      u.onstart?.(null as never);
      const duration = Math.max(120, text.length * 12);
      this.setTimeout(() => {
        this.speaking = false;
        u.onend?.(null as never);
      }, duration);
    }, 30);
  };

  makeUtterance = (text: string): SpeechSynthesisUtterance => {
    const u: Record<string, unknown> = { text, volume: 1, rate: 1, pitch: 1, lang: "" };
    return u as unknown as SpeechSynthesisUtterance;
  };

  host(): SpeechHost {
    return {
      synth: this as unknown as SpeechSynthesis,
      makeUtterance: this.makeUtterance,
      setTimeout: this.setTimeout,
      clearTimeout: this.clearTimeout,
    };
  }
}

const FR_VOICES: FakeVoice[] = [
  { voiceURI: "fr1", name: "Microsoft Denise - French", lang: "fr-FR", default: true, localService: true },
  { voiceURI: "en1", name: "Microsoft Aria", lang: "en-US", default: false, localService: true },
];
const EN_ONLY: FakeVoice[] = [
  { voiceURI: "en1", name: "Microsoft Aria", lang: "en-US", default: true, localService: true },
];

const INTRO =
  "Bonjour. Tous mes systèmes sont opérationnels : voix, mémoire, météo, calcul, minuterie et recherche. " +
  "Je vous écoute en permanence : dites simplement « Jarvis » suivi de votre demande. Comment puis-je vous aider ?";

/* ---------- Scénarios ---------- */

interface Scenario {
  nom: string;
  opts: SimOptions;
  /** Reproduit la séquence réelle : prime() au clic, puis say() 500 ms après. */
  primeThenSpeak: boolean;
}

const scenarios: Scenario[] = [
  {
    nom: "Chromium sain, voix immédiates",
    opts: { voicesReadyAfterMs: 0, breakSpeakAfterCancel: false, brokenWindowMs: 0, voices: FR_VOICES },
    primeThenSpeak: true,
  },
  {
    nom: "Voix chargées tardivement (800 ms)",
    opts: { voicesReadyAfterMs: 800, breakSpeakAfterCancel: false, brokenWindowMs: 0, voices: FR_VOICES },
    primeThenSpeak: true,
  },
  {
    nom: "BUG Chromium : speak() cassé 300 ms après cancel()",
    opts: { voicesReadyAfterMs: 0, breakSpeakAfterCancel: true, brokenWindowMs: 300, voices: FR_VOICES },
    primeThenSpeak: true,
  },
  {
    nom: "Pire cas : voix tardives + speak() cassé 1 s",
    opts: { voicesReadyAfterMs: 1200, breakSpeakAfterCancel: true, brokenWindowMs: 1000, voices: FR_VOICES },
    primeThenSpeak: true,
  },
  {
    nom: "Electron sans voix française (anglaise seulement)",
    opts: { voicesReadyAfterMs: 200, breakSpeakAfterCancel: false, brokenWindowMs: 0, voices: EN_ONLY },
    primeThenSpeak: true,
  },
  {
    nom: "Réponse à un message écrit (sans prime)",
    opts: { voicesReadyAfterMs: 0, breakSpeakAfterCancel: true, brokenWindowMs: 300, voices: FR_VOICES },
    primeThenSpeak: false,
  },
];

let failures = 0;

for (const sc of scenarios) {
  const sim = new ChromiumSim(sc.opts);
  const engine = createSpeechEngine(sim.host());
  const trace: string[] = [];
  let ended = false;

  if (sc.primeThenSpeak) {
    engine.prime();
    sim.setTimeout(() => {
      engine.speak(INTRO, {
        lang: "fr",
        rate: 1,
        volume: 1,
        voiceURI: null,
        onEnd: () => { ended = true; },
        onTrace: (s) => trace.push(s),
      });
    }, 500);
  } else {
    engine.speak(INTRO, {
      lang: "fr", rate: 1, volume: 1, voiceURI: null,
      onEnd: () => { ended = true; },
      onTrace: (s) => trace.push(s),
    });
  }

  sim.run();

  const audible = sim.spokenText.join(" ");
  const saidBonjour = audible.includes("Bonjour");
  const saidJarvis = audible.includes("Jarvis");
  const complet = saidBonjour && saidJarvis && ended;

  console.log(`\n▸ ${sc.nom}`);
  console.log(`   morceaux prononcés : ${sim.spokenText.length}`);
  console.log(`   « Bonjour » audible : ${saidBonjour ? "oui" : "NON"}`);
  console.log(`   « Jarvis » audible  : ${saidJarvis ? "oui" : "NON"}`);
  console.log(`   onEnd appelé        : ${ended ? "oui" : "NON"}`);
  console.log(`   trace : ${trace.join(" → ")}`);
  console.log(`   ${complet ? "✓ RÉUSSI" : "✗ ÉCHEC"}`);
  if (!complet) failures++;
}

console.log(`\n${failures === 0 ? "✓ TOUS LES SCÉNARIOS RÉUSSIS" : `✗ ${failures} scénario(s) en échec`}`);
process.exitCode = failures === 0 ? 0 : 1;
