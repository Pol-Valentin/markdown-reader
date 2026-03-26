## 1. IPC Protocol Extensions (Rust)

- [x] 1.1 Add `subscribe:{session_id}` message handling in `ipc.rs` — keep connection open, store in `HashMap<String, TcpStream>` (session → stream)
- [x] 1.2 Add `open:{session_id}:{path}` message handling — emit Tauri event `open-file` with both path and session_id
- [x] 1.3 Add `reply:{session_id}:{json}` message handling — emit Tauri event `claude-reply` with session_id and text
- [x] 1.4 Add `send_to_subscriber(session_id, message)` method — write `comment:{json}\n` to the matching subscriber stream
- [x] 1.5 Add subscriber cleanup on disconnect — remove from map on broken pipe/EOF
- [x] 1.6 Write tests for new IPC message parsing (subscribe, open, reply)

## 2. Tauri Commands & State (Rust)

- [x] 2.1 Create `Comment` struct (file, session_id, heading, selected_text, content_type, comment) in `commands.rs`
- [x] 2.2 Add `send_comment` Tauri command — takes Comment, routes to matching subscriber via IPC state
- [x] 2.3 Wire IPC subscriber map as Tauri managed state in `lib.rs` (shared `Arc<Mutex<HashMap>>`)
- [x] 2.4 Register `send_comment` command in Tauri builder
- [x] 2.5 Update `open-file` event handling in `lib.rs` to pass session_id to frontend

## 3. Frontend — Tabs & Commentable Flag (JS)

- [x] 3.1 Extend tab data model in `tabs.js` to include optional `session_id` and `commentable` properties
- [x] 3.2 Update `open-file` event listener in `main.js` to set `session_id` on tab when provided
- [x] 3.3 Expose `getActiveTab().session_id` for use by comments module

## 4. Frontend — Renderer Updates (JS)

- [x] 4.1 Add `data-source` attribute on Mermaid container elements with original Mermaid source in `renderer.js`
- [x] 4.2 Add `data-source` attribute on `pre` elements with original code in `renderer.js`

## 5. Frontend — Comment UI (JS)

- [x] 5.1 Create `frontend/comments.js` module with exports: `initComments(contentEl, getActiveTab)`
- [x] 5.2 Implement text selection → floating 💬 button (mouseup listener, positioned near selection)
- [x] 5.3 Implement Mermaid/code block click → highlight border + 💬 button
- [x] 5.4 Implement comment form (single `<input type="text">`, Enter to send, no button), positioned below selection/block
- [x] 5.5 Implement nearest heading resolution — walk DOM backwards to find closest h1-h6
- [x] 5.6 Implement comment submission — build payload, call `invoke('send_comment')`, dismiss form
- [x] 5.7 Implement dismiss on click-outside and Escape key
- [x] 5.8 Only show comment UI when `getActiveTab().commentable === true`

## 6. Frontend — Chat Panel (JS)

- [x] 6.1 Add chat panel HTML structure in `comments.js` — collapsible panel at bottom of `#main` (not `#content-scroll`), with direct input area (single `<input type="text">`, Enter to send, no button)
- [x] 6.2 Implement `appendUserComment(payload)` — display user message (right-aligned) with heading context and timestamp
- [x] 6.3 Implement `appendClaudeReply(payload)` — display Claude message (left-aligned) with basic markdown rendering
- [x] 6.4 Listen for `claude-reply` Tauri event in `main.js`, forward to chat panel
- [x] 6.5 Implement collapse/expand toggle on panel header
- [x] 6.6 Implement unread reply badge when panel is collapsed
- [x] 6.7 Auto-scroll to latest message on new comment/reply
- [x] 6.8 Hide chat panel on non-commentable tabs

## 7. Frontend — Styles (CSS)

- [x] 7.1 Add styles for floating 💬 button (positioned, hover state)
- [x] 7.2 Add styles for comment form (text input, positioning)
- [x] 7.3 Add styles for block highlight border (Mermaid/code)
- [x] 7.4 Add styles for chat panel (collapsible, user vs Claude messages, timestamp, badge)
- [x] 7.5 Add dark/light theme support for all new elements
- [x] 7.6 Add font smoothing to body (antialiased, optimizeLegibility)
- [x] 7.7 Remove `position: relative` from `#content-scroll` to fix rendering artifacts
- [x] 7.8 Use `position: fixed` for comment button and form (appended to `document.body`)
- [x] 7.9 Add chat input area styles (`.chat-input-area`, `.chat-input`)
- [x] 7.10 Add chat resizer styles (`.chat-resizer`, `.chat-resizer.dragging`)
- [x] 7.11 Add sidebar toggle button styles (☰ button, fixed bottom-right, next to ⇔ width toggle)
- [x] 7.12 Add `body.sidebar-hidden` styles — hide `#sidebar` and `#sidebar-resizer` with `display: none`

## 7b. Frontend — Sidebar Toggle (JS)

- [x] 7b.1 Add ☰ toggle button (fixed position, bottom-right, next to ⇔ width toggle)
- [x] 7b.2 Toggle `body.sidebar-hidden` class on click — hides `#sidebar` and `#sidebar-resizer` with `display: none`
- [x] 7b.3 Persist sidebar visibility state in localStorage
- [x] 7b.4 Restore sidebar visibility state on page load

## 8. Channel MCP Bridge (TypeScript)

- [x] 8.1 Create `channel/package.json` with `@modelcontextprotocol/sdk` dependency
- [x] 8.2 Create `channel/markdown-reader-channel.ts` — MCP Server with `claude/channel` + `tools` capabilities and instructions
- [x] 8.3 Implement session ID generation (UUID v4) and workspace socket discovery
- [x] 8.4 Implement Unix socket connection + `subscribe:{session_id}` on startup
- [x] 8.5 Implement `open_file` tool handler — send `open:{session_id}:{path}` over socket
- [x] 8.6 Implement `reply` tool handler — send `reply:{session_id}:{json}` over socket
- [x] 8.7 Implement incoming `comment:{json}` listener — emit `notifications/claude/channel` to Claude Code
- [x] 8.8 Handle Reader GUI not running — launch it before subscribing (via `ensureReaderRunning`)
- [x] 8.9 Lazy connect: don't connect at startup, wait for first `open_file` call (`sendToSocket()` auto-connects)
- [x] 8.10 No auto-reconnect on socket close — just set `socketReady=false` and `socket=null`

## 9. Integration & Wiring

- [x] 9.1 Import and initialize comments module in `main.js`
- [x] 9.2 Add `--mcp` flag handling in `main.rs` — if present, exec the channel TS script instead of launching GUI
- [x] 9.3 Add `.mcp.json` example in project root for Claude Code configuration (can also be configured globally in `~/.claude.json`)
- [x] 9.4 Update esbuild config if needed to bundle `comments.js`
- [x] 9.5 Run `npm install` in `channel/` directory setup

## 10. Manual Testing & Validation

- [ ] 10.1 Test: open file via MCP tool → tab is commentable, chat panel visible
- [ ] 10.2 Test: select text → 💬 → comment → appears in Claude Code session
- [ ] 10.3 Test: click Mermaid block → 💬 → comment → includes Mermaid source
- [ ] 10.4 Test: Claude replies → reply appears in chat panel
- [ ] 10.5 Test: two Claude Code sessions → comments route to correct session
- [ ] 10.6 Test: manually opened file → no comment UI, no chat panel
- [ ] 10.7 Test: channel disconnects → tabs lose commentable status

> **Note:** Manual testing tasks require building the app (`npx tauri build`) and running with `claude --dangerously-load-development-channels server:markdown-reader`. To be done when ready for integration testing.
