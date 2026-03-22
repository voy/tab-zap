import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateGroups, dedupeByCount } from './group.js';

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

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

// ── recency grouping ──────────────────────────────────────────────────────────

test('groups stale tabs by recency', () => {
  const active = tab(1, 'https://github.com/');
  const sameHost = tab(5, 'https://github.com/foo'); // ensures a url group exists
  const stale3d = tab(2, 'https://example.com/', { lastAccessed: NOW - 4 * DAY });
  const stale7d = tab(3, 'https://other.com/', { lastAccessed: NOW - 8 * DAY });
  const fresh = tab(4, 'https://fresh.com/');
  const others = [sameHost, stale3d, stale7d, fresh];
  const groups = generateGroups(active, [active, ...others]);
  const recencyGroups = groups.filter(g => g.strategy === 'recency');
  assert.ok(recencyGroups.length > 0);
  const threeDayGroup = recencyGroups.find(g => g.label.includes('3+'));
  assert.ok(threeDayGroup);
  assert.ok(threeDayGroup.tabs.some(t => t.id === stale3d.id));
  assert.ok(threeDayGroup.tabs.some(t => t.id === stale7d.id));
  assert.ok(!threeDayGroup.tabs.some(t => t.id === fresh.id));
});

test('no recency groups when no hostname/domain groups exist', () => {
  // recency groups are only shown when there are also URL-based groups
  const active = tab(1, 'https://unique-site.com/');
  const stale = [
    tab(2, 'https://a.com/', { lastAccessed: NOW - 5 * DAY }),
    tab(3, 'https://b.com/', { lastAccessed: NOW - 5 * DAY }),
  ];
  const groups = generateGroups(active, [active, ...stale]);
  assert.equal(groups.filter(g => g.strategy === 'recency').length, 0);
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

// ── new tab grouping ──────────────────────────────────────────────────────────

test('no newtab group when active tab is not a new tab', () => {
  const active = tab(1, 'https://github.com/');
  const nt1 = tab(2, 'chrome://newtab/');
  const nt2 = tab(3, 'chrome://newtab/');
  const groups = generateGroups(active, [active, nt1, nt2]);
  assert.equal(groups.filter(g => g.strategy === 'newtab').length, 0);
});

test('groups unused new tabs when active tab is also a new tab', () => {
  const active = tab(1, 'chrome://newtab/');
  const nt1 = tab(2, 'chrome://newtab/');
  const nt2 = tab(3, 'chrome://newtab/');
  const groups = generateGroups(active, [active, nt1, nt2]);
  const ntGroup = groups.find(g => g.strategy === 'newtab');
  assert.ok(ntGroup, 'newtab group should exist');
  assert.equal(ntGroup.tabs.length, 3);
});

test('no newtab group when fewer than 2 new tabs', () => {
  const active = tab(1, 'https://github.com/');
  const nt = tab(2, 'chrome://newtab/');
  const groups = generateGroups(active, [active, nt]);
  assert.equal(groups.filter(g => g.strategy === 'newtab').length, 0);
});

test('includes active tab in newtab group when active is also a new tab', () => {
  const active = tab(1, 'chrome://newtab/');
  const nt = tab(2, 'chrome://newtab/');
  const groups = generateGroups(active, [active, nt]);
  const ntGroup = groups.find(g => g.strategy === 'newtab');
  assert.ok(ntGroup, 'newtab group should exist');
  assert.ok(ntGroup.tabs.some(t => t.id === active.id));
  assert.equal(ntGroup.tabs.length, 2);
});

test('always returns at least a hostname group for parsable HTTP tabs', () => {
  const active = tab(1, 'https://unique.com/');
  const others = [tab(2, 'https://other.com/')];
  const groups = generateGroups(active, [active, ...others]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].strategy, 'hostname');
  assert.equal(groups[0].tabs.length, 0);
});

// ── dedupeByCount ─────────────────────────────────────────────────────────────

test('peer groups with equal tab counts are never deduplicated', () => {
  const active = tab(1, 'https://google.com/');
  const cal1 = tab(2, 'https://calendar.google.com/');
  const cal2 = tab(3, 'https://calendar.google.com/');
  const maps1 = tab(4, 'https://maps.google.com/');
  const maps2 = tab(5, 'https://maps.google.com/');
  const groups = generateGroups(active, [active, cal1, cal2, maps1, maps2]);
  const deduped = dedupeByCount(groups);
  const peerGroups = deduped.filter(g => g.strategy === 'peer');
  assert.equal(peerGroups.length, 2, 'both peer groups should survive deduplication');
});

test('dedupeByCount does not choke on hostname group with 0 other tabs alongside domain group', () => {
  // hostname group has 0 other tabs (count=1), domain group has 1 cross-subdomain tab (count=2)
  const active = tab(1, 'https://mail.google.com/');
  const other = tab(2, 'https://docs.google.com/');
  const groups = generateGroups(active, [active, other]);
  // hostname group: [] → count = 0+1 = 1; domain group: [other] → count = 1+1 = 2
  const deduped = dedupeByCount(groups);
  assert.ok(deduped.length <= groups.length);
});

test('dedupeByCount keeps all groups when counts are distinct', () => {
  // tabCount: hostname/domain use tabs.length+1, recency uses tabs.length
  // hostname(2) → 3, recency(5) → 5, domain(7) → 8 — all distinct
  const g = (strategy, count) => ({ strategy, tabs: Array(count).fill({}) });
  const groups = [g('hostname', 2), g('recency', 5), g('domain', 7)];
  const deduped = dedupeByCount(groups);
  assert.equal(deduped.length, 3);
});

test('dedupeByCount removes a group when it has the same tab count as an earlier group', () => {
  // hostname(1 tab) → count=2, domain(1 tab) → count=2: domain should be removed
  const g = (strategy, count) => ({ strategy, tabs: Array(count).fill({}) });
  const groups = [g('hostname', 1), g('domain', 1)];
  const deduped = dedupeByCount(groups);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].strategy, 'hostname');
});

// ── recency edge cases ────────────────────────────────────────────────────────

test('shows only 1-week group when no tabs are in 3-7 day window', () => {
  const active = tab(1, 'https://github.com/');
  const sameHost = tab(2, 'https://github.com/foo');
  const week1 = tab(3, 'https://a.com/', { lastAccessed: NOW - 8 * DAY });
  const week2 = tab(4, 'https://b.com/', { lastAccessed: NOW - 9 * DAY });
  const groups = generateGroups(active, [active, sameHost, week1, week2]);
  const recencyGroups = groups.filter(g => g.strategy === 'recency');
  assert.equal(recencyGroups.length, 1);
  assert.ok(recencyGroups[0].label.includes('1+'));
  assert.ok(recencyGroups[0].tabs.some(t => t.id === week1.id));
  assert.ok(recencyGroups[0].tabs.some(t => t.id === week2.id));
});

test('shows both recency groups when 3-day set is strictly larger than 1-week set', () => {
  const active = tab(1, 'https://github.com/');
  const sameHost = tab(2, 'https://github.com/foo');
  const day4a = tab(3, 'https://a.com/', { lastAccessed: NOW - 4 * DAY });
  const day4b = tab(4, 'https://b.com/', { lastAccessed: NOW - 5 * DAY });
  const week1 = tab(5, 'https://c.com/', { lastAccessed: NOW - 8 * DAY });
  const week2 = tab(6, 'https://d.com/', { lastAccessed: NOW - 9 * DAY });
  const groups = generateGroups(active, [active, sameHost, day4a, day4b, week1, week2]);
  const recencyGroups = groups.filter(g => g.strategy === 'recency');
  assert.equal(recencyGroups.length, 2);
  assert.ok(recencyGroups.some(g => g.label.includes('3+')));
  assert.ok(recencyGroups.some(g => g.label.includes('1+')));
});

test('tabs without lastAccessed are excluded from recency groups', () => {
  const active = tab(1, 'https://github.com/');
  const sameHost = tab(2, 'https://github.com/foo');
  const noAccess = tab(3, 'https://a.com/');
  delete noAccess.lastAccessed;
  const groups = generateGroups(active, [active, sameHost, noAccess]);
  const recencyGroups = groups.filter(g => g.strategy === 'recency');
  assert.equal(recencyGroups.length, 0);
});

// ── unparsable active tab ─────────────────────────────────────────────────────

test('returns empty groups for file:// active tab URL', () => {
  const active = { id: 1, url: 'file:///Users/foo/doc.html', title: 'Doc', pinned: false, lastAccessed: NOW };
  const others = [tab(2, 'https://github.com/'), tab(3, 'https://github.com/foo')];
  const groups = generateGroups(active, [active, ...others]);
  assert.equal(groups.length, 0);
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

test('chrome://newtab still triggers newtab group, not hostname group', () => {
  const active = tab(1, 'chrome://newtab/');
  const nt1 = tab(2, 'chrome://newtab/');
  const nt2 = tab(3, 'chrome://newtab/');
  const groups = generateGroups(active, [active, nt1, nt2]);
  assert.equal(groups.filter(g => g.strategy === 'hostname').length, 0);
  assert.ok(groups.find(g => g.strategy === 'newtab'));
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
