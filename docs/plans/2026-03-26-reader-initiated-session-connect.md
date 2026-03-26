# Connexion Reader → Session Claude Code

## Résumé

Permettre à l'utilisateur d'initier la connexion entre un tab du Markdown Reader et une session Claude Code active, directement depuis le chat panel du Reader. Aujourd'hui, seul Claude peut rendre un tab "commentable" via `open_file`. Avec cette feature, l'utilisateur peut ouvrir un fichier manuellement, puis choisir une session Claude dans un sélecteur pour activer les commentaires inline et le chat.

## Contexte

- Aujourd'hui un tab est "commentable" uniquement si Claude l'a ouvert via le tool MCP `open_file` (qui passe un `session_id`).
- Les channels MCP se connectent au Reader via le socket Unix et s'enregistrent avec `subscribe:{session_id}`.
- Le Reader connaît les subscribers (session_id → socket), mais pas leurs métadonnées (cwd, timestamp).
- Claude Code n'expose pas le nom de session ni le session ID dans l'environnement du subprocess MCP.
- On utilisera le **cwd** + **timestamp de connexion** comme identifiant de session affiché.

## Scope

### Inclus
- Le channel envoie ses métadonnées (cwd, timestamp) lors du subscribe
- Le Reader maintient une liste des sessions actives avec leurs métadonnées
- Le chat panel affiche un sélecteur de session sur tous les tabs (connectés ou non)
- Sélectionner une session rend le tab commentable (session_id assigné)
- On peut changer la session d'un tab déjà connecté
- Sans session active : le chat panel affiche "Aucune session Claude active"
- Nettoyage quand un subscriber se déconnecte

### Exclus
- Afficher le nom de session Claude (pas disponible techniquement)
- Connecter tous les tabs d'un coup (chaque tab est indépendant)
- Persistance des connexions entre restarts du Reader

## Exigences produit

### UX / UI

**Chat panel — état non connecté :**
- Visible sur tous les tabs (même non-commentables)
- Affiche un sélecteur (dropdown/select) avec les sessions actives
- Chaque session affichée comme : `~/dev/perso/markdown-reader` + `connecté il y a 5 min`
- Le cwd est tronqué avec `~` pour le home et `…` si trop long
- Si aucune session : message "Aucune session Claude active" + sélecteur désactivé

**Chat panel — état connecté :**
- Le sélecteur reste visible en haut du panel (pour changer de session)
- La session active est pré-sélectionnée
- Le bouton 💬 et le comment inline apparaissent
- Le chat fonctionne normalement

**Changement de session :**
- L'utilisateur peut changer la session d'un tab à tout moment via le sélecteur
- Changer de session vide la conversation du chat panel (les commentaires précédents étaient pour l'autre session)

### User stories

1. J'ouvre un fichier via la sidebar → le chat panel affiche "Sélectionner une session" → je choisis `~/dev/odys/legacy-api (il y a 3 min)` → le tab devient commentable, je peux commenter
2. Claude ouvre un fichier via `open_file` → le tab est déjà connecté → le sélecteur affiche la session pré-sélectionnée → je peux changer si je veux
3. Je ferme ma session Claude → le sélecteur se met à jour, si mon tab était connecté à cette session, il repasse en "non connecté"
4. Aucune session Claude active → le chat panel affiche "Aucune session Claude active"

## Plan technique

### 1. Channel — envoyer les métadonnées au subscribe

**Fichier :** `channel/markdown-reader-channel.ts`

Modifier le message subscribe pour inclure les métadonnées :
```
subscribe:{session_id}:{json}\n
```
Avec `json = { cwd: process.cwd(), connected_at: Date.now() }`

### 2. IPC — parser les métadonnées et maintenir la liste

**Fichier :** `src-tauri/src/ipc.rs`

- Nouveau type `SessionInfo { session_id, cwd, connected_at }`
- Nouveau type partagé `SessionRegistry = Arc<Mutex<HashMap<String, SessionInfo>>>`
- Parser `subscribe:{session_id}:{json}` (le json est optionnel pour rétrocompat)
- Ajouter au registry au subscribe, retirer au disconnect
- Nouveau `IpcMessage::SessionListChanged` émis quand un subscriber arrive ou part

**Fichier :** `src-tauri/src/commands.rs`

- Nouveau Tauri command `get_sessions` → retourne `Vec<SessionInfo>`

**Fichier :** `src-tauri/src/lib.rs`

- Passer le `SessionRegistry` en managed state
- Émettre un Tauri event `sessions-changed` quand la liste change
- Gérer le nouveau `IpcMessage::SessionListChanged`

### 3. Frontend — sélecteur de session dans le chat panel

**Fichier :** `frontend/comments.js`

- Ajouter un `<select>` en haut du chat panel (toujours visible)
- Option par défaut : "Sélectionner une session..."
- Options : `{cwd} (il y a X min)` pour chaque session active
- Si aucune session : `<select disabled>` + message "Aucune session Claude active"
- `onchange` → assigne le `session_id` au tab actif, le rend commentable, met à jour l'UI
- Écouter `sessions-changed` pour mettre à jour la liste dynamiquement
- Quand un tab est déjà connecté (via `open_file`), pré-sélectionner sa session
- Changer de session → vider les messages du chat panel

**Fichier :** `frontend/main.js`

- Écouter le Tauri event `sessions-changed`, forward au module comments
- Appeler `get_sessions` au init pour peupler le sélecteur

**Fichier :** `frontend/tabs.js`

- Permettre de set `session_id` et `commentable` depuis l'extérieur (déjà possible via `openTab`)
- Ajouter une fonction `updateTabSession(tabIndex, sessionId)`

**Fichier :** `frontend/styles.css`

- Style du select dans le chat header
- Style du message "Aucune session active"

## TODOs

### Channel (TypeScript)
- [ ] Modifier `subscribe` pour envoyer `subscribe:{session_id}:{"cwd":"...","connected_at":...}\n`

### IPC (Rust)
- [ ] Créer `SessionInfo` struct (session_id, cwd, connected_at)
- [ ] Créer `SessionRegistry` type partagé (`Arc<Mutex<HashMap<String, SessionInfo>>>`)
- [ ] Parser les métadonnées JSON optionnelles dans le message `subscribe:`
- [ ] Ajouter/retirer du registry au subscribe/disconnect
- [ ] Ajouter `IpcMessage::SessionListChanged`
- [ ] Ajouter le Tauri command `get_sessions`
- [ ] Passer `SessionRegistry` en managed state dans `lib.rs`
- [ ] Émettre `sessions-changed` Tauri event quand la liste change

### Frontend (JS)
- [ ] Ajouter `<select class="session-select">` dans le chat panel header
- [ ] Implémenter `updateSessionList(sessions)` pour peupler le select
- [ ] Implémenter `onSessionSelect(sessionId)` — assigne le session_id au tab, rend commentable
- [ ] Pré-sélectionner la session si le tab est déjà connecté
- [ ] Écouter `sessions-changed` Tauri event
- [ ] Appeler `get_sessions` au init
- [ ] Afficher "Aucune session Claude active" si liste vide
- [ ] Vider les messages du chat quand on change de session
- [ ] Ajouter `updateTabSession()` dans tabs.js
- [ ] Styles pour le select et le message "aucune session"

### Specs OpenSpec
- [ ] Mettre à jour les specs avec cette feature

## Questions ouvertes

Aucune — le scope est clair et les contraintes techniques identifiées.
