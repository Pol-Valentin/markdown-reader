## ADDED Requirements

### Requirement: Ctrl+V sends clipboard as comment when text is selected
When the user presses Ctrl+V while text is selected in `#content` on a commentable tab, the clipboard content SHALL be sent as a comment with the selected text and heading as context.

#### Scenario: User pastes on selected text
- **WHEN** user has text selected in `#content` on a commentable tab
- **AND** presses Ctrl+V
- **THEN** the clipboard text is read via `navigator.clipboard.readText()`
- **THEN** a comment is sent with `comment = clipboard text`, `selected_text = selection`, `heading = nearest heading`
- **THEN** the comment appears in the chat panel
- **THEN** the selection is cleared

#### Scenario: No selection active
- **WHEN** user presses Ctrl+V without any text selected in `#content`
- **THEN** nothing happens (default browser behavior)

#### Scenario: Tab not commentable
- **WHEN** user presses Ctrl+V with text selected on a non-commentable tab
- **THEN** nothing happens (default browser behavior)

#### Scenario: Comment form is open
- **WHEN** user presses Ctrl+V while the comment form input is focused
- **THEN** the paste goes into the input field (normal behavior, no auto-send)

#### Scenario: Chat input is focused
- **WHEN** user presses Ctrl+V while the chat input is focused
- **THEN** the paste goes into the chat input (normal behavior, no auto-send)

#### Scenario: Empty clipboard
- **WHEN** user presses Ctrl+V with text selected but clipboard is empty
- **THEN** nothing happens
