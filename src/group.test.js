import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateGroups } from './group.js';

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

test('no hostname group when fewer than 2 tabs match', () => {
  const active = tab(1, 'https://github.com/');
  const others = [tab(2, 'https://example.com/')];
  const groups = generateGroups(active, [active, ...others]);
  assert.equal(groups.filter(g => g.strategy === 'hostname').length, 0);
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
  assert.equal(domainGroup.label, 'google.com');
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

test('returns empty array when no groups match', () => {
  const active = tab(1, 'https://unique.com/');
  const others = [tab(2, 'https://other.com/')];
  const groups = generateGroups(active, [active, ...others]);
  assert.deepEqual(groups, []);
});
