## Context

Projet neuf — pas de code existant. L'application est un lecteur Markdown desktop pour Linux (GNOME/Wayland) construit avec Tauri v2. Le design spec complet est dans `docs/superpowers/specs/2026-03-25-markdown-reader-design.md`.

L'utilisateur principal ouvre des fichiers .md depuis Claude Code en CLI. Le lecteur doit être instantané à l'ouverture et léger en mémoire.

## Goals / Non-Goals

**Goals:**
- Binaire unique `markdown-reader` installable dans le PATH
- Ouverture quasi-instantanée d'un fichier Markdown
- Rendu fidèle : GFM + Mermaid + syntax highlighting + LaTeX + TOC
- Multi-instance par workspace GNOME avec IPC par Unix sockets
- Historique persistant partagé entre instances
- Live reload des fichiers ouverts

**Non-Goals:**
- Édition de Markdown (lecture seule uniquement)
- Cross-platform (Linux GNOME/Wayland uniquement)
- Framework frontend (React, Vue, etc.) — vanilla JS suffit
- Persistance des onglets entre sessions
- Recherche full-text dans les fichiers
- Export PDF

## Decisions

### 1. Tauri v2 plutôt que GTK4+WebKitGTK natif ou Electron

**Choix** : Tauri v2 (Rust backend + WebKitGTK webview)

**Alternatives considérées** :
- **Python + GTK4 + WebKitGTK** : plus rapide à prototyper mais moins maintenable, dépend de Python runtime
- **Electron** : trop lourd (~150 MB), pas adapté pour un simple reader
- **Neutralinojs** : écosystème immature, single-instance à gérer manuellement

**Rationale** : Tauri produit un binaire de ~5-10 MB, utilise le WebView système (WebKitGTK), a un écosystème Rust riche pour le file watching et l'IPC. Le frontend est du HTML/JS standard avec accès à toutes les libs de rendu Markdown.

### 2. IPC par Unix sockets plutôt que D-Bus applicatif

**Choix** : Un socket Unix par workspace dans `$XDG_RUNTIME_DIR/md-reader-ws-{N}.sock`

**Alternatives considérées** :
- **D-Bus** : plus standard sous GNOME, mais overhead de déclaration de service et complexité d'interface
- **Named pipes** : unidirectionnel, pas adapté pour un protocole requête/réponse
- **TCP localhost** : pas nécessaire, Unix sockets sont plus performants et plus sécurisés

**Rationale** : Les Unix sockets sont simples, performants, nettoyés automatiquement au crash (si `SO_REUSEADDR`), et permettent un protocole trivial (envoyer le chemin du fichier en UTF-8). Chaque workspace a son propre socket, ce qui résout naturellement le routage multi-instance.

### 3. Détection workspace via D-Bus Mutter

**Choix** : Appel D-Bus à `org.gnome.Shell` pour obtenir le workspace actif

**Rationale** : Pas besoin d'extension GNOME. L'interface Mutter expose l'info workspace directement. Fonctionne sur Wayland (pas d'accès X11 nécessaire). L'appel D-Bus est rapide (<5ms).

### 4. Vanilla JS frontend sans framework

**Choix** : HTML/CSS/JS vanilla avec marked.js + mermaid.js + highlight.js + KaTeX

**Alternatives considérées** :
- **React/Vue/Svelte** : overhead de build, bundle size, complexité inutile pour une UI simple
- **Preact** : léger mais ajoute quand même une couche d'abstraction

**Rationale** : L'UI est simple (sidebar + tabs + content pane). Le DOM est mis à jour en entier à chaque changement de fichier (pas de diffing partiel nécessaire). Les libs de rendu sont indépendantes et s'intègrent directement dans du JS vanilla.

### 5. Historique JSON avec flock pour la concurrence

**Choix** : Fichier JSON unique dans `~/.local/share/markdown-reader/history.json`, accès concurrent via `flock`, notifications inter-instances via inotify sur le fichier.

**Alternatives considérées** :
- **SQLite** : plus robuste pour la concurrence, mais overkill pour quelques centaines d'entrées
- **Fichiers séparés par instance** : pas de vue unifiée, merge complexe

**Rationale** : Le fichier d'historique est petit (quelques KB), les écritures sont rares (une par ouverture de fichier), et `flock` + inotify sont natifs Linux. Simple et suffisant.

### 6. Troncature des chemins adaptatifs

**Choix** : Deux formats d'affichage — `nom — contexte` pour Épinglés/Récents, chemin tronqué par le début pour l'arbre Par dossier.

**Rationale** : Le format `nom — contexte` met en avant le nom du fichier (info la plus utile) et utilise l'espace restant pour le contexte dossier. La troncature par le début avec `…` est plus naturelle car le nom du fichier et les dossiers proches sont plus informatifs que le préfixe `/home/user/...`.

## Risks / Trade-offs

| Risque | Mitigation |
|---|---|
| **WebKitGTK pas installé** sur certaines distros → L'app ne se lance pas | Documenter la dépendance, vérifier au démarrage avec un message clair |
| **D-Bus Mutter interface change** entre versions GNOME | Isoler l'appel D-Bus dans un module, fallback sur workspace 0 si l'appel échoue |
| **Socket orphelin** si l'app crash sans cleanup | Vérifier la liveness du socket au démarrage CLI (envoyer un ping), supprimer si pas de réponse |
| **Croissance non bornée de history.json** | Acceptable pour v1 (usage personnel), ajout d'un cap à 500 entrées si nécessaire |
| **Mermaid.js est lourd** (~2 MB) → premier rendu lent | Charger mermaid.js en lazy (seulement si un bloc mermaid est détecté dans le fichier) |
| **Pas de persistance des onglets** → perte de contexte au restart | Hors scope v1, peut être ajouté facilement plus tard |
