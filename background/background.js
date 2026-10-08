import { classifyTabs } from '../src/jev.js';
import { enrichTabs } from '../src/metadata.js';
import { temporalFilter, isTimeOnlyQuery } from '../src/time.js';
import { isNewTabOnlyQuery } from '../src/newtab.js';

chrome.action.setBadgeText({ text: '' });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message.type !== 'jev-search') return;
  (async () => {
    const { jevApiKey, usePageDescriptions } = await chrome.storage.local.get(['jevApiKey', 'usePageDescriptions']);
    const tabs = await chrome.tabs.query({ windowId: message.windowId });
    const timeFilter = temporalFilter(message.query);
    if (isTimeOnlyQuery(message.query, timeFilter) || isNewTabOnlyQuery(message.query, timeFilter)) {
      return classifyTabs(message.query, tabs, jevApiKey);
    }
    const canReadDescriptions = usePageDescriptions && await chrome.permissions.contains({
      permissions: ['scripting'], origins: ['http://*/*', 'https://*/*'],
    });
    const enriched = canReadDescriptions && typeof jevApiKey === 'string' && jevApiKey.trim()
      ? await enrichTabs(tabs, chrome.scripting)
      : tabs;
    return classifyTabs(message.query, enriched, jevApiKey);
  })().then(result => sendResponse({ result }), error => sendResponse({ error: error.message }));
  return true;
});
