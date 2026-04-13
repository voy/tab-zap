import { parse as parseTld } from 'tldts';

/**
 * @param {string} urlString
 * @returns {{ hostname: string, registeredDomain: string, pathSegments: string[] } | null}
 */
export function parseUrl(urlString) {
  try {
    const url = new URL(urlString);

    if (url.protocol === 'file:') {
      const path = url.pathname;
      return { hostname: path, registeredDomain: path, pathSegments: path.split('/').filter(Boolean) };
    }

    const host = url.hostname.toLowerCase();
    if (!host) return null;

    // Include non-standard port so localhost:3000 ≠ localhost:8080
    const hostname = url.port ? `${host}:${url.port}` : host;

    const tld = parseTld(host);
    const registeredDomain = (tld.domain || host) + (url.port ? `:${url.port}` : '');

    return {
      hostname,
      registeredDomain,
      pathSegments: url.pathname.split('/').filter(Boolean),
    };
  } catch {
    return null;
  }
}
