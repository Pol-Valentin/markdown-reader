## ADDED Requirements

### Requirement: Section Épinglés
La sidebar SHALL afficher une section "📌 Épinglés" en haut, listant les fichiers pinnés au format `nom — contexte`.

#### Scenario: Fichiers épinglés présents
- **WHEN** l'historique contient 2 fichiers épinglés
- **THEN** la section Épinglés affiche les 2 fichiers au format `README.md — …odys/saas`

#### Scenario: Aucun fichier épinglé
- **WHEN** l'historique ne contient aucun fichier épinglé
- **THEN** la section Épinglés est masquée

### Requirement: Section Récents
La sidebar SHALL afficher une section "🕐 Récents" listant tous les fichiers de l'historique triés par `last_opened` descendant, au format `nom — contexte`.

#### Scenario: Historique avec fichiers
- **WHEN** l'historique contient 5 fichiers
- **THEN** les 5 fichiers sont listés du plus récent au plus ancien au format `spec.md — …markdown-reader/docs`

### Requirement: Section Par dossier
La sidebar SHALL afficher une section "📂 Par dossier" organisant les fichiers en arbre récursif multi-niveaux. Chaque niveau SHALL être collapsible indépendamment. Les dossiers racines de l'arbre SHALL être les ancêtres communs les plus hauts (git root ou 2 niveaux parents).

#### Scenario: Fichiers dans une hiérarchie profonde
- **WHEN** l'historique contient `/home/pol/dev/odys/saas/docs/api/README.md` et `/home/pol/dev/odys/saas/CHANGELOG.md`
- **THEN** l'arbre affiche `…odys/saas/` → `CHANGELOG.md` et `docs/` → `api/` → `README.md`

#### Scenario: Collapse d'un dossier
- **WHEN** l'utilisateur clique sur un dossier ouvert (▼)
- **THEN** le dossier se collapse (▶) et masque ses enfants

### Requirement: Format d'affichage nom — contexte
Les sections Épinglés et Récents SHALL afficher chaque fichier au format `nom_fichier — contexte_dossier`. Le nom du fichier n'est JAMAIS tronqué. Le contexte s'adapte à la largeur disponible avec `…` au début si nécessaire. Le contexte est le chemin relatif depuis le git root (ou 2 niveaux parents si pas de git).

#### Scenario: Largeur suffisante
- **WHEN** la sidebar est large et le fichier est `/home/pol/dev/perso/markdown-reader/docs/spec.md` (git root = `markdown-reader`)
- **THEN** l'affichage est `spec.md — markdown-reader/docs`

#### Scenario: Largeur réduite
- **WHEN** la sidebar est étroite
- **THEN** l'affichage est `spec.md — …docs`

#### Scenario: Tooltip au hover
- **WHEN** l'utilisateur survole un fichier
- **THEN** un tooltip affiche le chemin complet

### Requirement: Troncature des dossiers dans l'arbre
Les noms de dossiers dans la section Par dossier SHALL être tronqués par le début avec `…` si nécessaire.

#### Scenario: Dossier racine long
- **WHEN** le dossier racine est `perso/markdown-reader/docs/` et la sidebar est étroite
- **THEN** l'affichage est `…markdown-reader/docs/`

### Requirement: Pin et Unpin de fichiers
L'utilisateur SHALL pouvoir épingler un fichier via clic droit → "📌 Épingler" et désépingler via le ✕ dans la section Épinglés ou clic droit → "Désépingler". Un fichier pinné reste visible dans Récents et Par dossier.

#### Scenario: Pin d'un fichier
- **WHEN** l'utilisateur fait clic droit sur `spec.md` → "📌 Épingler"
- **THEN** le fichier apparaît dans la section Épinglés

#### Scenario: Unpin via ✕
- **WHEN** l'utilisateur clique sur ✕ à côté d'un fichier dans Épinglés
- **THEN** le fichier est retiré de la section Épinglés mais reste dans Récents

### Requirement: Clic sidebar ouvre dans un onglet
Un clic sur un fichier dans la sidebar SHALL ouvrir le fichier dans un nouvel onglet, ou donner le focus à l'onglet existant si le fichier est déjà ouvert.

#### Scenario: Fichier pas encore ouvert
- **WHEN** l'utilisateur clique sur `plan.md` dans la sidebar
- **THEN** un nouvel onglet est créé et le fichier est affiché

#### Scenario: Fichier déjà ouvert en onglet
- **WHEN** l'utilisateur clique sur `plan.md` qui est déjà ouvert dans un onglet
- **THEN** l'onglet existant reçoit le focus (pas de doublon)
