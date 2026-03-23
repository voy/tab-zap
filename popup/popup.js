import { generateGroups } from '../src/group.js';

const STRATEGY_LABELS = {
  hostname: { text: 'host', tip: 'All tabs on the same hostname' },
  peer:     { text: 'peer', tip: 'All tabs on this hostname' },
  domain:   { text: 'site', tip: 'All tabs on the same site (across subdomains)' },
  recency:  { text: 'age',  tip: 'Tabs not accessed recently' },
  newtab:   { text: 'new',  tip: 'New tab pages that were never used' },
};

let shortcutHint = '';
let hintsVisible = false;

async function init() {
  const app = document.getElementById('app');
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) return;

    const commands = await chrome.commands.getAll();
    const cmd = commands.find(c => c.name === '_execute_action');
    shortcutHint = cmd?.shortcut ? formatShortcut(cmd.shortcut) : '';

    const allTabs = await chrome.tabs.query({ currentWindow: true });
    const groups = generateGroups(activeTab, allTabs);
    const checkState = new Map();

    if (groups.length === 0) {
      renderEmpty(app, activeTab);
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
      <div class="header-row">
        <div class="app-title">Current Tab</div>
        ${shortcutHint ? `<kbd class="shortcut-hint">${esc(shortcutHint)}</kbd>` : ''}
      </div>
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
    app.querySelector('#close-btn').focus();
  }

  setKeyHandler(e => {
    if (e.key === 'Escape') window.close();
  });
}

function keyHints(items) {
  return `<div class="key-hints">${items.map(([k, label]) => `<span class="key-hint-item"><span class="key-hint-key">${esc(k)}</span>${esc(label)}</span>`).join('')}</div>`;
}

function applyHintsVisibility(app) {
  app.querySelector('.key-hints')?.classList.toggle('visible', hintsVisible);
}

function toggleHints(app) {
  hintsVisible = !hintsVisible;
  applyHintsVisibility(app);
}

function attachHintsToggle(app) {
  applyHintsVisibility(app);
  app.querySelector('.hints-btn')?.addEventListener('click', () => toggleHints(app));
}

function renderGroupList(app, activeTab, groups, checkState) {
  app.innerHTML = `
    <div class="header">
      <div class="header-row">
        <div class="app-title">Current Tab</div>
        <button class="hints-btn" title="Keyboard shortcuts">?</button>
      </div>
      <div class="current-tab">${esc(trunc(activeTab.title, 42))}</div>
    </div>
    <ul class="group-list">
      ${groups.map((g, i) => {
        const isFirstRecency = g.strategy === 'recency' && (i === 0 || groups[i - 1].strategy !== 'recency');
        return `
        ${isFirstRecency ? '<li class="group-divider"></li>' : ''}
        <li class="group-item" tabindex="0" data-index="${i}">
          <span class="strategy-badge" title="${esc((STRATEGY_LABELS[g.strategy]?.tip) ?? '')}">${esc((STRATEGY_LABELS[g.strategy]?.text) ?? g.strategy)}</span>
          <span class="group-label">${renderLabel(g.label)}</span>
          <span class="group-count">${(g.strategy === 'recency' || g.strategy === 'newtab' || g.strategy === 'peer') ? g.tabs.length : g.tabs.length + 1} tabs</span>
        </li>`;
      }).join('')}
    </ul>
    ${keyHints([...(shortcutHint ? [[shortcutHint, 'open popup']] : []), ['j/k/↑/↓','navigate'],['l/→/↵','open'],['d','close all'],['D','keep current'],['q','quit']])}
  `;

  attachHintsToggle(app);
  app.querySelectorAll('.group-item').forEach(el => {
    const i = parseInt(el.dataset.index);
    el.addEventListener('click', () => renderChecklist(app, activeTab, groups[i], groups, i, checkState));
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.click(); } });
  });

  app.querySelector('.group-item')?.focus();

  setKeyHandler(e => {
    const items = [...app.querySelectorAll('.group-item')];
    const cur = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); items[(cur + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); items[(cur - 1 + items.length) % items.length]?.focus(); }
    else if ((e.key === 'l' || e.key === 'ArrowRight') && cur !== -1) { e.preventDefault(); items[cur].click(); }
    else if (e.key === '?') { e.preventDefault(); toggleHints(app); }
    else if (e.key === 'Escape' || e.key === 'q') window.close();
    else if ((e.key === 'd' || e.key === 'D') && cur !== -1) {
      e.preventDefault();
      const i = parseInt(items[cur].dataset.index);
      if (e.key === 'D') {
        if (groups[i].tabs.length === 0) return;
        chrome.tabs.remove(groups[i].tabs.map(t => t.id)).catch(() => {});
        const newGroups = groups.filter((_, idx) => idx !== i);
        if (newGroups.length === 0) { window.close(); return; }
        renderGroupList(app, activeTab, newGroups, checkState);
        const newItems = [...app.querySelectorAll('.group-item')];
        newItems[Math.min(cur, newItems.length - 1)]?.focus();
      } else {
        (async () => {
          try { await chrome.tabs.remove([...groups[i].tabs.map(t => t.id), activeTab.id]); } catch {}
          const [newActiveTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!newActiveTab) { window.close(); return; }
          const allTabs = await chrome.tabs.query({ currentWindow: true });
          const newGroups = generateGroups(newActiveTab, allTabs);
          if (newGroups.length === 0) { window.close(); return; }
          renderGroupList(app, newActiveTab, newGroups, checkState);
        })();
      }
    }
  });
}

function renderChecklist(app, activeTab, group, groups, groupIndex, checkState) {
  const allGroupTabs = (group.strategy === 'recency' || group.strategy === 'newtab' || group.strategy === 'peer') ? group.tabs : [activeTab, ...group.tabs];
  const savedIds = checkState.get(groupIndex);

  app.innerHTML = `
    <div class="header">
      <div class="header-row">
        <button class="back-btn" title="Back"><svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 2L3.5 5l3 3"/></svg></button>
        <button class="hints-btn" title="Keyboard shortcuts">?</button>
      </div>
    </div>
    <div class="actions actions-top">
      <button class="btn btn-primary" id="close-btn" disabled>Close checked tabs</button>
      ${allGroupTabs.some(t => t.id === activeTab.id)
        ? `<button class="btn btn-secondary" id="keep-current-btn"${allGroupTabs.length === 1 ? ' disabled' : ''}>Keep current tab</button>`
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
    ${keyHints([['j/k/↑/↓','navigate'],['h/←','back'],['x','toggle'],['*a','select all'],['*n','deselect all'],['d','close checked'],['D','keep current'],['q','quit']])}
  `;

  attachHintsToggle(app);

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

  app.querySelector('.back-btn').addEventListener('click', () => {
    checkState.set(groupIndex, new Set(checkedIds(app)));
    renderGroupList(app, activeTab, groups, checkState);
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

  app.querySelector('#close-btn').focus();

  let pendingChord = null;
  let chordTimer = null;

  function clearChord() {
    pendingChord = null;
    clearTimeout(chordTimer);
    chordTimer = null;
  }

  setKeyHandler(e => {
    if (pendingChord === '*') {
      clearChord();
      if (e.key === 'a') {
        e.preventDefault();
        app.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = true; });
        updateCloseButton();
        return;
      } else if (e.key === 'n') {
        e.preventDefault();
        app.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = false; });
        updateCloseButton();
        return;
      }
    }

    if (e.key === '*') {
      e.preventDefault();
      clearChord();
      pendingChord = '*';
      chordTimer = setTimeout(clearChord, 1500);
      return;
    }

    const navItems = [
      app.querySelector('.back-btn'),
      app.querySelector('#close-btn:not(:disabled)'),
      app.querySelector('#keep-current-btn:not(:disabled)') ?? app.querySelector('#close-one-btn'),
      ...app.querySelectorAll('input[type=checkbox]'),
    ].filter(Boolean);
    const cur = navItems.indexOf(document.activeElement);

    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      navItems[(cur + 1) % navItems.length]?.focus();
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      navItems[(cur - 1 + navItems.length) % navItems.length]?.focus();
    } else if ((e.key === 'Enter' || e.key === 'x') && document.activeElement?.type === 'checkbox') {
      document.activeElement.click();
    } else if (e.key === 'Escape' || e.key === 'h' || e.key === 'ArrowLeft') {
      e.preventDefault();
      checkState.set(groupIndex, new Set(checkedIds(app)));
      renderGroupList(app, activeTab, groups, checkState);
    } else if (e.key === 'd') {
      e.preventDefault();
      app.querySelector('#close-btn:not(:disabled)')?.click();
    } else if (e.key === 'D') {
      e.preventDefault();
      const keepBtn = app.querySelector('#keep-current-btn:not(:disabled)') ?? app.querySelector('#close-one-btn');
      if (keepBtn) {
        keepBtn.click();
      } else {
        checkState.set(groupIndex, new Set(checkedIds(app)));
        renderGroupList(app, activeTab, groups, checkState);
      }
    } else if (e.key === '?') {
      e.preventDefault();
      toggleHints(app);
    } else if (e.key === 'q') {
      window.close();
    }
  });
}

let activeKeyHandler = null;
function setKeyHandler(fn) {
  if (activeKeyHandler) document.removeEventListener('keydown', activeKeyHandler);
  activeKeyHandler = fn;
  document.addEventListener('keydown', fn);
}

function checkedIds(app) {
  return [...app.querySelectorAll('input[type=checkbox]:checked')]
    .map(el => parseInt(el.dataset.tabId))
    .filter(id => !isNaN(id));
}


function renderLabel(label) {
  if (label.startsWith('*.')) {
    return `<span class="label-wildcard">*.</span>${esc(label.slice(2))}`;
  }
  return esc(label);
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


function formatShortcut(shortcut) {
  return shortcut
    .replace('Command+', '⌘')
    .replace('Ctrl+', '⌃')
    .replace('Alt+', '⌥')
    .replace('Shift+', '⇧');
}

function trunc(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

init();
