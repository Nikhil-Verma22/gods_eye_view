import { DIRECTORY_ENDPOINT, RADIO_UUID_RE } from './policy.js';
import { normalizeRadioBrowserStation } from '../../sources/radioBrowser.js';

const RADIO_FALLBACK_URL =
  'https://all.api.radio-browser.info/json/stations/topclick/150';

/** Supply directory metadata and click reporting; audio stays with the broadcaster. */
export function createRadioSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    async getDirectory({ signal } = {}) {
      signal?.throwIfAborted();
      let response;
      try {
        response = await fetchImpl(DIRECTORY_ENDPOINT, { signal });
      } catch {
        // Proxy not reachable (static hosting)
      }
      if (response && response.ok) {
        const body = await response.json();
        signal?.throwIfAborted();
        return body;
      }

      // Static hosting fallback: direct fetch from Radio Browser public mirror
      signal?.throwIfAborted();
      const directRes = await fetchImpl(RADIO_FALLBACK_URL, { signal });
      if (!directRes.ok)
        throw new Error(`Radio directory returned ${directRes.status}`);
      const rawStations = await directRes.json();
      signal?.throwIfAborted();
      const stations = (Array.isArray(rawStations) ? rawStations : [])
        .map(normalizeRadioBrowserStation)
        .filter(Boolean);
      return {
        stations,
        generation: 1,
        cachedAt: Date.now(),
      };
    },
    async recordClick(id, { signal } = {}) {
      if (typeof id !== 'string' || !RADIO_UUID_RE.test(id))
        throw new Error('Invalid radio station id');
      try {
        signal?.throwIfAborted();
        await fetchImpl(
          `/api/radio/click/${encodeURIComponent(id)}`,
          {
            method: 'POST',
            signal,
          },
        );
      } catch {
        // Best-effort click accounting
      }
    },
  };
}
