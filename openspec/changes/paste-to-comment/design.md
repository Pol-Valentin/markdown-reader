## Context

Le Reader a déjà un système de commentaires inline : sélection de texte → 💬 → formulaire → envoi. Le raccourci Ctrl+V court-circuite ce flux en envoyant directement le contenu du presse-papier quand du texte est sélectionné.

## Goals / Non-Goals

**Goals:**
- Ctrl+V sur une sélection de texte active → envoie le presse-papier comme commentaire
- Fonctionne uniquement sur les tabs commentables
- Le commentaire apparaît dans le chat panel comme si l'utilisateur l'avait tapé

**Non-Goals:**
- Ctrl+V sur les blocs Mermaid/code (la sélection de texte ne fonctionne pas dessus)
- Ctrl+V sans sélection (ne fait rien de spécial)
- Remplacer le flux standard 💬 → formulaire

## Decisions

### 1. Listener sur `keydown` Ctrl+V, pas sur `paste`

**Decision:** Écouter `keydown` avec `e.ctrlKey && e.key === 'v'` plutôt que l'événement `paste`.

**Rationale:** L'événement `paste` est lié à un champ de formulaire focus. Comme l'utilisateur sélectionne du texte dans `#content` (pas dans un input), il n'y a pas de champ focus pour recevoir le paste. Un keydown Ctrl+V permet de lire le presse-papier via `navigator.clipboard.readText()`.

### 2. Condition : sélection active + tab commentable

**Decision:** Le Ctrl+V ne déclenche le commentaire que si :
1. Le tab actif est commentable (`tab.commentable === true`)
2. Il y a une sélection de texte non vide dans `#content`
3. Le formulaire de commentaire n'est PAS déjà ouvert (pour ne pas interférer avec la frappe dans l'input)

**Rationale:** Évite les faux positifs. Si le formulaire est ouvert, le Ctrl+V fait un paste normal dans l'input.
