## Context

The Markdown Reader is a Tauri v2 app (Rust backend + vanilla JS frontend) for Linux/GNOME/Wayland. It currently supports CLI-based file opening, multi-instance per workspace via Unix sockets, live reload, and full Markdown rendering (GFM, Mermaid, syntax highlighting, KaTeX).

Claude Code recently shipped Channels (research preview, v2.1.80+): MCP servers that push events into a Claude Code session via stdio. Channels support one-way (alerts) and two-way (chat bridges with reply tools) communication.

Currently, when Claude Code opens a Markdown file in the Reader, it shells out via Bash. There is no return path — the user must switch to the terminal to give feedback.

## Goals / Non-Goals

**Goals:**
- Seamless inline feedback: user comments on rendered Markdown, Claude receives it with positional context
- Two-way conversation: Claude can reply back, visible in a chat panel in the Reader
- Multi-session safety: multiple Claude Code sessions can coexist, comments route to the correct one
- Replace the Bash shell-out with a proper MCP `open_file` tool

**Non-Goals:**
- Batch/queued comments — single immediate send only
- Persistent conversation history across Reader restarts
- Permission relay (approving Claude tool use from the Reader)
- Commenting on non-Markdown content
- Porting the channel bridge to Rust (TypeScript MVP, Rust later if needed)

## Decisions

### 1. Claude Code Channel over custom MCP HTTP server

**Decision:** Use the Claude Code Channels protocol (stdio MCP with `claude/channel` capability) instead of embedding an HTTP MCP server in Tauri.

**Rationale:** Channels are purpose-built for pushing events into Claude Code sessions. Stdio transport means no port management, no discovery files. The MCP SDK handles protocol compliance. Claude Code spawns and manages the process lifecycle.

**Alternatives considered:**
- HTTP MCP server in Tauri (Rust): more complex, port discovery needed, no official Rust MCP SDK
- HTTP MCP server as sidecar: extra process without the benefits of the Channels protocol

### 2. TypeScript channel bridge, not Rust

**Decision:** The channel bridge is a TypeScript script using `@modelcontextprotocol/sdk`, not integrated into the Rust binary.

**Rationale:** The MCP SDK for TypeScript is mature and officially supported. The channel is ~120 lines. The project already has Node.js (esbuild). A Rust implementation would mean either finding an immature crate or implementing JSON-RPC stdio from scratch.

**Trade-off:** Adds a Bun/Node.js runtime dependency for the channel (the shebang uses `#!/usr/bin/env bun`). Acceptable since a JS runtime is already required for the build toolchain.

### 3. Session ID routing via existing Unix socket

**Decision:** Each channel process generates a UUID session ID at startup. It subscribes to the Reader's IPC socket with `subscribe:{session_id}`. Files opened via MCP are tagged with the session ID. Comments are routed only to the matching subscriber.

**Rationale:** Multiple Claude Code sessions can be open simultaneously (different terminals, different workspaces). Broadcasting comments to all sessions would be incorrect. Session IDs create a clean ownership model: the session that opened the file receives its comments.

**Alternatives considered:**
- Separate socket per channel: complex, breaks the single-socket-per-workspace model
- PID-based routing: fragile if processes restart

### 4. IPC protocol extension (not replacement)

**Decision:** Extend the existing line-based IPC protocol with new message types (`subscribe:`, `open:`, `reply:`, `comment:`) rather than switching to a structured protocol (JSON-RPC, protobuf).

**Rationale:** The current protocol is simple line-based text. Adding prefixed message types keeps it simple and backwards-compatible. The existing `ping`/`pong` and path-based open continue to work unchanged. A full protocol switch would be over-engineering for 4 new message types.

### 5. Chat panel at bottom, not inline annotations

**Decision:** Claude's replies appear in a collapsible chat panel at the bottom of the document, not as inline annotations near the commented text.

**Rationale:** Inline annotations would require tracking comment positions through document re-renders (live reload changes the DOM). A bottom panel is simpler, always visible, and doesn't interfere with document layout. The chat metaphor is familiar.

### 6. Ping-based health check over file existence check

**Decision:** `ensureReaderRunning` in the channel uses a `pingSocket()` function (connect, send `__ping__`, expect `__pong__`) instead of `existsSync(socketPath)` to determine if the Reader is alive.

**Rationale:** A socket file can remain on disk after the Reader crashes (orphaned socket). `existsSync` would return true even though no process is listening. A proper ping/pong handshake confirms the Reader is actually responsive. If the ping fails, the channel cleans up the orphaned socket and launches a fresh Reader instance, waiting up to 5 seconds for it to become responsive.

### 7. Eager connect at startup + reconnect without relaunch

**Decision:** The channel calls `tryReconnectWithoutRelaunch()` at startup and on socket close. This function polls for the Reader's socket every 5 seconds indefinitely, without launching a new Reader instance and without a maximum attempt limit. If the Reader is already running at startup, the channel connects immediately.

**Rationale:** Eager connect at startup means comments can flow as soon as the Reader is available, without waiting for an `open_file` call. On socket close, the channel reconnects automatically when the Reader comes back, but never relaunches it — respecting the user's intent if they closed the Reader. The indefinite polling is acceptable because the channel is a long-lived process tied to the Claude Code session.

### 8. Chat panel visible on all tabs with session selector

**Decision:** The chat panel is visible on ALL tabs (not just commentable ones) and includes a session selector dropdown (`<select class="session-select">`) in its header. The dropdown lists active sessions as `{cwd} ({session_id_short}) — il y a X min`. Users can connect any tab to any active session. The chat input is disabled when no session is selected. The panel includes a `.chat-resizer` drag bar for height adjustment (80px–600px), persisted in localStorage. The comment form and chat input both include a submit button (➤) alongside Enter-to-send. The panel is appended to `#main` (not inside `#content-scroll`) to avoid scroll interference.

**Rationale:** Making the chat panel visible on all tabs allows users to interact with Claude from any context, not just from tabs opened via MCP. The session selector gives users explicit control over which Claude Code session receives their messages, which is clearer than implicit session-per-tab routing. Disabling input when no session is selected prevents confusion. The submit button improves discoverability — not all users know they can press Enter to send.

## Risks / Trade-offs

- **Channels are in research preview** → Custom channels require `--dangerously-load-development-channels` flag. Risk: API may change before GA. Mitigation: the channel is thin (~120 lines), easy to adapt.
- **Bun/Node.js runtime dependency** → Users need Bun (or Node) installed to use the comment feature. Mitigation: a JS runtime is already required for building the project. The channel could be bundled as a single file later.
- **Unix socket protocol is not versioned** → Adding new message types could confuse older Reader versions. Mitigation: unknown messages are already ignored by the current IPC handler.
- **Session ID lost on Reader restart** → If the Reader restarts, subscriber connections drop and tabs lose their session tags. Mitigation: Claude Code can re-open files via `open_file` to re-establish the session. Acceptable for MVP.
- **Channel polls indefinitely on reconnect** → If the Reader is closed, the channel polls every 5 seconds indefinitely without relaunching. This is a lightweight operation (socket existence check + ping) and acceptable for a long-lived process. The channel reconnects automatically when the Reader becomes available again.
