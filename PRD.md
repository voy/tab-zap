# Tab Master — Product Requirements Document

## Overview

A Chrome extension that helps users quickly close groups of related tabs. When a user is on a tab, the extension analyzes all open tabs and offers ranked grouping options based on URL structure and tab metadata — allowing bulk closure with a single confirm action.

No site-specific knowledge is baked in. All grouping is derived algorithmically from URL structure and tab titles.

---

## Problem

Browser tabs accumulate. A user finishes a task (a PR review, a support ticket, a research session) but the 5–10 tabs associated with it remain open. Finding and closing them manually is tedious. The extension makes this a one-click operation.

---

## Core Algorithm

### 1. URL Parsing

Every tab's URL is decomposed into:

```
https://mail.google.com/u/0/inbox
  hostname:          mail.google.com
  registeredDomain:  google.com        ← eTLD+1 via tldts (handles .co.uk, atlassian.net, etc.)
  subdomain:         mail
  pathSegments:      ['u', '0', 'inbox']
```

### 2. Grouping Strategies

Applied to all open tabs relative to the active tab.

**A. Same hostname**
`tab.hostname === active.hostname`

**B. Title token match**
Tokenize tab titles. Identify tokens that look like identifiers:
- `ALL-CAPS` words of 2+ chars
- `WORD-NUMBER` patterns (e.g. `SLIDES-1734`, `PROJ-42`)

For each such token in the active tab's title, surface a group of tabs whose title contains the same token.

**C. Recency bucket**
Tab-global groupings (not relative to active tab):
- Not used in 3+ days
- Not used in 1+ week

### 3. Filtering

- Drop any candidate group with fewer than 2 tabs
- Drop groups whose tab count duplicates a group already in the list (keep the first/most specific)

---

## User Interface

### Entry Point

Clicking the extension icon opens a **popup** showing the current tab and its candidate groups.

### Group List

When multiple groups exist, shows a list to pick from:

```
┌─────────────────────────────────────┐
│ Tab Master                          │
│ Active: [tab title, truncated]      │
├─────────────────────────────────────┤
│ HOST  github.com              5 tabs│
│ AGE   not used in 3+ days    31 tabs│
├─────────────────────────────────────┤
│ [Close this tab]                    │
└─────────────────────────────────────┘
```

If only one group exists, the group list is skipped and the checklist opens directly.

### Group Detail (Checklist)

Clicking a group row opens a checklist of matching tabs with one-click actions:

```
┌─────────────────────────────────────┐
│ ← github.com                        │
├─────────────────────────────────────┤
│ ☑ Tab title A                       │
│ ☑ Tab title B              [current]│
│ ☑ Tab title C                       │
├─────────────────────────────────────┤
│ [Close all 3 tabs]                  │
│ [Keep current tab]                  │
│ [Close checked tabs]                │
└─────────────────────────────────────┘
```

- **Close all N tabs** — closes every tab in the group immediately
- **Keep current tab** — closes all tabs in the group except the current one immediately
- **Close checked tabs** — closes only the checked tabs (for fine-grained control)
- The active tab is shown in the list with a "current" badge and starts unchecked

---

## Implemented (v0.1)

- Strategy A (hostname grouping)
- Strategy C (recency grouping: 3+ days, 1+ week)
- Group list → checklist flow
- One-click "Close all" and "Keep current" actions
- Deduplication: groups with identical tab counts are collapsed
- Manifest V3

## Out of Scope

- Strategy B (title token matching)
- Same registered domain grouping (cross-subdomain)
- Duplicate URL detection
- Context menu entry point
- Session saving / undo
- Keyboard navigation

---

## Tech Stack

- Manifest V3
- Vanilla JS + HTML/CSS (no framework — keep bundle minimal)
- [`tldts`](https://github.com/nicolo-ribaudo/tldts) for public suffix list / eTLD+1 parsing
- `chrome.tabs` API for querying and closing tabs

---

## File Structure

```
tab-master/
  manifest.json
  popup/
    popup.html
    popup.js
    popup.css
  src/
    parse.js       ← URL decomposition
    group.js       ← grouping strategies
  PRD.md
```

---

## Decisions

- **Empty groups:** Never shown. Only groups with matches appear in the popup.
- **Minimum group size:** 2 tabs (including the active tab). 1 other matching tab is enough to surface a group.
- **Path grouping excluded:** Path-prefix groups are too fine-grained and add noise. Hostname grouping is the right granularity for URL-based groups.
- **Count deduplication:** If two groups would show the same number of tabs, only the first (more specific) one is shown — the extra group adds no new choice.
- **One-click actions:** "Close all" and "Keep current" let users act immediately without adjusting checkboxes. The checklist remains for edge cases.
