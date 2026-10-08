const titles = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

export function sortSearchTabs(tabs, activeTabId) {
  return [...tabs].sort((a, b) => {
    const currentFirst = Number(b.id === activeTabId) - Number(a.id === activeTabId);
    if (currentFirst) return currentFirst;
    return titles.compare(a.title || a.url || '', b.title || b.url || '');
  });
}
