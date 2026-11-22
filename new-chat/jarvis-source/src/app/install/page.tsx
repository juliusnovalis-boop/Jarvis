import { CheckCircle2, Download, HardDrive, Mic2, ShieldAlert, TerminalSquare } from "lucide-react";

const INCLUDED = [
  "Interface Iron Man complète et serveur Next.js local",
  "Node.js 22 Windows x64 embarqué",
  "PostgreSQL 16 portable et base créée automatiquement",
  "Agent PC : souris, clavier, fichiers et console",
  "Mot-clé vocal « Jarvis » hors ligne avec openWakeWord",
  "Métarecherche Internet DDGS et modèles ONNX",
];

export default function InstallPage() {
  return (
    <main className="jarvis-scene relative min-h-screen overflow-hidden px-4 py-10 text-cyan-50">
      <div className="jarvis-grid pointer-events-none absolute inset-0" />
      <div className="jarvis-scanlines pointer-events-none absolute inset-0 opacity-40" />

      <section className="relative z-10 mx-auto max-w-3xl">
        <div className="text-center">
          <p className="font-tech text-[10px] uppercase tracking-[0.4em] text-cyan-400/60">Windows 11 · 64 bits</p>
          <h1 className="mt-3 font-orbitron text-3xl font-bold tracking-[0.18em] text-cyan-100 jarvis-glow sm:text-5xl">
            J.A.R.V.I.S. COMPLETE
          </h1>
          <p className="mx-auto mt-4 max-w-2xl font-tech text-sm leading-relaxed text-cyan-200/75">
            Une véritable application bureau J.A.R.V.I.S. sur le protocole natif jarvis://app — aucune URL
            localhost, aucune barre d'adresse, aucun onglet navigateur. Toutes les dépendances sont embarquées.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <a
            href="/api/download?f=Jarvis-Complete-Setup.exe"
            className="hud-frame group border border-emerald-400/45 bg-emerald-400/[0.08] p-6 transition-all hover:border-emerald-300 hover:bg-emerald-400/[0.14] hover:shadow-[0_0_35px_rgba(52,211,153,0.2)]"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center border border-emerald-400/40 bg-emerald-400/10">
                <Download size={20} className="text-emerald-300" />
              </span>
              <div>
                <p className="font-orbitron text-sm uppercase tracking-[0.15em] text-emerald-100">Installateur .exe</p>
                <p className="font-tech text-[10px] text-emerald-300/60">Application bureau native · 378,2 MiB · jarvis://app</p>
              </div>
            </div>
            <p className="mt-4 font-tech text-[11px] leading-relaxed text-cyan-100/70">
              Une installation automatique avec raccourcis, démarrage Windows et désinstallateur.
            </p>
            <code className="mt-3 block break-all font-tech text-[8.5px] text-emerald-400/55">
              SHA-256 5c6571420bb7218e49fb2c757a3ffb6cdb28a68d100c5d51c5a12ccb756f1994
            </code>
          </a>

          <a
            href="/api/download?f=Jarvis-Complete-Portable.zip"
            className="hud-frame group border border-cyan-400/35 bg-cyan-400/[0.06] p-6 transition-all hover:border-cyan-300 hover:bg-cyan-400/[0.12] hover:shadow-[0_0_35px_rgba(34,211,238,0.2)]"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center border border-cyan-400/40 bg-cyan-400/10">
                <HardDrive size={20} className="text-cyan-300" />
              </span>
              <div>
                <p className="font-orbitron text-sm uppercase tracking-[0.15em] text-cyan-100">Version portable</p>
                <p className="font-tech text-[10px] text-cyan-300/60">ZIP complet · 357,7 MiB</p>
              </div>
            </div>
            <p className="mt-4 font-tech text-[11px] leading-relaxed text-cyan-100/70">
              Décompressez puis lancez PREMIERE-INSTALLATION.bat. Idéal si SmartScreen bloque le setup.
            </p>
            <code className="mt-3 block break-all font-tech text-[8.5px] text-cyan-400/55">
              SHA-256 b354d1e2422598e91451402059dbafb9a2f86dc488e6625aa35fb2ac53892ba9
            </code>
          </a>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[1.35fr_0.65fr]">
          <div className="hud-frame border border-cyan-500/20 bg-[#04101f]/75 p-5">
            <h2 className="flex items-center gap-2 font-orbitron text-xs uppercase tracking-[0.2em] text-cyan-200">
              <TerminalSquare size={15} /> Contenu embarqué
            </h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-2 font-tech text-[11px] leading-relaxed text-cyan-100/75">
                  <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-400" /> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="hud-frame border border-amber-400/20 bg-amber-400/[0.04] p-5">
            <h2 className="flex items-center gap-2 font-orbitron text-[10px] uppercase tracking-[0.18em] text-amber-200">
              <ShieldAlert size={14} /> SmartScreen
            </h2>
            <p className="mt-3 font-tech text-[10.5px] leading-relaxed text-amber-100/65">
              Le setup n&apos;a pas de certificat commercial. Cliquez « Informations complémentaires » puis
              « Exécuter quand même ». Sinon utilisez le ZIP portable.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3 border-l-2 border-emerald-400/60 bg-emerald-400/[0.06] px-4 py-3">
          <Mic2 size={18} className="shrink-0 text-emerald-300" />
          <p className="font-tech text-[11px] leading-relaxed text-emerald-100/80">
            Après installation, dites <strong>« Jarvis »</strong> : le PC répond et ouvre automatiquement
            l&apos;interface locale sur http://127.0.0.1:3210.
          </p>
        </div>

        <div className="mt-8 text-center">
          <a href="/" className="font-tech text-[11px] tracking-[0.2em] text-cyan-400/60 hover:text-cyan-200">
            ← RETOUR À JARVIS
          </a>
        </div>
      </section>
    </main>
  );
}
