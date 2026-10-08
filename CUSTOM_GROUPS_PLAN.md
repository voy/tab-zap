# Custom Groups — Implementation Plan

## What this feature is

User-defined named groups stored in `chrome.storage`. Instead of only auto-detecting groups by hostname/domain, the user can save a group like "Work" = `[github.com, linear.app, notion.so]`. On every popup open, Tab Zap matches all open tabs against these domain rules and surfaces them as a `my`-badged group at the top of the list.

---

## Core design decisions

### Domain matching uses registeredDomain
`github.com` matches `github.com`, `gist.github.com`, etc. This is almost always what users want ("all of GitHub").

### Custom groups are non-contextual
Auto-groups (host/peer/domain) are generated relative to the active tab. Custom groups always show all matching open tabs regardless of what the active tab is.

### Custom groups suppress overlapping auto-groups
Tabs already in a custom group are excluded from auto-group generation. This prevents duplicate entries.

### Active tab is excluded from custom group tabs
Consistent with how auto-groups work. The active tab is never in `group.tabs` — it appears in the checklist via the "current" badge in `renderChecklist`.

---

## Key problem from first attempt

The first prototype matched ALL open tabs from saved domains, which was confusing when a domain had many tabs open across unrelated contexts. The user expected the group to stay scoped to the tabs they originally saw.

**Possible fixes to consider:**
1. Show a preview (tab count) when pressing `s` before committing — "Save 8 tabs as group?"
2. Scope to the specific tabs in the group at save time (tab IDs), not all-future-tabs-from-domain. Downside: group becomes stale/empty once tabs are closed.
3. Domain-based but show the count in the group label so it's transparent — "Work (12 tabs)" is a signal something's off.

Option 2 may actually be the better model for a first version: treat custom groups as **saved tab sets** (by tab ID) rather than domain rules. They stay useful for the current session and disappear gracefully when tabs close. Domain-rule groups are a more powerful v2.

---

## Storage

```js
// chrome.storage.local
{
  customGroups: [
    { id: "abc123", name: "Work", domains: ["github.com", "linear.app"] }
  ]
}
```

Add `"storage"` to `permissions` in `manifest.json`. Use `chrome.storage.local` (or `sync` to share across Chrome profiles).

**Note:** When adding a new permission to an already-loaded unpacked extension, Chrome may require the extension to be **removed and re-added** (not just reloaded) for the permission to take effect.

---

## Files to change

| File | Change |
|------|--------|
| `manifest.json` | Add `"storage"` to permissions |
| `src/group.js` | Add `generateCustomGroups(allTabs, customGroupDefs, activeTabId)` |
| `popup/popup.js` | Load/save custom groups, render them, add s/a/e keyboard flows |
| `popup/popup.css` | Styles for inline name input, absorb picker, edit screen |

---

## New function: `generateCustomGroups`

```js
export function generateCustomGroups(allTabs, customGroupDefs, activeTabId = null) {
  if (!customGroupDefs.length) return [];
  const parsedMap = new Map();
  for (const t of allTabs) {
    if (t.pinned || t.id === activeTabId) continue;
    const p = parseUrl(t.url);
    if (p) parsedMap.set(t.id, p);
  }
  return customGroupDefs
    .map(def => {
      const domainSet = new Set(def.domains);
      const tabs = allTabs.filter(t => {
        const p = parsedMap.get(t.id);
        return p && domainSet.has(p.registeredDomain);
      });
      return { label: def.name, strategy: 'custom', defId: def.id, tabs };
    })
    .filter(g => g.tabs.length > 0);
}
```

---

## `init()` changes

```js
const customGroupDefs = await loadCustomGroups();
const customGroups = generateCustomGroups(allTabs, customGroupDefs, activeTab.id);
const customTabIds = new Set(customGroups.flatMap(g => g.tabs.map(t => t.id)));

const groups = generateGroups(activeTab, allTabs);
// Exclude tabs already in custom groups from auto-groups
const filteredGroups = groups
  .map(g => ({ ...g, tabs: g.tabs.filter(t => !customTabIds.has(t.id)) }))
  .filter(g => g.tabs.length > 0);

const excludeIds = new Set([activeTab.id, ...customTabIds, ...filteredGroups.flatMap(...)]);
const topGroups = generateTopGroups(allTabs, excludeIds);
```

---

## Group list UI

Custom groups render at the top of the list, above auto-groups. A divider separates them if both exist.

```html
<li class="group-item" tabindex="0" data-custom-index="0">
  <span class="strategy-badge" title="Your custom tab group">my</span>
  <span class="group-label">Work</span>
  <span class="group-count">4 tabs</span>
</li>
```

Add `custom` to `STRATEGY_LABELS`:
```js
custom: { text: 'my', tip: 'Your custom tab group' },
```

`tabCount` for custom: use `g.tabs.length` directly (no +1, active tab is not included).

---

## Keyboard flows

### `s` — save focused group as new custom group

Works on any non-custom group item. Replaces the list item in-place with a text input. Enter saves, Escape cancels.

```
[  name this group: __________ ] ↵ / Esc
```

The domains are extracted from the group's tabs via `domainsFromGroup(g, activeTab)` — uses `registeredDomain` of each tab.

```js
function domainsFromGroup(g, activeTab) {
  const baseTabs = (g.strategy === 'hostname' || g.strategy === 'domain')
    ? [activeTab, ...g.tabs]
    : g.tabs;
  const domains = new Set();
  for (const t of baseTabs) {
    const p = parseUrl(t.url);
    if (p?.registeredDomain) domains.add(p.registeredDomain);
  }
  return [...domains];
}
```

### `a` — absorb focused group into existing custom group

Works on any non-custom group item.

- **0 custom groups:** triggers the `s` naming flow (creates new group)
- **1 custom group:** auto-absorbs immediately, re-renders
- **2+ custom groups:** shows an inline picker (arrow keys + Enter to pick)

```
Add to: [Work]  [Personal]  [Research]
```

### `e` — edit focused custom group

Opens the edit screen (new screen, same popup).

### `d` on custom group — close all tabs in the group

---

## Edit screen

```
┌─────────────────────────────────┐
│ ←                             ? │
├─────────────────────────────────┤
│ [Work_________________]         │  ← name input, auto-saves on blur
│                                 │
│ DOMAINS                         │
│ ┌─────────────────────────────┐ │
│ │ github.com               ×  │ │  ← j/k to navigate, x to remove
│ │ linear.app               ×  │ │
│ └─────────────────────────────┘ │
│ [add domain…________________]   │  ← Enter to add, parses/normalises URL
│                                 │
│ Delete group                    │  ← single click, no confirm needed
└─────────────────────────────────┘
```

- Name input focused on open, auto-saves on blur
- Domain list: `j/k` to navigate, `x` to remove focused domain
- Add input: paste full URL or bare domain, normalised to registeredDomain
- Back (h/←/Esc): saves name and calls `init()` to rebuild

---

## Checklist behaviour for custom groups

Custom groups behave like `peer` groups in the checklist — `group.tabs` is used directly (active tab not prepended, since it may not belong to the custom group).

```js
const allGroupTabs = (['recency', 'newtab', 'peer', 'custom'].includes(group.strategy))
  ? group.tabs
  : [activeTab, ...group.tabs];
```

---

## Adding a single-tab domain (the gap case)

If a domain has only one tab open it won't appear as an auto-group, so there's nothing to press `s` or `a` on. Two solutions:

1. **From the edit screen:** the add-domain input accepts any domain, so the user can type `linear.app` directly even if no linear tabs are open.
2. **`a` from the group list header area** (future): an action scoped to the current tab's domain rather than a specific group item.

---

## CSS additions needed

- `.group-name-input` — inline input inside a group list item
- `.absorb-label`, `.absorb-list`, `.absorb-item` — inline group picker
- `.edit-section`, `.group-edit-name` — edit screen layout and name field
- `.edit-domains-label`, `.domain-list`, `.domain-item`, `.domain-name` — domain list
- `.remove-domain-btn` — × button (hidden until hover/focus)
- `.add-domain-input` — add domain field
- `.delete-group-btn` — delete button
- Dark mode overrides for all of the above
