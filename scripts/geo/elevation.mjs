// Put-in / take-out elevation and gradient for every river, from the same centerlines and terrain tiles as the topo map.
//   node scripts/geo/elevation.mjs                 every river, print a table
//   node scripts/geo/elevation.mjs rogue smith     some rivers
//   node scripts/geo/elevation.mjs --write         also store stats.elev / stats.gradient / stats.steep in data/rivers/<id>.json
// Elevation is the water surface sampled along the centerline: the lowest pixel within ~30 m, made to fall
// monotonically downstream (a river never rises), which removes canyon-wall pixels. The put-in is the lowest
// sample in its first mile, so a dam or canyon wall at the start can't inflate it; the take-out is the median
// of its last half mile. Elevations are rounded to 50 ft because the tiles (USGS 3DEP) are good to a few
// metres, and gradients on short rivers are approximate.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tile, lon2x, lat2y } from './dem.mjs';
import { decodeLine, atMile } from '../../src/geo/line.js';

const args = process.argv.slice(2);
const write = args.includes('--write');
const ids = args.filter((a) => !a.startsWith('--'));
const all = readdirSync('data/rivers').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
const todo = ids.length ? ids : all;

const Z = 13, FT = 3.28084, STEP = 0.1, WIN = 5;
const cache = new Map();
async function sample(lat, lon) {
  const fx = lon2x(lon, Z) * 256, fy = lat2y(lat, Z) * 256;
  const x0 = Math.floor(fx - 0.5), y0 = Math.floor(fy - 0.5), tx = fx - 0.5 - x0, ty = fy - 0.5 - y0;
  const px = async (x, y) => {
    const k = `${Math.floor(x / 256)}/${Math.floor(y / 256)}`;
    if (!cache.has(k)) cache.set(k, await tile(Z, Math.floor(x / 256), Math.floor(y / 256)));
    return cache.get(k)[(((y % 256) + 256) % 256) * 256 + (((x % 256) + 256) % 256)];
  };
  const a = await px(x0, y0), b = await px(x0 + 1, y0), c = await px(x0, y0 + 1), d = await px(x0 + 1, y0 + 1);
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}
// lowest value within ~30 m of the point
async function low(lat, lon) {
  const dl = 30 / 110540, dn = 30 / (111320 * Math.cos((lat * Math.PI) / 180));
  const v = await Promise.all([[0, 0], [dl, 0], [-dl, 0], [0, dn], [0, -dn]].map(([a, b]) => sample(lat + a, lon + b)));
  return Math.min(...v);
}
const median = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
const r50 = (x) => Math.round(x / 50) * 50;

const rows = [];
for (const id of todo) {
  const river = JSON.parse(readFileSync(`data/rivers/${id}.json`, 'utf8'));
  const L = decodeLine(JSON.parse(readFileSync(`data/geo/${id}.json`, 'utf8')));
  const [m0, m1] = river.miles;
  const ms = [];
  for (let m = m0; m < m1; m += STEP) ms.push(+m.toFixed(3));
  ms.push(m1);
  const raw = [];
  for (const m of ms) {
    const p = atMile(L, m, null);
    raw.push((await low(p.lat, p.lon)) * FT);
  }
  const n = Math.max(1, Math.round(0.5 / STEP));
  const top = Math.min(...raw.slice(0, Math.round(1 / STEP) + 1));
  // a river only falls: clamp to the put-in, then take the running minimum from upstream
  const el = raw.map((v) => Math.min(v, top));
  for (let i = 1; i < el.length; i++) el[i] = Math.min(el[i], el[i - 1]);
  const exactIn = top, exactOut = median(el.slice(-n - 1));
  const elevIn = r50(exactIn), elevOut = r50(exactOut);
  const span = m1 - m0;
  // steepest stretch of WIN miles (or a third of a short river)
  const w = Math.min(WIN, Math.max(1, span / 3));
  const k = Math.max(1, Math.round(w / STEP));
  let best = { g: -1, at: m0 };
  for (let i = 0; i + k < el.length; i++) {
    const g = (el[i] - el[i + k]) / (ms[i + k] - ms[i]);
    if (g > best.g) best = { g, at: ms[i], len: ms[i + k] - ms[i] };
  }
  const grad = (exactIn - exactOut) / span;
  const rec = { elev: [elevIn, elevOut], gradient: +grad.toFixed(grad < 10 ? 1 : 0), steep: { gradient: +best.g.toFixed(best.g < 10 ? 1 : 0), from: +best.at.toFixed(1), miles: +best.len.toFixed(1) } };
  rows.push({ id, span: +span.toFixed(1), ...rec });
  console.log(`${id.padEnd(22)} ${String(span.toFixed(1)).padStart(6)} mi  ${String(elevIn).padStart(5)} -> ${String(elevOut).padStart(5)} ft  ${String(rec.gradient).padStart(5)} ft/mi   steepest ${rec.steep.gradient} ft/mi over ${rec.steep.miles} mi from mile ${rec.steep.from}`);
  if (write) {
    river.stats = { ...(river.stats || {}), ...rec };
    writeFileSync(`data/rivers/${id}.json`, JSON.stringify(river, null, 2) + '\n');
  }
}
