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

## Navigation

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
| `q` / `Esc` | Close popup |

For **top groups**, `d` closes all tabs in that group without affecting your current tab. `l` opens a flat checklist of all those tabs.

### Checklist

| Key | Action |
|-----|--------|
| `j` / `↓` | Next item |
| `k` / `↑` | Previous item |
| `x` / `↵` | Toggle checkbox |
| `*a` | Select all |
| `*n` | Deselect all |
| `d` | Close checked tabs |
| `D` | Keep current tab, close rest |
| `h` / `←` / `Esc` | Back |
| `q` | Close popup |

The **top groups** checklist starts with nothing checked — select what you want to close.

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

No data ever leaves your browser.

## License

MIT
