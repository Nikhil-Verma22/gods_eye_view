/** Read a GBFS station document through the server proxy or direct fallback on static hosting. */
export function createBikeshareSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    async getStations(upstreamUrl, { signal } = {}) {
      const url = new URL(upstreamUrl);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash)
        throw new TypeError('A public HTTPS GBFS URL is required');
      signal?.throwIfAborted();
      let response;
      try {
        response = await fetchImpl(
          '/api/gbfs/' + encodeURIComponent(url.href),
          { method: 'GET', headers: { Accept: 'application/json' }, signal },
        );
      } catch {
        // Proxy unavailable (static hosting)
      }
      if (!response || response.status === 404) {
        // Static hosting fallback: direct fetch from GBFS feed with CORS
        signal?.throwIfAborted();
        response = await fetchImpl(url.href, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal,
        });
      }
      if (!response.ok) throw new Error('GBFS HTTP ' + response.status);
      const payload = await response.json();
      signal?.throwIfAborted();
      if (!payload || typeof payload !== 'object')
        throw new Error('Malformed GBFS payload');
      return payload;
    },
  };
}
