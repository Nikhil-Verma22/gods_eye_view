import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseFirmsCsv, filterTrailing24h } from '../src/data/firmsCsv.js';

const key = (process.env.FIRMS_MAP_KEY || '').trim();
if (!key) {
  console.log('FIRMS_MAP_KEY not set; skipping NASA FIRMS snapshot generation.');
  process.exit(0);
}

async function generate() {
  console.log('Fetching live NASA FIRMS active fires...');
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/MODIS_NRT/world/1`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`NASA FIRMS HTTP ${res.status}: ${res.statusText}`);
  }
  const csv = await res.text();
  const allFires = parseFirmsCsv(csv, 'MODIS_NRT');
  const fires = filterTrailing24h(allFires, Date.now());

  const payload = {
    fetchedAt: Date.now(),
    stale: false,
    ttlMs: 30 * 60 * 1000,
    sources: [{ source: 'MODIS_NRT', count: fires.length, ok: true }],
    count: fires.length,
    fires,
  };

  const targetPath = 'public/data/firms-snapshot.json';
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, JSON.stringify(payload), 'utf-8');
  console.log(`Generated ${fires.length} active fires in ${targetPath}`);
}

generate().catch((err) => {
  console.error('Failed to generate FIRMS snapshot:', err);
  process.exit(1);
});
