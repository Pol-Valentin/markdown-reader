## 1. Implémentation du raccourci

- [x] 1.1 Ajouter un listener `keydown` dans `initComments()` de `comments.js` qui détecte Ctrl+V
- [x] 1.2 Vérifier les conditions : tab commentable, sélection non vide dans `#content`, formulaire/input non focus
- [x] 1.3 Lire le presse-papier via `navigator.clipboard.readText()`
- [x] 1.4 Construire le payload (file, session_id, heading, selected_text, content_type: "text", comment: clipboard)
- [x] 1.5 Envoyer via `invoke('send_comment', { comment: payload })`
- [x] 1.6 Afficher dans le chat panel via `appendUserComment()`
- [x] 1.7 Effacer la sélection et dismiss le bouton 💬 si visible
- [x] 1.8 Appeler `e.preventDefault()` pour empêcher le paste natif
