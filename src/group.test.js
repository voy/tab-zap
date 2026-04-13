import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateGroups, generateTopGroups } from './group.js';

const NOW = Date.now();

function tab(id, url, { pinned = false, lastAccessed = NOW } = {}) {
  return { id, url, title: `Tab ${id}`, pinned, lastAccessed };
}

// ── hostname grouping ─────────────────────────────────────────────────────────

test('groups tabs by hostname', () => {
  const active = tab(1, 'https://github.com/foo/pull/1');
  const others = [
    tab(2, 'https://github.com/foo/pull/1/files'),
    tab(3, 'https://github.com/foo/issues/42'),
    tab(4, 'https://example.com/'),
  ];
  const groups = generateGroups(active, [active, ...others]);
  const hostGroup = groups.find(g => g.strategy === 'hostname');
  assert.ok(hostGroup, 'hostname group should exist');
  assert.equal(hostGroup.label, 'github.com');
  assert.equal(hostGroup.tabs.length, 2); // tabs 2 and 3
});

test('hostname group always exists for parsable URLs, with 0 other tabs when none match', () => {
  const active = tab(1, 'https://github.com/');
  const others = [tab(2, 'https://example.com/')];
  const groups = generateGroups(active, [active, ...others]);
  const hostGroup = groups.find(g => g.strategy === 'hostname');
  assert.ok(hostGroup, 'hostname group should always exist for HTTP tabs');
  assert.equal(hostGroup.tabs.length, 0);
});

test('excludes active tab from group tab list', () => {
  const active = tab(1, 'https://github.com/');
  const others = [tab(2, 'https://github.com/foo'), tab(3, 'https://github.com/bar')];
  const groups = generateGroups(active, [active, ...others]);
  const hostGroup = groups.find(g => g.strategy === 'hostname');
  assert.ok(hostGroup.tabs.every(t => t.id !== active.id));
});

test('excludes pinned tabs from groups', () => {
  const active = tab(1, 'https://github.com/');
  const others = [
    tab(2, 'https://github.com/foo', { pinned: true }),
    tab(3, 'https://github.com/bar'),
  ];
  const groups = generateGroups(active, [active, ...others]);
  const hostGroup = groups.find(g => g.strategy === 'hostname');
  // only tab 3 matches and it's just 1 other tab → still forms a group with active
  assert.ok(hostGroup);
  assert.equal(hostGroup.tabs.length, 1);
  assert.ok(hostGroup.tabs.every(t => !t.pinned));
});

// ── domain grouping ───────────────────────────────────────────────────────────

test('groups tabs by registered domain across subdomains', () => {
  const active = tab(1, 'https://mail.google.com/');
  const others = [
    tab(2, 'https://docs.google.com/'),
    tab(3, 'https://mail.google.com/sent'),
    tab(4, 'https://example.com/'),
  ];
  const groups = generateGroups(active, [active, ...others]);
  const domainGroup = groups.find(g => g.strategy === 'domain');
  assert.ok(domainGroup, 'domain group should exist');
  assert.equal(domainGroup.label, '*.google.com');
  // tabs 2 and 3 match by domain (tab 3 also matches hostname but is in domain group)
  assert.ok(domainGroup.tabs.some(t => t.id === 2));
});

test('no domain group when no cross-subdomain tabs exist', () => {
  const active = tab(1, 'https://mail.google.com/');
  const others = [
    tab(2, 'https://mail.google.com/sent'),
    tab(3, 'https://mail.google.com/drafts'),
  ];
  const groups = generateGroups(active, [active, ...others]);
  assert.equal(groups.filter(g => g.strategy === 'domain').length, 0);
});

test('domain group appears when exactly 1 cross-subdomain tab exists', () => {
  const active = tab(1, 'https://mail.google.com/');
  const others = [tab(2, 'https://docs.google.com/')];
  const groups = generateGroups(active, [active, ...others]);
  const domainGroup = groups.find(g => g.strategy === 'domain');
  assert.ok(domainGroup, 'should form a domain group with 1 cross-subdomain tab');
});


// ── peer hostname grouping ────────────────────────────────────────────────────

test('generates peer group for same-domain different-subdomain tabs', () => {
  const active = tab(1, 'https://google.com/');
  const cal1 = tab(2, 'https://calendar.google.com/');
  const cal2 = tab(3, 'https://calendar.google.com/');
  const groups = generateGroups(active, [active, cal1, cal2]);
  const peerGroup = groups.find(g => g.strategy === 'peer');
  assert.ok(peerGroup, 'peer group should exist');
  assert.equal(peerGroup.label, 'calendar.google.com');
  assert.equal(peerGroup.tabs.length, 2);
  assert.ok(peerGroup.tabs.every(t => t.id !== active.id));
});

test('no peer group when fewer than 2 tabs on the peer subdomain', () => {
  const active = tab(1, 'https://google.com/');
  const cal = tab(2, 'https://calendar.google.com/');
  const groups = generateGroups(active, [active, cal]);
  assert.equal(groups.filter(g => g.strategy === 'peer').length, 0);
});

test('generates separate peer groups for distinct subdomains', () => {
  const active = tab(1, 'https://google.com/');
  const cal1 = tab(2, 'https://calendar.google.com/');
  const cal2 = tab(3, 'https://calendar.google.com/');
  const maps1 = tab(4, 'https://maps.google.com/');
  const maps2 = tab(5, 'https://maps.google.com/');
  const groups = generateGroups(active, [active, cal1, cal2, maps1, maps2]);
  const peerGroups = groups.filter(g => g.strategy === 'peer');
  assert.equal(peerGroups.length, 2);
  assert.ok(peerGroups.some(g => g.label === 'calendar.google.com'));
  assert.ok(peerGroups.some(g => g.label === 'maps.google.com'));
});

test('domain group label uses *.domain to indicate cross-subdomain scope', () => {
  const active = tab(1, 'https://mail.google.com/');
  const docs = tab(2, 'https://docs.google.com/');
  const groups = generateGroups(active, [active, docs]);
  const domainGroup = groups.find(g => g.strategy === 'domain');
  assert.ok(domainGroup);
  assert.equal(domainGroup.label, '*.google.com');
});

test('domain group label uses *.domain when active tab is at root domain', () => {
  const active = tab(1, 'https://github.com/foo');
  const sub = tab(2, 'https://gist.github.com/bar');
  const groups = generateGroups(active, [active, sub]);
  const domainGroup = groups.find(g => g.strategy === 'domain');
  assert.ok(domainGroup);
  assert.equal(domainGroup.label, '*.github.com');
});

// ── new tab ───────────────────────────────────────────────────────────────────

test('chrome://newtab tabs group together by hostname', () => {
  const active = tab(1, 'chrome://newtab/');
  const nt1 = tab(2, 'chrome://newtab/');
  const nt2 = tab(3, 'chrome://newtab/');
  const groups = generateGroups(active, [active, nt1, nt2]);
  const hostGroup = groups.find(g => g.strategy === 'hostname');
  assert.ok(hostGroup);
  assert.equal(hostGroup.label, 'newtab');
  assert.equal(hostGroup.tabs.length, 2);
});

test('always returns at least a hostname group for parsable HTTP tabs', () => {
  const active = tab(1, 'https://unique.com/');
  const others = [tab(2, 'https://other.com/')];
  const groups = generateGroups(active, [active, ...others]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].strategy, 'hostname');
  assert.equal(groups[0].tabs.length, 0);
});

// ── port handling in domain grouping ─────────────────────────────────────────

test('tabs on same port across subdomains form a domain group with port in label', () => {
  const active = tab(1, 'http://mail.example.com:8443/');
  const other = tab(2, 'http://docs.example.com:8443/');
  const groups = generateGroups(active, [active, other]);
  const domainGroup = groups.find(g => g.strategy === 'domain');
  assert.ok(domainGroup);
  assert.equal(domainGroup.label, '*.example.com:8443');
});

test('tabs on different ports do not form a cross-port domain group', () => {
  const active = tab(1, 'http://example.com:8443/');
  const other = tab(2, 'http://sub.example.com/');
  const groups = generateGroups(active, [active, other]);
  assert.equal(groups.filter(g => g.strategy === 'domain').length, 0);
});


// ── unparsable active tab ─────────────────────────────────────────────────────

test('file:// active tab forms a hostname group using the file path', () => {
  const active = { id: 1, url: 'file:///Users/foo/doc.html', title: 'Doc', pinned: false, lastAccessed: NOW };
  const sameFile = { id: 2, url: 'file:///Users/foo/doc.html', title: 'Doc', pinned: false, lastAccessed: NOW };
  const otherFile = { id: 3, url: 'file:///Users/foo/other.html', title: 'Other', pinned: false, lastAccessed: NOW };
  const http = tab(4, 'https://github.com/');
  const groups = generateGroups(active, [active, sameFile, otherFile, http]);
  const hostGroup = groups.find(g => g.strategy === 'hostname');
  assert.ok(hostGroup, 'hostname group should exist for file:// active tab');
  assert.equal(hostGroup.tabs.length, 1);
  assert.equal(hostGroup.tabs[0].id, 2); // only the tab at the same path
});

// ── chrome:// grouping ────────────────────────────────────────────────────────

test('chrome://extensions active tab forms a hostname group', () => {
  const active = { id: 1, url: 'chrome://extensions', title: 'Extensions', pinned: false, lastAccessed: NOW };
  const others = [tab(2, 'https://github.com/'), tab(3, 'https://github.com/foo')];
  const groups = generateGroups(active, [active, ...others]);
  const hostGroup = groups.find(g => g.strategy === 'hostname');
  assert.ok(hostGroup);
  assert.equal(hostGroup.label, 'extensions');
  assert.equal(hostGroup.tabs.length, 0); // no other chrome://extensions tabs
});

test('groups chrome:// tabs by hostname', () => {
  const active = { id: 1, url: 'chrome://extensions', title: 'Extensions', pinned: false, lastAccessed: NOW };
  const ext2 = { id: 2, url: 'chrome://extensions', title: 'Extensions', pinned: false, lastAccessed: NOW };
  const settings = { id: 3, url: 'chrome://settings', title: 'Settings', pinned: false, lastAccessed: NOW };
  const groups = generateGroups(active, [active, ext2, settings]);
  const hostGroup = groups.find(g => g.strategy === 'hostname');
  assert.ok(hostGroup);
  assert.equal(hostGroup.label, 'extensions');
  assert.equal(hostGroup.tabs.length, 1);
  assert.equal(hostGroup.tabs[0].id, 2);
});

test('no domain group for chrome:// tabs', () => {
  const active = { id: 1, url: 'chrome://extensions', title: 'Extensions', pinned: false, lastAccessed: NOW };
  const settings = { id: 2, url: 'chrome://settings', title: 'Settings', pinned: false, lastAccessed: NOW };
  const history = { id: 3, url: 'chrome://history', title: 'History', pinned: false, lastAccessed: NOW };
  const groups = generateGroups(active, [active, settings, history]);
  assert.equal(groups.filter(g => g.strategy === 'domain').length, 0);
});


// ── localhost / port grouping ─────────────────────────────────────────────────

test('localhost tabs on same port group together', () => {
  const active = tab(1, 'http://localhost:3000/');
  const other = tab(2, 'http://localhost:3000/about');
  const groups = generateGroups(active, [active, other]);
  const hostGroup = groups.find(g => g.strategy === 'hostname');
  assert.ok(hostGroup);
  assert.equal(hostGroup.label, 'localhost:3000');
  assert.equal(hostGroup.tabs.length, 1);
});

test('localhost tabs on different ports form separate groups', () => {
  const active = tab(1, 'http://localhost:3000/');
  const samePort = tab(2, 'http://localhost:3000/about');
  const diffPort = tab(3, 'http://localhost:8080/');
  const groups = generateGroups(active, [active, samePort, diffPort]);
  const hostGroup = groups.find(g => g.strategy === 'hostname');
  assert.ok(hostGroup);
  assert.equal(hostGroup.tabs.length, 1); // only samePort matches
  assert.equal(hostGroup.tabs[0].id, 2);
});


// ── generateTopGroups ─────────────────────────────────────────────────────────

test('generateTopGroups returns top 3 groups sorted by tab count descending', () => {
  const tabs = [
    tab(1, 'https://github.com/a'),
    tab(2, 'https://github.com/b'),
    tab(3, 'https://github.com/c'),
    tab(4, 'https://github.com/d'),  // 4 github
    tab(5, 'https://twitter.com/a'),
    tab(6, 'https://twitter.com/b'),
    tab(7, 'https://twitter.com/c'),  // 3 twitter
    tab(8, 'https://reddit.com/a'),
    tab(9, 'https://reddit.com/b'),   // 2 reddit
    tab(10, 'https://niche.com/'),    // 1 - excluded by min size
  ];
  const top = generateTopGroups(tabs, new Set());
  assert.equal(top.length, 3);
  assert.equal(top[0].label, 'github.com');
  assert.equal(top[0].tabs.length, 4);
  assert.equal(top[1].label, 'twitter.com');
  assert.equal(top[1].tabs.length, 3);
  assert.equal(top[2].label, 'reddit.com');
  assert.equal(top[2].tabs.length, 2);
});

test('generateTopGroups returns at most 3 groups even when more qualify', () => {
  const tabs = [
    tab(1, 'https://a.com/'), tab(2, 'https://a.com/'),
    tab(3, 'https://b.com/'), tab(4, 'https://b.com/'),
    tab(5, 'https://c.com/'), tab(6, 'https://c.com/'),
    tab(7, 'https://d.com/'), tab(8, 'https://d.com/'),
  ];
  const top = generateTopGroups(tabs, new Set());
  assert.equal(top.length, 3);
});

test('generateTopGroups excludes tabs with IDs in excludeTabIds', () => {
  const tabs = [
    tab(1, 'https://github.com/a'),
    tab(2, 'https://github.com/b'),
    tab(3, 'https://github.com/c'),
    tab(4, 'https://twitter.com/a'),
    tab(5, 'https://twitter.com/b'),
  ];
  const top = generateTopGroups(tabs, new Set([1, 2, 3]));
  assert.equal(top.length, 1);
  assert.equal(top[0].label, 'twitter.com');
});

test('generateTopGroups excludes pinned tabs', () => {
  const tabs = [
    tab(1, 'https://github.com/a', { pinned: true }),
    tab(2, 'https://github.com/b', { pinned: true }),
    tab(3, 'https://github.com/c', { pinned: true }),
    tab(4, 'https://twitter.com/a'),
    tab(5, 'https://twitter.com/b'),
  ];
  const top = generateTopGroups(tabs, new Set());
  assert.equal(top.length, 1);
  assert.equal(top[0].label, 'twitter.com');
});

test('generateTopGroups excludes groups smaller than 2 tabs', () => {
  const tabs = [
    tab(1, 'https://github.com/a'),
    tab(2, 'https://github.com/b'),
    tab(3, 'https://unique.com/'),
  ];
  const top = generateTopGroups(tabs, new Set());
  assert.equal(top.length, 1);
  assert.equal(top[0].label, 'github.com');
});

test('generateTopGroups returns empty array when no groups qualify', () => {
  const tabs = [tab(1, 'https://a.com/'), tab(2, 'https://b.com/')];
  const top = generateTopGroups(tabs, new Set());
  assert.equal(top.length, 0);
});

test('generateTopGroups uses top strategy', () => {
  const tabs = [tab(1, 'https://github.com/a'), tab(2, 'https://github.com/b')];
  const top = generateTopGroups(tabs, new Set());
  assert.equal(top[0].strategy, 'top');
});

test('generateTopGroups partial exclusion reduces group size and can drop it below minimum', () => {
  const tabs = [
    tab(1, 'https://github.com/a'),
    tab(2, 'https://github.com/b'),
    tab(3, 'https://github.com/c'),
    tab(4, 'https://twitter.com/a'),
    tab(5, 'https://twitter.com/b'),
  ];
  // exclude 2 of 3 github tabs → github drops to 1 tab → below minimum, excluded
  const top = generateTopGroups(tabs, new Set([1, 2]));
  assert.equal(top.length, 1);
  assert.equal(top[0].label, 'twitter.com');
});

test('generateTopGroups deduplication: excludeIds from current groups prevents double-listing', () => {
  const active = tab(1, 'https://github.com/');
  const gh2 = tab(2, 'https://github.com/foo');
  const gh3 = tab(3, 'https://github.com/bar');
  const tw1 = tab(4, 'https://twitter.com/a');
  const tw2 = tab(5, 'https://twitter.com/b');
  const allTabs = [active, gh2, gh3, tw1, tw2];

  const groups = generateGroups(active, allTabs);
  const excludeIds = new Set([active.id, ...groups.flatMap(g => g.tabs.map(t => t.id))]);
  const top = generateTopGroups(allTabs, excludeIds);

  // github tabs are in current groups → excluded from top groups
  assert.ok(top.every(g => g.label !== 'github.com'), 'github should not appear in top groups');
  // twitter has 2 tabs not in current groups → should appear
  assert.ok(top.some(g => g.label === 'twitter.com'));
});
