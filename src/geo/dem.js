// Browser DEM tiles (Terrarium PNG from AWS Terrain Tiles), kept in Cache Storage so the topo map and the
// shade overlay work on the river with no signal. A tile that can't be fetched falls back to the nearest
// cached ancestor, upsampled, so an offline map at any zoom still draws from the lower zooms downloaded.
import { tileStore, persist } from './store.js';

export const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
export const DEM_MAX = 15;

const mem = new Map(); // "z/x/y" -> Promise<Float32Array|null>
const MEM_MAX = 400;

// no service, or one bar that never delivers: after a failed request, use saved tiles for a minute
// instead of making every tile wait on the network
let downUntil = 0;
const online = () => Date.now() > downUntil && (typeof navigator === 'undefined' || navigator.onLine !== false);
// a weak signal can hang a request for a minute; give up quickly and fall back to saved tiles
function fetchSoon(url, ms = 6000, signal) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  signal?.addEventListener('abort', () => ctl.abort());
  return fetch(url, { mode: 'cors', signal: ctl.signal }).finally(() => clearTimeout(t));
}

async function decode(blob) {
  const bmp = await createImageBitmap(blob);
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, 256, 256).data;
  const a = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) a[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
  return a;
}

// raw tile from the device store or the network (no fallback); null when unavailable
async function raw(z, x, y, { network = true } = {}) {
  const k = `${z}/${x}/${y}`;
  let blob = await tileStore.get(k).catch(() => null);
  if (!blob && network && online()) {
    try {
      const res = await fetchSoon(`${DEM_URL}/${k}.png`);
      if (!res.ok) return null;
      blob = await res.blob();
    } catch {
      downUntil = Date.now() + 60000;
      return null;
    }
  }
  if (!blob) return null;
  try {
    return await decode(blob);
  } catch {
    return null;
  }
}

function upsample(src, dz, ox, oy) {
  // ox, oy: this tile's index within the ancestor at the ancestor's 2^dz subdivision
  const n = 1 << dz, s = 256 / n, out = new Float32Array(65536);
  for (let y = 0; y < 256; y++) {
    const fy = Math.min(255, oy * s + (y + 0.5) / n - 0.5), y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(255, y0 + 1), ty = Math.max(0, fy - y0);
    for (let x = 0; x < 256; x++) {
      const fx = Math.min(255, ox * s + (x + 0.5) / n - 0.5), x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(255, x0 + 1), tx = Math.max(0, fx - x0);
      out[y * 256 + x] = (src[y0 * 256 + x0] * (1 - tx) + src[y0 * 256 + x1] * tx) * (1 - ty) + (src[y1 * 256 + x0] * (1 - tx) + src[y1 * 256 + x1] * tx) * ty;
    }
  }
  return out;
}

// Float32Array(65536) of metres, or null if neither this tile nor any ancestor is available
export function demTile(z, x, y) {
  const k = `${z}/${x}/${y}`;
  if (mem.has(k)) return mem.get(k);
  const p = (async () => {
    if (z <= DEM_MAX) {
      const t = await raw(z, x, y);
      if (t) return t;
    }
    for (let dz = z > DEM_MAX ? z - DEM_MAX : 1; dz <= Math.min(z, 8); dz++) {
      const pz = z - dz, px = x >> dz, py = y >> dz;
      const t = await raw(pz, px, py, { network: z > DEM_MAX });
      if (t) return upsample(t, dz, x - (px << dz), y - (py << dz));
    }
    return null;
  })();
  mem.set(k, p);
  if (mem.size > MEM_MAX) mem.delete(mem.keys().next().value);
  p.then((v) => v || mem.delete(k));
  return p;
}

// --- tile math
export const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z;
export const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};
export const x2lon = (x, z) => (x / 2 ** z) * 360 - 180;
export const y2lat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
export const mpp = (lat, z) => (40075016.7 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** z);

// Mosaic of tiles covering [s, w, n, e] at zoom z: { W, H, data, bounds: [[s, w], [n, e]], z, tx0, ty0 }
export async function mosaic(z, [s, w, n, e]) {
  const tx0 = Math.floor(lon2x(w, z)), tx1 = Math.floor(lon2x(e, z));
  const ty0 = Math.floor(lat2y(n, z)), ty1 = Math.floor(lat2y(s, z));
  const W = (tx1 - tx0 + 1) * 256, H = (ty1 - ty0 + 1) * 256;
  const data = new Float32Array(W * H);
  const jobs = [];
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++)
      jobs.push(
        demTile(z, tx, ty).then((t) => {
          const ox = (tx - tx0) * 256, oy = (ty - ty0) * 256;
          for (let r = 0; r < 256; r++) {
            if (t) data.set(t.subarray(r * 256, r * 256 + 256), (oy + r) * W + ox);
            else data.fill(NaN, (oy + r) * W + ox, (oy + r) * W + ox + 256);
          }
        })
      );
  await Promise.all(jobs);
  return { z, W, H, data, tx0, ty0, bounds: [[y2lat(ty1 + 1, z), x2lon(tx0, z)], [y2lat(ty0, z), x2lon(tx1 + 1, z)]] };
}

// Sync sampler over preloaded tiles, for the on-device horizon of a moved camp.
export async function sampler(lat, lon, near, far) {
  const zs = [13, 12];
  const tiles = new Map();
  const need = (z, r) => {
    const dl = r / 110540, dn = r / (111320 * Math.cos((lat * Math.PI) / 180));
    const out = [];
    for (let x = Math.floor(lon2x(lon - dn, z)); x <= Math.floor(lon2x(lon + dn, z)); x++)
      for (let y = Math.floor(lat2y(lat + dl, z)); y <= Math.floor(lat2y(lat - dl, z)); y++) out.push([z, x, y]);
    return out;
  };
  const list = [...need(zs[0], near), ...need(zs[1], far)];
  await Promise.all(list.map(async ([z, x, y]) => tiles.set(`${z}/${x}/${y}`, await demTile(z, x, y))));
  const missing = list.filter(([z, x, y]) => !tiles.get(`${z}/${x}/${y}`)).length;
  const elev = (la, lo, isFar) => {
    const z = isFar ? zs[1] : zs[0];
    const fx = lon2x(lo, z) * 256 - 0.5, fy = lat2y(la, z) * 256 - 0.5;
    const at = (px, py) => {
      const t = tiles.get(`${z}/${Math.floor(px / 256)}/${Math.floor(py / 256)}`);
      return t ? t[(py & 255) * 256 + (px & 255)] : 0;
    };
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
  };
  return { elev, missing };
}

// Offline pack: every tile z8..z13 around the line, wide enough to take in both rims and the terrain beyond
// them that throws shadows into the canyon. -> ["z/x/y"]
export const PACK = { 8: 30000, 9: 30000, 10: 30000, 11: 25000, 12: 15000, 13: 10000 };
export function corridorTiles(ll, bufs = PACK) {
  const set = new Set();
  for (const [zs, r] of Object.entries(bufs)) {
    const z = +zs;
    for (let i = 0; i < ll.length; i++) {
      const [lat, lon] = ll[i];
      const dl = r / 110540, dn = r / (111320 * Math.cos((lat * Math.PI) / 180));
      for (let x = Math.floor(lon2x(lon - dn, z)); x <= Math.floor(lon2x(lon + dn, z)); x++)
        for (let y = Math.floor(lat2y(lat + dl, z)); y <= Math.floor(lat2y(lat - dl, z)); y++) set.add(`${z}/${x}/${y}`);
    }
  }
  return [...set];
}

export async function cachedCount(keys) {
  const have = await tileStore.keys().catch(() => new Set());
  return keys.filter((k) => have.has(k)).length;
}

export async function download(keys, onProgress, signal) {
  await persist();
  const have = await tileStore.keys();
  const todo = keys.filter((k) => !have.has(k));
  let done = keys.length - todo.length, next = 0;
  const failed = [];
  onProgress(done, keys.length, 0);
  const one = async (k) => {
    if (tileStore.fetchTo) return tileStore.fetchTo(k, `${DEM_URL}/${k}.png`);
    const r = await fetchSoon(`${DEM_URL}/${k}.png`, 20000, signal);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    await tileStore.put(k, await r.blob());
  };
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (next < todo.length && !signal?.aborted) {
        const k = todo[next++];
        try {
          await one(k);
          onProgress(++done, keys.length, failed.length);
        } catch {
          failed.push(k);
        }
        if (done % 50 === 0) tileStore.flush();
      }
    })
  );
  // a second, one-at-a-time pass for anything that failed (a dropped connection, a busy moment)
  const left = [];
  for (const k of failed) {
    if (signal?.aborted) { left.push(k); continue; }
    try {
      await one(k);
      onProgress(++done, keys.length, left.length);
    } catch {
      left.push(k);
    }
  }
  await tileStore.flush();
  return { failed: left.length };
}

export const removeDownloads = () => tileStore.clear().then(() => mem.clear());
export { tileStore };
