import { parse as parseTld } from 'tldts';

/**
 * @param {string} urlString
 * @returns {{ hostname: string, registeredDomain: string, pathSegments: string[] } | null}
 */
export function parseUrl(urlString) {
  try {
    const url = new URL(urlString);
    const isHttp = url.protocol.startsWith('http');
    const isChrome = url.protocol === 'chrome:';

    if (!isHttp && !isChrome) return null;
    if (isChrome && url.hostname === 'newtab') return null;

    const host = url.hostname.toLowerCase();
    if (!host) return null;

    // Include non-standard port so localhost:3000 ≠ localhost:8080
    const hostname = isHttp && url.port ? `${host}:${url.port}` : host;

    const tld = parseTld(host);
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
