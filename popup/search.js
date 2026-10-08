import { esc } from '../src/utils.js';
import { sortSearchTabs } from '../src/sort.js';
import { searchableTabs, tabsToClose } from '../src/jev.js';

const metadataPermissions = { permissions: ['scripting'], origins: ['http://*/*', 'https://*/*'] };

export function createSearch({ app, home, setKeyHandler, showResults, showPreview, keyHints, attachHintsToggle }) {
  let query = '';
  let generation = 0;

  async function open(back = home) {
    const token = ++generation;
    let initialTabs, activeTab;
    app.innerHTML = '<div class="list-status" role="status"></div>';
    setKeyHandler(e => { if (e.key === 'Escape') { generation++; back(); } }, () => open(back));
    try {
      const [stored, tabs, active] = await Promise.all([
        chrome.storage.local.get('jevApiKey'),
        chrome.tabs.query({ currentWindow: true }),
        chrome.tabs.query({ active: true, currentWindow: true }),
      ]);
      const { jevApiKey } = stored;
      [activeTab] = active;
      initialTabs = sortSearchTabs(searchableTabs(tabs), activeTab?.id);
      if (token !== generation) return;
      if (typeof jevApiKey !== 'string' || !jevApiKey.trim()) {
        return settings(back, { highlightKey: true, onSaved: () => open(back) });
      }
    } catch {
      if (token === generation) app.querySelector('[role=status]').textContent = 'Could not read settings. Press Escape and try again.';
      return;
    }
    app.innerHTML = `
      <form id="search-form" class="query-form">
        <span>/</span><input id="search-query" aria-label="Find tabs with Jev" placeholder="Describe the tabs to close…" maxlength="500" autocomplete="off" value="${esc(query)}">
        <span class="search-spinner" role="img" aria-label="Search in progress" hidden></span>
      </form>
      <div class="list-status" role="status" aria-live="polite"></div>
      <div id="search-preview"></div>
    `;
    const input = app.querySelector('input');
    const status = app.querySelector('[role=status]');
    const spinner = app.querySelector('.search-spinner');
    const form = app.querySelector('form');
    let busy = false;
    let timer;
    let due = false;
    let composing = false;
    let lastSubmitted = '';
    let previousValue = input.value.trim();
    let previewHandler;
    let result;
    let enterQuery;
    let inFlightQuery;
    const cache = new Map();
    const cancel = () => { clearTimeout(timer); generation++; back(); };
    setKeyHandler(e => {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      else if (e.target !== input) previewHandler?.(e);
    }, () => open(back));
    showPreview({
      app: app.querySelector('#search-preview'), title: 'All tabs', tabs: initialTabs, activeTab,
      back: cancel, header: false, focusOnOpen: false, defaultChecked: false,
      setKeyHandler: fn => { previewHandler = fn; },
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') {
        e.preventDefault(); app.querySelector('#search-preview input[type=checkbox]')?.focus();
      }
    });
    input.focus(); input.select();
    function enterResults() {
      clearTimeout(timer);
      generation++;
      showResults({ title: `/ ${result.query}`, tabs: result.tabs, activeTab: result.activeTab, back: home });
    }
    async function run(immediate = false) {
      if (token !== generation || composing) return;
      const submitted = input.value.trim();
      if (!submitted || (!immediate && submitted.length < 2)) return;
      if (immediate) {
        enterQuery = submitted;
        if (result?.query === submitted) { enterResults(); return; }
      }
      if (busy) { due = submitted !== inFlightQuery; return; }
      if (!immediate && submitted === lastSubmitted) return;
      due = false; query = submitted; lastSubmitted = submitted; busy = true;
      inFlightQuery = submitted;
      status.textContent = '';
      spinner.hidden = cache.has(submitted);
      form.setAttribute('aria-busy', 'true');
      try {
        const windowId = (await chrome.windows.getCurrent()).id;
        if (token !== generation) return;
        const response = cache.has(submitted)
          ? { result: { tabs: cache.get(submitted) } }
          : await chrome.runtime.sendMessage({ type: 'jev-search', query: submitted, windowId });
        if (token !== generation) return;
        if (!response || response.error) throw new Error(response?.error || 'Search failed. Try again.');
        cache.set(submitted, response.result.tabs);
        if (input.value.trim() !== submitted) return;
        const [liveTabs, [activeTab]] = await Promise.all([
          chrome.tabs.query({ currentWindow: true }),
          chrome.tabs.query({ active: true, currentWindow: true }),
        ]);
        if (token !== generation || input.value.trim() !== submitted) return;
        const validIds = new Set(tabsToClose(response.result.tabs.map(tab => tab.id), response.result.tabs, liveTabs));
        const tabs = sortSearchTabs(response.result.tabs.filter(tab => validIds.has(tab.id)), activeTab?.id);
        result = { query: submitted, tabs, activeTab };
        if (enterQuery === submitted) enterResults();
        else showPreview({
          app: app.querySelector('#search-preview'), title: `/ ${submitted}`, tabs, activeTab,
          back: cancel, header: false, focusOnOpen: document.activeElement !== input,
          setKeyHandler: fn => { previewHandler = fn; },
        });
      } catch (error) {
        if (token !== generation || input.value.trim() !== submitted) return;
        status.textContent = `${error.message} Press Escape, then , for settings.`;
      } finally {
        busy = false;
        spinner.hidden = true;
        form.setAttribute('aria-busy', 'false');
        if (due && token === generation) run(enterQuery === input.value.trim());
      }
    }
    function schedule() {
      clearTimeout(timer); due = false;
      const value = input.value.trim();
      if (value !== previousValue) {
        lastSubmitted = ''; enterQuery = null; result = null;
      }
      previousValue = value;
      status.textContent = '';
      if (composing || value.length < 2) {
        return;
      }
      if (value === lastSubmitted) return;
      timer = setTimeout(() => { due = true; run(); }, 650);
    }
    input.addEventListener('input', schedule);
    input.addEventListener('compositionstart', () => { composing = true; clearTimeout(timer); due = false; });
    input.addEventListener('compositionend', () => { composing = false; schedule(); });
    app.querySelector('form').addEventListener('submit', e => {
      e.preventDefault(); clearTimeout(timer);
      run(true);
    });
  }

  async function settings(back = home, { highlightKey = false, onSaved } = {}) {
    const token = ++generation;
    app.innerHTML = '<div class="list-status" role="status"></div>';
    setKeyHandler(e => { if (e.key === 'Escape') { generation++; back(); } }, () => settings(back, { highlightKey, onSaved }));
    let stored, granted;
    try {
      [stored, granted] = await Promise.all([
        chrome.storage.local.get(['jevApiKey', 'usePageDescriptions']),
        chrome.permissions.contains(metadataPermissions),
      ]);
    } catch { stored = {}; granted = false; }
    if (token !== generation) return;
    app.innerHTML = `
      <div class="header header-row">
        <button class="back-btn" aria-label="Back" title="Back (h / Escape)"><svg viewBox="0 0 8 8" aria-hidden="true"><path d="M5.25 1.5 2.75 4l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="app-title">Settings</div>
        <button class="hints-btn" title="Keyboard shortcuts">?</button>
      </div>
      <form id="key-form" class="settings-form">
        <label for="api-key">TypeSafe API key${stored.jevApiKey ? ' · saved' : ''}</label>
        <input id="api-key" class="${highlightKey ? 'key-nudge' : ''}" type="password" placeholder="${stored.jevApiKey ? 'Enter a replacement key' : 'Enter your key'}" autocomplete="off" aria-describedby="settings-status">
      </form>
      <label class="description-option"><input id="use-descriptions" type="checkbox" ${stored.usePageDescriptions && granted ? 'checked' : ''}>Use page descriptions</label>
      <div id="settings-status" class="list-status" role="status" aria-live="polite">${highlightKey ? 'Add your Jev key to search. Enter to save.' : stored.jevApiKey ? 'Enter to replace key' : 'Enter to save key'}</div>
      ${keyHints([['↵','save key'],['h/esc','back'],['q','quit']])}
    `;
    const status = app.querySelector('[role=status]');
    const key = app.querySelector('#api-key');
    const descriptions = app.querySelector('#use-descriptions');
    app.querySelector('.back-btn').addEventListener('click', () => { generation++; back(); });
    attachHintsToggle(app);
    app.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      if (!key.value.trim()) return;
      try {
        await chrome.storage.local.set({ jevApiKey: key.value.trim() });
        key.value = ''; status.textContent = 'Key saved.';
        if (token === generation && onSaved) onSaved();
      } catch { status.textContent = 'Could not save key. Try again.'; }
    });
    descriptions.addEventListener('click', async () => {
      const enabled = descriptions.checked;
      descriptions.disabled = true;
      try {
        if (enabled) {
          const manifest = chrome.runtime.getManifest();
          if (!manifest.optional_permissions?.includes('scripting') || !metadataPermissions.origins.every(origin => manifest.optional_host_permissions?.includes(origin))) {
            throw new Error('Reload Tab Zap at chrome://extensions to activate optional permissions.');
          }
        }
        if (enabled) {
          const allowed = await chrome.permissions.request(metadataPermissions);
          await chrome.storage.local.set({ usePageDescriptions: allowed });
          descriptions.checked = allowed;
          status.textContent = allowed ? 'Descriptions enabled.' : 'Using titles and URLs only.';
        } else {
          await chrome.storage.local.set({ usePageDescriptions: false });
          const removed = await chrome.permissions.remove(metadataPermissions);
          status.textContent = removed ? 'Descriptions disabled; site access removed.' : 'Descriptions disabled. Revoke site access in Chrome settings.';
        }
      } catch (error) {
        descriptions.checked = false; status.textContent = error.message;
      } finally { descriptions.disabled = false; }
    });
    setKeyHandler(e => {
      if (['Escape', 'h', 'ArrowLeft'].includes(e.key)) { e.preventDefault(); generation++; back(); }
      else if (e.key === '?') app.querySelector('.hints-btn').click();
      else if (e.key === 'q') window.close();
    }, () => settings(back, { highlightKey, onSaved }));
    key.focus();
  }
  return { open, settings };
}
