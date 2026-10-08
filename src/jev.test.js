import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, classifyTabs, readMatches, searchableTabs, tabsToClose, JEV_ENDPOINT } from './jev.js';

const tabs = [
  { id: 1, title: 'České zprávy', url: 'https://www.idnes.cz/', pinned: false },
  { id: 2, title: 'Example', url: 'https://example.com/', pinned: false },
];

test('search includes Chrome pages and excludes pinned and unsupported URLs', () => {
  const internal = { id: 4, title: 'Extensions', url: 'chrome://extensions/?id=elniiniinaiioabmobkmbjnjomfbkmhb' };
  assert.deepEqual(searchableTabs([...tabs, { ...tabs[0], id: 3, pinned: true },
    internal, { id: 5, url: 'file:///private/a' }]), [...tabs, internal]);
});

test('Chrome pages reach classification and can be closed from matches', async () => {
  const internalTabs = ['chrome://extensions/?id=elniiniinaiioabmobkmbjnjomfbkmhb',
    'chrome://settings/', 'chrome://history/', 'chrome://downloads/'].map((url, id) => ({ id, url, title: url }));
  const result = await classifyTabs('Chrome management pages', internalTabs, 'test-key', {
    fetchImpl: async (_, options) => {
      const request = JSON.parse(options.body);
      assert.deepEqual(Object.values(request.questions).map(question => question.instructions.tab.url), internalTabs.map(tab => tab.url));
      return { ok: true, json: async () => ({ answers: Object.fromEntries(internalTabs.map(tab => [`tab_${tab.id}`, { type: 'noul', noul: 1 }])) }) };
    },
  });
  assert.deepEqual(tabsToClose(internalTabs.map(tab => tab.id), result.tabs, internalTabs), [0, 1, 2, 3]);
});

test('empty new-tab searches run locally and exclude pages already navigating elsewhere', async () => {
  const emptyTabs = [
    { id: 3, title: 'New Tab', url: 'chrome://newtab/' },
    { id: 4, title: 'New Tab', url: 'chrome://new-tab-page/' },
    { id: 5, title: '', url: 'about:blank' },
    { id: 6, title: 'New Tab', url: 'https://example.com/' },
    { id: 7, url: 'chrome://newtab/', pinned: true },
    { id: 8, url: 'chrome://newtab/', pendingUrl: 'https://example.com/' },
    { id: 9, url: 'chrome://settings/' },
  ];
  for (const query of ['newtab', 'all new tabs', 'unused new tabs', 'blank tabs', 'empty tabs', 'new tabs i just opened and never did anything with']) {
    const result = await classifyTabs(query, [...tabs, ...emptyTabs], null, {
      fetchImpl: () => assert.fail('Unexpected API call'),
    });
    assert.deepEqual(result.tabs.map(tab => tab.id), [3, 4, 5], query);
    assert.deepEqual(tabsToClose([3], result.tabs, [{ ...emptyTabs[0], pendingUrl: 'https://example.com/' }]), []);
  }
});

test('new-tab searches respect age filters and mixed searches include new-tab metadata', async () => {
  const now = Date.now();
  const emptyTabs = [
    { id: 3, url: 'chrome://newtab/', lastAccessed: now - 8 * 86400000 },
    { id: 4, url: 'chrome://newtab/', lastAccessed: now - 86400000 },
  ];
  const result = await classifyTabs('old new tabs', [...tabs, ...emptyTabs], null, {
    now, fetchImpl: () => assert.fail('Unexpected API call'),
  });
  assert.deepEqual(result.tabs.map(tab => tab.id), [3]);
  assert.equal(buildRequest('news or new tabs', emptyTabs).questions.tab_3.instructions.tab.pageType,
    'empty new-tab page; no website opened');
});

test('each question contains only its own metadata, with the query as shared state', () => {
  const request = buildRequest('all Czech news sites', tabs);
  assert.equal(request.model, 'jev-latest');
  assert.deepEqual(request.state, { query: 'all Czech news sites' });
  assert.deepEqual(request.questions.tab_1.instructions.tab, { title: tabs[0].title, url: tabs[0].url, activity: { lastUseKnown: false } });
  assert.equal(JSON.stringify(request.questions.tab_1).includes(tabs[1].url), false);
});

test('matches validate every requested answer and ignore unrequested IDs', () => {
  const response = { answers: {
    tab_1: { type: 'noul', noul: 0.9 }, tab_2: { type: 'noul', noul: 0.1 },
    tab_999: { type: 'noul', noul: 1 },
  } };
  assert.deepEqual(readMatches(response, tabs).map(tab => tab.id), [1]);
  delete response.answers.tab_2;
  assert.throws(() => readMatches(response, tabs), /incomplete/);
  for (const noul of [NaN, -1, 2, '0.9', null]) {
    assert.throws(() => readMatches({ answers: { tab_1: { type: 'noul', noul } } }, [tabs[0]]), /invalid/);
  }
});

test('reviewable search includes likely matches below the old conservative cutoff', () => {
  const response = { answers: {
    tab_1: { type: 'noul', noul: 0.65 }, tab_2: { type: 'noul', noul: 0.49 },
  } };
  assert.deepEqual(readMatches(response, tabs).map(tab => tab.id), [1]);
});

test('classification bounds concurrency and uses the official authenticated endpoint', async () => {
  const manyTabs = Array.from({ length: 121 }, (_, id) => ({ ...tabs[0], id }));
  let active = 0;
  let peak = 0;
  const sizes = [];
  const result = await classifyTabs(' Czech news ', manyTabs, 'test-key', {
    fetchImpl: async (url, options) => {
      assert.equal(url, JEV_ENDPOINT);
      assert.equal(options.headers.Authorization, 'Bearer test-key');
      const request = JSON.parse(options.body);
      assert.equal(request.state.query, 'Czech news');
      const keys = Object.keys(request.questions);
      sizes.push(keys.length);
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
      return { ok: true, json: async () => ({ answers: Object.fromEntries(keys.map(key => [key, { type: 'noul', noul: 0.9 }])) }) };
    },
  });
  assert.deepEqual(sizes, [50, 50, 21]);
  assert.equal(peak, 2);
  assert.equal(result.searched, 121);
  assert.deepEqual(result.tabs.map(tab => tab.id), manyTabs.map(tab => tab.id));
});

test('missing keys and empty queries never make a network request', async () => {
  const fetchImpl = () => assert.fail('Unexpected network request');
  await assert.rejects(classifyTabs('news', tabs, '', { fetchImpl }), /TypeSafe key/);
  await assert.rejects(classifyTabs(' ', tabs, 'test-key', { fetchImpl }), /1–500/);
  assert.deepEqual(await classifyTabs('news', [], 'test-key', { fetchImpl }), { tabs: [], searched: 0 });
});

test('API and malformed responses fail without returning partial results or leaking bodies', async () => {
  for (const status of [401, 429, 529]) {
    await assert.rejects(classifyTabs('news', tabs, 'test-key', {
      fetchImpl: async () => ({ ok: false, status }),
    }), status === 401 ? /rejected/ : status === 429 ? /rate limit/ : /unavailable/);
  }
  await assert.rejects(classifyTabs('news', tabs, 'test-key', {
    fetchImpl: async () => ({ ok: true, json: async () => ({ answers: {} }) }),
  }), /incomplete/);
});

test('cancellation interrupts the request', async () => {
  const controller = new AbortController();
  const result = classifyTabs('news', tabs, 'test-key', {
    signal: controller.signal,
    fetchImpl: async (_, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }),
  });
  controller.abort();
  await assert.rejects(result, /cancelled/);
});

test('closing only accepts selected matches that still exist at the same URL and are unpinned', () => {
  const matches = [...tabs, { ...tabs[0], id: 3 }, { ...tabs[0], id: 4 }];
  const liveTabs = [tabs[0], { ...tabs[1], pinned: true },
    { ...tabs[0], id: 3, url: 'https://elsewhere.com' }, { ...tabs[0], id: 999 }];
  assert.deepEqual(tabsToClose([1, 2, 3, 4, 999], matches, liveTabs), [1]);
  assert.deepEqual(tabsToClose([], matches, liveTabs), []);
});

test('pure time searches work locally without a key or API call', async () => {
  const now = Date.now();
  const datedTabs = [{ ...tabs[0], lastAccessed: now - 8 * 86400000 }, { ...tabs[1], lastAccessed: now - 86400000 }];
  const result = await classifyTabs('old tabs', datedTabs, null, { now, fetchImpl: () => assert.fail('Unexpected API call') });
  assert.deepEqual(result.tabs.map(tab => tab.id), [1]);
  assert.equal(result.searched, 2);
  assert.equal(result.tabs[0].timeFilter.minimumIdleMs, 7 * 86400000);
  assert.deepEqual(tabsToClose([1], result.tabs, [{ ...datedTabs[0], lastAccessed: now }]), []);
});

test('mixed time and topic searches send only temporally eligible candidates to Jev', async () => {
  const now = Date.now();
  const result = await classifyTabs('AI tabs unused for 3 days', [
    { ...tabs[0], lastAccessed: now - 4 * 86400000 },
    { ...tabs[1], lastAccessed: now - 86400000 },
  ], 'test-key', { now, fetchImpl: async (_, options) => {
    const request = JSON.parse(options.body);
    assert.deepEqual(Object.keys(request.questions), ['tab_1']);
    assert.equal(request.questions.tab_1.instructions.tab.verifiedTimeCondition, 'unused for 3 days');
    return { ok: true, json: async () => ({ answers: { tab_1: { type: 'noul', noul: 0.9 } } }) };
  } });
  assert.deepEqual(result.tabs.map(tab => tab.id), [1]);
});
