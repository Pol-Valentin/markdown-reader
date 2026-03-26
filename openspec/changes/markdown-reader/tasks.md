## 1. Scaffold projet Tauri v2

- [x] 1.1 Initialiser le projet Tauri v2 avec `cargo create-tauri-app` (template vanilla JS, package manager npm)
- [x] 1.2 Vérifier que le projet compile et s'ouvre (`cargo tauri dev`)
- [x] 1.3 Configurer `tauri.conf.json` : titre "Markdown Reader", taille fenêtre par défaut, permissions filesystem

## 2. History Store (Rust backend)

- [x] 2.1 Créer le module `history.rs` : structs `History`, `HistoryEntry` avec serde Serialize/Deserialize
- [x] 2.2 Implémenter `History::load()` — lecture depuis `~/.local/share/markdown-reader/history.json` avec `flock`, création du fichier/répertoire si absent
- [x] 2.3 Implémenter `History::save()` — écriture atomique avec `flock`
- [x] 2.4 Implémenter `History::record_open(path)` — ajoute/met à jour une entrée (last_opened, open_count)
- [x] 2.5 Implémenter `History::pin(path)` et `History::unpin(path)`
- [x] 2.6 Écrire les tests unitaires pour le History Store (load, save, record_open, pin, unpin, accès concurrent)

## 3. Workspace Detection (Rust)

- [x] 3.1 Créer le module `workspace.rs` : fonction `get_current_workspace() -> u32` via D-Bus (appel Mutter)
- [x] 3.2 Implémenter le fallback → workspace 0 si D-Bus échoue
- [x] 3.3 Écrire un test qui vérifie le fallback quand D-Bus est indisponible

## 4. IPC Unix Socket (Rust)

- [x] 4.1 Créer le module `ipc.rs` : fonction `socket_path(workspace_id) -> PathBuf` retournant `$XDG_RUNTIME_DIR/md-reader-ws-{N}.sock`
- [x] 4.2 Implémenter `IpcServer::start(workspace_id)` — écoute le socket, émet les chemins reçus via un channel
- [x] 4.3 Implémenter `IpcClient::send(workspace_id, file_path)` — envoie un chemin via le socket existant
- [x] 4.4 Implémenter `IpcClient::ping(workspace_id)` — vérifie si une instance répond
- [x] 4.5 Implémenter le nettoyage du socket orphelin si ping échoue
- [x] 4.6 Écrire les tests : envoi/réception, ping, socket orphelin

## 5. File Watcher (Rust)

- [x] 5.1 Créer le module `watcher.rs` : struct `FileWatcher` avec `notify` crate
- [x] 5.2 Implémenter `watch(path)` et `unwatch(path)` dynamiques
- [x] 5.3 Implémenter le debounce (~200ms) des events
- [x] 5.4 Émettre les events vers le frontend via Tauri event system
- [x] 5.5 Écrire les tests pour watch/unwatch et debounce

## 6. Tauri Commands (bridge Rust ↔ Frontend)

- [x] 6.1 Commande `read_file(path) -> String` — lit le contenu d'un fichier Markdown
- [x] 6.2 Commande `get_history() -> History` — retourne l'historique complet
- [x] 6.3 Commande `record_open(path)` — enregistre l'ouverture dans l'historique
- [x] 6.4 Commandes `pin_file(path)` et `unpin_file(path)`
- [x] 6.5 Commande `resolve_path(path) -> String` — résout un chemin relatif en absolu
- [x] 6.6 Commande `get_git_root(path) -> Option<String>` — retourne le git root pour la troncature
- [x] 6.7 Brancher le IPC server dans le setup Tauri : écoute le socket, émet `open-file` event au frontend

## 7. CLI Entry Point

- [x] 7.1 Modifier `main.rs` : parser l'argument CLI (chemin fichier optionnel)
- [x] 7.2 Détecter le workspace via `workspace.rs`
- [x] 7.3 Si socket existe et ping OK → envoyer le chemin via IPC et exit
- [x] 7.4 Sinon → lancer l'app Tauri normalement avec le fichier initial en contexte

## 8. Frontend — Rendu Markdown

- [x] 8.1 Installer les dépendances frontend : marked.js, highlight.js, KaTeX (npm)
- [x] 8.2 Créer `src/renderer.js` : fonction `renderMarkdown(content)` — marked.js avec extensions GFM
- [x] 8.3 Intégrer highlight.js comme renderer de blocs de code dans marked
- [x] 8.4 Intégrer KaTeX : extension marked pour `$...$` inline et `$$...$$` block
- [x] 8.5 Intégrer mermaid.js en lazy : détecter les blocs mermaid, charger et rendre
- [x] 8.6 Implémenter le masquage du front matter YAML
- [x] 8.7 Implémenter la génération de TOC depuis les headings

## 9. Frontend — Layout & Thème

- [x] 9.1 Créer la structure HTML : sidebar (resizable) + main area (tabs + content)
- [x] 9.2 Implémenter le CSS avec `prefers-color-scheme` pour le thème auto clair/sombre
- [x] 9.3 Styler la barre d'onglets (actif avec bordure accent, ✕, middle-click)
- [x] 9.4 Styler le content pane (typography, code blocks, tables, mermaid)

## 10. Frontend — Sidebar

- [x] 10.1 Créer `src/sidebar.js` : composant sidebar avec les 3 sections
- [x] 10.2 Implémenter la section Épinglés (format `nom — contexte`, bouton ✕ unpin)
- [x] 10.3 Implémenter la section Récents (format `nom — contexte`, tri par last_opened)
- [x] 10.4 Implémenter la section Par dossier (arbre récursif multi-niveaux, collapsible)
- [x] 10.5 Implémenter la troncature intelligente des chemins (git root, adaptatif à la largeur, `…` au début)
- [x] 10.6 Implémenter le menu clic droit (📌 Épingler / Désépingler)
- [x] 10.7 Brancher le clic sidebar → ouverture/focus onglet

## 11. Frontend — Tabs

- [x] 11.1 Créer `src/tabs.js` : gestion des onglets (open, close, focus, state)
- [x] 11.2 Ouvrir un fichier : créer un onglet ou focus si déjà ouvert
- [x] 11.3 Fermer un onglet : ✕ et middle-click, gérer le state NoFile/OneTab/MultipleTabs
- [x] 11.4 Brancher le changement d'onglet sur le re-render du content pane

## 12. Frontend — Intégration events

- [x] 12.1 Écouter l'event Tauri `open-file` (depuis IPC socket) → ouvrir en onglet
- [x] 12.2 Écouter l'event Tauri `file-changed` (depuis file watcher) → re-render
- [x] 12.3 Écouter l'event Tauri `history-changed` (depuis inotify history.json) → refresh sidebar
- [x] 12.4 Au démarrage : charger l'historique, ouvrir le fichier initial si argument CLI

## 13. Intégration & Polish

- [x] 13.1 Surveiller `history.json` via inotify côté Rust, émettre event `history-changed`
- [ ] 13.2 Tester le flow complet : CLI → workspace detection → socket IPC → ouverture
- [ ] 13.3 Tester multi-instance : 2 instances sur 2 workspaces, historique partagé
- [ ] 13.4 Tester live reload : modifier un fichier ouvert, vérifier le re-render
- [ ] 13.5 Ajouter une icône `.desktop` et un fichier `.desktop` pour le lanceur d'applications
- [x] 13.6 Builder le binaire release (`cargo tauri build`) et vérifier l'installation
