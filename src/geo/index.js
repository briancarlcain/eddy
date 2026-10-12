// App-side geo state for the active river: centerline, item positions, camp horizons and sun times,
// plus on-device corrections (moved pins, recomputed horizons, GPX tracks) kept in localStorage.
import grandCanyon from '../../data/geo/grand-canyon.json';
import { decodeLine, atMile, itemKey } from './line.js';
import { decodeHorizon, sunDay } from './sun.js';

export const GEO = { 'grand-canyon': grandCanyon };

const KEY = 'riverguide.geo.v1';
let store = {};
try {
  store = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
} catch {
  store = {};
}
const listeners = new Set();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* full or blocked: corrections live for this session only */
  }
  listeners.forEach((f) => f());
}
export const onGeoChange = (f) => (listeners.add(f), () => listeners.delete(f));

const local = (rid) => (store[rid] ||= { pins: {}, horizons: {}, tracks: {} });

const lines = new Map();
export function riverLine(rid) {
  if (!lines.has(rid)) lines.set(rid, decodeLine(GEO[rid]));
  return lines.get(rid);
}
export const hasGeo = (rid) => !!GEO[rid];

// kind: 'camp' | 'hike' | 'rapid' | 'landmark' | 'access'. Returns { lat, lon, moved } or null.
export function position(rid, kind, it) {
  const pin = store[rid]?.pins[kind + ':' + itemKey(it)];
  if (pin) return { lat: pin[0], lon: pin[1], moved: true };
  if (it.ll) return { lat: it.ll[0], lon: it.ll[1], moved: false };
  const L = riverLine(rid);
  if (!L || it.mile == null) return null;
  const onBank = kind === 'camp' || kind === 'hike';
  return { ...atMile(L, it.mile, onBank ? it.bank : null), moved: false };
}

export function movePin(rid, kind, it, lat, lon, horizonB64) {
  const s = local(rid);
  s.pins[kind + ':' + itemKey(it)] = [+lat.toFixed(6), +lon.toFixed(6)];
  if (kind === 'camp') {
    if (horizonB64) s.horizons[itemKey(it)] = horizonB64;
    else delete s.horizons[itemKey(it)];
  }
  hcache.delete(rid + '|' + itemKey(it));
  save();
}
export function resetPin(rid, kind, it) {
  const s = local(rid);
  delete s.pins[kind + ':' + itemKey(it)];
  if (kind === 'camp') delete s.horizons[itemKey(it)];
  hcache.delete(rid + '|' + itemKey(it));
  save();
}

// a moved camp without a recomputed horizon falls back to the shipped one (walls are far; close enough)
const hcache = new Map();
export function campHorizon(rid, c) {
  const k = rid + '|' + itemKey(c);
  if (!hcache.has(k)) {
    const b64 = store[rid]?.horizons[itemKey(c)] || GEO[rid]?.horizons?.[itemKey(c)];
    hcache.set(k, b64 ? decodeHorizon(b64) : null);
  }
  return hcache.get(k);
}

// Sun for a camp on a local date: evening uses iso, and `next` (the following morning) gives first sun.
const scache = new Map();
export function campSun(rid, c, iso, tz) {
  const k = `${rid}|${itemKey(c)}|${iso}|${tz}`;
  if (scache.has(k)) return scache.get(k);
  const p = position(rid, 'camp', c);
  const h = campHorizon(rid, c);
  const out = p && h ? { ...sunDay(iso, p.lat, p.lon, tz, h), terrain: true } : null;
  if (scache.size > 4000) scache.clear();
  scache.set(k, out);
  return out;
}
onGeoChange(() => scache.clear());

// GPX tracks attached to hikes on this device: [[lat, lon, ele?], ...]
export const hikeTrack = (rid, h) => store[rid]?.tracks[itemKey(h)] || h.track || null;
export function setHikeTrack(rid, h, pts) {
  const s = local(rid);
  if (pts) s.tracks[itemKey(h)] = pts;
  else delete s.tracks[itemKey(h)];
  save();
}

export function parseGPX(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Not a GPX file');
  let nodes = [...doc.getElementsByTagName('trkpt')];
  if (!nodes.length) nodes = [...doc.getElementsByTagName('rtept')];
  const pts = nodes
    .map((n) => {
      const ele = n.getElementsByTagName('ele')[0];
      const p = [+(+n.getAttribute('lat')).toFixed(6), +(+n.getAttribute('lon')).toFixed(6)];
      if (ele) p.push(Math.round(+ele.textContent));
      return p;
    })
    .filter((p) => isFinite(p[0]) && isFinite(p[1]));
  if (pts.length < 2) throw new Error('No track points in that file');
  // thin to ~1 point per 5 m so long recorded tracks stay small
  const out = [pts[0]];
  for (const p of pts.slice(1)) {
    const q = out[out.length - 1];
    if (Math.hypot((p[0] - q[0]) * 110540, (p[1] - q[1]) * 111320 * Math.cos((p[0] * Math.PI) / 180)) >= 5) out.push(p);
  }
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}

export function trackStats(pts) {
  let d = 0, up = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    d += Math.hypot((b[0] - a[0]) * 110540, (b[1] - a[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180));
    if (a[2] != null && b[2] != null && b[2] > a[2]) up += b[2] - a[2];
  }
  return { miles: d / 1609.344, gainFt: pts[0]?.[2] != null ? up * 3.28084 : null };
}
