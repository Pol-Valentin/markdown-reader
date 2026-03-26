## ADDED Requirements

### Requirement: CLI ouvre un fichier Markdown
Le système SHALL accepter un chemin de fichier Markdown en argument CLI (`markdown-reader <file.md>`). Si le chemin est relatif, il SHALL être résolu en chemin absolu.

#### Scenario: Ouverture avec chemin absolu
- **WHEN** l'utilisateur exécute `markdown-reader /home/pol/docs/spec.md`
- **THEN** le fichier est ouvert dans le reader et affiché

#### Scenario: Ouverture avec chemin relatif
- **WHEN** l'utilisateur exécute `markdown-reader ./docs/spec.md` depuis `/home/pol`
- **THEN** le fichier `/home/pol/docs/spec.md` est ouvert dans le reader

#### Scenario: Lancement sans argument
- **WHEN** l'utilisateur exécute `markdown-reader` sans argument
- **THEN** l'application se lance et affiche une fenêtre vide (pas de fichier ouvert, sidebar visible)

### Requirement: Détection du workspace GNOME actif
Le système SHALL détecter l'index du workspace GNOME actif via D-Bus (interface Mutter). Si l'appel D-Bus échoue, le système SHALL utiliser le workspace 0 par défaut.

#### Scenario: Détection réussie
- **WHEN** le CLI est lancé sur le workspace 2
- **THEN** le système identifie workspace_id = 2

#### Scenario: D-Bus indisponible
- **WHEN** l'appel D-Bus à Mutter échoue (session non-GNOME, etc.)
- **THEN** le système utilise workspace_id = 0 comme fallback

### Requirement: Routage vers l'instance existante via Unix socket
Le système SHALL vérifier si un socket Unix `$XDG_RUNTIME_DIR/md-reader-ws-{N}.sock` existe pour le workspace détecté. Si oui, il SHALL envoyer le chemin du fichier via ce socket. Si non, il SHALL lancer une nouvelle instance Tauri.

#### Scenario: Instance existante sur le workspace
- **WHEN** le CLI détecte workspace 2 et le socket `md-reader-ws-2.sock` existe et répond
- **THEN** le chemin du fichier est envoyé via le socket, et l'instance existante ouvre le fichier dans un nouvel onglet

#### Scenario: Pas d'instance sur le workspace
- **WHEN** le CLI détecte workspace 1 et aucun socket `md-reader-ws-1.sock` n'existe
- **THEN** une nouvelle instance Tauri est lancée, crée le socket, et ouvre le fichier

#### Scenario: Socket orphelin (instance crashée)
- **WHEN** le socket existe mais ne répond pas au ping
- **THEN** le socket orphelin est supprimé et une nouvelle instance est lancée

### Requirement: Création et nettoyage du socket Unix
Chaque instance Tauri SHALL créer un socket Unix `$XDG_RUNTIME_DIR/md-reader-ws-{N}.sock` au démarrage et le supprimer proprement à la fermeture.

#### Scenario: Création au démarrage
- **WHEN** une nouvelle instance Tauri est lancée pour le workspace 3
- **THEN** le socket `$XDG_RUNTIME_DIR/md-reader-ws-3.sock` est créé et écoute les connexions

#### Scenario: Nettoyage à la fermeture
- **WHEN** l'utilisateur ferme la fenêtre de l'instance
- **THEN** le socket est supprimé du filesystem
