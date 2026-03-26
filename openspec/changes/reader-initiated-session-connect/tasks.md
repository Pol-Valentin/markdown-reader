## 1. Channel — Envoyer les métadonnées au subscribe

- [x] 1.1 Modifier `connectAndSubscribe()` dans `channel/markdown-reader-channel.ts` pour envoyer `subscribe:{session_id}:{"cwd":"...","connected_at":...}\n` au lieu de `subscribe:{session_id}\n`

## 2. IPC — SessionRegistry et parsing métadonnées (Rust)

- [x] 2.1 Créer `SessionInfo` struct (session_id, cwd, connected_at) dans `ipc.rs`
- [x] 2.2 Créer `SessionRegistry` type (`Arc<Mutex<HashMap<String, SessionInfo>>>`) et `new_session_registry()` dans `ipc.rs`
- [x] 2.3 Modifier le parsing de `subscribe:` pour extraire le JSON optionnel après le 2ème `:` — fallback cwd="" et connected_at=now si absent
- [x] 2.4 Ajouter au registry au subscribe, retirer au disconnect
- [x] 2.5 Ajouter `IpcMessage::SessionListChanged` et l'émettre au subscribe et disconnect
- [x] 2.6 Écrire tests pour le parsing subscribe avec et sans métadonnées

## 3. Tauri Commands & State (Rust)

- [x] 3.1 Ajouter `get_sessions` Tauri command dans `commands.rs` — retourne `Vec<SessionInfo>` depuis le registry
- [x] 3.2 Passer `SessionRegistry` en managed state dans `lib.rs` (à côté du `SubscriberMap`)
- [x] 3.3 Gérer `IpcMessage::SessionListChanged` dans la boucle IPC de `lib.rs` — émettre un Tauri event `sessions-changed`

## 4. Frontend — Tabs (JS)

- [x] 4.1 Ajouter `updateTabSession(sessionId)` dans `tabs.js` — met à jour session_id et commentable sur le tab actif

## 5. Frontend — Session selector dans le chat panel (JS)

- [x] 5.1 Ajouter un `<select class="session-select">` dans le chat panel header (dans `ensureChatPanel`)
- [x] 5.2 Implémenter `updateSessionList(sessions)` — peuple le select avec `{cwd} ({session_id_short}) — il y a X min` (8 premiers chars de l'UUID), option vide par défaut
- [x] 5.3 Implémenter le `onchange` du select — appelle `updateTabSession(sessionId)`, met à jour commentable, affiche/cache le 💬
- [x] 5.4 Pré-sélectionner la session si le tab actif est déjà connecté
- [x] 5.5 Afficher "Aucune session Claude active" si la liste est vide + désactiver le select
- [x] 5.6 Désactiver le chat input quand aucune session n'est sélectionnée
- [x] 5.7 Vider les messages du chat quand on change de session
- [x] 5.8 Rendre le chat panel visible sur tous les tabs (supprimer le `display:none` par défaut sur les non-commentables)

## 6. Frontend — Wiring events (JS)

- [x] 6.1 Écouter le Tauri event `sessions-changed` dans `main.js` — appeler `invoke('get_sessions')` puis `updateSessionList()`
- [x] 6.2 Appeler `invoke('get_sessions')` au init pour peupler le sélecteur au démarrage
- [x] 6.3 Mettre à jour le sélecteur quand on change de tab (pré-sélection)

## 7. Frontend — Styles (CSS)

- [x] 7.1 Style du `<select class="session-select">` dans le chat header
- [x] 7.2 Style du message "Aucune session Claude active"
- [x] 7.3 Style du chat input désactivé

## 8. Gestion de la déconnexion

- [x] 8.1 Quand une session se déconnecte, vérifier si des tabs sont connectés à cette session → les passer en non-commentable, mettre à jour le sélecteur
