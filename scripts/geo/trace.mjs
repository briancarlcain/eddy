// Trace a river centerline from elevation alone: between consecutive anchors (known river mile + rough lat/lon),
// find the least-cost path where cost grows exponentially with height above the local river level, so the path
// keeps to the canyon floor. Then calibrate miles along the traced line piecewise between anchors.
import { grid, haversine } from './dem.mjs';

class Heap {
  constructor() { this.k = new Float64Array(1 << 16); this.v = new Int32Array(1 << 16); this.n = 0; }
  push(key, val) {
    if (this.n === this.k.length) {
      const k = new Float64Array(this.n * 2); k.set(this.k); this.k = k;
      const v = new Int32Array(this.n * 2); v.set(this.v); this.v = v;
    }
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= key) break;
      this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p;
    }
    this.k[i] = key; this.v[i] = val;
  }
  pop() {
    const top = this.v[0], key = this.k[--this.n], val = this.v[this.n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.n) break;
      if (c + 1 < this.n && this.k[c + 1] < this.k[c]) c++;
      if (this.k[c] >= key) break;
      this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c;
    }
    this.k[i] = key; this.v[i] = val;
    return top;
  }
}

// lowest cell within r pixels of (gx, gy)
function snapLow(g, gx, gy, r) {
  let best = [Math.round(gx), Math.round(gy)], bz = Infinity;
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = Math.round(gx) + dx, y = Math.round(gy) + dy;
      if (x < 0 || y < 0 || x >= g.W || y >= g.H) continue;
      const z = g.data[y * g.W + x];
      if (z < bz) { bz = z; best = [x, y]; }
    }
  return best;
}

// least-cost path between two anchors; returns [[lat, lon, elev], ...]
async function segment(a, b, { z = 13, margin = 0.16, snapM = 250, T = 12 } = {}) {
  const box = [
    Math.min(a.lat, b.lat) - margin, Math.min(a.lon, b.lon) - margin,
    Math.max(a.lat, b.lat) + margin, Math.max(a.lon, b.lon) + margin,
  ];
  const g = await grid(z, box);
  const mpp = g.mpp((a.lat + b.lat) / 2);
  const r = Math.round(snapM / mpp);
  const [ax, ay] = snapLow(g, ...g.px(a.lat, a.lon), r);
  const [bx, by] = snapLow(g, ...g.px(b.lat, b.lon), r);
  const za = g.data[ay * g.W + ax], zb = g.data[by * g.W + bx];
  const zlo = Math.min(za, zb);
  const N = g.W * g.H;
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const h = new Heap();
  const s = ay * g.W + ax, t = by * g.W + bx;
  dist[s] = 0; h.push(0, s);
  const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  const cost = (i) => Math.exp(Math.min(30, Math.max(0, g.data[i] - zlo) / T));
  while (h.n) {
    const i = h.pop();
    if (i === t) break;
    const x = i % g.W, y = (i / g.W) | 0, di = dist[i], ci = cost(i);
    for (const [dx, dy, len] of D) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= g.W || ny >= g.H) continue;
      const j = ny * g.W + nx;
      const nd = di + len * (ci + cost(j)) * 0.5;
      if (nd < dist[j]) { dist[j] = nd; prev[j] = i; h.push(nd, j); }
    }
  }
  if (prev[t] < 0) throw new Error(`no path ${a.name} -> ${b.name}`);
  const path = [];
  for (let i = t; i >= 0; i = prev[i]) path.push(i);
  path.reverse();
  return {
    pts: path.map((i) => [...g.ll(i % g.W + 0.5, ((i / g.W) | 0) + 0.5), g.data[i]]),
    za, zb,
  };
}

// moving-average smoothing (keeps endpoints): removes the pixel staircase
function smooth(pts, w) {
  return pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1) return p;
    let la = 0, lo = 0, n = 0;
    for (let k = Math.max(0, i - w); k <= Math.min(pts.length - 1, i + w); k++) { la += pts[k][0]; lo += pts[k][1]; n++; }
    return [la / n, lo / n, p[2]];
  });
}

// Douglas-Peucker in metres (local equirectangular)
function simplify(pts, tol) {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const k = Math.cos((pts[0][0] * Math.PI) / 180);
  const P = pts.map(([la, lo]) => [lo * 111320 * k, la * 110540]);
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [i, j] = st.pop();
    let md = 0, mi = -1;
    const [x1, y1] = P[i], [x2, y2] = P[j], L = Math.hypot(x2 - x1, y2 - y1) || 1;
    for (let m = i + 1; m < j; m++) {
      const d = Math.abs((x2 - x1) * (y1 - P[m][1]) - (x1 - P[m][0]) * (y2 - y1)) / L;
      if (d > md) { md = d; mi = m; }
    }
    if (md > tol) { keep[mi] = 1; st.push([i, mi], [mi, j]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// anchors: [{mile, lat, lon, name}] in river order. Returns {pts: [[lat, lon, mile, elev]], marks: [[vertex, mile]], report}
export async function traceRiver(anchors, opts = {}) {
  const out = [];
  const marks = [[0, anchors[0].mile]];
  const report = [];
  for (let k = 0; k + 1 < anchors.length; k++) {
    const a = anchors[k], b = anchors[k + 1];
    const t0 = Date.now();
    let { pts, za, zb } = await segment(a, b, opts);
    pts = simplify(smooth(pts, 3), opts.tol ?? 8);
    let len = 0;
    const cum = pts.map((p, i) => (i ? (len += haversine(pts[i - 1], p)) : 0));
    const span = b.mile - a.mile;
    const seg = pts.map((p, i) => [+p[0].toFixed(6), +p[1].toFixed(6), +(a.mile + (span * cum[i]) / len).toFixed(3), Math.round(p[2])]);
    out.push(...(k ? seg.slice(1) : seg));
    marks.push([out.length - 1, b.mile]);
    // the river only runs downhill: a path that climbs well above its upstream end has left the canyon floor
    const climb = Math.round(Math.max(...seg.map((p) => p[3])) - Math.max(za, zb));
    report.push({ from: a.name, to: b.name, miles: span, traced: +(len / 1609.344).toFixed(2), scale: +(span / (len / 1609.344)).toFixed(3), za: Math.round(za), zb: Math.round(zb), climb, sec: (Date.now() - t0) / 1000 });
    if (climb > 40) console.warn(`WARNING ${a.name} -> ${b.name}: path climbs ${climb} m above the river; add an anchor between them`);
  }
  return { pts: out, marks, report };
}
