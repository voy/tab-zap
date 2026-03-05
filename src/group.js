import { parseUrl } from './parse.js';

const MIN_GROUP_SIZE = 2;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {chrome.tabs.Tab} activeTab
 * @param {chrome.tabs.Tab[]} allTabs
 * @returns {{ label: string, strategy: string, tabs: chrome.tabs.Tab[] }[]}
 */
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
  const urlGroups = activeParsed ? [
    ...buildHostnameGroup(activeParsed, parsableOtherTabs, parsedMap),
    ...buildRegisteredDomainGroup(activeParsed, parsableOtherTabs, parsedMap),
  ] : [];

  const recencyGroups = urlGroups.length > 0 ? buildRecencyGroups(allOtherTabs) : [];
  return [...urlGroups, ...recencyGroups];
}


function buildHostnameGroup(activeParsed, otherTabs, parsedMap) {
  const matches = otherTabs.filter(t => parsedMap.get(t.id).hostname === activeParsed.hostname);
  if (matches.length + 1 < MIN_GROUP_SIZE) return [];
  return [{ label: activeParsed.hostname, strategy: 'hostname', tabs: matches }];
}

function buildRegisteredDomainGroup(activeParsed, otherTabs, parsedMap) {
  const matches = otherTabs.filter(t => parsedMap.get(t.id).registeredDomain === activeParsed.registeredDomain);
  const crossSubdomain = matches.filter(t => parsedMap.get(t.id).hostname !== activeParsed.hostname);
  if (crossSubdomain.length < 1) return [];
  return [{ label: activeParsed.registeredDomain, strategy: 'domain', tabs: matches }];
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
