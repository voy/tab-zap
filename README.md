# Tab Zap

A keyboard-driven Chrome extension for bulk-closing tabs. Open it with `⌘⇧Z` / `⌃⇧Z` or the extension icon.

- **Groups (default):** tabs grouped by site, plus the biggest clusters across your window. No setup.
- **Search (optional):** add a [Jev](https://docs.typesafe.ai/api) key and the popup opens in natural-language search instead. Describe the tabs to close, review the matches, close them.

The landing screen follows the key: saved key opens search, no key opens groups. Remove the key to go back.

## Groups

| Badge | Meaning |
|-------|---------|
| `host` | Same hostname as the current tab |
| `peer` | Sibling subdomain of the same site |
| `site` | Any subdomain of the same domain |
| `big` | One of the largest clusters in the window |
| `etc` | Everything else, oldest first |

`d` closes a group (and the current tab), `D` keeps the current tab, `l` opens it as a checklist.

## Search

Press `/` and describe what to close: "old AI tabs", "tabs unused for 3 days", "new tabs". Matching is done by Jev from tab titles and URLs, optionally page meta descriptions.

- Results are a checklist, pre-checked. Deselect exceptions, then press `d`.
- Nothing closes without you pressing a key.
- Time filters use Chrome's last-access time. "Old" means unused for seven days.
- New-tab and time-only queries run locally with no API call.
- Tabs that navigate or get pinned after classification are left open.

### Setup

1. Get a key from [TypeSafe](https://console.typesafe.ai/).
2. Press `,` for settings, paste the key, press Enter.

The key lives in `chrome.storage.local` (not synced, not in the build, not encrypted). Remove it with `await chrome.storage.local.remove('jevApiKey')` in the service worker console.

**Use page descriptions** is off by default. Enabling it asks for optional scripting and site access so Tab Zap can read `meta[name="description"]`. Declining keeps title/URL search working.

## Keys

Vim-style. Command keys are suspended while typing in the query or key field.

| Key | Action |
|-----|--------|
| `j` / `↓`, `k` / `↑` | Next / previous |
| `x` / `spc` | Toggle checkbox |
| `*a` / `*n` | Select / deselect all |
| `d` | Close checked tabs |
| `D` | Close checked tabs, keep current tab |
| `e` | Close the focused tab |
| `l` / `o` / `→` | Activate the focused tab |
| `/` | Search / edit last query |
| `Enter` / `Ctrl+j` | Search now, then move into results |
| `,` | Settings |
| `h` / `←` / `Esc` | Back |
| `q` | Close popup |

## Install

```sh
git clone https://github.com/voy/tab-zap
cd tab-zap
npm install
npm run build
```

In Chrome, open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the repo folder.

## Permissions

| Permission | Why |
|------------|-----|
| `tabs` | Read tab URLs, titles, favicons; close tabs |
| `storage` | Save settings and your Jev key locally |
| `https://api.typesafe.ai/*` | Call the Jev API |
| `scripting`, HTTP/HTTPS access (optional) | Read page descriptions |

A Jev search sends your query plus titles, URLs, relative last-use times, and any meta descriptions of unpinned tabs in the current window to TypeSafe. Full page text is never read.

## Stack

Manifest V3, vanilla JS, [`tldts`](https://github.com/remusao/tldts) for domain parsing, [`esbuild`](https://esbuild.github.io/) for bundling.

## License

MIT
