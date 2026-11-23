#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  JARVIS → GitHub  (juliusnovalis-boop/Jarvis)
#  Pousse le code source en une commande. Demande le jeton une fois.
# ═══════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")/.."

REPO_OWNER="juliusnovalis-boop"
REPO_NAME="Jarvis"

echo "════════════════════════════════════════════"
echo "  JARVIS → GitHub  ($REPO_OWNER/$REPO_NAME)"
echo "════════════════════════════════════════════"
echo ""

# Vérifie l'état du dépôt distant
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "https://github.com/$REPO_OWNER/$REPO_NAME" || true)
if [ "$HTTP" = "200" ]; then
  echo "✓ Dépôt trouvé : https://github.com/$REPO_OWNER/$REPO_NAME"
elif [ "$HTTP" = "404" ]; then
  echo "⚠ Le dépôt n'existe pas encore sur github.com."
  echo "  Créez-le (vide, sans README) : https://github.com/new"
  echo "  Nom : $REPO_NAME  •  Visibilité : Public ou Private"
  echo ""
  read -r -p "Appuyez sur Entrée quand c'est fait, ou Ctrl+C pour annuler… " _
else
  echo "⚠ Impossible de joindre GitHub ($HTTP). Vérifiez votre connexion."
fi
echo ""

# Jeton GitHub (PAT) — demandé une seule fois, jamais stocké
if [ -n "${GITHUB_TOKEN:-}" ]; then
  TOKEN="$GITHUB_TOKEN"
else
  read -r -s -p "Collez votre jeton GitHub (PAT, portée 'repo') : " TOKEN
  echo ""
fi
if [ -z "$TOKEN" ]; then echo "✗ Jeton vide — abandon."; exit 1; fi

# Configuration git locale
git config user.name  "juliusnovalis-boop" 2>/dev/null || git config --global user.name  "juliusnovalis-boop"
git config user.email "juliusnovalis-boop@users.noreply.github.com" 2>/dev/null || true

# Initialisation si nécessaire
if [ ! -d .git ]; then
  git init -b main >/dev/null
  git add .
  if git diff --cached --quiet; then
    echo "Rien à committer (dépôt déjà à jour)."
  else
    git commit -q -m "Jarvis : assistant vocal complet — interface, agent PC, installateur Windows" || true
  fi
fi

# Push via URL contenant le jeton (utilisé une fois, non stocké)
REMOTE_URL="https://${TOKEN}@github.com/${REPO_OWNER}/${REPO_NAME}.git"

echo "→ Envoi du code source..."
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE_URL"
git push -u origin main
git remote set-url origin "https://github.com/${REPO_OWNER}/${REPO_NAME}.git"   # nettoie le jeton du config

echo ""
echo "✓ Code source publié : https://github.com/$REPO_OWNER/$REPO_NAME"
echo ""
echo "────────────────────────────────────────────────────────"
echo "  PROCHAINE ÉTAPE : fabriquer l'installateur sur GitHub"
echo "────────────────────────────────────────────────────────"
echo ""
echo "  1.  https://github.com/$REPO_OWNER/$REPO_NAME/actions"
echo "  2.  Cliquez « Construction Windows (installateur Jarvis) »"
echo "  3.  « Run workflow » → ~15 min de construction sur les"
echo "      serveurs Windows de GitHub (rien à installer chez vous)"
echo "  4.  Pour une Release permanente avec le .exe :"
echo "        git tag v1.0.0 && git push origin v1.0.0"
echo ""
echo "✓ Terminé. Le jeton n'est conservé nulle part."
