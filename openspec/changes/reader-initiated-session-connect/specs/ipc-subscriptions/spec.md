## MODIFIED Requirements

### Requirement: IPC server accepts subscriber connections
The IPC server SHALL accept `subscribe:{session_id}\n` or `subscribe:{session_id}:{json}\n` messages. When received, the connection SHALL be kept open, the subscriber registered in the subscriber map, and the session info added to the session registry. The JSON metadata is optional; if absent, defaults are used (empty cwd, current timestamp).

#### Scenario: Channel subscribes with metadata
- **WHEN** a client sends `subscribe:a1b2c3:{"cwd":"/home/user/project","connected_at":1774520000000}\n`
- **THEN** the connection is kept open and registered as subscriber for session `a1b2c3`
- **THEN** the session registry is updated with cwd and connected_at
- **THEN** a `sessions-changed` Tauri event is emitted

#### Scenario: Channel subscribes without metadata
- **WHEN** a client sends `subscribe:a1b2c3\n`
- **THEN** the connection is kept open and registered as subscriber for session `a1b2c3`
- **THEN** the session registry is updated with empty cwd and current timestamp

#### Scenario: Duplicate session ID subscription
- **WHEN** a client subscribes with a session ID that already has an active subscriber
- **THEN** the old subscriber is replaced by the new one
- **THEN** the session registry is updated with the new metadata

### Requirement: Subscriber cleanup on disconnect
When a subscriber connection is broken (pipe error, EOF), the IPC server SHALL remove it from the subscriber map AND from the session registry, then emit a `sessions-changed` Tauri event.

#### Scenario: Channel process exits
- **WHEN** the channel process exits and the socket connection breaks
- **THEN** the subscriber is removed from the subscriber map
- **THEN** the session is removed from the session registry
- **THEN** a `sessions-changed` Tauri event is emitted
