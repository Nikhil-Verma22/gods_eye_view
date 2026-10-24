/** Event packs the app serves under `/events/<id>/`, read once per id. */

const EVENT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function createEventPackSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  const cache = new Map();
  return {
    async getEvent(id, { signal } = {}) {
      if (!EVENT_ID.test(id)) throw new TypeError(`Invalid event id: ${id}`);
      if (!cache.has(id)) {
        signal?.throwIfAborted();
        const base =
          (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) ||
          '/';
        const normalizedBase = base.endsWith('/') ? base : `${base}/`;
        const response = await fetchImpl(
          `${normalizedBase}events/${id}/event.json`,
          {
            signal,
          },
        );
        if (!response.ok)
          throw new Error(`Event pack ${id} unavailable (${response.status})`);
        cache.set(id, await response.json());
      }
      return cache.get(id);
    },
  };
}
