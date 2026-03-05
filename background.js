import { generateGroups, dedupeByCount } from './src/group.js';

async function updateBadge() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!activeTab) { await chrome.action.setBadgeText({ text: '' }); return; }

    const allTabs = await chrome.tabs.query({ windowId: activeTab.windowId });
    const groups = dedupeByCount(generateGroups(activeTab, allTabs));

    const uniqueIds = new Set();
    for (const g of groups) {
      const effectiveTabs = (g.strategy === 'recency' || g.strategy === 'newtab' || g.strategy === 'peer')
        ? g.tabs
        : [activeTab, ...g.tabs];
      for (const t of effectiveTabs) uniqueIds.add(t.id);
    }

    const count = uniqueIds.size;
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    if (count > 0) await chrome.action.setBadgeBackgroundColor({ color: '#888' });
  } catch {
    await chrome.action.setBadgeText({ text: '' });
  }
}

chrome.tabs.onCreated.addListener(updateBadge);
chrome.tabs.onRemoved.addListener(updateBadge);
chrome.tabs.onUpdated.addListener(updateBadge);
chrome.tabs.onActivated.addListener(updateBadge);
chrome.windows.onFocusChanged.addListener(updateBadge);
