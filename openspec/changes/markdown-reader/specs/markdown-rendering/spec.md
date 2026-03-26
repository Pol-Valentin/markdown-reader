## ADDED Requirements

### Requirement: Rendu GFM complet
Le système SHALL rendre le Markdown selon la spécification GitHub Flavored Markdown (GFM) : tables, strikethrough, task lists, autolinks.

#### Scenario: Rendu d'une table GFM
- **WHEN** le fichier contient une table Markdown avec `|` et `---`
- **THEN** la table est rendue en HTML avec un style lisible (bordures, alignement)

#### Scenario: Rendu de task lists
- **WHEN** le fichier contient `- [ ] todo` et `- [x] done`
- **THEN** les checkboxes sont affichées (non interactives, lecture seule)

### Requirement: Rendu des diagrammes Mermaid
Le système SHALL rendre les blocs de code avec le langage `mermaid` en diagrammes SVG via mermaid.js. Le chargement de mermaid.js SHALL être lazy (uniquement si un bloc mermaid est détecté).

#### Scenario: Bloc mermaid dans le fichier
- **WHEN** le fichier contient un bloc ` ```mermaid ` avec un diagramme valide
- **THEN** le diagramme est rendu en SVG à la place du bloc de code

#### Scenario: Pas de bloc mermaid
- **WHEN** le fichier ne contient aucun bloc mermaid
- **THEN** mermaid.js n'est pas chargé (pas d'impact sur les performances)

#### Scenario: Diagramme mermaid invalide
- **WHEN** le bloc mermaid contient une syntaxe invalide
- **THEN** un message d'erreur lisible est affiché à la place du diagramme

### Requirement: Syntax highlighting des blocs de code
Le système SHALL appliquer du syntax highlighting sur les blocs de code via highlight.js, en détectant automatiquement le langage ou en utilisant le langage spécifié.

#### Scenario: Bloc de code avec langage spécifié
- **WHEN** le fichier contient ` ```rust ` suivi de code Rust
- **THEN** le code est affiché avec la coloration syntaxique Rust

#### Scenario: Bloc de code sans langage
- **WHEN** le fichier contient ` ``` ` sans spécification de langage
- **THEN** highlight.js tente une détection automatique

### Requirement: Rendu LaTeX via KaTeX
Le système SHALL rendre les formules LaTeX inline (`$...$`) et block (`$$...$$`) via KaTeX.

#### Scenario: Formule inline
- **WHEN** le fichier contient `$E = mc^2$`
- **THEN** la formule est rendue inline dans le texte

#### Scenario: Formule block
- **WHEN** le fichier contient `$$\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}$$`
- **THEN** la formule est rendue centrée en mode display

### Requirement: Front matter YAML masqué
Le système SHALL détecter le front matter YAML (délimité par `---` en début de fichier) et le masquer par défaut dans le rendu.

#### Scenario: Fichier avec front matter
- **WHEN** le fichier commence par `---\ntitle: Spec\n---`
- **THEN** le front matter n'est pas affiché dans le rendu

### Requirement: Table of contents automatique
Le système SHALL générer une table of contents à partir des headings du fichier Markdown.

#### Scenario: Fichier avec headings
- **WHEN** le fichier contient des `#`, `##`, `###`
- **THEN** une TOC est générée et affichée (cliquable pour naviguer)

### Requirement: Thème auto clair/sombre
Le système SHALL suivre le thème système via `prefers-color-scheme` (WebKitGTK). Pas de toggle manuel.

#### Scenario: Système en mode sombre
- **WHEN** le thème GTK est en mode sombre
- **THEN** le reader affiche un thème sombre (fond foncé, texte clair)

#### Scenario: Changement de thème à chaud
- **WHEN** l'utilisateur change le thème GTK pendant que le reader est ouvert
- **THEN** le reader bascule automatiquement
