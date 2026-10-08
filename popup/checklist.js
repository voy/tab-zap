import { esc, trunc } from '../src/utils.js';
import { tabsToClose } from '../src/jev.js';

export function showChecklist({ app, title, tabs, activeTab, back, refresh = back, setKeyHandler, keyHints, attachHintsToggle, checkState = new Map(), stateKey = title, defaultChecked = true, header = true, focusOnOpen = true }) {
  let remaining = tabs;
  let selected = checkState.get(stateKey) ?? new Set(defaultChecked ? tabs.map(tab => tab.id) : []);
  let busy = false;
  let chord = false;
  let chordTimer;
  let focus = 0;
  let changed = false;
  let initialRender = true;

  function save() {
    selected = new Set([...app.querySelectorAll('input:checked')].map(cb => Number(cb.dataset.tabId)));
    checkState.set(stateKey, selected);
  }

  async function close(ids, focusIndex = 0) {
    if (busy || !ids.length) return;
    busy = true;
    app.inert = true;
    try {
      const live = await chrome.tabs.query({ currentWindow: true });
      const safe = tabsToClose(ids, remaining, live);
      await Promise.all(safe.map(id => chrome.tabs.remove(id).catch(() => {})));
      const fresh = await chrome.tabs.query({ currentWindow: true });
      changed = true;
      const valid = new Set(tabsToClose(remaining.map(tab => tab.id), remaining, fresh));
      remaining = remaining.filter(tab => valid.has(tab.id));
      selected = new Set([...selected].filter(id => valid.has(id)));
      checkState.set(stateKey, selected);
      app.inert = false;
      render(focusIndex);
    } catch {
      app.querySelector('[role=status]').textContent = 'Could not close tabs. Try again.';
    } finally { busy = false; app.inert = false; }
  }

  function render(focusIndex = 0) {
    clearTimeout(chordTimer);
    chord = false;
    app.innerHTML = `
      ${header ? `<div class="header"><div class="header-row">
        <button class="back-btn" aria-label="Back" title="Back (h / Escape)"><svg viewBox="0 0 8 8" aria-hidden="true"><path d="M5.25 1.5 2.75 4l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="current-tab" title="${esc(title)}">${esc(trunc(title, 42))}</div>
        <button class="hints-btn" title="Keyboard shortcuts">?</button>
      </div></div>` : ''}
      <div class="list-status" role="status" aria-live="polite"></div>
      <ul class="checklist">${remaining.map(tab => `
        <li class="check-item"><label>
          <input type="checkbox" ${selected.has(tab.id) ? 'checked' : ''} data-tab-id="${tab.id}" aria-label="Select ${esc(tab.title || tab.url)}">
          ${tab.favIconUrl ? `<img class="favicon" src="${esc(tab.favIconUrl)}" alt="">` : '<span class="favicon-placeholder"></span>'}
          <span title="${esc(tab.url || '')}">${esc(trunc(tab.title || tab.url, 38))}</span>
          ${tab.id === activeTab?.id ? '<span class="badge">current</span>' : ''}
        </label></li>`).join('')}</ul>
      ${!remaining.length ? '<div class="empty checklist-empty">No tabs. Press / to search or h to go back.</div>' : ''}
      ${keyHints([['j/k','navigate'],['spc/x','toggle'],['l/o','open tab'],['*a/*n','all/none'],['e','close tab'],['d','close checked'],['D','keep current'],['/','search'],[',','settings'],['h/esc','back'],['q','quit']])}
    `;
    attachHintsToggle(app);
    const goBack = () => { save(); clearTimeout(chordTimer); (changed ? refresh : back)(); };
    app.querySelector('.back-btn')?.addEventListener('click', goBack);
    app.querySelectorAll('img').forEach(img => img.addEventListener('error', () => { img.style.display = 'none'; }));
    app.querySelectorAll('input').forEach(cb => cb.addEventListener('change', save));
    const inputs = [...app.querySelectorAll('input')];
    inputs.forEach((input, index) => input.addEventListener('focus', () => { focus = index; }));
    if (focusOnOpen || !initialRender) (inputs[focusIndex] ?? inputs.at(-1) ?? app.querySelector('.back-btn'))?.focus();
    initialRender = false;
    setKeyHandler(async e => {
      if (busy) return;
      const checkboxes = [...app.querySelectorAll('input')];
      const current = checkboxes.indexOf(document.activeElement);
      if (chord) {
        chord = false; clearTimeout(chordTimer);
        if (e.key === 'a' || e.key === 'n') {
          e.preventDefault(); checkboxes.forEach(cb => { cb.checked = e.key === 'a'; }); save(); return;
        }
      }
      if (e.key === '*') {
        e.preventDefault(); chord = true;
        chordTimer = setTimeout(() => { chord = false; }, 1500);
      } else if (['j', 'ArrowDown', 'k', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        const step = ['j', 'ArrowDown'].includes(e.key) ? 1 : -1;
        checkboxes[(current + step + checkboxes.length) % checkboxes.length]?.focus();
      } else if (['x', 'Enter', ' '].includes(e.key) && current !== -1) {
        e.preventDefault(); checkboxes[current].click();
      } else if (['l', 'o', 'ArrowRight'].includes(e.key) && current !== -1) {
        e.preventDefault();
        await chrome.tabs.update(Number(checkboxes[current].dataset.tabId), { active: true }).catch(() => {});
        window.close();
      } else if (['h', 'ArrowLeft', 'Escape'].includes(e.key)) {
        e.preventDefault(); goBack();
      } else if (e.key === 'e' && current !== -1) {
        e.preventDefault(); save(); await close([Number(checkboxes[current].dataset.tabId)], current);
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault(); save();
        await close([...selected].filter(id => e.key !== 'D' || id !== activeTab?.id), Math.max(current, 0));
      } else if (e.key === '?') {
        e.preventDefault();
        const button = app.querySelector('.hints-btn');
        if (button) button.click();
        else app.querySelector('.key-hints')?.classList.toggle('visible');
      }
      else if (e.key === 'q') window.close();
    }, () => render(focus));
  }
  render();
}
