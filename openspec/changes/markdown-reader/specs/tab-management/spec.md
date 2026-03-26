## ADDED Requirements

### Requirement: Ouverture en onglet
Chaque fichier ouvert SHALL être affiché dans un onglet. Si le fichier est déjà ouvert, l'onglet existant SHALL recevoir le focus.

#### Scenario: Ouverture d'un nouveau fichier
- **WHEN** l'utilisateur ouvre `spec.md` (pas encore en onglet)
- **THEN** un nouvel onglet est créé avec le nom du fichier

#### Scenario: Fichier déjà en onglet
- **WHEN** l'utilisateur ouvre `spec.md` (déjà en onglet)
- **THEN** l'onglet existant reçoit le focus

### Requirement: Fermeture d'un onglet
L'utilisateur SHALL pouvoir fermer un onglet via le bouton ✕ ou via middle-click sur l'onglet.

#### Scenario: Fermeture via ✕
- **WHEN** l'utilisateur clique sur ✕ d'un onglet
- **THEN** l'onglet est fermé et le fichier watcher associé est supprimé

#### Scenario: Fermeture via middle-click
- **WHEN** l'utilisateur fait un middle-click sur un onglet
- **THEN** l'onglet est fermé

#### Scenario: Fermeture du dernier onglet
- **WHEN** l'utilisateur ferme le seul onglet restant
- **THEN** l'application affiche un état vide (pas de contenu, sidebar toujours visible)

### Requirement: Onglet actif avec indicateur visuel
L'onglet actif SHALL avoir une bordure accent en haut pour le distinguer des onglets inactifs.

#### Scenario: Changement d'onglet actif
- **WHEN** l'utilisateur clique sur un onglet inactif
- **THEN** la bordure accent est déplacée sur le nouvel onglet actif et le contenu est mis à jour

### Requirement: Onglets non persistés
Les onglets SHALL être éphémères — ils ne sont pas sauvegardés entre les sessions.

#### Scenario: Redémarrage de l'application
- **WHEN** l'application est fermée puis relancée
- **THEN** aucun onglet n'est rouvert automatiquement
