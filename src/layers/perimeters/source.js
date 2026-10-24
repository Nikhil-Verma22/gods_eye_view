import { readResponseJsonCapped } from '../../sources/httpBody.js';
import { normalizeFirePerimeterSnapshot } from './records.js';

// A portable export (package.json): no i18n here. Failures stay English data;
// the Layers panel shows them translated.
const msg = (text) => text;

const WFIGS_ARCGIS_URL =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/' +
  'WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query?' +
  new URLSearchParams({
    where: '1=1',
    outFields: [
      'poly_IncidentName',
      'attr_UniqueFireIdentifier',
      'attr_IncidentSize',
      'attr_PercentContained',
      'attr_POOState',
      'attr_IncidentTypeCategory',
      'attr_FireDiscoveryDateTime',
      'poly_DateCurrent',
      'attr_FireCause',
      'attr_FireBehaviorGeneral',
      'attr_TotalIncidentPersonnel',
      'attr_POOCounty',
      'attr_EstimatedCostToDate',
      'attr_IncidentComplexityLevel',
      'attr_CpxName',
    ].join(','),
    maxAllowableOffset: '0.001',
    outSR: '4326',
    f: 'geojson',
  }).toString();

/** Request a normalized snapshot through the bounded WFIGS proxy, with direct ArcGIS REST fallback. */
export function createWfigsPerimeterSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    async getSnapshot({ signal } = {}) {
      signal?.throwIfAborted();
      let response;
      try {
        response = await fetchImpl('/api/fire-perimeters', { signal });
      } catch {
        // Proxy fetch failed (e.g. offline or static hosting)
      }
      if (response && response.ok) {
        const payload = await readResponseJsonCapped(
          response,
          80 * 1024 * 1024,
          signal,
        );
        signal?.throwIfAborted();
        if (!Array.isArray(payload?.rows))
          throw new Error(msg('Malformed perimeter snapshot'));
        return payload.rows;
      }

      // Static hosting / direct fallback: ArcGIS REST FeatureServer with CORS
      signal?.throwIfAborted();
      const directResponse = await fetchImpl(WFIGS_ARCGIS_URL, { signal });
      if (!directResponse.ok)
        throw new Error(`WFIGS HTTP ${directResponse.status}`);
      const geojson = await directResponse.json();
      signal?.throwIfAborted();
      const rows = normalizeFirePerimeterSnapshot(geojson);
      if (!Array.isArray(rows))
        throw new Error(msg('Malformed perimeter snapshot'));
      return rows;
    },
  };
}
