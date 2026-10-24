import {
  finite,
  httpError,
  LiveSourceError,
  readResponse,
} from './contract.js';
import {
  normalizeAircraftTrack,
  openSkySnapshot,
  readsbSnapshot,
  readsbIdentities,
} from './aircraft.js';
import { normalizeVesselTrack, vesselSnapshot } from './vessels.js';

const defaultFetch = (...args) => globalThis.fetch(...args);
const header = (response, name) => response.headers?.get?.(name);

function openSkyError(response) {
  const error = httpError(response, 'Flights');
  const mode = String(
    header(response, 'x-opensky-auth-mode-used') ||
      header(response, 'x-opensky-auth') ||
      '',
  ).toLowerCase();
  const reason = String(
    header(response, 'x-opensky-auth-reason') || '',
  ).toLowerCase();
  if (response.status === 429 && (!mode || mode === 'anon'))
    error.message = 'OpenSky rate limited (anonymous)';
  if (response.status === 401 || response.status === 403) {
    const reasons = {
      oauth_invalid_or_missing: 'OpenSky OAuth client missing/invalid',
      oauth_invalid_credentials: 'OpenSky OAuth rejected credentials',
      missing_oauth_creds: 'OpenSky auth missing',
      auth_required: 'OpenSky auth required',
      forced_anonymous: 'OpenSky auth required',
    };
    error.message =
      reasons[reason] ||
      (/^(oauth_|basic_)/.test(reason)
        ? 'OpenSky auth invalid'
        : mode === 'anon'
          ? 'OpenSky auth required'
          : 'OpenSky auth failed');
  }
  return error;
}

/**
 * The provider a feed response names in `X-Feed-Source`, so a server that
 * answers a feed route from another provider is reported as that provider.
 */
function feedSource(response, fallback) {
  const named = header(response, 'x-feed-source');
  return typeof named === 'string' && named.trim()
    ? named.trim().slice(0, 80)
    : fallback;
}

/** The flights feed (/api/flights); no request starts during construction. */
export function createFlightSource({
  fetchImpl = defaultFetch,
  now = () => Date.now(),
} = {}) {
  return {
    // i18n-ignore: feed source name, replaced by the provider from each snapshot and reported to AI tools
    label: 'Flights',
    async getSnapshot(query = {}, { signal } = {}) {
      const params = new URLSearchParams();
      if (Number.isFinite(query.latitude) && Number.isFinite(query.longitude)) {
        params.set('lat', query.latitude.toFixed(4));
        params.set('lon', query.longitude.toFixed(4));
      }
      let response = null;
      let payload = null;
      try {
        ({ response, payload } = await readResponse(
          fetchImpl,
          `/api/flights${params.size ? '?' + params : ''}`,
          { signal },
          'Flights',
        ));
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
      }

      if (response && response.ok) {
        return {
          ...openSkySnapshot(payload, {
            source:
              header(response, 'x-flight-source') ||
              feedSource(response, 'Flights'),
            coverage:
              header(response, 'x-flight-coverage') ||
              'worldwide upstream snapshot',
            now: now(),
          }),
          status: response.status,
        };
      }

      if (response && response.status !== 404) {
        throw openSkyError(response);
      }

      // Static hosting fallback 1: OpenSky Network direct anonymous API
      try {
        signal?.throwIfAborted();
        const openSkyUrl = params.size
          ? `https://opensky-network.org/api/states/all?lamin=${Math.max(-90, query.latitude - 5).toFixed(4)}&lomin=${Math.max(-180, query.longitude - 5).toFixed(4)}&lamax=${Math.min(90, query.latitude + 5).toFixed(4)}&lomax=${Math.min(180, query.longitude + 5).toFixed(4)}`
          : 'https://opensky-network.org/api/states/all';
        const directRes = await fetchImpl(openSkyUrl, { signal });
        if (directRes.ok) {
          const directPayload = await directRes.json();
          return {
            ...openSkySnapshot(directPayload, {
              source: 'OpenSky Network',
              coverage: params.size
                ? 'regional view snapshot'
                : 'worldwide snapshot',
              now: now(),
            }),
            status: directRes.status,
          };
        }
      } catch (e) {
        if (e?.name === 'AbortError') throw e;
      }

      // Static hosting fallback 2: Bundled global flight snapshot
      try {
        signal?.throwIfAborted();
        const baseUrl = import.meta.env?.BASE_URL || '/';
        const snapshotUrl = `${baseUrl.replace(/\/$/, '')}/data/flights-snapshot.json`;
        const staticRes = await fetchImpl(snapshotUrl, { signal });
        if (staticRes.ok) {
          const staticPayload = await staticRes.json();
          return {
            ...openSkySnapshot(staticPayload, {
              source: 'OpenSky Network · Demo Snapshot',
              coverage: 'worldwide demonstration snapshot',
              now: now(),
            }),
            status: staticRes.status,
          };
        }
      } catch (e) {
        if (e?.name === 'AbortError') throw e;
      }

      if (response) throw openSkyError(response);
      throw new Error('Flights feed unavailable');
    },
    async getTrack(reference, { signal } = {}) {
      try {
        const { response, payload } = await readResponse(
          fetchImpl,
          '/api/flights/track?icao24=' + encodeURIComponent(reference),
          { signal },
          'Flights',
        );
        if (!response.ok) throw httpError(response, 'Flights');
        return {
          records: normalizeAircraftTrack(payload?.path),
          complete: false,
        };
      } catch {
        return { records: [], complete: false };
      }
    },
    async getEnrichment(query, { signal } = {}) {
      if (!['type', 'route'].includes(query.kind))
        throw new LiveSourceError('unsupported', 'Enrichment unavailable');
      try {
        const { response, payload } = await readResponse(
          fetchImpl,
          `/api/adsbdb/${query.kind}/${encodeURIComponent(query.id)}`,
          { signal },
          'adsbdb',
        );
        if (!response.ok) throw httpError(response, 'adsbdb');
        return payload;
      } catch {
        throw new LiveSourceError('unsupported', 'Enrichment unavailable');
      }
    },
  };
}

export function createMilitarySource({
  fetchImpl = defaultFetch,
  now = () => Date.now(),
} = {}) {
  return {
    // i18n-ignore: feed source name, replaced by the provider from each snapshot and reported to AI tools
    label: 'Military aircraft',
    async getIdentities(_query = {}, { signal } = {}) {
      let response = null;
      let payload = null;
      try {
        ({ response, payload } = await readResponse(
          fetchImpl,
          '/api/military',
          { signal },
          'Military aircraft',
        ));
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
      }
      if (response && response.ok) {
        return readsbIdentities(payload);
      }
      if (response && response.status !== 404) {
        return new Set();
      }
      try {
        const baseUrl = import.meta.env?.BASE_URL || '/';
        const snapshotUrl = `${baseUrl.replace(/\/$/, '')}/data/military-snapshot.json`;
        const staticRes = await fetchImpl(snapshotUrl, { signal });
        if (staticRes.ok) {
          const staticPayload = await staticRes.json();
          return readsbIdentities(staticPayload);
        }
      } catch {
        /* best effort */
      }
      return new Set();
    },
    async getSnapshot(_query = {}, { signal } = {}) {
      let response = null;
      let payload = null;
      try {
        ({ response, payload } = await readResponse(
          fetchImpl,
          '/api/military',
          { signal },
          'Military aircraft',
        ));
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
      }
      if (response && response.ok) {
        const age = finite(header(response, 'x-feed-age-ms'));
        return {
          ...readsbSnapshot(payload, {
            source: feedSource(response, 'Military aircraft'),
            observedAtMs: now() - (age != null && age > 0 ? age : 0),
            now: now(),
            stale: header(response, 'x-feed-cache') === 'STALE',
          }),
          status: response.status,
        };
      }
      if (response && response.status !== 404) {
        throw Object.assign(
          new Error(
            'Military feed requires local dev server proxy (CORS restricted upstream)',
          ),
          {
            status: response.status,
            source: 'Military aircraft',
            retryAfterMs: 60000,
            retryable: false,
          },
        );
      }

      // Static hosting fallback: Bundled military flight snapshot
      try {
        signal?.throwIfAborted();
        const baseUrl = import.meta.env?.BASE_URL || '/';
        const snapshotUrl = `${baseUrl.replace(/\/$/, '')}/data/military-snapshot.json`;
        const staticRes = await fetchImpl(snapshotUrl, { signal });
        if (staticRes.ok) {
          const staticPayload = await staticRes.json();
          return {
            ...readsbSnapshot(staticPayload, {
              source: 'adsb.lol · Demo Snapshot',
              observedAtMs: now(),
              now: now(),
              stale: false,
            }),
            status: staticRes.status,
          };
        }
      } catch (e) {
        if (e?.name === 'AbortError') throw e;
      }

      throw Object.assign(
        new Error(
          'Military feed requires local dev server proxy (CORS restricted upstream)',
        ),
        {
          status: response?.status ?? 404,
          source: 'Military aircraft',
          retryAfterMs: 60000,
          retryable: false,
        },
      );
    },
    // ADSB.lol does not expose a supported live-history endpoint. Omitting
    // optional getTrack keeps the tracking layer on its accumulated trail.
  };
}

export function createVesselSource({
  fetchImpl = defaultFetch,
  apiUrl = '/api/vessels',
  origin = () => globalThis.location?.origin || 'http://localhost',
} = {}) {
  return {
    // i18n-ignore: feed source name, replaced by the provider from each snapshot and reported to AI tools
    label: 'Vessels',
    async getSnapshot({ maxRows = 12000, area } = {}, { signal } = {}) {
      const url = new URL(apiUrl, origin());
      url.searchParams.set('maxRows', String(maxRows));
      // An area asks for the vessels around a point; servers that hold every
      // vessel may ignore it, since callers still keep only what they need.
      if (
        Number.isFinite(area?.lat) &&
        Number.isFinite(area?.lon) &&
        Number.isFinite(area?.radiusKm)
      ) {
        url.searchParams.set('lat', area.lat.toFixed(5));
        url.searchParams.set('lon', area.lon.toFixed(5));
        url.searchParams.set('radius_km', area.radiusKm.toFixed(1));
      }
      let response = null;
      let payload = null;
      try {
        ({ response, payload } = await readResponse(
          fetchImpl,
          url.toString(),
          { signal, cache: 'no-store' },
          'Vessels',
        ));
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
      }
      if (response && response.ok) {
        return {
          ...vesselSnapshot(payload, {
            source: feedSource(response, 'Vessels'),
          }),
          status: response.status,
        };
      }
      if (response && response.status !== 404) {
        const error = httpError(response, 'Vessels');
        const reasons = {
          'missing-key': 'AISSTREAM_API_KEY not set',
          'auth-failed': 'API key rejected — check AISSTREAM_API_KEY',
          unsupported: 'live feed unsupported',
          error: 'feed down',
          closed: 'feed disconnected',
        };
        error.message = reasons[payload?.status] || error.message;
        throw error;
      }

      // Static hosting fallback: Bundled vessel snapshot
      try {
        signal?.throwIfAborted();
        const baseUrl = import.meta.env?.BASE_URL || '/';
        const snapshotUrl = `${baseUrl.replace(/\/$/, '')}/data/vessels-snapshot.json`;
        const staticRes = await fetchImpl(snapshotUrl, { signal });
        if (staticRes.ok) {
          const staticPayload = await staticRes.json();
          return {
            ...vesselSnapshot(staticPayload, {
              source: 'AISStream · Demo Snapshot',
              coverage: 'worldwide demonstration snapshot',
            }),
            status: staticRes.status,
          };
        }
      } catch (e) {
        if (e?.name === 'AbortError') throw e;
      }

      if (response) throw httpError(response, 'Vessels');
      throw new Error('Vessels feed unavailable');
    },
    async getTrack(reference, { signal } = {}) {
      let response = null;
      let payload = null;
      try {
        ({ response, payload } = await readResponse(
          fetchImpl,
          '/api/vessels/track?mmsi=' + encodeURIComponent(reference),
          { signal },
          'Vessels',
        ));
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
      }
      if (response && response.ok) {
        return {
          records: normalizeVesselTrack(payload?.samples),
          complete: false,
        };
      }
      if (response && response.status !== 404) {
        throw httpError(response, 'Vessels');
      }
      return { records: [], complete: false };
    },
  };
}
