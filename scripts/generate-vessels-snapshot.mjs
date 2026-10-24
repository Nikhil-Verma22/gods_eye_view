import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const nowUtc = new Date().toISOString();
const nowEpoch = Math.floor(Date.now() / 1000);

const SHIPS = [
  // Container & Cargo Giants
  { mmsi: '211885000', name: 'EVER GIVEN', imo: '9811000', type: 'Cargo - Container', destination: 'ROTTERDAM', lat: 51.95, lon: 4.05, speed: 14.2, course: 78, heading: 80 },
  { mmsi: '353136000', name: 'EVER GOLDEN', imo: '9811012', type: 'Cargo - Container', destination: 'HAMBURG', lat: 53.52, lon: 9.88, speed: 12.8, course: 110, heading: 112 },
  { mmsi: '219018000', name: 'MAERSK MC-KINNEY MOLLER', imo: '9619907', type: 'Cargo - Container', destination: 'SUEZ CANAL', lat: 29.95, lon: 32.55, speed: 11.5, course: 165, heading: 165 },
  { mmsi: '219019000', name: 'MADISON MAERSK', imo: '9619945', type: 'Cargo - Container', destination: 'SINGAPORE', lat: 1.25, lon: 103.82, speed: 15.0, course: 95, heading: 96 },
  { mmsi: '219020000', name: 'MAGLEBY MAERSK', imo: '9619957', type: 'Cargo - Container', destination: 'HONG KONG', lat: 22.31, lon: 114.12, speed: 13.5, course: 42, heading: 40 },
  { mmsi: '357224000', name: 'CMA CGM ANTOINE DE SAINT EXUPERY', imo: '9776418', type: 'Cargo - Container', destination: 'LE HAVRE', lat: 49.48, lon: 0.11, speed: 16.4, course: 85, heading: 86 },
  { mmsi: '228386800', name: 'CMA CGM JACQUES SAADE', imo: '9839179', type: 'Cargo - Container', destination: 'SHANGHAI', lat: 31.35, lon: 121.65, speed: 15.8, course: 120, heading: 122 },
  { mmsi: '374859000', name: 'HMM ALGECIRAS', imo: '9863297', type: 'Cargo - Container', destination: 'BUSAN', lat: 35.08, lon: 129.04, speed: 17.1, course: 220, heading: 222 },
  { mmsi: '352883000', name: 'ONE APUS', imo: '9806079', type: 'Cargo - Container', destination: 'TOKYO', lat: 35.61, lon: 139.78, speed: 14.6, course: 350, heading: 352 },
  { mmsi: '477306200', name: 'OOCL HONG KONG', imo: '9776171', type: 'Cargo - Container', destination: 'YANTIAN', lat: 22.56, lon: 114.28, speed: 16.0, course: 180, heading: 180 },
  { mmsi: '636019825', name: 'MSC GULSUN', imo: '9839430', type: 'Cargo - Container', destination: 'FELIXSTOWE', lat: 51.94, lon: 1.32, speed: 12.0, course: 260, heading: 258 },
  { mmsi: '636020584', name: 'MSC MICHEL CAPPELLINI', imo: '9929883', type: 'Cargo - Container', destination: 'ANTWERP', lat: 51.28, lon: 4.31, speed: 10.5, course: 145, heading: 145 },

  // Tankers & LNG Carriers
  { mmsi: '311000673', name: 'TI EUROPE', imo: '9235268', type: 'Tanker - Crude Oil', destination: 'RAS TANURA', lat: 26.65, lon: 50.15, speed: 13.2, course: 320, heading: 320 },
  { mmsi: '538005697', name: 'FRONTIER FALCON', imo: '9653456', type: 'Tanker - Crude Oil', destination: 'HOUSTON', lat: 29.35, lon: -94.75, speed: 11.0, course: 305, heading: 304 },
  { mmsi: '356492000', name: 'Q-MAX MOZAH', imo: '9337755', type: 'Tanker - LNG', destination: 'RAS LAFFAN', lat: 25.92, lon: 51.60, speed: 15.5, course: 45, heading: 45 },
  { mmsi: '229443000', name: 'GASLOG GLASGOW', imo: '9687019', type: 'Tanker - LNG', destination: 'ZEEBRUGGE', lat: 51.36, lon: 3.19, speed: 14.8, course: 115, heading: 114 },
  { mmsi: '310627000', name: 'BRITISH EMERALD', imo: '9333591', type: 'Tanker - LNG', destination: 'ISLE OF GRAIN', lat: 51.44, lon: 0.71, speed: 12.4, course: 240, heading: 242 },
  { mmsi: '256421000', name: 'STENA IMPERATIVE', imo: '9666077', type: 'Tanker - Chemical/Oil', destination: 'GIBRALTAR', lat: 36.14, lon: -5.35, speed: 12.1, course: 85, heading: 85 },
  { mmsi: '538006124', name: 'EAGLE BLAZER', imo: '9702584', type: 'Tanker - Crude Oil', destination: 'CORPUS CHRISTI', lat: 27.82, lon: -97.05, speed: 10.2, course: 275, heading: 276 },

  // Bulk Carriers
  { mmsi: '353775000', name: 'BERGE OLYMPUS', imo: '9750969', type: 'Cargo - Bulk Carrier', destination: 'TUBARAO', lat: -20.28, lon: -40.24, speed: 12.5, course: 215, heading: 215 },
  { mmsi: '354924000', name: 'VALE BRASIL', imo: '9488918', type: 'Cargo - Bulk Carrier', destination: 'QINGDAO', lat: 36.06, lon: 120.31, speed: 13.0, course: 340, heading: 342 },
  { mmsi: '371842000', name: 'PACIFIC RUBY', imo: '9583861', type: 'Cargo - Bulk Carrier', destination: 'PORT HEDLAND', lat: -20.31, lon: 118.57, speed: 11.8, course: 190, heading: 190 },
  { mmsi: '538004123', name: 'STAR POLARIS', imo: '9512345', type: 'Cargo - Bulk Carrier', destination: 'NEWCASTLE AU', lat: -32.92, lon: 151.78, speed: 10.9, course: 170, heading: 172 },

  // Cruise Ships & Passenger
  { mmsi: '311000984', name: 'ICON OF THE SEAS', imo: '9829930', type: 'Passenger - Cruise', destination: 'MIAMI', lat: 25.77, lon: -80.17, speed: 18.2, course: 290, heading: 292 },
  { mmsi: '311000593', name: 'WONDER OF THE SEAS', imo: '9838345', type: 'Passenger - Cruise', destination: 'NASSAU', lat: 25.08, lon: -77.34, speed: 17.5, course: 125, heading: 125 },
  { mmsi: '311000217', name: 'SYMPHONY OF THE SEAS', imo: '9744001', type: 'Passenger - Cruise', destination: 'COZUMEL', lat: 20.51, lon: -86.96, speed: 19.0, course: 210, heading: 212 },
  { mmsi: '235059538', name: 'QUEEN MARY 2', imo: '9241061', type: 'Passenger - Ocean Liner', destination: 'NEW YORK', lat: 40.52, lon: -73.85, speed: 21.4, course: 310, heading: 310 },
  { mmsi: '235080000', name: 'QUEEN ELIZABETH', imo: '9477438', type: 'Passenger - Cruise', destination: 'SOUTHAMPTON', lat: 50.75, lon: -1.35, speed: 16.0, course: 35, heading: 36 },
  { mmsi: '228387000', name: 'MSC VIRTUOSA', imo: '9803625', type: 'Passenger - Cruise', destination: 'BARCELONA', lat: 41.35, lon: 2.18, speed: 15.2, course: 225, heading: 226 },
  { mmsi: '247385600', name: 'COSTA SMERALDA', imo: '9781889', type: 'Passenger - Cruise', destination: 'GENOA', lat: 44.40, lon: 8.92, speed: 14.5, course: 355, heading: 355 },

  // Major Waterway Vessels (English Channel, Dover Strait, Singapore, Malacca, Panama, SF Bay)
  { mmsi: '211281720', name: 'CINDY', imo: '9195444', type: 'Cargo - General', destination: 'ROTTERDAM', lat: 51.25, lon: 1.85, speed: 11.2, course: 52, heading: 50 },
  { mmsi: '244830843', name: 'BALTIC SPIRIT', imo: '9356505', type: 'Cargo - Reefer', destination: 'ANTWERP', lat: 51.15, lon: 1.62, speed: 13.4, course: 48, heading: 48 },
  { mmsi: '228027700', name: 'PONT-AVEN', imo: '9268746', type: 'Passenger/Ro-Ro Ferry', destination: 'PORTSMOUTH', lat: 50.12, lon: -1.15, speed: 20.1, course: 12, heading: 12 },
  { mmsi: '563038000', name: 'OCEAN STAR', imo: '9620000', type: 'Cargo - Container', destination: 'SINGAPORE', lat: 1.22, lon: 103.75, speed: 12.0, course: 102, heading: 102 },
  { mmsi: '566234000', name: 'STRAIT NAVIGATOR', imo: '9710000', type: 'Tanker - Chemical', destination: 'PORT KLANG', lat: 2.95, lon: 101.32, speed: 11.5, course: 315, heading: 314 },
  { mmsi: '354123456', name: 'PANAMA TRADER', imo: '9801122', type: 'Cargo - Container', destination: 'BALBOA', lat: 8.95, lon: -79.56, speed: 8.5, course: 345, heading: 345 },
  { mmsi: '355987654', name: 'ISTHMUS PIONEER', imo: '9803344', type: 'Cargo - Bulk', destination: 'COLON', lat: 9.35, lon: -79.92, speed: 9.0, course: 175, heading: 176 },
  { mmsi: '366999712', name: 'GOLDEN GATE VOYAGER', imo: '9123456', type: 'Passenger - Ferry', destination: 'SAN FRANCISCO', lat: 37.81, lon: -122.42, speed: 14.0, course: 140, heading: 140 },
  { mmsi: '367123456', name: 'PACIFIC PROTECTOR', imo: '9234567', type: 'Tug / Workboat', destination: 'OAKLAND', lat: 37.79, lon: -122.35, speed: 7.2, course: 90, heading: 90 },
  { mmsi: '368987654', name: 'HUDSON CLIPPER', imo: '9345678', type: 'Passenger - Ferry', destination: 'MANHATTAN', lat: 40.71, lon: -74.02, speed: 15.5, course: 45, heading: 45 },
];

const rows = SHIPS.map((ship) => ({
  mmsi: ship.mmsi,
  name: ship.name,
  imo: ship.imo,
  type: ship.type,
  destination: ship.destination,
  lat: ship.lat,
  lon: ship.lon,
  speed: ship.speed,
  course: ship.course,
  heading: ship.heading,
  last_position_epoch: nowEpoch,
  last_position_UTC: nowUtc,
}));

const payload = {
  status: 'live',
  serverTime: nowUtc,
  newestPositionAt: nowUtc,
  count: rows.length,
  rows,
};

const targetPath = 'public/data/vessels-snapshot.json';
mkdirSync(dirname(targetPath), { recursive: true });
writeFileSync(targetPath, JSON.stringify(payload, null, 2), 'utf-8');
console.log(`Generated ${rows.length} vessels in ${targetPath}`);
