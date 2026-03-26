## ADDED Requirements

### Requirement: Channel declares claude/channel capability
The channel server SHALL declare `capabilities.experimental['claude/channel']` and `capabilities.tools` in its MCP Server constructor so Claude Code registers it as a two-way channel.

#### Scenario: Claude Code discovers the channel
- **WHEN** Claude Code spawns the channel process
- **THEN** the channel responds to MCP initialization with `claude/channel` and `tools` capabilities declared

### Requirement: Channel generates a unique session ID
The channel SHALL generate a UUID v4 session ID at startup. This ID SHALL be used for all communication with the Reader GUI to identify this session.

#### Scenario: Two channel instances have different session IDs
- **WHEN** two Claude Code sessions each spawn a channel process
- **THEN** each channel has a distinct session ID

### Requirement: Channel subscribes to Reader via Unix socket
The channel SHALL connect to the Reader GUI's Unix socket at `$XDG_RUNTIME_DIR/md-reader-ws-{N}.sock` and send `subscribe:{session_id}\n` to register as a persistent subscriber.

#### Scenario: Channel subscribes successfully
- **WHEN** the channel starts and the Reader GUI is running on the current workspace
- **THEN** the channel connects to the socket and sends `subscribe:{session_id}\n`
- **THEN** the connection remains open for bidirectional communication

#### Scenario: Reader GUI is not running
- **WHEN** the channel starts and no Reader GUI is running on the current workspace
- **THEN** the channel launches a Reader GUI instance before subscribing

#### Scenario: Orphaned socket file exists
- **WHEN** the channel starts and a socket file exists but the Reader is not responsive (ping fails)
- **THEN** the channel removes the orphaned socket, launches a new Reader instance, and waits up to 5 seconds for it to become responsive via ping polling

### Requirement: Channel uses ping-based health check
The channel SHALL verify the Reader is responsive by connecting to the socket and performing a `__ping__`/`__pong__` handshake, rather than only checking socket file existence. This handles orphaned sockets from crashed Reader instances.

#### Scenario: Ping succeeds
- **WHEN** the channel connects to the socket and sends `__ping__`
- **THEN** the Reader responds with `__pong__`
- **THEN** the channel proceeds to subscribe

#### Scenario: Ping fails (orphaned socket)
- **WHEN** the channel connects to the socket and sends `__ping__` but gets no `__pong__` response
- **THEN** the channel deletes the orphaned socket file
- **THEN** the channel launches a new Reader instance

### Requirement: Channel uses lazy reconnect on next open_file
When the persistent subscriber connection drops, the channel SHALL NOT auto-reconnect or auto-relaunch the Reader. Instead, it SHALL set `socketReady=false` and `socket=null`. The next `sendToSocket()` call (triggered by an `open_file` tool invocation) SHALL call `connectAndSubscribe()`, which includes `ensureReaderRunning` to relaunch the Reader if needed.

#### Scenario: Reader exits while channel is running
- **WHEN** the Reader process exits and the subscriber connection closes
- **THEN** the channel sets `socketReady=false` and `socket=null`
- **THEN** no reconnect attempt is made

#### Scenario: Claude calls open_file after Reader was closed
- **WHEN** Claude calls `open_file` and the socket is not connected
- **THEN** `sendToSocket()` calls `connectAndSubscribe()`
- **THEN** `ensureReaderRunning` relaunches the Reader if needed
- **THEN** the channel re-subscribes and sends the open command

### Requirement: Channel provides open_file tool
The channel SHALL expose an MCP tool `open_file` with a required `path` parameter (string, absolute path). When called, the channel SHALL send `open:{session_id}:{path}\n` over the Unix socket.

#### Scenario: Claude opens a file
- **WHEN** Claude calls `open_file` with path `/home/user/docs/plan.md`
- **THEN** the channel sends `open:{session_id}:/home/user/docs/plan.md\n` to the Reader
- **THEN** the Reader opens the file in a new tab tagged with the session ID
- **THEN** the tool returns a success result

### Requirement: Channel provides reply tool
The channel SHALL expose an MCP tool `reply` with required parameters `session_id` (string) and `text` (string, supports markdown). When called, the channel SHALL send `reply:{session_id}:{json}\n` over the Unix socket.

#### Scenario: Claude replies to a comment
- **WHEN** Claude calls `reply` with session_id and text
- **THEN** the channel sends `reply:{session_id}:{"text":"..."}\n` to the Reader
- **THEN** the tool returns a success result

### Requirement: Channel forwards comments as notifications
The channel SHALL listen for `comment:{json}\n` messages on the persistent socket connection. When received, it SHALL emit a `notifications/claude/channel` event with the comment content and metadata.

#### Scenario: User comments on text
- **WHEN** the Reader sends `comment:{"file":"/path/file.md","session_id":"abc","heading":"## Arch","selected_text":"some text","content_type":"text","comment":"Add diagram"}\n`
- **THEN** the channel emits a notification with `content: "Add diagram"` and `meta: { file, heading, selected_text, content_type, session_id }`

#### Scenario: User comments on a Mermaid block
- **WHEN** the Reader sends a comment with `content_type: "mermaid"` and `selected_text` containing Mermaid source
- **THEN** the channel emits a notification with all metadata including the Mermaid source

### Requirement: Channel uses lazy connect at startup
The channel SHALL NOT connect to the Reader socket at startup. Instead, it SHALL wait for the first `open_file` tool call. The `sendToSocket()` function SHALL auto-connect by calling `connectAndSubscribe()` when the socket is not connected.

#### Scenario: Channel starts without connecting
- **WHEN** the channel process starts and MCP initialization completes
- **THEN** no socket connection is established
- **THEN** the channel waits for tool invocations

#### Scenario: First open_file triggers connection
- **WHEN** Claude calls `open_file` for the first time
- **THEN** `sendToSocket()` detects no active socket
- **THEN** it calls `connectAndSubscribe()` which ensures the Reader is running and subscribes

### Requirement: Channel provides instructions for Claude
The channel SHALL include an `instructions` string in its Server constructor that tells Claude how to interpret channel events and how to reply.

#### Scenario: Claude receives instructions at session start
- **WHEN** Claude Code initializes the channel
- **THEN** Claude's system prompt includes instructions explaining the `<channel source="markdown-reader">` tag format and the `reply` tool usage
