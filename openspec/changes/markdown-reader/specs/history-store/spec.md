## ADDED Requirements

### Requirement: Persistance de l'historique en JSON
Le système SHALL persister l'historique dans `~/.local/share/markdown-reader/history.json`. Le fichier SHALL contenir un champ `version`, un tableau `pinned` (chemins absolus), et un tableau `entries` (path, last_opened, open_count).

#### Scenario: Ouverture d'un nouveau fichier
- **WHEN** l'utilisateur ouvre `spec.md` pour la première fois
- **THEN** une entrée est ajoutée dans `entries` avec `path`, `last_opened` = maintenant, `open_count` = 1

#### Scenario: Réouverture d'un fichier existant
- **WHEN** l'utilisateur ouvre `spec.md` qui a déjà une entrée
- **THEN** `last_opened` est mis à jour et `open_count` est incrémenté

### Requirement: Accès concurrent via flock
Le système SHALL utiliser `flock` pour protéger les lectures/écritures concurrentes de `history.json` entre instances.

#### Scenario: Deux instances écrivent simultanément
- **WHEN** l'instance WS1 et l'instance WS2 tentent de mettre à jour l'historique en même temps
- **THEN** les écritures sont sérialisées via `flock`, aucune donnée n'est perdue

### Requirement: Sync inter-instances via inotify
Le système SHALL surveiller `history.json` via inotify. Quand le fichier est modifié par une autre instance, la sidebar SHALL être rafraîchie.

#### Scenario: Mise à jour par une autre instance
- **WHEN** l'instance WS1 ajoute un fichier à l'historique
- **THEN** l'instance WS2 détecte le changement via inotify et rafraîchit sa sidebar

### Requirement: Gestion des pins
Le tableau `pinned` SHALL contenir les chemins absolus des fichiers épinglés. L'ordre du tableau correspond à l'ordre d'affichage dans la sidebar.

#### Scenario: Pin d'un fichier
- **WHEN** l'utilisateur épingle `README.md`
- **THEN** le chemin est ajouté à la fin du tableau `pinned`

#### Scenario: Unpin d'un fichier
- **WHEN** l'utilisateur désépingle `README.md`
- **THEN** le chemin est retiré du tableau `pinned`

### Requirement: Création du répertoire et fichier si absent
Le système SHALL créer `~/.local/share/markdown-reader/` et `history.json` avec un contenu initial valide s'ils n'existent pas.

#### Scenario: Premier lancement
- **WHEN** l'application est lancée pour la première fois et le répertoire n'existe pas
- **THEN** le répertoire et le fichier `history.json` sont créés avec `{"version": 1, "pinned": [], "entries": []}`
