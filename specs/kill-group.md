# Kill Group Feature — Implementation Plan

## Phase 1 — d/D shortcuts on list screen ✓

| Key | Action | After |
|-----|--------|-------|
| `d` | Close group tabs + active tab (no-op if group has no other tabs) | Popup closes, or re-renders list from new active tab context if groups remain |
| `D` | Close group tabs only, keep active tab (no-op if group has no other tabs) | Re-renders list, or closes popup if no groups remain |
| `q` | Close popup | Popup closes (additive — `Escape` unchanged) |

### Notes

- `d` closes `group.tabs` + `activeTab.id`; after closing, re-queries new active tab and regenerates groups
- `D` closes `group.tabs` only; no re-query needed
- Both are no-ops if `group.tabs` is empty (group contains only the active tab)
- `q` added to both list and checklist screens

### Implementation

All changes in `popup.js`:

1. `renderGroupList` — added `d`, `D`, `q` to `setKeyHandler` callback
2. `renderChecklist` — added `q` to `setKeyHandler` callback

---

## Phase 2 — h/l shortcuts

### List screen

| Key | Action | After |
|-----|--------|-------|
| `l` or `Enter` | Open group checklist | Renders checklist |

### Checklist screen

| Key | Action | After |
|-----|--------|-------|
| `h` or `Escape` | Go back to list | Re-renders list |

### Notes

- All new keys are additive — existing `Enter`, `Escape` behaviour unchanged

### Implementation

All changes in `popup.js`:

1. `renderGroupList` — add `l` to `setKeyHandler` callback and group item keydown handler
2. `renderChecklist` — add `h` to `setKeyHandler` callback

---

## Phase 3 — Discoverability

A minimal hint line at the bottom of each screen showing available shortcuts.

### Hints per screen

- **List**: `↵/l open · d close all · D keep current · q quit`
- **Checklist**: `h/esc back · x toggle · q quit`
- **Empty**: `q/esc quit`

### Implementation

1. `renderGroupList` — add footer hint HTML
2. `renderChecklist` — add footer hint HTML
3. `renderEmpty` — add footer hint HTML
4. `popup.css` — one new rule for the hint strip (muted color, small font, subtle top border)
