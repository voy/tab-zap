import { parseUrl } from './parse.js';

const MIN_GROUP_SIZE = 2;

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
  const hostnameGroups = activeParsed ? buildHostnameGroup(activeParsed, parsableOtherTabs, parsedMap) : [];
  const peerGroups = activeParsed ? buildPeerHostnameGroups(activeParsed, parsableOtherTabs, parsedMap) : [];
  const domainGroups = activeParsed ? buildRegisteredDomainGroup(activeParsed, parsableOtherTabs, parsedMap) : [];
  const urlGroups = [...hostnameGroups, ...peerGroups, ...domainGroups];

  return urlGroups;
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
  return [{ label: `*.${activeParsed.registeredDomain}`, strategy: 'domain', tabs: matches }];
}

