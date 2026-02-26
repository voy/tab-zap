import { generateGroups } from '../src/group.js';

const STRATEGY_LABELS = {
  path: 'path',
  hostname: 'host',
};

async function init() {
  const app = document.getElementById('app');

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab) return;

  const allTabs = await chrome.tabs.query({ currentWindow: true });
  const groups = activeTab.url ? generateGroups(activeTab, allTabs) : [];

  if (groups.length === 0) {
    renderEmpty(app, activeTab);
  } else if (groups.length === 1) {
    renderSingleGroup(app, activeTab, groups[0]);
  } else {
    renderGroupList(app, activeTab, groups);
  }
}

function renderEmpty(app, activeTab) {
  app.innerHTML = `
    <div class="header">
      <div class="app-title">Tab Master</div>
      <div class="current-tab">${esc(trunc(activeTab.title, 42))}</div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" id="close-btn">Close this tab</button>
      <div class="empty">No similar tabs found.</div>
    </div>
  `;

  app.querySelector('#close-btn').addEventListener('click', async () => {
    try { await chrome.tabs.remove(activeTab.id); } catch {}
    window.close();
  });
}

function renderSingleGroup(app, activeTab, group) {
  const allGroupTabs = [activeTab, ...group.tabs];
  const othersCount = group.tabs.length;

  app.innerHTML = `
    <div class="header">
      <div class="app-title">Tab Master</div>
      <div class="current-tab">${esc(trunc(activeTab.title, 42))}</div>
    </div>
    <ul class="checklist">
      ${allGroupTabs.map(t => {
        const isCurrent = t.id === activeTab.id;
        return `
        <li class="check-item non-interactive">
          <span class="check-dot ${isCurrent ? 'is-current' : ''}"></span>
          <span>${esc(trunc(t.title, 38))}</span>
          ${isCurrent ? '<span class="badge">current</span>' : ''}
        </li>`;
      }).join('')}
    </ul>
    <div class="actions">
      <button class="btn btn-primary" id="close-all-btn">Close all ${allGroupTabs.length}</button>
      <button class="btn btn-secondary" id="close-rest-btn">Close the rest (${othersCount})</button>
      <button class="btn btn-secondary" id="close-one-btn">Close this tab</button>
    </div>
  `;

  app.querySelector('#close-all-btn').addEventListener('click', async () => {
    try { await chrome.tabs.remove(allGroupTabs.map(t => t.id)); } catch {}
    window.close();
  });

  app.querySelector('#close-rest-btn').addEventListener('click', async () => {
    try { await chrome.tabs.remove(group.tabs.map(t => t.id)); } catch {}
    window.close();
  });

  app.querySelector('#close-one-btn').addEventListener('click', async () => {
    try { await chrome.tabs.remove(activeTab.id); } catch {}
    window.close();
  });
}

function renderGroupList(app, activeTab, groups) {
  app.innerHTML = `
    <div class="header">
      <div class="app-title">Tab Master</div>
      <div class="current-tab">${esc(trunc(activeTab.title, 42))}</div>
    </div>
    <ul class="group-list">
      ${groups.map((g, i) => `
        <li class="group-item" data-index="${i}">
          <span class="strategy-badge">${esc(STRATEGY_LABELS[g.strategy] ?? g.strategy)}</span>
          <span class="group-label">${esc(g.label)}</span>
          <span class="group-count">${g.tabs.length + 1} tabs</span>
        </li>
      `).join('')}
    </ul>
  `;

  app.querySelectorAll('.group-item').forEach(el => {
    const i = parseInt(el.dataset.index);
    el.addEventListener('click', () => renderChecklist(app, activeTab, groups[i], groups));
  });
}

function renderChecklist(app, activeTab, group, groups) {
  const allGroupTabs = [activeTab, ...group.tabs];

  app.innerHTML = `
    <div class="header">
      <button class="back-btn">← ${esc(group.label)}</button>
    </div>
    <ul class="checklist">
      ${allGroupTabs.map(t => {
        const isCurrent = t.id === activeTab.id;
        return `
        <li class="check-item">
          <label>
            <input type="checkbox" ${isCurrent ? '' : 'checked'} data-tab-id="${t.id}">
            <span>${esc(trunc(t.title, 38))}</span>
            ${isCurrent ? '<span class="badge">current</span>' : ''}
          </label>
        </li>`;
      }).join('')}
    </ul>
    <div class="actions">
      <button class="btn btn-primary" id="close-btn">
        Close checked tabs
      </button>
    </div>
  `;

  app.querySelector('.back-btn')
    .addEventListener('click', () => renderGroupList(app, activeTab, groups));

  app.querySelector('#close-btn').addEventListener('click', async () => {
    const toClose = checkedIds(app);
    if (toClose.length) try { await chrome.tabs.remove(toClose); } catch {}
    window.close();
  });
}

function checkedIds(app) {
  return [...app.querySelectorAll('input[type=checkbox]:checked')]
    .map(el => parseInt(el.dataset.tabId));
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function trunc(str, len) {
  return str.length > len ? str.slice(0, len) + '…' : str;
}

init();
