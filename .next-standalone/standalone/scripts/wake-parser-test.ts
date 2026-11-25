import { parseDirectTranscript, parseWakeTranscript } from "../src/lib/jarvis/wake-parser";

const NOW = 1_000_000;
const tests = [
  { name: "une phrase", text: "Jarvis, ouvre Word sur mon PC", final: true, armed: 0, type: "command", cmd: "ouvre word sur mon pc" },
  { name: "variante Jarvice", text: "Jarvice ouvre la calculatrice", final: true, armed: 0, type: "command", cmd: "ouvre la calculatrice" },
  { name: "mot-clé seul", text: "Jarvis", final: true, armed: 0, type: "wake" },
  { name: "commande après pause", text: "ouvre Word sur mon PC", final: true, armed: NOW + 5000, type: "command", cmd: "ouvre word sur mon pc" },
  { name: "bruit sans mot-clé", text: "ouvre Word", final: true, armed: 0, type: "ignore" },
  { name: "armement expiré", text: "ouvre Word", final: true, armed: NOW - 1, type: "ignore" },
  { name: "hypothèse partielle courte", text: "Jarvis ouvre", final: false, armed: 0, type: "wake" },
  { name: "hypothèse finale", text: "Jarvis ouvre", final: true, armed: 0, type: "command", cmd: "ouvre" },
];

let failures = 0;
for (const t of tests) {
  const d = parseWakeTranscript({ text: t.text, isFinal: t.final, armedUntil: t.armed, now: NOW });
  const ok = d.type === t.type && (t.cmd === undefined || (d.type === "command" && d.command === t.cmd));
  console.log(`${ok ? "✓" : "✗"} ${t.name}:`, d);
  if (!ok) failures++;
}
console.log(`\n${tests.length - failures}/${tests.length} scénarios mot-clé conformes`);

const direct = [
  { text: "ouvre Word sur mon PC", final: true, expected: "ouvre word sur mon pc" },
  { text: "quelle heure est-il", final: true, expected: "quelle heure est-il" },
  { text: "ouvre Wor", final: false, expected: null },
  { text: " ", final: true, expected: null },
];
for (const t of direct) {
  const got = parseDirectTranscript(t.text, t.final);
  const ok = got === t.expected;
  console.log(`${ok ? "✓" : "✗"} écoute directe « ${t.text} »:`, got);
  if (!ok) failures++;
}
console.log(`\n${failures === 0 ? "✓ ÉCOUTE DIRECTE ET MOT-CLÉ OPTIONNEL VALIDÉS" : `✗ ${failures} échec(s)`}`);
process.exitCode = failures ? 1 : 0;
