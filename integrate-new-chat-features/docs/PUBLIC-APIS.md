# Intégration du catalogue `public-apis/public-apis`

**Source :** <https://github.com/public-apis/public-apis>
**Date :** 23/11/2026

Jarvis embarque un **répertoire structuré de 82 API publiques** (28 catégories) et
**en branche 19**, toutes **gratuites et sans clé**, appelables à la voix comme
depuis le panneau **APIs** de la colonne de droite.

---

## 1. Architecture

| Fichier | Rôle |
|---|---|
| `src/lib/jarvis/publicapis.ts` | Catalogue (`PUBLIC_APIS`), handlers live (`HANDLERS`), détection de commande (`matchPublicApi`), appel unique (`callPublicApi`) |
| `src/app/api/apis/route.ts` | `GET /api/apis` → catalogue · `GET /api/apis?id=…&q=…` → appel live |
| `src/components/jarvis/ApisPanel.tsx` | Panneau UI : recherche, filtres par catégorie, bouton **tester**, résultat + lien source |
| `src/app/page.tsx` | Onglet **APIs** de la colonne droite + action `openPanel: "apis"` |
| `src/components/jarvis/CommandBar.tsx` | Puces de démo (« Convertis 100 dollars en euros », « Prix du bitcoin »…) |
| `src/lib/jarvis/engine.ts` | Bloc d'intentions placé **avant** le routeur cognitif |

Priorité : les intents spécifiques du moteur (météo, Wikipédia, blague locale,
calcul) sont testés **avant** `matchPublicApi` — en cas de conflit, ils gagnent.
Si un appel réseau échoue, on rend la main au routeur cognitif (web + LLM),
jamais d'erreur 500.

## 2. Les 19 API branchées

| Id | Service | Catégorie | Commande vocale |
|---|---|---|---|
| `currency` | Frankfurter (BCE) | Finance | « convertis 100 dollars en euros » |
| `crypto` | CoinGecko | Finance | « prix du bitcoin » |
| `country` | Banque mondiale × Open-Meteo | Géographie | « capital du Japon », « population du Brésil » |
| `place` | Nominatim / OpenStreetMap | Géographie | « localise la Tour Eiffel » |
| `iss` | Where The ISS At | Espace | « où est l'ISS » |
| `spacex` | SpaceX API → Launch Library 2 | Espace | « prochain lancement » |
| `recipe` | TheMealDB | Cuisine | « une recette au hasard » |
| `cocktail` | TheCocktailDB | Cuisine | « un cocktail au hasard » |
| `advice` | Advice Slip | Divertissement | « un conseil du jour » |
| `chuck` | Chuck Norris API | Divertissement | « chuck norris » |
| `joke` | JokeAPI | Divertissement | « une blague en anglais » |
| `dog` | Dog CEO | Animaux | « une photo de chien » |
| `catfact` | Cat Facts | Animaux | « un fait sur les chats » |
| `holiday` | Nager.Date | Temps & dates | « prochain jour férié » |
| `dictionary` | Wiktionnaire (fr) | Dictionnaires | « signification de maison » |
| `translate` | MyMemory | Traduction | « traduis bonjour en espagnol » |
| `book` | Open Library | Livres | « un livre sur la science » |
| `air` | Open-Meteo Air Quality | Environnement | « qualité de l'air à Lyon » |
| `weather` | Open-Meteo | Environnement | (le module météo du moteur garde la priorité) |

Les **63 autres entrées** du catalogue restent consultables dans le panneau avec
leur documentation et leur badge d'authentification (`sans clé` / `clé`) — elles
servent de base de démarrage pour de futures branches.

## 3. Corrections apportées pendant l'intégration

Le test live a révélé cinq endpoints cassés, tous corrigés dans `publicapis.ts` :

1. **REST Countries** a déprécié v1→v4 (clé obligatoire en v5) → remplacement par
   **géocodage Open-Meteo** (code ISO + population) + **API Banque mondiale**
   (capitale, région traduite en français, niveau de revenu).
2. **Where The ISS At** : l'hôte API est `api.wheretheiss.at`, pas `wheretheiss.at` (404).
3. **dictionaryapi.dev** ne répond plus (404 systématique) → **Wiktionnaire francophone**
   via l'API MediaWiki, avec extraction de la section grammaticale.
4. **api.spacexdata.com** injoignable depuis certains réseaux → repli automatique sur
   **Launch Library 2** (The Space Devs).
5. Clés dupliquées `discord`/`spotify` dans `appLocals` (`engine.ts`) — erreur
   `TS1117` qui bloquait le build.

## 4. Recette

```bash
npx next typegen && npx tsc --noEmit && npm run build && npm run start
```

| Test | Attendu |
|---|---|
| `GET /api/apis` | `total: 82`, `wired: 19`, `categories: 28` |
| `GET /api/apis?id=currency&q=100 USD en EUR` | `ok: true`, taux BCE daté |
| `GET /api/apis?id=country&q=Japon` | capitale + population + région en français |
| `POST /api/chat {"message":"convertis 100 dollars en euros"}` | réponse Frankfurter, pas le calculateur |
| `POST /api/chat {"message":"capital du Japon"}` | fiche pays, pas Wikipédia |
| Sans réseau | `ok: false` + repli routeur cognitif, jamais de 500 |

## 5. Ajouter une API

```ts
// 1. handler dans HANDLERS
async maApi(q) {
  const d = await jget("https://…");
  if (!d) return miss("Mon service");
  return { ok: true, text: `…`, source: "Mon service", url: "https://…" };
},
// 2. entrée de catalogue
entry("maApi", "Nom du service", "Catégorie", "Description", "https://doc", "none", true, "exemple"),
// 3. détection (optionnelle) dans matchPublicApi()
if (/mot-clé/.test(s)) return { id: "maApi", q: "…" };
```

Aucune clé n'est nécessaire : tout appel sortant passe par `jget()` (timeout
9 s, en-tête identitaire, `cache: no-store`).
