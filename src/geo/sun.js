// Solar position (NOAA) and terrain-aware sun times from a horizon profile.
const RAD = Math.PI / 180;

// apparent altitude and azimuth (degrees, azimuth clockwise from north) of the sun's centre at a Date
export function sunPos(date, lat, lon) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const L0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const M = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const C = Math.sin(M * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * t) + Math.sin(3 * M * RAD) * 0.000289;
  const om = 125.04 - 1934.136 * t;
  const lam = L0 + C - 0.00569 - 0.00478 * Math.sin(om * RAD);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(om * RAD);
  const dec = Math.asin(Math.sin(eps * RAD) * Math.sin(lam * RAD));
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eq =
    (4 / RAD) *
    (y * Math.sin(2 * L0 * RAD) - 2 * e * Math.sin(M * RAD) + 4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) -
      0.5 * y * y * Math.sin(4 * L0 * RAD) - 1.25 * e * e * Math.sin(2 * M * RAD));
  const utcMin = ((date.getTime() % 86400000) + 86400000) % 86400000 / 60000;
  const tst = (utcMin + eq + 4 * lon + 1440) % 1440;
  const ha = (tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180) * RAD;
  const la = lat * RAD;
  const cz = Math.max(-1, Math.min(1, Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha)));
  const zen = Math.acos(cz);
  let az = Math.acos(Math.max(-1, Math.min(1, (Math.sin(la) * cz - Math.sin(dec)) / (Math.cos(la) * Math.sin(zen) || 1e-9)))) / RAD;
  az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
  let alt = 90 - zen / RAD;
  // atmospheric refraction (Saemundsson), so a low sun reads where the eye sees it
  if (alt > -1.5) alt += 1.02 / Math.tan((alt + 10.3 / (alt + 5.11)) * RAD) / 60;
  return { alt, az };
}

// horizon profile: base64 of N bytes, byte i = max terrain elevation angle (0.25 deg units) at azimuth i*360/N
export function decodeHorizon(b64) {
  const s = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const a = new Float32Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) / 4;
  return a;
}
export function encodeHorizon(angles) {
  const s = String.fromCharCode(...angles.map((d) => Math.max(0, Math.min(255, Math.round(d * 4)))));
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
}
export function horizonAt(h, az) {
  const n = h.length, f = (((az % 360) + 360) % 360) * (n / 360);
  const i = Math.floor(f) % n, j = (i + 1) % n, t = f - Math.floor(f);
  return h[i] * (1 - t) + h[j] * t;
}

// midnight UTC of the local calendar day `iso` (YYYY-MM-DD) in IANA zone tz, as epoch ms
export function localMidnight(iso, tz) {
  const [Y, Mo, D] = iso.split('-').map(Number);
  let guess = Date.UTC(Y, Mo - 1, D);
  for (let k = 0; k < 2; k++) {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        .formatToParts(new Date(guess))
        .map((x) => [x.type, x.value])
    );
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
    guess -= shown - Date.UTC(Y, Mo - 1, D);
  }
  return guess;
}

// Sun times for one local day. h: decoded horizon (or null for a flat horizon).
// -> { rise, set: flat-horizon (sky) times; on, off: first/last direct sun past the terrain; hours: direct sun;
//      spans: [[start, end], ...] when the sun dips behind and re-emerges } (Dates; null when it never happens)
export function sunDay(iso, lat, lon, tz, h, stepMin = 2) {
  const t0 = localMidnight(iso, tz);
  let rise = null, set = null, on = null, off = null, prevSky = false, prevLit = false, lit = 0;
  const spans = [];
  for (let m = 0; m <= 1440; m += stepMin) {
    const d = new Date(t0 + m * 60000);
    const { alt, az } = sunPos(d, lat, lon);
    // alt is apparent (refracted), so the upper limb clears a line when the centre is within a semi-diameter
    const sky = alt > -0.27;
    const litNow = sky && (!h || alt > horizonAt(h, az) - 0.27);
    if (sky && !prevSky) rise = d;
    if (!sky && prevSky) set = d;
    if (litNow && !prevLit) { if (!on) on = d; spans.push([d, null]); }
    if (!litNow && prevLit) { off = d; spans[spans.length - 1][1] = d; }
    if (litNow) lit += stepMin;
    prevSky = sky; prevLit = litNow;
  }
  return { rise, set, on, off, hours: lit / 60, spans };
}
