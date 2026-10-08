export function isNewTab(tab) {
  return (!tab.pendingUrl || tab.pendingUrl === tab.url)
    && /^(?:chrome:\/\/(?:newtab|new-tab-page|new-tab-page-third-party)\/?|about:blank)$/i.test(tab.url || '');
}

export function isNewTabOnlyQuery(query, timeFilter) {
  const remainder = query.replace(timeFilter?.label ?? /$^/, '').replace(/\bold\b/gi, '').trim();
  return /^(?:(?:all|the|my|just|opened|unused|untouched|empty|blank)\s+)*(?:new[ -]?tabs?|blank tabs?|empty tabs?)(?:\s+(?:that|which|i|have|just|opened|and|but|never|did|done|anything|nothing|with|used|them))*[.!?]*$/i.test(remainder);
}
