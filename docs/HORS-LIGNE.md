# Capacités hors-ligne de J.A.R.V.I.S. — vérifiées

**Date :** 23/11/2026 · **Méthode :** test réel, pas une revue de code.

Le serveur a été démarré dans un espace réseau où **toute sortie était bloquée**
(`iptables -A OUTPUT -j DROP`, loopback autorisé pour PostgreSQL uniquement) :
c'est exactement l'état « sans WiFi ». Chaque endpoint a ensuite été appelé et
la réponse relevée.

---

## ✅ Fonctionne pleinement sans réseau

| Endpoint / commande | Réponse observée |
|---|---|
| `GET /`, `/install`, `/mobile`, `/icon.svg` | **200** (pages pré-rendues + assets locaux) |
| `GET /api/health` | `{"ok":true}` — PostgreSQL local |
| `GET /api/state` | `{"userName":null,"messageCount":36,…}` |
| `GET /api/history` | historique complet des échanges |
| `GET /api/devices` | appareils domotiques (simulation locale) |
| `GET /api/agents`, `/api/node` | agents et PC liés |
| `GET /api/brain` | `engine: "rules"` — moteur d'intentions interne |
| `GET /api/download?f=…` (`.exe`, `.apk`, `.env`) | **200** — fichiers locaux |
| `POST /api/chat` « quelle heure est-il ? » | `Il est 15:17.` |
| `POST /api/chat` « calcule 128 fois 46 » | `5 888` |
| `GET /api/search?q=…` | **200** — `provider: "aucune", results: []` |
| `GET /api/apis` (catalogue 82 entrées) | **200** |

**Modules 100 % locaux :** heure et date, calculatrice, mémoire long terme,
notes, tâches, agenda/rappels, minuterie, domotique simulée, ouverture de
fichiers/logiciels du PC, contrôle souris/clavier (agent local), synthèse vocale
(voices système du navigateur), transcription vocale du navigateur*,
téléchargements, interface complète.

\* La reconnaissance vocale Chrome/Edge dépend d'un service Google : hors-ligne
elle signale son indisponibilité au lieu de bloquer.

## 🟡 Dégrade proprement (message explicite, jamais d'erreur 500)

| Commande / endpoint | Réponse hors-ligne |
|---|---|
| « météo à Paris » | `Pas de connexion : les relevés météo de paris sont indisponibles. Mes modules locaux (heure, calcul, mémoire, agenda, notes, domotique) restent actifs.` |
| « wikipédia Napoléon » | `Wikipédia est inaccessible sans connexion… En local je peux : l'heure, les calculs, vos notes…` |
| « actualités » (Google News) | `Le flux d'actualités est brouillé pour l'instant.` |
| « convertis 100 dollars en euros » | `Je comprends la demande, mais aucun modèle de raisonnement n'est disponible…` |
| `GET /api/apis?id=currency` | **502** + `Impossible d'interroger Frankfurter : taux indisponible.` |
| `GET /api/apis?id=iss` | **502** + `le service ne répond pas pour le moment.` |

> Les **502** de `/api/apis` sont voulus : la route signale explicitement
> l'échec de l'appel externe, et le panneau APIs affiche le message en ambre.

## ❌ Nécessite le réseau

Météo réelle, Wikipédia, actualités, flux sportifs, recherche web naviguée,
**les 19 API publiques branchées** (taux de change, crypto, pays, ISS, recettes,
dictionnaire, traduction…), les **cerveaux LLM** (Doubao, Groq, Gemini,
OpenRouter, OpenAI, Anthropic) — sans clé ni réseau, Jarvis retombe sur son
moteur de règles, qui reste complet.

## 🔧 Corrections apportées par ce test

Trois compétences levaient `TypeError: fetch failed` (`EAI_AGAIN`) et
retauchaient l'erreur générique « interférence temporaire » :

- `weatherSkill()` → `try/catch` + message « Pas de connexion… »
- `wikiSkill()` → `try/catch` + message « Wikipédia est inaccessible… »
- `gnews()` → `try/catch` → `[]` (le flux vide est déjà géré en amont)

`internetAnswer()` (DuckDuckGo), les actualités Hacker News, le sport et
`browseAnswer()` étaient déjà protégés — vérifié.

## 🧪 Reproduire le test

```bash
sudo iptables -F OUTPUT && sudo iptables -A OUTPUT -o lo -j ACCEPT && sudo iptables -A OUTPUT -j DROP
npx next start -p 3977 &          # le serveur démarre, PostgreSQL local joignable
# … appels curl …
sudo iptables -F OUTPUT           # toujours restaurer
```
