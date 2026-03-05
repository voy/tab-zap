/**
 * @param {string} urlString
 * @returns {{ hostname: string, registeredDomain: string, pathSegments: string[] } | null}
 */
export function parseUrl(urlString) {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();
    if (!hostname) return null;
    const parts = hostname.split('.');
    const registeredDomain = parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
    return {
      hostname,
      registeredDomain,
      pathSegments: url.pathname.split('/').filter(Boolean),
    };
  } catch {
    return null;
  }
}
