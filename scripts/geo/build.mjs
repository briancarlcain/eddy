// Geo build: centerline + camp horizons for each river in data/geo/anchors.json -> data/geo/<id>.json
//   node scripts/geo/build.mjs                 every river with anchors
//   node scripts/geo/build.mjs grand-canyon    one river
//   --horizons-only                            keep the existing line, recompute horizons
// DEM tiles are cached in .cache/dem (Grand Canyon: ~1,000 tiles, ~120 MB the first time).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { traceRiver } from './trace.mjs';
import { tile, lon2x, lat2y } from './dem.mjs';
import { encodeLine, decodeLine, atMile, itemKey } from '../../src/geo/line.js';
import { horizon, NEAR } from '../../src/geo/horizon.js';
import { encodeHorizon } from '../../src/geo/sun.js';

const args = process.argv.slice(2);
const horizonsOnly = args.includes('--horizons-only');
const ANCH = JSON.parse(readFileSync('data/geo/anchors.json', 'utf8'));
const ids = args.filter((a) => !a.startsWith('--'));
const todo = ids.length ? ids : Object.keys(ANCH);

const ZN = 13, ZF = 12;
const cache = new Map();
async function preload(z, lat, lon, radius) {
  const dl = radius / 110540, dn = radius / (111320 * Math.cos((lat * Math.PI) / 180));
  const x0 = Math.floor(lon2x(lon - dn, z)), x1 = Math.floor(lon2x(lon + dn, z));
  const y0 = Math.floor(lat2y(lat + dl, z)), y1 = Math.floor(lat2y(lat - dl, z));
  const jobs = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (!cache.has(`${z}/${x}/${y}`)) jobs.push([x, y]);
  for (let i = 0; i < jobs.length; i += 16)
    await Promise.all(jobs.slice(i, i + 16).map(async ([x, y]) => cache.set(`${z}/${x}/${y}`, await tile(z, x, y))));
}
function elev(lat, lon, far) {
  const z = far ? ZF : ZN;
  const fx = lon2x(lon, z) * 256, fy = lat2y(lat, z) * 256;
  const sample = (px, py) => {
    const t = cache.get(`${z}/${Math.floor(px / 256)}/${Math.floor(py / 256)}`);
    if (!t) throw new Error(`tile not loaded z${z} at ${lat},${lon}`);
    return t[(Math.floor(py) % 256) * 256 + (Math.floor(px) % 256)];
  };
  const x0 = Math.floor(fx - 0.5), y0 = Math.floor(fy - 0.5), tx = fx - 0.5 - x0, ty = fy - 0.5 - y0;
  return (sample(x0, y0) * (1 - tx) + sample(x0 + 1, y0) * tx) * (1 - ty) + (sample(x0, y0 + 1) * (1 - tx) + sample(x0 + 1, y0 + 1) * tx) * ty;
}

for (const id of todo) {
  const river = JSON.parse(readFileSync(`data/rivers/${id}.json`, 'utf8'));
  const out = `data/geo/${id}.json`;
  const anchors = ANCH[id];
  if (!anchors) throw new Error(`${id}: no anchors in data/geo/anchors.json`);
  let geo;
  if (horizonsOnly && existsSync(out)) geo = JSON.parse(readFileSync(out, 'utf8'));
  else {
    console.log(`${id}: tracing ${anchors.length - 1} segments`);
    const { pts, marks, report } = await traceRiver(anchors);
    console.table(report);
    geo = encodeLine(pts, marks, river.geoOffset || 40);
  }
  const L = decodeLine(geo);
  const camps = river.camps || [];
  const horizons = {};
  const t0 = Date.now();
  for (const [n, c] of camps.entries()) {
    const p = c.ll ? { lat: c.ll[0], lon: c.ll[1] } : atMile(L, c.mile, c.bank);
    await preload(ZN, p.lat, p.lon, NEAR + 300);
    await preload(ZF, p.lat, p.lon, 25500);
    horizons[itemKey(c)] = encodeHorizon(horizon(p.lat, p.lon, elev));
    if (n % 25 === 0) process.stdout.write(`\r${id}: horizons ${n + 1}/${camps.length}`);
  }
  console.log(`\r${id}: horizons ${camps.length}/${camps.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  writeFileSync(out, JSON.stringify({ ...geo, horizons }) + '\n');
  console.log(`${id}: wrote ${out} (${(readFileSync(out).length / 1024).toFixed(0)} KB)`);
}
