import { parseUrl } from './parse.js';

const MIN_GROUP_SIZE = 2;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {chrome.tabs.Tab} activeTab
 * @param {chrome.tabs.Tab[]} allTabs
 * @returns {{ label: string, strategy: string, tabs: chrome.tabs.Tab[] }[]}
 */
export function dedupeByCount(groups) {
  const tabCount = g => (g.strategy === 'recency' || g.strategy === 'newtab' || g.strategy === 'peer') ? g.tabs.length : g.tabs.length + 1;
  const seen = new Set();
  return groups.filter(g => {
    if (g.strategy === 'peer') return true;
    const n = tabCount(g);
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });
}

export function generateGroups(activeTab, allTabs) {
  const allOtherTabs = allTabs.filter(t => t.id !== activeTab.id && !t.pinned);

  // Parse each tab's URL once
  const parsedMap = new Map();
  for (const t of allOtherTabs) {
    const p = parseUrl(t.url);
    if (p) parsedMap.set(t.id, p);
  }

  const parsableOtherTabs = allOtherTabs.filter(t => parsedMap.has(t.id));
  const activeParsed = parseUrl(activeTab.url);
  const hostnameGroups = activeParsed ? buildHostnameGroup(activeParsed, parsableOtherTabs, parsedMap) : [];
  const peerGroups = activeParsed ? buildPeerHostnameGroups(activeParsed, parsableOtherTabs, parsedMap) : [];
  const domainGroups = activeParsed ? buildRegisteredDomainGroup(activeParsed, parsableOtherTabs, parsedMap) : [];
  const urlGroups = [...hostnameGroups, ...peerGroups, ...domainGroups];

  const newTabGroups = activeTab.url === 'chrome://newtab/' ? buildNewTabGroup(activeTab, allOtherTabs) : [];
  const recencyGroups = urlGroups.some(g => g.tabs.length > 0) ? buildRecencyGroups(allOtherTabs) : [];
  return [...urlGroups, ...newTabGroups, ...recencyGroups];
}


function buildHostnameGroup(activeParsed, otherTabs, parsedMap) {
  const matches = otherTabs.filter(t => parsedMap.get(t.id).hostname === activeParsed.hostname);
  return [{ label: activeParsed.hostname, strategy: 'hostname', tabs: matches }];
}

function buildPeerHostnameGroups(activeParsed, otherTabs, parsedMap) {
  const domainTabs = otherTabs.filter(t => {
    const p = parsedMap.get(t.id);
    return p.registeredDomain === activeParsed.registeredDomain && p.hostname !== activeParsed.hostname;
  });
  const byHostname = new Map();
  for (const t of domainTabs) {
    const h = parsedMap.get(t.id).hostname;
    if (!byHostname.has(h)) byHostname.set(h, []);
    byHostname.get(h).push(t);
  }
  return [...byHostname.entries()]
    .filter(([, tabs]) => tabs.length >= MIN_GROUP_SIZE)
    .map(([hostname, tabs]) => ({ label: hostname, strategy: 'peer', tabs }));
}

function buildRegisteredDomainGroup(activeParsed, otherTabs, parsedMap) {
  const matches = otherTabs.filter(t => parsedMap.get(t.id).registeredDomain === activeParsed.registeredDomain);
  const crossSubdomain = matches.filter(t => parsedMap.get(t.id).hostname !== activeParsed.hostname);
  if (crossSubdomain.length < 1) return [];
  return [{ label: activeParsed.registeredDomain, strategy: 'domain', tabs: matches }];
}

function buildNewTabGroup(activeTab, otherTabs) {
  const otherNewTabs = otherTabs.filter(t => t.url === 'chrome://newtab/');
  const allNewTabs = [activeTab, ...otherNewTabs];
  if (allNewTabs.length < MIN_GROUP_SIZE) return [];
  return [{ label: 'unused new tabs', strategy: 'newtab', tabs: allNewTabs }];
}

function buildRecencyGroups(otherTabs) {
  const now = Date.now();

  const weekOld = otherTabs.filter(t => t.lastAccessed && (now - t.lastAccessed) > ONE_WEEK_MS);
  const threeDayOld = otherTabs.filter(t => t.lastAccessed && (now - t.lastAccessed) > THREE_DAYS_MS);

  const groups = [];

  // Broader group first (3 days), narrower below (1 week)
  if (threeDayOld.length >= MIN_GROUP_SIZE && threeDayOld.length > weekOld.length) {
    groups.push({ label: 'not used in 3+ days', strategy: 'recency', tabs: threeDayOld });
  }

  if (weekOld.length >= MIN_GROUP_SIZE) {
    groups.push({ label: 'not used in 1+ week', strategy: 'recency', tabs: weekOld });
  }

  return groups;
}
