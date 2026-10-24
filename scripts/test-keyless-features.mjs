#!/usr/bin/env node
/**
 * Diagnostic test script: Tests all features in God's Eye View that operate without an API key.
 *
 * Checks:
 * 1. Public upstream API reachability and data validity.
 * 2. Real browser CORS support (Origin header).
 * 3. Frontend client-side fallback status (whether the code in src/ can load it
 *    directly on static hosting like GitHub Pages, or if it hard-requires /api/*).
 * 4. Bundled static assets integrity (3D models, scene packs, submarine cables).
 *
 * Usage:
 *   node scripts/test-keyless-features.mjs
 *   npm run test:keyless
 *   npm run test:keyless -- --json
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { projectRoot } from './project-root.mjs';

const ROOT = projectRoot(import.meta.url);
const TIMEOUT_MS = 20000;

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

async function probeUrl(url, { headers = {}, method = 'GET' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Timeout')), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GodsEyeView/1.0',
        'Origin': 'https://nikhil-verma22.github.io',
        ...headers,
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    const corsHeader = res.headers.get('access-control-allow-origin');
    const corsOk = corsHeader === '*' || corsHeader?.includes('nikhil-verma22.github.io') || corsHeader?.includes('http');

    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      cors: corsOk,
      corsHeader: corsHeader || 'none',
      headers: Object.fromEntries(res.headers.entries()),
      response: res,
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 0,
      statusText: err.name === 'AbortError' ? 'Timed out' : err.message,
      cors: false,
      corsHeader: 'none',
      error: err.message,
    };
  }
}

const KEYLESS_FEATURES = [
  {
    id: 'satellites',
    name: 'Satellites & Orbits (CelesTrak)',
    category: 'Orbital & Space',
    upstream: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle',
    appPath: 'src/layers/satellites/source.js',
    hasClientFallback: true,
    async test() {
      const probe = await probeUrl(this.upstream);
      if (!probe.ok) {
        const text = await probe.response.text();
        if (probe.status === 403 && text.includes('not updated since your last successful download')) {
          return {
            pass: true,
            cors: probe.cors,
            details: `CelesTrak rate-guard active (data cached, updates every 2h), CORS supported`,
          };
        }
        return { pass: false, reason: `HTTP ${probe.status}: ${probe.statusText}` };
      }
      const text = await probe.response.text();
      const lines = text.trim().split('\n');
      const count = Math.floor(lines.length / 3);
      return {
        pass: count > 100,
        cors: probe.cors,
        details: `${count.toLocaleString()} active satellites loaded (TLE format)`,
      };
    },
  },
  {
    id: 'launches',
    name: 'Space Missions (Launch Library 2)',
    category: 'Orbital & Space',
    upstream: 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=20',
    appPath: 'src/layers/launches/source.js',
    hasClientFallback: true,
    async test() {
      const probe = await probeUrl(this.upstream);
      if (!probe.ok) return { pass: false, reason: `HTTP ${probe.status}: ${probe.statusText}` };
      const data = await probe.response.json();
      const count = data.results?.length || 0;
      return {
        pass: count > 0,
        cors: probe.cors,
        details: `${count} upcoming rocket launches loaded`,
      };
    },
  },
  {
    id: 'earthquakes',
    name: 'Real-time Earthquakes (USGS)',
    category: 'Geological & Hazards',
    upstream: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
    appPath: 'src/layers/earthquakes/source.js',
    hasClientFallback: true,
    async test() {
      const probe = await probeUrl(this.upstream);
      if (!probe.ok) return { pass: false, reason: `HTTP ${probe.status}: ${probe.statusText}` };
      const data = await probe.response.json();
      const count = data.features?.length || 0;
      return {
        pass: count > 0,
        cors: probe.cors,
        details: `${count} global seismic events (past 24h)`,
      };
    },
  },
  {
    id: 'air-quality',
    name: 'Air Quality Index (ECCC Canada)',
    category: 'Atmospheric & Climate',
    upstream: 'https://api.weather.gc.ca/collections/aqhi-observations-realtime/items?latest=true&limit=50',
    appPath: 'src/layers/airQuality/source.js',
    hasClientFallback: true,
    async test() {
      const probe = await probeUrl(this.upstream);
      if (!probe.ok) return { pass: false, reason: `HTTP ${probe.status}: ${probe.statusText}` };
      const data = await probe.response.json();
      const count = data.features?.length || 0;
      return {
        pass: count > 0,
        cors: probe.cors,
        details: `${count} AQHI monitoring stations reporting`,
      };
    },
  },
  {
    id: 'fire-perimeters',
    name: 'Wildfire Perimeters (NIFC WFIGS)',
    category: 'Geological & Hazards',
    upstream: 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query?where=1=1&returnCountOnly=true&f=json',
    appPath: 'src/layers/perimeters/source.js',
    hasClientFallback: false,
    async test() {
      const probe = await probeUrl(this.upstream);
      if (!probe.ok) return { pass: false, reason: `HTTP ${probe.status}: ${probe.statusText}` };
      const data = await probe.response.json();
      const count = data.count ?? 0;
      return {
        pass: count >= 0,
        cors: probe.cors,
        details: `${count} active wildfire perimeter polygons in ArcGIS`,
      };
    },
  },
  {
    id: 'cyclones',
    name: 'Tropical Cyclones & Storms (NOAA NHC)',
    category: 'Atmospheric & Climate',
    upstream: 'https://www.nhc.noaa.gov/CurrentStorms.json',
    appPath: 'src/layers/cyclones/source.js',
    hasClientFallback: false,
    async test() {
      const probe = await probeUrl(this.upstream);
      if (!probe.ok) return { pass: false, reason: `HTTP ${probe.status}: ${probe.statusText}` };
      const data = await probe.response.json();
      const count = data.activeStorms?.length || 0;
      return {
        pass: true,
        cors: probe.cors,
        details: `${count} active named tropical systems tracked`,
      };
    },
  },
  {
    id: 'recent-imagery',
    name: 'Recent Satellite Imagery (NASA GIBS)',
    category: 'Optical & Earth Observation',
    upstream: 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml',
    appPath: 'src/layers/recentImagery/source.js',
    hasClientFallback: true,
    async test() {
      const probe = await probeUrl(this.upstream);
      if (!probe.ok) return { pass: false, reason: `HTTP ${probe.status}: ${probe.statusText}` };
      return {
        pass: true,
        cors: probe.cors,
        details: 'NASA GIBS WMTS endpoints accessible with CORS',
      };
    },
  },
  {
    id: 'weather-radar',
    name: 'Weather Radar & Clouds (NOAA nowCOAST)',
    category: 'Atmospheric & Climate',
    upstream: 'https://nowcoast.noaa.gov/geoserver/observations/weather_radar/ows?service=WMS&version=1.1.1&request=GetCapabilities',
    appPath: 'src/layers/weather/source.js',
    hasClientFallback: false,
    async test() {
      const probe = await probeUrl(this.upstream);
      if (!probe.ok) return { pass: false, reason: `HTTP ${probe.status}: ${probe.statusText}` };
      return {
        pass: true,
        cors: probe.cors,
        details: 'NOAA nowCOAST WMS service reachable',
      };
    },
  },
  {
    id: 'wind',
    name: '10m Global Wind & Pressure (NOAA GFS)',
    category: 'Atmospheric & Climate',
    upstream: 'https://noaa-gfs-bdp-pds.s3.amazonaws.com/?prefix=gfs.',
    appPath: 'src/layers/wind/source.js',
    hasClientFallback: false,
    async test() {
      const probe = await probeUrl(this.upstream);
      if (!probe.ok) return { pass: false, reason: `HTTP ${probe.status}: ${probe.statusText}` };
      return {
        pass: true,
        cors: probe.cors,
        details: 'AWS S3 NOAA GFS open data bucket reachable',
      };
    },
  },
  {
    id: 'civilian-flights',
    name: 'Civilian Flights (OpenSky Anonymous)',
    category: 'Aviation & Tracking',
    upstream: 'https://opensky-network.org/api/states/all',
    appPath: 'src/sources/live/standalone.js',
    hasClientFallback: false,
    async test() {
      const probe = await probeUrl(this.upstream);
      if (!probe.ok) return { pass: false, reason: `HTTP ${probe.status}: ${probe.statusText}` };
      const data = await probe.response.json();
      const count = data.states?.length || 0;
      return {
        pass: count > 0,
        cors: probe.cors,
        details: `${count.toLocaleString()} aircraft tracked (CORS ${probe.cors ? 'allowed' : 'blocked'})`,
      };
    },
  },
  {
    id: 'military-flights',
    name: 'Military Aircraft (adsb.lol)',
    category: 'Aviation & Tracking',
    upstream: 'https://api.adsb.lol/v2/mil',
    appPath: 'src/sources/live/standalone.js',
    hasClientFallback: false,
    async test() {
      const probe = await probeUrl(this.upstream);
      if (!probe.ok) return { pass: false, reason: `HTTP ${probe.status}: ${probe.statusText}` };
      const data = await probe.response.json();
      const count = data.ac?.length || (Array.isArray(data) ? data.length : 0);
      return {
        pass: count > 0,
        cors: probe.cors,
        details: `${count} military aircraft tracked (Upstream live; CORS is server-only)`,
      };
    },
  },
  {
    id: 'gnss-integrity',
    name: 'GNSS / GPS Interference (adsb.lol)',
    category: 'Aviation & Tracking',
    upstream: 'https://api.adsb.lol/v2/lat/40/lon/-74/dist/250',
    appPath: 'src/layers/gnss/source.js',
    hasClientFallback: false,
    async test() {
      const probe = await probeUrl(this.upstream);
      if (!probe.ok) return { pass: false, reason: `HTTP ${probe.status}: ${probe.statusText}` };
      const data = await probe.response.json();
      const count = data.ac?.length || 0;
      return {
        pass: count > 0,
        cors: probe.cors,
        details: `${count} regional aircraft with NACp/NIC integrity fields (CORS is server-only)`,
      };
    },
  },
  {
    id: 'radio',
    name: 'Global Radio Stations (Radio Browser)',
    category: 'Communications & Signals',
    upstream: 'https://all.api.radio-browser.info/json/stations/topclick/10',
    appPath: 'src/layers/radio/source.js',
    hasClientFallback: false,
    async test() {
      const probe = await probeUrl(this.upstream);
      if (!probe.ok) return { pass: false, reason: `HTTP ${probe.status}: ${probe.statusText}` };
      const data = await probe.response.json();
      return {
        pass: data.length > 0,
        cors: probe.cors,
        details: `${data.length} live stream stations retrieved from Radio Browser`,
      };
    },
  },
  {
    id: 'cctv-austin',
    name: 'CCTV Cameras (City of Austin Open Data)',
    category: 'Ground Intelligence & CCTV',
    upstream: 'https://data.austintexas.gov/resource/b4k4-adkb.json?$limit=5',
    appPath: 'src/layers/cctv/source.js',
    hasClientFallback: false,
    async test() {
      const probe = await probeUrl(this.upstream);
      if (!probe.ok) return { pass: false, reason: `HTTP ${probe.status}: ${probe.statusText}` };
      const data = await probe.response.json();
      return {
        pass: data.length > 0,
        cors: probe.cors,
        details: `${data.length} cameras sampled, Socrata Open Data with CORS`,
      };
    },
  },
  {
    id: 'cctv-london',
    name: 'CCTV JamCams (Transport for London)',
    category: 'Ground Intelligence & CCTV',
    upstream: 'https://api.tfl.gov.uk/Place/Type/JamCam',
    appPath: 'src/layers/cctv/source.js',
    hasClientFallback: false,
    async test() {
      const probe = await probeUrl(this.upstream);
      if (!probe.ok) return { pass: false, reason: `HTTP ${probe.status}: ${probe.statusText}` };
      const data = await probe.response.json();
      return {
        pass: data.length > 0,
        cors: probe.cors,
        details: `${data.length} London TfL JamCams available`,
      };
    },
  },
  {
    id: 'bikeshare',
    name: 'Bikeshare Feeds (GBFS Open Data)',
    category: 'Transit & Mobility',
    upstream: 'https://toronto.publicbikesystem.net/ube/gbfs/v1/en/system_information',
    appPath: 'src/layers/bikeshare/source.js',
    hasClientFallback: false,
    async test() {
      const probe = await probeUrl(this.upstream);
      if (!probe.ok) return { pass: false, reason: `HTTP ${probe.status}: ${probe.statusText}` };
      const data = await probe.response.json();
      return {
        pass: !!data.data?.name,
        cors: probe.cors,
        details: `GBFS system: ${data.data?.name || 'Bike Share Toronto'}`,
      };
    },
  },
  {
    id: 'transit',
    name: 'Public Transit GTFS-RT (MBTA / CapMetro)',
    category: 'Transit & Mobility',
    upstream: 'https://cdn.mbta.com/realtime/VehiclePositions.pb',
    appPath: 'src/layers/transit/source.js',
    hasClientFallback: false,
    async test() {
      const probe = await probeUrl(this.upstream);
      if (!probe.ok) return { pass: false, reason: `HTTP ${probe.status}: ${probe.statusText}` };
      return {
        pass: true,
        cors: probe.cors,
        details: 'MBTA Protobuf feed available from CDN',
      };
    },
  },
  {
    id: 'cockpit-weather',
    name: 'Cockpit Local Weather (Open-Meteo)',
    category: 'Cockpit Utilities',
    upstream: 'https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current_weather=true',
    appPath: 'src/data/openMeteo.js',
    hasClientFallback: true,
    async test() {
      const probe = await probeUrl(this.upstream);
      if (!probe.ok) return { pass: false, reason: `HTTP ${probe.status}: ${probe.statusText}` };
      const data = await probe.response.json();
      return {
        pass: Number.isFinite(data.current_weather?.temperature),
        cors: probe.cors,
        details: `Current temp: ${data.current_weather?.temperature}°C (CORS enabled)`,
      };
    },
  },
  {
    id: 'place-search-photon',
    name: 'Place Geocoding Fallback (Photon / Komoot)',
    category: 'Cockpit Utilities',
    upstream: 'https://photon.komoot.io/api/?q=Austin&limit=1',
    appPath: 'src/data/search.js',
    hasClientFallback: true,
    async test() {
      const probe = await probeUrl(this.upstream);
      if (!probe.ok) return { pass: false, reason: `HTTP ${probe.status}: ${probe.statusText}` };
      const data = await probe.response.json();
      return {
        pass: data.features?.length > 0,
        cors: probe.cors,
        details: `Resolved: ${data.features?.[0]?.properties?.name || 'Austin'}`,
      };
    },
  },
  {
    id: 'cockpit-news',
    name: 'Cockpit Regional News (GDELT Project)',
    category: 'Cockpit Utilities',
    upstream: 'https://api.gdeltproject.org/api/v2/doc/doc?query=space&mode=artlist&format=json&maxrecords=5',
    appPath: 'src/data/news.js',
    hasClientFallback: true,
    async test() {
      const probe = await probeUrl(this.upstream);
      if (!probe.ok) return { pass: false, reason: `HTTP ${probe.status}: ${probe.statusText}` };
      const data = await probe.response.json();
      return {
        pass: data.articles?.length > 0,
        cors: probe.cors,
        details: `${data.articles?.length || 0} headlines fetched from GDELT`,
      };
    },
  },
  {
    id: 'basemap-esri',
    name: 'Esri World Imagery Basemap',
    category: 'Basemaps & Tiles',
    upstream: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/0/0/0',
    appPath: 'src/map/providers/esri.js',
    hasClientFallback: true,
    async test() {
      const probe = await probeUrl(this.upstream);
      return {
        pass: probe.ok,
        cors: probe.cors,
        details: 'Esri satellite tile 0/0/0 fetched successfully',
      };
    },
  },
  {
    id: 'basemap-openfreemap',
    name: 'OpenFreeMap Vector Tiles',
    category: 'Basemaps & Tiles',
    upstream: 'https://tiles.openfreemap.org/planet/0/0/0.pbf',
    appPath: 'src/sources/openFreeMap.js',
    hasClientFallback: true,
    async test() {
      const probe = await probeUrl(this.upstream);
      return {
        pass: probe.ok,
        cors: probe.cors,
        details: 'OpenFreeMap vector root tile reachable',
      };
    },
  },
  {
    id: 'submarine-cables-asset',
    name: 'Submarine Cables (Bundled TeleGeography)',
    category: 'Bundled Datasets',
    assetPath: 'src/data/local_data/telegeography_submarine_cables/cable-geo.json',
    appPath: 'src/layers/submarineCables/bundledSource.js',
    hasClientFallback: true,
    async test() {
      const fullPath = path.join(ROOT, this.assetPath);
      const exists = existsSync(fullPath);
      if (!exists) return { pass: false, reason: `File missing at ${this.assetPath}` };
      const raw = readFileSync(fullPath, 'utf8');
      const data = JSON.parse(raw);
      const count = data.features?.length || 0;
      return {
        pass: count > 0,
        cors: true,
        details: `${count} submarine cable segments bundled locally`,
      };
    },
  },
  {
    id: 'recorded-scenes-asset',
    name: 'Recorded Scenes (Bhote Koshi Event Pack)',
    category: 'Bundled Datasets',
    assetPath: 'public/events/bhote-koshi-2026/event.json',
    appPath: 'src/sources/eventPacks.js',
    hasClientFallback: true,
    async test() {
      const fullPath = path.join(ROOT, this.assetPath);
      const exists = existsSync(fullPath);
      if (!exists) return { pass: false, reason: `File missing at ${this.assetPath}` };
      const raw = readFileSync(fullPath, 'utf8');
      const data = JSON.parse(raw);
      return {
        pass: !!data.id,
        cors: true,
        details: `Event "${data.title || data.id}" with ${data.steps?.length || 0} narrative steps`,
      };
    },
  },
  {
    id: '3d-models-asset',
    name: 'Shipped 3D GLTF Models',
    category: 'Bundled Datasets',
    assetPath: 'public/models',
    appPath: 'src/data/modelCatalog.js',
    hasClientFallback: true,
    async test() {
      const models = ['airplane.glb', 'atr72.glb', 'b789.glb', 'bell206.glb', 'c172.glb', 'citation2.glb', 'jet.glb', 'mq9.glb'];
      const present = models.filter((m) => existsSync(path.join(ROOT, this.assetPath, m)));
      return {
        pass: present.length >= 4,
        cors: true,
        details: `${present.length}/${models.length} core 3D aircraft models verified in public/models/`,
      };
    },
  },
];

async function runDiagnostics() {
  const isJson = process.argv.includes('--json');
  if (!isJson) {
    console.log(`\n${COLORS.bold}${COLORS.cyan}══════════════════════════════════════════════════════════════════════════════${COLORS.reset}`);
    console.log(`${COLORS.bold}  GOD'S EYE VIEW — KEYLESS FEATURES DIAGNOSTIC SUITE${COLORS.reset}`);
    console.log(`${COLORS.dim}  Testing all live feeds and assets that operate without an API key...${COLORS.reset}`);
    console.log(`${COLORS.cyan}══════════════════════════════════════════════════════════════════════════════${COLORS.reset}\n`);
  }

  const results = [];

  for (const feature of KEYLESS_FEATURES) {
    if (!isJson) {
      process.stdout.write(`  Testing ${COLORS.bold}${feature.name}${COLORS.reset}... `);
    }
    const start = Date.now();
    let outcome;
    try {
      outcome = await feature.test();
    } catch (err) {
      outcome = { pass: false, reason: err.message, cors: false };
    }
    const duration = Date.now() - start;

    let statusCategory = 'FAILING';
    if (outcome.pass) {
      if (feature.hasClientFallback && outcome.cors) {
        statusCategory = 'WORKING_STATIC';
      } else if (!feature.hasClientFallback && outcome.cors) {
        statusCategory = 'STATIC_NEEDS_FALLBACK';
      } else if (!outcome.cors) {
        statusCategory = 'REQUIRES_BACKEND_PROXY';
      }
    }

    const itemResult = {
      id: feature.id,
      name: feature.name,
      category: feature.category,
      upstream: feature.upstream || feature.assetPath,
      hasClientFallback: feature.hasClientFallback,
      durationMs: duration,
      pass: outcome.pass,
      cors: outcome.cors,
      statusCategory,
      details: outcome.details || outcome.reason || 'No details',
    };
    results.push(itemResult);

    if (!isJson) {
      if (statusCategory === 'WORKING_STATIC') {
        console.log(`${COLORS.green}✔ READY ON GITHUB PAGES${COLORS.reset} ${COLORS.dim}(${duration}ms)${COLORS.reset}`);
        console.log(`    ${COLORS.dim}↳ ${outcome.details}${COLORS.reset}`);
      } else if (statusCategory === 'STATIC_NEEDS_FALLBACK') {
        console.log(`${COLORS.yellow}▲ UPSTREAM OK (CORS READY), NEEDS FRONTEND FALLBACK${COLORS.reset}`);
        console.log(`    ${COLORS.dim}↳ Upstream is public with CORS, but app calls /api/ which 404s on static hosting.${COLORS.reset}`);
        console.log(`    ${COLORS.dim}↳ ${outcome.details}${COLORS.reset}`);
      } else if (statusCategory === 'REQUIRES_BACKEND_PROXY') {
        console.log(`${COLORS.blue}ℹ REQUIRES LOCAL PROXY (UPSTREAM BLOCKS BROWSER CORS)${COLORS.reset}`);
        console.log(`    ${COLORS.dim}↳ Upstream works, but browser security blocks cross-origin fetch without proxy.${COLORS.reset}`);
        console.log(`    ${COLORS.dim}↳ ${outcome.details}${COLORS.reset}`);
      } else {
        console.log(`${COLORS.red}✖ FAILED${COLORS.reset}`);
        console.log(`    ${COLORS.red}↳ ${outcome.reason || outcome.details}${COLORS.reset}`);
      }
    }
  }

  const counts = {
    total: results.length,
    workingStatic: results.filter((r) => r.statusCategory === 'WORKING_STATIC').length,
    needsFallback: results.filter((r) => r.statusCategory === 'STATIC_NEEDS_FALLBACK').length,
    requiresProxy: results.filter((r) => r.statusCategory === 'REQUIRES_BACKEND_PROXY').length,
    failing: results.filter((r) => r.statusCategory === 'FAILING').length,
  };

  if (isJson) {
    console.log(JSON.stringify({ counts, results }, null, 2));
    return;
  }

  console.log(`\n${COLORS.bold}${COLORS.cyan}══════════════════════════════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.bold}  SUMMARY REPORT${COLORS.reset}`);
  console.log(`${COLORS.cyan}══════════════════════════════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`  Total Keyless Features Tested : ${COLORS.bold}${counts.total}${COLORS.reset}`);
  console.log(`  ✔ Working on GitHub Pages     : ${COLORS.green}${COLORS.bold}${counts.workingStatic}${COLORS.reset}`);
  console.log(`  ▲ Fixable with Client Fallback: ${COLORS.yellow}${COLORS.bold}${counts.needsFallback}${COLORS.reset} (Upstream has CORS, just needs frontend fallback)`);
  console.log(`  ℹ Requires Local Proxy (No CORS): ${COLORS.blue}${COLORS.bold}${counts.requiresProxy}${COLORS.reset} (Works with 'npm run dev', blocked by browser on static)`);
  console.log(`  ✖ Failed Upstreams            : ${counts.failing > 0 ? COLORS.red : COLORS.green}${COLORS.bold}${counts.failing}${COLORS.reset}`);
  console.log(`${COLORS.cyan}══════════════════════════════════════════════════════════════════════════════${COLORS.reset}\n`);
}

runDiagnostics();
