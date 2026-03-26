## ADDED Requirements

### Requirement: Text selection triggers comment button
When the user selects text in the rendered content of a commentable tab, a floating 💬 button SHALL appear near the selection. The button uses `position: fixed` and is appended to `document.body` (not inside `#content-scroll`) to avoid scroll-related positioning issues.

#### Scenario: User selects text on a commentable tab
- **WHEN** user selects text in `#content` on a tab with a session ID
- **THEN** a floating 💬 button appears near the selection endpoint, positioned using viewport coordinates

#### Scenario: User selects text on a non-commentable tab
- **WHEN** user selects text on a tab opened manually (no session ID)
- **THEN** no 💬 button appears

#### Scenario: User clears selection
- **WHEN** user clicks elsewhere or presses Escape
- **THEN** the 💬 button disappears

### Requirement: Mermaid and code block click triggers comment button
When the user clicks on a Mermaid diagram or a syntax-highlighted code block on a commentable tab, the block SHALL be highlighted and a 💬 button SHALL appear.

#### Scenario: User clicks a Mermaid diagram
- **WHEN** user clicks on a rendered Mermaid diagram on a commentable tab
- **THEN** the diagram gets a highlight border and a 💬 button appears

#### Scenario: User clicks a code block
- **WHEN** user clicks on a syntax-highlighted code block on a commentable tab
- **THEN** the block gets a highlight border and a 💬 button appears

#### Scenario: User clicks outside
- **WHEN** user clicks outside the highlighted block
- **THEN** the highlight and 💬 button disappear

### Requirement: Comment form opens on button click
When the user clicks the 💬 button, a comment form SHALL appear with a single `<input type="text">`. The form uses `position: fixed` and is appended to `document.body`. Pressing Enter sends the comment. There is no submit button.

#### Scenario: User opens comment form
- **WHEN** user clicks the 💬 button
- **THEN** a form appears with a single text input positioned below the selection or block using viewport coordinates

#### Scenario: User submits via Enter
- **WHEN** user types a comment and presses Enter
- **THEN** the comment is submitted

#### Scenario: User dismisses form
- **WHEN** user clicks outside the form or presses Escape
- **THEN** the form disappears

### Requirement: Comment submission sends payload via Tauri invoke
When the user submits a comment, the frontend SHALL call `invoke('send_comment', payload)` with the comment payload including file, session_id, heading, selected_text, content_type, and comment.

#### Scenario: User submits a text comment
- **WHEN** user types "Add a diagram here" and presses Enter
- **THEN** `invoke('send_comment', { file: "/path/file.md", session_id: "abc", heading: "## Architecture", selected_text: "the passage", content_type: "text", comment: "Add a diagram here" })` is called
- **THEN** the comment appears in the chat panel
- **THEN** the form disappears

#### Scenario: User submits a comment on a Mermaid block
- **WHEN** user comments on a Mermaid block
- **THEN** the payload includes `content_type: "mermaid"` and `selected_text` contains the Mermaid source code

### Requirement: Nearest heading is resolved for context
The comment payload SHALL include the text of the nearest preceding heading (h1-h6) as context.

#### Scenario: Comment under a heading
- **WHEN** user comments on text that appears after an `<h2>Architecture</h2>` heading
- **THEN** the payload `heading` field is `"## Architecture"`

#### Scenario: Comment with no preceding heading
- **WHEN** user comments on text before any heading in the document
- **THEN** the payload `heading` field is empty string

### Requirement: Renderer stores source on blocks
The Markdown renderer SHALL store the original source code in a `data-source` attribute on Mermaid container elements and `pre` elements for code blocks.

#### Scenario: Mermaid block has source attribute
- **WHEN** a Mermaid diagram is rendered
- **THEN** its container element has a `data-source` attribute containing the original Mermaid source text

#### Scenario: Code block has source attribute
- **WHEN** a code block is syntax-highlighted
- **THEN** the `pre` element has a `data-source` attribute containing the original code

### Requirement: Chat panel displays conversation
A collapsible chat panel SHALL appear at the bottom of `#main` (not inside `#content-scroll`) on commentable tabs, displaying user comments and Claude replies as a conversation thread. The panel SHALL be hidden by default (`display: none`) and only shown when a commentable tab is active. The panel SHALL include a direct input area at the bottom (textarea + "Envoyer" button) for sending messages without text selection.

#### Scenario: User sends a comment
- **WHEN** a comment is submitted
- **THEN** it appears in the chat panel as a user message (right-aligned) with the heading context and timestamp

#### Scenario: Claude replies
- **WHEN** a `claude-reply` Tauri event is received for the active tab's session
- **THEN** the reply appears in the chat panel as a Claude message (left-aligned) with markdown rendering

#### Scenario: Panel is collapsible
- **WHEN** user clicks the panel header
- **THEN** the panel toggles between collapsed and expanded states

#### Scenario: Unread reply indicator
- **WHEN** a Claude reply arrives while the panel is collapsed
- **THEN** a badge/indicator shows the number of unread replies

#### Scenario: Non-commentable tab
- **WHEN** user views a tab without a session ID
- **THEN** no chat panel is visible

#### Scenario: Chat panel hidden on initial render
- **WHEN** the chat panel is first created via `ensureChatPanel()`
- **THEN** it has `display: none` and is not visible
- **THEN** it becomes visible only when a commentable tab is activated

### Requirement: Chat panel has direct input area
The chat panel SHALL include an input area at the bottom with a single `<input type="text">`, allowing users to send messages directly without selecting text. Pressing Enter sends the message. There is no send button.

#### Scenario: User sends a message from chat input
- **WHEN** user types a message in the chat input and presses Enter
- **THEN** the message is sent as a comment with empty `heading` and `selected_text` fields
- **THEN** the message appears in the chat panel as a user message
- **THEN** the input is cleared

### Requirement: Sidebar can be hidden and shown
A ◀ toggle button SHALL be displayed in the sidebar header. Clicking it hides the sidebar by adding `body.sidebar-hidden` class, which hides `#sidebar` and `#sidebar-resizer` with `display: none`. When hidden, a ▶ button SHALL appear in the top-left of `#main` to reopen the sidebar. The visibility state SHALL be persisted in localStorage.

#### Scenario: User hides the sidebar
- **WHEN** user clicks the ◀ button in the sidebar header
- **THEN** `body.sidebar-hidden` class is added
- **THEN** `#sidebar` and `#sidebar-resizer` are hidden
- **THEN** a ▶ button appears in the top-left of `#main`
- **THEN** the state is saved to localStorage

#### Scenario: User shows the sidebar
- **WHEN** user clicks the ▶ button while the sidebar is hidden
- **THEN** `body.sidebar-hidden` class is removed
- **THEN** `#sidebar` and `#sidebar-resizer` become visible
- **THEN** the ▶ button is hidden
- **THEN** the state is saved to localStorage

#### Scenario: State persisted across sessions
- **WHEN** the user reopens the Reader
- **THEN** the sidebar visibility is restored from localStorage

### Requirement: Manual refresh button
A ↻ button SHALL be displayed at a fixed position (bottom-right of `#main`, next to the ⇔ width toggle). Clicking it re-renders the active tab's content by re-reading the file from disk.

#### Scenario: User clicks refresh
- **WHEN** user clicks the ↻ button while a tab is active
- **THEN** the file content is re-read from disk and re-rendered

#### Scenario: No active tab
- **WHEN** user clicks the ↻ button with no tab open
- **THEN** nothing happens

### Requirement: Chat panel is resizable in height
The chat panel SHALL include a `.chat-resizer` drag bar at its top edge. Users SHALL be able to drag the resizer to adjust the messages area height between 80px and 600px. The height SHALL be persisted in localStorage.

#### Scenario: User drags resizer
- **WHEN** user drags the `.chat-resizer` bar upward or downward
- **THEN** the chat messages area height adjusts accordingly
- **THEN** the height is clamped between 80px minimum and 600px maximum

#### Scenario: Height persisted across sessions
- **WHEN** the user resizes the chat panel and reopens the Reader
- **THEN** the chat panel height is restored from localStorage

#### Scenario: Default height
- **WHEN** no height is stored in localStorage
- **THEN** the chat panel uses a reasonable default height
