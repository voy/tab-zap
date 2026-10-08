# Tab Zap

A keyboard-driven Chrome extension for bulk-closing related tabs.

When you finish a task — a PR review, a support ticket, a research session — Tab Zap groups your open tabs by site and lets you close them in a few keystrokes.

## How it works

Open the popup with the keyboard shortcut (`⌘⇧Z` / `⌃⇧Z`) or the extension icon. You'll see groups of tabs related to your current tab:

| Badge | Meaning |
|-------|---------|
| `host` | All tabs on the same hostname |
| `peer` | Tabs on a sibling subdomain of the same site |
| `site` | All tabs across subdomains of the same domain |

At the bottom, a **top groups** section shows the three largest tab clusters across all your open tabs — useful when your current tab is a one-off but you still have piles to clean up elsewhere.

## Natural-language search with Jev

Press `/` and describe the tabs you want to close. Search starts after a
650 ms typing pause; Enter searches immediately. Automatic searches need
at least two characters. Opening the query editor does not issue a request.
Only one search runs at a time; edits during a request wait for it to finish
and for the typing pause. Stale results are ignored, and unchanged queries
are not automatically retried. Enter can retry a failed search.
Before searching, the query editor shows unpinned web, Chrome, and blank pages alphabetically,
with the current tab first,
unchecked. Arrow Down enters the checklist; normal checklist shortcuts work.
Jev classifies unpinned HTTP/HTTPS and `chrome://` tabs in the current window using their
titles and URLs, plus optional page meta descriptions. Results use the same
checklist as site groups: `j/k` to navigate, `x` or Space to select, `d` to
close checked tabs, and `e` to close the focused tab. Results start checked;
deselect exceptions with `x` or Space before pressing `d`.
Search results use the same order: current tab first, then alphabetical by title.
Automatic search updates the checklist below the query without moving focus.
Enter moves into the results, reusing the displayed matches without another request.
Earlier queries are cached until you leave search; closed, navigated, or pinned tabs
are removed when cached matches are displayed again.
Nothing closes automatically. `/` edits the last query; Escape cancels editing
and restores your checklist selection. Escape also cancels a pending search;
its response will not replace the screen you returned to.
Tabs that navigate or become pinned after classification are left open.
Use `h` or Escape to return to site groups, or `q` to quit.

**New tabs**, **unused new tabs**, and **blank tabs** select pages still on
Chrome's built-in new-tab page or `about:blank`, without an API call.
**Old new tabs** also applies the inactivity filter. This checks the current
page, not navigation history; custom new-tab extension pages aren't detected.
No additional permissions are required.
Chrome pages such as extensions, settings, history, and downloads use titles
and URLs only; description extraction is restricted to web pages.

Time filters use Chrome's **last-access time** (when a tab last became active),
not its creation date. **Old tabs** means unused for at least seven days.
Use an explicit duration for **tabs unused for 3 days**, **tabs older than
two weeks**, or combine it with a category: **old AI tabs**. Recognized
inactivity windows are checked in code; pure time queries run locally without
an API call. Opening search still requires a saved Jev key. Tabs with unknown activity times are excluded from these
filters. A matching tab used again before closing is left open.

### Jev setup

Without a saved key, `/` opens settings and briefly highlights the key field.
Save with Enter to continue directly to search; Escape returns to your previous view.
Get a key from [TypeSafe](https://console.typesafe.ai/). Press `,` for settings,
paste the key, and press Enter to save. The field clears after saving.
The key is stored in `chrome.storage.local`, never synced or included in the build.
Local extension storage is not an encrypted secrets vault.

If you prefer no key-entry UI, go to `chrome://extensions`, find Tab Zap,
click its **service worker** link, and run this in the DevTools console:

```js
await chrome.storage.local.set({ jevApiKey: prompt('TypeSafe API key') });
```

To remove the saved key, run `await chrome.storage.local.remove('jevApiKey')`.

Search uses the [official Jev API](https://docs.typesafe.ai/api) with `jev-latest`.
Requests contain at most 50 tab questions, with at most two requests in flight.
Search interprets category names, synonyms, and abbreviations semantically;
AI/LLM searches include AI assistants and chatbots. Matches require a
yes-probability of at least 0.5, favoring recall for manual review; this threshold needs tuning
against real tabs. **Use page descriptions** is off by default. Enabling it
asks Chrome for optional scripting and HTTP/HTTPS site access. Declining or
revoking access keeps title/URL search working. Turning the checkbox off stops
description extraction and removes the optional scripting and HTTP/HTTPS
site permissions; the required Jev API permission remains. When enabled,
the description is read on search from the loaded page's
`meta[name="description"]`, falling back to `meta[property="og:description"]`,
and capped at 1,000 characters. Extraction runs in parallel with a one-second
timeout per tab. Discarded/loading tabs and pages that cannot be accessed fall
back to title and URL; discarded tabs are not reloaded. Metadata-only
classification can miss queries requiring the full page text.
Requests run after the typing pause or Enter, with a 25-second timeout and no
automatic retries for failed queries.

## Keyboard navigation

Tab Zap is keyboard-first with vim-style bindings.

### Group list

| Key | Action |
|-----|--------|
| `j` / `↓` | Next group |
| `k` / `↑` | Previous group |
| `l` / `o` / `→` / `↵` / `spc` | Open group checklist |
| `d` | Close all tabs in the group (and current tab) |
| `D` | Close all tabs in the group, keep current tab |
| `?` | Toggle keyboard hints |
| `/` | Natural-language search |
| `,` | Settings |
| `q` / `Esc` | Close popup |

For **top groups**, `d` closes all tabs in that group without affecting your current tab. `l` opens a flat checklist of all those tabs.

### Checklist

| Key | Action |
|-----|--------|
| `j` / `↓` | Next item |
| `k` / `↑` | Previous item |
| `x` / `↵` / `spc` | Toggle checkbox |
| `*a` | Select all |
| `*n` | Deselect all |
| `d` | Close checked tabs |
| `D` | Close checked tabs, keep current tab |
| `e` | Close the focused tab |
| `l` / `o` / `→` | Activate the focused tab |
| `/` | Search / edit the last query |
| `,` | Settings |
| `h` / `←` / `Esc` | Back |
| `q` | Close popup |

Site, top-group, and search-result checklists start checked. **Other tabs**
start unchecked. Command bindings are suspended while typing into a query or
key field; Escape still goes back.

## Installation

```sh
git clone https://github.com/your-username/tab-zap
cd tab-zap
npm install
npm run build
```

Then in Chrome:

1. Go to `chrome://extensions` and enable **Developer mode**
2. Click **Load unpacked** and select the repo folder

## Stack

- Manifest V3
- Vanilla JS / HTML / CSS
- [`tldts`](https://github.com/nicolo-ribaudo/tldts) for eTLD+1 domain parsing
- [`esbuild`](https://esbuild.github.io/) for bundling

## Permissions

| Permission | Why |
|------------|-----|
| `tabs` | Read open tab URLs, titles, and favicons to build groups; close tabs when requested |
| `storage` | Remember keyboard hints and your locally saved Jev key |
| `https://api.typesafe.ai/*` | Call the Jev API when you submit a search |
| `scripting` (optional) | Read the page meta description when you submit a search |
| HTTP/HTTPS site access (optional) | Read descriptions across web tabs when enabled |

Site grouping, pure time searches, and new-tab-only searches stay local. Submitting a Jev search sends
your query and unpinned web and Chrome tab titles, URLs, relative last-use information,
and available meta descriptions in the current window to
TypeSafe. Full page text is not read. Description access is requested only
when you enable **Use page descriptions**.

## License

MIT
