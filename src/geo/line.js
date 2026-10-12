// River centerline geometry shared by the app and the geo build (scripts/geo).
// A geo record is { v: 1, pts: [dlat, dlon, ...] (1e-5 deg deltas), marks: [[vertexIndex, mile], ...], offset }.
// Miles between two marks are spread by distance along the line, so a mark's mile is exact and the rest
// is interpolated.

const R = 6371008.8;
const RAD = Math.PI / 180;

export function dist(a, b) {
  const s = Math.sin(((b[0] - a[0]) * RAD) / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(((b[1] - a[1]) * RAD) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function encodeLine(pts, marks, offset) {
  const out = [];
  let la = 0, lo = 0;
  for (const [lat, lon] of pts) {
    const a = Math.round(lat * 1e5), b = Math.round(lon * 1e5);
    out.push(a - la, b - lo);
    la = a; lo = b;
  }
  return { v: 1, pts: out, marks, offset };
}

// -> { ll: [[lat, lon]], mi: [mile per vertex], offset }
export function decodeLine(g) {
  if (!g || !g.pts) return null;
  const ll = [];
  let la = 0, lo = 0;
  for (let i = 0; i < g.pts.length; i += 2) {
    la += g.pts[i]; lo += g.pts[i + 1];
    ll.push([la / 1e5, lo / 1e5]);
  }
  const cum = [0];
  for (let i = 1; i < ll.length; i++) cum.push(cum[i - 1] + dist(ll[i - 1], ll[i]));
  const mi = new Array(ll.length);
  const m = g.marks;
  for (let k = 0; k + 1 < m.length; k++) {
    const [i0, m0] = m[k], [i1, m1] = m[k + 1];
    const span = cum[i1] - cum[i0] || 1;
    for (let i = i0; i <= i1; i++) mi[i] = m0 + ((m1 - m0) * (cum[i] - cum[i0])) / span;
  }
  // beyond the first/last mark: extrapolate at 1 mile per 1609 m
  for (let i = 0; i < m[0][0]; i++) mi[i] = m[0][1] - (cum[m[0][0]] - cum[i]) / 1609.344;
  const [li, lm] = m[m.length - 1];
  for (let i = li + 1; i < ll.length; i++) mi[i] = lm + (cum[i] - cum[li]) / 1609.344;
  return { ll, mi, offset: g.offset ?? 40 };
}

// Position at a river mile. bank 'L' / 'R' pushes the point off the centerline toward that bank (facing
// downstream, river right is to the right). Returns { lat, lon, heading } (heading: downstream, degrees).
export function atMile(L, mile, bank, offset) {
  const { ll, mi } = L;
  let lo = 0, hi = mi.length - 1;
  if (mile <= mi[0]) hi = 1;
  else if (mile >= mi[hi]) lo = hi - 1;
  else {
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (mi[m] <= mile) lo = m;
      else hi = m;
    }
  }
  const a = ll[lo], b = ll[hi];
  const t = Math.max(0, Math.min(1, (mile - mi[lo]) / (mi[hi] - mi[lo] || 1)));
  let lat = a[0] + (b[0] - a[0]) * t, lon = a[1] + (b[1] - a[1]) * t;
  // heading from a wider window so one short kinked segment doesn't swing the bank offset
  const p = ll[Math.max(0, lo - 2)], q = ll[Math.min(ll.length - 1, hi + 2)];
  const k = Math.cos(lat * RAD);
  const dx = (q[1] - p[1]) * k, dy = q[0] - p[0];
  const heading = (Math.atan2(dx, dy) / RAD + 360) % 360;
  const off = bank === 'R' ? 1 : bank === 'L' ? -1 : 0;
  if (off) {
    const d = (offset ?? L.offset) * off;
    const n = Math.hypot(dx, dy) || 1;
    // right-hand normal of (dx, dy) is (dy, -dx)
    lat += ((-dx / n) * d) / 110540;
    lon += ((dy / n) * d) / (111320 * k);
  }
  return { lat, lon, heading };
}

// Nearest point on the line to (lat, lon): { mile, d (metres), side 'L'|'R' }
export function nearest(L, lat, lon) {
  const { ll, mi } = L;
  const k = Math.cos(lat * RAD);
  let best = { d: Infinity };
  for (let i = 0; i + 1 < ll.length; i++) {
    const ax = ll[i][1] * k, ay = ll[i][0], bx = ll[i + 1][1] * k, by = ll[i + 1][0];
    const px = lon * k, py = lat;
    const vx = bx - ax, vy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)));
    const cx = ax + vx * t, cy = ay + vy * t;
    const d = Math.hypot(px - cx, py - cy) * 110900;
    if (d < best.d) best = { d, mile: mi[i] + (mi[i + 1] - mi[i]) * t, side: vx * (py - ay) - vy * (px - ax) > 0 ? 'L' : 'R' };
  }
  return best;
}

export const itemKey = (it) => `${it.name}@${it.mile}`;
