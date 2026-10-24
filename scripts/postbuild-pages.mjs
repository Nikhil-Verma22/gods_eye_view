import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] || 'gods_eye_view';
const nestedCesium = path.join(dist, repoName, 'cesium');
const targetCesium = path.join(dist, 'cesium');

if (fs.existsSync(nestedCesium) && !fs.existsSync(targetCesium)) {
  fs.cpSync(nestedCesium, targetCesium, { recursive: true });
  console.log('Copied Cesium assets to dist/cesium for GitHub Pages root mapping.');
}
