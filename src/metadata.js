import { searchableTabs } from './jev.js';

export function readPageMetadata() {
  const description = document.querySelector('meta[name="description" i]')?.content?.trim()
    || document.querySelector('meta[property="og:description" i]')?.content?.trim()
    || '';
  return { url: location.href, description: description.slice(0, 1000) };
}

export async function enrichTabs(tabs, scripting, timeoutMs = 1000) {
  return Promise.all(searchableTabs(tabs).map(async tab => {
    if (tab.discarded || tab.status === 'loading' || !/^https?:\/\//i.test(tab.url ?? '')) return tab;
    let timer;
    try {
      const results = await Promise.race([
        scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, func: readPageMetadata }),
        new Promise(resolve => { timer = setTimeout(() => resolve([]), timeoutMs); }),
      ]);
      const metadata = results?.[0]?.result;
      if (metadata?.url !== tab.url || typeof metadata.description !== 'string') return tab;
      return { ...tab, description: metadata.description.slice(0, 1000) };
    } catch {
      return tab;
    } finally {
      clearTimeout(timer);
    }
  }));
}
