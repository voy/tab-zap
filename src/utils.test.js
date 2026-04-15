import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, trunc, formatShortcut, tabCount, renderLabel } from './utils.js';

// ── esc ───────────────────────────────────────────────────────────────────────

test('esc escapes ampersand', () => {
  assert.equal(esc('a&b'), 'a&amp;b');
});

test('esc escapes less-than', () => {
  assert.equal(esc('a<b'), 'a&lt;b');
});

test('esc escapes greater-than', () => {
  assert.equal(esc('a>b'), 'a&gt;b');
});

test('esc escapes double-quote', () => {
  assert.equal(esc('"hi"'), '&quot;hi&quot;');
});

test('esc is a no-op for plain text', () => {
  assert.equal(esc('hello world'), 'hello world');
});

test('esc coerces non-strings via String()', () => {
  assert.equal(esc(42), '42');
});

// ── trunc ─────────────────────────────────────────────────────────────────────

test('trunc returns empty string for null', () => {
  assert.equal(trunc(null, 10), '');
});

test('trunc returns empty string for empty string', () => {
  assert.equal(trunc('', 10), '');
});

test('trunc returns string unchanged when under limit', () => {
  assert.equal(trunc('hi', 10), 'hi');
});

test('trunc returns string unchanged at exact limit', () => {
  assert.equal(trunc('hello', 5), 'hello');
});

test('trunc truncates and appends ellipsis when over limit', () => {
  assert.equal(trunc('hello!', 5), 'hello…');
});

// ── formatShortcut ────────────────────────────────────────────────────────────

test('formatShortcut replaces Command+ with ⌘', () => {
  assert.equal(formatShortcut('Command+K'), '⌘K');
});

test('formatShortcut replaces Ctrl+ with ⌃', () => {
  assert.equal(formatShortcut('Ctrl+K'), '⌃K');
});

test('formatShortcut replaces Alt+ with ⌥', () => {
  assert.equal(formatShortcut('Alt+K'), '⌥K');
});

test('formatShortcut replaces Shift+ with ⇧', () => {
  assert.equal(formatShortcut('Shift+K'), '⇧K');
});

test('formatShortcut handles multi-modifier combination', () => {
  assert.equal(formatShortcut('Command+Shift+K'), '⌘⇧K');
});

// ── tabCount ──────────────────────────────────────────────────────────────────

test('tabCount for peer strategy returns tabs.length', () => {
  assert.equal(tabCount({ strategy: 'peer', tabs: [1, 2, 3] }), 3);
});

test('tabCount for top strategy returns tabs.length', () => {
  assert.equal(tabCount({ strategy: 'top', tabs: [1, 2] }), 2);
});

test('tabCount for other strategy returns tabs.length', () => {
  assert.equal(tabCount({ strategy: 'other', tabs: [1, 2, 3, 4] }), 4);
});

test('tabCount for hostname strategy adds 1 for the active tab', () => {
  assert.equal(tabCount({ strategy: 'hostname', tabs: [1, 2] }), 3);
});

test('tabCount for domain strategy adds 1 for the active tab', () => {
  assert.equal(tabCount({ strategy: 'domain', tabs: [1] }), 2);
});

// ── renderLabel ───────────────────────────────────────────────────────────────

test('renderLabel returns escaped plain label', () => {
  assert.equal(renderLabel('github.com'), 'github.com');
});

test('renderLabel escapes special chars in plain label', () => {
  assert.equal(renderLabel('<script>'), '&lt;script&gt;');
});

test('renderLabel wraps wildcard prefix in span', () => {
  assert.equal(renderLabel('*.google.com'), '<span class="label-wildcard">*.</span>google.com');
});

test('renderLabel escapes special chars after wildcard prefix', () => {
  assert.equal(renderLabel('*.<b>'), '<span class="label-wildcard">*.</span>&lt;b&gt;');
});

test('renderLabel truncates deep file path to last two segments', () => {
  const result = renderLabel('/Users/foo/bar/baz.html');
  assert.ok(result.includes('…/bar/baz.html'), 'should show last two segments');
  assert.ok(result.includes('title="/Users/foo/bar/baz.html"'), 'should keep full path in title');
});

test('renderLabel keeps single-segment file path without ellipsis', () => {
  const result = renderLabel('/foo');
  assert.ok(!result.includes('…'), 'should not truncate single-segment path');
  assert.ok(result.includes('/foo'));
});

test('renderLabel truncates two-segment file path with ellipsis', () => {
  const result = renderLabel('/foo/bar');
  assert.ok(result.includes('…/foo/bar'));
});
