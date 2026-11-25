# JARVIS Studio 3D

Le studio est accessible sur `/` et `/studio`. L’interface JARVIS originale reste disponible sur `/assistant`, et l’espace MCP / vidéo sur `/code`.

## Moteur

- Three.js, React Three Fiber et drei ; véritable scène WebGL 2 interactive.
- Îles, végétation, rochers, dalles et cristaux générés procéduralement, sans téléchargement de modèles ou de textures externes.
- Matériaux PBR, ombres directionnelles, éclairage hémisphérique, atmosphère et brouillard.
- Portail à shader GLSL animé et particules. Bloom sélectif, vignettage et tone mapping ACES sur GPU matériel.
- Adaptation automatique aux moteurs logiciels (SwiftShader / llvmpipe) : résolution réduite, ombres de contact légères à la place des shadow maps et post-traitement désactivé. Les statistiques affichées sont mesurées et ne constituent pas une promesse de 60 FPS.

## Édition

Sélectionnez un objet dans la scène ou l’explorateur. Un double-clic dans l’explorateur cadre l’objet. L’inspecteur permet de modifier le nom, les transformations, la couleur, la rugosité, la métallicité, la visibilité et le verrouillage. Les paramètres de rugosité et de métallicité s’appliquent aux matériaux standard ; la surface du portail utilise son shader spécifique.

- `V` : sélection ; `W` : déplacement ; `E` : rotation ; `R` : échelle.
- `F` : cadrer ; `G` : grille ; molette : zoom ; clic gauche-glisser : orbite ; clic droit-glisser : panoramique.
- `Ctrl/Cmd + Z` : annuler ; `Ctrl/Cmd + Shift + Z` : rétablir.
- `Ctrl/Cmd + D` : dupliquer ; `Suppr` : supprimer ; `Ctrl/Cmd + S` : sauvegarder.
- `Espace` : lancer le jeu ; `Échap` : revenir à l’éditeur.

L’historique conserve 40 états dans la session. Les scènes sont limitées à 160 objets. Sur mobile, les icônes latérales et le bouton de l’inspecteur ouvrent les panneaux au-dessus de la scène.

## Exploration

Le mode jeu dispose d’un personnage en troisième personne : ZQSD, WASD ou flèches pour se déplacer, Espace pour sauter. Des commandes tactiles de déplacement et de saut sont disponibles sur les écrans tactiles. Gravité et collisions simples avec les surfaces des îles, les arbres et les rochers. Une chute replace le joueur au point de départ. Collectez tous les cristaux visibles et rejoignez le portail pour terminer l’exploration. Le mode jeu ne modifie pas les positions enregistrées dans l’éditeur.

Ce contrôleur est un moteur d’exploration léger, pas un solveur de physique généraliste : pas encore de rigid bodies dynamiques, de collisions triangulées arbitraires ou de scripting utilisateur.

## Sauvegarde

`GET /api/studio/project` charge le projet ; `PUT /api/studio/project` valide et enregistre sa version courante. Le document est persisté via Drizzle dans la table PostgreSQL `memories`, sous la clé `jarvis_studio_project_v1`. Aucune migration supplémentaire n’est nécessaire.

Les modifications sont sauvegardées après 1,6 seconde d’inactivité. Une copie locale est conservée dans le navigateur et restaurée si elle est plus récente que la version serveur. L’indicateur de sauvegarde distingue synchronisation, sauvegarde locale et succès serveur. Ce studio utilise actuellement un seul espace personnel, sans authentification ni collaboration multi-utilisateur.

## Import / export

- **Projet JARVIS JSON** : scène, objets et environnement rééditables ; import validé, limité à 500 Ko.
- **GLB** : géométrie, matériaux PBR et lumières ; importable dans Blender / Unity / Godot. Le shader animé du portail est converti en matériau standard pour la compatibilité.
- **PNG** : capture réelle du rendu de la caméra courante.

## Construction avec JARVIS

Le dialogue « Créer avec JARVIS » comprend les objets de la bibliothèque, les quantités de un à huit, et les ambiances jour / heure dorée / crépuscule. Exemple : « Ajoute trois arbres et deux cristaux ». Il s’agit d’un assistant de construction déterministe local, utilisable sans clé API, pas d’un générateur de modèles 3D par IA.

## Connexions MCP, Skills et Agents

Le dock inférieur comporte cinq onglets : **MCP (10)**, **Skills (12)**, **Agents**, **Bibliothèque** et **Console**. Trois raccourcis dans la barre latérale ouvrent directement ces onglets.

### MCP
- `GET /api/mcp` renvoie les **10 serveurs intégrés** (Blender, Unity, Godot 4, Unreal, VS Code, Chrome/CDP, Photoshop, Figma, GitHub, Linear) plus les personnalisés.
- `POST /api/mcp` sonde les endpoints avec un délai de 1,5 s. « Tout sonder » envoie `all: true` et teste **les 10 serveurs** (locaux et distants) ; « tester » cible un serveur via `id`.
- `PUT /api/mcp` **enregistre un serveur MCP** (nom, endpoint http(s), transport, authentification, description), persisté sous `jarvis_studio_mcp_v1` dans la table `memories`.
- `DELETE /api/mcp` supprime un serveur personnalisé. Les 10 intégrés ne sont pas supprimables.
- Les cartes affichent l'état (connecté / hors ligne), la latence en ms et l'erreur éventuelle.

### Skills
- `GET /api/skills` renvoie les **12 skills de base** (React, Three.js, Blender Python, Unity C#, GDScript, GLSL, API Node & Drizzle, Python agentique, MCP, RAG, FFmpeg, Docker) et les personnalisés (`jarvis_studio_skills_v1`).
- `POST /api/skills` **crée un skill** (nom, catégorie, description, 30 max), `DELETE /api/skills` supprime un skill personnalisé — les 12 de base sont verrouillés.
- L'activation/désactivation est partagée avec JARVIS Assistant et le DEV STUDIO via la clé locale `jarvis.skills`.
- Catégories : Front, 3D, Jeu, Back, Agents, Média, Ops, Domotique, Voix.

### Agents IA
- `GET/POST/DELETE /api/agents` sur la table PostgreSQL `agents`.
- Le formulaire de création demande un nom, une mission / prompt système et une liste d'outils séparés par des virgules (ex. `mcp.blender, skill.three`).

Chaque action est confirmée par un toast et tracée dans l'onglet **Console** du dock.

## Direction visuelle

Le studio reprend intégralement le langage graphique de JARVIS Assistant : fond `#01040c`, cadres et bordures cyan `rgba(34,211,238,…)`, titres **Orbitron**, interface **Rajdhani**, données **Share Tech Mono**, boutons à balayage lumineux, scanlines sur le viewport, indicateurs d'état vert/rouge et toasts encadrés. Le monde 3D conserve ses matériaux propres ; seule l'interface adopte la palette du HUD.
