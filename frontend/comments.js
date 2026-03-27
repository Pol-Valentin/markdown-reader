/**
 * Inline comment UI + chat panel module
 */
import { invoke } from '@tauri-apps/api/core';

let contentEl = null;
let getActiveTabFn = null;
let commentBtn = null;
let commentForm = null;
let highlightedBlock = null;
let chatPanels = {}; // session_id → messages array

export function initComments(content, getActiveTab) {
  contentEl = content;
  getActiveTabFn = getActiveTab;

  // Create floating comment button (reused) — fixed position, viewport coords
  commentBtn = document.createElement('button');
  commentBtn.className = 'comment-btn';
  commentBtn.textContent = '💬';
  commentBtn.style.display = 'none';
  document.body.appendChild(commentBtn);

  // Create comment form (reused)
  commentForm = document.createElement('div');
  commentForm.className = 'comment-form';
  commentForm.style.display = 'none';
  commentForm.innerHTML = `
    <div class="comment-form-row">
      <input class="comment-input" type="text" placeholder="Votre commentaire..." />
      <button class="comment-submit">➤</button>
    </div>
  `;
  document.body.appendChild(commentForm);

  // Text selection → comment button
  contentEl.addEventListener('mouseup', onTextSelection);

  // Block click → comment button (delegated)
  contentEl.addEventListener('click', onBlockClick);

  // Comment button click → open form
  commentBtn.addEventListener('click', onCommentBtnClick);

  // Submit comment on Enter or click
  commentForm.querySelector('.comment-submit').addEventListener('click', onSubmitComment);
  commentForm.querySelector('.comment-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmitComment();
    }
  });

  // Dismiss on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dismiss();
  });

  // Paste on selected text → instant comment from clipboard
  document.addEventListener('paste', async (e) => {
    if (!isCommentable()) return;

    // Don't intercept if an input/textarea is focused
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.toString().trim() === '') return;

    // Check selection is inside content
    if (!contentEl.contains(sel.anchorNode)) return;

    const clipboardText = e.clipboardData?.getData('text/plain');
    if (!clipboardText || !clipboardText.trim()) return;

    e.preventDefault();

    const tab = getActiveTabFn();
    if (!tab || !tab.commentable) return;

    const range = sel.getRangeAt(0);
    const heading = findNearestHeading(range.startContainer);

    const payload = {
      file: tab.path,
      session_id: tab.session_id,
      heading,
      selected_text: sel.toString(),
      content_type: 'text',
      comment: clipboardText.trim(),
    };

    try {
      await invoke('send_comment', { comment: payload });
      appendUserComment(tab.session_id, payload);
    } catch (err) {
      console.error('Failed to send paste comment:', err);
    }

    dismiss();
    sel.removeAllRanges();
  });

  // Dismiss on scroll (button/form positions become stale)
  const scrollContainer = document.getElementById('content-scroll');
  if (scrollContainer) {
    scrollContainer.addEventListener('scroll', () => {
      if (commentBtn.style.display !== 'none' || commentForm.style.display !== 'none') {
        dismiss();
      }
    });
  }

  // Dismiss on click outside
  document.addEventListener('mousedown', (e) => {
    if (commentForm.style.display !== 'none' &&
        !commentForm.contains(e.target) &&
        !commentBtn.contains(e.target)) {
      dismiss();
    }
  });
}

// --- Selection state ---
let currentSelection = null; // { text, type, heading, rect }

function isCommentable() {
  const tab = getActiveTabFn();
  return tab && tab.commentable === true;
}

function onTextSelection() {
  if (!isCommentable()) return;

  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.toString().trim() === '') {
    if (commentForm.style.display === 'none') {
      commentBtn.style.display = 'none';
    }
    return;
  }

  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  currentSelection = {
    text: sel.toString(),
    type: 'text',
    heading: findNearestHeading(range.startContainer),
    rect,
  };

  showCommentBtn(rect.right + 8, rect.top);
}

function onBlockClick(e) {
  if (!isCommentable()) return;

  // Check if clicked on a mermaid or code block
  const mermaid = e.target.closest('.mermaid');
  const pre = e.target.closest('pre[data-source]');
  const block = mermaid || pre;

  if (!block) return;

  // Remove previous highlight
  clearHighlight();

  block.classList.add('comment-highlight');
  highlightedBlock = block;

  const source = block.getAttribute('data-source') || block.textContent;
  const rect = block.getBoundingClientRect();

  currentSelection = {
    text: source,
    type: mermaid ? 'mermaid' : 'code',
    heading: findNearestHeading(block),
    rect,
  };

  showCommentBtn(rect.right - 40, rect.top - 8);
}

function showCommentBtn(x, y) {
  commentBtn.style.display = 'block';
  commentBtn.style.left = `${Math.min(x, window.innerWidth - 50)}px`;
  commentBtn.style.top = `${y}px`;
  commentForm.style.display = 'none';
}

function onCommentBtnClick(e) {
  e.stopPropagation();
  if (!currentSelection) return;

  const rect = currentSelection.rect;
  commentForm.style.display = 'block';
  commentForm.style.left = `${Math.min(rect.left, window.innerWidth - 320)}px`;
  commentForm.style.top = `${rect.bottom + 8}px`;
  commentBtn.style.display = 'none';

  const input = commentForm.querySelector('.comment-input');
  input.value = '';
  input.focus();
}

async function onSubmitComment() {
  if (!currentSelection) return;
  const tab = getActiveTabFn();
  if (!tab || !tab.commentable) return;

  const input = commentForm.querySelector('.comment-input');
  const comment = input.value.trim();
  if (!comment) return;

  const payload = {
    file: tab.path,
    session_id: tab.session_id,
    heading: currentSelection.heading,
    selected_text: currentSelection.text,
    content_type: currentSelection.type,
    comment,
  };

  try {
    await invoke('send_comment', { comment: payload });
    appendUserComment(tab.session_id, payload);
    dismiss();
  } catch (err) {
    console.error('Failed to send comment:', err);
  }
}

function dismiss() {
  commentBtn.style.display = 'none';
  commentForm.style.display = 'none';
  clearHighlight();
  currentSelection = null;
}

function clearHighlight() {
  if (highlightedBlock) {
    highlightedBlock.classList.remove('comment-highlight');
    highlightedBlock = null;
  }
}

// --- Heading resolution ---

function findNearestHeading(node) {
  let current = node;

  // Walk up and backwards through the DOM to find nearest heading
  while (current && current !== contentEl) {
    // Check previous siblings
    let sibling = current.previousElementSibling || current.previousSibling;
    while (sibling) {
      if (sibling.nodeType === 1) {
        const heading = findHeadingInElement(sibling);
        if (heading) return heading;
      }
      sibling = sibling.previousElementSibling || sibling.previousSibling;
    }
    current = current.parentElement;
  }

  return '';
}

function findHeadingInElement(el) {
  if (/^H[1-6]$/.test(el.tagName)) {
    const level = el.tagName[1];
    return `${'#'.repeat(parseInt(level))} ${el.textContent}`;
  }
  // Check last heading descendant
  const headings = el.querySelectorAll('h1, h2, h3, h4, h5, h6');
  if (headings.length > 0) {
    const last = headings[headings.length - 1];
    const level = last.tagName[1];
    return `${'#'.repeat(parseInt(level))} ${last.textContent}`;
  }
  return null;
}

// --- Chat Panel ---

let chatPanelEl = null;
let chatMessagesEl = null;
let chatHeaderEl = null;
let sessionSelectEl = null;
let chatInputEl = null;
let unreadCount = 0;
let isCollapsed = false;
let onSessionChangeFn = null; // callback set from main.js

export function setOnSessionChange(fn) {
  onSessionChangeFn = fn;
}

export function ensureChatPanel(scrollContainer) {
  if (chatPanelEl) return;

  // Resizer lives outside the chat panel, above it in the flex layout
  const chatResizer = document.createElement('div');
  chatResizer.className = 'chat-resizer';
  chatResizerEl = chatResizer;

  chatPanelEl = document.createElement('div');
  chatPanelEl.className = 'chat-panel';
  chatPanelEl.innerHTML = `
    <div class="chat-header">
      <span class="chat-title">💬</span>
      <select class="session-select">
        <option value="">Sélectionner une session...</option>
      </select>
      <span class="chat-badge" style="display:none">0</span>
      <span class="chat-toggle">▼</span>
    </div>
    <div class="chat-messages"></div>
    <div class="chat-input-area">
      <input class="chat-input" type="text" placeholder="Répondre..." disabled />
    </div>
  `;
  chatResizer.style.display = 'none';
  chatPanelEl.style.display = 'none';
  const mainEl = document.getElementById('main');
  mainEl.appendChild(chatResizer);
  mainEl.appendChild(chatPanelEl);

  chatHeaderEl = chatPanelEl.querySelector('.chat-header');
  chatMessagesEl = chatPanelEl.querySelector('.chat-messages');
  sessionSelectEl = chatPanelEl.querySelector('.session-select');
  chatInputEl = chatPanelEl.querySelector('.chat-input');

  // Prevent select clicks from toggling collapse
  sessionSelectEl.addEventListener('click', (e) => e.stopPropagation());

  // Session selector change
  sessionSelectEl.addEventListener('change', () => {
    const sessionId = sessionSelectEl.value;
    if (sessionId && onSessionChangeFn) {
      onSessionChangeFn(sessionId);
      chatInputEl.disabled = false;
      chatMessagesEl.innerHTML = ''; // Clear messages on session change
    } else {
      chatInputEl.disabled = true;
    }
  });

  // Send message from chat input
  async function sendChatMessage() {
    const text = chatInputEl.value.trim();
    if (!text) return;
    const tab = getActiveTabFn();
    if (!tab || !tab.commentable) return;

    const payload = {
      file: tab.path,
      session_id: tab.session_id,
      heading: '',
      selected_text: '',
      content_type: 'text',
      comment: text,
    };

    try {
      await invoke('send_comment', { comment: payload });
      appendUserComment(tab.session_id, payload);
      chatInputEl.value = '';
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  }

  chatInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendChatMessage();
    }
  });

  // Collapse/expand toggle
  chatHeaderEl.addEventListener('click', () => {
    isCollapsed = !isCollapsed;
    chatPanelEl.classList.toggle('collapsed', isCollapsed);
    chatResizer.classList.toggle('hidden', isCollapsed);
    chatPanelEl.querySelector('.chat-toggle').textContent = isCollapsed ? '▲' : '▼';
    if (!isCollapsed) {
      unreadCount = 0;
      updateBadge();
    }
  });

  // Resize drag — resizer is a sibling above the chat panel
  let startY, startHeight;
  chatResizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startY = e.clientY;
    startHeight = chatMessagesEl.offsetHeight;
    chatResizer.classList.add('dragging');
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev) => {
      const delta = startY - ev.clientY;
      const newHeight = Math.max(60, Math.min(500, startHeight + delta));
      chatMessagesEl.style.height = `${newHeight}px`;
      chatMessagesEl.style.maxHeight = 'none';
    };
    const onMouseUp = () => {
      chatResizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      localStorage.setItem('chat-panel-height', chatMessagesEl.style.height);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  // Restore saved height
  const savedHeight = localStorage.getItem('chat-panel-height');
  if (savedHeight) {
    chatMessagesEl.style.height = savedHeight;
    chatMessagesEl.style.maxHeight = 'none';
  }
}

function appendUserComment(sessionId, payload) {
  if (!chatMessagesEl) return;

  const msg = document.createElement('div');
  msg.className = 'chat-msg chat-msg-user';

  const context = payload.heading ? `<span class="chat-context">${payload.heading}</span>` : '';
  const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  msg.innerHTML = `
    ${context}
    <div class="chat-text">${escapeHtml(payload.comment)}</div>
    <span class="chat-time">${time}</span>
  `;
  chatMessagesEl.appendChild(msg);
  scrollToBottom();
  showChatPanel();
}

export function appendClaudeReply(sessionId, text) {
  const tab = getActiveTabFn();
  if (!tab || tab.session_id !== sessionId) return;

  if (!chatMessagesEl) return;

  const msg = document.createElement('div');
  msg.className = 'chat-msg chat-msg-claude';

  const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  // Basic markdown: bold, code, links
  const rendered = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\n/g, '<br>');

  msg.innerHTML = `
    <div class="chat-text">${rendered}</div>
    <span class="chat-time">${time}</span>
  `;
  chatMessagesEl.appendChild(msg);

  if (isCollapsed) {
    unreadCount++;
    updateBadge();
  }
  scrollToBottom();
  showChatPanel();
}

let chatResizerEl = null;

function showChatPanel() {
  if (chatPanelEl) chatPanelEl.style.display = 'flex';
  if (chatResizerEl) chatResizerEl.style.display = 'block';
}

export function hideChatPanel() {
  if (chatPanelEl) chatPanelEl.style.display = 'none';
  if (chatResizerEl) chatResizerEl.style.display = 'none';
}

export function updateChatVisibility() {
  const tab = getActiveTabFn();
  // Chat panel always visible when a tab is open
  if (tab) {
    showChatPanel();
    // Update input state based on commentable
    if (chatInputEl) {
      chatInputEl.disabled = !tab.commentable;
    }
    // Pre-select session if tab is connected
    if (sessionSelectEl && tab.session_id) {
      sessionSelectEl.value = tab.session_id;
    } else if (sessionSelectEl) {
      sessionSelectEl.value = '';
    }
  } else {
    hideChatPanel();
  }
}

function formatTimeAgo(timestampMs) {
  const diff = Date.now() - timestampMs;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'à l\'instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  return `il y a ${Math.floor(hours / 24)}j`;
}

function formatCwd(cwd) {
  const home = '/home/' + (cwd.split('/')[2] || '');
  if (cwd.startsWith(home)) return '~' + cwd.slice(home.length);
  return cwd;
}

export function updateSessionList(sessions) {
  if (!sessionSelectEl) return;
  const currentValue = sessionSelectEl.value;
  sessionSelectEl.innerHTML = '<option value="">Sélectionner une session...</option>';

  if (sessions.length === 0) {
    sessionSelectEl.innerHTML = '<option value="">Aucune session Claude active</option>';
    sessionSelectEl.disabled = true;
    if (chatInputEl) chatInputEl.disabled = true;
    return;
  }

  sessionSelectEl.disabled = false;
  for (const s of sessions) {
    const opt = document.createElement('option');
    opt.value = s.session_id;
    const shortId = s.session_id.slice(0, 8);
    const cwd = s.cwd ? formatCwd(s.cwd) : '?';
    opt.textContent = `${cwd} (${shortId}) — ${formatTimeAgo(s.connected_at)}`;
    sessionSelectEl.appendChild(opt);
  }

  // Restore selection if still valid
  if (currentValue && sessions.some(s => s.session_id === currentValue)) {
    sessionSelectEl.value = currentValue;
  }
}

export function onSessionDisconnected(sessionId) {
  // Called from main.js when sessions-changed and a tab's session is gone
  // updateChatVisibility will handle the UI update
  updateChatVisibility();
}

function updateBadge() {
  const badge = chatPanelEl?.querySelector('.chat-badge');
  if (!badge) return;
  if (unreadCount > 0) {
    badge.textContent = unreadCount;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function scrollToBottom() {
  if (chatMessagesEl) {
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
