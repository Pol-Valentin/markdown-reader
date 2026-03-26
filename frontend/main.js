import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { renderMarkdown, renderMermaidDiagrams, generateTOC } from './renderer.js';
import { openTab, closeTab, getActiveTab, getTabs, setOnTabChange, renderTabBar } from './tabs.js';
import { renderSidebar, setCallbacks as setSidebarCallbacks } from './sidebar.js';

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
    contentEl.innerHTML = html;

    // Add heading IDs for TOC navigation
    contentEl.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
      heading.id = heading.textContent.toLowerCase().replace(/[^\w]+/g, '-');
    });

    // Render mermaid diagrams (lazy)
    await renderMermaidDiagrams(contentEl);

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

// --- Width toggle ---
const widthToggle = document.getElementById('width-toggle');
widthToggle.addEventListener('click', () => {
  document.body.classList.toggle('full-width');
  widthToggle.textContent = document.body.classList.contains('full-width') ? '⇤⇥' : '⇔';
  localStorage.setItem('fullWidth', document.body.classList.contains('full-width'));
});
// Restore preference
if (localStorage.getItem('fullWidth') === 'true') {
  document.body.classList.add('full-width');
  widthToggle.textContent = '⇤⇥';
}

// --- Disable native context menu globally ---
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

// --- Init ---

async function init() {
  await refreshSidebar();
  refreshTabBar();

  // Open initial file if passed via CLI
  try {
    const initialFile = await invoke('get_initial_file');
    if (initialFile) {
      openTab(initialFile);
    }
  } catch {}
}

init();
