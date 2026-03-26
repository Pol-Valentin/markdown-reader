## ADDED Requirements

### Requirement: IPC server parses subscribe metadata
The IPC server SHALL accept `subscribe:{session_id}:{json}\n` where `{json}` contains `cwd` (string) and `connected_at` (number, unix timestamp ms). The JSON part is optional for rétrocompatibilité — if absent, cwd defaults to empty string and connected_at to current time.

#### Scenario: Channel subscribes with metadata
- **WHEN** the IPC server receives `subscribe:abc123:{"cwd":"/home/user/project","connected_at":1774520000000}\n`
- **THEN** the subscriber is registered with session_id `abc123`, cwd `/home/user/project`, connected_at `1774520000000`

#### Scenario: Channel subscribes without metadata (rétrocompat)
- **WHEN** the IPC server receives `subscribe:abc123\n` (no JSON)
- **THEN** the subscriber is registered with session_id `abc123`, cwd `""`, connected_at set to current time

### Requirement: SessionRegistry maintains active sessions
A `SessionRegistry` SHALL maintain a map of active sessions with their metadata (session_id, cwd, connected_at). Sessions SHALL be added on subscribe and removed on disconnect.

#### Scenario: Session added on subscribe
- **WHEN** a channel subscribes with session_id and metadata
- **THEN** the session is added to the registry

#### Scenario: Session removed on disconnect
- **WHEN** a subscriber connection closes
- **THEN** the session is removed from the registry

### Requirement: Tauri command get_sessions
A Tauri command `get_sessions` SHALL return the list of active sessions from the registry as `Vec<SessionInfo>` where `SessionInfo = { session_id, cwd, connected_at }`.

#### Scenario: Frontend queries sessions
- **WHEN** the frontend calls `invoke('get_sessions')`
- **THEN** it receives the list of currently active sessions with their metadata

### Requirement: Tauri event sessions-changed
The Reader SHALL emit a Tauri event `sessions-changed` whenever a session is added or removed from the registry.

#### Scenario: New session connects
- **WHEN** a channel subscribes
- **THEN** a `sessions-changed` event is emitted

#### Scenario: Session disconnects
- **WHEN** a subscriber connection closes
- **THEN** a `sessions-changed` event is emitted
