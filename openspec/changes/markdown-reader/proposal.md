## Why

J'ouvre fréquemment des fichiers Markdown générés par Claude Code (specs, plans, docs) et j'ai besoin de les lire avec un bon rendu — en particulier les diagrammes Mermaid qui ne s'affichent pas dans le terminal. Actuellement, je dois ouvrir JetBrains juste pour ça, ce qui est lourd. Il me faut un lecteur dédié, léger, qui se lance en CLI et garde un historique des fichiers ouverts.

## What Changes

- Création d'une application desktop légère Tauri v2 (Rust + WebKitGTK) pour Linux/GNOME
- CLI `markdown-reader <file.md>` pour ouvrir un fichier
- Multi-instance par workspace GNOME avec détection automatique via D-Bus
- Rendu Markdown complet : GFM, Mermaid, syntax highlighting, LaTeX (KaTeX), TOC
- Sidebar avec 3 sections : Épinglés, Récents, Par dossier (arbre récursif)
- Live reload quand le fichier change sur disque
- Historique persistant partagé entre instances (JSON + flock)
- Thème auto clair/sombre suivant le système GTK

## Capabilities

### New Capabilities

- `cli-entry`: Détection workspace GNOME via D-Bus, routing vers l'instance existante ou lancement d'une nouvelle, via Unix sockets
- `markdown-rendering`: Rendu Markdown complet dans WebView — GFM, Mermaid, syntax highlighting, LaTeX, front matter, TOC
- `sidebar-history`: Sidebar avec 3 sections (épinglés, récents, par dossier), troncature intelligente des chemins, pin/unpin
- `file-watching`: Surveillance des fichiers ouverts via `notify`, live reload avec debounce
- `history-store`: Persistance JSON de l'historique et des pins, accès concurrent via flock, sync entre instances via inotify
- `tab-management`: Gestion des onglets par instance (ouvrir, fermer, focus, state machine)

### Modified Capabilities

_(aucune — projet neuf)_

## Impact

- **Nouveau binaire** : `markdown-reader` installé dans le PATH
- **Dépendances système** : WebKitGTK (requis par Tauri v2 sur Linux), D-Bus
- **Fichiers créés** : `~/.local/share/markdown-reader/history.json`, sockets dans `$XDG_RUNTIME_DIR/`
- **Frontend libs** : marked.js, mermaid.js, highlight.js, KaTeX (bundled)
