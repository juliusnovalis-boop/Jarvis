"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ExternalLink, FlaskConical, Globe2, KeyRound, Loader2, Search, Sparkles, X,
} from "lucide-react";

interface ApiInfo {
  id: string;
  name: string;
  category: string;
  description: string;
  docs: string;
  auth: "none" | "key";
  wired: boolean;
  sample: string;
}

interface ApiResult {
  ok: boolean;
  text: string;
  source: string;
  url?: string;
  image?: string;
}

/**
 * 🌐 PANNEAU API PUBLIQUES — catalogue github.com/public-apis/public-apis.
 * Filtre par catégorie/recherche + test live des API branchées dans Jarvis.
 */
export function ApisPanel() {
  const [apis, setApis] = useState<ApiInfo[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [counts, setCounts] = useState({ wired: 0, total: 0 });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Toutes");
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ApiResult>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/apis", { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        setApis(data.apis ?? []);
        setCategories(["Toutes", ...(data.categories ?? [])]);
        setCounts({ wired: data.wired ?? 0, total: data.total ?? 0 });
      } catch {
        /* hors-ligne */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return apis.filter((a) => {
      if (cat !== "Toutes" && a.category !== cat) return false;
      if (!needle) return true;
      return (
        a.name.toLowerCase().includes(needle) ||
        a.description.toLowerCase().includes(needle) ||
        a.category.toLowerCase().includes(needle)
      );
    });
  }, [apis, q, cat]);

  const test = useCallback(async (a: ApiInfo) => {
    setTesting(a.id);
    setResults((p) => {
      const next = { ...p };
      delete next[a.id];
      return next;
    });
    try {
      const res = await fetch(`/api/apis?id=${encodeURIComponent(a.id)}&q=${encodeURIComponent(a.sample)}`);
      const data: ApiResult = await res.json();
      setResults((p) => ({ ...p, [a.id]: data }));
    } catch {
      setResults((p) => ({
        ...p,
        [a.id]: { ok: false, text: "Connexion au module API perdue.", source: "J.A.R.V.I.S." },
      }));
    } finally {
      setTesting(null);
    }
  }, []);

  return (
    <section className="hud-frame flex min-h-0 flex-col border border-cyan-500/15 bg-[#04101f]/70 backdrop-blur-md">
      <header className="flex items-center gap-2 border-b border-cyan-500/15 px-3 py-2">
        <Globe2 size={13} className="text-cyan-400/70" />
        <p className="font-orbitron text-[10px] uppercase tracking-[0.3em] text-cyan-400/70">
          API publiques
        </p>
        <span className="ml-auto font-tech text-[9px] tracking-[0.15em] text-cyan-500/60">
          {loading ? "…" : `${counts.wired}/${counts.total}`}
        </span>
      </header>

      {/* Recherche */}
      <div className="relative border-b border-cyan-500/10">
        <Search size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-500/50" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtrer : change, recette, espace…"
          className="w-full bg-transparent py-2 pl-8 pr-8 font-tech text-[11px] tracking-wide text-cyan-50 placeholder:text-cyan-500/35 focus:outline-none"
        />
        {q && (
          <button
            onClick={() => setQ("")}
            aria-label="Effacer le filtre"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-cyan-500/50 hover:text-cyan-200"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Catégories */}
      <div className="jarvis-scroll flex shrink-0 gap-1 overflow-x-auto border-b border-cyan-500/10 px-2 py-1.5">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`shrink-0 border px-2 py-0.5 font-tech text-[9px] uppercase tracking-[0.12em] transition-colors ${
              cat === c
                ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-100"
                : "border-cyan-500/15 text-cyan-500/60 hover:border-cyan-400/30 hover:text-cyan-300"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Liste */}
      <div className="jarvis-scroll min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {loading && (
          <p className="py-6 text-center font-tech text-[11px] text-cyan-500/50">
            <Loader2 size={12} className="mr-1 inline animate-spin" />
            Chargement du catalogue…
          </p>
        )}

        {!loading && visible.length === 0 && (
          <p className="py-6 text-center font-tech text-[11px] text-cyan-500/40">
            Aucune API ne correspond à « {q || cat} ».
          </p>
        )}

        {visible.map((a) => {
          const r = results[a.id];
          const busy = testing === a.id;
          return (
            <article
              key={a.id}
              className={`border px-2 py-1.5 transition-colors ${
                a.wired
                  ? "border-cyan-400/25 bg-cyan-950/25 hover:border-cyan-400/45"
                  : "border-cyan-500/10 bg-cyan-950/10"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    a.wired ? "bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.9)]" : "bg-cyan-800"
                  }`}
                />
                <p className="min-w-0 flex-1 truncate text-[11.5px] leading-tight text-cyan-50">
                  {a.name}
                </p>
                <span
                  className={`flex shrink-0 items-center gap-1 border px-1 py-px font-tech text-[7.5px] uppercase tracking-[0.14em] ${
                    a.auth === "none"
                      ? "border-cyan-400/30 text-cyan-300/80"
                      : "border-amber-400/30 text-amber-300/80"
                  }`}
                >
                  {a.auth === "none" ? <Sparkles size={7} /> : <KeyRound size={7} />}
                  {a.auth === "none" ? "sans clé" : "clé"}
                </span>
              </div>

              <p className="mt-0.5 truncate font-tech text-[9px] uppercase tracking-[0.1em] text-cyan-500/45">
                {a.category} · {a.description}
              </p>

              <div className="mt-1.5 flex items-center gap-1.5">
                {a.wired && (
                  <button
                    onClick={() => test(a)}
                    disabled={busy}
                    className="flex items-center gap-1 border border-cyan-400/35 bg-cyan-400/10 px-1.5 py-0.5 font-tech text-[9px] uppercase tracking-[0.14em] text-cyan-100 transition-colors hover:bg-cyan-400/25 disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={9} className="animate-spin" /> : <FlaskConical size={9} />}
                    {busy ? "appel…" : "tester"}
                  </button>
                )}
                <a
                  href={a.docs}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 font-tech text-[9px] uppercase tracking-[0.14em] text-cyan-500/60 transition-colors hover:text-cyan-300"
                >
                  doc <ExternalLink size={8} />
                </a>
                {a.wired && (
                  <span className="ml-auto font-tech text-[8px] uppercase tracking-[0.14em] text-cyan-400/70">
                    dans jarvis
                  </span>
                )}
              </div>

              {r && (
                <div className="mt-1.5 border-t border-cyan-500/10 pt-1.5">
                  <p
                    className={`whitespace-pre-wrap text-[11px] leading-snug ${
                      r.ok ? "text-cyan-50/90" : "text-amber-200/85"
                    }`}
                  >
                    {r.text}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="truncate font-tech text-[8px] uppercase tracking-[0.14em] text-cyan-500/45">
                      {r.source}
                    </span>
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex shrink-0 items-center gap-1 font-tech text-[8px] uppercase tracking-[0.14em] text-cyan-400/80 hover:text-cyan-200"
                      >
                        source <ExternalLink size={7} />
                      </a>
                    )}
                  </div>
                  {r.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.image}
                      alt=""
                      loading="lazy"
                      className="mt-1.5 max-h-32 w-full border border-cyan-500/15 object-cover"
                    />
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <footer className="border-t border-cyan-500/10 px-3 py-1.5">
        <a
          href="https://github.com/public-apis/public-apis"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 font-tech text-[9px] uppercase tracking-[0.16em] text-cyan-500/55 transition-colors hover:text-cyan-300"
        >
          <Globe2 size={9} />
          source : public-apis/public-apis <ExternalLink size={8} />
        </a>
      </footer>
    </section>
  );
}
