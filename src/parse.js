/**
 * @param {string} urlString
 * @returns {{ hostname: string, registeredDomain: string, pathSegments: string[] } | null}
 */
export function parseUrl(urlString) {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();
    if (!hostname) return null;
    return {
      hostname,
      pathSegments: url.pathname.split('/').filter(Boolean),
    };
  } catch {
    return null;
  }
}
