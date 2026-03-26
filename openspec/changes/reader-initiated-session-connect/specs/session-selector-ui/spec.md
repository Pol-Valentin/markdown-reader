## ADDED Requirements

### Requirement: Session selector in chat panel header
The chat panel SHALL display a `<select>` dropdown in its header on all tabs (commentable or not). The selector lists active Claude Code sessions.

#### Scenario: Sessions available
- **WHEN** one or more sessions are active
- **THEN** the selector lists each session as `{cwd} ({session_id_short}) — il y a X min` where `session_id_short` is the first 8 characters of the session UUID
- **THEN** the cwd is displayed with `~` replacing the home directory

#### Scenario: No sessions available
- **WHEN** no sessions are active
- **THEN** the selector is disabled
- **THEN** a message "Aucune session Claude active" is displayed

#### Scenario: Tab already connected
- **WHEN** the active tab has a session_id (opened via `open_file` or previously selected)
- **THEN** the selector shows that session as pre-selected

### Requirement: Selecting a session connects the tab
When the user selects a session from the dropdown, the active tab SHALL become commentable with that session_id. The 💬 button and inline comment UI SHALL activate.

#### Scenario: User selects a session on an unconnected tab
- **WHEN** user selects a session from the dropdown
- **THEN** the tab's session_id is set to the selected session
- **THEN** the tab becomes commentable
- **THEN** the 💬 button appears on text selection

#### Scenario: User changes session on a connected tab
- **WHEN** user selects a different session from the dropdown on a tab already connected
- **THEN** the tab's session_id is updated
- **THEN** the chat messages are cleared (previous messages belonged to the other session)

### Requirement: Chat panel visible on all tabs
The chat panel SHALL be visible on all tabs, not only commentable ones. On non-connected tabs, it shows the session selector with an invitation to connect.

#### Scenario: Non-commentable tab
- **WHEN** user views a tab without a session_id
- **THEN** the chat panel is visible with the session selector
- **THEN** the chat input is disabled until a session is selected

### Requirement: Session list updates dynamically
The session selector SHALL update when sessions connect or disconnect, by listening to the `sessions-changed` Tauri event.

#### Scenario: New session connects while Reader is open
- **WHEN** a new Claude Code session starts and its channel subscribes
- **THEN** the session appears in the selector without manual refresh

#### Scenario: Session disconnects while tab is connected to it
- **WHEN** the session a tab is connected to disconnects
- **THEN** the session is removed from the selector
- **THEN** the tab reverts to non-commentable state
- **THEN** the chat panel shows the selector with no pre-selection
