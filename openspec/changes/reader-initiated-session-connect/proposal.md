## Why

Aujourd'hui, un tab n'est "commentable" que si Claude Code l'a ouvert via le tool MCP `open_file`. Si l'utilisateur ouvre un fichier manuellement (sidebar, CLI), il ne peut pas commenter dessus ni discuter avec Claude. Cette feature permet d'initier la connexion depuis le Reader : l'utilisateur sélectionne une session Claude active dans un dropdown et le tab devient commentable.

## What Changes

- Le channel MCP envoie ses **métadonnées** (cwd, timestamp) lors du subscribe
- Le Reader maintient un **registre des sessions actives** avec leurs métadonnées
- Le chat panel affiche un **sélecteur de session** (dropdown) sur tous les tabs
- Sélectionner une session rend le tab commentable (session_id assigné)
- On peut **changer la session** d'un tab déjà connecté
- Sans session active : message "Aucune session Claude active" + sélecteur désactivé
- Nouveau Tauri command `get_sessions` et event `sessions-changed`

## Capabilities

### New Capabilities
- `session-registry`: Registre des sessions Claude actives côté Reader — parsing des métadonnées au subscribe, maintien de la liste, nettoyage au disconnect, Tauri command et event
- `session-selector-ui`: Sélecteur de session dans le chat panel — dropdown avec cwd + timestamp, connexion/déconnexion de tab, état "aucune session"

### Modified Capabilities
- `ipc-subscriptions`: Le message `subscribe:` accepte maintenant des métadonnées JSON optionnelles
- `inline-comments-ui`: Le chat panel est maintenant visible sur tous les tabs (pas seulement les commentables), avec le sélecteur de session

## Impact

- **Modified TypeScript:** `channel/markdown-reader-channel.ts` — envoi de métadonnées au subscribe
- **Modified Rust:** `ipc.rs` (parsing métadonnées, SessionRegistry), `commands.rs` (nouveau `get_sessions`), `lib.rs` (managed state, event)
- **Modified Frontend:** `comments.js` (sélecteur, état non-connecté), `tabs.js` (updateTabSession), `main.js` (écoute events), `styles.css` (styles sélecteur)
- **Aucune nouvelle dépendance**
