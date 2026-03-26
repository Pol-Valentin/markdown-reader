## Context

Le Markdown Reader supporte déjà les commentaires inline via Claude Code Channels. Un tab est rendu "commentable" quand Claude l'ouvre via `open_file` (qui passe un session_id). Le channel MCP s'enregistre au Reader via `subscribe:{session_id}` sur le socket Unix.

Limitation : l'utilisateur ne peut pas initier la connexion depuis le Reader. Les fichiers ouverts manuellement ne sont pas commentables.

Claude Code n'expose pas le nom de session ni le session ID dans l'environnement des subprocesses MCP. Les seules métadonnées disponibles sont `process.cwd()` et un timestamp.

## Goals / Non-Goals

**Goals:**
- Permettre à l'utilisateur de connecter n'importe quel tab à une session Claude active
- Afficher les sessions disponibles avec cwd + timestamp comme identifiant
- Permettre de changer de session sur un tab déjà connecté
- Afficher un état clair quand aucune session n'est active

**Non-Goals:**
- Afficher le nom de session Claude (pas disponible techniquement)
- Connecter tous les tabs d'un coup (chaque tab est indépendant)
- Persistance des connexions entre restarts du Reader

## Decisions

### 1. Métadonnées dans le message subscribe

**Decision:** Étendre le message subscribe en `subscribe:{session_id}:{json_metadata}\n` où `json_metadata = { cwd, connected_at }`. Le JSON est optionnel pour la rétrocompatibilité.

**Rationale:** Le channel a accès à `process.cwd()` et `Date.now()`. C'est suffisant pour identifier visuellement une session. Pas besoin d'un protocole séparé pour les métadonnées.

### 2. SessionRegistry comme état partagé Tauri

**Decision:** Un `SessionRegistry = Arc<Mutex<HashMap<String, SessionInfo>>>` en managed state Tauri, alimenté par l'IPC server et lu par un nouveau command `get_sessions`.

**Rationale:** Le pattern est identique au `SubscriberMap` existant. Le registry est la source de vérité pour les sessions actives. Un Tauri event `sessions-changed` notifie le frontend des changements.

### 3. Sélecteur dans le chat panel header

**Decision:** Un `<select>` dans le header du chat panel, visible sur tous les tabs. Le chat panel est un **flex child** de `#main` (pas `position: absolute`), positionné sous `#content-scroll` dans le flex column layout. Le `.chat-resizer` est un **élément DOM séparé** (sibling flex) au-dessus du chat panel dans `#main`, pas à l'intérieur — 8px de haut avec un indicateur de 40px centré, bleu au hover. Le chat panel n'est plus masqué sur les tabs non-commentables — il affiche le sélecteur + un message "Aucune session" si besoin.

**Rationale:** L'utilisateur s'attend à trouver le sélecteur là où il interagit avec Claude. Le chat panel est l'endroit naturel. Le masquer sur les tabs non-commentables empêcherait d'initier la connexion. Le layout flex (vs absolute) assure que le panel participe au flow naturel sans chevaucher le contenu.

### 4. Identification par cwd + "il y a X min"

**Decision:** Chaque session est affichée comme `~/dev/perso/markdown-reader (il y a 5 min)`. Le cwd est tronqué avec `~` pour le home.

**Rationale:** C'est le maximum d'info disponible sans support d'Anthropic pour exposer le nom de session. Le cwd est déjà parlant pour distinguer les projets. Le timestamp aide si plusieurs sessions sont sur le même cwd.

### 5. Changement de session vide la conversation

**Decision:** Changer de session sur un tab vide les messages du chat panel.

**Rationale:** Les messages précédents appartenaient à l'ancienne session. Les afficher créerait de la confusion (Claude ne les a pas dans son contexte).

## Risks / Trade-offs

- **Cwd identique pour plusieurs sessions** → Si l'utilisateur a 2 sessions sur le même projet, seul le timestamp les distingue. Acceptable pour le MVP.
- **Le chat panel est maintenant toujours visible** → Changement de comportement par rapport à aujourd'hui. Le panel est un flex child de `#main` (pas absolute), avec un resizer séparé au-dessus. L'état "non connecté" doit être clair pour ne pas confondre.
