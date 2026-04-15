export function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function trunc(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

export function formatShortcut(shortcut) {
  return shortcut
    .replace('Command+', '⌘')
    .replace('Ctrl+', '⌃')
    .replace('Alt+', '⌥')
    .replace('Shift+', '⇧');
}

export function tabCount(g) {
  return (['peer', 'top', 'other'].includes(g.strategy))
    ? g.tabs.length
    : g.tabs.length + 1;
}

export function renderLabel(label) {
  if (label.startsWith('*.')) {
    return `<span class="label-wildcard">*.</span>${esc(label.slice(2))}`;
  }
  if (label.startsWith('/')) {
    const parts = label.split('/').filter(Boolean);
    const short = parts.length > 1 ? `\u2026/${parts.slice(-2).join('/')}` : label;
    return `<span title="${esc(label)}">${esc(short)}</span>`;
  }
  return esc(label);
}
