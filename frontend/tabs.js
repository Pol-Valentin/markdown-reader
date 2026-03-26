/**
 * Tab management module
 */

const tabs = [];
let activeTabIndex = -1;
let onTabChange = null;

export function setOnTabChange(callback) {
  onTabChange = callback;
}

export function getTabs() {
  return tabs;
}

export function getActiveTab() {
  return activeTabIndex >= 0 ? tabs[activeTabIndex] : null;
}

export function openTab(filePath, sessionId) {
  // Check if already open
  const existingIndex = tabs.findIndex(t => t.path === filePath);
  if (existingIndex >= 0) {
    // Update session_id if provided (file reopened via MCP)
    if (sessionId) {
      tabs[existingIndex].session_id = sessionId;
      tabs[existingIndex].commentable = true;
    }
    activateTab(existingIndex);
    return;
  }

  const name = filePath.split('/').pop();
  const tab = { path: filePath, name };
  if (sessionId) {
    tab.session_id = sessionId;
    tab.commentable = true;
  }
  tabs.push(tab);
  activateTab(tabs.length - 1);
}

export function closeTab(index) {
  if (index < 0 || index >= tabs.length) return;

  const closedPath = tabs[index].path;
  tabs.splice(index, 1);

  if (tabs.length === 0) {
    activeTabIndex = -1;
  } else if (index <= activeTabIndex) {
    activeTabIndex = Math.max(0, activeTabIndex - 1);
  }

  if (onTabChange) onTabChange(getActiveTab(), closedPath);
}

export function updateTabSession(sessionId) {
  if (activeTabIndex < 0) return;
  const tab = tabs[activeTabIndex];
  tab.session_id = sessionId;
  tab.commentable = true;
}

export function clearTabSession() {
  if (activeTabIndex < 0) return;
  const tab = tabs[activeTabIndex];
  delete tab.session_id;
  tab.commentable = false;
}

export function activateTab(index) {
  if (index < 0 || index >= tabs.length) return;
  activeTabIndex = index;
  if (onTabChange) onTabChange(getActiveTab(), null);
}

export function renderTabBar(container) {
  container.innerHTML = '';

  tabs.forEach((tab, i) => {
    const el = document.createElement('div');
    el.className = `tab ${i === activeTabIndex ? 'tab-active' : ''}`;
    el.title = tab.path;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'tab-name';
    nameSpan.textContent = tab.name;
    el.appendChild(nameSpan);

    const closeBtn = document.createElement('span');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(i);
    });
    el.appendChild(closeBtn);

    el.addEventListener('click', () => activateTab(i));
    el.addEventListener('mousedown', (e) => {
      if (e.button === 1) { // Middle click
        e.preventDefault();
        closeTab(i);
      }
    });

    container.appendChild(el);
  });
}
