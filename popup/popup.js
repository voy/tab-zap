import { generateGroups } from '../src/group.js';

const STRATEGY_LABELS = {
  hostname: { text: 'host', tip: 'All tabs on the same hostname' },
  domain:   { text: 'site', tip: 'All tabs on the same site (across subdomains)' },
  recency:  { text: 'age',  tip: 'Tabs not accessed recently' },
};

async function init() {
  const app = document.getElementById('app');
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) return;

    const allTabs = await chrome.tabs.query({ currentWindow: true });
    const rawGroups = generateGroups(activeTab, allTabs);
    const groups = dedupeByCount(rawGroups);
    const checkState = new Map();

    if (groups.length === 0) {
      renderEmpty(app, activeTab);
    } else if (groups.length === 1) {
      renderChecklist(app, activeTab, groups[0], groups, 0, checkState);
    } else {
      renderGroupList(app, activeTab, groups, checkState);
    }
  } catch (err) {
    app.innerHTML = `<div class="actions"><div class="empty">Something went wrong: ${esc(String(err?.message ?? err))}</div></div>`;
  }
}

function renderEmpty(app, activeTab) {
  const isPinned = activeTab.pinned;
  app.innerHTML = `
    <div class="header">
      <div class="app-title">Tab Master</div>
      <div class="current-tab">${esc(trunc(activeTab.title, 42))}</div>
    </div>
    <div class="actions">
      ${isPinned
        ? '<div class="empty">Pinned tab — nothing to close.</div>'
        : `<button class="btn btn-primary" id="close-btn">Close this tab</button>
           <div class="empty">No similar tabs found.</div>`
      }
    </div>
  `;

  if (!isPinned) {
    app.querySelector('#close-btn').addEventListener('click', async () => {
      try { await chrome.tabs.remove(activeTab.id); } catch {}
      window.close();
    });
  }
}

function renderGroupList(app, activeTab, groups, checkState) {
  app.innerHTML = `
    <div class="header">
      <div class="app-title">Tab Master</div>
      <div class="current-tab">${esc(trunc(activeTab.title, 42))}</div>
    </div>
    <ul class="group-list">
      ${groups.map((g, i) => {
        const isFirstRecency = g.strategy === 'recency' && (i === 0 || groups[i - 1].strategy !== 'recency');
        return `
        ${isFirstRecency ? '<li class="group-divider"></li>' : ''}
        <li class="group-item" data-index="${i}">
          <span class="strategy-badge" title="${esc((STRATEGY_LABELS[g.strategy]?.tip) ?? '')}">${esc((STRATEGY_LABELS[g.strategy]?.text) ?? g.strategy)}</span>
          <span class="group-label">${esc(g.label)}</span>
          <span class="group-count">${g.strategy === 'recency' ? g.tabs.length : g.tabs.length + 1} tabs</span>
        </li>`;
      }).join('')}
    </ul>
    <div class="actions">
      <button class="btn btn-secondary" id="close-one-btn">Close this tab</button>
    </div>
  `;

  app.querySelectorAll('.group-item').forEach(el => {
    const i = parseInt(el.dataset.index);
    el.addEventListener('click', () => renderChecklist(app, activeTab, groups[i], groups, i, checkState));
  });

  app.querySelector('#close-one-btn').addEventListener('click', async () => {
    try { await chrome.tabs.remove(activeTab.id); } catch {}
    window.close();
  });
}

function renderChecklist(app, activeTab, group, groups, groupIndex, checkState) {
  const allGroupTabs = group.strategy === 'recency' ? group.tabs : [activeTab, ...group.tabs];
  const savedIds = checkState.get(groupIndex);
  const hasMultipleGroups = groups.length > 1;

  app.innerHTML = `
    <div class="header">
      ${hasMultipleGroups
        ? `<button class="back-btn">← ${esc(group.label)}</button>`
        : `<div class="app-title">Tab Master</div>
           <div class="current-tab">${esc(trunc(activeTab.title, 42))}</div>`
      }
    </div>
    <div class="actions actions-top">
      <button class="btn btn-primary" id="close-all-btn">Close all ${allGroupTabs.length} tabs</button>
      ${allGroupTabs.some(t => t.id === activeTab.id)
        ? `<button class="btn btn-secondary" id="keep-current-btn">Keep current tab</button>`
        : `<button class="btn btn-secondary" id="close-one-btn">Close this tab</button>`}
    </div>
    <ul class="checklist">
      ${allGroupTabs.map(t => {
        const isCurrent = t.id === activeTab.id;
        const checked = savedIds ? savedIds.has(t.id) : true;
        return `
        <li class="check-item">
          <label>
            <input type="checkbox" ${checked ? 'checked' : ''} data-tab-id="${t.id}">
            ${t.favIconUrl ? `<img class="favicon" src="${esc(t.favIconUrl)}" alt="">` : '<span class="favicon-placeholder"></span>'}
            <span title="${esc(t.url || '')}">${esc(trunc(t.title, 38))}</span>
            ${isCurrent ? '<span class="badge">current</span>' : ''}
          </label>
        </li>`;
      }).join('')}
    </ul>
    <div class="actions">
      <button class="btn btn-secondary" id="close-btn" disabled>Close checked tabs</button>
    </div>
  `;

  // Attach favicon error handlers (onerror attribute is blocked by MV3 CSP)
  app.querySelectorAll('img.favicon').forEach(img => {
    img.addEventListener('error', () => { img.style.display = 'none'; });
  });

  function updateCloseButton() {
    const count = checkedIds(app).length;
    const btn = app.querySelector('#close-btn');
    btn.textContent = count > 0 ? `Close ${count} tab${count === 1 ? '' : 's'}` : 'Close checked tabs';
    btn.disabled = count === 0;
  }

  updateCloseButton();
  app.querySelector('.checklist').addEventListener('change', updateCloseButton);

  if (hasMultipleGroups) {
    app.querySelector('.back-btn').addEventListener('click', () => {
      checkState.set(groupIndex, new Set(checkedIds(app)));
      renderGroupList(app, activeTab, groups, checkState);
    });
  }

  app.querySelector('#close-all-btn').addEventListener('click', async () => {
    try { await chrome.tabs.remove(allGroupTabs.map(t => t.id)); } catch {}
    window.close();
  });

  app.querySelector('#keep-current-btn')?.addEventListener('click', async () => {
    const toClose = allGroupTabs.filter(t => t.id !== activeTab.id).map(t => t.id);
    try { await chrome.tabs.remove(toClose); } catch {}
    window.close();
  });

  app.querySelector('#close-one-btn')?.addEventListener('click', async () => {
    try { await chrome.tabs.remove(activeTab.id); } catch {}
    window.close();
  });

  app.querySelector('#close-btn').addEventListener('click', async () => {
    const toClose = checkedIds(app);
    if (!toClose.length) return;
    try { await chrome.tabs.remove(toClose); } catch {}
    window.close();
  });
}

function checkedIds(app) {
  return [...app.querySelectorAll('input[type=checkbox]:checked')]
    .map(el => parseInt(el.dataset.tabId))
    .filter(id => !isNaN(id));
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dedupeByCount(groups) {
  const tabCount = g => g.strategy === 'recency' ? g.tabs.length : g.tabs.length + 1;
  const seen = new Set();
  return groups.filter(g => {
    const n = tabCount(g);
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });
}

function trunc(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

init();
