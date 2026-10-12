// Sun / shade for a DEM mosaic. A cell is in shade when it faces away from the sun, or when terrain between it
// and the sun rises above the sun's ray. Work runs in a small pool of Web Workers (built from this function's
// source) and each frame comes back as one bit per cell, so a whole day of frames fits in a phone's memory.
function shadeWorker() {
  const grids = new Map();
  self.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'grid') {
      const { W, H, data, lat0, lat1, z } = m;
      const RAD = Math.PI / 180;
      const mpp = new Float32Array(H);
      for (let y = 0; y < H; y++) mpp[y] = (40075016.7 * Math.cos((lat0 + ((lat1 - lat0) * y) / H) * RAD)) / (256 * 2 ** z);
      let zmax = -Infinity;
      for (let i = 0; i < data.length; i++) if (data[i] > zmax) zmax = data[i];
      grids.clear(); // one view at a time
      grids.set(m.gid, { W, H, data, mpp, zmax });
      return;
    }
    if (m.type !== 'shade') return;
    const g = grids.get(m.gid);
    if (!g) return self.postMessage({ id: m.id, bits: null });
    const { W, H, data, mpp, zmax } = g;
    const bits = new Uint8Array(Math.ceil((W * H) / 8));
    const RAD = Math.PI / 180, alt = m.alt, az = m.az;
    if (alt <= 0) {
      bits.fill(255);
      return self.postMessage({ id: m.id, bits }, [bits.buffer]);
    }
    const ta = Math.tan(alt * RAD);
    const sx = Math.sin(az * RAD), sy = -Math.cos(az * RAD); // one pixel toward the sun (y grows south)
    const se = Math.cos(alt * RAD) * sx, sn = Math.cos(alt * RAD) * Math.cos(az * RAD), su = Math.sin(alt * RAD);
    for (let y = 1; y < H - 1; y++) {
      const mm = mpp[y];
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x, z0 = data[i];
        if (z0 !== z0) continue;
        const dzdx = (data[i + 1] - data[i - 1]) / (2 * mm), dzdn = (data[i - W] - data[i + W]) / (2 * mm);
        let shade = -dzdx * se - dzdn * sn + su <= 0;
        if (!shade) {
          const rise = mm * ta;
          for (let t = 1.5; ; t += t < 8 ? 1 : t * 0.06) {
            const hgt = z0 + t * rise;
            if (hgt > zmax) break;
            const px = x + sx * t, py = y + sy * t;
            if (px < 0 || py < 0 || px >= W - 1 || py >= H - 1) break;
            if (data[(py | 0) * W + (px | 0)] > hgt) { shade = true; break; }
          }
        }
        if (shade) bits[i >> 3] |= 1 << (i & 7);
      }
    }
    self.postMessage({ id: m.id, bits }, [bits.buffer]);
  };
}

let pool = null;
let seq = 0, gseq = 0;
const pending = new Map();
const queue = [];
function getPool() {
  if (pool) return pool;
  const url = URL.createObjectURL(new Blob([`(${shadeWorker.toString()})()`], { type: 'text/javascript' }));
  const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  pool = Array.from({ length: n }, () => {
    const w = new Worker(url);
    w.busy = false;
    w.onmessage = (e) => {
      w.busy = false;
      const p = pending.get(e.data.id);
      pending.delete(e.data.id);
      p && p(e.data.bits);
      pump();
    };
    return w;
  });
  return pool;
}
function pump() {
  for (const w of getPool()) {
    if (w.busy || !queue.length) continue;
    const job = queue.shift();
    w.busy = true;
    w.postMessage(job);
  }
}

// Load a mosaic into every worker; returns a grid handle for shade().
export function setGrid(m) {
  const gid = ++gseq;
  for (const w of getPool()) w.postMessage({ type: 'grid', gid, W: m.W, H: m.H, data: m.data.slice(), lat0: m.bounds[1][0], lat1: m.bounds[0][0], z: m.z });
  // anything still queued was for the previous view (jobs already running finish and are ignored by the caller)
  for (const j of queue.splice(0)) {
    const p = pending.get(j.id);
    pending.delete(j.id);
    p && p(null);
  }
  return gid;
}

// -> Promise<Uint8Array bits | null>; urgent jobs go to the front of the queue
export function shade(gid, alt, az, urgent = false) {
  const id = ++seq;
  return new Promise((ok) => {
    pending.set(id, ok);
    const job = { type: 'shade', id, gid, alt, az };
    if (urgent) queue.unshift(job);
    else queue.push(job);
    pump();
  });
}

export const SHADE_RGBA = [26, 34, 70, 120];
export const SUN_RGBA = [255, 214, 130, 26];
// paint bits into a canvas the mosaic's size
export function paint(canvas, W, H, bits, data) {
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const g = canvas.getContext('2d');
  const img = g.createImageData(W, H);
  const d = new Uint32Array(img.data.buffer);
  const pack = ([r, gg, b, a]) => (a << 24) | (b << 16) | (gg << 8) | r; // little-endian RGBA
  const dark = pack(SHADE_RGBA), lit = pack(SUN_RGBA);
  for (let i = 0; i < W * H; i++) d[i] = data[i] !== data[i] ? 0 : bits[i >> 3] & (1 << (i & 7)) ? dark : lit;
  g.putImageData(img, 0, 0);
}
