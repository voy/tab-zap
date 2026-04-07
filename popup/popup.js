import { generateGroups, generateTopGroups, generateCustomGroups } from '../src/group.js';
import { parseUrl } from '../src/parse.js';

const STRATEGY_LABELS = {
  hostname: { text: 'host', tip: 'All tabs on the same hostname' },
  peer:     { text: 'peer', tip: 'All tabs on this hostname' },
  domain:   { text: 'site', tip: 'All tabs on the same site (across subdomains)' },
  recency:  { text: 'age',  tip: 'Tabs not accessed recently' },
  newtab:   { text: 'new',  tip: 'New tab pages that were never used' },
  top:      { text: 'big',  tip: 'One of the largest tab groups across all open tabs' },
  custom:   { text: 'my',   tip: 'Your custom tab group' },
};

let shortcutHint = '';
let hintsVisible = false;
let pinnedDuplicateHostname = null;

async function loadCustomGroups() {
  try {
    const result = await chrome.storage.local.get('customGroups');
    return result.customGroups ?? [];
  } catch {
    return [];
  }
}

async function saveCustomGroups(defs) {
  try {
    await chrome.storage.local.set({ customGroups: defs });
  } catch {}
}

function domainsFromGroup(g, activeTab) {
  const baseTabs = (g.strategy === 'hostname' || g.strategy === 'domain')
    ? [activeTab, ...g.tabs]
    : g.tabs;
  const seen = new Set();
  for (const t of baseTabs) {
    const p = parseUrl(t.url);
    if (p?.hostname) seen.add(p.hostname);
  }
  return [...seen];
}

function domainsHint(domains) {
  if (!domains.length) return '';
  if (domains.length <= 2) return domains.join(' · ');
  return `${domains[0]} +${domains.length - 1}`;
}

async function init({ focusDefId = null } = {}) {
  const app = document.getElementById('app');
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) return;

    const commands = await chrome.commands.getAll();
    const cmd = commands.find(c => c.name === '_execute_action');
    shortcutHint = cmd?.shortcut ? formatShortcut(cmd.shortcut) : '';

    const allTabs = await chrome.tabs.query({ currentWindow: true });
    if (!activeTab.pinned) {
      const activeParsed = parseUrl(activeTab.url);
      if (activeParsed) {
        const pinned = allTabs.find(t => t.pinned && t.id !== activeTab.id && parseUrl(t.url)?.hostname === activeParsed.hostname);
        pinnedDuplicateHostname = pinned ? activeParsed.hostname : null;
      }
    }

    const customGroupDefs = await loadCustomGroups();
    const customGroups = generateCustomGroups(allTabs, customGroupDefs);
    const activeDefIds = new Set(customGroups.map(g => g.defId));
    const dormantDefs = customGroupDefs.filter(d => !activeDefIds.has(d.id));
    const groups = generateGroups(activeTab, allTabs);
    const excludeIds = new Set([activeTab.id, ...groups.flatMap(g => g.tabs.map(t => t.id))]);
    const topGroups = generateTopGroups(allTabs, excludeIds);
    const checkState = new Map();

    if (customGroups.length === 0 && dormantDefs.length === 0 && groups.length === 0 && topGroups.length === 0) {
      renderEmpty(app, activeTab);
    } else {
      const focusCustomIndex = focusDefId != null
        ? (customGroups.findIndex(g => g.defId === focusDefId) || null)
        : null;
      renderGroupList(app, activeTab, groups, checkState, topGroups, customGroups, customGroupDefs, dormantDefs, null, null, focusCustomIndex >= 0 ? focusCustomIndex : null);
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
  applyHintsVisibility(app);
}

function attachHintsToggle(app) {
  applyHintsVisibility(app);
  app.querySelector('.hints-btn')?.addEventListener('click', () => toggleHints(app));
}

function tabCount(g) {
  return (['recency', 'newtab', 'peer', 'top', 'custom'].includes(g.strategy))
    ? g.tabs.length
    : g.tabs.length + 1;
}

// ── Inline group creation flows ──────────────────────────────────────────────

function startNaming(li, domains, onSave, onCancel) {
  const hint = domainsHint(domains);
  li.innerHTML = `
    <input class="group-name-input" placeholder="Name this group…" autocomplete="off" spellcheck="false">
    ${hint ? `<span class="naming-hint">${esc(hint)}</span>` : ''}
  `;
  const input = li.querySelector('input');
  input.focus();

  setKeyHandler(e => { if (e.key === 'q') window.close(); });

  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter' && input.value.trim()) { e.preventDefault(); onSave(input.value.trim()); }
    else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  });
}

function startAbsorb(li, customGroupDefs, onPick, onCancel) {
  li.innerHTML = `
    <span class="absorb-label">Add to:</span>
    <span class="absorb-list">
      ${customGroupDefs.map((def, i) => `<button class="absorb-item" data-def-index="${i}">${esc(def.name)}</button>`).join('')}
    </span>
  `;
  const btns = [...li.querySelectorAll('.absorb-item')];
  btns[0]?.focus();

  setKeyHandler(e => { if (e.key === 'q') window.close(); });

  btns.forEach(btn => {
    btn.addEventListener('click', () => onPick(parseInt(btn.dataset.defIndex)));
    btn.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(parseInt(btn.dataset.defIndex)); }
      else if (e.key === 'ArrowRight' || e.key === 'l') { e.preventDefault(); btns[(btns.indexOf(btn) + 1) % btns.length]?.focus(); }
      else if (e.key === 'ArrowLeft' || e.key === 'h') { e.preventDefault(); btns[(btns.indexOf(btn) - 1 + btns.length) % btns.length]?.focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    });
  });
}

function confirmAbsorb(li, groupName, verb = 'added to') {
  li.innerHTML = `<span class="absorb-confirm">${esc(verb)} ${esc(groupName)}</span>`;
  setTimeout(() => init(), 800);
}

function startEditing(li, initDef, initDefs, count) {
  let currentDef = { ...initDef, domains: [...initDef.domains] };
  let currentDefs = initDefs.map(d => ({ ...d }));

  function saveNameAndInit() {
    const input = li.querySelector('.edit-name-input');
    const name = input?.value.trim();
    if (name && name !== currentDef.name) {
      currentDef = { ...currentDef, name };
      currentDefs = currentDefs.map(d => d.id === currentDef.id ? currentDef : d);
    }
    saveCustomGroups(currentDefs).then(() => init({ focusDefId: currentDef.id }));
  }

  function render(focusTarget = 'name') {
    li.className = 'group-item group-item--editing';
    li.innerHTML = `
      <div class="edit-top-row">
        <span class="strategy-badge" title="${esc(STRATEGY_LABELS.custom.tip)}">my</span>
        <input class="edit-name-input" value="${esc(currentDef.name)}" autocomplete="off" spellcheck="false">
        <span class="group-count">${count} tab${count === 1 ? '' : 's'}</span>
      </div>
      <div class="edit-domains-row">
        ${currentDef.domains.map(d => `<button class="domain-chip" data-domain="${esc(d)}">${esc(d)}<span class="chip-x" aria-hidden="true">×</span></button>`).join('')}
        <input class="edit-add-input" placeholder="add…" autocomplete="off" spellcheck="false">
        <button class="edit-delete-btn">delete</button>
      </div>
    `;

    const nameInput = li.querySelector('.edit-name-input');
    const addInput = li.querySelector('.edit-add-input');
    const chips = [...li.querySelectorAll('.domain-chip')];

    if (focusTarget === 'name') { nameInput.focus(); nameInput.select(); }
    else if (focusTarget === 'add') addInput.focus();
    else if (typeof focusTarget === 'number') {
      const target = chips[Math.min(focusTarget, chips.length - 1)];
      (target ?? addInput).focus();
    }

    async function removeDomain(domain) {
      const idx = currentDef.domains.indexOf(domain);
      currentDef = { ...currentDef, domains: currentDef.domains.filter(d => d !== domain) };
      currentDefs = currentDefs.map(d => d.id === currentDef.id ? currentDef : d);
      await saveCustomGroups(currentDefs);
      render(idx); // focus chip at same position (or add input if last)
    }

    nameInput.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); saveNameAndInit(); }
    });

    chips.forEach(chip => {
      chip.addEventListener('click', () => removeDomain(chip.dataset.domain));
      chip.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === 'x' || e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault(); removeDomain(chip.dataset.domain);
        } else if (e.key === 'Escape') { e.preventDefault(); saveNameAndInit(); }
        else if (e.key === 'Tab' && !e.shiftKey && chip === chips[chips.length - 1]) {
          e.preventDefault(); addInput.focus();
        }
      });
    });

    addInput.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); saveNameAndInit(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const raw = addInput.value.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split('?')[0];
        if (!raw) return;
        const isWildcard = raw.startsWith('*.');
        const domain = isWildcard ? raw : (parseUrl('https://' + raw)?.hostname ?? raw);
        if (!domain || currentDef.domains.includes(domain)) { addInput.value = ''; return; }
        currentDef = { ...currentDef, domains: [...currentDef.domains, domain] };
        currentDefs = currentDefs.map(d => d.id === currentDef.id ? currentDef : d);
        saveCustomGroups(currentDefs).then(() => render('add'));
      }
    });

    li.querySelector('.edit-delete-btn').addEventListener('click', async () => {
      await saveCustomGroups(currentDefs.filter(d => d.id !== currentDef.id));
      init();
    });
    li.querySelector('.edit-delete-btn').addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); saveNameAndInit(); }
    });
  }

  render();

  setKeyHandler(e => {
    if (e.key === 'Escape' || e.key === 'e') { e.preventDefault(); saveNameAndInit(); }
    else if (e.key === 'q') window.close();
  });
}


// ── Group list ────────────────────────────────────────────────────────────────

function renderGroupList(app, activeTab, groups, checkState, topGroups = [], customGroups = [], customGroupDefs = [], dormantDefs = [], focusTopIndex = null, focusIndex = null, focusCustomIndex = null, showAllCustom = false) {
  const hasCustom = customGroups.length > 0 || dormantDefs.length > 0;
  const hasAutoGroups = groups.length > 0 || topGroups.length > 0;
  const showDormant = showAllCustom && dormantDefs.length > 0;
  app.innerHTML = `
    <div class="header">
      <div class="header-row">
        <div class="app-title">Current Tab</div>
        <button class="hints-btn" title="Keyboard shortcuts">?</button>
      </div>
      <div class="current-tab">${esc(trunc(activeTab.title, 42))}</div>
    </div>
    <ul class="group-list">
      ${hasCustom ? `<li class="group-section-heading">my groups${dormantDefs.length && !showAllCustom ? `<button class="manage-btn" data-manage="true" tabindex="0">+${dormantDefs.length} more</button>` : ''}</li>` : ''}
      ${customGroups.map((g, i) => `
      <li class="group-item" tabindex="0" data-custom-index="${i}">
        <span class="strategy-badge" title="${esc(STRATEGY_LABELS.custom.tip)}">${esc(STRATEGY_LABELS.custom.text)}</span>
        <span class="group-label">${esc(g.label)}</span>
        <span class="group-count">${tabCount(g)} tab${tabCount(g) === 1 ? '' : 's'}</span>
      </li>`).join('')}
      ${showDormant ? dormantDefs.map((def, i) => `
      <li class="group-item group-item--dormant" tabindex="0" data-dormant-index="${i}">
        <span class="strategy-badge" title="${esc(STRATEGY_LABELS.custom.tip)}">${esc(STRATEGY_LABELS.custom.text)}</span>
        <span class="group-label">${esc(def.name)}</span>
        <span class="group-count">no tabs</span>
      </li>`).join('') : ''}
      ${groups.length > 0 ? `<li class="group-section-heading">related</li>` : ''}
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
    </ul>
    ${pinnedDuplicateHostname ? `<div class="pinned-footnote"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg> pinned copy is open</div>` : ''}
    ${keyHints([...(shortcutHint ? [[shortcutHint, 'open popup']] : []), ['j/k/↑/↓','navigate'],['l/o/→/↵/spc','open'],['s','save as group'],['a','add to group'],['e','edit group'],['d','close all'],['D','keep current'],['q','quit']])}
  `;

  attachHintsToggle(app);

  app.querySelectorAll('.group-item').forEach(el => {
    el.addEventListener('click', () => openItem(el));
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); openItem(el); } });
  });

  app.querySelector('[data-manage]')?.addEventListener('click', () =>
    renderGroupList(app, activeTab, groups, checkState, topGroups, customGroups, customGroupDefs, dormantDefs, null, null, null, true));

  function openItem(el) {
    if (el.dataset.dormantIndex !== undefined) {
      const di = parseInt(el.dataset.dormantIndex);
      startEditing(el, dormantDefs[di], customGroupDefs, 0);
    } else if (el.dataset.customIndex !== undefined) {
      const ci = parseInt(el.dataset.customIndex);
      renderChecklist(
        app, activeTab, customGroups[ci],
        () => renderGroupList(app, activeTab, groups, checkState, topGroups, customGroups, customGroupDefs, dormantDefs, null, null, ci, showAllCustom),
        checkState, 'custom:' + customGroups[ci].defId
      );
    } else if (el.dataset.big === 'true') {
      const topI = parseInt(el.dataset.topIndex);
      renderTopChecklist(app, activeTab, topGroups[topI], topI, groups, checkState, topGroups, customGroups, customGroupDefs, dormantDefs);
    } else {
      const i = parseInt(el.dataset.index);
      renderChecklist(
        app, activeTab, groups[i],
        () => renderGroupList(app, activeTab, groups, checkState, topGroups, customGroups, customGroupDefs, dormantDefs, null, i, null, showAllCustom),
        checkState, i
      );
    }
  }

  if (focusCustomIndex !== null) app.querySelector(`[data-custom-index="${focusCustomIndex}"]`)?.focus();
  else if (focusTopIndex !== null) app.querySelector(`[data-top-index="${focusTopIndex}"]`)?.focus();
  else if (focusIndex !== null) app.querySelector(`[data-index="${focusIndex}"]`)?.focus();
  else (app.querySelector('.group-item[data-index]') ?? app.querySelector('.group-item'))?.focus();

  const cancelBack = () => renderGroupList(app, activeTab, groups, checkState, topGroups, customGroups, customGroupDefs, dormantDefs, focusTopIndex, focusIndex, focusCustomIndex, showAllCustom);

  setKeyHandler(e => {
    const manageBtn = app.querySelector('.manage-btn[data-manage]');
    const items = [...app.querySelectorAll('.group-item')];
    const navItems = [...(manageBtn ? [manageBtn] : []), ...items];
    const navCur = navItems.indexOf(document.activeElement);
    const cur = items.indexOf(document.activeElement);
    const isCustom = cur !== -1 && items[cur].dataset.customIndex !== undefined;
    const isDormant = cur !== -1 && items[cur].dataset.dormantIndex !== undefined;
    const isTop = cur !== -1 && items[cur].dataset.big === 'true';

    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); navItems[(navCur + 1) % navItems.length]?.focus(); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); navItems[(navCur - 1 + navItems.length) % navItems.length]?.focus(); }
    else if ((e.key === 'l' || e.key === 'o' || e.key === 'ArrowRight' || e.key === ' ') && cur !== -1 && !isDormant) { e.preventDefault(); openItem(items[cur]); }
    else if (e.key === '?') { e.preventDefault(); toggleHints(app); }
    else if (e.key === 'Escape' || e.key === 'q') window.close();

    else if (e.key === 's' && cur !== -1 && !isCustom && !isDormant) {
      e.preventDefault();
      const g = isTop ? topGroups[parseInt(items[cur].dataset.topIndex)] : groups[parseInt(items[cur].dataset.index)];
      const domains = domainsFromGroup(g, activeTab);
      startNaming(items[cur], domains, async name => {
        const newDef = { id: Date.now().toString(36), name, domains };
        await saveCustomGroups([...customGroupDefs, newDef]);
        confirmAbsorb(items[cur], name);
      }, cancelBack);
    }

    else if (e.key === 'a' && cur !== -1 && !isCustom && !isDormant) {
      e.preventDefault();
      const g = isTop ? topGroups[parseInt(items[cur].dataset.topIndex)] : groups[parseInt(items[cur].dataset.index)];
      const domains = domainsFromGroup(g, activeTab);
      if (customGroupDefs.length === 0) {
        startNaming(items[cur], domains, async name => {
          await saveCustomGroups([{ id: Date.now().toString(36), name, domains }]);
          confirmAbsorb(items[cur], name);
        }, cancelBack);
      } else if (customGroupDefs.length === 1) {
        (async () => {
          const def = customGroupDefs[0];
          const merged = [...new Set([...def.domains, ...domains])];
          await saveCustomGroups([{ ...def, domains: merged }]);
          confirmAbsorb(items[cur], def.name);
        })();
      } else {
        startAbsorb(items[cur], customGroupDefs, async defIndex => {
          const def = customGroupDefs[defIndex];
          const merged = [...new Set([...def.domains, ...domains])];
          await saveCustomGroups(customGroupDefs.map(d => d.id === def.id ? { ...d, domains: merged } : d));
          confirmAbsorb(items[cur], def.name);
        }, cancelBack);
      }
    }

    else if (e.key === 'e' && cur !== -1 && (isCustom || isDormant)) {
      e.preventDefault();
      if (isDormant) {
        const di = parseInt(items[cur].dataset.dormantIndex);
        startEditing(items[cur], dormantDefs[di], customGroupDefs, 0);
      } else {
        const ci = parseInt(items[cur].dataset.customIndex);
        const def = customGroupDefs.find(d => d.id === customGroups[ci].defId);
        if (def) startEditing(items[cur], def, customGroupDefs, tabCount(customGroups[ci]));
      }
    }

    else if ((e.key === 'd' || e.key === 'D') && cur !== -1) {
      e.preventDefault();
      if (isDormant) {
        // no tabs to close
      } else if (isCustom) {
        const ci = parseInt(items[cur].dataset.customIndex);
        (async () => {
          try { await chrome.tabs.remove(customGroups[ci].tabs.map(t => t.id)); } catch {}
          init();
        })();
      } else if (isTop) {
        if (e.key === 'D') return;
        const topI = parseInt(items[cur].dataset.topIndex);
        (async () => {
          try { await chrome.tabs.remove(topGroups[topI].tabs.map(t => t.id)); } catch {}
          const freshAllTabs = await chrome.tabs.query({ currentWindow: true });
          const newExcludeIds = new Set([activeTab.id, ...groups.flatMap(g => g.tabs.map(t => t.id))]);
          const newTopGroups = generateTopGroups(freshAllTabs, newExcludeIds);
          if (customGroups.length === 0 && dormantDefs.length === 0 && groups.length === 0 && newTopGroups.length === 0) { window.close(); return; }
          renderGroupList(app, activeTab, groups, checkState, newTopGroups, customGroups, customGroupDefs, dormantDefs);
          const newItems = [...app.querySelectorAll('.group-item')];
          newItems[Math.min(cur, newItems.length - 1)]?.focus();
        })();
      } else {
        const i = parseInt(items[cur].dataset.index);
        if (e.key === 'D') {
          if (groups[i].tabs.length === 0) return;
          chrome.tabs.remove(groups[i].tabs.map(t => t.id)).catch(() => {});
          const newGroups = groups.filter((_, idx) => idx !== i);
          if (customGroups.length === 0 && dormantDefs.length === 0 && newGroups.length === 0 && topGroups.length === 0) { window.close(); return; }
          renderGroupList(app, activeTab, newGroups, checkState, topGroups, customGroups, customGroupDefs, dormantDefs);
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
            if (newGroups.length === 0 && newTopGroups.length === 0) { window.close(); return; }
            renderGroupList(app, newActiveTab, newGroups, checkState, newTopGroups);
          })();
        }
      }
    }
  });
}

// ── Checklists ────────────────────────────────────────────────────────────────

function renderTopChecklist(app, activeTab, bigGroup, topI, groups, checkState, topGroups, customGroups = [], customGroupDefs = [], dormantDefs = []) {
  const backFn = () => renderGroupList(app, activeTab, groups, checkState, topGroups, customGroups, customGroupDefs, dormantDefs, topI);

  app.innerHTML = `
    <div class="header">
      <div class="header-row">
        <button class="back-btn" title="Back"><svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 2L3.5 5l3 3"/></svg></button>
        <button class="hints-btn" title="Keyboard shortcuts">?</button>
      </div>
    </div>
    <div class="actions actions-top">
      <button class="btn btn-primary" id="close-btn" disabled>Close checked tabs</button>
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
    ${keyHints([['j/k/↑/↓','navigate'],['h/←','back'],['x','toggle'],['*a','select all'],['*n','deselect all'],['d','close checked'],['q','quit']])}
  `;

  attachHintsToggle(app);
  app.querySelectorAll('img.favicon').forEach(img => img.addEventListener('error', () => { img.style.display = 'none'; }));

  function updateCloseButton() {
    const count = checkedIds(app).length;
    const btn = app.querySelector('#close-btn');
    btn.textContent = count > 0 ? `Close ${count} tab${count === 1 ? '' : 's'}` : 'Close checked tabs';
    btn.disabled = count === 0;
  }

  updateCloseButton();
  app.querySelector('.checklist').addEventListener('change', updateCloseButton);
  app.querySelector('.back-btn').addEventListener('click', backFn);
  app.querySelector('#close-btn').addEventListener('click', async () => {
    const toClose = checkedIds(app);
    if (!toClose.length) return;
    try { await chrome.tabs.remove(toClose); } catch {}
    window.close();
  });

  app.querySelectorAll('input[type=checkbox]')[0]?.focus();

  let pendingChord = null, chordTimer = null;
  function clearChord() { pendingChord = null; clearTimeout(chordTimer); chordTimer = null; }

  setKeyHandler(e => {
    if (pendingChord === '*') {
      clearChord();
      if (e.key === 'a') { e.preventDefault(); app.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = true; }); updateCloseButton(); return; }
      if (e.key === 'n') { e.preventDefault(); app.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = false; }); updateCloseButton(); app.querySelector('#close-btn')?.focus(); return; }
    }
    if (e.key === '*') { e.preventDefault(); clearChord(); pendingChord = '*'; chordTimer = setTimeout(clearChord, 1500); return; }

    const navItems = [app.querySelector('.back-btn'), app.querySelector('#close-btn:not(:disabled)'), ...app.querySelectorAll('input[type=checkbox]')].filter(Boolean);
    const cur = navItems.indexOf(document.activeElement);
    const effectiveCur = document.activeElement === app.querySelector('.hints-btn') ? 0 : cur;

    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); effectiveCur === -1 ? app.querySelectorAll('input[type=checkbox]')[0]?.focus() : navItems[(effectiveCur + 1) % navItems.length]?.focus(); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); effectiveCur === -1 ? [...app.querySelectorAll('input[type=checkbox]')].at(-1)?.focus() : navItems[(effectiveCur - 1 + navItems.length) % navItems.length]?.focus(); }
    else if ((e.key === 'Enter' || e.key === 'x') && document.activeElement?.type === 'checkbox') { document.activeElement.click(); }
    else if (e.key === 'Escape' || e.key === 'h' || e.key === 'ArrowLeft') { e.preventDefault(); backFn(); }
    else if (e.key === 'd') { e.preventDefault(); app.querySelector('#close-btn:not(:disabled)')?.click(); }
    else if (e.key === '?') { e.preventDefault(); toggleHints(app); }
    else if (e.key === 'q') window.close();
  });
}

function renderChecklist(app, activeTab, group, backFn, checkState, stateKey) {
  const allGroupTabs = (['recency', 'newtab', 'peer', 'custom'].includes(group.strategy))
    ? group.tabs
    : [activeTab, ...group.tabs];
  const savedIds = checkState.get(stateKey);

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
  app.querySelectorAll('img.favicon').forEach(img => img.addEventListener('error', () => { img.style.display = 'none'; }));

  function updateCloseButton() {
    const count = checkedIds(app).length;
    const btn = app.querySelector('#close-btn');
    btn.textContent = count > 0 ? `Close ${count} tab${count === 1 ? '' : 's'}` : 'Close checked tabs';
    btn.disabled = count === 0;
  }

  updateCloseButton();
  app.querySelector('.checklist').addEventListener('change', updateCloseButton);
  app.querySelector('.back-btn').addEventListener('click', () => { checkState.set(stateKey, new Set(checkedIds(app))); backFn(); });
  app.querySelector('#keep-current-btn')?.addEventListener('click', async () => {
    try { await chrome.tabs.remove(allGroupTabs.filter(t => t.id !== activeTab.id).map(t => t.id)); } catch {}
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

  let pendingChord = null, chordTimer = null;
  function clearChord() { pendingChord = null; clearTimeout(chordTimer); chordTimer = null; }

  setKeyHandler(e => {
    if (pendingChord === '*') {
      clearChord();
      if (e.key === 'a') { e.preventDefault(); app.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = true; }); updateCloseButton(); return; }
      if (e.key === 'n') { e.preventDefault(); app.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = false; }); updateCloseButton(); app.querySelectorAll('input[type=checkbox]')[0]?.focus(); return; }
    }
    if (e.key === '*') { e.preventDefault(); clearChord(); pendingChord = '*'; chordTimer = setTimeout(clearChord, 1500); return; }

    const navItems = [
      app.querySelector('.back-btn'),
      app.querySelector('#close-btn:not(:disabled)'),
      app.querySelector('#keep-current-btn:not(:disabled)') ?? app.querySelector('#close-one-btn'),
      ...app.querySelectorAll('input[type=checkbox]'),
    ].filter(Boolean);
    const cur = navItems.indexOf(document.activeElement);
    const effectiveCur = document.activeElement === app.querySelector('.hints-btn') ? 0 : cur;
    const checkboxes = [...app.querySelectorAll('input[type=checkbox]')];

    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); effectiveCur === -1 ? checkboxes[0]?.focus() : navItems[(effectiveCur + 1) % navItems.length]?.focus(); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); effectiveCur === -1 ? checkboxes.at(-1)?.focus() : navItems[(effectiveCur - 1 + navItems.length) % navItems.length]?.focus(); }
    else if ((e.key === 'l' || e.key === 'ArrowRight') && document.activeElement === app.querySelector('.back-btn')) { e.preventDefault(); app.querySelector('.hints-btn')?.focus(); }
    else if ((e.key === 'Enter' || e.key === 'x') && document.activeElement?.type === 'checkbox') { document.activeElement.click(); }
    else if (e.key === 'Escape' || e.key === 'h' || e.key === 'ArrowLeft') { e.preventDefault(); checkState.set(stateKey, new Set(checkedIds(app))); backFn(); }
    else if (e.key === 'd') { e.preventDefault(); app.querySelector('#close-btn:not(:disabled)')?.click(); }
    else if (e.key === 'D') {
      e.preventDefault();
      const keepBtn = app.querySelector('#keep-current-btn:not(:disabled)') ?? app.querySelector('#close-one-btn');
      if (keepBtn) { keepBtn.click(); } else { checkState.set(stateKey, new Set(checkedIds(app))); backFn(); }
    }
    else if (e.key === '?') { e.preventDefault(); toggleHints(app); }
    else if (e.key === 'q') window.close();
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

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
  if (label.startsWith('*.')) return `<span class="label-wildcard">*.</span>${esc(label.slice(2))}`;
  return esc(label);
}

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatShortcut(shortcut) {
  return shortcut.replace('Command+', '⌘').replace('Ctrl+', '⌃').replace('Alt+', '⌥').replace('Shift+', '⇧');
}

function trunc(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

init();
