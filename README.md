# Tab Zap

A keyboard-driven Chrome extension for bulk-closing tabs. Describe the tabs you want gone in plain English, review the matches, and close them in a few keystrokes.

Open it with `⌘⇧Z` / `⌃⇧Z` or the extension icon.

## Search

Press `/` and describe what to close: "old AI tabs", "tabs unused for 3 days", "new tabs". Matching is done by [Jev](https://docs.typesafe.ai/api) from tab titles and URLs, optionally page meta descriptions.

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

Domain grouping (`host` / `peer` / `site`, plus top groups) is currently disabled. Set `SEARCH_ONLY` to `false` in `popup/popup.js` to bring it back.

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
