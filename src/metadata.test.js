import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichTabs } from './metadata.js';
import { buildRequest } from './jev.js';

const tab = { id: 1, url: 'https://example.com/', title: 'Example', status: 'complete' };

test('description reaches Jev without changing tab identity', async () => {
  const scripting = { executeScript: async options => {
    assert.deepEqual(options.target, { tabId: 1, frameIds: [0] });
    return [{ result: { url: tab.url, description: 'Czech news and analysis' } }];
  } };
  const [enriched] = await enrichTabs([tab], scripting);
  assert.equal(enriched.id, tab.id);
  assert.equal(enriched.url, tab.url);
  assert.equal(buildRequest('news', [enriched]).questions.tab_1.instructions.tab.description, 'Czech news and analysis');
  assert.equal(tab.description, undefined);
});

test('inaccessible, navigated, and malformed pages retain title/URL fallback', async () => {
  for (const executeScript of [
    async () => { throw new Error('Cannot access this page'); },
    async () => [{ result: { url: 'https://elsewhere.com/', description: 'Unrelated' } }],
    async () => [{ result: { url: tab.url, description: null } }],
    async () => [],
  ]) {
    assert.deepEqual(await enrichTabs([tab], { executeScript }), [tab]);
  }
});

test('discarded, loading, and Chrome pages are not injected; pinned tabs are excluded', async () => {
  const discarded = { ...tab, id: 2, discarded: true };
  const loading = { ...tab, id: 3, status: 'loading' };
  assert.deepEqual(await enrichTabs([discarded, loading, { ...tab, pinned: true },
    { id: 5, url: 'chrome://extensions' }], {
    executeScript: () => assert.fail('Unexpected script injection'),
  }), [discarded, loading, { id: 5, url: 'chrome://extensions' }]);
});

test('hung extraction times out and falls back without blocking classification', async () => {
  assert.deepEqual(await enrichTabs([tab], { executeScript: () => new Promise(() => {}) }, 5), [tab]);
});

test('long descriptions are bounded in both extraction and API payload', async () => {
  const [enriched] = await enrichTabs([tab], {
    executeScript: async () => [{ result: { url: tab.url, description: 'x'.repeat(5000) } }],
  });
  assert.equal(enriched.description.length, 1000);
  assert.equal(buildRequest('news', [{ ...tab, description: 'x'.repeat(5000) }]).questions.tab_1.instructions.tab.description.length, 1000);
});
