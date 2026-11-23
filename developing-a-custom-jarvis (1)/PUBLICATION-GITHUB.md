════════════════════════════════════════════════════════════════
 PUBLICATION DE JARVIS SUR GITHUB — procédure en 5 minutes
════════════════════════════════════════════════════════════════

Ce dépôt local est PRÊT à être poussé. Il vous suffit de votre jeton
GitHub personnel (PAT), deux fois par minute depuis
https://github.com/settings/tokens  →  « Generate new token (classic) »
cochez la portée : repo  (et éventuellement workflow).

────────────────────────────────────────────────────────────────
  MÉTHODE A — tout automatique (RECOMMANDÉE)
────────────────────────────────────────────────────────────────

Depuis ce dossier, dans Git Bash ou PowerShell :

    bash scripts/publier-vers-github.sh

Le script vous demande votre jeton une seule fois, puis :
  1. pousse tout le code source sur juliusnovalis-boop/Jarvis
  2. vérifie que la GitHub Action de construction existe
  3. vous indique le lien de la page « Actions » du dépôt

Ensuite, sur GitHub :
    Actions → « Construction Windows » → bouton « Run workflow »
  GitHub construit Jarvis-Complete-Setup.exe SUR SES SERVEURS
  (aucun gros fichier ne passe par Git — propre et rapide).

L'exécutable apparaîtra dans :
  • Releases (si vous poussez un tag v1.0.0)  — recommandé
  • Actions → artefacts  (à chaque exécution, sinon)

────────────────────────────────────────────────────────────────
  MÉTHODE Z — historique prêt : le bundle (aucune reconstruction)
────────────────────────────────────────────────────────────────

L'état exact du projet (commit complet) est téléchargeable sous forme
de « bundle git » — 254 Ko seulement, directement depuis l'application
en cours d'exécution :

    curl -LO "<<URL-JARVIS>>/api/download?f=jarvis-source.bundle"

    git clone jarvis-source.bundle Jarvis
    cd Jarvis
    git remote set-url origin https://github.com/juliusnovalis-boop/Jarvis.git
    git push -u origin main

C'est la voie la plus simple : tout l'historique préparé par
l'assistant est poussé tel quel sur votre dépôt.

────────────────────────────────────────────────────────────────
  MÉTHODE B — git manuels seulement
────────────────────────────────────────────────────────────────

    git config --global user.name  "juliusnovalis-boop"
    git config --global user.email "juliusnovalis-boop@users.noreply.github.com"

    cd « dossier du projet »
    git init -b main
    git add .
    git commit -m "Jarvis : assistant vocal complet (interface, agent PC, installeur Windows)"

    git remote add origin https://github.com/juliusnovalis-boop/Jarvis.git
    git push -u origin main

Puis GitHub > Actions > « Run workflow » pour produire l'installateur.

────────────────────────────────────────────────────────────────
  NOTES

• Les gros binaires (~200 Mo) sont EXCLUS du git par .gitignore :
  ils sont fabriqués par la GitHub Action, plus propres et rapides.
• Si vous voulez figer une version :  git tag v1.0.0 && git push origin v1.0.0
  → la Release avec l'exe se crée automatiquement.
• Le dépôt DOIT exister sur github.com (créez-le vide, sans README,
  puisque nous y poussons celui-ci).
════════════════════════════════════════════════════════════════
