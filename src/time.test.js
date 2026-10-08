import test from 'node:test';
import assert from 'node:assert/strict';
import { temporalFilter, matchesTime, activityContext, isTimeOnlyQuery } from './time.js';

const DAY = 86400000;
const now = Date.UTC(2026, 9, 6);
const tab = days => ({ lastAccessed: now - days * DAY });

test('explicit inactivity windows use numeric and written durations', () => {
  assert.equal(temporalFilter('AI tabs unused for a week').minimumIdleMs, 7 * DAY);
  assert.equal(temporalFilter('tabs older than 3 days').minimumIdleMs, 3 * DAY);
  assert.equal(temporalFilter('tabs not visited in two months').minimumIdleMs, 60 * DAY);
  assert.equal(temporalFilter("tabs I haven't used for 12 hours").minimumIdleMs, DAY / 2);
});

test('age boundaries are computed in code', () => {
  const older = temporalFilter('tabs older than 3 days');
  assert.equal(matchesTime(tab(3), older, now), false);
  assert.equal(matchesTime(tab(3.01), older, now), true);
  assert.equal(matchesTime(tab(3), temporalFilter('unused for three days'), now), true);
});

test('active and unknown timestamps do not look old', () => {
  const filter = temporalFilter('unused for a week');
  for (const candidate of [{}, { lastAccessed: 0 }, { lastAccessed: NaN }, { lastAccessed: now + DAY }, { ...tab(30), active: true }]) {
    assert.equal(matchesTime(candidate, filter, now), false);
  }
  assert.deepEqual(activityContext({}, now), { lastUseKnown: false });
  assert.equal(activityContext({ ...tab(30), active: true }, now).unusedForAtLeastOneWeek, false);
});

test('old refers to tab inactivity, not old page contents', () => {
  assert.equal(temporalFilter('old news articles'), null);
  assert.equal(temporalFilter('all Czech news sites'), null);
  assert.equal(temporalFilter('AI tabs except old tabs'), null);
  assert.equal(temporalFilter('old AI tabs').minimumIdleMs, 7 * DAY);
  assert.equal(temporalFilter('old tabs', 30).minimumIdleMs, 30 * DAY);
});

test('only pure time queries bypass semantic classification', () => {
  for (const query of ['old tabs', 'all old tabs', 'tabs unused for a week', 'tabs older than 3 days']) {
    assert.equal(isTimeOnlyQuery(query, temporalFilter(query)), true);
  }
  for (const query of ['old AI tabs', 'Czech news tabs unused for a week']) {
    assert.equal(isTimeOnlyQuery(query, temporalFilter(query)), false);
  }
  assert.equal(temporalFilter('AI tabs excluding tabs unused for a week'), null);
  assert.equal(temporalFilter('tabs not older than 3 days'), null);
  assert.equal(temporalFilter('old tabs or AI tabs'), null);
});
