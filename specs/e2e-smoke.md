# E2E Smoke Tests — Plan

## Approach

Playwright loads `popup/popup.html` as a plain `file://` page in headless Chromium.
Before the page runs, `page.addInitScript` injects a `window.chrome` mock.
No real extension, no real tabs — just the popup UI driven by synthetic data.

## Setup

```
npm install --save-dev playwright
npx playwright install chromium
```

Add to `package.json`:
```json
"test:e2e": "playwright test specs/smoke.spec.js"
```

## Chrome mock shape

```js
window.chrome = {
  tabs: {
    query: async ({ active }) => active ? [ACTIVE_TAB] : ALL_TABS,
    remove: async (ids) => removedIds.push(...[ids].flat()),
    update: async () => {},
  },
  commands: { getAll: async () => [] },
  storage: { local: { get: async () => ({}), set: async () => {} } },
};
```

`ALL_TABS` is a small fixture — enough to produce at least one group:

```js
const ACTIVE_TAB = { id: 1, url: 'https://github.com/foo', title: 'GitHub PR', pinned: false, lastAccessed: Date.now() };
const ALL_TABS = [
  ACTIVE_TAB,
  { id: 2, url: 'https://github.com/bar',   title: 'GitHub Issues', pinned: false, lastAccessed: Date.now() - 1000 },
  { id: 3, url: 'https://reddit.com/a',     title: 'Reddit 1',     pinned: false, lastAccessed: Date.now() - 5000 },
  { id: 4, url: 'https://reddit.com/b',     title: 'Reddit 2',     pinned: false, lastAccessed: Date.now() - 6000 },
  { id: 5, url: 'https://nytimes.com/lone', title: 'NYT lone tab', pinned: false, lastAccessed: Date.now() - 9000 },
];
```

This produces:
- `host` group: github.com (tab 2)
- `big` group: reddit.com (tabs 3, 4) in top groups
- `etc` group: nytimes.com (tab 5) in other

## Smoke tests

### 1. Groups are rendered

- Open popup
- Assert at least one `.group-item` is visible
- Assert the `github.com` hostname group is present

### 2. Keyboard navigation works

- Open popup
- Press `j` — assert focus moves to second item
- Press `k` — assert focus returns to first item

### 3. Closing a group with `d` calls tabs.remove

- Open popup
- Focus the github group (should be default)
- Press `d`
- Assert `chrome.tabs.remove` was called with tab IDs from that group
  (check `removedIds` via `page.evaluate(() => window._removedIds)`)

### 4. Checklist opens and closes

- Open popup
- Press `l` on a group
- Assert checklist is rendered (`.checklist` visible, `.group-list` gone)
- Press `h`
- Assert group list is back

### 5. `other` group appears with lone tab

- Open popup
- Assert an `.group-item` with badge text `etc` exists

## File layout

```
specs/
  smoke.spec.js   ← Playwright tests
  e2e-smoke.md    ← this file
```

## Notes

- `window.close()` in popup code is a no-op in Playwright's file:// context — fine for testing
- `removedIds` needs to be tracked on `window` so `page.evaluate` can read it back
- Tests can share the chrome mock setup via a `beforeEach` fixture
