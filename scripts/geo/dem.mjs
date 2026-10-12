// Elevation tiles for the geo build: AWS Terrain Tiles (Terrarium PNG, open data, no key).
// US coverage is USGS NED 1/3 arc-second (~10 m). Tiles are cached on disk under .cache/dem.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const SRC = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
const CACHE = '.cache/dem';
export const R_EARTH = 6371008.8;

export const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z;
export const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};
export const x2lon = (x, z) => (x / 2 ** z) * 360 - 180;
export const y2lat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

const mem = new Map();

async function fetchTile(z, x, y) {
  const f = `${CACHE}/${z}/${x}/${y}.png`;
  if (existsSync(f)) return readFileSync(f);
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(`${SRC}/${z}/${x}/${y}.png`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      mkdirSync(`${CACHE}/${z}/${x}`, { recursive: true });
      writeFileSync(f, buf);
      return buf;
    } catch (e) {
      if (i >= 4) throw new Error(`tile ${z}/${x}/${y}: ${e.message}`);
      await new Promise((ok) => setTimeout(ok, 1000 * 2 ** i));
    }
  }
}

// Float32Array(256*256) of metres
export async function tile(z, x, y) {
  const k = `${z}/${x}/${y}`;
  if (mem.has(k)) return mem.get(k);
  const p = PNG.sync.read(await fetchTile(z, x, y));
  const a = new Float32Array(256 * 256);
  for (let i = 0; i < a.length; i++) a[i] = p.data[i * 4] * 256 + p.data[i * 4 + 1] + p.data[i * 4 + 2] / 256 - 32768;
  mem.set(k, a);
  return a;
}

// A mosaic of tiles covering a lat/lon box at zoom z, as one grid with pixel <-> lat/lon helpers.
export async function grid(z, [s, w, n, e], { concurrency = 16 } = {}) {
  const tx0 = Math.floor(lon2x(w, z)), tx1 = Math.floor(lon2x(e, z));
  const ty0 = Math.floor(lat2y(n, z)), ty1 = Math.floor(lat2y(s, z));
  const W = (tx1 - tx0 + 1) * 256, H = (ty1 - ty0 + 1) * 256;
  const data = new Float32Array(W * H);
  const jobs = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) jobs.push([tx, ty]);
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < jobs.length) {
        const [tx, ty] = jobs[next++];
        const t = await tile(z, tx, ty);
        const ox = (tx - tx0) * 256, oy = (ty - ty0) * 256;
        for (let r = 0; r < 256; r++) data.set(t.subarray(r * 256, r * 256 + 256), (oy + r) * W + ox);
      }
    })
  );
  const px = (lat, lon) => [lon2x(lon, z) * 256 - tx0 * 256, lat2y(lat, z) * 256 - ty0 * 256];
  const ll = (gx, gy) => [y2lat((gy + ty0 * 256) / 256, z), x2lon((gx + tx0 * 256) / 256, z)];
  // metres per pixel at this grid's latitude
  const mpp = (lat) => (2 * Math.PI * R_EARTH * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** z);
  const at = (gx, gy) => {
    const x = Math.max(0, Math.min(W - 1.001, gx)), y = Math.max(0, Math.min(H - 1.001, gy));
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * W + x0;
    return (data[i] * (1 - fx) + data[i + 1] * fx) * (1 - fy) + (data[i + W] * (1 - fx) + data[i + W + 1] * fx) * fy;
  };
  return { z, W, H, data, px, ll, mpp, at };
}

export function haversine([la1, lo1], [la2, lo2]) {
  const r = Math.PI / 180;
  const a = Math.sin(((la2 - la1) * r) / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(((lo2 - lo1) * r) / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(a));
}
