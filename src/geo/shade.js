// Sun / shade raster for a DEM mosaic: a cell is in shade when it faces away from the sun or terrain toward
// the sun rises above the sun's ray. Runs in a Web Worker (built from this function's source).
function shadeWorker() {
  self.onmessage = (e) => {
    const { id, W, H, data, alt, az, lat0, lat1, z } = e.data;
    const out = new Uint8ClampedArray(W * H * 4);
    const RAD = Math.PI / 180;
    // metres per pixel by row (Web Mercator: shrinks toward the pole)
    const mppRow = new Float32Array(H);
    for (let y = 0; y < H; y++) {
      const lat = lat0 + ((lat1 - lat0) * y) / H; // close enough over a few tiles
      mppRow[y] = (40075016.7 * Math.cos(lat * RAD)) / (256 * 2 ** z);
    }
    let zmax = -Infinity;
    for (let i = 0; i < data.length; i++) if (data[i] > zmax) zmax = data[i];
    const dark = [26, 34, 70, 120];
    const lit = [255, 214, 130, 26];
    if (alt <= 0) {
      for (let i = 0; i < W * H; i++) if (data[i] === data[i]) out.set(dark, i * 4);
      self.postMessage({ id, out }, [out.buffer]);
      return;
    }
    const ta = Math.tan(alt * RAD);
    const sx = Math.sin(az * RAD), sy = -Math.cos(az * RAD); // pixel step toward the sun (y grows south)
    const se = Math.cos(alt * RAD) * Math.sin(az * RAD), sn = Math.cos(alt * RAD) * Math.cos(az * RAD), su = Math.sin(alt * RAD);
    for (let y = 1; y < H - 1; y++) {
      const m = mppRow[y];
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x, z0 = data[i];
        if (z0 !== z0) continue;
        // self-shading: surface normal against the sun vector
        const dzdx = (data[i + 1] - data[i - 1]) / (2 * m), dzdn = (data[i - W] - data[i + W]) / (2 * m);
        let shade = -dzdx * se - dzdn * sn + su <= 0;
        if (!shade) {
          for (let t = 1.5; ; t += t < 8 ? 1 : t * 0.06) {
            const h = z0 + t * m * ta;
            if (h > zmax) break;
            const px = x + sx * t, py = y + sy * t;
            if (px < 0 || py < 0 || px >= W - 1 || py >= H - 1) break;
            const j = (py | 0) * W + (px | 0);
            if (data[j] > h) { shade = true; break; }
          }
        }
        out.set(shade ? dark : lit, i * 4);
      }
    }
    self.postMessage({ id, out }, [out.buffer]);
  };
}

let worker = null, seq = 0;
const pending = new Map();
function getWorker() {
  if (worker) return worker;
  const url = URL.createObjectURL(new Blob([`(${shadeWorker.toString()})()`], { type: 'text/javascript' }));
  worker = new Worker(url);
  worker.onmessage = (e) => {
    const p = pending.get(e.data.id);
    pending.delete(e.data.id);
    p && p(e.data.out);
  };
  return worker;
}

// m: mosaic from dem.js. Resolves to a canvas the size of the mosaic.
export function shadeCanvas(m, alt, az) {
  const id = ++seq;
  const data = m.data.slice();
  return new Promise((ok) => {
    pending.set(id, (out) => {
      const c = document.createElement('canvas');
      c.width = m.W; c.height = m.H;
      c.getContext('2d').putImageData(new ImageData(out, m.W, m.H), 0, 0);
      ok(c);
    });
    getWorker().postMessage({ id, W: m.W, H: m.H, data, alt, az, lat0: m.bounds[1][0], lat1: m.bounds[0][0], z: m.z }, [data.buffer]);
  });
}
