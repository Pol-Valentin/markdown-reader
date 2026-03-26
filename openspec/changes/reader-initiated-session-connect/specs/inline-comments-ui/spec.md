## MODIFIED Requirements

### Requirement: Chat panel displays conversation
A collapsible chat panel SHALL appear at the bottom of `#main` on ALL tabs (not only commentable ones). On non-connected tabs, it shows the session selector. On connected tabs, it shows the full conversation thread + selector.

#### Scenario: Non-commentable tab
- **WHEN** user views a tab without a session_id
- **THEN** the chat panel is visible with the session selector
- **THEN** the chat input is disabled
- **THEN** the 💬 button does not appear on text selection

#### Scenario: Commentable tab
- **WHEN** user views a tab with a session_id
- **THEN** the chat panel shows the selector (pre-selected) + conversation + input

#### Scenario: No sessions available on any tab
- **WHEN** no Claude Code sessions are connected
- **THEN** the chat panel shows "Aucune session Claude active" with disabled selector
