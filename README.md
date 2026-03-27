# Markdown Reader

A lightweight, fast Markdown reader for Linux (GNOME/Wayland) built with Tauri v2.

![Markdown Reader icon](src-tauri/icons/icon.svg)

## Features

- **Full Markdown rendering** — GFM tables, task lists, strikethrough, autolinks
- **Mermaid diagrams** — rendered inline, lazy-loaded for performance
- **Syntax highlighting** — all languages via highlight.js
- **LaTeX math** — inline `$...$` and block `$$...$$` via KaTeX
- **Table of contents** — auto-generated from headings
- **Front matter** — YAML front matter hidden by default
- **Live reload** — file changes on disk are reflected instantly
- **Dark/light theme** — follows your system GTK theme automatically
- **Sidebar with 3 views** — Pinned, Recent, and Folder tree
- **Tabs** — open multiple files, click or middle-click to close
- **Pin files** — right-click to pin frequently used files
- **Multi-instance per workspace** — each GNOME workspace gets its own window, shared history
- **CLI-first** — `markdown-reader file.md` opens or reuses an existing instance
- **Detached from terminal** — launches in background, survives terminal close
- **Inline comments → Claude Code** — select text or click a diagram, send feedback directly to your Claude Code session via MCP Channel
- **Ctrl+V paste-to-comment** — select text, Ctrl+V → clipboard content sent as instant comment
- **Two-way conversation** — Claude replies appear in a chat panel at the bottom of the document
- **Session selector** — connect any tab to any active Claude Code session from the Reader
- **Multi-session routing** — comments are routed to the correct Claude Code session via session IDs
- **External links** — HTTP links open in your system browser
- **Tiny** — ~14 MB binary, ~5 MB .deb

## Install

### Prerequisites

- Linux with GNOME/Wayland
- Rust toolchain (via [rustup](https://rustup.rs/))
- System dependencies:

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

### Build from source

```bash
git clone https://github.com/Pol-Valentin/markdown-reader.git
cd markdown-reader
npm install
npm run build
export PATH="$HOME/.cargo/bin:$PATH"
npx tauri build
```

The binary is at `src-tauri/target/release/markdown-reader`.

### Install the .desktop file (optional)

To get the app icon in GNOME dock and app launcher:

```bash
# Copy binary somewhere in PATH
sudo cp src-tauri/target/release/markdown-reader /usr/local/bin/

# Install icon
mkdir -p ~/.local/share/icons/hicolor/128x128/apps
cp src-tauri/icons/128x128.png ~/.local/share/icons/hicolor/128x128/apps/markdown-reader.png
gtk-update-icon-cache -f ~/.local/share/icons/hicolor/

# Install .desktop file
cat > ~/.local/share/applications/markdown-reader.desktop << 'EOF'
[Desktop Entry]
Name=Markdown Reader
Comment=Lightweight Markdown reader with Mermaid support
Exec=markdown-reader %f
Icon=markdown-reader
Terminal=false
Type=Application
Categories=Utility;TextEditor;
MimeType=text/markdown;text/x-markdown;
StartupWMClass=markdown-reader
EOF
update-desktop-database ~/.local/share/applications/
```

## Claude Code Integration

The Markdown Reader can act as a [Claude Code Channel](https://code.claude.com/docs/en/channels-reference), enabling inline comments that are sent directly to your Claude Code session.

### Setup

1. Add to your global Claude Code config (`~/.claude.json`):

```json
{
  "mcpServers": {
    "markdown-reader": {
      "type": "stdio",
      "command": "bun",
      "args": ["/path/to/markdown-reader/channel/markdown-reader-channel.ts"]
    }
  }
}
```

2. Install channel dependencies:

```bash
cd channel && bun install
```

3. Launch Claude Code with the channel flag:

```bash
claude --dangerously-load-development-channels server:markdown-reader
```

Claude can now open files with the `open_file` MCP tool. Select text or click a Mermaid/code block, then click 💬 to send a comment (or Ctrl+V to send clipboard content instantly). Claude receives it with full context (file, heading, selection) and can reply back in the chat panel.

You can also connect any tab to an active Claude session from the Reader itself — use the session selector dropdown in the chat panel header.

## Usage

```bash
# Open a file
markdown-reader README.md

# Open without a file (browse history)
markdown-reader

# Open another file in the same instance (same workspace)
markdown-reader docs/spec.md
```

### Sidebar

- **📌 Pinned** — right-click any file → "Épingler" to pin it
- **🕐 Recent** — sorted by last opened
- **📂 By folder** — recursive tree, collapsible

### Keyboard / mouse

- **Click** a sidebar file to open in a new tab
- **Right-click** a file to pin/unpin
- **Middle-click** a tab to close it
- **☰** (tab bar) toggles sidebar visibility
- **⟳** (bottom-right) refreshes the content manually
- **⬌/⬄** (bottom-right) toggles between centered and full-width layout
- **Ctrl+V** on selected text sends clipboard as comment (when connected to Claude)
- **Drag** the sidebar edge or chat panel top edge to resize

## Tech stack

| Layer | Technology |
|---|---|
| Framework | [Tauri v2](https://v2.tauri.app/) |
| Backend | Rust |
| Frontend | Vanilla HTML/CSS/JS |
| Markdown | [marked.js](https://marked.js.org/) |
| Diagrams | [Mermaid](https://mermaid.js.org/) |
| Code highlighting | [highlight.js](https://highlightjs.org/) |
| Math | [KaTeX](https://katex.org/) |
| Bundler | [esbuild](https://esbuild.github.io/) |
| File watching | [notify](https://docs.rs/notify/) |
| IPC | Unix sockets |
| Workspace detection | D-Bus (GNOME Mutter) |
| Claude Code bridge | [MCP SDK](https://www.npmjs.com/package/@modelcontextprotocol/sdk) (TypeScript) |
| Clipboard | [tauri-plugin-clipboard-manager](https://v2.tauri.app/plugin/clipboard/) |

## License

[MIT](LICENSE)
