import { generateGroups, generateTopGroups, generateOtherGroup } from '../src/group.js';
import { parseUrl } from '../src/parse.js';

const STRATEGY_LABELS = {
  hostname: { text: 'host', tip: 'All tabs on the same hostname' },
  peer:     { text: 'peer', tip: 'All tabs on this hostname' },
  domain:   { text: 'site', tip: 'All tabs on the same site (across subdomains)' },
  top:      { text: 'big',  tip: 'One of the largest tab groups across all open tabs' },
  other:    { text: 'etc',  tip: 'Remaining tabs not in any group, oldest first' },
};

let shortcutHint = '';
let hintsVisible = false;

async function init() {
  const app = document.getElementById('app');
  try {
    const stored = await chrome.storage.local.get(['hintsVisible', 'hintsSeenOnce']);
    if (!stored.hintsSeenOnce) {
      hintsVisible = true;
      chrome.storage.local.set({ hintsSeenOnce: true, hintsVisible: true });
    } else {
      hintsVisible = stored.hintsVisible ?? false;
    }
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) return;

    const commands = await chrome.commands.getAll();
    const cmd = commands.find(c => c.name === '_execute_action');
    shortcutHint = cmd?.shortcut ? formatShortcut(cmd.shortcut) : '';

    const allTabs = await chrome.tabs.query({ currentWindow: true });
    const groups = generateGroups(activeTab, allTabs);
    const excludeIds = new Set([activeTab.id, ...groups.flatMap(g => g.tabs.map(t => t.id))]);
    const topGroups = generateTopGroups(allTabs, excludeIds);
    const topExcludeIds = new Set([...excludeIds, ...topGroups.flatMap(g => g.tabs.map(t => t.id))]);
    const otherGroup = generateOtherGroup(allTabs, topExcludeIds);
    const checkState = new Map();

    if (groups.length === 0 && topGroups.length === 0 && !otherGroup) {
      renderEmpty(app, activeTab);
    } else {
      renderGroupList(app, activeTab, groups, checkState, topGroups, otherGroup);
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
  return `<div class="key-hints">${items.map(([k, label]) => `<span class="key-hint-item"><span class="key-hint-key">${esc(k)}</span><span class="key-hint-colon">:</span><span class="key-hint-label">${esc(label)}</span></span>`).join('')}</div>`;
}

function applyHintsVisibility(app) {
  app.querySelector('.key-hints')?.classList.toggle('visible', hintsVisible);
}

function toggleHints(app) {
  hintsVisible = !hintsVisible;
  chrome.storage.local.set({ hintsVisible });
  applyHintsVisibility(app);
}

function attachHintsToggle(app) {
  applyHintsVisibility(app);
  app.querySelector('.hints-btn')?.addEventListener('click', () => toggleHints(app));
}

function tabCount(g) {
  return (['peer', 'top', 'other'].includes(g.strategy))
    ? g.tabs.length
    : g.tabs.length + 1;
}

function renderGroupList(app, activeTab, groups, checkState, topGroups = [], otherGroup = null, focusTopIndex = null, focusIndex = null) {
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
          <span class="group-count">${tabCount(g)} tabs</span>
        </li>`;
      }).join('')}
      ${topGroups.length > 0 ? `
        <li class="group-section-heading">top groups</li>
        ${topGroups.map((g, i) => `
        <li class="group-item" tabindex="0" data-top-index="${i}" data-big="true">
          <span class="strategy-badge" title="${esc(STRATEGY_LABELS.top.tip)}">${esc(STRATEGY_LABELS.top.text)}</span>
          <span class="group-label">${renderLabel(g.label)}</span>
          <span class="group-count">${g.tabs.length} tabs</span>
        </li>`).join('')}
      ` : ''}
      ${otherGroup ? `
        <li class="group-item" tabindex="0" data-other="true">
          <span class="strategy-badge" title="${esc(STRATEGY_LABELS.other.tip)}">${esc(STRATEGY_LABELS.other.text)}</span>
          <span class="group-label">${esc(otherGroup.label)}</span>
          <span class="group-count">${otherGroup.tabs.length} tabs</span>
        </li>
      ` : ''}
    </ul>
    ${keyHints([...(shortcutHint ? [[shortcutHint, 'open popup']] : []), ['j/k/↑/↓','navigate'],['l/o/→/↵/spc','open'],['d','close all'],['D','keep current'],['q','quit']])}
  `;

  attachHintsToggle(app);
  app.querySelectorAll('.group-item').forEach(el => {
    el.addEventListener('click', () => {
      if (el.dataset.other === 'true') {
        renderChecklist(
          app, activeTab, otherGroup,
          () => renderGroupList(app, activeTab, groups, checkState, topGroups, otherGroup),
          checkState, 'other'
        );
      } else if (el.dataset.big === 'true') {
        const topI = parseInt(el.dataset.topIndex);
        renderTopChecklist(app, activeTab, topGroups[topI], topI, groups, checkState, topGroups, otherGroup);
      } else {
        const i = parseInt(el.dataset.index);
        renderChecklist(
          app, activeTab, groups[i],
          () => renderGroupList(app, activeTab, groups, checkState, topGroups, otherGroup, null, i),
          checkState, i
        );
      }
    });
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.click(); } });
  });

  (focusTopIndex !== null
    ? app.querySelector(`[data-top-index="${focusTopIndex}"]`)
    : focusIndex !== null
      ? app.querySelector(`[data-index="${focusIndex}"]`)
      : app.querySelector('.group-item')
  )?.focus();

  setKeyHandler(e => {
    const items = [...app.querySelectorAll('.group-item')];
    const cur = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); items[(cur + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); items[(cur - 1 + items.length) % items.length]?.focus(); }
    else if ((e.key === 'l' || e.key === 'o' || e.key === 'ArrowRight' || e.key === ' ') && cur !== -1) { e.preventDefault(); items[cur].click(); }
    else if (e.key === '?') { e.preventDefault(); toggleHints(app); }
    else if (e.key === 'Escape' || e.key === 'q') window.close();
    else if ((e.key === 'd' || e.key === 'D') && cur !== -1) {
      e.preventDefault();
      const isOther = items[cur].dataset.other === 'true';
      const isBig = items[cur].dataset.big === 'true';
      if (isOther) {
        if (e.key === 'D') return;
        (async () => {
          try { await chrome.tabs.remove(otherGroup.tabs.map(t => t.id)); } catch {}
          init();
        })();
      } else if (isBig) {
        if (e.key === 'D') return;
        const topI = parseInt(items[cur].dataset.topIndex);
        (async () => {
          try { await chrome.tabs.remove(topGroups[topI].tabs.map(t => t.id)); } catch {}
          const freshAllTabs = await chrome.tabs.query({ currentWindow: true });
          const newExcludeIds = new Set([activeTab.id, ...groups.flatMap(g => g.tabs.map(t => t.id))]);
          const newTopGroups = generateTopGroups(freshAllTabs, newExcludeIds);
          const newTopExcludeIds = new Set([...newExcludeIds, ...newTopGroups.flatMap(g => g.tabs.map(t => t.id))]);
          const newOtherGroup = generateOtherGroup(freshAllTabs, newTopExcludeIds);
          if (groups.length === 0 && newTopGroups.length === 0 && !newOtherGroup) { window.close(); return; }
          renderGroupList(app, activeTab, groups, checkState, newTopGroups, newOtherGroup);
          const newItems = [...app.querySelectorAll('.group-item')];
          newItems[Math.min(cur, newItems.length - 1)]?.focus();
        })();
      } else {
        const i = parseInt(items[cur].dataset.index);
        if (e.key === 'D') {
          if (groups[i].tabs.length === 0) return;
          chrome.tabs.remove(groups[i].tabs.map(t => t.id)).catch(() => {});
          const newGroups = groups.filter((_, idx) => idx !== i);
          if (newGroups.length === 0 && topGroups.length === 0 && !otherGroup) { window.close(); return; }
          renderGroupList(app, activeTab, newGroups, checkState, topGroups, otherGroup);
          const newItems = [...app.querySelectorAll('.group-item')];
          newItems[Math.min(cur, newItems.length - 1)]?.focus();
        } else {
          (async () => {
            try { await chrome.tabs.remove([...groups[i].tabs.map(t => t.id), activeTab.id]); } catch {}
            const [newActiveTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!newActiveTab) { window.close(); return; }
            const freshAllTabs = await chrome.tabs.query({ currentWindow: true });
            const newGroups = generateGroups(newActiveTab, freshAllTabs);
            const newExcludeIds = new Set([newActiveTab.id, ...newGroups.flatMap(g => g.tabs.map(t => t.id))]);
            const newTopGroups = generateTopGroups(freshAllTabs, newExcludeIds);
            const newTopExcludeIds = new Set([...newExcludeIds, ...newTopGroups.flatMap(g => g.tabs.map(t => t.id))]);
            const newOtherGroup = generateOtherGroup(freshAllTabs, newTopExcludeIds);
            if (newGroups.length === 0 && newTopGroups.length === 0 && !newOtherGroup) { window.close(); return; }
            renderGroupList(app, newActiveTab, newGroups, checkState, newTopGroups, newOtherGroup);
          })();
        }
      }
    }
  });
}

function renderTopChecklist(app, activeTab, bigGroup, topI, groups, checkState, topGroups, otherGroup = null) {
  const backFn = () => renderGroupList(app, activeTab, groups, checkState, topGroups, otherGroup, topI);

  app.innerHTML = `
    <div class="header">
      <div class="header-row">
        <div class="current-tab">${esc(bigGroup.label)}</div>
      </div>
    </div>
    <ul class="checklist">
      ${bigGroup.tabs.map(t => `
        <li class="check-item">
          <label>
            <input type="checkbox" data-tab-id="${t.id}">
            ${t.favIconUrl ? `<img class="favicon" src="${esc(t.favIconUrl)}" alt="">` : '<span class="favicon-placeholder"></span>'}
            <span title="${esc(t.url || '')}">${esc(trunc(t.title, 38))}</span>
          </label>
        </li>`).join('')}
    </ul>
    ${keyHints([['j/k','navigate'],['spc/x','toggle'],['l/o','open tab'],['*a/*n','all/none'],['e','close tab'],['d','close checked'],['h/esc','back'],['q','quit']])}
  `;

  applyHintsVisibility(app);

  app.querySelectorAll('img.favicon').forEach(img => {
    img.addEventListener('error', () => { img.style.display = 'none'; });
  });

  app.querySelectorAll('input[type=checkbox]')[0]?.focus();

  let pendingChord = null;
  let chordTimer = null;
  function clearChord() { pendingChord = null; clearTimeout(chordTimer); chordTimer = null; }

  setKeyHandler(async e => {
    if (pendingChord === '*') {
      clearChord();
      if (e.key === 'a') {
        e.preventDefault();
        app.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = true; });
        return;
      } else if (e.key === 'n') {
        e.preventDefault();
        app.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = false; });
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

    const checkboxes = [...app.querySelectorAll('input[type=checkbox]')];
    const cur = checkboxes.indexOf(document.activeElement);

    if (e.key === 'j') {
      e.preventDefault();
      checkboxes[(cur + 1) % checkboxes.length]?.focus();
    } else if (e.key === 'k') {
      e.preventDefault();
      checkboxes[(cur - 1 + checkboxes.length) % checkboxes.length]?.focus();
    } else if ((e.key === 'Enter' || e.key === 'x') && document.activeElement?.type === 'checkbox') {
      document.activeElement.click();
    } else if ((e.key === 'l' || e.key === 'o') && document.activeElement?.type === 'checkbox') {
      e.preventDefault();
      try { await chrome.tabs.update(parseInt(document.activeElement.dataset.tabId), { active: true }); } catch {}
      window.close();
    } else if (e.key === 'h') {
      e.preventDefault();
      backFn();
    } else if (e.key === 'Escape') {
      window.close();
    } else if (e.key === 'e' && document.activeElement?.type === 'checkbox') {
      e.preventDefault();
      await closeTab(document.activeElement, app, checkboxes, backFn);
    } else if (e.key === 'd') {
      e.preventDefault();
      const toClose = checkedIds(app);
      if (!toClose.length) return;
      try { await chrome.tabs.remove(toClose); } catch {}
      const toCloseSet = new Set(toClose);
      app.querySelectorAll('input[type=checkbox]').forEach(cb => {
        if (toCloseSet.has(parseInt(cb.dataset.tabId))) cb.closest('.check-item')?.remove();
      });
      const remaining = [...app.querySelectorAll('input[type=checkbox]')];
      if (!remaining.length) { init(); return; }
      remaining[0].focus();
    } else if (e.key === '?') {
      e.preventDefault();
      toggleHints(app);
    } else if (e.key === 'q') {
      window.close();
    }
  });
}

function renderChecklist(app, activeTab, group, backFn, checkState, stateKey) {
  const allGroupTabs = (['recency', 'newtab', 'peer', 'other'].includes(group.strategy)) ? group.tabs : [activeTab, ...group.tabs];
  const hasActive = allGroupTabs.some(t => t.id === activeTab.id);
  const savedIds = checkState.get(stateKey);

  app.innerHTML = `
    <div class="header">
      <div class="header-row">
        <div class="current-tab">${esc(group.label)}</div>
      </div>
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
    ${keyHints([['j/k','navigate'],['spc/x','toggle'],['l/o','open tab'],['*a/*n','all/none'],['e','close tab'],['d','close checked'],['D','keep current'],['h/esc','back'],['q','quit']])}
  `;

  applyHintsVisibility(app);

  app.querySelectorAll('img.favicon').forEach(img => {
    img.addEventListener('error', () => { img.style.display = 'none'; });
  });

  app.querySelectorAll('input[type=checkbox]')[0]?.focus();

  let pendingChord = null;
  let chordTimer = null;

  function clearChord() {
    pendingChord = null;
    clearTimeout(chordTimer);
    chordTimer = null;
  }

  setKeyHandler(async e => {
    if (pendingChord === '*') {
      clearChord();
      if (e.key === 'a') {
        e.preventDefault();
        app.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = true; });
        return;
      } else if (e.key === 'n') {
        e.preventDefault();
        app.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = false; });
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

    const checkboxes = [...app.querySelectorAll('input[type=checkbox]')];
    const cur = checkboxes.indexOf(document.activeElement);

    if (e.key === 'j') {
      e.preventDefault();
      checkboxes[(cur + 1) % checkboxes.length]?.focus();
    } else if (e.key === 'k') {
      e.preventDefault();
      checkboxes[(cur - 1 + checkboxes.length) % checkboxes.length]?.focus();
    } else if ((e.key === 'Enter' || e.key === 'x') && document.activeElement?.type === 'checkbox') {
      document.activeElement.click();
    } else if ((e.key === 'l' || e.key === 'o') && document.activeElement?.type === 'checkbox') {
      e.preventDefault();
      try { await chrome.tabs.update(parseInt(document.activeElement.dataset.tabId), { active: true }); } catch {}
      window.close();
    } else if (e.key === 'h') {
      e.preventDefault();
      checkState.set(stateKey, new Set(checkedIds(app)));
      backFn();
    } else if (e.key === 'Escape') {
      window.close();
    } else if (e.key === 'e' && document.activeElement?.type === 'checkbox') {
      e.preventDefault();
      await closeTab(document.activeElement, app, checkboxes, backFn);
    } else if (e.key === 'd') {
      e.preventDefault();
      const toClose = checkedIds(app);
      if (!toClose.length) return;
      try { await chrome.tabs.remove(toClose); } catch {}
      const toCloseSet = new Set(toClose);
      app.querySelectorAll('input[type=checkbox]').forEach(cb => {
        if (toCloseSet.has(parseInt(cb.dataset.tabId))) cb.closest('.check-item')?.remove();
      });
      const remaining = [...app.querySelectorAll('input[type=checkbox]')];
      if (!remaining.length) { init(); return; }
      remaining[0].focus();
    } else if (e.key === 'D') {
      e.preventDefault();
      if (hasActive) {
        const toClose = allGroupTabs.filter(t => t.id !== activeTab.id).map(t => t.id);
        if (!toClose.length) return;
        try { await chrome.tabs.remove(toClose); } catch {}
        window.close();
      } else {
        try { await chrome.tabs.remove(activeTab.id); } catch {}
        window.close();
      }
    } else if (e.key === '?') {
      e.preventDefault();
      toggleHints(app);
    } else if (e.key === 'q') {
      window.close();
    }
  });
}

async function closeTab(cb, app, checkboxes, backFn) {
  const tabId = parseInt(cb.dataset.tabId);
  const idx = checkboxes.indexOf(cb);
  try { await chrome.tabs.remove(tabId); } catch {}
  cb.closest('.check-item')?.remove();
  const remaining = [...app.querySelectorAll('input[type=checkbox]')];
  if (!remaining.length) { init(); return; }
  (remaining[idx] ?? remaining[remaining.length - 1])?.focus();
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
