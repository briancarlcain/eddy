// Geo math: centerline encoding, mile placement, solar position, horizon casting, terrain sun times.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodeLine, decodeLine, atMile, nearest, dist, itemKey } from '../src/geo/line.js';
import { sunPos, sunDay, encodeHorizon, decodeHorizon, horizonAt } from '../src/geo/sun.js';
import { horizon } from '../src/geo/horizon.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);
const hm = (d, tz) => d.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' });

// --- line: a straight river flowing due east, 2 miles long, mark at each end
{
  const lat = 36;
  const k = 1609.344 / (111320 * Math.cos((lat * Math.PI) / 180));
  const pts = Array.from({ length: 21 }, (_, i) => [lat, -112 + (i / 10) * k]);
  const L = decodeLine(encodeLine(pts, [[0, 10], [20, 12]], 40));
  near(L.mi[10], 11, 0.01, 'midpoint mile');
  const c = atMile(L, 11, null);
  near(c.lon, pts[10][1], 1e-5, 'centre lon');
  near(c.heading, 90, 1, 'heading east');
  // flowing east, river right is south and river left is north
  const r = atMile(L, 11, 'R'), l = atMile(L, 11, 'L');
  assert.ok(r.lat < lat && l.lat > lat, 'banks on the correct sides');
  near(dist([r.lat, r.lon], [c.lat, c.lon]), 40, 1, 'bank offset metres');
  const n = nearest(L, r.lat, r.lon);
  near(n.mile, 11, 0.01, 'nearest mile');
  assert.equal(n.side, 'R');
  assert.equal(itemKey({ name: 'X', mile: 1.5 }), 'X@1.5');
}

// --- sun position: equinox noon at the equator is nearly overhead; Flagstaff solstice times
{
  const p = sunPos(new Date('2026-03-20T12:07:00Z'), 0, 0);
  near(p.alt, 90, 1.5, 'equinox noon altitude');
  const f = sunDay('2026-06-21', 35.198, -111.651, 'America/Phoenix', null, 1);
  near(+hm(f.rise, 'America/Phoenix').replace(':', '.'), 5.12, 0.04, 'Flagstaff sunrise ~05:10-05:15');
  near(+hm(f.set, 'America/Phoenix').replace(':', '.'), 19.47, 0.04, 'Flagstaff sunset ~19:45-19:50');
  // the afternoon sun is in the west
  const pm = sunPos(new Date('2026-06-21T01:00:00Z'), 35.198, -111.651);
  assert.ok(pm.az > 270 && pm.az < 310, 'evening azimuth west-north-west: ' + pm.az);
}

// --- horizon round trip and interpolation
{
  const a = Array.from({ length: 180 }, (_, i) => (i % 7) * 3.25);
  const h = decodeHorizon(encodeHorizon(a));
  assert.equal(h.length, 180);
  near(h[5], a[5], 0.13, 'quantised angle');
  near(horizonAt(h, 3), (h[1] + h[2]) / 2, 1e-6, 'interpolated between samples');
}

// --- horizon casting against a synthetic wall: 500 m high, 1000 m west of the observer
{
  const lat = 36, lon = -112;
  const k = 111320 * Math.cos((lat * Math.PI) / 180);
  const elev = (la, lo) => ((lo - lon) * k < -1000 ? 500 : 0);
  const h = horizon(lat, lon, elev, { eye: 0 });
  near(h[135], (Math.atan(500 / 1000) * 180) / Math.PI, 0.6, 'west wall angle'); // 270 deg
  near(h[45], 0, 0.01, 'open to the east');
  // that wall puts a September evening in shade well before the flat-horizon sunset
  const d = sunDay('2026-09-15', lat, lon, 'America/Phoenix', decodeHorizon(encodeHorizon(h)));
  assert.ok(d.off < d.set, 'sun leaves camp before sky sunset');
  assert.ok((d.set - d.off) / 60000 > 90, 'a 26 deg wall costs over 90 minutes of evening sun');
  near(d.on.getTime(), d.rise.getTime(), 3 * 60000, 'morning unaffected with open east');
}

// --- shipped Grand Canyon data: the line spans the river's miles and every camp has a horizon
{
  const geo = JSON.parse(readFileSync('data/geo/grand-canyon.json', 'utf8'));
  const river = JSON.parse(readFileSync('data/rivers/grand-canyon.json', 'utf8'));
  const L = decodeLine(geo);
  near(L.mi[0], river.miles[0], 0.01, 'line starts at the first mile');
  near(L.mi[L.mi.length - 1], river.miles[1], 0.01, 'line ends at the last mile');
  for (let i = 1; i < L.mi.length; i++) assert.ok(L.mi[i] >= L.mi[i - 1], 'miles increase downstream');
  const missing = river.camps.filter((c) => !geo.horizons[itemKey(c)]);
  assert.deepEqual(missing.map(itemKey), [], 'every camp has a horizon');
  // Lees Ferry put-in is where it should be
  const p = atMile(L, 0, null);
  assert.ok(dist([p.lat, p.lon], [36.8653, -111.5873]) < 300, 'mile 0 at Lees Ferry');
}

console.log('geo tests passed');
