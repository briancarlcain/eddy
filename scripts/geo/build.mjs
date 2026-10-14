// Geo build: centerline + camp horizons -> data/geo/<id>.json
//   node scripts/geo/build.mjs                 every river with DEM anchors or an NHD line
//   node scripts/geo/build.mjs grand-canyon    one river
//   --horizons-only                            keep the existing line, recompute horizons
// A river's line is either traced from the terrain between the anchors in data/geo/anchors.json, or (no anchors) read
// from data/geo/nhd/<id>.json, the USGS hydrography main stem calibrated to the guide's miles by
// scripts/basin/centerline.py.
// DEM tiles are cached in .cache/dem (Grand Canyon: ~1,000 tiles, ~120 MB the first time).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { traceRiver } from './trace.mjs';
import { tile, lon2x, lat2y } from './dem.mjs';
import { encodeLine, decodeLine, atMile, itemKey } from '../../src/geo/line.js';
import { horizon, NEAR } from '../../src/geo/horizon.js';
import { encodeHorizon } from '../../src/geo/sun.js';

const args = process.argv.slice(2);
const horizonsOnly = args.includes('--horizons-only');
const ANCH = JSON.parse(readFileSync('data/geo/anchors.json', 'utf8'));
const ids = args.filter((a) => !a.startsWith('--'));
const NHD = existsSync('data/geo/nhd') ? readdirSync('data/geo/nhd').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
const todo = ids.length ? ids : [...new Set([...Object.keys(ANCH), ...NHD])];

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

// Anchor marks plus one mark per surveyed item that sits on the line, kept only where miles still run
// downstream. Between marks, miles are spread by distance, so every surveyed camp sharpens its neighbours.
function calibrate(geo, coords, river) {
  const base = (geo.anchorMarks ||= geo.marks);
  const L = decodeLine({ ...geo, marks: base });
  const byKey = {};
  for (const k of ['camps', 'rapids', 'hikes']) for (const it of river[k] || []) byKey[k.slice(0, -1) + ':' + itemKey(it)] = it;
  const cand = [];
  for (const [k, [lat, lon]] of Object.entries(coords)) {
    const it = byKey[k];
    if (!it) continue;
    let bi = 0, bd = Infinity;
    L.ll.forEach(([a, b], i) => {
      const d = Math.hypot((a - lat) * 110540, (b - lon) * 111320 * Math.cos((lat * Math.PI) / 180));
      if (d < bd) { bd = d; bi = i; }
    });
    if (bd < 250) cand.push([bi, it.mile]);
  }
  const all = [...base.map((m) => [...m, true]), ...cand.map((m) => [...m, false])].sort((a, b) => a[0] - b[0] || (b[2] ? 1 : -1));
  const kept = [];
  for (let i = 0; i < all.length; i++) {
    const [idx, mile, fixed] = all[i];
    const prev = kept[kept.length - 1];
    const nextFixed = all.slice(i + 1).find((m) => m[2]);
    if (fixed || (prev && idx > prev[0] && mile > prev[1] && (!nextFixed || (idx < nextFixed[0] && mile < nextFixed[1])))) kept.push([idx, mile, fixed]);
  }
  const used = kept.length - base.length;
  if (cand.length) console.log(`calibration: ${used} of ${cand.length} surveyed points used as mile marks`);
  return kept.map(([i, m]) => [i, m]);
}

for (const id of todo) {
  const river = JSON.parse(readFileSync(`data/rivers/${id}.json`, 'utf8'));
  const out = `data/geo/${id}.json`;
  const anchors = ANCH[id];
  const nhdFile = `data/geo/nhd/${id}.json`;
  if (!anchors && !existsSync(nhdFile)) throw new Error(`${id}: no anchors in data/geo/anchors.json and no ${nhdFile}`);
  let geo;
  if (horizonsOnly && existsSync(out)) geo = JSON.parse(readFileSync(out, 'utf8'));
  else if (!anchors) {
    const { v, pts, marks, offset } = JSON.parse(readFileSync(nhdFile, 'utf8'));
    console.log(`${id}: centerline from ${nhdFile} (${pts.length / 2} points, ${marks.length} mile marks)`);
    geo = { v, pts, marks, offset: river.geoOffset || offset || 40 };
  } else {
    console.log(`${id}: tracing ${anchors.length - 1} segments`);
    const { pts, marks, report } = await traceRiver(anchors);
    console.table(report);
    geo = encodeLine(pts, marks, river.geoOffset || 40);
  }
  // surveyed positions (scripts/geo/import-coords.mjs): ship them, and let each one pin its river mile to the line
  const coordsFile = `data/geo/coords/${id}.json`;
  const coords = existsSync(coordsFile) ? JSON.parse(readFileSync(coordsFile, 'utf8')) : {};
  geo.ll = Object.fromEntries(Object.entries(coords).map(([k, v]) => [k, [v[0], v[1]]]));
  geo.marks = calibrate(geo, coords, river);
  const L = decodeLine(geo);
  const camps = (river.camps || []).map((c) => (geo.ll['camp:' + itemKey(c)] ? { ...c, ll: geo.ll['camp:' + itemKey(c)] } : c));
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
