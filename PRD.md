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

Applied to all open tabs relative to the active tab. Strategies run in order from most specific to broadest.

**A. Duplicate**
Exact URL match after normalization (lowercase scheme+host, strip trailing slash).

**B. Same hostname**
`tab.hostname === active.hostname`

**C. Same registered domain**
`tab.registeredDomain === active.registeredDomain`
Captures related subdomains (e.g. `mail.google.com` + `docs.google.com`).

**D. Shared path prefix (depth N)**
Applies only when hostnames match. For each depth N from 1 to `pathSegments.length - 1`:
- Candidate group = tabs where `pathSegments[0..N-1]` equals active tab's prefix at that depth
- Surface only if group is smaller than depth N-1 (i.e. adds specificity)
- Stop when group size drops to 1

This produces a natural drill-down from broad path prefix to narrow.

**E. Title token match**
Tokenize tab titles. Identify tokens that look like identifiers:
- `ALL-CAPS` words of 2+ chars
- `WORD-NUMBER` patterns (e.g. `SLIDES-1734`, `PROJ-42`)

For each such token in the active tab's title, surface a group of tabs whose title contains the same token.

**F. Recency bucket**
Tab-global groupings (not relative to active tab):
- Last hour
- Today
- Yesterday or older

### 3. Filtering

- Drop any candidate group with fewer than 2 tabs
- Drop groups with identical membership to a more-specific group already in the list
- Sort: Duplicate → path prefix deepest first → hostname → registered domain → title token → recency

---

## User Interface

### Entry Point

Clicking the extension icon opens a **popup** showing the current tab and its candidate groups.

### Popup Layout

```
┌─────────────────────────────────────┐
│ Tab Master                          │
│ Active: [tab title, truncated]      │
├─────────────────────────────────────┤
│ Close similar tabs:                 │
│                                     │
│ ● Duplicate                 1 tab > │
│ ● Path: /miro-ce/slides/pull 2 tabs>│
│ ● Path: /miro-ce/slides     3 tabs >│
│ ● Hostname: github.com      5 tabs >│
│ ● Site: atlassian.net       2 tabs >│
│ ● Title: "SLIDES-1734"      2 tabs >│
│ ● Older than today          8 tabs >│
└─────────────────────────────────────┘
```

Clicking a row expands a checklist of matching tab titles (all pre-checked). A "Close N tabs" button confirms. The active tab is never included in any group.

---

## Prototype Scope (v0.1)

Build only what is needed to validate the core interaction.

**In scope:**
- Strategies B, C, D (hostname, registered domain, path prefix)
- Popup UI
- Checklist preview before close
- `tldts` for eTLD+1 parsing
- Manifest V3

**Out of scope for v0.1:**
- Strategy A (duplicate detection)
- Strategy E (title token matching)
- Strategy F (recency)
- Context menu entry point
- Session saving / undo
- Keyboard navigation
- Tab age indicators

---

## Tech Stack

- Manifest V3
- Vanilla JS + HTML/CSS (no framework — keep bundle minimal)
- [`tldts`](https://github.com/nicolo-ribaudo/tldts) for public suffix list / eTLD+1 parsing
- `chrome.tabs` API for querying and closing tabs

---

## File Structure (proposed)

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
    rank.js        ← filter + sort candidates
  vendor/
    tldts.js       ← bundled or copied
  icons/
    icon16.png
    icon48.png
    icon128.png
  PRD.md
```

---

## Decisions

- **Empty groups:** Never shown. Only groups with matches appear in the popup.
- **Minimum group size:** 2 tabs (including the active tab). 1 other matching tab is enough to surface a group.
- **Active tab inclusion:** The checklist includes the active tab, but it starts **unchecked** (keep by default). All other matched tabs start checked. A single "Close checked tabs" button closes whatever is checked. Checking the active tab and clicking close will close it too.
