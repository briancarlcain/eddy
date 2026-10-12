// Browser DEM tiles (Terrarium PNG from AWS Terrain Tiles), kept in Cache Storage so the topo map and the
// shade overlay work on the river with no signal. A tile that can't be fetched falls back to the nearest
// cached ancestor, upsampled, so an offline map at any zoom still draws from the lower zooms downloaded.
export const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
export const DEM_MAX = 15;
const CACHE = 'riverguide-dem-v1';

const mem = new Map(); // "z/x/y" -> Promise<Float32Array|null>
const MEM_MAX = 400;

let cachePromise = null;
const openCache = () => (cachePromise ||= typeof caches !== 'undefined' ? caches.open(CACHE).catch(() => null) : Promise.resolve(null));

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

// raw tile from cache or network (no fallback); null when unavailable
async function raw(z, x, y, { network = true } = {}) {
  const url = `${DEM_URL}/${z}/${x}/${y}.png`;
  const cache = await openCache();
  let res = cache && (await cache.match(url).catch(() => null));
  if (!res && network) {
    try {
      res = await fetch(url, { mode: 'cors' });
      if (!res.ok) return null;
      if (cache) cache.put(url, res.clone()).catch(() => {});
    } catch {
      return null;
    }
  }
  if (!res) return null;
  try {
    return await decode(await res.blob());
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

// Offline pack: every tile z8..z13 within `buf` metres of the line (wider at low zoom). -> ["z/x/y"]
export function corridorTiles(ll, { near = 4000, far = 15000 } = {}) {
  const set = new Set();
  for (let z = 8; z <= 13; z++) {
    const r = z >= 12 ? near : far;
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
  const cache = await openCache();
  if (!cache) return 0;
  const have = new Set((await cache.keys()).map((r) => r.url.slice(DEM_URL.length + 1).replace(/\.png$/, '')));
  return keys.filter((k) => have.has(k)).length;
}

export async function download(keys, onProgress, signal) {
  const cache = await openCache();
  if (!cache) throw new Error('This browser has no offline storage');
  const have = new Set((await cache.keys()).map((r) => r.url));
  const todo = keys.map((k) => `${DEM_URL}/${k}.png`).filter((u) => !have.has(u));
  let done = keys.length - todo.length, failed = 0, next = 0;
  onProgress(done, keys.length, failed);
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (next < todo.length && !signal?.aborted) {
        const u = todo[next++];
        try {
          const r = await fetch(u, { mode: 'cors', signal });
          if (r.ok) await cache.put(u, r);
          else failed++;
        } catch {
          failed++;
        }
        onProgress(++done, keys.length, failed);
      }
    })
  );
  return { failed };
}
