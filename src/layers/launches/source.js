// A portable export (package.json): no i18n here. Failures stay English data;
// the Layers panel shows them translated.
const msg = (text) => text;

function launchLibraryRecentUrl(end = new Date()) {
  const roundedEnd = new Date(Math.floor(end.getTime() / 60000) * 60000);
  const start = new Date(roundedEnd.getTime() - 30 * 86400000);
  const url = new URL('https://ll.thespacedevs.com/2.3.0/launches/');
  url.searchParams.set('net__gte', start.toISOString());
  url.searchParams.set('net__lte', roundedEnd.toISOString());
  url.searchParams.set('limit', '100');
  url.searchParams.set('mode', 'detailed');
  return url.toString();
}

function celestrakTleUrl(group) {
  const url = new URL('https://celestrak.org/NORAD/elements/gp.php');
  url.searchParams.set('GROUP', group);
  url.searchParams.set('FORMAT', 'tle');
  return url.toString();
}

/** Read launch records and their optional active-orbit catalog with explicit cancellation. */
export function createLaunchSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  /** The launch payload, and whether the proxy served it from a stale cache. */
  async function getLaunchSnapshot({ signal } = {}) {
    signal?.throwIfAborted();
    let response;
    try {
      response = await fetchImpl('/api/launches', { signal });
      if (!response.ok && response.status === 404) {
        throw new Error('HTTP 404');
      }
    } catch (err) {
      if (signal?.aborted) throw err;
      // Fallback directly to Launch Library 2 for static hosting without server proxy
      response = await fetchImpl(launchLibraryRecentUrl(), {
        signal,
        headers: { Accept: 'application/json' },
      });
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    signal?.throwIfAborted();
    if (!Array.isArray(payload) && !Array.isArray(payload?.results))
      throw new Error(msg('Malformed launch snapshot'));
    return {
      payload,
      stale: response.headers?.get?.('x-gev-cache') === 'STALE-ERROR',
    };
  }
  return {
    getLaunchSnapshot,
    async getLaunches(options) {
      return (await getLaunchSnapshot(options)).payload;
    },
    async getActiveTle({ signal } = {}) {
      signal?.throwIfAborted();
      let response;
      try {
        response = await fetchImpl('/api/celestrak/active', { signal });
        if (!response.ok && response.status === 404) {
          throw new Error('HTTP 404');
        }
      } catch (err) {
        if (signal?.aborted) throw err;
        // Fallback directly to CelesTrak for static hosting
        response = await fetchImpl(celestrakTleUrl('active'), { signal });
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      signal?.throwIfAborted();
      return text;
    },
  };
}
