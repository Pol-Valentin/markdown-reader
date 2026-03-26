## Why

When Claude Code generates plans, designs, or specs and opens them in the Markdown Reader, the user must switch back to the terminal to give feedback. This breaks the review flow. Inline comments with positional context (file, heading, selected text) sent directly to Claude via a Claude Code Channel would make the feedback loop seamless — and Claude could reply back in the Reader.

## What Changes

- Add a **two-way Claude Code Channel** (MCP) so the Reader can push comments to Claude and receive replies
- Add a **TypeScript channel bridge** (`markdown-reader --mcp` mode) using the MCP SDK, communicating with the GUI via the existing Unix socket IPC
- Add an **inline comment UI** in the frontend: text selection → 💬 button → comment form, plus click-to-comment on Mermaid/code blocks
- Add a **chat panel** at the bottom of the document to display the conversation (user comments + Claude replies)
- Add a **sidebar toggle** (◀ in sidebar header, ▶ to reopen) to hide/show the sidebar, with state persisted in localStorage
- Add a **refresh button** (↻) to manually re-render the active document
- Extend the **IPC protocol** with persistent subscriber connections, session-based routing, and reply forwarding
- Add an **`open_file` MCP tool** so Claude opens files via the channel instead of shelling out to the CLI
- Add a **`reply` MCP tool** so Claude can respond in the Reader
- **Multi-session routing** via session IDs to ensure comments reach the correct Claude Code session

## Capabilities

### New Capabilities
- `mcp-channel`: TypeScript MCP channel bridge — stdio communication with Claude Code, Unix socket communication with the GUI, session ID management, `open_file` and `reply` tools
- `inline-comments-ui`: Frontend comment UI — text selection commenting, Mermaid/code block commenting, chat panel, comment payload construction, sidebar toggle
- `ipc-subscriptions`: IPC protocol extensions — persistent subscriber connections with session IDs, targeted comment routing, reply forwarding, subscriber cleanup

### Modified Capabilities
<!-- No existing specs to modify — this is a greenfield feature on an existing codebase -->

## Impact

- **New files:** `channel/markdown-reader-channel.ts`, `channel/package.json`, `frontend/comments.js`
- **Modified Rust:** `ipc.rs` (persistent subscriptions + routing), `commands.rs` (new `send_comment` command), `lib.rs` (register command, emit Tauri events), `main.rs` (`--mcp` flag handling)
- **Modified Frontend:** `renderer.js` (`data-source` attributes on blocks), `main.js` (wire comments module, listen for replies, sidebar toggle), `styles.css` (comment UI + chat panel + chat input area styles, sidebar toggle, font smoothing, `position: fixed` for comment elements)
- **New dependency:** `@modelcontextprotocol/sdk` (TypeScript, for channel bridge only)
- **Config:** `.mcp.json` (project-level) or `~/.claude.json` (global) to declare the channel server
- **Claude Code launch:** requires `--channels server:markdown-reader` (or `--dangerously-load-development-channels` during research preview)
