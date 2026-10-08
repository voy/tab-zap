const DAY = 86400000;
const UNITS = { minute: 60000, hour: 3600000, day: DAY, week: 7 * DAY, month: 30 * DAY, year: 365 * DAY };
const NUMBERS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, fourteen: 14, thirty: 30 };

export function temporalFilter(query, oldDays = 7) {
  const explicit = query.match(/\b(older than|unused for|not (?:used|visited|accessed|opened) (?:in|for)|haven['’]?t (?:used|visited|accessed|opened) (?:in|for))\s+(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|fourteen|thirty)\s+(minute|hour|day|week|month|year)s?\b/i);
  if (explicit) {
    if (/\b(?:except|excluding|or)\b|\bnot\s*$/i.test(query.slice(0, explicit.index))) return null;
    const amount = NUMBERS[explicit[2].toLowerCase()] ?? Number(explicit[2]);
    return { minimumIdleMs: amount * UNITS[explicit[3].toLowerCase()], strict: explicit[1].toLowerCase() === 'older than', label: explicit[0] };
  }
  if (/\bold(?:\s+[\w-]+){0,4}\s+tabs\b/i.test(query) && !/\b(?:not|except|excluding)\s+old\b|\bor\b/i.test(query)) {
    return { minimumIdleMs: oldDays * DAY, strict: false, label: `unused for at least ${oldDays} days` };
  }
  return null;
}

export function isTimeOnlyQuery(query, filter) {
  if (!filter) return false;
  const remainder = query.replace(/\bold\b/i, '').replace(filter.label, '')
    .replace(/\b(?:all|tabs?|that|which|are|have|been|i)\b/gi, '').replace(/[\s.!?]+/g, '');
  return remainder === '';
}

export function idleTime(tab, now) {
  if (tab.active) return 0;
  if (!Number.isFinite(tab.lastAccessed) || tab.lastAccessed <= 0 || tab.lastAccessed > now) return null;
  return now - tab.lastAccessed;
}

export function matchesTime(tab, filter, now = Date.now()) {
  if (!filter) return true;
  const idle = idleTime(tab, now);
  if (idle === null) return false;
  return filter.strict ? idle > filter.minimumIdleMs : idle >= filter.minimumIdleMs;
}

export function activityContext(tab, now = Date.now()) {
  const idle = idleTime(tab, now);
  if (idle === null) return { lastUseKnown: false };
  const days = Math.floor(idle / DAY);
  const hours = Math.floor(idle / UNITS.hour);
  return {
    lastUseKnown: true,
    lastUsed: days ? `${days} full days ago` : hours ? `${hours} full hours ago` : 'within the last hour',
    unusedForAtLeastOneDay: idle >= DAY,
    unusedForAtLeastOneWeek: idle >= 7 * DAY,
    unusedForAtLeastOneMonth: idle >= 30 * DAY,
    activeNow: Boolean(tab.active),
  };
}
