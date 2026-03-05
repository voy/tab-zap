import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUrl } from './parse.js';

test('simple domain', () => {
  const r = parseUrl('https://github.com/foo/bar');
  assert.equal(r.hostname, 'github.com');
  assert.equal(r.registeredDomain, 'github.com');
  assert.deepEqual(r.pathSegments, ['foo', 'bar']);
});

test('subdomain is stripped from registeredDomain', () => {
  const r = parseUrl('https://mail.google.com/inbox');
  assert.equal(r.hostname, 'mail.google.com');
  assert.equal(r.registeredDomain, 'google.com');
  assert.deepEqual(r.pathSegments, ['inbox']);
});

test('multi-part TLD (co.uk)', () => {
  const r = parseUrl('https://www.bbc.co.uk/news');
  assert.equal(r.hostname, 'www.bbc.co.uk');
  assert.equal(r.registeredDomain, 'bbc.co.uk');
});

test('multi-part TLD (com.au)', () => {
  const r = parseUrl('https://www.abc.net.au/');
  assert.equal(r.registeredDomain, 'abc.net.au');
});

test('returns null for invalid URL', () => {
  assert.equal(parseUrl('not a url'), null);
});

test('returns null for chrome:// URL', () => {
  assert.equal(parseUrl('chrome://newtab'), null);
});

test('returns null for empty string', () => {
  assert.equal(parseUrl(''), null);
});

test('path segments are empty for root path', () => {
  const r = parseUrl('https://example.com/');
  assert.deepEqual(r.pathSegments, []);
});
