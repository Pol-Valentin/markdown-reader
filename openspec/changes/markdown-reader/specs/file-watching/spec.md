## ADDED Requirements

### Requirement: Surveillance des fichiers ouverts
Le système SHALL surveiller tous les fichiers ouverts en onglets via la crate `notify`. Quand un fichier change sur disque, le système SHALL émettre un event `file-changed` au frontend.

#### Scenario: Fichier modifié sur disque
- **WHEN** le fichier `spec.md` ouvert dans un onglet est modifié par un processus externe
- **THEN** le frontend reçoit un event `file-changed` avec le chemin du fichier

#### Scenario: Fichier supprimé
- **WHEN** le fichier `spec.md` est supprimé du disque
- **THEN** l'onglet affiche un message indiquant que le fichier n'existe plus

### Requirement: Debounce des events
Le système SHALL appliquer un debounce de ~200ms sur les events `file-changed` pour éviter les re-renders multiples lors d'écritures rapides successives.

#### Scenario: Écritures rapides
- **WHEN** un fichier est modifié 5 fois en 100ms (sauvegarde incrémentale)
- **THEN** un seul event `file-changed` est émis après la stabilisation

### Requirement: Re-render automatique
Quand le frontend reçoit un event `file-changed`, il SHALL re-lire le contenu du fichier et re-rendre le Markdown.

#### Scenario: Live reload
- **WHEN** l'event `file-changed` est reçu pour le fichier de l'onglet actif
- **THEN** le contenu est re-lu depuis le disque et le rendu est mis à jour

### Requirement: Watch/unwatch dynamique
Le système SHALL ajouter un watch quand un onglet est ouvert et supprimer le watch quand l'onglet est fermé.

#### Scenario: Ouverture d'un onglet
- **WHEN** un nouvel onglet est ouvert pour `README.md`
- **THEN** un file watcher est ajouté pour `README.md`

#### Scenario: Fermeture d'un onglet
- **WHEN** l'onglet de `README.md` est fermé
- **THEN** le file watcher pour `README.md` est supprimé
