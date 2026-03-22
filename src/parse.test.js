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

test('returns null for chrome://newtab', () => {
  assert.equal(parseUrl('chrome://newtab'), null);
  assert.equal(parseUrl('chrome://newtab/'), null);
});

test('parses chrome://extensions', () => {
  const r = parseUrl('chrome://extensions');
  assert.equal(r.hostname, 'extensions');
  assert.equal(r.registeredDomain, 'extensions');
  assert.deepEqual(r.pathSegments, []);
});

test('parses chrome://settings with path', () => {
  const r = parseUrl('chrome://settings/passwords');
  assert.equal(r.hostname, 'settings');
  assert.deepEqual(r.pathSegments, ['passwords']);
});

test('parses chrome://history', () => {
  const r = parseUrl('chrome://history');
  assert.equal(r.hostname, 'history');
  assert.equal(r.registeredDomain, 'history');
});

test('localhost without port', () => {
  const r = parseUrl('http://localhost/app');
  assert.equal(r.hostname, 'localhost');
  assert.equal(r.registeredDomain, 'localhost');
});

test('localhost with port includes port in hostname', () => {
  const r = parseUrl('http://localhost:3000/app');
  assert.equal(r.hostname, 'localhost:3000');
  assert.equal(r.registeredDomain, 'localhost:3000');
});

test('different ports on localhost produce different hostnames', () => {
  const a = parseUrl('http://localhost:3000/');
  const b = parseUrl('http://localhost:8080/');
  assert.notEqual(a.hostname, b.hostname);
});

test('standard-port https URL is unaffected', () => {
  const r = parseUrl('https://example.com/');
  assert.equal(r.hostname, 'example.com');
});

test('returns null for empty string', () => {
  assert.equal(parseUrl(''), null);
});

test('path segments are empty for root path', () => {
  const r = parseUrl('https://example.com/');
  assert.deepEqual(r.pathSegments, []);
});
