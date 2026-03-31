/**
 * Sidebar module — 3 sections: Pinned, Recent, By Folder
 */

let onFileClick = null;
let onPin = null;
let onUnpin = null;

export function setCallbacks({ onFileClick: fc, onPin: pin, onUnpin: unpin }) {
  onFileClick = fc;
  onPin = pin;
  onUnpin = unpin;
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

function createContextMenu(filePath, isPinned) {
  // Remove existing context menu
  const existing = document.querySelector('.context-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'context-menu';

  const item = document.createElement('div');
  item.className = 'context-menu-item';
  if (isPinned) {
    item.textContent = 'Désépingler';
    item.addEventListener('click', () => {
      if (onUnpin) onUnpin(filePath);
      menu.remove();
    });
  } else {
    item.textContent = '📌 Épingler';
    item.addEventListener('click', () => {
      if (onPin) onPin(filePath);
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

/**
 * Find the longest common directory prefix of a list of absolute paths.
 */
function commonPrefix(paths) {
  if (paths.length === 0) return '/';
  const split = paths.map(p => p.split('/'));
  const first = split[0];
  let i = 0;
  while (i < first.length) {
    if (split.every(s => s[i] === first[i])) i++;
    else break;
  }
  // Ensure we stop at a directory, not mid-filename
  const common = first.slice(0, i).join('/');
  // If common is a file path (matches one of the inputs), go up one level
  if (paths.includes(common)) {
    return common.substring(0, common.lastIndexOf('/')) || '/';
  }
  return common || '/';
}

/**
 * Build a recursive folder tree from a flat list of paths.
 * Uses the longest common directory prefix as root.
 */
function buildFolderTree(entries) {
  const paths = entries.map(e => e.path);
  const prefix = commonPrefix(paths.map(p => p.substring(0, p.lastIndexOf('/'))));

  const tree = {};

  for (const entry of entries) {
    const relativePath = entry.path.substring(prefix.length + 1);
    const segments = relativePath.split('/');
    let current = tree;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (!current[seg]) current[seg] = { __children: {} };
      current = current[seg].__children;
    }
    const fileName = segments[segments.length - 1];
    current[fileName] = { __file: entry.path };
  }

  // Compact single-child directories into "parent/child" nodes
  function compact(node) {
    for (const [key, value] of Object.entries(node)) {
      if (!value.__children) continue;
      compact(value.__children);
      const childKeys = Object.keys(value.__children);
      // If this dir has exactly one child and it's also a dir, merge them
      if (childKeys.length === 1) {
        const childKey = childKeys[0];
        const childValue = value.__children[childKey];
        if (childValue.__children) {
          const merged = `${key}/${childKey}`;
          node[merged] = childValue;
          delete node[key];
        }
      }
    }
  }
  compact(tree);

  return { root: prefix, tree };
}

function renderTree(tree, container, collapsed, pinnedSet, parentPath) {
  const pathPrefix = parentPath || '';
  const entries = Object.entries(tree).sort(([a, va], [b, vb]) => {
    const aIsDir = va.__children !== undefined;
    const bIsDir = vb.__children !== undefined;
    if (aIsDir && !bIsDir) return -1;
    if (!aIsDir && bIsDir) return 1;
    return a.localeCompare(b);
  });

  for (const [name, value] of entries) {
    if (value.__file) {
      // File entry
      const el = document.createElement('div');
      el.className = 'tree-file';
      el.textContent = `📄 ${name}`;
      el.title = value.__file;
      el.addEventListener('click', () => {
        if (onFileClick) onFileClick(value.__file);
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isPinned = pinnedSet && pinnedSet.has(value.__file);
        const menu = createContextMenu(value.__file, isPinned);
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
      });
      container.appendChild(el);
    } else if (value.__children) {
      // Directory entry
      const dir = document.createElement('div');
      dir.className = 'tree-dir';

      const header = document.createElement('div');
      header.className = 'tree-dir-header';
      const key = `${pathPrefix}/${name}`;
      const isCollapsed = collapsed.has(key);
      header.textContent = `${isCollapsed ? '▶' : '▼'} 📂 ${name}`;
      header.addEventListener('click', () => {
        if (collapsed.has(key)) {
          collapsed.delete(key);
        } else {
          collapsed.add(key);
        }
        const childContainer = dir.querySelector('.tree-children');
        if (childContainer) {
          childContainer.style.display = collapsed.has(key) ? 'none' : 'block';
          header.textContent = `${collapsed.has(key) ? '▶' : '▼'} 📂 ${name}`;
        }
      });
      dir.appendChild(header);

      const children = document.createElement('div');
      children.className = 'tree-children';
      children.style.display = isCollapsed ? 'none' : 'block';
      renderTree(value.__children, children, collapsed, pinnedSet, key);
      dir.appendChild(children);

      container.appendChild(dir);
    }
  }
}

// Track collapsed folders across renders
const collapsedFolders = new Set();

export function renderSidebar(container, history, activeFile) {
  container.innerHTML = '';

  // Section 1: Pinned
  if (history.pinned.length > 0) {
    const section = document.createElement('div');
    section.className = 'sidebar-section';

    const header = document.createElement('div');
    header.className = 'sidebar-section-header';
    header.innerHTML = `📌 Épinglés <span class="section-count">${history.pinned.length}</span>`;
    section.appendChild(header);

    const list = document.createElement('div');
    list.className = 'sidebar-section-list';
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

  // Section 3: By Folder (all entries, not limited to 10)
  const allEntries = [...history.entries];
  if (allEntries.length > 0) {
    const { root, tree } = buildFolderTree(allEntries);
    const section = document.createElement('div');
    section.className = 'sidebar-section';

    const header = document.createElement('div');
    header.className = 'sidebar-section-header';
    const rootName = root.split('/').pop() || root;
    header.innerHTML = `📂 ${rootName} <span class="section-count" title="${root}">${allEntries.length}</span>`;
    section.appendChild(header);

    const treeContainer = document.createElement('div');
    treeContainer.className = 'sidebar-tree';
    const pinnedSet = new Set(history.pinned);
    renderTree(tree, treeContainer, collapsedFolders, pinnedSet);
    section.appendChild(treeContainer);
    container.appendChild(section);
  }

  // Empty state
  if (history.entries.length === 0 && history.pinned.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sidebar-empty';
    empty.textContent = 'Aucun fichier ouvert récemment';
    container.appendChild(empty);
  }
}
