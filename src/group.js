import { parseUrl } from './parse.js';

const MIN_GROUP_SIZE = 2; // including the active tab

/**
 * Generate ranked grouping candidates for the active tab.
 * @param {chrome.tabs.Tab} activeTab
 * @param {chrome.tabs.Tab[]} allTabs
 * @returns {{ label: string, strategy: string, tabs: chrome.tabs.Tab[] }[]}
 */
export function generateGroups(activeTab, allTabs) {
  const activeParsed = parseUrl(activeTab.url);
  if (!activeParsed) return [];

  const otherTabs = allTabs.filter(t => t.id !== activeTab.id && parseUrl(t.url));

  const pathGroups = buildPathGroups(activeParsed, otherTabs);
  const hostnameGroup = buildHostnameGroup(activeParsed, otherTabs);

  return [...pathGroups, ...hostnameGroup];
}

function buildPathGroups(activeParsed, otherTabs) {
  const sameHost = otherTabs.filter(t => parseUrl(t.url).hostname === activeParsed.hostname);
  const groups = [];
  let prevSize = sameHost.length + 1;

  // Iterate from deepest to shallowest to surface most specific first
  for (let depth = activeParsed.pathSegments.length - 1; depth >= 1; depth--) {
    const prefix = activeParsed.pathSegments.slice(0, depth);
    const matches = sameHost.filter(t => {
      const p = parseUrl(t.url);
      return prefix.every((seg, i) => p.pathSegments[i] === seg);
    });

    const size = matches.length + 1;
    if (size < MIN_GROUP_SIZE) continue;
    if (size >= prevSize) continue; // not more specific than what we already have

    groups.push({
      label: `/${prefix.join('/')}`,
      strategy: 'path',
      tabs: matches,
    });
    prevSize = size;
  }

  return groups;
}

function buildHostnameGroup(activeParsed, otherTabs) {
  const matches = otherTabs.filter(t => parseUrl(t.url).hostname === activeParsed.hostname);
  if (matches.length + 1 < MIN_GROUP_SIZE) return [];
  return [{ label: activeParsed.hostname, strategy: 'hostname', tabs: matches }];
}

