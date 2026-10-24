import { DIRECTORY_ENDPOINT, RADIO_UUID_RE } from './policy.js';

const RADIO_FALLBACK_URL =
  'https://all.api.radio-browser.info/json/stations/topclick/150';

function cleanRadioText(value, maxLength) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

function normalizeRadioTag(value) {
  return cleanRadioText(
    String(value ?? '')
      .toLowerCase()
      .replace(/[_-]+/g, ' '),
    80,
  );
}

function isSafeRadioHttpsUrl(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, '')
      .replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || !hostname)
      return false;
    return !['localhost'].includes(hostname) && !hostname.endsWith('.local');
  } catch {
    return false;
  }
}

function normalizeRadioBrowserStation(raw) {
  const id = String(raw?.stationuuid || '').toLowerCase();
  if (!RADIO_UUID_RE.test(id)) return null;
  const lat = Number(raw?.geo_lat);
  const lon = Number(raw?.geo_long);
  const streamUrl = String(raw?.url_resolved || raw?.url || '').trim();
  const codec = cleanRadioText(raw?.codec, 20).toUpperCase();

  if (
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    !Number.isFinite(lon) ||
    lon < -180 ||
    lon > 180 ||
    !streamUrl ||
    !isSafeRadioHttpsUrl(streamUrl)
  )
    return null;

  const name = cleanRadioText(raw?.name, 140);
  if (!name) return null;

  const tags = String(raw?.tags ?? '')
    .split(',')
    .map(normalizeRadioTag)
    .filter(Boolean)
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .slice(0, 24);

  const countryCode = cleanRadioText(raw?.countrycode, 2).toUpperCase();
  const country = cleanRadioText(raw?.country, 80);

  const bitrate = Number(raw?.bitrate);

  return {
    id,
    name,
    lat,
    lon,
    streamUrl,
    homepage: isSafeRadioHttpsUrl(raw?.homepage) ? raw.homepage : '',
    tags,
    languages: String(raw?.language ?? '')
      .split(',')
      .map((l) => cleanRadioText(l, 40))
      .filter(Boolean)
      .slice(0, 8),
    state: cleanRadioText(raw?.state, 80),
    country: country || countryCode,
    countryCode,
    metadataTrust: 'untrusted-community',
    codec: codec || 'MP3',
    bitrate:
      Number.isInteger(bitrate) && bitrate >= 8 && bitrate <= 1024
        ? bitrate
        : null,
    clickCount: Math.max(0, Math.min(10_000_000, Number(raw?.clickcount) || 0)),
  };
}

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
      if (response && response.status !== 404) {
        throw new Error(`Radio directory returned ${response.status}`);
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
      signal?.throwIfAborted();
      let response;
      try {
        response = await fetchImpl(
          `/api/radio/click/${encodeURIComponent(id)}`,
          {
            method: 'POST',
            signal,
          },
        );
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
      }
      signal?.throwIfAborted();
      if (response && !response.ok && response.status !== 404) {
        throw new Error(`Radio click returned ${response.status}`);
      }
    },
  };
}
