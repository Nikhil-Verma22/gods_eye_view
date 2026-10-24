import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from './project-root.mjs';

const ROOT = projectRoot(import.meta.url);
const DATA_DIR = path.join(ROOT, 'public', 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function generateSnapshots() {
  console.log('Fetching OpenSky live flights...');
  try {
    const res = await fetch('https://opensky-network.org/api/states/all');
    if (res.ok) {
      const data = await res.json();
      const allStates = data.states || [];
      // Filter for airborne flights with valid coordinates and callsigns
      const valid = allStates.filter((s) => {
        const lon = s[5];
        const lat = s[6];
        const callsign = typeof s[1] === 'string' ? s[1].trim() : '';
        const onGround = s[8];
        return (
          Number.isFinite(lat) &&
          Number.isFinite(lon) &&
          lat >= -85 &&
          lat <= 85 &&
          lon >= -180 &&
          lon <= 180 &&
          callsign.length >= 3 &&
          !onGround
        );
      });

      // Sample ~600 flights spread out evenly across the globe
      const step = Math.max(1, Math.floor(valid.length / 600));
      const sampled = [];
      for (let i = 0; i < valid.length && sampled.length < 600; i += step) {
        sampled.push(valid[i]);
      }

      const snapshot = {
        time: Math.floor(Date.now() / 1000),
        states: sampled,
      };

      const outPath = path.join(DATA_DIR, 'flights-snapshot.json');
      fs.writeFileSync(outPath, JSON.stringify(snapshot));
      console.log(`Saved ${sampled.length} civilian flights to ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
    } else {
      console.warn(`OpenSky returned HTTP ${res.status}`);
    }
  } catch (err) {
    console.error('Failed to fetch OpenSky snapshot:', err.message);
  }

  console.log('Fetching adsb.lol military flights...');
  try {
    const res = await fetch('https://api.adsb.lol/v2/mil', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GodsEyeView/1.0',
      },
    });
    if (res.ok) {
      const data = await res.json();
      const ac = (data.ac || []).filter((a) => {
        return Number.isFinite(a.lat) && Number.isFinite(a.lon);
      });

      const snapshot = {
        ac,
        total: ac.length,
        ctime: Math.floor(Date.now() / 1000),
      };

      const outPath = path.join(DATA_DIR, 'military-snapshot.json');
      fs.writeFileSync(outPath, JSON.stringify(snapshot));
      console.log(`Saved ${ac.length} military aircraft to ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
    } else {
      console.warn(`adsb.lol returned HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn('Notice: Using existing military snapshot (network fetch skipped):', err.message);
  }
}

generateSnapshots().catch((e) => {
  console.warn('Flight snapshots generation notice:', e.message);
});

