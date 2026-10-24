const GROUPS = new Set([
  'stations',
  'visual',
  'gps-ops',
  'glo-ops',
  'galileo',
  'geo',
  'starlink',
]);

function celestrakTleUrl(group) {
  const url = new URL('https://celestrak.org/NORAD/elements/gp.php');
  url.searchParams.set('GROUP', group);
  url.searchParams.set('FORMAT', 'tle');
  return url.toString();
}

/** Read catalog text from the existing group endpoint using a supplied transport. */
export function createSatelliteSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    async readGroup(group, { signal } = {}) {
      if (!GROUPS.has(group)) throw new TypeError('Unknown satellite group');
      signal?.throwIfAborted();
      let response;
      try {
        response = await fetchImpl(`/api/celestrak/${group}`, { signal });
        if (!response.ok && response.status === 404) {
          throw new Error('HTTP 404');
        }
      } catch (err) {
        if (signal?.aborted) throw err;
        // Fallback directly to CelesTrak for static hosting
        response = await fetchImpl(celestrakTleUrl(group), { signal });
      }
      const text = response.ok ? await response.text() : '';
      signal?.throwIfAborted();
      // The proxy serves its last copy, marked STALE-ERROR, when CelesTrak
      // is down.
      const stale = response.headers?.get?.('x-tle-cache') === 'STALE-ERROR';
      return { ok: response.ok, status: response.status, text, stale };
    },
  };
}
