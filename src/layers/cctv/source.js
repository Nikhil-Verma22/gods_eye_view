import {
  ACTIVE_FRAME_REFRESH_MS,
  FRAME_ENDPOINT,
  MEDIA_ENDPOINT,
} from './sourcePolicy.js';
const FRAME_SOURCE_KINDS = new Set([
  'upstream-image',
  'hls-pull',
  'streetview',
  'synthetic',
]);
function safeNumber(value, fallback = NaN) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function frameUrlFor(camera, refreshMs = ACTIVE_FRAME_REFRESH_MS) {
  const cadenceMs = Math.max(
    1000,
    safeNumber(refreshMs, ACTIVE_FRAME_REFRESH_MS),
  );
  const tick = Math.floor(Date.now() / cadenceMs);
  const params = new URLSearchParams({
    label: camera.name,
    city: camera.city,
    lat: camera.lat.toFixed(6),
    lon: camera.lon.toFixed(6),
    heading: String(Math.round(camera.headingDeg)),
    fov: String(Math.round(camera.fovDeg)),
    pitch: String(Math.round(camera.pitchDeg || -10)),
    ts: String(tick),
  });
  return `${FRAME_ENDPOINT}/${encodeURIComponent(camera.id)}?${params.toString()}`;
}
function mediaUrlFor(camera) {
  return `${MEDIA_ENDPOINT}/${encodeURIComponent(camera.id)}?ts=${Math.floor(Date.now() / 15000)}`;
}
/** Supply catalog/health records and the existing registered camera URL families. */
export function createCctvSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  async function read(path, key, { signal } = {}) {
    signal?.throwIfAborted();
    let response;
    try {
      response = await fetchImpl(path, { cache: 'no-store', signal });
    } catch {
      // Proxy unavailable on static hosting
    }
    if (response && response.ok) {
      const payload = await response.json();
      signal?.throwIfAborted();
      if (!Array.isArray(payload?.[key]))
        throw new Error('Malformed camera ' + key + ' snapshot');
      return payload;
    }
    if (response && response.status !== 404) {
      throw new Error('HTTP ' + response.status);
    }

    // Static hosting fallback for CCTV sources
    if (path.includes('/sources')) {
      try {
        const austinUrl =
          'https://data.austintexas.gov/resource/b4k4-adkb.json?$limit=80&$where=camera_status=%27TURNED_ON%27';
        const directRes = await fetchImpl(austinUrl, { signal });
        if (directRes.ok) {
          const rows = await directRes.json();
          const sources = (Array.isArray(rows) ? rows : [])
            .map((row) => {
              const lat = Number(
                row.location?.latitude || row.location_latitude,
              );
              const lon = Number(
                row.location?.longitude || row.location_longitude,
              );
              if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
              return {
                id: `austin-${row.camera_id}`,
                name: row.location_name || 'Austin Traffic Cam',
                city: 'Austin',
                cityId: 'austin',
                provider: 'City of Austin Open Data',
                sourceKind: 'upstream-image',
                feedType: 'image',
                url: row.screenshot_address,
                lat,
                lon,
                headingDeg: 0,
                pitchDeg: -15,
                fovDeg: 60,
                mountHeightM: 10,
              };
            })
            .filter(Boolean);
          return { sources };
        }
      } catch {
        // Fall through to empty catalog
      }
      return { sources: [] };
    }

    if (path.includes('/health')) {
      return { cameras: [] };
    }

    throw new Error('Camera source HTTP ' + (response?.status ?? 404));
  }
  return {
    getCatalog(options) {
      return read('/api/cctv/sources', 'sources', options);
    },
    getHealth(options) {
      return read('/api/cctv/health', 'cameras', options);
    },
    getFrameUrl: frameUrlFor,
    getMediaUrl: mediaUrlFor,
    /** Read a registered frame and its provenance, including fallback frames. */
    async getFrame(camera, { signal } = {}) {
      signal?.throwIfAborted();
      let response;
      try {
        response = await fetchImpl(frameUrlFor(camera), {
          cache: 'no-store',
          signal,
        });
      } catch {
        // Proxy unavailable
      }
      if (response && response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        signal?.throwIfAborted();
        const type = response.headers.get('content-type') || '';
        const sourceKind = response.headers.get('x-cctv-source');
        return {
          contentType: type.split(';')[0].trim().toLowerCase(),
          bytes,
          sourceKind: FRAME_SOURCE_KINDS.has(sourceKind) ? sourceKind : null,
        };
      }
      if (camera?.url && /^https?:\/\//i.test(camera.url)) {
        try {
          const directRes = await fetchImpl(camera.url, { signal });
          if (directRes.ok) {
            const bytes = new Uint8Array(await directRes.arrayBuffer());
            const type = directRes.headers.get('content-type') || '';
            return {
              contentType:
                type.split(';')[0].trim().toLowerCase() || 'image/jpeg',
              bytes,
              sourceKind: 'upstream-image',
            };
          }
        } catch {
          // Direct frame failed
        }
      }
      throw new Error('Camera frame HTTP ' + (response?.status ?? 404));
    },
  };
}
