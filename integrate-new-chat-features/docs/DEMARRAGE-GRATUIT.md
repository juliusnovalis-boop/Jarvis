# Démarrage gratuit de J.A.R.V.I.S. + activation Doubao personnelle

**Objectif** : faire fonctionner le cerveau de Jarvis **sans abonnement payant**, puis brancher Doubao seulement quand vous voulez (quota gratuit de 500 000 tokens à l'activation).
Fichier de clés préparé : **`.env`** (à côté de ce rapport). Le code source contient déjà le fournisseur `doubao` (patch `brain.ts` + interface).

---

## 1. Résultat attendu selon la configuration

| Cerveau utilisé | Coût | Rebuild nécessaire | Quand l'activer |
|---|---|---|---|
| Règles internes (`rules`) | 0 € | Non | Toujours disponible (heures, calcul, web, domotique…) |
| **Groq** (free tier) | 0 €, quotas par minute | **Non** (déjà dans le build PC) | Premier choix immédiat |
| **Gemini Flash** (free tier) | 0 €, quotas quotidiens | **Non** | Secours gratuit de Groq |
| **OpenRouter modèle `:free`** | 0 € | **Non** | Secours gratuit |
| **Ollama local** | 0 €, hors-ligne | Non (modèle à installer) | Vie privée maximale |
| **Doubao Ark / ModelArk** | 500 000 tokens gratuits, puis très bas tarif | **Oui** (code `doubao` ajouté après la version installée) | Assistant personnel à prioriser |

> Point important : les clés **Groq, Gemini, OpenRouter, Ollama** fonctionnent avec le programme PC actuel, juste en collant la clé dans `.env` et redémarrant. Seul le fournisseur **Doubao** exige une reconstruction car il a été ajouté au code après la version compilée.

---

## 2. Obtenir les clés gratuites (5–10 minutes)

### 2.1 Groq (recommandé en premier) — gratuit
1. Ouvrir https://console.groq.com/keys (compte Google/email).
2. **Create API Key**, copier la clé (`gsk_…`).
3. Coller dans `.env` :
   ```dotenv
   GROQ_API_KEY=gsk_votre_clé
   GROQ_MODEL=llama-3.3-70b-versatile
   ```
Limites : débat plus court et plafond de requêtes/minute, mais suffisant pour un usage personnel vocal.

### 2.2 Google Gemini Flash — free tier gratuit
1. Ouvrir https://aistudio.google.com/apikey → **Create API key**.
2. Coller :
   ```dotenv
   GEMINI_API_KEY=votre_clé
   GEMINI_MODEL=gemini-2.0-flash
   ```

### 2.3 OpenRouter (modèles `:free`) — compte gratuit
1. Ouvrir https://openrouter.ai/keys → **Create Key**.
2. Garder le modèle déjà indiqué (gratuit) :
   ```dotenv
   OPENROUTER_API_KEY=votre_clé
   OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
   ```
Astuce : dans le catalogue OpenRouter, filtrer par prix `Free` pour voir les autres modèles `:free`.

### 2.4 Ollama local (option privé, zéro coût récurrent)
1. Installer https://ollama.com/download (Windows).
2. Dans PowerShell : `ollama pull llama3.2:3b` (~2 Go).
3. Le fichier `.env` contient déjà `OLLAMA_URL` et `OLLAMA_MODEL` ; aucun ajout.

---

## 3. Installer le fichier `.env` sur le PC

### Méthode A — `.env` à côté du serveur (recommandée)
1. Copier le fichier `.env` préparé vers :
   ```
   C:\Program Files\Jarvis\app\.env
   ```
   (nécessite un droit administrateur pour écrire dans `Program Files`).
2. Coller les clés dans ce fichier (la ligne `GROQ_API_KEY=` devient `GROQ_API_KEY=gsk_…`).
3. Fermer Jarvis (`Arrêter Jarvis.bat` ou le menu Démarrer) puis rouvrir (`Ouvrir Jarvis`).

### Méthode B — injection par le lanceur (si `Program Files` est protégé)
Déposer le `.env` dans `%LOCALAPPDATA%\JarvisCompleteData\.env`, puis insérer ce bloc **au début** de `C:\Program Files\Jarvis\packaging`… en pratique du `Start-Jarvis.ps1` (copie locale dans `agent\` si besoin), juste avant le démarrage Node :

```powershell
$envFile = Join-Path $env:LOCALAPPDATA "JarvisCompleteData\.env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line -match "^([^=]+)=(.*)$") {
      Set-Item -Path ("env:" + $Matches[1].Trim()) -Value $Matches[2].Trim()
    }
  }
}
```

### 3.1 Vérification après redémarrage
```powershell
# Le cerveau doit montrer un fournisseur "configured: true"
(Invoke-WebRequest "http://127.0.0.1:3210/api/brain" -UseBasicParsing).Content | ConvertFrom-Json | Select-Object -ExpandProperty brain
```
Test conversation :
```powershell
$b = [System.Text.Encoding]::UTF8.GetBytes((@{message="Explique-moi simplement ce qu'est une éclipse";tz="Africa/Libreville";lang="fr"} | ConvertTo-Json))
(Invoke-WebRequest "http://127.0.0.1:3210/api/chat" -Method POST -Body $b -ContentType "application/json; charset=utf-8" -UseBasicParsing).Content
```
Champ attendu : `engine: "groq"` (ou `gemini`, `openrouter`, `ollama`) au lieu de `unavailable`/`rules`.

---

## 4. Activer Doubao (assistant personnel, quota gratuit)

### 4.1 Choix du fournisseur Doubao
- **BytePlus ModelArk (international, préféré depuis Libreville)** : https://www.byteplus.com/en/modelark → créer un compte → **API Keys** → Create Key. Premier modèle activé avec **500 000 tokens gratuits**.
- **Volcengine Ark (Chine)** : https://console.volcengine.com/ark ; inscription et paiement adaptés à la Chine.
- Récupérer l'identifiant du modèle : soit un endpoint `ep-2025…`, soit un nom `doubao-…` (modèle rapide : famille Lite / Flash / Seed 1.6).

### 4.2 Activer le code sur la version PC (rebuild)
Le fournisseur `doubao` est déjà dans `jarvis-source\src\lib\jarvis\brain.ts`. Sur une machine Node de développement :
```powershell
cd C:\Users\LENOVO\Dola\chats\2026-11-22\new-chat\jarvis-source
npm install
npm run build
# puis recopier .next\standalone (+ .next\static et public) vers C:\Program Files\Jarvis\app\
```
Sans rebuild, la ligne `DOUBAO_API_KEY` est ignorée par le build PC (ne pas s'en étonner).

### 4.3 Renseigner Doubao dans `.env`
```dotenv
DOUBAO_API_KEY=votre_clé_ark
DOUBAO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
# pour BytePlus international : https://ark.byteplus.com/api/v3 (à vérifier dans la console)
DOUBAO_MODEL=doubao-seed-1-6-flash-250615
DOUBAO_FIRST=1
```
- `DOUBAO_FIRST=1` : Doubao répond en premier (comportement « mon Doubao à moi »).
- `DOUBAO_FIRST=0` : Doubao en secours derrière le local/gratuit (économie de tokens payants).

Recette : `/api/brain` → `engine: "doubao"` ; `/api/chat` → `engine: "doubao"` ; question web → sources conservées + synthèse Doubao. Sans clé, la cascade retombe sur Groq/Gemini/Ollama puis les règles : aucune erreur bloquante.

---

## 5. Personnaliser « mon Jarvis-Doubao »

Sans toucher au code, la mémoire locale adapte le cerveau (le prompt système injecte `user_name` et `default_city` dans les réponses LLM) :

- Dites à Jarvis : **« Je m'appelle <votre prénom> »** → enregistré dans `memories.user_name`.
- **« Je suis à Libreville »** → `memories.default_city` (météo par défault).
- `note que …`, `ajoute la tâche …`, `rappelle-moi de …` alimentent la mémoire personnelle.
- L'identité vocale reste « J.A.R.V.I.S. » ; pour changer le nom affiché/prononcé, on modifiera `SYSTEM_PROMPT` dans `brain.ts` et la branche « qui es-tu » dans `engine.ts` (petit patch possible sur demande).

---

## 6. Tableau des dépenses prévisionnelles (usage personnel léger)

| Option | Coût réel | Détail |
|---|---|---|
| Groq free | 0 € | Limites de débit, volumes quotidiens généreux pour un particulier |
| Gemini free | 0 € | Quotas quotidiens partagés sur la clé |
| OpenRouter `:free` | 0 € | Modèles gratuits (moins puissants, latence partagée) |
| Ollama | 0 € | Utilisation CPU/RAM locale, aucun serveur externe |
| Doubao quota offert | 0 € jusqu'à 500 K tokens/modèle | ~ plusieurs semaines de réponses courtes |
| Doubao après quota | Très bas | Lite/Turbo ~ quelques centimes d'euro par mille réponses courtes ; Pro plus cher |

---

## 7. Ordre de marche conseillé

1. Coller **Groq** (puis Gemini) dans `.env`, redémarrer, vérifier `/api/brain`.
2. Tester 5–10 questions : heure, calcul, météo, web, explication générale.
3. Si besoin de vie privée : installer Ollama.
4. Quand vous voulez le « Doubao personnel » : créer la clé ModelArk/Ark, fournir l'identifiant de modèle, lancer le rebuild, passer `DOUBAO_FIRST=1`.
5. Me signaler à l'étape 4 : je fournis les commandes de build exactes et je vérifie `/api/brain` et `/api/chat` en direct.
