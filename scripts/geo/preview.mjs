// Debug render: hillshade + traced centerline + placed camps/rapids for a box, to check placement by eye.
//   node scripts/geo/preview.mjs grand-canyon <mileFrom> <mileTo> out.png [zoom]
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { grid } from './dem.mjs';
import { decodeLine, atMile } from '../../src/geo/line.js';

const [id, m0, m1, outFile, zArg] = process.argv.slice(2);
const river = JSON.parse(readFileSync(`data/rivers/${id}.json`, 'utf8'));
const L = decodeLine(JSON.parse(readFileSync(`data/geo/${id}.json`, 'utf8')));
const a = +m0, b = +m1, z = +(zArg || 14);
const seg = L.ll.filter((_, i) => L.mi[i] >= a && L.mi[i] <= b);
const pad = 0.012;
const box = [Math.min(...seg.map((p) => p[0])) - pad, Math.min(...seg.map((p) => p[1])) - pad, Math.max(...seg.map((p) => p[0])) + pad, Math.max(...seg.map((p) => p[1])) + pad];
const g = await grid(z, box);
const png = new PNG({ width: g.W, height: g.H });
const mpp = g.mpp((box[0] + box[2]) / 2);
for (let y = 1; y < g.H - 1; y++)
  for (let x = 1; x < g.W - 1; x++) {
    const i = y * g.W + x, d = g.data;
    const dzdx = (d[i + 1] - d[i - 1]) / (2 * mpp), dzdy = (d[i + g.W] - d[i - g.W]) / (2 * mpp);
    const s = Math.max(0, (-dzdx * -0.5 + dzdy * -0.5 + 1) / Math.sqrt(1 + dzdx * dzdx + dzdy * dzdy) / Math.SQRT2 * 1.2);
    const v = Math.min(255, 40 + s * 200);
    png.data.set([v, v * 0.95, v * 0.88, 255], i * 4);
  }
const dot = (lat, lon, r, c) => {
  const [px, py] = g.px(lat, lon);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r) continue;
    const x = Math.round(px) + dx, y = Math.round(py) + dy;
    if (x >= 0 && y >= 0 && x < g.W && y < g.H) png.data.set(c, (y * g.W + x) * 4);
  }
};
for (let i = 0; i + 1 < L.ll.length; i++) for (let t = 0; t < 1; t += 0.1) dot(L.ll[i][0] + (L.ll[i + 1][0] - L.ll[i][0]) * t, L.ll[i][1] + (L.ll[i + 1][1] - L.ll[i][1]) * t, 1, [40, 110, 200, 255]);
for (const r of river.rapids) if (r.mile >= a && r.mile <= b) { const p = atMile(L, r.mile); dot(p.lat, p.lon, 4, [30, 60, 160, 255]); }
for (const c of river.camps) if (c.mile >= a && c.mile <= b) { const p = atMile(L, c.mile, c.bank); dot(p.lat, p.lon, 4, c.bank === 'R' ? [20, 150, 40, 255] : [220, 120, 0, 255]); }
writeFileSync(outFile, PNG.sync.write(png));
console.log(outFile, g.W, 'x', g.H);
