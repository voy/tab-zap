import { parse as parseTld } from 'tldts';

/**
 * @param {string} urlString
 * @returns {{ hostname: string, registeredDomain: string, pathSegments: string[] } | null}
 */
export function parseUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (!url.protocol.startsWith('http')) return null;
    const hostname = url.hostname.toLowerCase();
    if (!hostname) return null;
    const tld = parseTld(hostname);
    const registeredDomain = tld.domain || hostname;
    return {
      hostname,
      registeredDomain,
      pathSegments: url.pathname.split('/').filter(Boolean),
    };
  } catch {
    return null;
  }
}
