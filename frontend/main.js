import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { renderMarkdown, renderMermaidDiagrams, generateTOC } from './renderer.js';
import { openTab, closeTab, getActiveTab, getTabs, setOnTabChange, renderTabBar } from './tabs.js';
import { renderSidebar, setCallbacks as setSidebarCallbacks } from './sidebar.js';
import { initComments, ensureChatPanel, appendClaudeReply, updateChatVisibility, updateSessionList, setOnSessionChange } from './comments.js';
import { updateTabSession, clearTabSession } from './tabs.js';

// DOM elements
const sidebarEl = document.getElementById('sidebar');
const tabBarEl = document.getElementById('tab-bar');
const contentEl = document.getElementById('content');
const emptyEl = document.getElementById('empty-state');

// State
let history = { version: 1, pinned: [], entries: [] };
const gitRoots = {}; // cache: path -> git root

// --- Rendering ---

async function renderContent(tab) {
  if (!tab) {
    contentEl.innerHTML = '';
    document.getElementById('content-scroll').style.display = 'none';
    emptyEl.style.display = 'flex';
    return;
  }

  emptyEl.style.display = 'none';
  document.getElementById('content-scroll').style.display = 'block';

  try {
    const content = await invoke('read_file', { path: tab.path });
    const html = renderMarkdown(content);

    // Save scroll position before DOM update
    const scrollEl = document.getElementById('content-scroll');
    const savedScroll = scrollEl.scrollTop;

    contentEl.innerHTML = html;

    // Add heading IDs for TOC navigation
    contentEl.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
      heading.id = heading.textContent.toLowerCase().replace(/[^\w]+/g, '-');
    });

    // Render mermaid diagrams (lazy), then restore scroll
    await renderMermaidDiagrams(contentEl);
    scrollEl.scrollTop = savedScroll;

    await invoke('record_open', { path: tab.path });
    await invoke('watch_file', { path: tab.path });
  } catch (err) {
    contentEl.innerHTML = `<div class="error">Erreur: ${err}</div>`;
  }
}

async function refreshSidebar() {
  try {
    history = await invoke('get_history');

    // Resolve git roots for all paths
    const allPaths = [
      ...history.pinned,
      ...history.entries.map(e => e.path),
    ];
    for (const path of allPaths) {
      if (!gitRoots[path]) {
        try {
          const root = await invoke('get_git_root', { path });
          gitRoots[path] = root;
        } catch {
          gitRoots[path] = null;
        }
      }
    }

    const activeTab = getActiveTab();
    renderSidebar(sidebarEl, history, gitRoots, activeTab?.path);
  } catch (err) {
    console.error('Failed to refresh sidebar:', err);
  }
}

function refreshTabBar() {
  renderTabBar(tabBarEl);
}

// --- Tab change handler ---

setOnTabChange(async (activeTab, closedPath) => {
  if (closedPath) {
    try { await invoke('unwatch_file', { path: closedPath }); } catch {}
  }
  refreshTabBar();
  await renderContent(activeTab);
  refreshSidebar();
  updateChatVisibility();
});

// --- Sidebar callbacks ---

setSidebarCallbacks({
  onFileClick: (path) => openTab(path),
  onPin: async (path) => {
    await invoke('pin_file', { path });
    await refreshSidebar();
  },
  onUnpin: async (path) => {
    await invoke('unpin_file', { path });
    await refreshSidebar();
  },
});

// --- Tauri events ---

listen('open-file', async (event) => {
  const path = event.payload;
  openTab(path);
});

listen('open-file-session', async (event) => {
  const { path, session_id } = event.payload;
  openTab(path, session_id);
});

listen('file-changed', async (event) => {
  const changedPath = event.payload;
  const activeTab = getActiveTab();
  if (activeTab && activeTab.path === changedPath) {
    await renderContent(activeTab);
  }
});

listen('history-changed', async () => {
  await refreshSidebar();
});

listen('claude-reply', async (event) => {
  const { session_id, text } = event.payload;
  appendClaudeReply(session_id, text);
});

listen('sessions-changed', async () => {
  await refreshSessions();
});

async function refreshSessions() {
  try {
    const sessions = await invoke('get_sessions');
    updateSessionList(sessions);
    // Check if any tab's session is gone
    const sessionIds = new Set(sessions.map(s => s.session_id));
    const tab = getActiveTab();
    if (tab && tab.session_id && !sessionIds.has(tab.session_id)) {
      clearTabSession();
      updateChatVisibility();
    }
  } catch (err) {
    console.error('Failed to get sessions:', err);
  }
}

// --- Sidebar resize ---
const resizer = document.getElementById('sidebar-resizer');
let isResizing = false;

resizer.addEventListener('mousedown', (e) => {
  isResizing = true;
  resizer.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const newWidth = Math.min(500, Math.max(180, e.clientX));
  sidebarEl.style.width = `${newWidth}px`;
});

document.addEventListener('mouseup', () => {
  if (!isResizing) return;
  isResizing = false;
  resizer.classList.remove('dragging');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  localStorage.setItem('sidebarWidth', sidebarEl.style.width);
});

// Restore sidebar width
const savedWidth = localStorage.getItem('sidebarWidth');
if (savedWidth) sidebarEl.style.width = savedWidth;

// --- Refresh button ---
document.getElementById('refresh-btn').addEventListener('click', async () => {
  const tab = getActiveTab();
  if (tab) await renderContent(tab);
});

// --- Sidebar toggle ---
const sidebarToggle = document.getElementById('sidebar-toggle');

sidebarToggle.addEventListener('click', () => {
  const hidden = !document.body.classList.contains('sidebar-hidden');
  document.body.classList.toggle('sidebar-hidden', hidden);
  localStorage.setItem('sidebarHidden', hidden);
});

if (localStorage.getItem('sidebarHidden') === 'true') {
  document.body.classList.add('sidebar-hidden');
}

// --- Width toggle ---
const widthToggle = document.getElementById('width-toggle');
widthToggle.addEventListener('click', () => {
  document.body.classList.toggle('full-width');
  const isFullWidth = document.body.classList.contains('full-width');
  widthToggle.textContent = isFullWidth ? '⬄' : '⬌';
  widthToggle.title = isFullWidth ? 'Centrer' : 'Pleine largeur';
  localStorage.setItem('fullWidth', isFullWidth);
});
// Restore preference
if (localStorage.getItem('fullWidth') === 'true') {
  document.body.classList.add('full-width');
  widthToggle.textContent = '⬄';
  widthToggle.title = 'Centrer';
}

// --- Disable native context menu globally ---
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

// --- Open external links in system browser ---
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href]');
  if (!link) return;
  const href = link.getAttribute('href');
  if (href && /^https?:\/\//.test(href)) {
    e.preventDefault();
    invoke('open_url', { url: href }).catch(() => {});
  }
});

// --- Init ---

async function init() {
  await refreshSidebar();
  refreshTabBar();

  // Initialize comment system
  initComments(contentEl, getActiveTab);
  ensureChatPanel(document.getElementById('content-scroll'));

  // Set up session change callback
  setOnSessionChange((sessionId) => {
    updateTabSession(sessionId);
    updateChatVisibility();
  });

  // Populate session list
  await refreshSessions();

  // Open initial file if passed via CLI
  try {
    const initialFile = await invoke('get_initial_file');
    if (initialFile) {
      openTab(initialFile);
    }
  } catch {}
}

init();
