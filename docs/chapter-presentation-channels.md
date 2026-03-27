# Claude Code Channels — Comment ça marche ?

## Le problème

```mermaid
graph LR
    CC[Claude Code<br/>Terminal] -->|"bash: markdown-reader file.md"| R[Markdown Reader]
    R -.->|"❌ Aucun retour possible"| CC

    style CC fill:#1a1a2e,color:#e6edf3,stroke:#58a6ff
    style R fill:#0d1117,color:#e6edf3,stroke:#30363d
```

Claude ouvre un fichier dans le Reader via une commande bash. **Sens unique** : pas de moyen de renvoyer du feedback sans retourner au terminal.

---

## La solution : les Channels

Un **Channel** est un serveur MCP stdio que Claude Code lance comme subprocess. Il permet une **communication bidirectionnelle** entre une app externe et Claude.

```mermaid
graph TB
    subgraph "Claude Code (Terminal)"
        CC[Claude Code<br/>LLM + Tools]
    end

    subgraph "Channel MCP (subprocess séparé)"
        CH["markdown-reader-channel.ts<br/>Serveur MCP stdio"]
    end

    subgraph "Markdown Reader (Tauri)"
        GUI[WebView UI]
        SOCK[Unix Socket]
    end

    CC <-->|"stdin/stdout<br/>Protocole MCP"| CH
    CH <-->|"Unix Socket<br/>subscribe, comment, reply"| SOCK
    SOCK <--> GUI

    style CC fill:#1a1a2e,color:#e6edf3,stroke:#58a6ff
    style CH fill:#2d1b69,color:#e6edf3,stroke:#8957e5
    style GUI fill:#0d1117,color:#e6edf3,stroke:#30363d
    style SOCK fill:#0d1117,color:#e6edf3,stroke:#30363d
```

Le channel est un **process TypeScript indépendant** que Claude Code spawne au démarrage. Il fait le pont entre le protocole MCP (stdio) et le Reader (Unix socket). Claude Code ne communique jamais directement avec le Reader.

---

## Le flux complet

```mermaid
sequenceDiagram
    actor User
    participant CC as Claude Code
    participant CH as Channel MCP<br/>(TypeScript)
    participant R as Markdown Reader<br/>(Tauri)

    Note over CC,CH: Au démarrage de Claude Code
    CC->>CH: Spawn subprocess stdio
    CH->>CH: Génère un session_id (UUID)
    CH->>R: Unix socket: subscribe:abc123:{"cwd":"..."}
    R->>R: Enregistre la session dans le registry

    Note over CC,R: Claude veut montrer un fichier
    CC->>CH: Tool call: open_file({path: "design.md"})
    CH->>R: open:abc123:/path/design.md
    R->>R: Ouvre le fichier dans un tab<br/>taggé session abc123
    R-->>User: Le fichier s'affiche

    Note over User,R: L'utilisateur commente
    User->>R: Sélectionne du texte, clique 💬<br/>"Ajoute un diagramme ici"
    R->>CH: comment:{"file":"design.md","heading":"## Archi",<br/>"selected_text":"le passage","comment":"Ajoute un diagramme"}
    CH->>CC: notifications/claude/channel
    Note over CC: Claude reçoit le commentaire<br/>avec tout le contexte

    Note over CC,R: Claude agit et répond
    CC->>CC: Modifie le fichier
    CC->>CH: Tool call: reply({session_id, message: "Diagramme ajouté ✅"})
    CH->>R: reply:abc123:{"text":"Diagramme ajouté ✅"}
    R-->>User: La réponse s'affiche<br/>dans le chat panel
```

---

## Multi-session : le routage

Chaque session Claude Code a **son propre channel** avec un session_id unique. Le Reader route les commentaires vers la bonne session.

```mermaid
graph TB
    subgraph "Terminal 1"
        CC1["Claude Code"]
    end

    CH1["Channel MCP<br/>session abc123"]

    subgraph "Terminal 2"
        CC2["Claude Code"]
    end

    CH2["Channel MCP<br/>session def456"]

    subgraph "Markdown Reader"
        T1["Tab: design.md<br/>🏷️ session abc123"]
        T2["Tab: api-spec.md<br/>🏷️ session def456"]
        T3["Tab: notes.md<br/>🏷️ aucune session"]
        SOCK[Unix Socket]
    end

    CC1 <-->|stdio MCP| CH1
    CC2 <-->|stdio MCP| CH2
    CH1 <-->|Unix socket| SOCK
    CH2 <-->|Unix socket| SOCK
    SOCK --- T1
    SOCK --- T2
    SOCK --- T3

    style T1 fill:#0969da,color:white,stroke:#0969da
    style T2 fill:#8957e5,color:white,stroke:#8957e5
    style T3 fill:#30363d,color:#8b949e,stroke:#30363d
```

- **Tab bleu** → commentaires vont au Terminal 1
- **Tab violet** → commentaires vont au Terminal 2
- **Tab gris** → ouvert manuellement, pas commentable (sauf si l'utilisateur choisit une session dans le sélecteur)

---

## Connexion initiée depuis le Reader

L'utilisateur peut aussi **connecter un tab manuellement** à une session Claude active, sans que Claude ait ouvert le fichier.

```mermaid
sequenceDiagram
    actor User
    participant R as Reader
    participant CH as Channel
    participant CC as Claude Code

    User->>R: Ouvre un fichier via la sidebar
    Note over R: Tab ouvert sans session_id<br/>💬 désactivé

    User->>R: Sélectionne une session<br/>dans le dropdown du chat panel
    Note over R: "~/dev/project (abc123) — il y a 3 min"
    R->>R: Assigne session_id au tab<br/>💬 activé

    User->>R: Commente "Corrige ce bug"
    R->>CH: comment:{...}
    CH->>CC: notification
    CC->>CH: reply "C'est corrigé !"
    CH->>R: reply:{...}
    R-->>User: Réponse dans le chat panel
```

---

## Bonus : session ID dans la status line

Le channel écrit son session ID dans un fichier au démarrage (`$XDG_RUNTIME_DIR/md-reader-channel-{pid}.session`). Le script statusline de Claude Code le lit et l'affiche :

```
[21:35] [Opus 4.6] 📁 markdown-reader | 🌿 main | 🧠 45.2K (~23%) | 📎 a73140b6
```

Le `📎 a73140b6` c'est les 8 premiers caractères du session UUID — le même qu'on voit dans le sélecteur du Reader. Ça permet de faire le lien visuel entre le terminal et le Reader.

```bash
# Extrait du statusline.sh
CHANNEL_ID=$(
  for f in "$RUNTIME_DIR"/md-reader-channel-*.session; do
    [ -f "$f" ] || continue
    PID=$(echo "$f" | grep -oP '\d+(?=\.session)') || continue
    kill -0 "$PID" 2>/dev/null || continue   # process vivant ?
    head -1 "$f" | cut -c1-8                  # 8 premiers chars
    break
  done
) 2>/dev/null
```

---

## Stack technique

| Composant | Techno | Rôle |
|---|---|---|
| **Claude Code** | CLI Anthropic | LLM + orchestration |
| **Channel** | TypeScript + MCP SDK | Bridge stdio ↔ Unix socket |
| **Reader** | Tauri v2 (Rust + JS) | GUI + IPC server |
| **Socket** | Unix socket | Communication Reader ↔ Channel |
| **Protocole** | Ligne de texte préfixée | `subscribe:`, `open:`, `comment:`, `reply:` |

---

## Config

```json
// ~/.claude.json (global)
{
  "mcpServers": {
    "markdown-reader": {
      "type": "stdio",
      "command": "bun",
      "args": ["/path/to/channel/markdown-reader-channel.ts"]
    }
  }
}
```

```bash
# Lancer Claude avec le channel activé (research preview)
claude --dangerously-load-development-channels server:markdown-reader
```
