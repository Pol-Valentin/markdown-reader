## Why

Quand l'utilisateur sélectionne du texte dans le Reader et veut envoyer un commentaire, il doit cliquer sur 💬, taper le texte, puis envoyer. Pour un workflow rapide (ex: copier un message depuis un terminal, le coller comme feedback), c'est 3 étapes de trop. Un simple Ctrl+V sur du texte sélectionné devrait envoyer le contenu du presse-papier comme commentaire, en une seule action.

## What Changes

- Écouter `Ctrl+V` (paste) quand du texte est sélectionné dans `#content` sur un tab commentable
- Lire le contenu du presse-papier
- Envoyer automatiquement comme commentaire avec le contexte (fichier, heading, texte sélectionné)
- Afficher le commentaire dans le chat panel

## Capabilities

### New Capabilities
- `paste-to-comment`: Raccourci Ctrl+V → commentaire instantané quand du texte est sélectionné dans le contenu rendu

### Modified Capabilities

## Impact

- **Modified Frontend:** `comments.js` — ajout d'un listener `paste` ou `keydown` pour Ctrl+V
- **Aucune modification Rust** — utilise le même `send_comment` existant
- **Aucune nouvelle dépendance**
