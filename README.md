# Tab Zap

A Chrome extension that bulk-closes related tabs with one click.

When you finish a task — a PR review, a support ticket, a research session — Tab Zap groups your open tabs by site or recency and lets you close them all at once.

## How it works

Click the extension icon to see groups of tabs related to your current tab:

- **Host** — all tabs on the same hostname
- **Site** — all tabs on the same domain (across subdomains)
- **Age** — tabs you haven't visited in 3+ days or 1+ week

Pick a group, then close all of them, keep just the current tab, or fine-tune with a checklist.

## Installation

1. Clone this repo
2. Go to `chrome://extensions` and enable **Developer mode**
3. Click **Load unpacked** and select the repo folder

## Stack

- Manifest V3
- Vanilla JS / HTML / CSS
- [`tldts`](https://github.com/nicolo-ribaudo/tldts) for eTLD+1 domain parsing

## Permissions

| Permission | Why |
|------------|-----|
| `tabs` | Read open tab URLs, titles, and last-accessed times to build groups; close tabs when requested |

No data ever leaves your browser.

## License

MIT
