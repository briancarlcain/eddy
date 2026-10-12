// Terrain horizon around a point: cast rays over a DEM and keep the highest elevation angle per azimuth.
// elev(lat, lon, far) returns metres (synchronously); `far` says the sample is > NEAR m out, so the caller may
// read a coarser zoom.
const RAD = Math.PI / 180;
const R = 6371008.8;
const K = 0.13; // refraction coefficient: light bends over the curve, lifting distant terrain a little
export const NEAR = 3000;

export function horizon(lat, lon, elev, { n = 180, maxD = 25000, eye = 2, floorR = 45 } = {}) {
  const k = Math.cos(lat * RAD);
  const off = (d, az) => [lat + (d * Math.cos(az)) / 110540, lon + (d * Math.sin(az)) / (111320 * k)];
  // stand on the valley floor: the lowest ground within floorR, so a pin a few metres up a slope still sees
  // what someone in camp sees
  let z0 = elev(lat, lon, false);
  for (let a = 0; a < 360; a += 45)
    for (const d of [floorR / 2, floorR]) z0 = Math.min(z0, elev(...off(d, a * RAD), false));
  z0 += eye;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const az = ((i * 360) / n) * RAD;
    let best = 0;
    for (let d = 30; d <= maxD; d += Math.max(10, d * 0.015)) {
      const [la, lo] = off(d, az);
      const z = elev(la, lo, d > NEAR) - (d * d * (1 - K)) / (2 * R);
      const a = Math.atan2(z - z0, d) / RAD;
      if (a > best) best = a;
    }
    out[i] = best;
  }
  return out;
}
