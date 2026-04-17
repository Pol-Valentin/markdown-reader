/**
 * Sidebar module — 3 sections: Pinned, Recent, Home browser (lazy)
 */

import { invoke } from '@tauri-apps/api/core';

let onFileClick = null;
let onPin = null;
let onUnpin = null;
let onPinDir = null;
let onUnpinDir = null;
let onRequestRefresh = null;

let homeRoot = null;
const dirCache = new Map();
const expandedPaths = new Set();
const loadingPaths = new Set();

export function setCallbacks({
  onFileClick: fc,
  onPin: pin,
  onUnpin: unpin,
  onPinDir: pinDir,
  onUnpinDir: unpinDir,
  onRequestRefresh: refresh,
}) {
  onFileClick = fc;
  onPin = pin;
  onUnpin = unpin;
  onPinDir = pinDir;
  onUnpinDir = unpinDir;
  onRequestRefresh = refresh;
}

function invalidateDirCache(rootPath) {
  const prefix = `${rootPath}/`;
  for (const key of Array.from(dirCache.keys())) {
    if (key === rootPath || key.startsWith(prefix)) {
      dirCache.delete(key);
    }
  }
}

export function invalidateDir(path) {
  dirCache.delete(path);
}

/**
 * Truncate a path for display: show as much context as possible from git root.
 * Returns the context part (without the filename).
 */
function truncateContext(fullPath, maxWidth) {
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  const parts = dir.split('/');
  const relativePath = parts.slice(-3).join('/');

  if (!relativePath) return '';

  // Measure approximate fit (rough: 7px per char)
  const charWidth = 7;
  const maxChars = Math.floor(maxWidth / charWidth);

  if (relativePath.length <= maxChars) {
    return relativePath;
  }

  // Truncate from the beginning
  const segments = relativePath.split('/');
  let result = '';
  for (let i = segments.length - 1; i >= 0; i--) {
    const candidate = segments.slice(i).join('/');
    if (candidate.length + 1 <= maxChars) {
      result = candidate;
    } else {
      break;
    }
  }

  return result ? `…${result}` : `…${segments[segments.length - 1]}`;
}

function getFileName(path) {
  return path.split('/').pop();
}

function createContextMenu(targetPath, isPinned, isDir = false) {
  // Remove existing context menu
  const existing = document.querySelector('.context-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'context-menu';

  const item = document.createElement('div');
  item.className = 'context-menu-item';
  const pinHandler = isDir ? onPinDir : onPin;
  const unpinHandler = isDir ? onUnpinDir : onUnpin;
  const pinLabel = isDir ? '📌 Épingler dossier' : '📌 Épingler';
  const unpinLabel = isDir ? 'Désépingler dossier' : 'Désépingler';
  if (isPinned) {
    item.textContent = unpinLabel;
    item.addEventListener('click', () => {
      if (unpinHandler) unpinHandler(targetPath);
      menu.remove();
    });
  } else {
    item.textContent = pinLabel;
    item.addEventListener('click', () => {
      if (pinHandler) pinHandler(targetPath);
      menu.remove();
    });
  }
  menu.appendChild(item);

  document.body.appendChild(menu);

  // Close on click outside
  const close = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', close);
    }
  };
  setTimeout(() => document.addEventListener('click', close), 0);

  return menu;
}

function renderFileItem(path, options = {}) {
  const { showUnpin = false, showContext = true } = options;

  const el = document.createElement('div');
  el.className = 'sidebar-file';
  el.title = path;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'file-name';
  nameSpan.textContent = getFileName(path);
  el.appendChild(nameSpan);

  if (showContext) {
    const context = truncateContext(path, 150);
    if (context) {
      const contextSpan = document.createElement('span');
      contextSpan.className = 'file-context';
      contextSpan.textContent = ` — ${context}`;
      el.appendChild(contextSpan);
    }
  }

  if (showUnpin) {
    const unpinBtn = document.createElement('span');
    unpinBtn.className = 'file-unpin';
    unpinBtn.textContent = '✕';
    unpinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onUnpin) onUnpin(path);
    });
    el.appendChild(unpinBtn);
  }

  el.addEventListener('click', () => {
    if (onFileClick) onFileClick(path);
  });

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isPinned = showUnpin;
    const menu = createContextMenu(path, isPinned);
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
  });

  return el;
}

async function ensureHomeRoot() {
  if (homeRoot) return homeRoot;
  try {
    homeRoot = await invoke('get_home_dir');
  } catch (err) {
    console.error('Failed to get home dir:', err);
    homeRoot = null;
  }
  return homeRoot;
}

async function loadDir(path) {
  if (dirCache.has(path)) return dirCache.get(path);
  if (loadingPaths.has(path)) return null;
  loadingPaths.add(path);
  try {
    const entries = await invoke('list_directory', { path });
    dirCache.set(path, entries);
    return entries;
  } catch (err) {
    console.error(`Failed to list ${path}:`, err);
    dirCache.set(path, []);
    return [];
  } finally {
    loadingPaths.delete(path);
  }
}

function makeFileNode(entry, pinnedSet) {
  const el = document.createElement('div');
  el.className = 'tree-file';
  el.textContent = `📄 ${entry.name}`;
  el.title = entry.path;
  el.addEventListener('click', () => {
    if (onFileClick) onFileClick(entry.path);
  });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isPinned = pinnedSet && pinnedSet.has(entry.path);
    const menu = createContextMenu(entry.path, isPinned);
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
  });
  return el;
}

function makeDirNode(entry, pinnedSet, pinnedDirsSet, options = {}) {
  const { showUnpin = false } = options;

  const dir = document.createElement('div');
  dir.className = 'tree-dir';

  const header = document.createElement('div');
  header.className = 'tree-dir-header';
  header.title = entry.path;
  const label = document.createElement('span');
  header.appendChild(label);

  const children = document.createElement('div');
  children.className = 'tree-children';

  const setLabel = () => {
    const expanded = expandedPaths.has(entry.path);
    label.textContent = `${expanded ? '▼' : '▶'} 📂 ${entry.name}`;
    children.style.display = expanded ? 'block' : 'none';
  };
  setLabel();

  if (showUnpin) {
    const refreshBtn = document.createElement('span');
    refreshBtn.className = 'dir-refresh';
    refreshBtn.textContent = '↻';
    refreshBtn.title = 'Rafraîchir';
    refreshBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      refreshBtn.classList.add('spinning');
      invalidateDirCache(entry.path);
      if (onRequestRefresh) await onRequestRefresh();
    });
    header.appendChild(refreshBtn);

    const unpinBtn = document.createElement('span');
    unpinBtn.className = 'file-unpin';
    unpinBtn.textContent = '✕';
    unpinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onUnpinDir) onUnpinDir(entry.path);
    });
    header.appendChild(unpinBtn);
  }

  if (expandedPaths.has(entry.path)) {
    if (dirCache.has(entry.path)) {
      renderEntriesInto(dirCache.get(entry.path), children, pinnedSet, pinnedDirsSet);
    } else {
      children.innerHTML = '<div class="tree-loading">…</div>';
      loadDir(entry.path).then((loaded) => {
        if (!expandedPaths.has(entry.path)) return;
        children.innerHTML = '';
        renderEntriesInto(loaded || [], children, pinnedSet, pinnedDirsSet);
      });
    }
  }

  header.addEventListener('click', async () => {
    if (expandedPaths.has(entry.path)) {
      expandedPaths.delete(entry.path);
      setLabel();
      invoke('unwatch_dir', { path: entry.path }).catch(() => {});
      return;
    }
    expandedPaths.add(entry.path);
    setLabel();
    invoke('watch_dir', { path: entry.path }).catch(() => {});
    if (!dirCache.has(entry.path)) {
      children.innerHTML = '<div class="tree-loading">…</div>';
      const loaded = await loadDir(entry.path);
      if (!expandedPaths.has(entry.path)) return;
      children.innerHTML = '';
      renderEntriesInto(loaded || [], children, pinnedSet, pinnedDirsSet);
    }
  });

  header.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isPinned = pinnedDirsSet && pinnedDirsSet.has(entry.path);
    const menu = createContextMenu(entry.path, isPinned, true);
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
  });

  dir.appendChild(header);
  dir.appendChild(children);
  return dir;
}

function renderEntriesInto(entries, container, pinnedSet, pinnedDirsSet) {
  if (!entries || entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tree-empty';
    empty.textContent = '(vide)';
    container.appendChild(empty);
    return;
  }
  for (const entry of entries) {
    if (entry.is_dir) {
      container.appendChild(makeDirNode(entry, pinnedSet, pinnedDirsSet));
    } else {
      container.appendChild(makeFileNode(entry, pinnedSet));
    }
  }
}

async function renderHomeSection(container, pinnedSet, pinnedDirsSet) {
  const section = document.createElement('div');
  section.className = 'sidebar-section';

  const header = document.createElement('div');
  header.className = 'sidebar-section-header';
  header.innerHTML = '🏠 Home';
  section.appendChild(header);

  const treeContainer = document.createElement('div');
  treeContainer.className = 'sidebar-tree';
  section.appendChild(treeContainer);
  container.appendChild(section);

  const root = await ensureHomeRoot();
  if (!root) {
    treeContainer.innerHTML = '<div class="tree-empty">(home indisponible)</div>';
    return;
  }
  header.title = root;
  invoke('watch_dir', { path: root }).catch(() => {});

  let entries = dirCache.get(root);
  if (!entries) {
    treeContainer.innerHTML = '<div class="tree-loading">…</div>';
    entries = await loadDir(root);
    treeContainer.innerHTML = '';
  }
  renderEntriesInto(entries || [], treeContainer, pinnedSet, pinnedDirsSet);
}

export function renderSidebar(container, history, activeFile) {
  container.innerHTML = '';

  const pinnedDirs = history.pinned_dirs || [];
  const pinnedSet = new Set(history.pinned);
  const pinnedDirsSet = new Set(pinnedDirs);

  // Section 1: Pinned (dirs first, then files)
  const totalPinned = history.pinned.length + pinnedDirs.length;
  if (totalPinned > 0) {
    const section = document.createElement('div');
    section.className = 'sidebar-section';

    const header = document.createElement('div');
    header.className = 'sidebar-section-header';
    header.innerHTML = `📌 Épinglés <span class="section-count">${totalPinned}</span>`;
    section.appendChild(header);

    const list = document.createElement('div');
    list.className = 'sidebar-section-list';
    for (const dirPath of pinnedDirs) {
      const name = dirPath.split('/').pop() || dirPath;
      list.appendChild(
        makeDirNode(
          { name, path: dirPath, is_dir: true },
          pinnedSet,
          pinnedDirsSet,
          { showUnpin: true }
        )
      );
    }
    for (const path of history.pinned) {
      list.appendChild(renderFileItem(path, { showUnpin: true, showContext: true }));
    }
    section.appendChild(list);
    container.appendChild(section);
  }

  // Section 2: Recent
  const sortedEntries = [...history.entries].sort(
    (a, b) => new Date(b.last_opened) - new Date(a.last_opened)
  ).slice(0, 10);

  if (sortedEntries.length > 0) {
    const section = document.createElement('div');
    section.className = 'sidebar-section';

    const header = document.createElement('div');
    header.className = 'sidebar-section-header';
    header.innerHTML = `🕐 Récents <span class="section-count">${sortedEntries.length}</span>`;
    section.appendChild(header);

    const list = document.createElement('div');
    list.className = 'sidebar-section-list';
    for (const entry of sortedEntries) {
      const el = renderFileItem(entry.path, { showContext: true });
      if (entry.path === activeFile) el.classList.add('active');
      list.appendChild(el);
    }
    section.appendChild(list);
    container.appendChild(section);
  }

  // Section 3: Home browser (lazy, filtered to .md files)
  renderHomeSection(container, pinnedSet, pinnedDirsSet);
}
