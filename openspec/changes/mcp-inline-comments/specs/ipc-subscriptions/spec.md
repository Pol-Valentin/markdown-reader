## ADDED Requirements

### Requirement: IPC server accepts subscriber connections
The IPC server SHALL accept `subscribe:{session_id}\n` messages. When received, the connection SHALL be kept open and registered in a session-to-stream map.

#### Scenario: Channel subscribes
- **WHEN** a client sends `subscribe:a1b2c3\n`
- **THEN** the connection is kept open and registered as subscriber for session `a1b2c3`

#### Scenario: Duplicate session ID subscription
- **WHEN** a client subscribes with a session ID that already has an active subscriber
- **THEN** the old subscriber is replaced by the new one

### Requirement: IPC server handles session-tagged file opens
The IPC server SHALL accept `open:{session_id}:{path}\n` messages. When received, the file SHALL be opened in a new tab tagged with the session ID.

#### Scenario: Channel opens a file with session tag
- **WHEN** the IPC server receives `open:a1b2c3:/home/user/docs/plan.md\n`
- **THEN** the Reader opens `/home/user/docs/plan.md` in a new tab
- **THEN** the tab is tagged with `session_id: "a1b2c3"` and is commentable

#### Scenario: Existing plain path open still works
- **WHEN** the IPC server receives `/home/user/docs/file.md\n` (no prefix)
- **THEN** the file opens in a tab with no session ID (not commentable)

### Requirement: Comments are routed to the correct subscriber
When the GUI receives a comment via `send_comment`, it SHALL serialize the comment as JSON and send `comment:{json}\n` only to the subscriber matching the comment's session ID.

#### Scenario: Comment routed to correct session
- **WHEN** a comment with `session_id: "a1b2c3"` is submitted
- **THEN** `comment:{json}\n` is sent only to the subscriber registered as `a1b2c3`
- **THEN** other subscribers do not receive the comment

#### Scenario: No matching subscriber
- **WHEN** a comment is submitted but the subscriber for that session has disconnected
- **THEN** the comment is silently dropped

### Requirement: Subscriber read loop handles both open: and reply: messages
The persistent subscriber connection read loop SHALL handle both `open:{session_id}:{path}` and `reply:{session_id}:{json}` messages. Since the channel sends all messages (subscribe, open, reply) on the same persistent connection, the read loop MUST dispatch both message types — not only `reply:`.

#### Scenario: Channel sends open: on subscriber connection
- **WHEN** a subscriber connection receives `open:a1b2c3:/home/user/docs/plan.md\n`
- **THEN** the IPC server opens the file in a new tab tagged with session `a1b2c3`

#### Scenario: Channel sends reply: on subscriber connection
- **WHEN** a subscriber connection receives `reply:a1b2c3:{"text":"Done"}\n`
- **THEN** the IPC server emits the `claude-reply` Tauri event

### Requirement: IPC server forwards replies to the GUI
The IPC server SHALL accept `reply:{session_id}:{json}\n` messages from subscribers. When received, it SHALL emit a Tauri event `claude-reply` with the reply payload so the frontend can display it.

#### Scenario: Claude reply forwarded to frontend
- **WHEN** a subscriber sends `reply:a1b2c3:{"text":"Done, added the diagram"}\n`
- **THEN** a Tauri event `claude-reply` is emitted with `{ session_id: "a1b2c3", text: "Done, added the diagram" }`

### Requirement: Subscriber cleanup on disconnect
When a subscriber connection is broken (pipe error, EOF), the IPC server SHALL remove it from the session map.

#### Scenario: Channel process exits
- **WHEN** the channel process exits and the socket connection breaks
- **THEN** the subscriber is removed from the session map
- **THEN** tabs tagged with that session ID remain open but are no longer commentable

### Requirement: Tauri command send_comment
A new Tauri command `send_comment` SHALL accept a comment payload (file, session_id, heading, selected_text, content_type, comment) and route it to the matching IPC subscriber.

#### Scenario: Frontend sends comment
- **WHEN** the frontend calls `invoke('send_comment', payload)`
- **THEN** the Rust command serializes the payload and sends it to the correct subscriber via the IPC session map
