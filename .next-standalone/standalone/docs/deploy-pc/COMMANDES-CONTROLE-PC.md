# Contrôle PC de J.A.R.V.I.S. — chat et voix

Jarvis pilote le PC comme un utilisateur : ouvrir les logiciels, taper du texte, copier/coller,
enregistrer, supprimer, créer des dossiers et rédiger des documents Word (`.docx`).
Les mêmes phrases fonctionnent **dans le chat** et **à la voix** (micro continu de l'agent).

## 1. Déploiement en deux niveaux

### Niveau A — agent seul (déjà testé ici, sans reconstruire le site web)
Le dossier `deploy-pc\agent\` contient le nouvel agent. Le script administrateur copie :
- `agent\jarvis-agent.py` → `C:\Program Files\Jarvis\agent\`
- `lanceur\Start-Jarvis.ps1` → racine (charge enfin les clés du `.env`)

Effet immédiat après redémarrage :
- `Lance Word / Lance Chrome / Lance calculatrice …` (phrases déjà prévues par le site actuel)
- nouveaux travaux de l'agent : raccourcis, presse-papiers, fermeture d'app, `.docx`

### Niveau B — bundle Next.js reconstruit (phrases de chat/voix étendues)
Les phrases du §3 (copie, colle, enregistre, ferme, dossier, ajout dans un document)
sont reconnues par le moteur `engine.ts` après `npm run build`. Le script administrateur
recopie automatiquement le dossier `deploy-pc\next-build\` s'il existe.

## 2. Commandes testées en direct

| Phrase (chat ou voix) | Travail exécuté | Résultat de test |
|---|---|---|
| `Lance calculatrice` | `open` → Calculatrice | ✅ job #108 done |
| `Crée un dossier DossierTestJarvis dans Documents` | `file` mkdir | ✅ dossier créé (#109) |
| `Enregistre` (dans la fenêtre active) | `hotkey` ctrl+s | ✅ (#110) |
| `Que contient le presse-papiers ?` | `clipboard` read | ✅ (#111) |
| `Ferme calculatrice` | `close_app` | ✅ (#113, processus fermé) |
| `Crée un document TestJarvis : Bonjour Libreville…` | `word_edit` (créé `.docx`) | ✅ (#116) |
| `Ajoute la deuxième ligne…` | `word_edit` (ajout de paragraphe) | ✅ (#117) |

Fichier de démonstration : `Documents\TestJarvis.docx` (1017 octets, deux paragraphes valides).

## 3. Référence des phrases après build complet

### Ouvrir / fermer des logiciels
- `Lance Word`, `Ouvre Chrome`, `Lance Notepad++`, `Lance Telegram`, `Lance Obsidian`, `Lance le Bloc-notes`
- `Ferme Word`, `Ferme Excel`, `Ferme Chrome`, `Ferme la fenêtre`
- `Liste les logiciels installés`

### Façons humaines de travailler (raccourcis)
- `Copie tout`, `Copie`, `Coupe`, `Colle`
- `Sélectionne tout`
- `Enregistre`, `Enregistre sous`, `Nouveau document`
- `Annule`, `Rétablis`
- `Supprime le texte`, `Gras`, `Italique`

### Fichiers et dossiers
- `Crée un dossier Notes dans Documents`
- `Crée un dossier Projet dans le Bureau`
- `Ouvre le dossier Documents`, `Liste les fichiers de Téléchargements`

### Documents Word
- `Crée un document Word intitulé Notes avec le texte …` (scénario existant de l'agent)
- `Ajoute le texte … dans le document Notes` (`word_edit`, ajout de paragraphe)
- `Ouvre le document Notes`

## 4. Mécanisme technique

1. Le chat (`/api/chat`) ou la voix (file d'attente `/api/remote` → `/api/chat`) appelle `engine.ts`.
2. `runOnPc(kind, payload)` insère un travail dans `node_jobs`.
3. L'agent Python (en ligne, micro continu) poll les travaux et exécute :
   - `hotkey` : combinaisons clavier via pyautogui (copier/coller/sauvegarde/annulation…)
   - `clipboard` : lecture/écriture du presse-papiers et collage
   - `close_app` : fermeture propre (UWP modernes en force sans perte Office)
   - `word_edit` : `.docx` conforme OpenXML généré/complété par la bibliothèque standard
   - `open` : alias + recherche du menu Démarrer (`launch_windows_app`)
4. Le résultat revient dans `/api/node` puis la réponse vocale/du chat.

## 5. Limites et sécurité

- Les raccourcis agissent sur la **fenêtre active** : cliquer la zone cible avant de dicter la phrase.
- `Ferme Word` ferme l'application ; pensez à `Enregistre` avant sur les documents non sauvegardés.
- Aucune commande destructive massive n'est exposée en voix ; la suppression de fichiers passe
  par la branche `file` du moteur, déjà limitée aux dossiers utilisateur.
- Le `.docx` généré est compatible Word 2016+ ; la navigation/onglets du ruban Word ne sont
  pas pilotés (le pilotage COM complet reste possible via `word_helper.ps1` en session interactive).

## 6. Build complet (pour activer le Niveau B)

```powershell
cd C:\Users\LENOVO\Dola\chats\2026-11-22\new-chat\jarvis-source
npm install
npm run build
# copier .next\standalone dans deploy-pc\next-build, puis lancer Deploy-Jarvis-admin.ps1
```
