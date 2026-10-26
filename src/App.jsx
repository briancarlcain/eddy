import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BUILTIN_RIVERS, DEFAULT_RIVER, normalizeRiver } from './rivers.js';
import GENERAL from '../data/general.json';
import GEAR_ALL from '../data/gear.json';
import SEED from '../data/trip.json';
import SOURCES from '../data/sources.json';
import GC_REF from '../data/trips/gc2026-ref.json';
import { askReminders, boot, clearReminders, hideSplash, isNative, onOpenUrl, onResume, openUrl, remindersAllowed, saveBackup, saveFile, scheduleReminders, shareText, success } from './native.js';
import { canon, mergeTrips, stamp, strip } from './merge.js';
import * as remote from './sync.js';
import * as authApi from './auth.js';
import TopoMap, { OfflinePanel } from './TopoMap.jsx';
import BasinMap, { hasBasin } from './BasinMap.jsx';
import SunChart from './SunChart.jsx';
import { applyTheme, riverCardStyle } from './theme.js';
import { campHorizon, campSun, riverLine, dropHorizon, drops, dropsGPX, hasGeo, hikeTrack, onGeoChange, parseGPX, position, removeDrop, setHikeTrack, trackStats, updateDrop } from './geo/index.js';
import { sunDay } from './geo/sun.js';
import { atMile } from './geo/line.js';
import tzlookup from '@photostructure/tz-lookup';

// set by build.mjs: the App Store build ships a fictional sample trip, never the crew's real one
const IS_STORE = typeof __STORE__ !== 'undefined' && __STORE__;
const APP_VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';
const POLICY_URL = 'https://briancarlcain.github.io/eddy/privacy.html';
const TERMS_URL = 'https://briancarlcain.github.io/eddy/terms.html';
const SUPPORT_URL = 'https://github.com/briancarlcain/eddy/issues';
// outfitter-specific price lines are left out of the public catalog
const GEAR = IS_STORE ? GEAR_ALL.filter((g) => !/Ceiba|^Truck & Trailer|^Van Passenger|^Shuttle -|^Vehicle Shuttle|Gear (Pickup|Delivery) Tip|^Parking -|^Hualapai/i.test(g.n)) : GEAR_ALL;

// read-only reference material per trip (imported from the planning sheet)
const REFS = { [GC_REF.id]: GC_REF };

/* ---------- active river ---------- */
// The views read these module-level bindings. selectRiver() points them at one
// river; App calls it during render (and re-keys <main>) so a switch remounts
// everything that cached the old river's data.
let RIVER, ACCESS, YARD, MAXMILE, PPM;
const TOPPAD = 22;
let SRC = null;
function selectRiver(rec) {
  if (rec === SRC) return;
  SRC = rec;
  RIVER = normalizeRiver(rec);
  ACCESS = (RIVER.access || []).map((p, i) => ({ ...p, id: 'r' + i, fixed: true }));
  YARD = { id: 'yard', name: 'Outfitter', yard: true, grid: RIVER.yardGrid };
  MAXMILE = RIVER.miles[1];
  // map scale: short or crowded rivers get more vertical room per mile, until markers sit within half a mile of true
  const n = RIVER.rapids.length + RIVER.camps.length + RIVER.hikes.length;
  PPM = Math.round(Math.min(150, Math.max(21, 2200 / MAXMILE, (22 * n) / MAXMILE)));
  while (PPM < 150 && PPM * MAXMILE < 12000 && layoutTops(PPM).drift > 0.5) PPM = Math.round(PPM * 1.1) + 1;
}
selectRiver(BUILTIN_RIVERS[new URLSearchParams(location.search).get('river')] || BUILTIN_RIVERS[DEFAULT_RIVER]);

// keep markers apart so each stays tappable: walk downstream-first and push a marker down
// until it clears the previous one on its side (rapids cross the river, so they take both)
function layoutTops(ppm) {
  const GAP = 11;
  const items = [
    ...RIVER.rapids.map((d, i) => ({ k: 'r', i, mile: d.mile, side: 'B' })),
    ...RIVER.camps.map((c, i) => ({ k: 'c', i, mile: c.mile, side: c.bank === 'R' ? 'R' : 'L' })),
    ...RIVER.hikes.map((h, i) => ({ k: 'h', i, mile: h.mile, side: h.bank === 'R' ? 'R' : 'L' })),
  ].sort((a, b) => b.mile - a.mile);
  const last = { L: -1e9, R: -1e9 };
  const out = { r: [], c: [], h: [], max: 0, drift: 0 };
  items.forEach((it) => {
    const base = TOPPAD + (MAXMILE - it.mile) * ppm;
    let top = base;
    const prev = it.side === 'B' ? Math.max(last.L, last.R) : last[it.side];
    if (top < prev + GAP) top = prev + GAP;
    if (it.side === 'B') last.L = last.R = top;
    else last[it.side] = top;
    out[it.k][it.i] = top;
    out.max = Math.max(out.max, top);
    out.drift = Math.max(out.drift, (top - base) / ppm);
  });
  return out;
}

/* ---------- icons ---------- */
// 24px stroke icons (Lucide set, ISC licence)
const ICONS = {
  sunrise: 'M12 2v8M4.93 10.93l1.41 1.41M2 18h2M20 18h2M19.07 10.93l-1.41 1.41M22 22H2M8 6l4-4 4 4M16 18a4 4 0 0 0-8 0',
  sunset: 'M12 10V2M4.93 10.93l1.41 1.41M2 18h2M20 18h2M19.07 10.93l-1.41 1.41M22 22H2M16 6l-4 4-4-4M16 18a4 4 0 0 0-8 0',
  chevron: 'M6 9l6 6 6-6',
  back: 'M15 18l-6-6 6-6',
  plus: 'M12 5v14M5 12h14',
  close: 'M18 6L6 18M6 6l12 12',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  calendar: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  users: 'M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M21 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  pin: 'M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  check: 'M20 6L9 17l-5-5',
  cloud: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z',
  refresh: 'M21 12a9 9 0 0 0-15-6.7L3 8M3 3v5h5M3 12a9 9 0 0 0 15 6.7L21 16M21 21v-5h-5',
  alert: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
};
const Icon = ({ name, size = 18, className = '' }) => (
  <svg className={'ico ' + className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICONS[name]} />
  </svg>
);

const SunTimes = ({ rise, set, canyon }) => (
  <span className="sun" title={canyon ? 'First and last direct sun in camp, past the canyon walls' : undefined}>
    <span className="sunUp">
      <Icon name="sunrise" size={20} />
      <span className="sr">Sunrise </span>
      {rise}
    </span>
    <span className="sunDown">
      <Icon name="sunset" size={20} />
      <span className="sr">Sunset </span>
      {set}
    </span>
  </span>
);

const Avatar = ({ name }) => {
  const w = String(name || '?').trim().split(/\s+/);
  return <span className="avatar">{((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase()}</span>;
};

const Empty = ({ icon = 'inbox', title, children }) => (
  <div className="empty">
    <Icon name={icon} size={30} />
    <div className="emptyTitle">{title}</div>
    {children ? <div className="emptyText">{children}</div> : null}
  </div>
);

const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const now = () => Date.now();
const SLOTS = ['Breakfast', 'Lunch', 'Snack', 'Dinner', 'Happy hour'];
// evacuation difficulty: a quiet ramp from stone to deep river blue (the number carries the meaning)
const EVAC = { 1: '#6f7c85', 2: '#4f84a3', 3: '#1f6c9f', 4: '#154d77' };

/* dates */
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const okDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T12:00:00Z'));
// the device's local calendar date (not UTC, which flips to tomorrow in the US evening)
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmt(iso) {
  if (!okDate(iso)) return iso;
  const d = new Date(iso + 'T12:00:00Z');
  return `${DOW[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
function tripDays(trip) {
  return Array.from({ length: trip.days + 1 }, (_, i) => ({
    i,
    date: okDate(trip.start) ? addDays(trip.start, i) : '',
    label: okDate(trip.start) ? `Day ${i + 1} · ${fmt(addDays(trip.start, i))}` : `Day ${i + 1}`,
  }));
}

/* sun — NOAA, flat horizon */
function sun(iso, lat, lon) {
  const r = Math.PI / 180;
  const mid = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const t = (mid / 86400000 + 2440587.5 + 0.5 - 2451545) / 36525;
  const L = (280.46646 + t * 36000.76983) % 360;
  const M = 357.52911 + t * 35999.05029;
  const e = 0.016708634 - t * 0.000042037;
  const ctr =
    Math.sin(M * r) * (1.914602 - t * 0.004817) + Math.sin(2 * M * r) * 0.019993 + Math.sin(3 * M * r) * 0.000289;
  const lam = L + ctr - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * t) * r);
  const obl = 23.439291 - t * 0.0130042;
  const dec = Math.asin(Math.sin(obl * r) * Math.sin(lam * r)) / r;
  const y = Math.tan((obl / 2) * r) ** 2;
  const eq =
    (4 *
      (y * Math.sin(2 * L * r) -
        2 * e * Math.sin(M * r) +
        4 * e * y * Math.sin(M * r) * Math.cos(2 * L * r) -
        0.5 * y * y * Math.sin(4 * L * r) -
        1.25 * e * e * Math.sin(2 * M * r))) /
    r;
  const noon = 720 - 4 * lon - eq;
  const cosH = (Math.cos(90.833 * r) - Math.sin(lat * r) * Math.sin(dec * r)) / (Math.cos(lat * r) * Math.cos(dec * r));
  if (cosH < -1 || cosH > 1) return null;
  const h = (Math.acos(cosH) / r) * 4;
  const at = (m) => new Date(mid + m * 60000);
  return { rise: at(noon - h), set: at(noon + h) };
}
const clock = (d) => (d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: RIVER.tz }) : '—');
const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: RIVER.tz }).format(new Date());
const campOf = (p) => (p && p.camp ? RIVER.camps.find((c) => c.name === p.camp && (p.mile == null || c.mile === p.mile)) || RIVER.camps.find((c) => c.name === p.camp) : null);
// the night a trip spends at this camp, else the launch day (if a trip is open on this river), else today
function campDate(trip, c) {
  if (trip && okDate(trip.start)) {
    const i = Object.keys(trip.plans || {}).find((k) => trip.plans[k]?.camp === c.name);
    return i != null ? addDays(trip.start, +i) : trip.start;
  }
  return todayISO();
}
// terrain-aware sun for a camp: { on, off, hours, spans, rise, set } or null when the river has no terrain data
const campSunOn = (c, iso) => (c && iso ? campSun(RIVER.id, c, iso, RIVER.tz) : null);
const sunOff = (c, iso) => {
  const cs = campSunOn(c, iso);
  return cs ? (cs.off ? 'sun off ' + clock(cs.off) : 'no sun') : null;
};

function CampSunLine({ c, iso }) {
  const cs = campSunOn(c, iso);
  if (!cs) return null;
  const many = cs.spans.length > 1;
  return (
    <div className="campSun">
      <Icon name="sunset" size={16} />
      <span>
        {cs.on ? (
          <>
            Direct sun in camp <b>{clock(cs.on)}</b> – <b>{clock(cs.off)}</b> · {cs.hours.toFixed(1)} h
            {many ? <> (in {cs.spans.length} spells: {cs.spans.map(([a, b]) => `${clock(a)}–${clock(b)}`).join(', ')})</> : null}
          </>
        ) : (
          <>No direct sun in camp</>
        )}
        <span className="muted"> · {fmt(iso)} · open-sky sunrise {clock(cs.rise)}, sunset {clock(cs.set)}</span>
      </span>
    </div>
  );
}

const clean = (h) =>
  String(h)
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&mdash;/g, '—')
    .replace(/&deg;/g, '°')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/* ---------- store ---------- */
// Local state is authoritative while you type. `db`, when the viewer can
// run it, mirrors every record so the crew sees each other's edits live.

const LOCAL = 'eddy.v1';

function mergeSeed(have) {
  if ((have.at || 0) <= 2) return SEED;
  const next = { ...have };
  // no crew yet = the empty trip from the first release: take the sheet's crew, crafts, cars and places
  if (!(have.crew || []).length) ['crew', 'boats', 'cars', 'places'].forEach((k) => (next[k] = SEED[k]));
  ['gear', 'meals', 'pay'].forEach((k) => {
    if (!(have[k] || []).length) next[k] = SEED[k];
  });
  // the sheet's NPS-pass shares were corrected (1/7 each -> 1 each); update copies still holding the old import
  const nps = SEED.gear.find((g) => /^National Park Service/.test(g.n));
  next.gear = (next.gear || []).map((g) => (nps && /^National Park Service/.test(g.n) && Object.values(g.e || {}).some((v) => v.need === 0.1428571429) ? { ...g, e: nps.e } : g));
  next.plans = { ...have.plans };
  Object.entries(SEED.plans).forEach(([d, p]) => (next.plans[d] = { ...p, ...(have.plans || {})[d] }));
  if (!(next.boats || []).some((b) => b.id === 'b4')) next.boats = [...(next.boats || []), ...SEED.boats.filter((b) => b.id === 'b4')];
  return { ...next, at: now() };
}

// small string hash (cyrb53): enough to tell whether a trip changed since the last sync
function hash53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + ':' + str.length;
}

// "Erase all data" keeps the account link only if there is none to keep
const st0cloud = () => null;

// one-line description of what changed between two copies of a trip (for the activity feed)
const KIND_LABEL = { crew: 'crew', meals: 'meal', gear: 'gear', boats: 'craft', cars: 'vehicle', places: 'place', log: 'journal entry', pay: 'payment' };
function summarize(a, b) {
  if (!a || !b) return null;
  const out = [];
  if (a.name !== b.name) out.push(`Renamed the trip to "${b.name}"`);
  if (a.start !== b.start || a.days !== b.days) out.push('Changed the trip dates');
  for (const [k, label] of Object.entries(KIND_LABEL)) {
    const A = new Map((a[k] || []).map((x) => [x.id, x]));
    const B = new Map((b[k] || []).map((x) => [x.id, x]));
    const nm = (x) => x.name || x.n || x.text || x.title || '';
    for (const [id, x] of B) {
      const w = nm(x) ? ': ' + String(nm(x)).slice(0, 30) : '';
      if (!A.has(id)) out.push('Added ' + label + w);
      else if (canon(strip(x)) !== canon(strip(A.get(id)))) out.push('Updated ' + label + w);
    }
    for (const [id, x] of A) if (!B.has(id)) out.push('Removed ' + label + (nm(x) ? ': ' + String(nm(x)).slice(0, 30) : ''));
  }
  const days = new Set([...Object.keys(a.plans || {}), ...Object.keys(b.plans || {})]);
  let changed = 0;
  days.forEach((d) => {
    if (canon(strip((a.plans || {})[d] || {})) !== canon(strip((b.plans || {})[d] || {}))) changed++;
  });
  if (changed) out.push(changed === 1 ? 'Updated a day plan' : `Updated ${changed} day plans`);
  if (!out.length) return null;
  const shown = out.slice(0, 3).join('; ');
  return (out.length > 3 ? shown + `; and ${out.length - 3} more` : shown).slice(0, 140);
}

// A built-in river that the user edited is stored as a patch (only the fields they changed), so every
// other field keeps receiving updates when the built-in data improves.
const riverDiff = (id, r) => {
  const nb = normalizeRiver(BUILTIN_RIVERS[id]);
  const patch = {};
  for (const k of Object.keys(r)) {
    if (k === 'id' || k === 'at' || k === '_patch' || r[k] === undefined) continue;
    if (canon(r[k]) !== canon(nb[k])) patch[k] = r[k];
  }
  return patch;
};
const effRiver = (id, rivers) => {
  const b = BUILTIN_RIVERS[id];
  const o = rivers && rivers[id];
  if (!b) return o || null;
  if (!o) return b;
  const { _patch: _p, ...rest } = o;
  return { ...b, ...rest, id };
};

const NAME_KEY = 'eddy.name';
const savedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
};

function useStore() {
  const [state, setState] = useState(() => {
    let st = { trips: [], active: null, rivers: {} };
    try {
      st = JSON.parse(localStorage.getItem(LOCAL)) || st;
    } catch {}
    try {
      // .seed5 (re-runs the merge: .seed4 filled crew/crafts, .seed5 corrects the NPS-pass shares): the seeded trip now carries the planning-sheet data. A copy nobody has edited
      // (at <= 2) is replaced outright; an edited copy keeps its own data and only gets the
      // sheet's gear, menu, payments and day notes where it has none.
      if (!localStorage.getItem(LOCAL + '.seed5')) {
        localStorage.setItem(LOCAL + '.seed5', SEED.id);
        localStorage.setItem(LOCAL + '.seed4', SEED.id);
        localStorage.setItem(LOCAL + '.seed3', SEED.id);
        localStorage.setItem(LOCAL + '.seed2', SEED.id);
        const have = st.trips.find((x) => x.id === SEED.id);
        st = {
          ...st,
          trips: [have ? mergeSeed(have) : SEED, ...st.trips.filter((x) => x.id !== SEED.id)],
          active: have ? st.active || SEED.id : SEED.id,
        };
        localStorage.setItem(LOCAL, JSON.stringify(st));
      }
    } catch {}
    st.rivers = st.rivers || {};
    let migrated = false;
    for (const [id, o] of Object.entries(st.rivers)) {
      if (!BUILTIN_RIVERS[id] || !o || o._patch) continue;
      const patch = riverDiff(id, o);
      if (Object.keys(patch).length) st.rivers[id] = { id, at: o.at, ...patch, _patch: true };
      else delete st.rivers[id];
      migrated = true;
    }
    if (migrated) {
      try {
        localStorage.setItem(LOCAL, JSON.stringify(st));
      } catch {}
    }
    return st;
  });
  const stateRef = useRef(state);
  const busy = useRef(new Set());
  const timers = useRef({});
  const [status, setStatus] = useState({}); // tripId -> 'ok' | 'busy' | 'offline' | 'gone' | 'removed'
  const [info, setInfoState] = useState({}); // tripId -> { role, me, members, activity, inviteRole } from the server
  const infoRef = useRef({});
  const setInfo = (id, v) => {
    infoRef.current = { ...infoRef.current, [id]: v };
    setInfoState(infoRef.current);
  };
  const lastSrv = useRef({}); // tripId -> the copy the server held when we last talked to it (for activity notes)
  const setSt = (id, v) => setStatus((m) => (m[id] === v ? m : { ...m, [id]: v }));

  // every state change goes through here so async sync code always sees the latest state
  const persist = useCallback((next) => {
    stateRef.current = next;
    setState(next);
    try {
      localStorage.setItem(LOCAL, JSON.stringify(next));
    } catch {}
  }, []);
  const commit = useCallback((fn) => persist(fn(stateRef.current)), [persist]);

  const hashOf = (d) => {
    const { _river, ...rest } = d;
    return hash53(canon(rest));
  };
  const withRiver = (doc) => {
    const id = doc.river || DEFAULT_RIVER;
    const custom = !BUILTIN_RIVERS[id] && stateRef.current.rivers[id];
    return custom ? { ...doc, _river: custom } : doc;
  };
  // adopt a custom river that came along with a shared trip
  const adoptRiver = (s0, doc) => (doc._river && doc._river.id && !BUILTIN_RIVERS[doc._river.id] && !s0.rivers[doc._river.id] ? { ...s0.rivers, [doc._river.id]: doc._river } : s0.rivers);

  // who this device is, as shown to the other members
  const nameFor = (local) => {
    const meId = local ? getMe(local.id) : '';
    const crew = local && (local.crew || []).find((c) => c.id === meId);
    if (crew && crew.name) return crew.name;
    const n = savedName();
    if (n) return n;
    const u = sessionRef.current && sessionRef.current.user;
    const meta = u && u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name);
    if (meta) return meta;
    return u && u.email ? u.email.split('@')[0] : '';
  };

  // Make this device a member of the trip (upgrade it if we own a legacy share, otherwise join with the code).
  // Returns the updated entry, null when the trip is still a legacy share, or 'gone'.
  const ensureV2 = async (id, ent, local) => {
    if (ent.trip) return ent;
    const member = ent.member || remote.newSecret();
    const name = nameFor(local);
    const mine = ent.owner && ent.owner !== 'account' && ent.owner !== 'v2';
    const r = mine ? await remote.v2Upgrade(ent.code, ent.owner, member, name) : await remote.v2Join(ent.code, member, name);
    if (!r || r.missing) return mine ? 'gone' : null;
    const next = { ...ent, trip: r.trip, member, me: r.me, role: r.role };
    commit((s0) => ({ ...s0, sync: { ...(s0.sync || {}), [id]: { ...((s0.sync || {})[id] || ent), trip: r.trip, member, me: r.me, role: r.role } } }));
    return next;
  };

  const syncTrip = useCallback(async (id) => {
    let ent = (stateRef.current.sync || {})[id];
    const local = stateRef.current.trips.find((t) => t.id === id);
    if (!ent || !local || busy.current.has(id)) return;
    if (ent.removed) return setSt(id, 'removed');
    busy.current.add(id);
    setSt(id, 'busy');
    try {
      let v2 = !!ent.trip;
      if (!v2) {
        const r = await ensureV2(id, ent, local);
        if (r === 'gone') return setSt(id, 'gone');
        if (r) {
          ent = r;
          v2 = true;
        }
      }
      let version = ent.version || 0;
      let doc = local;
      let known = ent.h; // canonical form of the copy the server holds
      let role = ent.role;
      const needInfo = v2 && !infoRef.current[id];
      let g = v2 ? await remote.v2Get(ent.trip, ent.member, needInfo ? 0 : version) : await remote.get(ent.code, version);
      if (g && g.upgraded) {
        const r = await ensureV2(id, ent, local);
        if (!r || r === 'gone') return setSt(id, 'gone');
        ent = r;
        v2 = true;
        g = await remote.v2Get(ent.trip, ent.member, 0);
      }
      if (g && g.missing) return setSt(id, 'gone');
      if (g && g.removed) {
        commit((s0) => ({ ...s0, sync: { ...(s0.sync || {}), [id]: { ...((s0.sync || {})[id] || ent), removed: true } } }));
        return setSt(id, 'removed');
      }
      if (g && g.data) {
        doc = mergeTrips(doc, g.data);
        version = g.version;
        known = hashOf(g.data);
        const { _river: _gr, ...srv } = g.data;
        lastSrv.current[id] = srv;
      }
      if (g && v2 && g.role) {
        role = g.role;
        setInfo(id, { role: g.role, me: g.me, members: g.members || [], activity: g.activity || [], inviteRole: g.invite_role || 'editor' });
      }
      if (hashOf(doc) !== known && role !== 'viewer') {
        let done = false;
        for (let i = 0; i < 4 && !done; i++) {
          const r = v2
            ? await remote.v2Put(ent.trip, ent.member, version, withRiver(doc), summarize(lastSrv.current[id], doc))
            : await remote.put(ent.code, version, withRiver(doc));
          if (r.missing) return setSt(id, 'gone');
          if (r.removed) {
            commit((s0) => ({ ...s0, sync: { ...(s0.sync || {}), [id]: { ...((s0.sync || {})[id] || ent), removed: true } } }));
            return setSt(id, 'removed');
          }
          if (r.forbidden) {
            role = 'viewer';
            doc = mergeTrips(doc, r.data);
            version = r.version;
            known = hashOf(r.data);
            done = true;
          } else if (r.conflict) {
            doc = mergeTrips(doc, r.data);
            version = r.version;
          } else {
            version = r.version;
            known = hashOf(doc);
            const { _river: _dr, ...srv } = doc;
            lastSrv.current[id] = srv;
            done = true;
          }
        }
        if (!done) throw new Error('busy');
      }
      commit((s0) => {
        const cur = s0.trips.find((t) => t.id === id);
        if (!cur) return s0;
        const { _river: _r, ...merged } = mergeTrips(cur, doc);
        return {
          ...s0,
          trips: s0.trips.map((t) => (t.id === id ? merged : t)),
          rivers: adoptRiver(s0, doc),
          sync: { ...s0.sync, [id]: { ...(s0.sync || {})[id], version, h: known, ...(role ? { role } : {}) } },
        };
      });
      setSt(id, 'ok');
    } catch {
      setSt(id, 'offline');
    } finally {
      busy.current.delete(id);
    }
  }, [commit]);

  /* ---- account: back up and sync every trip across the signed-in user's devices ---- */
  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  const [cloudStatus, setCloudStatus] = useState('');
  const cloudBusy = useRef(false);
  const NOCLOUD = (id) => IS_STORE && id === SEED.id; // the fictional sample trip stays on the device

  const dropLocal = (id) =>
    commit((s0) => {
      const trips = s0.trips.filter((t) => t.id !== id);
      const { [id]: _a, ...sync } = s0.sync || {};
      const ct = { ...((s0.cloud || {}).trips || {}) };
      delete ct[id];
      return { ...s0, trips, sync, cloud: s0.cloud ? { ...s0.cloud, trips: ct } : s0.cloud, active: s0.active === id ? trips[0]?.id ?? null : s0.active };
    });

  // info: this trip's row from acct_list (null = not on the server yet). opts.share: '' clears the stored join code.
  const cloudSyncTrip = async (id, info, opts = {}) => {
    const s0 = stateRef.current;
    const cl = s0.cloud;
    const local = s0.trips.find((t) => t.id === id);
    if (!cl || !local || NOCLOUD(id)) return;
    const ent = (cl.trips || {})[id] || { version: 0, h: '' };
    let version = ent.version || 0;
    let known = ent.h;
    let doc = local;
    let shareCode; // undefined = not fetched; null = fetched, trip not shared
    if (info ? info.version > version : version > 0) {
      const g = await remote.acctGet(id, version);
      if (g && g.deleted) return dropLocal(id);
      if (g && g.data) {
        doc = mergeTrips(doc, g.data);
        version = g.version;
        known = hashOf(g.data);
        shareCode = g.share_code;
      }
    }
    const mine = (s0.sync || {})[id];
    const share = opts.share !== undefined ? opts.share : mine && mine.owner ? mine.code : null;
    if (hashOf(doc) !== known || opts.share !== undefined || (share && shareCode !== undefined && shareCode !== share)) {
      let done = false;
      for (let i = 0; i < 4 && !done; i++) {
        const r = await remote.acctPut(id, version, withRiver(doc), share);
        if (r.deleted) return dropLocal(id);
        if (r.conflict) {
          doc = mergeTrips(doc, r.data);
          version = r.version;
          shareCode = r.share_code;
        } else {
          version = r.version;
          known = hashOf(doc);
          done = true;
        }
      }
      if (!done) throw new Error('busy');
    }
    commit((s1) => {
      const cur = s1.trips.find((t) => t.id === id);
      if (!cur) return s1;
      const { _river: _r, ...merged } = mergeTrips(cur, doc);
      let sync = s1.sync || {};
      if (shareCode && !sync[id]) sync = { ...sync, [id]: { code: shareCode, owner: 'account', version: 0, h: '' } }; // shared from another device
      if (shareCode === null && sync[id] && sync[id].owner === 'account' && opts.share === undefined) {
        const { [id]: _g, ...rest } = sync; // sharing was stopped from another device
        sync = rest;
      }
      return {
        ...s1,
        trips: s1.trips.map((t) => (t.id === id ? merged : t)),
        rivers: adoptRiver(s1, doc),
        sync,
        cloud: { ...s1.cloud, trips: { ...s1.cloud.trips, [id]: { version, h: known } } },
      };
    });
  };

  const cloudSyncAll = useCallback(async () => {
    const sess = sessionRef.current;
    if (!sess || cloudBusy.current) return;
    cloudBusy.current = true;
    setCloudStatus('busy');
    try {
      if (!stateRef.current.cloud || stateRef.current.cloud.uid !== sess.user.id) {
        // first sign-in on this device, or a different account: start with no links
        commit((s0) => ({ ...s0, cloud: { uid: sess.user.id, trips: {}, del: [] } }));
        // trips this device shared before signing in become the account's
        for (const e of Object.values(stateRef.current.sync || {})) {
          if (e.trip && e.role === 'owner') await remote.v2Claim(e.trip, e.member).catch(() => {});
          else if (e.owner && e.owner !== 'account' && e.owner !== 'v2') await remote.claim(e.code, e.owner).catch(() => {});
        }
      }
      for (const id of [...(stateRef.current.cloud.del || [])]) {
        await remote.acctDelete(id);
        commit((s0) => ({ ...s0, cloud: { ...s0.cloud, del: s0.cloud.del.filter((x) => x !== id) } }));
      }
      const list = await remote.acctList();
      const byId = new Map(list.map((r) => [r.trip_id, r]));
      for (const r of list) {
        const local = stateRef.current.trips.find((t) => t.id === r.trip_id);
        if (r.deleted) {
          if (local) dropLocal(r.trip_id);
        } else if (!local) {
          const g = await remote.acctGet(r.trip_id, 0);
          if (g && g.data) {
            const { _river, ...doc } = g.data;
            commit((s0) => ({
              ...s0,
              trips: [{ crew: [], boats: [], cars: [], places: [], gear: [], meals: [], log: [], pay: [], plans: {}, ...doc }, ...s0.trips.filter((t) => t.id !== doc.id)],
              rivers: adoptRiver(s0, g.data),
              sync: g.share_code && !(s0.sync || {})[doc.id] ? { ...(s0.sync || {}), [doc.id]: { code: g.share_code, owner: 'account', version: 0, h: '' } } : s0.sync,
              cloud: { ...s0.cloud, trips: { ...s0.cloud.trips, [doc.id]: { version: g.version, h: hashOf(g.data) } } },
              active: s0.active || doc.id,
            }));
          }
        }
      }
      for (const t of [...stateRef.current.trips]) if (!NOCLOUD(t.id)) await cloudSyncTrip(t.id, byId.get(t.id) && !byId.get(t.id).deleted ? byId.get(t.id) : null);
      setCloudStatus('ok');
    } catch {
      setCloudStatus('offline');
    } finally {
      cloudBusy.current = false;
    }
  }, [commit]);

  const cloudTimers = useRef({});
  const cloudSoon = (id) => {
    if (!sessionRef.current || !(stateRef.current.cloud && stateRef.current.cloud.trips)) return;
    clearTimeout(cloudTimers.current[id]);
    cloudTimers.current[id] = setTimeout(() => cloudSyncTrip(id, undefined).catch(() => setCloudStatus('offline')), 1500);
  };

  useEffect(() => {
    authApi.getSession().then((x) => {
      sessionRef.current = x;
      setSession(x);
    }).catch(() => {});
    return authApi.onSession((x) => {
      sessionRef.current = x;
      setSession(x);
    });
  }, []);
  useEffect(() => {
    const u = session && session.user;
    const nm = u && u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name);
    if (u && nm && !savedName()) {
      try {
        localStorage.setItem(NAME_KEY, nm);
      } catch {}
    }
    if (u && !nm) authApi.refreshProfile().catch(() => {}); // the profile may have been named on the server
  }, [session && session.user && session.user.id, session && session.user && session.user.user_metadata && session.user.user_metadata.name]);
  useEffect(() => {
    if (session) cloudSyncAll();
    else setCloudStatus('');
  }, [session && session.user && session.user.id, cloudSyncAll]);

  const syncAll = useCallback(() => {
    Object.keys(stateRef.current.sync || {}).forEach((id) => syncTrip(id));
    cloudSyncAll();
  }, [syncTrip, cloudSyncAll]);
  const syncSoon = (id) => {
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => syncTrip(id), 1500);
  };

  useEffect(() => {
    syncAll();
    const iv = setInterval(() => document.visibilityState !== 'hidden' && syncAll(), 20000);
    onResume(syncAll);
    return () => clearInterval(iv);
  }, [syncAll]);

  const trips = state.trips;
  const trip = trips.find((t) => t.id === state.active) || null;

  const edit = (fn) => {
    if (!trip) return;
    const e0 = (stateRef.current.sync || {})[trip.id];
    if (e0 && e0.role === 'viewer') return; // view-only member
    const t0 = now();
    const next = stamp(trip, { ...fn({ ...trip }), at: t0 }, t0);
    persist({ ...stateRef.current, trips: stateRef.current.trips.map((t) => (t.id === next.id ? next : t)) });
    if ((stateRef.current.sync || {})[next.id]) syncSoon(next.id);
    cloudSoon(next.id);
  };

  const shareTrip = async (id) => {
    const t = stateRef.current.trips.find((x) => x.id === id);
    if (!t) throw new Error('no trip');
    const code = remote.newCode();
    const member = remote.newSecret();
    const r = await remote.v2Create(code, member, nameFor(t), withRiver(t));
    const { _river: _x, ...srv } = withRiver(t);
    lastSrv.current[id] = srv;
    commit((s0) => ({ ...s0, sync: { ...(s0.sync || {}), [id]: { code, owner: 'v2', trip: r.trip, member, me: r.me, role: 'owner', version: r.version, h: hashOf(t) } } }));
    setSt(id, 'ok');
    if (sessionRef.current) cloudSyncTrip(id, undefined).catch(() => {});
    syncTrip(id); // load the member list
    return code;
  };
  const joinTrip = async (raw, name) => {
    const code = remote.cleanCode(raw);
    if (!code) throw new Error('That code does not look right. It has 16 letters and numbers.');
    const clean = String(name || '').trim().slice(0, 40);
    if (clean) {
      try {
        localStorage.setItem(NAME_KEY, clean);
      } catch {}
    }
    const prev = Object.values(stateRef.current.sync || {}).find((e) => e.code === code && e.member);
    const member = prev ? prev.member : remote.newSecret();
    let r = await remote.v2Join(code, member, clean || nameFor(null));
    let g;
    let ent;
    if (r && !r.missing && r.data) {
      g = r;
      ent = { code, trip: r.trip, member, me: r.me, role: r.role, version: r.version, h: hashOf(r.data) };
    } else {
      g = await remote.get(code, 0); // a trip whose owner has not upgraded it yet
      if (!g || g.missing || g.upgraded || !g.data) throw new Error('No trip found for that code. It may have been reset. Ask for a new link.');
      ent = { code, version: g.version, h: hashOf(g.data) };
    }
    const { _river, ...doc } = g.data;
    commit((s0) => {
      const have = s0.trips.find((t) => t.id === doc.id);
      const { _river: _r2, ...merged } = have ? mergeTrips(have, g.data) : { crew: [], boats: [], cars: [], places: [], gear: [], meals: [], log: [], pay: [], plans: {}, ...doc };
      return {
        ...s0,
        trips: [merged, ...s0.trips.filter((t) => t.id !== doc.id)],
        active: doc.id,
        rivers: adoptRiver(s0, g.data),
        sync: { ...(s0.sync || {}), [doc.id]: ent },
      };
    });
    lastSrv.current[doc.id] = doc;
    if (ent.trip) setInfo(doc.id, { role: g.role, me: g.me, members: g.members || [], activity: g.activity || [], inviteRole: g.invite_role || 'editor' });
    setSt(doc.id, 'ok');
    syncTrip(doc.id);
    if (sessionRef.current) setTimeout(cloudSyncAll, 300);
    return doc.id;
  };
  const stopSharing = async (id) => {
    const ent = (stateRef.current.sync || {})[id];
    if (!ent) return;
    if (ent.trip && !ent.removed) {
      if (ent.role === 'owner') await remote.v2Delete(ent.trip, ent.member); // removes the server copy for everyone
      else await remote.v2Leave(ent.trip, ent.member).catch(() => {});
    } else if (ent.owner && ent.owner !== 'v2') await remote.del(ent.code, ent.owner);
    commit((s0) => {
      const { [id]: _gone, ...rest } = s0.sync || {};
      return { ...s0, sync: rest };
    });
    if (sessionRef.current) cloudSyncTrip(id, undefined, { share: '' }).catch(() => {});
    setStatus((m) => {
      const { [id]: _g, ...rest } = m;
      return rest;
    });
    const { [id]: _i, ...restInfo } = infoRef.current;
    infoRef.current = restInfo;
    setInfoState(restInfo);
  };

  // owner / member controls (all go through the trip's member secret)
  const memberCall = async (id, fn) => {
    const ent = (stateRef.current.sync || {})[id];
    if (!ent || !ent.trip) throw new Error('This trip is not shared.');
    const ok = await fn(ent);
    await syncTrip(id);
    return ok;
  };
  const setMemberRole = (id, target, role) => memberCall(id, (e) => remote.v2Role(e.trip, e.member, target, role));
  const removeMember = (id, target) => memberCall(id, (e) => remote.v2Remove(e.trip, e.member, target));
  const setInviteRole = (id, role) => memberCall(id, (e) => remote.v2InviteRole(e.trip, e.member, role));
  const renameMe = (id, name) => {
    try {
      localStorage.setItem(NAME_KEY, String(name).trim().slice(0, 40));
    } catch {}
    return memberCall(id, (e) => remote.v2Rename(e.trip, e.member, name));
  };
  const resetInvite = async (id) => {
    const code = remote.newCode();
    await memberCall(id, (e) => remote.v2Rotate(e.trip, e.member, code));
    commit((s0) => ({ ...s0, sync: { ...(s0.sync || {}), [id]: { ...(s0.sync || {})[id], code } } }));
    if (sessionRef.current) cloudSyncTrip(id, undefined, { share: code }).catch(() => {});
    return code;
  };

  return {
    trips,
    trip,
    rivers: state.rivers,
    sync: state.sync || {},
    syncStatus: status,
    info,
    setMemberRole,
    removeMember,
    setInviteRole,
    renameMe,
    resetInvite,
    syncNow: syncTrip,
    session,
    cloudStatus,
    cloudNow: cloudSyncAll,
    signOut: async (removeLocal) => {
      await authApi.signOut();
      const st = stateRef.current;
      const gone = removeLocal ? new Set(Object.keys((st.cloud && st.cloud.trips) || {})) : new Set();
      const trips = st.trips.filter((t) => !gone.has(t.id));
      const sync = Object.fromEntries(Object.entries(st.sync || {}).filter(([k]) => !gone.has(k)));
      persist({ ...st, trips, sync, cloud: null, active: gone.has(st.active) ? trips[0]?.id ?? null : st.active });
    },
    deleteAccount: async () => {
      await remote.deleteMe();
      await authApi.signOut();
      const st = stateRef.current;
      const sync = Object.fromEntries(Object.entries(st.sync || {}).filter(([, e]) => !e.owner)); // our shared copies were deleted with the account
      persist({ ...st, sync, cloud: null });
    },
    shareTrip,
    joinTrip,
    stopSharing,
    // all rivers (built-in + added/edited), built-ins first
    riverList: () => {
      const ids = [...Object.keys(BUILTIN_RIVERS), ...Object.keys(state.rivers).filter((k) => !BUILTIN_RIVERS[k])];
      return ids.map((id) => ({ ...effRiver(id, state.rivers), id, custom: !BUILTIN_RIVERS[id], edited: !!(BUILTIN_RIVERS[id] && state.rivers[id]) }));
    },
    // merge a backup file into the current state (newer copy of a trip wins)
    restore: (data) => {
      const st = stateRef.current;
      const byId = new Map(st.trips.map((t) => [t.id, t]));
      const incoming = (data.trips || []).filter((t) => t && t.id && t.name);
      incoming.forEach((t) => {
        const o = byId.get(t.id);
        if (!o || (t.at || 0) > (o.at || 0)) byId.set(t.id, { crew: [], boats: [], cars: [], places: [], gear: [], meals: [], log: [], pay: [], plans: {}, ...t });
      });
      const list = [...byId.values()];
      persist({ ...st, trips: list, rivers: { ...st.rivers, ...(data.rivers || {}) }, active: st.active || list[0]?.id || null });
      if (sessionRef.current) setTimeout(cloudSyncAll, 300);
      return incoming.length;
    },
    wipe: () => persist({ trips: [], active: null, rivers: {}, sync: {}, cloud: st0cloud() }),
    riverRec: (id) => effRiver(id, state.rivers) || { id, name: 'Unknown river' },
    saveRiver: (r) => {
      const id = r.id || uid();
      if (BUILTIN_RIVERS[id]) {
        const patch = riverDiff(id, r);
        const { [id]: _old, ...others } = stateRef.current.rivers;
        const rivers = Object.keys(patch).length ? { ...others, [id]: { id, at: now(), ...patch, _patch: true } } : others;
        persist({ ...stateRef.current, rivers });
        return id;
      }
      const rec = { ...r, id, at: now() };
      persist({ ...stateRef.current, rivers: { ...stateRef.current.rivers, [rec.id]: rec } });
      return rec.id;
    },
    dropRiver: (id) => {
      const { [id]: _gone, ...rest } = stateRef.current.rivers;
      persist({ ...stateRef.current, rivers: rest });
    },
    activate: (id) => persist({ ...stateRef.current, active: id }),
    create: (t) => {
      const next = {
        id: uid(),
        code: Math.random().toString(36).slice(2, 8).toUpperCase(),
        crew: [],
        boats: [],
        cars: [],
        places: [],
        gear: [],
        meals: [],
        log: [],
        pay: [],
        plans: {},
        at: now(),
        ...t,
      };
      persist({ ...stateRef.current, trips: [next, ...stateRef.current.trips], active: next.id });
      if (sessionRef.current) setTimeout(cloudSyncAll, 300); // back the new trip up
    },
    remove: (id) => {
      const st = stateRef.current;
      const list = st.trips.filter((t) => t.id !== id);
      const { [id]: _gone, ...sync } = st.sync || {}; // removing a trip only leaves the shared copy; use Stop sharing to delete it
      const onAccount = st.cloud && st.cloud.trips && st.cloud.trips[id];
      const cloud = st.cloud ? { ...st.cloud, trips: Object.fromEntries(Object.entries(st.cloud.trips || {}).filter(([k]) => k !== id)), del: onAccount ? [...(st.cloud.del || []), id] : st.cloud.del } : st.cloud;
      persist({ ...st, trips: list, sync, cloud, active: id === st.active ? list[0]?.id ?? null : st.active });
      if (onAccount) cloudSyncAll();
    },
    set: (patch) => edit((t) => ({ ...t, ...patch })),
    push: (key, item) => edit((t) => ({ ...t, [key]: [...(t[key] || []), { id: uid(), ...item }] })),
    patch: (key, id, p) => edit((t) => ({ ...t, [key]: (t[key] || []).map((x) => (x.id === id ? { ...x, ...p } : x)) })),
    drop: (key, id) =>
      edit((t) => ({
        ...t,
        [key]: (t[key] || []).filter((x) => x.id !== id),
        gear: key === 'crew' ? t.gear.map((g) => (g.by === id ? { ...g, by: '' } : g)) : t.gear,
      })),
    plan: (i, p) => edit((t) => ({ ...t, plans: { ...t.plans, [i]: { ...t.plans[i], ...p } } })),
  };
}

/* ---------- ui ---------- */

const Tabs = ({ items, value, onChange, danger }) => (
  <div className={'tabs' + (danger ? ' danger' : '')}>
    {items.map((t) => (
      <button
        key={t}
        className={'tab' + (t === value ? ' on' : '')}
        onClick={() => onChange(t)}
      >
        {TAB_NAMES[t] || t}
      </button>
    ))}
  </div>
);
const TAB_NAMES = { Crew: 'Crew & Crafts' };

function Acc({ title, note, tag, lead, children, open: start }) {
  const [open, setOpen] = useState(!!start);
  return (
    <div className={'acc' + (open ? ' open' : '')}>
      <button className="accHead" onClick={() => setOpen(!open)} aria-expanded={open}>
        {lead}
        <span className="accText">
          <span className="accTitle">{title}</span>
          {note ? <span className={'accNote' + (typeof note === 'string' ? ' clamp' : '')}>{note}</span> : null}
        </span>
        {tag}
        <Icon name="chevron" size={18} className="chev" />
      </button>
      {open ? <div className="accBody">{children}</div> : null}
    </div>
  );
}

const Tag = ({ label, tint }) => (
  <span className="tag" style={{ borderColor: tint, color: tint }}>
    {label}
  </span>
);

const Field = ({ label, area, ...p }) => (
  <label className="field">
    {label ? <span className="label">{label}</span> : null}
    {area ? <textarea {...p} /> : <input {...p} />}
  </label>
);

/* ---------- trip ---------- */

const lastSub = {};

function Trip({ s, back, onAccount, onRiver }) {
  const [nudge, setNudge] = useState(() => {
    try {
      return localStorage.getItem('eddy.v1.joinedNudge') === '1';
    } catch {
      return false;
    }
  });
  const hideNudge = () => {
    try {
      localStorage.removeItem('eddy.v1.joinedNudge');
    } catch {}
    setNudge(false);
  };
  const OLD = { 'Crew & Crafts': 'Crew', Ledger: 'Costs', Log: 'Journal', Info: 'Notes', Card: 'Emergency' };
  const q = QS.get('sub');
  const [tab, setTab] = useState((q && (OLD[q] || q)) || lastSub[s.trip?.id] || 'Itinerary');
  useEffect(() => {
    if (s.trip) lastSub[s.trip.id] = tab;
  }, [tab, s.trip?.id]);
  if (!s.trip) return <NewTrip s={s} />;
  const tripEnt = s.sync[s.trip.id];
  const tripStatus0 = s.syncStatus[s.trip.id];
  const panels = { Itinerary, Crew, Meals, Gear, Shuttle, Costs: Ledger, Emergency: Card, Journal: Log, Notes: Info, People, Settings };
  const P = panels[tab] || Itinerary;
  const items = ['Itinerary', ...(onRiver && riverOf(s.trip) ? ['River'] : []), 'Crew', 'Meals', 'Gear', 'Shuttle', 'Costs', 'Emergency', 'Journal', ...(REFS[s.trip.id] || RIVER.flowDoy || RIVER.climateDoy ? ['Notes'] : []), 'People', 'Settings'];
  return (
    <>
      <Tabs items={items} value={tab} onChange={(t) => (t === 'River' ? onRiver() : setTab(t))} />
      <div className="pad">
        {tripEnt && tripEnt.role === 'viewer' && !tripEnt.removed ? (
          <div className="notice mb note">
            <div className="noticeHead">
              <Icon name="alert" size={17} /> View only
            </div>
            <div className="muted">The owner can give you edit access from People.</div>
          </div>
        ) : null}
        {tripEnt && (tripEnt.removed || tripStatus0 === 'removed') ? (
          <div className="notice mb note">
            <div className="noticeHead">
              <Icon name="alert" size={17} /> You were removed from this trip
            </div>
            <div className="muted mb-s">This copy stays on your device but no longer syncs.</div>
            <button className="btn ghost" onClick={() => s.stopSharing(s.trip.id)}>
              Stop syncing
            </button>
          </div>
        ) : null}
        {tripStatus0 === 'gone' ? (
          <div className="notice mb note">
            <div className="noticeHead">
              <Icon name="alert" size={17} /> Sharing was stopped
            </div>
            <div className="muted mb-s">The owner stopped sharing this trip. This copy stays on your device.</div>
            <button className="btn ghost" onClick={() => s.stopSharing(s.trip.id)}>
              Remove sync
            </button>
          </div>
        ) : null}
        {nudge && !s.session ? (
          <div className="notice info mb note">
            <div className="noticeHead">
              <Icon name="cloud" size={17} /> Keep this trip on all your devices
            </div>
            <div className="row">
              <button
                className="btn"
                onClick={() => {
                  hideNudge();
                  onAccount();
                }}
              >
                Sign in
              </button>
              <button className="btn ghost" onClick={hideNudge}>
                Not now
              </button>
            </div>
          </div>
        ) : null}
        <P s={s} back={back} />
      </div>
    </>
  );
}

function Stats({ s }) {
  const t = s.trip;
  const cells = [
    ['Days', t.days],
    ['Crew', t.crew.length],
    ['Camps set', Object.values(t.plans).filter((p) => p.camp).length],
    ['Vehicles', (t.cars || []).length],
  ];
  return (
    <div className="stats">
      {cells.map(([k, v]) => (
        <div className="stat" key={k}>
          <div className="statNum">{v}</div>
          <div className="statKey">{k}</div>
        </div>
      ))}
    </div>
  );
}

function Itinerary({ s }) {
  const t = s.trip;
  const ramps = ACCESS.filter((p) => p.mile != null);
  const L = ramps.find((p) => p.id === t.launch) || ramps[0];
  const O = ramps.find((p) => p.id === t.out) || ramps[ramps.length - 1];
  return (
    <>
      <div className="muted mb">
        {L ? L.name : 'Launch'} → {O ? O.name : 'take-out'} · {RIVER.name}
      </div>
      <Stats s={s} />
      <div className="card formCard mb">
        <RiverEnd s={s} which="launch" />
        <RiverEnd s={s} which="out" />
      </div>
      <span className="label sectionLabel">Day by day</span>
      {tripDays(t).map((d) => {
        const p = t.plans[d.i] || {};
        const prev = t.plans[d.i - 1] || {};
        const from = d.i === 0 ? RIVER.miles[0] : prev.mile;
        const leg = from != null && p.mile != null ? Math.round((p.mile - from) * 10) / 10 : null;
        const runs = from != null && p.mile != null ? RIVER.rapids.filter((r) => r.mile > from && r.mile <= p.mile) : [];
        const sn = d.date && sun(d.date, RIVER.coords[0], RIVER.coords[1]);
        // canyon sun: the morning at the camp you woke in, the evening at tonight's camp
        const tonight = campOf(p), woke = d.i > 0 ? campOf(prev) : null;
        const am = d.date && campSunOn(woke, d.date), pm = d.date && campSunOn(tonight, d.date);
        const meals = t.meals.filter((m) => m.day === d.i);
        return (
          <Acc
            key={d.i}
            title={d.label}
            note={
              sn || p.camp ? (
                <>
                  {p.camp ? (
                    <span className="accCamp">
                      <Icon name="pin" size={13} /> {p.camp}
                      {leg != null ? ` · ${leg} mi` : ''}
                    </span>
                  ) : null}
                  {sn ? (
                    <SunTimes
                      rise={am ? (am.on ? clock(am.on) : 'no sun') : clock(sn.rise)}
                      set={pm ? (pm.off ? clock(pm.off) : 'no sun') : clock(sn.set)}
                      canyon={!!(am || pm)}
                    />
                  ) : null}
                </>
              ) : null
            }
          >
            <CampPick min={from} current={p.camp} date={d.date} onPick={(c) => s.plan(d.i, { camp: c.name, mile: c.mile })} />
            {d.date && tonight ? <CampSunLine c={tonight} iso={d.date} /> : null}
            {runs.length > 0 && (
              <div className="mt">
                {runs.map((r) => (
                  <div className="line" key={r.name + r.mile}>
                    <span className="mile">{r.mile.toFixed(1)}</span> {r.name}{' '}
                    <span style={{ color: r.diff >= 6 ? '#9c3326' : '#9d9385' }}>{r.diff}</span>
                  </div>
                ))}
              </div>
            )}
            {meals.length > 0 && <div className="line mt">{meals.map((m) => m.name || m.slot).join(' · ')}</div>}
            <Sky t={t} date={d.date} />
            <Field
              area
              className="mt"
              value={p.note ?? ''}
              onChange={(e) => s.plan(d.i, { note: e.target.value })}
              placeholder="Notes"
            />
          </Acc>
        );
      })}
    </>
  );
}

// Sunrise-to-sunrise sky log (stars, planets, moon) from the trip's reference data
function Sky({ t, date }) {
  const ev = ((REFS[t.id] || {}).celestial || []).filter((e) => e[0].startsWith(date));
  if (!ev.length) return null;
  return (
    <Acc title="Sky" note={`${ev.length} events`}>
      {ev.map((e, i) => (
        <div className="line" key={i}>
          <span className="mile">{e[0].slice(11)}</span> {e[1]}
          {e[2] ? ` · ${e[2]}°` : ''}
          {e[3] ? <span className="muted"> {e[3]}</span> : null}
        </div>
      ))}
    </Acc>
  );
}

function CampPick({ min, current, date, onPick }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const hits = useMemo(
    () =>
      RIVER.camps
        .filter((c) => (min == null ? true : c.mile > min))
        .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => a.mile - b.mile)
        .slice(0, 30),
    [q, min]
  );
  if (!open)
    return (
      <button className="btn ghost" onClick={() => setOpen(true)}>
        {current ? 'Change camp' : 'Camp'}
      </button>
    );
  return (
    <div>
      <Field value={q} onChange={(e) => setQ(e.target.value)} placeholder="Camp" autoFocus />
      {hits.map((c) => (
        <button
          className="pick"
          key={c.name + c.mile}
          onClick={() => {
            onPick(c);
            setOpen(false);
            setQ('');
          }}
        >
          <span className="mile">{c.mile.toFixed(1)}</span>
          <span>
            {c.name} <span className="muted">{[c.bank, c.size, sunOff(c, date)].filter((v) => v != null && v !== '').join(' · ')}</span>
          </span>
        </button>
      ))}
      <button className="btn ghost" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}

const CRAFT = {
  raft: { label: 'Raft', cap: 4 },
  cat: { label: 'Cataraft', cap: 2 },
  kayak: { label: 'Whitewater kayak', cap: 1 },
  ik: { label: 'Inflatable kayak', cap: 1 },
  pack: { label: 'Packraft', cap: 1 },
  sup: { label: 'SUP', cap: 1 },
};

const CraftPaths = ({ type }) => (
  <>

    {type === 'raft' || type === 'cat' ? (
      <>
        <path d="M11 2.5h24a4.6 4.6 0 0 1 0 13H11a4.6 4.6 0 0 1 0-13z" />
        <path d="M18 2.5v13M28 2.5v13" />
        <path d="M9 5.5H2M37 12.5h7" />
      </>
    ) : type === 'sup' ? (
      <>
        <path d="M23 3.6c11 0 19 3.1 19 5.4s-8 5.4-19 5.4S4 11.3 4 9s8-5.4 19-5.4z" />
        <path d="M26 6.2l-3 5.6" />
      </>
    ) : (
      <>
        <path d="M23 2.4c9.4 1.6 17.6 4.6 20 6.6-2.4 2-10.6 5-20 6.6C13.6 14 5.4 11 3 9c2.4-2 10.6-5 20-6.6z" />
        {type === 'ik' || type === 'pack' ? <path d="M23 4.6c7 1.2 13.4 3.4 15.4 4.4-2 1-8.4 3.2-15.4 4.4-7-1.2-13.4-3.4-15.4-4.4 2-1 8.4-3.2 15.4-4.4z" /> : <ellipse cx="23" cy="9" rx="4.4" ry="2.6" />}
      </>
    )}
  </>
);

const CraftIcon = ({ type }) => (
  <svg className="carIcon" viewBox="0 0 46 18" aria-hidden="true">
    <CraftPaths type={type} />
  </svg>
);

function Crew({ s }) {
  const t = s.trip;
  const boats = t.boats || [];
  const [open, setOpen] = useState(null);
  const [fresh, setFresh] = useState(null);
  const aboard = (id) => t.crew.filter((m) => m.boat === id);
  const inv = useInvite(s, t);
  const [meId, setMeId] = useState(() => getMe(t.id));

  return (
    <>
      {!(s.sync[t.id] && (s.sync[t.id].removed || s.sync[t.id].role === 'viewer')) ? (
        <button className="btn ghost block mb" disabled={inv.busy} onClick={() => inv.send(false)}>
          <Icon name="users" size={16} /> {inv.busy ? 'Preparing…' : 'Invite people to this trip'}
        </button>
      ) : null}
      {inv.msg ? <div className="muted mb-s">{inv.msg}</div> : null}
      <span className="label mt">Crew</span>
      {t.crew.map((m) => (
        <Acc key={m.id} open={fresh === m.id} lead={<Avatar name={m.name || '?'} />} title={m.name || 'New person'} tag={meId === m.id ? 'You' : undefined} note={[m.role, boats.find((b) => b.id === m.boat)?.name].filter(Boolean).join(' · ') || null}>
          <button
            className="btn ghost mb-s"
            onClick={() => {
              setMeFor(t.id, meId === m.id ? '' : m.id);
              setMeId(meId === m.id ? '' : m.id);
            }}
          >
            {meId === m.id ? "This isn't me" : 'This is me'}
          </button>
          <Field label="Name" value={m.name} autoFocus={fresh === m.id} onChange={(e) => s.patch('crew', m.id, { name: e.target.value })} />
          <Field label="Role" value={m.role} onChange={(e) => s.patch('crew', m.id, { role: e.target.value })} />
          <Sel label="Craft" value={m.boat} onChange={(v) => s.patch('crew', m.id, { boat: v })}>
            <option value="">—</option>
            {boats.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Sel>
          <Field
            label="Days on the river"
            value={m.days ?? ''}
            inputMode="decimal"
            placeholder={String(t.days)}
            onChange={(e) => s.patch('crew', m.id, { days: e.target.value })}
          />
          <Field label="Emergency contact" value={m.ice} onChange={(e) => s.patch('crew', m.id, { ice: e.target.value })} />
          <Field label="Diet / meds" value={m.diet} onChange={(e) => s.patch('crew', m.id, { diet: e.target.value })} />
          <button className="btn ghost danger" onClick={() => s.drop('crew', m.id)}>
            Remove
          </button>
        </Acc>
      ))}
      <button
        className="btn ghost mt-s"
        onClick={() => {
          const id = uid();
          s.push('crew', { id, name: '', role: '', boat: '', ice: '', diet: '', days: '' });
          setFresh(id);
        }}
      >
        Add person
      </button>

      <span className="label mt">Crafts</span>
      {boats.map((b) => {
        const on = aboard(b.id);
        const cap = num(b.cap);
        return (
          <div className={'grItem' + (open === b.id ? ' open' : '')} key={b.id}>
            <button className="car" onClick={() => setOpen(open === b.id ? null : b.id)}>
              <span className="carIconWrap">
                <CraftIcon type={b.type} />
              </span>
              <span className="carText">
                <span className="carName">{b.name || 'New craft'}</span>
                <span className="muted">
                  {CRAFT[b.type]?.label || 'Craft'}
                  {on.length ? ` · ${on.map((m) => m.name).join(', ')}` : ''}
                </span>
              </span>
              <span className={'grAmt' + (cap && on.length > cap ? ' over' : '')}>{cap ? `${on.length}/${cap}` : on.length || ''}</span>
            </button>
            {open === b.id && (
              <div className="grBody">
                <Field label="Name" value={b.name} autoFocus={fresh === b.id} onChange={(e) => s.patch('boats', b.id, { name: e.target.value })} />
                <span className="label">Type</span>
                <div className="chips">
                  {Object.entries(CRAFT).map(([k, v]) => (
                    <button
                      key={k}
                      className={'chip' + (b.type === k ? ' on' : '')}
                      onClick={() => s.patch('boats', b.id, { type: k, cap: !num(b.cap) || num(b.cap) === CRAFT[b.type]?.cap ? v.cap : b.cap })}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
                <div className="numRow">
                  <Num label="Capacity" value={b.cap} onChange={(v) => s.patch('boats', b.id, { cap: v })} />
                </div>
                {cap && on.length > cap ? <div className="warn">{on.length} on a {cap}-person craft.</div> : null}
                <button className="btn ghost danger mt-s" onClick={() => s.drop('boats', b.id)}>
                  Remove
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button
        className="btn ghost mt-s"
        onClick={() => {
          const id = uid();
          s.push('boats', { id, name: '', type: 'raft', cap: CRAFT.raft.cap });
          setFresh(id);
          setOpen(id);
        }}
      >
        Add craft
      </button>
    </>
  );
}

function Meals({ s }) {
  const [shop, setShop] = useState(false);
  const t = s.trip;
  const list = useMemo(() => {
    const m = new Map();
    t.meals.forEach((x) =>
      (x.items || '')
        .split('\n')
        .map((v) => v.trim())
        .filter(Boolean)
        .forEach((v) => m.set(v.toLowerCase(), v))
    );
    return [...m.values()].sort();
  }, [t.meals]);

  if (shop)
    return (
      <>
        <button className="btn ghost" onClick={() => setShop(false)}>
          ← Menu
        </button>
        <div className="mt">
          {list.length ? list.map((x) => <div className="shop" key={x}>{x}</div>) : <div className="muted">Nothing listed yet.</div>}
        </div>
      </>
    );

  return (
    <>
      <button className="btn ghost" onClick={() => setShop(true)}>
        Shopping list ({list.length})
      </button>
      <div className="mt" />
      {tripDays(t).map((d) => {
        const meals = t.meals.filter((m) => m.day === d.i);
        return (
          <Acc key={d.i} title={d.label} note={meals.map((m) => m.name).filter(Boolean).join(' · ') || null}>
            {SLOTS.map((slot) => {
              const m = meals.find((x) => x.slot === slot);
              if (!m)
                return (
                  <button className="addSlot" key={slot} onClick={() => s.push('meals', { day: d.i, slot, name: '', cook: '', items: '' })}>
                    + {slot}
                  </button>
                );
              return (
                <div className="mealBlock" key={slot}>
                  <span className="label">{slot}</span>
                  <Field label="Dish" value={m.name} onChange={(e) => s.patch('meals', m.id, { name: e.target.value })} placeholder="Dish" />
                  <span className="label">Cook</span>
                  <div className="chips scroll">
                    {t.crew.map((c) => (
                      <button
                        key={c.id}
                        className={'chip' + (m.cook === c.id ? ' on' : '')}
                        onClick={() => s.patch('meals', m.id, { cook: m.cook === c.id ? '' : c.id })}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                  <Field
                    area
                    label="Shopping items (one per line)"
                    value={m.items}
                    onChange={(e) => s.patch('meals', m.id, { items: e.target.value })}
                    placeholder={'3 lb ground beef\n2 onions'}
                  />
                  <button className="btn ghost danger" onClick={() => s.drop('meals', m.id)}>
                    Remove
                  </button>
                </div>
              );
            })}
          </Acc>
        );
      })}
    </>
  );
}

const SPLITS = { even: 'Even split', nights: 'By nights on river', users: 'Shared by users', personal: 'Individual' };
const SPLIT_HELP = {
  even: 'Everyone pays the same, however long they’re on the river.',
  nights: 'Pay for the nights you’re on the river. Someone aboard 10 of the group’s 40 total nights pays 10/40 (25%) of the cost. Good for things used every day, like the kitchen.',
  users: 'Shared items the group needs (set how many). Paid only by people who enter a Need, in proportion to how many each needs.',
  personal: 'Everyone rents their own, like a PFD. Paid only by people who enter a Need, in proportion to how many each needs.',
};
const REQ = { req: ['Required', '#9c3326'], rec: ['Recommended', '#a8722a'], maybe: ['Maybe', '#6b6154'] };
const usd = (n) => (n >= 0.005 ? '$' + n.toFixed(2) : '');
const usd0 = (n) => '$' + Math.round(n).toLocaleString();
const num = (v) => (Number.isFinite(+v) ? +v : 0);

const norm = (g) => ({
  name: g.n ?? g.name ?? '',
  cat: g.c ?? g.cat ?? 'Gear',
  split: g.s || 'personal',
  req: g.r || '',
  flat: num(g.f),
  day: num(g.d),
  qty: num(g.q),
  e: g.e || {},
});

function ledger(t) {
  const D = Math.max(1, num(t.days) || 1);
  const crew = t.crew;
  const span = (c) => (okDate(c.onDate) && okDate(c.offDate) ? Math.round((new Date(c.offDate + 'T12:00:00Z') - new Date(c.onDate + 'T12:00:00Z')) / 864e5) : 0);
  const nights = (c) => (num(c.days) > 0 ? num(c.days) : span(c) > 0 ? span(c) : D);
  const allNights = crew.reduce((a, c) => a + nights(c), 0);
  const items = (t.gear || []).map((g) => {
    const it = norm(g);
    const unit = Math.max(it.flat, it.day * D);
    let have = 0,
      need = 0,
      lend = 0,
      net = 0;
    const own = {};
    crew.forEach((c) => {
      const e = it.e[c.id] || {};
      // what a person brings for themselves only covers what they need
      own[c.id] = Math.min(num(e.have), num(e.need));
      have += own[c.id];
      need += num(e.need);
      net += num(e.need) - own[c.id];
      lend += num(e.lend);
    });
    const target = it.split === 'personal' ? need : it.qty || need;
    const rent = Math.max(0, target - have - lend);
    const total = unit * rent;
    const share = {};
    crew.forEach((c) => {
      const e = it.e[c.id] || {};
      const v =
        it.split === 'even'
          ? crew.length
            ? total / crew.length
            : 0
          : it.split === 'nights'
            ? allNights
              ? (total * nights(c)) / allNights
              : 0
            : net
              ? (total * (num(e.need) - own[c.id])) / net
              : 0;
      if (v) share[c.id] = v;
    });
    const assigned = Object.values(share).reduce((a, b) => a + b, 0);
    return { id: g.id, raw: g, ...it, unit, have, need, lend, target, rent, total, share, loose: total - assigned };
  });
  const by = {};
  crew.forEach((c) => (by[c.id] = { even: 0, nights: 0, users: 0, personal: 0, total: 0, nightsCount: nights(c) }));
  let total = 0,
    loose = 0;
  items.forEach((it) => {
    total += it.total;
    loose += it.loose;
    crew.forEach((c) => {
      const v = it.share[c.id] || 0;
      by[c.id][it.split] += v;
      by[c.id].total += v;
    });
  });
  return { items, by, total, loose, allNights, days: D };
}

const TIPS = {
  need: 'How many you will personally use on the trip, e.g. 1 for a PFD. Enter 0 if you don’t need it.',
  have: 'How many of your own you can bring for yourself. You aren’t charged for these.',
  group: 'Total the group needs. Calculated from everyone’s “I need”. Type a number to override it.',
  lend: 'Extra ones you can bring for others to use. Each one lent means one fewer rented.',
  price: 'Rental cost of one item. A flat fee is charged once; a per-day price is multiplied by the trip’s days. The larger of the two is used.',
  split: Object.entries(SPLIT_HELP).map(([k, v]) => SPLITS[k] + ': ' + v).join('\n'),
};
function useTip() {
  const [tip, setTip] = useState('');
  const btn = (k) => (
    <button type="button" className="tipBtn" aria-label="More info" aria-expanded={tip === k} onClick={() => setTip(tip === k ? '' : k)}>
      i
    </button>
  );
  const box = (...ks) => (ks.includes(tip) ? <div className="tipTxt">{TIPS[tip]}</div> : null);
  return { btn, box };
}

const Num = ({ label, value, onChange, usd: money, hint }) => (
  <label className={'num' + (money ? ' usd' : '')}>
    <span className="numKey">{label}</span>
    <span className="numBox">
      {money ? <span className="numPre">$</span> : null}
      <input inputMode="decimal" value={value ?? ''} placeholder={hint || (money ? '0.00' : '0')} onChange={(e) => onChange(e.target.value)} />
    </span>
  </label>
);

// the same fields for every item, whether it is being added or edited
function GearFields({ v, up, days, cats, T }) {
  const unit = Math.max(num(v.f), num(v.d) * days);
  return (
    <>
      <Field label="Item" value={v.n} onChange={(e) => up('n', e.target.value)} />
      <Field label="Category" value={v.c} onChange={(e) => up('c', e.target.value)} placeholder="Kitchen" list="gearCats" />
      <datalist id="gearCats">{(cats || []).map((c) => <option key={c} value={c} />)}</datalist>
      <span className="label">How it’s billed {T.btn('split')}</span>
      {T.box('split')}
      <div className="chips">
        {Object.entries(SPLITS).map(([k, l]) => (
          <button key={k} className={'chip' + (v.s === k ? ' on' : '')} onClick={() => up('s', k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="muted mb">{SPLIT_HELP[v.s]}</div>
      <span className="label">Rental price per item {T.btn('price')}</span>
      {T.box('price')}
      <div className="numRow">
        <Num usd label="Flat fee" value={v.f} onChange={(x) => up('f', x)} />
        <Num usd label="Per day" value={v.d} onChange={(x) => up('d', x)} />
        </div>
      {v.s !== 'personal' && (
        <>
          <span className="label">Group total (leave blank to add up everyone’s needs) {T.btn('group')}</span>
          {T.box('group')}
          <div className="numRow">
            <Num label="Total" value={v.q} onChange={(x) => up('q', x)} hint={v.qHint} />
          </div>
        </>
      )}
      <div className="muted mb">
        {unit > 0
          ? `Each item costs ${usd(unit)} for ${days} days.`
          : 'No price set: this item costs nothing.'}
      </div>
      <span className="label">Priority</span>
      <div className="chips">
        {[['', 'None'], ...Object.entries(REQ).map(([k, r]) => [k, r[0]])].map(([k, l]) => (
          <button key={k} className={'chip' + ((v.r || '') === k ? ' on' : '')} onClick={() => up('r', k)}>
            {l}
          </button>
        ))}
      </div>
    </>
  );
}

function Gear({ s }) {
  const t = s.trip;
  const [me, setMeState] = useState(() => getMe(s.trip.id));
  const setMe = (id) => {
    setMeState(id);
    setMeFor(s.trip.id, id);
    setAs('');
    setOther(false);
  };
  // entering for someone else is a separate, temporary mode
  const [as, setAs] = useState('');
  const [other, setOther] = useState(false);
  const [cat, setCat] = useState('All');
  const [find, setFind] = useState('');
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const L = useMemo(() => ledger(t), [t]);

  if (!t.gear.length)
    return (
      <>
        <button className="btn" onClick={() => s.set({ gear: GEAR.map((g) => ({ id: uid(), ...g, e: {} })) })}>
          Load gear catalog ({GEAR.length})
        </button>
        <div className="muted mt">Or add items one at a time.</div>
        <AddGear s={s} days={L.days} cats={[]} onDone={() => {}} />
        <GearRef />
      </>
    );

  const cats = [...new Set(L.items.map((i) => i.cat))];
  const q = find.trim().toLowerCase();
  const who = as || me;
  const whoName = (t.crew.find((c) => c.id === who) || {}).name || '';
  const mineOf = (i) => {
    const e = i.e[who] || {};
    return !!(i.share[who] || num(e.have) || num(e.need) || num(e.lend));
  };
  const shown = L.items.filter(
    (i) => (cat === 'All' || (cat === 'Mine' ? who && mineOf(i) : i.cat === cat)) && (!q || i.name.toLowerCase().includes(q))
  );
  const mine = who ? L.by[who] : null;

  return (
    <>
      {t.crew.length === 0 ? (
        <div className="muted mb">Add crew on the Crew tab to split costs.</div>
      ) : (
        <>
          <span className="label">{me ? 'You' : 'Who are you? Pick your name to enter your gear'}</span>
          <div className="chips scroll">
            {t.crew.map((c) => (
              <button key={c.id} className={'chip' + (me === c.id ? ' on' : '')} onClick={() => setMe(me === c.id ? '' : c.id)}>
                {c.name}
              </button>
            ))}
          </div>
          {as ? (
            <div className="gasBanner">
              <span>Entering for {whoName}</span>
              <button className="btn ghost" onClick={() => setAs('')}>
                Back to me
              </button>
            </div>
          ) : me && t.crew.length > 1 ? (
            other ? (
              <>
                <span className="label">Enter for someone else</span>
                <div className="chips scroll">
                  {t.crew
                    .filter((c) => c.id !== me)
                    .map((c) => (
                      <button key={c.id} className="chip" onClick={() => (setAs(c.id), setOther(false))}>
                        {c.name}
                      </button>
                    ))}
                </div>
              </>
            ) : (
              <button className="linkBtn" onClick={() => setOther(true)}>
                Enter for someone else
              </button>
            )
          ) : null}
        </>
      )}

      <div className="stats mt">
        <div className="stat">
          <div className="statNum">{usd0(L.total)}</div>
          <div className="statKey">Trip gear cost</div>
        </div>
        <div className="stat">
          <div className="statNum">{mine ? usd0(mine.total) : '—'}</div>
          <div className="statKey">{mine ? (as ? `${whoName}’s share` : 'Your share') : 'Pick your name'}</div>
        </div>
      </div>
      {mine && (
        <div className="muted mb">
          {as ? `${whoName}’s share` : 'Your share'}: {usd0(mine.even)} even split · {usd0(mine.nights)} by nights on river · {usd0(mine.users)} shared by users · {usd0(mine.personal)} individual
        </div>
      )}
      <GearCover L={L} />
      {who && <GearPack L={L} me={who} you={!as} name={whoName} tripId={t.id} />}

      <div className="row">
        <Field value={find} onChange={(e) => setFind(e.target.value)} placeholder={`Search ${L.items.length} items`} />
        <button className="btn ghost" onClick={() => setAdding(!adding)}>
          {adding ? 'Close' : 'Add item'}
        </button>
      </div>
      {adding && <AddGear s={s} days={L.days} cats={cats} onDone={() => setAdding(false)} />}
      <div className="chips scroll">
        {['All', ...(who ? ['Mine'] : []), ...cats].map((c) => (
          <button key={c} className={'chip' + (cat === c ? ' on river' : '')} onClick={() => setCat(c)}>
            {c === 'Mine' ? (as ? `${whoName}’s items` : 'My items') : c}
          </button>
        ))}
      </div>
      {shown.length === 0 && <div className="muted mt">Nothing matches.</div>}
      {shown.map((it) => (
        <GearRow key={it.id} it={it} s={s} crew={t.crew} days={L.days} cats={cats} me={who} name={whoName} you={!as} open={open === it.id} onOpen={() => setOpen(open === it.id ? null : it.id)} />
      ))}
      <GearRef />
    </>
  );
}

const COVER = [
  ['own', 'Own', 'var(--ok, #2f7d4f)'],
  ['borrow', 'Borrowed', 'var(--accent, #2b6cb0)'],
  ['rent', 'Rented', 'var(--warn, #c98a1b)'],
  ['none', 'Nobody has it', 'var(--bad, #b83b3b)'],
];
function GearCover({ L }) {
  const n = { own: 0, borrow: 0, rent: 0, none: 0 };
  L.items.forEach((i) => {
    if (i.target <= 0) return;
    n[i.rent > 0.005 ? (i.unit > 0 ? 'rent' : 'none') : i.lend > 0 ? 'borrow' : 'own']++;
  });
  const sum = n.own + n.borrow + n.rent + n.none;
  if (!sum) return null;
  return (
    <div className="gcov mb">
      <div className="gcovBar" role="img" aria-label={COVER.map(([k, l]) => `${n[k]} ${l}`).join(', ')}>
        {COVER.map(([k, , c]) => n[k] > 0 && <span key={k} style={{ flex: n[k], background: c }} />)}
      </div>
      <div className="gcovKey">
        {COVER.map(([k, l, c]) => (
          <span key={k}>
            <i style={{ background: c }} />
            {n[k]} {l}
          </span>
        ))}
      </div>
    </div>
  );
}

// packed ticks are a note on this device, like "who are you"
const packKey = (tripId) => 'eddy.packed.' + tripId;
const getPacked = (tripId) => {
  try {
    return JSON.parse(localStorage.getItem(packKey(tripId)) || '{}') || {};
  } catch {
    return {};
  }
};
function GearPack({ L, me, you, name, tripId }) {
  const [done, setDone] = useState(() => getPacked(tripId));
  const flip = (k) => {
    const next = { ...done, [k]: !done[k] };
    if (!next[k]) delete next[k];
    setDone(next);
    try {
      localStorage.setItem(packKey(tripId), JSON.stringify(next));
    } catch {}
  };
  const groups = [
    [you ? 'Bringing my own' : 'Bringing their own', 'own', (i) => Math.min(num((i.e[me] || {}).have), num((i.e[me] || {}).need))],
    ['Bringing to lend', 'lend', (i) => num((i.e[me] || {}).lend)],
    ['Renting', 'rent', (i) => (i.share[me] > 0.005 ? i.share[me] : 0)],
  ].map(([title, kind, f]) => ({ title, kind, rows: L.items.map((i) => ({ i, v: f(i) })).filter((r) => r.v > 0) }));
  const bring = groups.slice(0, 2).flatMap((g) => g.rows.map((r) => g.kind + r.i.id));
  const packed = bring.filter((k) => done[k]).length;
  if (!groups.some((g) => g.rows.length)) return null;
  return (
    <div className="gpack mb">
      <span className="label">
        {you ? 'Your list' : `${name}’s list`}{bring.length ? ` · ${packed} of ${bring.length} packed` : ''}
      </span>
      {groups.map(
        (g) =>
          g.rows.length > 0 && (
            <details key={g.kind} open={g.kind !== 'rent'}>
              <summary className="gpackHead">
                {g.title} <span className="muted">{g.rows.length}</span>
              </summary>
              {g.rows.map(({ i, v }) =>
                g.kind === 'rent' ? (
                  <div className="gpackRow" key={i.id}>
                    <span className="gpackName">{i.name}</span>
                    <span className="grAmt">{usd(v)}</span>
                  </div>
                ) : (
                  <label className={'gpackRow' + (done[g.kind + i.id] ? ' done' : '')} key={i.id}>
                    <input type="checkbox" checked={!!done[g.kind + i.id]} onChange={() => flip(g.kind + i.id)} />
                    <span className="gpackName">{i.name}</span>
                    {v !== 1 && <span className="muted">×{+v.toFixed(2)}</span>}
                  </label>
                )
              )}
            </details>
          )
      )}
    </div>
  );
}

const Step = ({ label, hint, value, onChange }) => {
  const n = num(value);
  const set = (x) => onChange(x > 0 ? String(+x.toFixed(2)) : '');
  return (
    <div className="step">
      <span className="stepText">
        <span className="stepLabel">{label}</span>
        <span className="muted">{hint}</span>
      </span>
      <span className="stepCtl">
        <button type="button" className="stepBtn" aria-label={`Less ${label}`} disabled={n <= 0} onClick={() => set(n - 1)}>
          −
        </button>
        <input inputMode="decimal" aria-label={label} placeholder="0" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="stepBtn" aria-label={`More ${label}`} onClick={() => set(n + 1)}>
          +
        </button>
      </span>
    </div>
  );
};

// one line that says where the items come from
function gearStatus(it) {
  if (it.target <= 0) return { text: 'No one needs it yet', k: 'idle' };
  if (it.rent > 0.005) return it.unit > 0 ? { text: `Renting ${+it.rent.toFixed(2)} · ${usd(it.total)}`, k: 'rent' } : { text: `${+it.rent.toFixed(2)} short · nobody has it`, k: 'none' };
  return it.lend > 0 ? { text: 'Covered with borrowed', k: 'borrow' } : { text: 'Covered', k: 'own' };
}

function GearRow({ it, s, crew, days, cats, me, name, you, open, onOpen }) {
  const T = useTip();
  const mine = it.share[me] || 0;
  const tag = REQ[it.req];
  const st = gearStatus(it);
  const patch = (o) => s.patch('gear', it.id, o);
  const e = it.e[me] || {};
  const setE = (k, v) => patch({ e: { ...it.e, [me]: { ...(it.e[me] || {}), [k]: v } } });
  // the form reads and writes the short stored keys
  const v = { n: it.name, c: it.cat, s: it.split, r: it.req, f: it.raw.f, d: it.raw.d, q: it.raw.q, qHint: it.split === 'personal' ? '' : String(+it.need.toFixed(2)) };
    const need = num(e.need),
    have = num(e.have),
    lend = num(e.lend);
  const left = Math.max(0, need - Math.min(have, need));
  const parts = [
    [Math.min(have, need), 'own', 'Own'],
    [it.lend, 'borrow', 'Lent'],
    [it.rent, it.unit > 0 ? 'rent' : 'none', it.unit > 0 ? 'Rented' : 'Short'],
  ];
  const others = crew.filter((c) => c.id !== me && ['need', 'have', 'lend'].some((k) => num((it.e[c.id] || {})[k])));
  return (
    <div className={'grItem' + (open ? ' open' : '')}>
      <button className="grHead" onClick={onOpen}>
        <span className="grText">
          <span className="grName">{it.name}</span>
          <span className="muted">
            {it.target > 0 ? `Group needs ${+it.target.toFixed(2)} · ` : ''}
            {st.text}
          </span>
        </span>
        {tag && !open ? <Tag label={tag[0]} tint={tag[1]} /> : null}
        <span className="grAmt">{mine ? usd(mine) : ''}</span>
      </button>
      {open && (
        <div className="grBody">
          {crew.length === 0 ? (
            <div className="muted">Add crew on the Crew tab first.</div>
          ) : !me ? (
            <div className="muted">Pick your name above to enter your numbers.</div>
          ) : (
            <>
              <span className="label">{you ? 'Your part' : `${name}’s part`}</span>
              <Step label={you ? 'I need' : `${name} needs`} hint="How many will be used on the trip" value={e.need} onChange={(x) => setE('need', x)} />
              <Step label={you ? 'Bringing my own' : 'Bringing own'} hint="Own ones, so no rental charge" value={e.have} onChange={(x) => setE('have', x)} />
              <Step label="Can lend" hint="Extras for others to use" value={e.lend} onChange={(x) => setE('lend', x)} />
              {have > need && <div className="gwarn">Only {+need.toFixed(2)} of the {+have.toFixed(2)} count: the rest is spare. Use “Can lend” for extras.</div>}
              {need > 0 && left > 0 && (
                <div className="muted mb-s">
                  {+left.toFixed(2)} still to come from lenders or rental{mine ? ` · ${usd(mine)} for ${you ? 'you' : name}` : ''}
                </div>
              )}
            </>
          )}

          {it.target > 0 && (
            <div className="gsum">
              <div className="gsumHead">Group needs {+it.target.toFixed(2)}</div>
              <div className="gcovBar">
                {parts.map(([n, k], i) => n > 0.005 && <span key={i} style={{ flex: n, background: COVER.find((c) => c[0] === k)[2] }} />)}
              </div>
              <div className="gcovKey">
                {parts.map(([n, k, l], i) => n > 0.005 && (
                  <span key={i}>
                    <i style={{ background: COVER.find((c) => c[0] === k)[2] }} />
                    {+n.toFixed(2)} {l}
                  </span>
                ))}
                {it.total > 0 && <span className="gsumCost">{usd(it.total)} total</span>}
              </div>
            </div>
          )}
          {it.loose > 0.005 && <div className="muted">{usd(it.loose)} not yet billed to anyone: nobody has entered a need.</div>}

          {others.length > 0 && (
            <details className="gdet">
              <summary>Everyone’s numbers</summary>
              {others.map((c) => {
                const x = it.e[c.id] || {};
                return (
                  <div className="gother" key={c.id}>
                    <span className="gcName">{c.name}</span>
                    <span className="muted">
                      needs {+num(x.need).toFixed(2)} · own {+Math.min(num(x.have), num(x.need)).toFixed(2)} · lends {+num(x.lend).toFixed(2)}
                    </span>
                    <span className="gcAmt">{it.share[c.id] ? usd(it.share[c.id]) : ''}</span>
                  </div>
                );
              })}
            </details>
          )}

          <details className="gdet">
            <summary>Edit item</summary>
            <GearFields v={v} up={(k, x) => patch({ [k]: x })} days={days} cats={cats} T={T} />
            <Field area label="Note" value={it.raw.note || ''} onChange={(ev) => patch({ note: ev.target.value })} placeholder="Where to rent it, sizes, who’s bringing it…" />
            <button className="btn ghost danger mt-s" onClick={() => s.drop('gear', it.id)}>
              Remove item
            </button>
          </details>
        </div>
      )}
    </div>
  );
}

function AddGear({ s, days, cats, onDone }) {
  const [f, setF] = useState({ n: '', c: '', s: 'personal', f: '', d: '', q: '', r: '' });
  const T = useTip();
  const up = (k, v) => setF({ ...f, [k]: v });
  return (
    <div className="card mt mb">
      <GearFields v={f} up={up} days={days} cats={cats} T={T} />
      <button
        className="btn"
        disabled={!f.n.trim()}
        onClick={() => {
          s.push('gear', { n: f.n.trim(), c: f.c.trim() || 'Gear', s: f.s, r: f.r, f: num(f.f), d: num(f.d), q: num(f.q), e: {} });
          setF({ n: '', c: f.c, s: f.s, f: '', d: '', q: '', r: '' });
          onDone();
        }}
      >
        Add item
      </button>
    </div>
  );
}

const emile = (p) => (p && p.mile != null ? +p.mile : p && p.toMile != null ? +p.toMile : -1);
const TRACK = ['#7a3b28', '#2f5d62', '#a8722a', '#6b6154', '#95331a', '#4a6b3a', '#8a5a9c'];
const dnum = (iso, from) => (okDate(iso) && okDate(from) ? Math.round((new Date(iso + 'T12:00:00Z') - new Date(from + 'T12:00:00Z')) / 864e5) : 0);
const short = (n, k = 13) => (n.length > k ? n.slice(0, k - 1) + '…' : n);

const CarPaths = ({ trailer }) => (
  <>
    <path d="M2 12h22M4.5 12a2.2 2.2 0 1 0 4.4 0 2.2 2.2 0 1 0-4.4 0M17 12a2.2 2.2 0 1 0 4.4 0 2.2 2.2 0 1 0-4.4 0" />
    <path d="M2 12V8.2c0-.7.5-1.2 1.2-1.2h2.4l2.6-3c.4-.5 1-.8 1.7-.8h5.3c.7 0 1.3.3 1.7.9L20 7h3c.7 0 1.2.5 1.2 1.2V12" />
    <path d="M9.6 7h4.8" />
    {trailer ? <path d="M24.2 10h2.6M28 12.8V6.6c0-.5.4-.9.9-.9h12.5c.5 0 .9.4.9.9v6.2zM31 12.8a2 2 0 1 0 4 0 2 2 0 1 0-4 0M28 12.8h14.3" /> : null}
</>
);

const CarIcon = ({ trailer }) => (
  <svg className="carIcon" viewBox="0 0 46 18" aria-hidden="true">
    <g transform="translate(44.3 0) scale(-1 1)">
      <CarPaths trailer={trailer} />
    </g>
  </svg>
);

const Sel = ({ label, value, onChange, children }) => (
  <label className="field">
    {label ? <span className="label">{label}</span> : null}
    <select className="sel" value={value || ''} onChange={(e) => onChange(e.target.value)}>
      {children}
    </select>
  </label>
);

const hm = (h) => {
  if (h == null) return '';
  const m = Math.round(h * 60);
  return [Math.floor(m / 60) ? Math.floor(m / 60) + 'h' : '', m % 60 ? (m % 60) + 'm' : ''].filter(Boolean).join(' ') || '0m';
};
const DRIVERS = { _shuttle: 'Shuttle service', _outfitter: 'Outfitter' };
const proLeg = ({ pro, par, ...l }) => (pro && !(l.who || []).includes('_shuttle') ? { ...l, who: [...(l.who || []), '_shuttle'] } : l);
const legsOf = (t) => {
  if (t.legs) return t.legs.map(proLeg);
  const out = [];
  (t.cars || []).forEach((c, ci) => {
    const k = {};
    (c.legs || []).forEach((l) => out.push({ ...l, car: c.id, _o: (k[l.date] = (k[l.date] || 0) + 1), _c: ci }));
  });
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a._o - b._o || a._c - b._c));
  return out.map(({ _o, _c, ...l }) => proLeg(l));
};

const GKEY = 'AIzaSyBWQyTYB2A3TX_UXoGi0PPjL5v6DS2b7Zo';
const GMAP = '16a2826c937f300a946cdc4d';
const DAY0 = 7 / 24;
const RKEY = 'eddy.routes.v1';
let routes = {};
try {
  routes = JSON.parse(localStorage.getItem(RKEY) || '{}') || {};
} catch {
  routes = {};
}
const keepRoutes = () => {
  try {
    localStorage.setItem(RKEY, JSON.stringify(routes));
  } catch {
    /* storage full: routes are fetched again next time */
  }
};

let gm = null;
const gmaps = () =>
  (gm ||= new Promise((ok, no) => {
    if (window.google?.maps?.importLibrary) return ok(window.google.maps);
    window.__eddyMaps = () => ok(window.google.maps);
    const el = document.createElement('script');
    el.src = `https://maps.googleapis.com/maps/api/js?key=${GKEY}&v=weekly&loading=async&callback=__eddyMaps`;
    el.async = true;
    el.onerror = () => ((gm = null), no(new Error('maps')));
    document.head.appendChild(el);
  }));

function unpoly(s) {
  const out = [];
  let i = 0,
    la = 0,
    lo = 0;
  while (i < s.length) {
    const v = [0, 0];
    for (let k = 0; k < 2; k++) {
      let r = 0,
        sh = 0,
        b;
      do {
        b = s.charCodeAt(i++) - 63;
        r |= (b & 31) << sh;
        sh += 5;
      } while (b >= 32);
      v[k] = r & 1 ? ~(r >> 1) : r >> 1;
    }
    la += v[0];
    lo += v[1];
    out.push([la / 1e5, lo / 1e5]);
  }
  return out;
}
const flat = (a, b) => Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos((a[0] * Math.PI) / 180));
const along = (g, d) => {
  const dd = Math.max(0, Math.min(g.len, d));
  let i = 1;
  while (i < g.pts.length - 1 && g.cum[i] < dd) i++;
  const a = g.pts[i - 1],
    b = g.pts[i] || a;
  const f = (dd - g.cum[i - 1]) / (g.cum[i] - g.cum[i - 1] || 1);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
};
const ease = (f) => f * f * (3 - 2 * f);

function spot(t, p) {
  if (!p) return null;
  const pin = t.pins?.[p.id];
  const key = (ll) => ll.map((x) => (+x).toFixed(5)).join(',');
  if (pin) return { ll: pin, k: key(pin) };
  const addr = (t.addrs?.[p.id] || '').trim();
  if (addr) return { q: addr, k: addr.toLowerCase() };
  if (p.mile != null && hasGeo(RIVER.id)) {
    const q = position(RIVER.id, 'access', p);
    if (q) return { ll: [q.lat, q.lon], k: key([q.lat, q.lon]) };
  }
  if (p.yard) return null;
  const q = p.fixed && RIVER.state ? `${p.name}, ${RIVER.state}` : p.name;
  return q ? { q, k: q.toLowerCase() } : null;
}
const hop = (A, B) => {
  if (!A || !B) return null;
  const f = routes[A.k + '>' + B.k];
  if (f) return f;
  const r = routes[B.k + '>' + A.k];
  return r && !r.none ? { ...r, rev: true, a: r.b, b: r.a } : r || null;
};
const wp = (A) => (A.ll ? { location: { latLng: { latitude: +A.ll[0], longitude: +A.ll[1] } } } : { address: A.q });
async function fetchRoute(A, B) {
  const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GKEY,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.startLocation,routes.legs.endLocation',
    },
    body: JSON.stringify({ origin: wp(A), destination: wp(B), travelMode: 'DRIVE' }),
  });
  if (r.status === 400 || r.status === 404) return { none: 1 };
  if (!r.ok) throw new Error('routes ' + r.status);
  const x = (await r.json()).routes?.[0];
  if (!x) return { none: 1 };
  const ll = (l) => (l?.latLng ? [l.latLng.latitude, l.latLng.longitude] : null);
  const L = x.legs || [];
  return { s: parseInt(x.duration, 10) || 0, m: x.distanceMeters || 0, p: x.polyline?.encodedPolyline || '', a: ll(L[0]?.startLocation), b: ll(L[L.length - 1]?.endLocation) };
}

function useRoutes(S, done, retry) {
  const [err, setErr] = useState(false);
  const need = {};
  S.legs.forEach((l) => {
    const A = S.sp(l.from),
      B = S.sp(l.to);
    if (A && B && A.k !== B.k && !hop(A, B)) need[A.k + '>' + B.k] = [A, B];
  });
  const key = Object.keys(need).sort().join('|');
  useEffect(() => {
    if (!key) return;
    let live = true;
    Promise.allSettled(Object.entries(need).map(([k, [A, B]]) => fetchRoute(A, B).then((r) => (routes[k] = r)))).then((res) => {
      keepRoutes();
      if (!live) return;
      setErr(res.some((x) => x.status === 'rejected'));
      done();
    });
    return () => {
      live = false;
    };
  }, [key, retry]);
  return err;
}

const gcache = new Map();

function story(t) {
  const start = okDate(t.start) ? t.start : today();
  const N = num(t.days) || 1;
  const acc = ACCESS;
  const user = (t.places || []).filter((p) => !acc.some((a) => a.name === p.name));
  const places = [...acc, ...user, YARD];
  const byId = {};
  places.forEach((p) => (byId[p.id] = p));
  const byName = {};
  places.forEach((p) => (byName[p.name] = p.id));
  const alias = {};
  (t.places || []).forEach((p) => (byId[p.id] ? null : (alias[p.id] = byName[p.name])));
  const fix = (id) => (byId[id] ? id : alias[id] || id);

  const sp = (id) => spot(t, byId[fix(id)]);
  const drive = (a, b) => {
    const A = sp(a),
      B = sp(b);
    return A && B && A.k === B.k ? { s: 0, m: 0 } : hop(A, B);
  };
  const hrs = (a, b) => {
    const r = drive(a, b);
    return r && !r.none && r.s != null ? r.s / 3600 : null;
  };
  const path = (a, b) => {
    const A = sp(a),
      B = sp(b);
    if (!A || !B) return null;
    const k = A.k + '>' + B.k;
    if (gcache.has(k)) return gcache.get(k);
    const r = hop(A, B);
    if (!r || r.none || !r.p) return null;
    const pts = unpoly(r.p);
    if (r.rev) pts.reverse();
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + flat(pts[i - 1], pts[i]));
    const g = { pts, cum, len: cum[cum.length - 1] };
    gcache.set(k, g);
    return g;
  };
  const where = {};
  Object.entries(routes).forEach(([k, r]) => {
    if (r.none) return;
    const [a, b] = k.split('>');
    if (r.a) where[a] = r.a;
    if (r.b) where[b] = r.b;
  });
  const ll = (id) => {
    const p = sp(id);
    return p ? p.ll || where[p.k] || null : null;
  };
  const zoneAt = (id) => placeZone(t, byId[fix(id)]);

  const dates = [];
  for (let d = -2; d <= N + 2; d++) dates.push(addDays(start, d));
  const T = (iso) => dnum(iso, start);
  const cars = (t.cars || []).map((c, i) => ({ ...c, tint: TRACK[i % TRACK.length] }));

  const launch = byId[t.launch] || acc.find((p) => p.mile != null);
  const out = byId[t.out] || [...acc.filter((p) => p.mile != null)].pop();
  const onD = (m) => (okDate(m.onDate) ? T(m.onDate) : 0);
  const offD = (m) => (okDate(m.offDate) ? T(m.offDate) : N);
  const onP = (m) => fix(m.on) || launch?.id;
  const offP = (m) => fix(m.off) || out?.id;

  const byDay = {};
  legsOf(t).forEach((l) => {
    const c = cars.find((x) => x.id === l.car);
    if (!c) return;
    const d = T(l.date);
    (byDay[d] = byDay[d] || []).push({ ...l, from: fix(l.from), to: fix(l.to), car: c });
  });
  const dur = (l) => {
    const h = hrs(l.from, l.to);
    return (l.from === l.to ? 0.25 : h != null ? Math.max(0.25, h) : 1) / 24;
  };
  const ents = [
    ...t.crew.map((m) => ({ id: m.id, on: onD(m), off: offD(m), onP: onP(m), offP: offP(m) })),
    ...(t.boats || []).map((b) => ({ id: b.id, boat: true, on: 0, off: N, onP: launch?.id, offP: out?.id })),
  ];
  const loc = {},
    avail = {},
    afloat = {},
    onAt = {},
    offAt = {},
    free = {};
  const legs = [];
  const LT = hhmm(t.launchTime) != null ? hhmm(t.launchTime) + zShift(zoneAt(launch?.id), start) : 9 / 24;
  const OT = hhmm(t.outTime) != null ? hhmm(t.outTime) + zShift(zoneAt(out?.id), addDays(start, N)) : 13 / 24;
  const mainOn = (e) => e.on === 0 && e.onP === launch?.id;
  const mainOff = (e) => e.off === N && e.offP === out?.id;
  const days = [...new Set([...Object.keys(byDay).map(Number), ...ents.map((e) => e.on), ...ents.map((e) => e.off)])].sort((a, b) => a - b);
  days.forEach((d) => {
    ents.forEach((e) => {
      if (loc[e.id] !== 'river' || e.off > d) return;
      loc[e.id] = e.offP;
      offAt[e.id] = avail[e.id] = Math.max(e.off + (mainOff(e) ? OT : 13 / 24), onAt[e.id] + 0.1 || 0);
    });
    let prev = -Infinity;
    (byDay[d] || []).forEach((l) => {
      const load = [...(l.who || []).filter((x) => !DRIVERS[x]), ...(l.boats || [])];
      l.stray = load.filter((x) => loc[x] != null && loc[x] !== l.from);
      const deps = Math.max(free[l.car.id] ?? -Infinity, ...load.filter((x) => loc[x] === l.from).map((x) => avail[x] ?? -Infinity));
      const fixed = hhmm(l.dep) != null ? d + hhmm(l.dep) + zShift(zoneAt(l.from), l.date) : hhmm(l.arr) != null ? d + hhmm(l.arr) + zShift(zoneAt(l.to), l.date) - dur(l) : null;
      l.t0 = fixed ?? Math.max(prev, deps, d + DAY0 + zShift(zoneAt(l.from), l.date));
      l.t1 = l.t0 + dur(l);
      if (fixed != null && fixed < deps - 1e-6) l.early = deps;
      load.forEach((x) => ((loc[x] = l.to), (avail[x] = l.t1)));
      free[l.car.id] = l.t1;
      prev = l.t0;
      legs.push(l);
    });
    ents.forEach((e) => {
      if (afloat[e.id] || e.on > d || e.off <= d) return;
      if (e.boat ? loc[e.id] !== e.onP : loc[e.id] != null && loc[e.id] !== e.onP) return;
      loc[e.id] = 'river';
      afloat[e.id] = 1;
      onAt[e.id] = Math.max(d + (mainOn(e) ? LT : 9 / 24), avail[e.id] ?? -Infinity);
    });
  });
  legs.sort((a, b) => a.t1 - b.t1);
  const river = [];
  const grp = (kind, e, tt, place, main) => {
    let g = river.find((x) => x.kind === kind && x.place === place && Math.abs(x.t - tt) < 1e-6);
    if (!g) river.push((g = { kind, t: tt, place, main, who: [], boats: [] }));
    (e.boat ? g.boats : g.who).push(e.id);
  };
  ents.forEach((e) => {
    if (onAt[e.id] != null) grp('on', e, onAt[e.id], e.onP, mainOn(e));
    if (offAt[e.id] != null) grp('off', e, offAt[e.id], e.offP, mainOff(e));
  });
  river.forEach((g) => (g.date = addDays(start, Math.floor(g.t))));

  const mileAt = (tt) => {
    const f = Math.max(0, Math.min(N, tt));
    const at = (d) => {
      const p = t.plans?.[d];
      return p && p.mile != null && p.mile !== '' ? num(p.mile) : emile(launch) + ((emile(out) - emile(launch)) * d) / N;
    };
    const i = Math.floor(f);
    return at(i) + (at(Math.min(N, i + 1)) - at(i)) * (f - i);
  };

  const seg = (l) => ({ t0: l.t0, t1: l.t1, from: l.from, to: l.to, leg: l });
  const segsOf = (e, key) => {
    const segs = legs.filter((l) => (l[key] || []).includes(e.id)).map(seg);
    if (onAt[e.id] != null) segs.push({ t0: onAt[e.id], t1: onAt[e.id] + 0.02, from: e.onP, to: 'river' });
    if (offAt[e.id] != null) segs.push({ t0: offAt[e.id] - 0.02, t1: offAt[e.id], from: 'river', to: e.offP });
    return segs.sort((a, b) => a.t0 - b.t0);
  };
  const people = t.crew.map((m) => ({ ...m, kind: 'person', segs: segsOf(ents.find((e) => e.id === m.id), 'who') }));
  const boats = (t.boats || []).map((b) => ({ ...b, kind: 'boat', segs: segsOf(ents.find((e) => e.id === b.id), 'boats') }));
  const rigs = cars.map((c) => ({ ...c, kind: 'car', segs: legs.filter((l) => l.car.id === c.id).map(seg) }));

  const at = (e, tt) => {
    const Sg = e.segs;
    if (!Sg.length) return null;
    if (tt <= Sg[0].t0) return { at: Sg[0].from };
    for (let i = 0; i < Sg.length; i++) {
      if (tt <= Sg[i].t1) {
        if (tt >= Sg[i].t0) return { at: Sg[i].from, to: Sg[i].to, f: (tt - Sg[i].t0) / (Sg[i].t1 - Sg[i].t0 || 1), leg: Sg[i].leg };
        return { at: Sg[i - 1] ? Sg[i - 1].to : Sg[0].from };
      }
    }
    return { at: Sg[Sg.length - 1].to };
  };
  const used = new Set();
  legs.forEach((l) => {
    used.add(l.from);
    used.add(l.to);
  });
  [launch, out].forEach((p) => p && used.add(p.id));
  t.crew.forEach((m) => {
    used.add(onP(m));
    used.add(offP(m));
  });

  const spans = [];
  [...rigs, ...people, ...boats].forEach((e) => e.segs.forEach((x) => spans.push([x.t0, x.t1])));
  spans.sort((a, b) => a[0] - b[0]);
  const busy = [];
  spans.forEach(([a, b]) => {
    const last = busy[busy.length - 1];
    if (last && a <= last[1] + 1e-6) last[1] = Math.max(last[1], b);
    else busy.push([a, b]);
  });
  const knots = [];
  let u = 0;
  if (busy.length) {
    knots.push({ u: 0, t: busy[0][0] - 0.02 });
    u = 0.4;
    busy.forEach(([a, b], i) => {
      if (i) u += Math.min(3, 0.35 + 0.12 * (a - busy[i - 1][1]));
      knots.push({ u, t: a, go: true });
      u += b - a < 0.03 ? 0.9 : Math.min(6, Math.max(2, (b - a) * 24 * 0.7));
      knots.push({ u, t: b });
    });
    knots.push({ u: u + 0.5, t: busy[busy.length - 1][1] + 0.02 });
  } else knots.push({ u: 0, t: 0 }, { u: 1, t: N });
  const U = knots[knots.length - 1].u;
  const tOf = (uu) => {
    for (let i = 1; i < knots.length; i++)
      if (uu <= knots[i].u) {
        const a = knots[i - 1],
          b = knots[i];
        return a.t + ((b.t - a.t) * (uu - a.u)) / (b.u - a.u || 1);
      }
    return knots[knots.length - 1].t;
  };
  const stops = knots.filter((k) => k.go).map((k) => k.u);

  return { start, N, dates, T, byId, places, used, legs, river, zoneAt, cars: rigs, boats, people, launch, out, mileAt, at, sp, drive, hrs, path, ll, U, tOf, stops };
}

const hhmm = (v) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(v || '');
  return m ? (+m[1] * 60 + +m[2]) / 1440 : null;
};
const zoneOf = () => RIVER.tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
const tzPart = (tz, iso, style) => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: style }).formatToParts(new Date((okDate(iso) ? iso : today()) + 'T12:00:00Z')).find((x) => x.type === 'timeZoneName').value;
  } catch {
    return '';
  }
};
const offH = (tz, iso) => {
  const m = /GMT([+-])(\d+)(?::(\d+))?/.exec(tzPart(tz, iso, 'shortOffset'));
  return m ? (m[1] === '-' ? -1 : 1) * (+m[2] + (+m[3] || 0) / 60) : 0;
};
const tzAbbr = (tz, iso) => tzPart(tz, iso, 'short');
const routeLL = (k) => {
  for (const [key, r] of Object.entries(routes)) {
    if (r.none) continue;
    const [a, b] = key.split('>');
    if (a === k && r.a) return r.a;
    if (b === k && r.b) return r.b;
  }
  return null;
};
const placeZone = (t, p) => {
  if (!p || p.mile != null || p.toMile != null) return zoneOf();
  const sp = spot(t, p);
  const ll = sp && (sp.ll || routeLL(sp.k));
  if (!ll) return zoneOf();
  try {
    return tzlookup(+ll[0], +ll[1]);
  } catch {
    return zoneOf();
  }
};
const zShift = (z, iso) => (offH(zoneOf(), iso) - offH(z, iso)) / 24;
const hm24 = (tt) => {
  const m = Math.round((((tt % 1) + 1) % 1) * 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const clockOf = (tt) => {
  const m = Math.round((((tt % 1) + 1) % 1) * 1440);
  const h = Math.floor(m / 60) % 24;
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const el = (cls, html) => {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  return d;
};
const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const abbr = (n) => {
  const p = String(n || '').trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}` : p[0];
};
const names = (list) => esc(list.map((e) => abbr(e.name)).join(', '));
const plural = (n, w) => (n ? `${n} ${w}${n > 1 ? 's' : ''}` : '');

function GMap({ S, tt, pick, onPick, type, nonce }) {
  const box = useRef(null);
  const g = useRef(null);
  const [state, setState] = useState('load');
  const pickRef = useRef(null);
  pickRef.current = pick ? onPick : null;

  useEffect(() => {
    let dead = false;
    window.gm_authFailure = () => setState('off');
    (async () => {
      try {
        await gmaps();
        const { Map: GoogleMap, Polyline } = await window.google.maps.importLibrary('maps');
        const { AdvancedMarkerElement } = await window.google.maps.importLibrary('marker');
        if (dead) return;
        const map = new GoogleMap(box.current, {
          mapId: GMAP,
          mapTypeId: 'terrain',
          center: { lat: 36.1, lng: -112.1 },
          zoom: 7,
          streetViewControl: false,
          fullscreenControl: true,
          mapTypeControl: false,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });
        map.addListener('click', (e) => pickRef.current?.([+e.latLng.lat().toFixed(6), +e.latLng.lng().toFixed(6)]));
        const L = hasGeo(RIVER.id) ? riverLine(RIVER.id) : null;
        if (L) new Polyline({ map, path: L.ll.map(([lat, lng]) => ({ lat, lng })), strokeColor: '#3a6f92', strokeOpacity: 0.85, strokeWeight: 4, clickable: false });
        g.current = { map, Polyline, Marker: AdvancedMarkerElement, L, pins: {}, cars: {}, lines: {}, faint: [], fit: null, open: new Set() };
        setState('ok');
      } catch {
        if (!dead) setState('off');
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  useEffect(() => {
    if (state === 'ok' && g.current) g.current.map.setMapTypeId?.(type);
  }, [state, type]);

  useEffect(() => {
    const G = g.current;
    if (state !== 'ok' || !G) return;
    const { map, Polyline, Marker } = G;
    Object.values(G.pins).forEach((m) => (m.map = null));
    G.faint.forEach((x) => x.setMap(null));
    G.pins = {};
    G.faint = [];
    const seen = new Set();
    S.legs.forEach((l) => {
      const p = S.path(l.from, l.to);
      const k = [l.from, l.to].sort().join('|');
      if (!p || seen.has(k)) return;
      seen.add(k);
      G.faint.push(new Polyline({ map, path: p.pts.map(([lat, lng]) => ({ lat, lng })), strokeColor: '#6b6154', strokeOpacity: 0.35, strokeWeight: 3, clickable: false }));
    });
    S.places.forEach((p) => {
      if (!(S.used.has(p.id) || p.id === pick)) return;
      const q = S.ll(p.id);
      if (!q) return;
      const c = el('gmPin' + (p.id === pick ? ' on' : '') + (G.open.has(p.id) ? ' open' : ''), `<b>${esc(p.name)}</b><i></i><div class="gmMore"></div>`);
      c.addEventListener('click', (e) => {
        e.stopPropagation();
        G.open.has(p.id) ? G.open.delete(p.id) : G.open.add(p.id);
        c.classList.toggle('open', G.open.has(p.id));
      });
      G.pins[p.id] = new Marker({ map, position: { lat: +q[0], lng: +q[1] }, content: c, zIndex: 1 });
    });
    G.fit = null;
  }, [state, S, pick, nonce]);

  useEffect(() => {
    const G = g.current;
    if (state !== 'ok' || !G) return;
    const { map, Polyline, Marker } = G;
    const here = {};
    const add = (id, k, e) => (here[id] ||= { car: [], person: [], boat: [] })[k].push(e);
    const live = [];
    S.cars.forEach((c) => {
      const a = S.at(c, tt);
      if (!a) return;
      if (a.to == null) add(a.at, 'car', c);
      else live.push({ c, a });
    });
    const wet = { person: [], boat: [] };
    [...S.people, ...S.boats].forEach((e) => {
      const a = S.at(e, tt);
      if (!a || a.leg) return;
      if (a.at === 'river' && a.to == null) wet[e.kind].push(e);
      else if (a.to == null) add(a.at, e.kind, e);
    });
    const afloat = wet.person.length;
    Object.entries(G.pins).forEach(([id, m]) => {
      const h = here[id];
      m.content.querySelector('i').textContent = h ? [plural(h.car.length, 'car'), plural(h.person.length, 'person').replace('persons', 'people'), plural(h.boat.length, 'boat')].filter(Boolean).join(' · ') : '';
      m.content.querySelector('.gmMore').innerHTML = h
        ? [
            h.car.map((c) => `<span class="gmTint" style="--tint:${c.tint}">${esc(c.name)}</span>`).join(''),
            h.person.length ? `<span>${names(h.person)}</span>` : '',
            h.boat.length ? `<span class="gmBoats">${esc(h.boat.map((b) => b.name).join(', '))}</span>` : '',
          ].join('')
        : '';
    });

    const lane = {};
    const span = (() => {
      const bb = map.getBounds?.();
      return bb ? Math.abs(bb.getNorthEast().lat() - bb.getSouthWest().lat()) : 1;
    })();
    const near = span * 0.09;
    const groups = [];
    live.forEach(({ c, a }) => {
      const p = S.path(a.at, a.to);
      const k = a.at + '|' + a.to + '|' + a.leg.t0;
      const n = (lane[k] = (lane[k] || 0) + 1) - 1;
      let q;
      if (p) q = along(p, ease(a.f) * p.len - n * p.len * 0.012);
      else {
        const A = S.ll(a.at),
          B = S.ll(a.to);
        if (!A || !B) return;
        const f = ease(a.f);
        q = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
      }
      const who = S.people.filter((m) => (a.leg.who || []).includes(m.id));
      const drv = (a.leg.who || []).filter((x) => DRIVERS[x]).map((x) => DRIVERS[x]);
      const bts = S.boats.filter((b) => (a.leg.boats || []).includes(b.id)).map((b) => b.name);
      const sec = `<div class="gmSec" style="--tint:${c.tint}"><b>${esc(c.name)}</b>${who.length || drv.length ? `<span>${esc([...drv, ...who.map((m) => abbr(m.name))].join(', '))}</span>` : ''}${bts.length ? `<span class="gmBoats">${esc(bts.join(', '))}</span>` : ''}</div>`;
      const g = groups.find((x) => Math.hypot(x.q[0] - q[0], (x.q[1] - q[1]) * Math.cos((q[0] * Math.PI) / 180)) < near);
      g ? (g.ids.push(c.id), (g.html += sec)) : groups.push({ q, ids: [c.id], html: sec });
      let ln = G.lines[c.id];
      if (p && (!ln || ln.leg !== k)) {
        ln?.setMap(null);
        ln = G.lines[c.id] = new Polyline({ map, path: p.pts.map(([lat, lng]) => ({ lat, lng })), strokeColor: '#3d3832', strokeOpacity: 0.8, strokeWeight: 5, clickable: false, zIndex: 2 });
        ln.leg = k;
      }
    });
    const keep = new Set();
    groups.forEach((g, i) => {
      keep.add('g' + i);
      let m = G.cars['g' + i];
      if (!m) m = G.cars['g' + i] = new Marker({ map, content: el('gmCar', ''), zIndex: 3 });
      if (m.content.innerHTML !== g.html) m.content.innerHTML = g.html;
      m.position = { lat: g.q[0], lng: g.q[1] };
      if (!m.map) m.map = map;
    });
    Object.keys(G.cars).forEach((id) => {
      if (keep.has(id)) return;
      G.cars[id].map = null;
      delete G.cars[id];
    });
    const onRoad = new Set(live.map(({ c }) => c.id));
    Object.keys(G.lines).forEach((id) => {
      if (onRoad.has(id)) return;
      G.lines[id].setMap(null);
      delete G.lines[id];
    });

    if (afloat && G.L) {
      const q = atMile(G.L, S.mileAt(tt));
      if (!G.buoy) G.buoy = new Marker({ content: el('gmBuoy', ''), zIndex: 4 });
      const crew = (b) => wet.person.filter((m) => m.boat === b.id);
      const loose = wet.person.filter((m) => !wet.boat.some((b) => b.id === m.boat));
      G.buoy.content.innerHTML =
        wet.boat
          .filter((b) => crew(b).length)
          .map((b) => `<span><em>${esc(b.name)}</em> ${names(crew(b))}</span>`)
          .join('') +
        (wet.boat.some((b) => !crew(b).length) ? `<span><em>${esc(wet.boat.filter((b) => !crew(b).length).map((b) => b.name).join(', '))}</em></span>` : '') +
        (loose.length ? `<span>${names(loose)}</span>` : '');
      G.buoy.position = { lat: q.lat, lng: q.lon };
      if (!G.buoy.map) G.buoy.map = map;
    } else if (G.buoy) G.buoy.map = null;

    if (pick) return;
    const fk = live.length ? live.map((m) => m.a.leg.id + '@' + m.a.leg.t0).sort().join() : afloat ? 'river' : 'all';
    if (fk === G.fit) return;
    G.fit = fk;
    const b = new window.google.maps.LatLngBounds();
    let n = 0;
    const put = (q) => q && (b.extend({ lat: +q[0], lng: +q[1] }), n++);
    if (live.length)
      live.forEach(({ a }) => {
        const p = S.path(a.at, a.to);
        p ? p.pts.forEach(put) : (put(S.ll(a.at)), put(S.ll(a.to)));
      });
    else if (afloat && G.L) G.L.ll.forEach(put);
    else S.places.forEach((p) => S.used.has(p.id) && put(S.ll(p.id)));
    if (n > 1) map.fitBounds(b, 40);
    else if (n === 1) map.panTo(b.getCenter());
  }, [state, S, tt, pick, nonce]);

  return (
    <div className={'gmap' + (pick ? ' picking' : '')}>
      <div ref={box} className="gmapBox" />
      {state === 'off' ? <div className="gmapOff">Map needs a connection</div> : null}
    </div>
  );
}

function RiverEnd({ s, which }) {
  const t = s.trip;
  const out = which === 'out';
  const ramps = [...ACCESS.filter((p) => p.mile != null), ...(t.places || []).filter((p) => p.mile != null)];
  const date = out ? (okDate(t.start) ? addDays(t.start, num(t.days)) : '') : t.start;
  const time = out ? t.outTime : t.launchTime;
  const k = out ? { time: 'outTime', at: 'out' } : { time: 'launchTime', at: 'launch' };
  const at = (out ? t.out : t.launch) || (out ? ramps[ramps.length - 1] : ramps[0])?.id;
  const tz = placeZone(t, ramps.find((p) => p.id === at));
  return (
    <>
      <span className="label">{out ? 'Take out' : 'Put in'}</span>
      <div className="when">
        <input
          type="date"
          value={date}
          onChange={(e) => {
            const v = e.target.value;
            if (!okDate(v)) return;
            if (!out) return s.set({ start: v });
            const n = dnum(v, t.start);
            if (n > 0 && n <= 60) s.set({ days: n });
          }}
        />
        <input type="time" className={time ? '' : 'auto'} value={time || (out ? '13:00' : '09:00')} onChange={(e) => s.set({ [k.time]: e.target.value })} />
        <span className="tzTag">{tzAbbr(tz, date)}</span>
      </div>
      <Sel value={at} onChange={(v) => s.set({ [k.at]: v })}>
        {ramps.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Sel>
    </>
  );
}

function AddressSearch({ value, placeholder, onText, onPlace }) {
  const [q, setQ] = useState(value);
  const [list, setList] = useState([]);
  const tok = useRef(null);
  const typed = useRef(false);
  useEffect(() => setQ(value), [value]);
  useEffect(() => {
    if (!typed.current || !q.trim()) return setList([]);
    let live = true;
    const id = setTimeout(async () => {
      try {
        await gmaps();
        const P = await window.google.maps.importLibrary('places');
        tok.current ||= new P.AutocompleteSessionToken();
        const { suggestions } = await P.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: q, sessionToken: tok.current });
        if (live) setList(suggestions.map((x) => x.placePrediction).filter(Boolean).slice(0, 5));
      } catch {
        if (live) setList([]);
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [q]);
  const choose = async (pr) => {
    typed.current = false;
    setList([]);
    const text = pr.text?.toString() || '';
    try {
      const pl = pr.toPlace();
      await pl.fetchFields({ fields: ['formattedAddress', 'location'] });
      tok.current = null;
      const addr = pl.formattedAddress || text;
      setQ(addr);
      onPlace(addr, [+pl.location.lat().toFixed(6), +pl.location.lng().toFixed(6)]);
    } catch {
      setQ(text);
      onText(text);
    }
  };
  return (
    <div className="addr">
      <Field
        label="Address"
        value={q}
        placeholder={placeholder}
        onChange={(e) => {
          typed.current = true;
          setQ(e.target.value);
        }}
        onBlur={() => {
          setTimeout(() => setList([]), 150);
          if (typed.current && q.trim() !== value) onText(q);
          typed.current = false;
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
      />
      {list.length ? (
        <div className="sugg">
          {list.map((pr) => (
            <button key={pr.placeId} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(pr)}>
              <b>{pr.mainText?.toString() || pr.text?.toString()}</b>
              {pr.secondaryText ? <span>{pr.secondaryText.toString()}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Stage({ S, s, pick, setPick, onRefresh }) {
  const [nonce, setNonce] = useState(0);
  const t = s.trip;
  const [u, setU] = useState(0);
  const [play, setPlay] = useState(false);
  const [type, setType] = useState(() => {
    try {
      return localStorage.getItem('eddy.maptype') || 'terrain';
    } catch {
      return 'terrain';
    }
  });
  const pickType = (v) => {
    setType(v);
    try {
      localStorage.setItem('eddy.maptype', v);
    } catch {
      /* not remembered */
    }
  };
  const { U, tOf, stops, start, N, legs, byId, people, mileAt, at } = S;
  useEffect(() => {
    if (!play) return;
    let last = performance.now();
    let id = 0;
    const step = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setU((v) => {
        if (v + dt * 0.65 >= U) {
          setPlay(false);
          return U;
        }
        return v + dt * 0.65;
      });
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [play, U]);

  const tt = tOf(Math.min(u, U));
  const iso = addDays(start, Math.floor(tt));
  const rolling = legs.filter((l) => tt >= l.t0 && tt <= l.t1);
  const afloat = people.filter((m) => {
    const a = at(m, tt);
    return a && a.at === 'river' && a.to == null;
  }).length;
  const idle = afloat ? `Mile ${mileAt(tt).toFixed(1)} · ${afloat} on the water` : tt < 0 ? 'Heading for the river' : tt > N ? 'Heading home' : '';
  const jump = (dir) => {
    const to = dir > 0 ? stops.find((x) => x > u + 0.05) : [...stops].reverse().find((x) => x < u - 0.6);
    setU(to == null ? (dir > 0 ? U : 0) : to);
  };
  const pins = t.pins || {};

  return (
    <div className="stageWrap">
      <div className="mapType">
        {[
          ['terrain', 'Map'],
          ['hybrid', 'Satellite'],
        ].map(([v, n]) => (
          <button key={v} className={type === v ? 'on' : ''} onClick={() => pickType(v)}>
            {n}
          </button>
        ))}
      </div>
      <GMap S={S} tt={tt} type={type} nonce={nonce} pick={pick} onPick={(ll) => {
          const { [pick]: _, ...addrs } = t.addrs || {};
          s.set({ pins: { ...pins, [pick]: ll }, addrs });
          setPick(null);
        }}
      />
      {pick ? (
        <div className="tip mt-s">
          Tap the map to place {byId[pick]?.name}.{' '}
          <button type="button" className="linkish" onClick={() => setPick(null)}>
            Cancel
          </button>
        </div>
      ) : null}
      <div className="playRow">
        <button className="skip" onClick={() => jump(-1)} aria-label="Previous move">
          ‹
        </button>
        <button
          className="play"
          onClick={() => {
            if (!play && u >= U) setU(0);
            setPlay(!play);
          }}
          aria-label={play ? 'Pause' : 'Play'}
        >
          {play ? '❙❙' : '▶'}
        </button>
        <button className="skip" onClick={() => jump(1)} aria-label="Next move">
          ›
        </button>
        <input
          className="scrub"
          type="range"
          min="0"
          max={U}
          step="0.02"
          value={u}
          onChange={(e) => {
            setPlay(false);
            setU(+e.target.value);
          }}
        />
        <button
          className="skip"
          onClick={() => {
            setPlay(false);
            setU(0);
            setNonce((n) => n + 1);
            onRefresh?.();
          }}
          aria-label="Refresh map"
        >
          ↻
        </button>
      </div>
      <div className="dayKey">
        <span>
          {fmt(iso)}
          {rolling.length ? ` · ${clockOf(tt)} ${tzAbbr(zoneOf(), iso)}` : ''}
        </span>
        {rolling.map((l) => {
          const who = (l.who || []).length;
          const bo = (l.boats || []).length;
          const tail = [(l.who || []).filter((x) => DRIVERS[x]).map((x) => DRIVERS[x]).join(', ') || null, (l.who || []).filter((x) => !DRIVERS[x]).length ? `${(l.who || []).filter((x) => !DRIVERS[x]).length} aboard` : null, bo ? `${bo} boat${bo > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ');
          return (
            <span className="move" key={l.car.id + l.t0}>
              <i style={{ background: l.car.tint }} />
              <b>{l.car.name}</b> {byId[l.from]?.name} → {byId[l.to]?.name}
              {tail ? <em> {tail}</em> : null}
            </span>
          );
        })}
        {!rolling.length && idle ? <span className="muted">{idle}</span> : null}
      </div>
    </div>
  );
}

const byName = (list, id) => list.find((x) => x.id === id)?.name;

function Shuttle({ s }) {
  const t = s.trip;
  const [openLeg, setOpenLeg] = useState(null);
  const [openCar, setOpenCar] = useState(null);
  const [tip, setTip] = useState(false);
  const [freshCar, setFreshCar] = useState(null);
  const [pick, setPick] = useState(null);
  const [openPlace, setOpenPlace] = useState(null);
  const [freshPlace, setFreshPlace] = useState(null);
  const own = (id) => (t.places || []).some((p) => p.id === id);
  const setAddr = (id, v) => {
    const { [id]: _, ...pins } = t.pins || {};
    const addrs = { ...(t.addrs || {}) };
    if (v.trim()) addrs[id] = v.trim();
    else delete addrs[id];
    s.set({ addrs, pins });
  };
  const resetLoc = (id) => {
    const { [id]: _p, ...pins } = t.pins || {};
    const { [id]: _a, ...addrs } = t.addrs || {};
    s.set({ pins, addrs });
  };
  const where = (p) => {
    const ll = S.ll(p.id);
    const pos = t.addrs?.[p.id] || (ll ? `${(+ll[0]).toFixed(5)}, ${(+ll[1]).toFixed(5)}` : S.sp(p.id)?.q || 'Not on the map yet');
    return p.mile != null ? `Mile ${p.mile} · ${pos}` : pos;
  };
  const ownerOf = (c) => DRIVERS[c.owner] || t.crew.find((x) => x.id === c.owner)?.name || '';
  const [rev, setRev] = useState(0);
  const S = useMemo(() => story(t), [t, rev]);
  const [retry, setRetry] = useState(0);
  useRoutes(S, () => setRev((r) => r + 1), retry);
  const { byId, places, launch, out, dates, start, N } = S;
  const cars = t.cars || [];
  const boats = t.boats || [];
  const legs = legsOf(t);
  const tint = (id) => S.cars.find((x) => x.id === id)?.tint;
  const carOf = (id) => cars.find((c) => c.id === id);
  const pname = (id) => byId[id]?.name || '—';
  const dtag = (d) => (d === start ? ' · launch' : d === addDays(start, N) ? ' · take-out' : '');
  const river = places.filter((p) => p.mile != null || p.toMile != null);
  const off = places.filter((p) => p.mile == null && p.toMile == null);
  const save = (list) => s.set({ legs: list, cars: cars.map(({ legs: _, ...c }) => c) });
  const anchor = useRef(null);
  const setLeg = (id, patch) => {
    const el = rows.current[id];
    anchor.current = el ? { id, top: el.getBoundingClientRect().top } : null;
    save(legs.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };
  useLayoutEffect(() => {
    const a = anchor.current;
    if (!a) return;
    anchor.current = null;
    const el = rows.current[a.id];
    if (!el) return;
    const d = el.getBoundingClientRect().top - a.top;
    if (Math.abs(d) < 1) return;
    let p = el.parentElement;
    while (p && !(/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight)) p = p.parentElement;
    (p || document.scrollingElement || document.documentElement).scrollBy(0, d);
  });
  const dropLeg = (id) => save(legs.filter((l) => l.id !== id));
  const [drag, setDrag] = useState(null);
  const rows = useRef({});
  const grab = (l, mine) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const boxes = mine.map((x) => rows.current[x.id]?.getBoundingClientRect());
    setOpenLeg(null);
    setDrag({ id: l.id, ids: mine.map((x) => x.id), boxes, y0: e.clientY, dy: 0 });
  };
  const slot = (g) => {
    const i = g.ids.indexOf(g.id);
    const b = g.boxes[i];
    const mid = b.top + b.height / 2 + g.dy;
    let n = 0;
    g.boxes.forEach((x, k) => k !== i && x.top + x.height / 2 < mid && n++);
    return n;
  };
  const shift = (id) => {
    if (!drag || id === drag.id) return 0;
    const i = drag.ids.indexOf(drag.id),
      k = drag.ids.indexOf(id),
      n = slot(drag),
      h = drag.boxes[i].height;
    if (k < 0) return 0;
    if (i < n && k > i && k <= n) return -h;
    if (n <= k && k < i) return h;
    return 0;
  };
  const move = (e) => drag && setDrag({ ...drag, dy: e.clientY - drag.y0 });
  const drop = () => {
    if (!drag) return;
    const order = drag.ids.filter((x) => x !== drag.id);
    const n = slot(drag);
    setDrag(null);
    if (n === drag.ids.indexOf(drag.id)) return;
    const next = legs.filter((l) => l.id !== drag.id);
    const me = legs.find((l) => l.id === drag.id);
    const pos = n < order.length ? next.findIndex((l) => l.id === order[n]) : next.findIndex((l) => l.id === order[order.length - 1]) + 1;
    next.splice(pos, 0, me);
    save(next);
  };
  const addLeg = () => {
    const last = legs[legs.length - 1];
    const car = last?.car || cars[0]?.id || '';
    const prev = [...legs].reverse().find((l) => l.car === car);
    const date = legs.reduce((m, x) => (okDate(x.date) && x.date > m ? x.date : m), '') || start;
    const l = { id: uid(), car, from: prev ? prev.to : off[0]?.id || '', to: '', date, who: [], boats: [] };
    save([...legs, l]);
    setOpenLeg(l.id);
    setFreshLeg(l.id);
  };
  const [freshLeg, setFreshLeg] = useState(null);
  useEffect(() => {
    if (!freshLeg) return;
    const el = rows.current[freshLeg];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setFreshLeg(null);
  }, [freshLeg]);

  const warn = [];
  boats.forEach((b) => {
    const e = S.boats.find((x) => x.id === b.id);
    const last = e && e.segs[e.segs.length - 1];
    if (!e || !e.segs.length) warn.push(`${b.name} never leaves the yard.`);
    else if (last && last.to === 'river') warn.push(`${b.name} is still on the river at the end.`);
  });
  if (launch && !S.legs.some((l) => l.to === launch.id && (l.boats || []).length)) warn.push(`No boats delivered to ${launch.name}.`);
  S.legs.forEach((l) => (l.stray || []).forEach((x) => warn.push(`${t.crew.find((m) => m.id === x)?.name || boats.find((b) => b.id === x)?.name} isn't at ${pname(l.from)} for the ${l.car.name} on ${fmt(l.date)}.`)));
  const gap = {};
  t.crew.forEach((m) => {
    const d = okDate(m.offDate) ? m.offDate : addDays(start, N);
    const p = m.off || out?.id;
    const there = legs.some((l) => l.date === d && (l.from === p || l.to === p));
    if (p && !there) (gap[`${p}|${d}`] = gap[`${p}|${d}`] || []).push(m.name);
  });
  Object.entries(gap).forEach(([k, who]) => {
    const [p, d] = k.split('|');
    warn.push(`Nothing at ${pname(p)} on ${fmt(d)} for ${who.length > 2 ? who.length + ' people getting off' : who.join(' and ')}.`);
  });
  const gone = new Set();
  S.legs.forEach((l) => {
    const k = [l.from, l.to].sort().join('|');
    if (l.from === l.to || gone.has(k) || !S.drive(l.from, l.to)?.none) return;
    gone.add(k);
    warn.push(`No road between ${pname(l.from)} and ${pname(l.to)}.`);
  });
  S.legs.forEach((l) => l.early != null && warn.push(`${l.car.name} leaves ${pname(l.from)} at ${clockOf(l.t0 - zShift(S.zoneAt(l.from), l.date))} ${tzAbbr(S.zoneAt(l.from), l.date)} on ${fmt(l.date)}, before everything is there (${clockOf(l.early - zShift(S.zoneAt(l.from), l.date))}).`));
  const lost = new Set();
  S.legs.forEach((l) => [l.from, l.to].forEach((id) => !lost.has(id) && !S.sp(id) && lost.add(id)));
  lost.forEach((id) => warn.push(`${pname(id)} needs an address (Places, below).`));
  legs.forEach((l) => {
    const c = carOf(l.car);
    if (c && num(c.seats) && (l.who || []).length > num(c.seats)) warn.push(`${l.who.length} in the ${c.name} (${num(c.seats)} seats) on ${fmt(l.date)}.`);
  });

  const opts = (
    <>
      <option value="">—</option>
      <optgroup label="Off river">
        {off.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </optgroup>
      <optgroup label={RIVER.name}>
        {river.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </optgroup>
    </>
  );

  const days = [...new Set([...legs.map((l) => l.date), ...S.river.map((g) => g.date)])].sort();
  const [openRiver, setOpenRiver] = useState(null);
  const riverCard = (g) => {
    const key = g.kind + g.t + g.place;
    const z = S.zoneAt(g.place);
    const isOpen = g.main && openRiver === key;
    const ppl = g.who.map((x) => abbr(byName(t.crew, x))).filter(Boolean).join(', ');
    const bts = g.boats.map((x) => byName(boats, x)).filter(Boolean).join(', ');
    return (
      <div className={'grItem riverItem' + (isOpen ? ' open' : '')} key={key}>
        <button className="leg" onClick={() => g.main && setOpenRiver(isOpen ? null : key)}>
          <span className="legSeq">≈</span>
          <span className="legDot river" />
          <span className="carText">
            <span className="carName">
              {g.main ? (g.kind === 'on' ? 'Put in' : 'Take out') : g.kind === 'on' ? 'On river' : 'Off river'} <span className="legWay">{pname(g.place)}</span>
            </span>
            <span className="muted">
              {clockOf(g.t - zShift(z, g.date))} {tzAbbr(z, g.date)}
            </span>
            {ppl ? <span className="legWho">{ppl}</span> : null}
            {bts ? <span className="legBoats">{bts}</span> : null}
          </span>
        </button>
        {isOpen ? (
          <div className="grBody">
            <RiverEnd s={s} which={g.kind === 'on' ? 'launch' : 'out'} />
          </div>
        ) : null}
      </div>
    );
  };
  const times = (l) => {
    const x = S.legs.find((q) => q.id === l.id);
    if (!x) return null;
    const dz = S.zoneAt(l.from),
      az = S.zoneAt(l.to);
    const a = x.t0 - zShift(dz, l.date),
      b = x.t1 - zShift(az, l.date);
    return { dep: hm24(a), arr: hm24(b), depDate: addDays(start, Math.floor(a)), arrDate: addDays(start, Math.floor(b)), next: Math.floor(b) - Math.floor(a), dz, az, a, b };
  };
  const at = (l) => {
    const x = times(l);
    if (!x) return '';
    return `${clockOf(x.a)} ${tzAbbr(x.dz, l.date)} → ${clockOf(x.b)} ${tzAbbr(x.az, l.date)}${x.next > 0 ? ' +1' : ''}`;
  };
  const when = (l) => {
    const x = times(l) || {};
    const arrPin = !!l.arr;
    const depPin = !!l.dep;
    const dd = arrPin ? x.depDate || l.date : l.date;
    const ad = arrPin ? l.arrDate || l.date : x.arrDate || l.date;
    const depTo = (p) => setLeg(l.id, { dep: x.dep || '', date: dd, arr: '', arrDate: '', ...p });
    const arrTo = (p) => setLeg(l.id, { arr: x.arr || '', arrDate: ad, date: ad, dep: '', ...p });
    return (
      <>
        <span className="label">Depart</span>
        <div className="when">
          <input className={arrPin ? 'auto' : ''} type="date" value={dd} onChange={(e) => okDate(e.target.value) && (arrPin ? depTo({ date: e.target.value }) : setLeg(l.id, { date: e.target.value }))} />
          <input className={depPin ? '' : 'auto'} type="time" value={l.dep || x.dep || ''} onChange={(e) => depTo({ dep: e.target.value })} />
          <span className="tzTag">{tzAbbr(S.zoneAt(l.from), dd)}</span>
        </div>
        <span className="label">Arrive</span>
        <div className="when">
          <input className={arrPin ? '' : 'auto'} type="date" value={ad} onChange={(e) => okDate(e.target.value) && arrTo({ arrDate: e.target.value, date: e.target.value })} />
          <input className={arrPin ? '' : 'auto'} type="time" value={l.arr || x.arr || ''} onChange={(e) => arrTo({ arr: e.target.value })} />
          <span className="tzTag">{tzAbbr(S.zoneAt(l.to), ad)}</span>
        </div>
      </>
    );
  };

  return (
    <>
      <div id="shuttleMap" />
      <Stage S={S} s={s} pick={pick} setPick={setPick} onRefresh={() => setRetry((r) => r + 1)} />
      {warn.length > 0 && (
        <div className="notice mt">
          <div className="noticeHead">
            <Icon name="alert" size={17} /> {warn.length === 1 ? '1 thing to check' : `${warn.length} things to check`}
          </div>
          <ul>
            {warn.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <span className="label mt">Legs</span>
      {days.map((d) => {
        const t0 = (id) => S.legs.find((q) => q.id === id)?.t0 ?? Infinity;
        const mine = legs.filter((l) => l.date === d).map((l, i) => [l, i]).sort((a, b) => t0(a[0].id) - t0(b[0].id) || a[1] - b[1]).map(([l]) => l);
        const ts = [...new Set(mine.map((l) => t0(l.id)))];
        const evs = S.river.filter((g) => g.date === d).sort((a, b) => a.t - b.t);
        const shown = new Set();
        const before = (l) => evs.filter((g) => g.t <= t0(l.id) && !shown.has(g) && shown.add(g));
        const step = mine.map((l) => ts.indexOf(t0(l.id)) + 1);
        return (
          <div key={d} className="dayBlock">
            <div className="dayHead">
              {fmt(d)}
              <span className="muted">{dtag(d)}</span>
            </div>
            {mine.map((l, i) => {
              const c = carOf(l.car);
              const isOpen = openLeg === l.id;
              const who = (l.who || []).length,
                nb = (l.boats || []).length;
              return (
                <React.Fragment key={l.id}>
                {before(l).map(riverCard)}
                <div
                  className={'grItem legItem' + (isOpen ? ' open' : '') + (drag?.id === l.id ? ' lifted' : '')}
                  key={l.id}
                  ref={(n) => (rows.current[l.id] = n)}
                  style={drag ? { transform: `translateY(${drag.id === l.id ? drag.dy : shift(l.id)}px)` } : undefined}
                >
                  <span className="grip" onPointerDown={grab(l, mine)} onPointerMove={move} onPointerUp={drop} onPointerCancel={() => setDrag(null)} aria-label="Drag to reorder">
                    ≡
                  </span>
                  <button className="leg" onClick={() => setOpenLeg(isOpen ? null : l.id)}>
                    <span className="legSeq">{i && step[i] === step[i - 1] ? '‖' : step[i]}</span>
                    <span className="legDot" style={{ background: tint(l.car) }} />
                    <span className="carText">
                      <span className="carName">
                        {c?.name || 'No vehicle'} <span className="legWay">{pname(l.from)} → {pname(l.to)}</span>
                      </span>
                      <span className="muted">{[at(l), hm(S.hrs(l.from, l.to))].filter(Boolean).join(' · ')}</span>
                      {who ? <span className="legWho">{(l.who || []).map((x) => DRIVERS[x] || abbr(byName(t.crew, x))).filter(Boolean).join(', ')}</span> : null}
                      {nb ? <span className="legBoats">{(l.boats || []).map((x) => byName(boats, x)).filter(Boolean).join(', ')}</span> : null}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="grBody">
                      <div className="row">
                        <Sel
                          label={
                            <>
                              Vehicle
                              <button
                                type="button"
                                className="info"
                                aria-label="About vehicles"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setTip(!tip);
                                }}
                              >
                                i
                              </button>
                            </>
                          }
                          value={l.car}
                          onChange={(v) => setLeg(l.id, { car: v })}
                        >
                          <option value="">—</option>
                          {cars.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </Sel>
                      </div>
                      {tip ? (
                        <div className="tip">
                          Add or edit vehicles under{' '}
                          <button type="button" className="linkish" onClick={() => document.getElementById('vehicles')?.scrollIntoView({ behavior: 'smooth' })}>
                            Vehicles
                          </button>{' '}
                          at the bottom of this tab.
                        </div>
                      ) : null}
                      {when(l)}
                      <div className="row">
                        <Sel label="From" value={l.from} onChange={(v) => setLeg(l.id, { from: v })}>
                          {opts}
                        </Sel>
                        <Sel label="To" value={l.to} onChange={(v) => setLeg(l.id, { to: v })}>
                          {opts}
                        </Sel>
                      </div>
                      <span className="label">Riding along</span>
                      <div className="chips">
                        {[...Object.entries(DRIVERS).map(([id, name]) => ({ id, name })), ...t.crew].map((m) => {
                          const on = (l.who || []).includes(m.id);
                          return (
                            <button key={m.id} className={'chip' + (on ? ' on' : '')} onClick={() => setLeg(l.id, { who: on ? l.who.filter((q) => q !== m.id) : [...(l.who || []), m.id] })}>
                              {m.name}
                            </button>
                          );
                        })}
                      </div>
                      <span className="label">Boats aboard</span>
                      <div className="chips">
                        {boats.map((b) => {
                          const on = (l.boats || []).includes(b.id);
                          return (
                            <button key={b.id} className={'chip' + (on ? ' on river' : '')} onClick={() => setLeg(l.id, { boats: on ? l.boats.filter((q) => q !== b.id) : [...(l.boats || []), b.id] })}>
                              {b.name}
                            </button>
                          );
                        })}
                        {!boats.length && <span className="muted">Add boats on the Crew tab</span>}
                      </div>
                      <div className="legTools">
                        <button className="btn ghost danger" onClick={() => dropLeg(l.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                </React.Fragment>
              );
            })}
            {evs.filter((g) => !shown.has(g)).map(riverCard)}
          </div>
        );
      })}
      <button className="btn ghost mt-s" onClick={addLeg} disabled={!cars.length}>
        Add leg
      </button>


      <span className="label mt" id="vehicles">
        Vehicles
      </span>
      {cars.map((c) => (
        <div className={'grItem' + (openCar === c.id ? ' open' : '')} key={c.id}>
          <button className="car" onClick={() => setOpenCar(openCar === c.id ? null : c.id)}>
            <span className="carIconWrap" style={{ color: tint(c.id) }}>
              <CarIcon trailer={c.trailer} />
            </span>
            <span className="carText">
              <span className="carName">{c.name || 'New vehicle'}</span>
              {ownerOf(c) || num(c.seats) ? (
                <span className="muted">{[ownerOf(c) ? `Owner: ${ownerOf(c)}` : '', num(c.seats) ? `Capacity: ${num(c.seats)} seats` : ''].filter(Boolean).join(' · ')}</span>
              ) : null}
            </span>
          </button>
          {openCar === c.id && (
            <div className="grBody">
              <Field label="Name" value={c.name} autoFocus={freshCar === c.id} onChange={(e) => s.patch('cars', c.id, { name: e.target.value })} />
              <span className="label">Owner</span>
              <div className="chips">
                {[...Object.entries(DRIVERS).map(([id, name]) => ({ id, name })), ...t.crew].map((x) => (
                  <button key={x.id} className={'chip' + (c.owner === x.id ? ' on' : '')} onClick={() => s.patch('cars', c.id, { owner: c.owner === x.id ? '' : x.id })}>
                    {x.name}
                  </button>
                ))}
              </div>
              <div className="numRow">
                <Num label="Seats" value={c.seats} onChange={(v) => s.patch('cars', c.id, { seats: v })} />
              </div>
              <div className="chips">
                <button className={'chip' + (c.trailer ? ' on' : '')} onClick={() => s.patch('cars', c.id, { trailer: !c.trailer })}>
                  Towing a trailer
                </button>
              </div>
              <button
                className="btn ghost danger mt-s"
                onClick={() => {
                  save(legs.filter((l) => l.car !== c.id));
                  s.drop('cars', c.id);
                }}
              >
                Remove
              </button>
            </div>
          )}
        </div>
      ))}
      <button
        className="btn ghost mt-s"
        onClick={() => {
          const id = uid();
          s.push('cars', { id, name: '', owner: '', seats: '', trailer: false });
          setFreshCar(id);
          setOpenCar(id);
        }}
      >
        Add vehicle
      </button>

      <span className="label mt">Places</span>
      {places.map((p) => (
        <div className={'grItem' + (openPlace === p.id ? ' open' : '')} key={p.id}>
          <button className="car" onClick={() => setOpenPlace(openPlace === p.id ? null : p.id)}>
            <span className="carText">
              <span className="carName">{p.name || 'New place'}</span>
              {where(p) ? <span className="muted">{where(p)}</span> : null}
            </span>
          </button>
          {openPlace === p.id && (
            <div className="grBody">
              {own(p.id) ? (
                <div className="row">
                  <Field label="Name" value={p.name} autoFocus={freshPlace === p.id} onChange={(e) => s.patch('places', p.id, { name: e.target.value })} />
                  <Field className="narrow" label="River mile" inputMode="decimal" value={p.mile ?? ''} placeholder="Off river" onChange={(e) => s.patch('places', p.id, { mile: e.target.value === '' || !isFinite(+e.target.value) ? null : +e.target.value })} />
                </div>
              ) : null}
              <AddressSearch
                value={(t.addrs || {})[p.id] || ''}
                placeholder={spot({ ...t, pins: {}, addrs: {} }, p)?.q || 'Search an address or place'}
                onText={(v) => setAddr(p.id, v)}
                onPlace={(addr, ll) => s.set({ addrs: { ...(t.addrs || {}), [p.id]: addr }, pins: { ...(t.pins || {}), [p.id]: ll } })}
              />
              <div className="chips">
                <button
                  className={'chip' + (pick === p.id ? ' on' : '')}
                  onClick={() => {
                    setPick(pick === p.id ? null : p.id);
                    document.getElementById('shuttleMap')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  Pick on map
                </button>
                {t.pins?.[p.id] || t.addrs?.[p.id] ? (
                  <button className="chip" onClick={() => resetLoc(p.id)}>
                    Reset
                  </button>
                ) : null}
              </div>
              {own(p.id) ? (
                <button
                  className="btn ghost danger mt-s"
                  onClick={() => {
                    resetLoc(p.id);
                    s.drop('places', p.id);
                  }}
                >
                  Remove
                </button>
              ) : null}
            </div>
          )}
        </div>
      ))}
      <button
        className="btn ghost mt-s"
        onClick={() => {
          const id = uid();
          s.push('places', { id, name: '' });
          setFreshPlace(id);
          setOpenPlace(id);
        }}
      >
        Add place
      </button>

    </>
  );
}

function Ledger({ s }) {
  const t = s.trip;
  const pay = t.pay || [];
  const L = useMemo(() => ledger(t), [t]);
  const [openPay, setOpenPay] = useState(null);
  const [freshPay, setFreshPay] = useState(null);
  const paid = {};
  t.crew.forEach((c) => (paid[c.id] = 0));
  pay.forEach((p) => {
    paid[p.by] = (paid[p.by] || 0) + num(p.amt);
    if (p.to && p.by) paid[p.to] = (paid[p.to] || 0) - num(p.amt);
  });
  const potted = pay.filter((p) => !p.to).reduce((a, p) => a + num(p.amt), 0);
  const nm = (id) => t.crew.find((c) => c.id === id)?.name || '—';
  const bal = t.crew.map((c) => ({ id: c.id, v: (paid[c.id] || 0) - L.by[c.id].total }));
  const up = bal.filter((x) => x.v > 0.5).sort((a, b) => b.v - a.v).map((x) => ({ ...x }));
  const down = bal.filter((x) => x.v < -0.5).sort((a, b) => a.v - b.v).map((x) => ({ ...x, v: -x.v }));
  const settle = [];
  for (let i = 0, j = 0; i < down.length && j < up.length; ) {
    const n = Math.min(down[i].v, up[j].v);
    if (n >= 1) settle.push({ from: down[i].id, to: up[j].id, amt: Math.round(n) });
    down[i].v -= n;
    up[j].v -= n;
    if (down[i].v < 0.5) i++;
    if (up[j].v < 0.5) j++;
  }
  const unpaid = down.reduce((a, x) => a + Math.max(0, x.v), 0);

  return (
    <>
      <span className="label">Ledger</span>
      <div className="tbl">
        <div className="tr2 th">
          <span className="tName">Name</span>
          <span>Costs incurred</span>
          <span>Paid</span>
          <span>Balance</span>
        </div>
        {t.crew.map((c) => {
          const d = (paid[c.id] || 0) - L.by[c.id].total;
          return (
            <div className="tr2" key={c.id}>
              <span className="tName">{c.name}</span>
              <span>{usd0(L.by[c.id].total)}</span>
              <span>{usd0(paid[c.id] || 0)}</span>
              <span className={'tSum' + (d < -0.5 ? ' owes' : '')}>{(d < 0 ? '−' : '+') + usd0(Math.abs(d))}</span>
            </div>
          );
        })}
        {(() => {
          const cost = t.crew.reduce((a, c) => a + L.by[c.id].total, 0);
          const got = t.crew.reduce((a, c) => a + (paid[c.id] || 0), 0);
          const d = got - cost;
          return (
            <div className="tr2 tf">
              <span className="tName" />
              <span>{usd0(cost)}</span>
              <span>{usd0(got)}</span>
              <span className={'tSum' + (d < -0.5 ? ' owes' : '')}>{(d < 0 ? '−' : '+') + usd0(Math.abs(d))}</span>
            </div>
          );
        })()}
      </div>

      {settle.length ? (
        <>
          <span className="label mt">Settle up</span>
          {settle.map((x) => (
            <div className="gearRow" key={x.from + x.to}>
              <span className="gearName">
                {nm(x.from)} → {nm(x.to)}
              </span>
              <span className="grAmt">{usd0(x.amt)}</span>
              <button className="btn ghost" onClick={() => s.push('pay', { what: 'Settled up', by: x.from, to: x.to, amt: x.amt })}>
                Paid
              </button>
            </div>
          ))}
        </>
      ) : null}
      {unpaid > 0.5 ? <div className="muted">{usd0(unpaid)} still to pay toward trip costs</div> : null}

      <span className="label mt">Payments</span>
      {pay.map((p) => {
        const isOpen = openPay === p.id;
        const up = (x) => s.patch('pay', p.id, x);
        return (
          <div className={'grItem' + (isOpen ? ' open' : '')} key={p.id}>
            <button className="car" onClick={() => setOpenPay(isOpen ? null : p.id)}>
              <span className="carText">
                <span className="carName">{p.what || (p.to ? 'Paid back' : 'New payment')}</span>
                {p.by ? <span className="muted">{p.to ? `${nm(p.by)} → ${nm(p.to)}` : nm(p.by)}</span> : null}
              </span>
              <span className="grAmt">{usd0(num(p.amt))}</span>
            </button>
            {isOpen && (
              <div className="grBody">
                <div className="row">
                  <Field label={p.to ? 'Note' : 'Expense'} value={p.what || ''} autoFocus={freshPay === p.id} onChange={(e) => up({ what: e.target.value })} />
                  <Field className="narrow" label="Amount" inputMode="decimal" value={p.amt ?? ''} placeholder="0" onChange={(e) => up({ amt: e.target.value })} />
                </div>
                <span className="label">Paid by</span>
                <div className="chips">
                  {t.crew.map((c) => (
                    <button key={c.id} className={'chip' + (p.by === c.id ? ' on' : '')} onClick={() => up({ by: p.by === c.id ? '' : c.id, ...(p.to === c.id ? { to: '' } : {}) })}>
                      {c.name}
                    </button>
                  ))}
                </div>
                <span className="label">Paid to</span>
                <div className="chips">
                  <button className={'chip' + (!p.to ? ' on' : '')} onClick={() => up({ to: '' })}>
                    Trip costs
                  </button>
                  {t.crew
                    .filter((c) => c.id !== p.by)
                    .map((c) => (
                      <button key={c.id} className={'chip' + (p.to === c.id ? ' on' : '')} onClick={() => up({ to: p.to === c.id ? '' : c.id })}>
                        {c.name}
                      </button>
                    ))}
                </div>
                <button className="btn ghost danger mt-s" onClick={() => s.drop('pay', p.id)}>
                  Remove
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button
        className="btn ghost mt-s"
        onClick={() => {
          const id = uid();
          s.push('pay', { id, what: '', by: '', amt: '' });
          setFreshPay(id);
          setOpenPay(id);
        }}
      >
        Add payment
      </button>
      {pay.length > 0 && <div className="muted mt-s">{usd0(potted)} paid so far</div>}
      {L.loose > 0.005 && <div className="muted">{usd0(L.loose)} unclaimed</div>}
    </>
  );
}

function InfoSection({ sec }) {
  return (
    <Acc title={sec.title}>
      {sec.kv && <Pairs data={sec.kv} />}
      {sec.rows &&
        sec.rows.map((r, i) => (
          <div className="pair" key={i}>
            <div className="pairKey">{r[0]}</div>
            {sec.cols.slice(1).map((c, j) =>
              r[j + 1] ? (
                <div className="line" key={j}>
                  <span className="muted">{c}: </span>
                  {r[j + 1]}
                </div>
              ) : null
            )}
          </div>
        ))}
      {sec.text && <div className="line pre">{sec.text}</div>}
      {sec.foot ? <div className="muted mt">{sec.foot}</div> : null}
    </Acc>
  );
}

// Typical weather and flow for the trip's middle day (river records: `climateDoy`, `flowDoy`).
function Conditions({ trip }) {
  const f = RIVER.flowDoy;
  const w = RIVER.climateDoy;
  if ((!f && !w) || !okDate(trip.start)) return null;
  const mid = addDays(trip.start, Math.floor((num(trip.days) || 0) / 2));
  const d = new Date(mid + 'T12:00:00Z');
  const doy = Math.floor((Date.UTC(2001, d.getUTCMonth(), Math.min(d.getUTCDate(), d.getUTCMonth() === 1 ? 28 : 31)) - Date.UTC(2001, 0, 1)) / 864e5);
  const i = Math.min(52, Math.floor((doy + 3) / 7));
  const c = (n) => Math.round(n).toLocaleString('en-US');
  const note = fmt(mid);
  return (
    <>
      {w && (
        <Acc title="Typical weather" note={note} open>
          <Pairs
            data={[
              ['Daytime high', `${w.hi[i]}°F`],
              ['Night low', `${w.lo[i]}°F`],
              ['Cloud cover', `${w.cloud[i]}%`],
            ]}
          />
          <div className="muted mt">Check the forecast before you go.</div>
        </Acc>
      )}
      {f && (
        <Acc title="Typical flow" note={note} open>
          <Pairs
            data={[
              ['Usual range', `${c(f.p25[i])} to ${c(f.p75[i])} cfs`],
              ['Middle value', `${c(f.p50[i])} cfs`],
            ]}
          />
          {f.regime === 'regulated' ? <div className="muted mt">A dam sets this river’s flow. Check the release schedule before you go.</div> : null}
        </Acc>
      )}
    </>
  );
}

function Info({ s }) {
  const ref = REFS[s.trip.id];
  const groups = ref ? [...new Set(ref.sections.map((x) => x.group))] : [];
  const [g, setG] = useState(groups[0]);
  if (!ref)
    return (
      <>
        <Conditions trip={s.trip} />
        {!RIVER.flowDoy && !RIVER.climateDoy && <div className="muted">No reference notes for this trip.</div>}
      </>
    );
  return (
    <>
      <Conditions trip={s.trip} />
      <div className="chips scroll">
        {groups.map((x) => (
          <button key={x} className={'chip' + (g === x ? ' on' : '')} onClick={() => setG(x)}>
            {x}
          </button>
        ))}
      </div>
      <div className="mt">
        {ref.sections.filter((x) => x.group === g).map((x, i) => (
          <InfoSection sec={x} key={g + i} />
        ))}
      </div>
    </>
  );
}

function Log({ s }) {
  const [open, setOpen] = useState(null);
  return (
    <>
      <button
        className="btn ghost mb"
        onClick={() => {
          const id = uid();
          s.push('log', { id, date: today(), text: '' });
          setOpen(id);
        }}
      >
        Add entry
      </button>
      {!s.trip.log.length && (
        <Empty icon="inbox" title="No log entries yet">
          Jot down the day's river notes, hazards and wildlife sightings here.
        </Empty>
      )}
      {[...s.trip.log].reverse().map((e) =>
        open === e.id ? (
          <div className="entry" key={e.id}>
            <Field type="date" value={e.date} onChange={(x) => okDate(x.target.value) && s.patch('log', e.id, { date: x.target.value })} />
            <Field area autoFocus value={e.text} onChange={(x) => s.patch('log', e.id, { text: x.target.value })} />
            <div className="chips">
              <button className="chip" onClick={() => setOpen(null)}>
                Done
              </button>
              <button className="chip danger" onClick={() => (s.drop('log', e.id), setOpen(null))}>
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="entry" key={e.id} onClick={() => setOpen(e.id)}>
            <div className="entryHead">
              <span className="label">{fmt(e.date)}</span>
            </div>
            <div className="line">{e.text}</div>
          </div>
        )
      )}
    </>
  );
}

// "I'm this crew member" is a note on this device, not an account and not synced
const meKey = (tripId) => 'eddy.me.' + tripId;
const getMe = (tripId) => {
  try {
    return localStorage.getItem(meKey(tripId)) || '';
  } catch {
    return '';
  }
};
const setMeFor = (tripId, crewId) => {
  try {
    if (crewId) localStorage.setItem(meKey(tripId), crewId);
    else localStorage.removeItem(meKey(tripId));
  } catch {}
};

const ago = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (!isFinite(m)) return '';
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  if (m < 1440) return Math.round(m / 60) + ' h ago';
  return Math.round(m / 1440) + ' d ago';
};
const ROLE_LABEL = { owner: 'Owner', editor: 'Can edit', viewer: 'View only' };

function People({ s }) {
  const t = s.trip;
  const ent = s.sync[t.id];
  const info = s.info[t.id];
  const inv = useInvite(s, t);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [myName, setMyName] = useState(() => savedName());
  const act = async (fn, done) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
      if (done) setMsg(done);
    } catch (e) {
      setMsg(netMsg(e));
    }
    setBusy(false);
  };
  if (!ent)
    return (
      <>
        <Empty icon="users" title="Just you so far">
          Invite your crew to plan together. Everyone sees changes as they happen.
        </Empty>
        <button className="btn block" disabled={inv.busy} onClick={() => inv.send(false)}>
          <Icon name="users" size={16} /> {inv.busy ? 'Preparing…' : 'Invite people'}
        </button>
        {inv.msg ? <div className="muted mt-s">{inv.msg}</div> : null}
      </>
    );
  const role = (info && info.role) || ent.role || 'editor';
  const owner = role === 'owner';
  const members = (info && info.members) || [];
  const byId = Object.fromEntries(members.map((m) => [m.id, m.n || 'Someone']));
  const me = (info && info.me) || ent.me;
  const myRec = members.find((m) => m.id === me);
  const needName = ent.trip && myRec && !myRec.n;
  const inviteRole = (info && info.inviteRole) || 'editor';
  if (!ent.trip)
    return <div className="muted">The member list appears once the trip owner opens the app.</div>;
  return (
    <>
      {needName ? (
        <div className="card formCard mb">
          <span className="label">Your name</span>
          <div className="muted mb-s">So the others know who you are.</div>
          <div className="row">
            <Field value={myName} onChange={(e) => setMyName(e.target.value)} placeholder="Your name" />
            <button className="btn" disabled={busy || !myName.trim()} onClick={() => act(() => s.renameMe(t.id, myName))}>
              Save
            </button>
          </div>
        </div>
      ) : null}
      <div className="card mb">
        <div className="serif">{ROLE_LABEL[role]}</div>
        <div className="muted">
          {owner ? 'You can invite people, change what they can do and remove them.' : role === 'viewer' ? 'You can see the trip but not change it.' : 'You can edit everything in this trip.'}
        </div>
      </div>

      {role !== 'viewer' ? (
        <div className="card formCard mb">
          <span className="label">Invite</span>
          <div className="row">
            <button className="btn" disabled={inv.busy} onClick={() => inv.send(false)}>
              Invite people
            </button>
            <button className="btn ghost" disabled={inv.busy} onClick={() => inv.send(true)}>
              Copy link
            </button>
          </div>
          {inv.msg ? <div className="muted mb-s">{inv.msg}</div> : null}
          {owner ? (
            <>
              <div className="muted mb-s">People who join with the link can:</div>
              <div className="chips">
                {['editor', 'viewer'].map((r) => (
                  <button key={r} className={'chip' + (inviteRole === r ? ' on' : '')} disabled={busy} onClick={() => inviteRole !== r && act(() => s.setInviteRole(t.id, r))}>
                    {r === 'editor' ? 'Edit' : 'View only'}
                  </button>
                ))}
              </div>
              <button
                className="btn ghost"
                disabled={busy}
                onClick={() =>
                  window.confirm('Reset the invite link? Old links and codes stop working. People already in the trip stay.') &&
                  act(() => s.resetInvite(t.id), 'Invite link reset. Send the new link to anyone who still needs it.')
                }
              >
                Reset invite link
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <span className="label">People ({members.length || 1})</span>
      {members.map((m) => (
        <Acc key={m.id} lead={<Avatar name={m.n || '?'} />} title={m.n || 'Someone'} tag={m.id === me ? 'You' : undefined} note={ROLE_LABEL[m.r] + (m.t ? ' · joined ' + ago(m.t) : '')}>
          {owner && m.r !== 'owner' ? (
            <div className="row">
              <button className="btn ghost" disabled={busy} onClick={() => act(() => s.setMemberRole(t.id, m.id, m.r === 'viewer' ? 'editor' : 'viewer'))}>
                {m.r === 'viewer' ? 'Allow editing' : 'Make view only'}
              </button>
              <button
                className="btn ghost danger"
                disabled={busy}
                onClick={() => window.confirm('Remove ' + (m.n || 'this person') + ' from the trip? They keep their own copy but stop syncing. To keep them out, also reset the invite link.') && act(() => s.removeMember(t.id, m.id))}
              >
                Remove
              </button>
            </div>
          ) : m.id === me ? (
            <div className="muted">This is you.</div>
          ) : (
            <div className="muted">{ROLE_LABEL[m.r]}</div>
          )}
        </Acc>
      ))}
      {msg ? <div className="warn mt-s">{msg}</div> : null}

      {info && info.activity && info.activity.length ? (
        <div className="mt">
          <span className="label">Activity</span>
          <div className="card permitList">
            {[...info.activity].reverse().slice(0, 30).map((a, i) => {
              const system = /^(.+ (joined|left|was removed|is now .+)|Invite link was reset|Someone joined)$/.test(a.s || '');
              return (
                <div className="permitItem" key={i}>
                  <div className="permitT">{system ? a.s : byId[a.w] || 'Someone'}</div>
                  <div className="permitD">
                    {system ? '' : (a.s || 'Made a change') + ' · '}
                    {ago(a.t)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <button className="linkBtn mt" onClick={() => openUrl(SUPPORT_URL)}>
        Report a problem
      </button>
      {!owner ? (
        <button className="btn ghost danger mt" disabled={busy} onClick={() => window.confirm('Leave this trip? You keep your copy but it stops syncing.') && act(() => s.stopSharing(t.id))}>
          Leave trip
        </button>
      ) : null}
    </>
  );
}

const INVITE_ORIGIN = 'https://briancarlcain.github.io/eddy/';
const inviteUrl = (code, by) => INVITE_ORIGIN + '?join=' + code + (by ? '&by=' + encodeURIComponent(by) : '');
const inviteText = (t, code, by) =>
  `${by ? by + ' invited you to' : "You're invited to"} "${t.name}" on Eddy.\n\n${okDate(t.start) ? fmt(t.start) + ' to ' + fmt(addDays(t.start, t.days)) + '\n\n' : ''}Join: ${inviteUrl(code, by)}\n\nOr enter code ${remote.showCode(code)} under Trips, Join a trip.`;

// share the trip first if needed, then open the share sheet with the invite
function useInvite(s, t) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const send = async (copyOnly) => {
    setBusy(true);
    setMsg('');
    try {
      let ent = s.sync[t.id];
      const code = ent ? ent.code : await s.shareTrip(t.id);
      const meCrew = (t.crew || []).find((c) => c.id === getMe(t.id));
      const by = (meCrew ? meCrew.name : savedName()).trim().split(/\s+/)[0].slice(0, 24);
      success();
      if (copyOnly) {
        await navigator.clipboard.writeText(inviteUrl(code, by));
        setMsg('Link copied.');
      } else {
        const r = await shareText(t.name, inviteText(t, code, by));
        if (r === 'copied') setMsg('Invite copied.');
      }
    } catch (e) {
      setMsg(netMsg(e));
    }
    setBusy(false);
  };
  return { send, busy, msg };
}

function SyncCard({ s, t }) {
  const ent = s.sync[t.id];
  const st = s.syncStatus[t.id];
  const [msg, setMsg] = useState('');
  const inv = useInvite(s, t);
  const start = () => inv.send(false);
  return (
    <div className="card formCard mt">
      <span className="label">Crew sync</span>
      {!ent ? (
        <>
          <div className="muted mb-s">Share this trip with your crew. Everyone you give the code to can edit the same trip, and changes appear on all devices. Needs an internet connection to sync; the app still works offline.</div>
          <button className="btn" disabled={inv.busy} onClick={start}>
            <Icon name="users" size={16} /> {inv.busy ? 'Sharing…' : 'Invite people'}
          </button>
        </>
      ) : (
        <>
          <div className="syncCode" aria-label="Join code">{remote.showCode(ent.code)}</div>
          <div className="muted mb-s">
            <Icon name="cloud" size={14} /> {syncLabel(st, !!ent.owner)}. Anyone with this code can view and edit the trip.
          </div>
          <div className="row">
            <button className="btn" onClick={() => inv.send(false)}>
              Invite people
            </button>
            <button className="btn ghost" onClick={() => inv.send(true)}>
              Copy link
            </button>
            <button className="btn ghost" onClick={() => s.syncNow(t.id)}>
              <Icon name="refresh" size={16} /> Sync now
            </button>
          </div>
          <button
            className="btn ghost danger"
            onClick={async () => {
              const owner = !!ent.owner;
              if (!window.confirm(owner ? 'Stop sharing? The shared copy is deleted from the server and crew members keep only the copy already on their device.' : 'Leave this shared trip? You keep your copy but it stops syncing.')) return;
              try {
                await s.stopSharing(t.id);
                setMsg('');
              } catch (e) {
                setMsg(netMsg(e));
              }
            }}
          >
            {ent.owner ? 'Stop sharing' : 'Leave shared trip'}
          </button>
        </>
      )}
      {msg ? <div className="warn mb-s">{msg}</div> : null}
      {inv.msg ? <div className="muted mb-s">{inv.msg}</div> : null}
    </div>
  );
}

// iCalendar file for a trip: one all-day event per day (camp and mileage) plus the whole trip
const icsEsc = (x) => String(x).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function tripICS(t, riverName) {
  const ymd = (iso) => iso.replace(/-/g, '');
  const stampNow = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const ev = (uid, date, endDate, summary, desc) =>
    ['BEGIN:VEVENT', `UID:${uid}@eddy`, `DTSTAMP:${stampNow}`, `DTSTART;VALUE=DATE:${ymd(date)}`, `DTEND;VALUE=DATE:${ymd(endDate)}`, `SUMMARY:${icsEsc(summary)}`, desc ? `DESCRIPTION:${icsEsc(desc)}` : null, 'END:VEVENT'].filter(Boolean).join('\r\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Eddy//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsEsc(t.name)}`];
  if (okDate(t.start)) {
    lines.push(ev(t.id + '-trip', t.start, addDays(t.start, t.days + 1), `${t.name} (${riverName})`, `${(t.crew || []).length} people, ${t.days + 1} days`));
    tripDays(t).forEach((d) => {
      const p = (t.plans || {})[d.i] || {};
      if (!p.camp && !p.note) return;
      lines.push(ev(`${t.id}-d${d.i}`, d.date, addDays(d.date, 1), `Day ${d.i + 1}${p.camp ? ': ' + p.camp : ''}`, [p.camp && p.mile != null ? `Camp at mile ${p.mile}` : '', p.note || ''].filter(Boolean).join('\n')));
    });
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

function tripSummary(t, riverName) {
  const days = tripDays(t);
  const lines = [t.name, `${riverName} · ${okDate(t.start) ? fmt(t.start) + ' ' + t.start.slice(0, 4) : t.start} · ${t.days + 1} days`, ''];
  if ((t.crew || []).length) lines.push(`Crew (${t.crew.length}): ${t.crew.map((c) => c.name).join(', ')}`, '');
  const camps = days.filter((d) => (t.plans || {})[d.i]?.camp);
  if (camps.length) {
    lines.push('Camps');
    camps.forEach((d) => lines.push(`  ${d.label.replace(/^Day (\d+) · /, 'Day $1 · ')}: ${t.plans[d.i].camp}`));
  }
  return lines.join('\n').trim();
}

function Settings({ s, back }) {
  const t = s.trip;
  return (
    <>
      <div className="card formCard">
        <span className="label">Trip details</span>
        <Field label="Name" value={t.name} onChange={(e) => s.set({ name: e.target.value })} />
        <Field label="Permit holder" value={t.permit ?? ''} onChange={(e) => s.set({ permit: e.target.value })} />
        <Sel
          label="River"
          value={riverOf(t)}
          onChange={(v) => {
            const planned = Object.values(t.plans || {}).some((p) => p.camp);
            if (planned && !window.confirm('Switching rivers clears the launch, take-out and camp picks for this trip. Continue?')) return;
            const plans = Object.fromEntries(Object.entries(t.plans || {}).map(([k, p]) => [k, { ...p, camp: undefined }]));
            s.set({ river: v, launch: undefined, out: undefined, plans });
          }}
        >
          {s.riverList().map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Sel>
      </div>

      {t.id === SEED.id && !IS_STORE && (
        <div className="card formCard mt">
          <span className="label">Planning sheet</span>
          <div className="muted mb-s">Replaces crew, boats, cars, gear, meals, payments and day notes with the data from the planning spreadsheet. Log entries are kept.</div>
          <button
            className="btn ghost"
            onClick={() =>
              window.confirm('Replace crew, boats, cars, gear, meals, payments and day notes with the planning-sheet data? Your log entries are kept.') &&
              s.set({ crew: SEED.crew, boats: SEED.boats, cars: SEED.cars, places: SEED.places, gear: SEED.gear, meals: SEED.meals, pay: SEED.pay, plans: SEED.plans })
            }
          >
            Reload planning-sheet data
          </button>
        </div>
      )}

      <SyncCard s={s} t={t} />

      <div className="card formCard mt">
        <span className="label">Calendar</span>
        <div className="muted mb-s">Add the trip and each day's camp to your calendar.</div>
        <button className="btn ghost" onClick={() => saveFile(`${slug(t.name)}.ics`, tripICS(t, s.riverRec(riverOf(t)).name), 'text/calendar')}>
          <Icon name="calendar" size={16} /> Add to Calendar
        </button>
      </div>

      <div className="card formCard mt">
        <span className="label">Summary</span>
        <div className="muted mb-s">Send a plain-text summary of this trip (dates, crew, camps) with Messages, Mail or Notes.</div>
        <button
          className="btn ghost"
          onClick={async () => {
            const r = await shareText(t.name, tripSummary(t, s.riverRec(riverOf(t)).name));
            if (r === 'copied') window.alert('Trip summary copied to the clipboard.');
          }}
        >
          <Icon name="copy" size={16} /> Share trip summary
        </button>
      </div>

      <div className="card formCard dangerCard mt">
        <span className="label">Danger zone</span>
        <div className="muted mb-s">Deleting a trip removes its crew, gear, meals and log for everyone it is shared with.</div>
        <button
          className="btn ghost danger"
          onClick={() => {
            if (!window.confirm(`Delete "${t.name}"? This cannot be undone.`)) return;
            s.remove(t.id);
            back && back();
          }}
        >
          <Icon name="trash" size={16} /> Delete trip
        </button>
      </div>
    </>
  );
}

/* ---------- river ---------- */

function River({ s, browse, onBrowse, onPlan }) {
  if (!browse) return <RiverList s={s} onOpen={onBrowse} />;
  return <RiverDetail s={s} />;
}

function RiverDetail({ s }) {
  const [tab, setTab] = useState(QS.get('sub') || 'Map');
  const [mapMode, setMapModeRaw] = useState(() => {
    try {
      return QS.get('map') || localStorage.getItem('eddy.mapMode') || 'chart';
    } catch {
      return 'chart';
    }
  });
  const setMapMode = (m) => {
    setMapModeRaw(m);
    try {
      localStorage.setItem('eddy.mapMode', m);
    } catch {}
  };
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState('');
  // a remembered mode only applies where this river has it
  const view = mapMode === 'topo' && hasGeo(RIVER.id) ? 'topo' : mapMode === 'basin' && hasBasin(RIVER.id) ? 'basin' : 'chart';
  // the trip's camp plan only means something on the trip's own river
  const sm = riverOf(s.trip) === RIVER.id ? s : { ...s, trip: null };
  const has = {
    Overview: Object.keys(RIVER.stats).length > 0,
    Permits: !!RIVER.permit,
    Rapids: RIVER.rapids.length > 0,
    Camps: RIVER.camps.length > 0,
    Hikes: RIVER.hikes.length > 0,
    Geology: RIVER.geology.length > 0,
    Guide: RIVER.guide.length > 0,
    Almanac: Object.keys(RIVER.almanac).length > 0,
    Rules: RIVER.rules.length > 0,
  };
  const items = ['Map', ...Object.keys(has).filter((k) => has[k]), 'More'];
  const cur = items.includes(tab) ? tab : 'Map';
  const P = { Overview, Rapids, Camps, Hikes, Permits, Geology, Guide, Almanac, Rules }[cur];
  const rec = s.riverRec(RIVER.id);
  return (
    <>
      <Tabs items={items} value={cur} onChange={setTab} />
      {cur === 'Map' ? (
        <>
          {hasGeo(RIVER.id) || hasBasin(RIVER.id) ? (
            <div className="mapMode">
              <button className={'chip' + (view === 'chart' ? ' on river' : '')} onClick={() => setMapMode('chart')}>Mile chart</button>
              {hasGeo(RIVER.id) ? (
                <button className={'chip' + (view === 'topo' ? ' on river' : '')} onClick={() => setMapMode('topo')}>Topo map</button>
              ) : null}
              {hasBasin(RIVER.id) ? (
                <button className={'chip' + (view === 'basin' ? ' on river' : '')} onClick={() => setMapMode('basin')}>Basin</button>
              ) : null}
            </div>
          ) : null}
          {view === 'topo' ? <RiverTopo s={sm} /> : view === 'basin' ? <BasinMap key={RIVER.id} rid={RIVER.id} river={RIVER} /> : <RiverMap s={sm} />}
        </>
      ) : cur === 'More' ? (
        editing ? (
          <RiverEditor s={s} id={RIVER.id} onClose={() => setEditing(false)} />
        ) : (
          <div className="pad">
            <div className="serif">{RIVER.name}</div>
            <div className="muted">
              {RIVER.reach ? RIVER.reach + ' · ' : ''}
              {+(RIVER.miles[1] - RIVER.miles[0]).toFixed(1)} mi
              {RIVER.agency ? ' · ' + RIVER.agency : ''}
            </div>
            <div className="row mt">
              {RIVER.id !== DEFAULT_RIVER && (
                <button className="btn" onClick={() => setEditing(true)}>
                  Edit
                </button>
              )}
              <button
                className="btn ghost"
                onClick={() => {
                  const { custom: _c, edited: _e, ...r } = rec;
                  navigator.clipboard?.writeText(JSON.stringify(r)).then(
                    () => setMsg('Copied.'),
                    () => setMsg('Copy failed.')
                  );
                }}
              >
                Copy JSON
              </button>
            </div>
            {msg ? <div className="muted mt">{msg}</div> : null}
            {hasGeo(RIVER.id) ? (
              <div className="card mt">
                <OfflinePanel rid={RIVER.id} />
              </div>
            ) : null}
          </div>
        )
      ) : (
        <div className="pad"><P s={sm} /></div>
      )}
    </>
  );
}

/* ---------- map — ported from the original HTML app ---------- */

const BOTPAD = 30;
const QCOLORS = ['#cbbf9a', '#bdba84', '#aab472', '#96ac62', '#82a455', '#6f9a4e', '#5b8a48', '#477841', '#33653a'];
const HQCOLORS = ['#dcb096', '#c98b66', '#b26840', '#9a4a28', '#74301a'];
const RAPIDCOL = '#3a6f92';

const clamp15 = (v) => Math.max(1, Math.min(5, v));
const clamp19 = (v) => Math.max(1, Math.min(9, v));
const qColor = (q) => (q == null ? '#b4a98f' : QCOLORS[clamp19(q) - 1]);
const hColor = (q) => (q == null ? '#c9a68f' : HQCOLORS[clamp15(q) - 1]);
const hStars = (q) => (q == null ? '—' : '★'.repeat(clamp15(q)) + '☆'.repeat(5 - clamp15(q)));
const hBank = (b) => (b === 'R' ? 'River Right' : b === 'L' ? 'River Left' : '—');
const hTime = (t) => {
  if (t == null) return '—';
  const h = Math.floor(t);
  const m = Math.round((t - h) * 60);
  return m === 60 ? h + 1 + ':00' : h + ':' + String(m).padStart(2, '0');
};
const sizeWord = (s) => (s == null ? '' : s <= 2 ? 'small' : s <= 5 ? 'mid-sized' : s <= 7 ? 'large' : 'very large');
const qualWord = (q) => (q == null ? '' : q <= 3 ? 'basic' : q <= 6 ? 'good' : q <= 8 ? 'excellent' : 'premier');

// mile 0 at the bottom, downstream up the page
const y = (m) => TOPPAD + (MAXMILE - m) * PPM;

const FMAX = { q: 9, s: 9, d: 9, hq: 5, hd: 5 };
const FCAT = { q: 'c', s: 'c', d: 'r', hq: 'h', hd: 'h' };
const FNAME = { q: 'camp qual', s: 'camp size', d: 'rapid diff', hq: 'hike qual', hd: 'hike diff' };
const CATNAME = { c: 'camps', r: 'rapids', h: 'hikes' };
const full = (k) => new Set(Array.from({ length: FMAX[k] }, (_, i) => i + 1));
const allOn = () => ({ q: full('q'), s: full('s'), d: full('d'), hq: full('hq'), hd: full('hd') });

function RiverMap({ s }) {
  const [sets, setSets] = useState(allOn);
  const [hide, setHide] = useState({ c: false, r: false, h: false });
  const [sheet, setSheet] = useState(null);
  const [sel, setSel] = useState(null);
  const [filters, setFilters] = useState(false);
  const [mile, setMile] = useState(0);
  const [width, setWidth] = useState(0);
  const scroller = useRef(null);
  const chart = useRef(null);
  const [chartLeft, setChartLeft] = useState(0);
  const [paneH, setPaneH] = useState(null);

  const planned = useMemo(
    () => new Set(Object.values(s.trip?.plans || {}).filter((p) => p.camp).map((p) => p.camp)),
    [s.trip]
  );

  useEffect(() => {
    const measure = () => {
      setWidth(chart.current ? chart.current.clientWidth : 0);
      setChartLeft(chart.current ? chart.current.offsetLeft : 0);
      // fill from the window's top edge to the tab bar, whatever the header and safe areas add up to
      const el = scroller.current;
      if (el) {
        const nav = document.querySelector('.tabbar')?.getBoundingClientRect().height || 58;
        setPaneH(Math.max(240, Math.round(window.innerHeight - el.getBoundingClientRect().top - window.scrollY - nav)));
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // open at mile 0 — the bottom of the chart, where the trip starts
  useEffect(() => {
    const el = scroller.current;
    if (el && width) el.scrollTop = el.scrollHeight;
  }, [width]);

  const riverX = Math.round(width * 0.5);
  const barMaxR = width - riverX - 15;
  const barMaxL = riverX - 30;

  // the mile in the header is read at this height in the window; the raft sits there on the river
  const REF = 0.75;
  const onScroll = (e) => {
    const el = e.currentTarget;
    const ref = el.clientHeight * REF;
    const m = MAXMILE - (el.scrollTop + ref - TOPPAD) / PPM;
    setMile(Math.max(0, Math.min(MAXMILE, m)));
  };

  const toggle = (kind, d) =>
    setSets((prev) => {
      const next = { ...prev, [kind]: new Set(prev[kind]) };
      if (next[kind].has(d)) next[kind].delete(d);
      else {
        next[kind].add(d);
        setHide((h) => ({ ...h, [FCAT[kind]]: false }));
      }
      return next;
    });

  const groupAll = (kinds) => {
    setSets((prev) => {
      const next = { ...prev };
      kinds.forEach((k) => (next[k] = full(k)));
      return next;
    });
    setHide((h) => {
      const n = { ...h };
      kinds.forEach((k) => (n[FCAT[k]] = false));
      return n;
    });
  };
  const groupNone = (kinds) => {
    setSets((prev) => {
      const next = { ...prev };
      kinds.forEach((k) => (next[k] = new Set()));
      return next;
    });
    setHide((h) => {
      const n = { ...h };
      kinds.forEach((k) => (n[FCAT[k]] = true));
      return n;
    });
  };

  const badge = useMemo(() => {
    const parts = [];
    let n = 0;
    Object.keys(hide).forEach((c) => {
      if (hide[c]) {
        n++;
        parts.push(CATNAME[c] + ' hidden');
      }
    });
    Object.keys(sets).forEach((k) => {
      if (hide[FCAT[k]]) return;
      const set = sets[k];
      if (set.size < FMAX[k]) {
        n++;
        const v = [...set].sort((a, b) => a - b);
        const contiguous = v.length > 1 && v[v.length - 1] - v[0] === v.length - 1;
        parts.push(FNAME[k] + ' ' + (v.length === 0 ? 'none' : contiguous ? v[0] + '–' + v[v.length - 1] : v.join(',')));
      }
    });
    return { n, text: n === 0 ? 'Showing everything' : parts.join(' · ') };
  }, [sets, hide]);

  const geoLabels = useMemo(() => {
    let prevTop = Infinity;
    let slot = 0;
    return RIVER.geology.map((g) => {
      const hi = Math.min(g.e, MAXMILE);
      const cy = y((g.s + hi) / 2);
      const estW = g.n.length * 5.2 + 12;
      if (cy + estW / 2 > prevTop + 2) slot = slot ? 0 : 1;
      else slot = 0;
      prevTop = cy - estW / 2;
      return { g, hi, cy, slot };
    });
  }, []);

  const tops = useMemo(() => layoutTops(PPM), []);

  const campVis = (c) =>
    !hide.c && (c.qual == null || sets.q.has(clamp19(c.qual))) && (c.size == null || sets.s.has(clamp19(c.size)));
  const hikeVis = (h) =>
    !hide.h && (h.qual == null || sets.hq.has(clamp15(h.qual))) && (h.diff == null || sets.hd.has(clamp15(h.diff)));

  const open = (kind, item, key) => {
    setSel(key);
    setSheet({ kind, item });
  };

  return (
    <div className="gcmap">
      <header id="mapHeader">
        <div className="htop">
          <div className="htitle">{RIVER.reach || RIVER.name}</div>
          <div className="hreach">
            <span id="hmile">Mile {Math.round(mile)}</span>
          </div>
        </div>
        <div className="keys">
          <div className="kgrp">
            <span className="klabel">Camps</span>
            <div className="kbar kqual" />
            <span className="knote">quality · size</span>
          </div>
          <div className="kgrp">
            <span className="klabel">Rapids</span>
            <div className="kbar krapid" />
            <span className="knote">difficulty</span>
          </div>
          <div className="kgrp">
            <span className="klabel">Hikes</span>
            <div className="kbar khike" />
            <span className="knote">difficulty · quality</span>
          </div>
        </div>
        <div className="fbar">
          <button className={'fbtn' + (badge.n ? ' on' : '')} type="button" onClick={() => setFilters(true)}>
            <span className="fico">☰</span>
            <span>Filters</span>
            <span className="fcount">{badge.n}</span>
          </button>
          <span className="fsum">{badge.text}</span>
        </div>
      </header>

      <div className="mapPane">
      {width ? <RaftMark style={{ left: chartLeft + riverX, top: REF * 100 + '%' }} /> : null}
      <div className="mapWindow" ref={scroller} onScroll={onScroll} style={paneH ? { height: paneH } : undefined}>
        <div className="plot">
          <div className="chart" ref={chart} style={{ height: Math.max(TOPPAD + MAXMILE * PPM, tops.max + 16) + BOTPAD }}>
            {RIVER.clusters.map((cl) => (
              <React.Fragment key={cl.n}>
                <div className="cluster" style={{ top: y(cl.e), height: (cl.e - cl.s) * PPM, left: riverX, right: 0 }} />
                <div className="clusterLabel" style={{ right: 11, top: y((cl.s + cl.e) / 2) }}>
                  {cl.n}
                </div>
              </React.Fragment>
            ))}

            {geoLabels.map(({ g, hi, cy, slot }, i) => (
              <React.Fragment key={i}>
                <div
                  className={'gband' + (sel === 'g' + i ? ' sel' : '')}
                  style={{
                    top: y(hi),
                    height: (hi - g.s) * PPM,
                    left: 0,
                    width: riverX,
                    background: `color-mix(in srgb, ${g.c} 14%, transparent)`,
                    borderTop: `1.5px dashed color-mix(in srgb, ${g.c} 42%, transparent)`,
                    borderBottom: `1.5px dashed color-mix(in srgb, ${g.c} 42%, transparent)`,
                  }}
                  onClick={() => open('geo', { ...g, hi }, 'g' + i)}
                />
                <div className="gbandLabel" style={{ left: 11 + slot * 15, top: cy }}>
                  {g.n}
                </div>
              </React.Fragment>
            ))}

            <div className="river" style={{ left: riverX - 5.5, width: 11, top: y(MAXMILE), height: MAXMILE * PPM }} />
            {Array.from({ length: Math.floor((MAXMILE - 10) / 13) + 1 }, (_, i) => 6 + i * 13).map((m) => (
              <div className="flow" key={m} style={{ left: riverX, top: y(m) - 3 }} />
            ))}

            {!hide.r &&
              RIVER.rapids.map((d, i) => {
                if (!sets.d.has(d.diff)) return null;
                const armL = Math.max(7, (barMaxL * d.diff) / 9);
                const armR = Math.max(7, (barMaxR * d.diff) / 9);
                const light = `color-mix(in srgb, ${RAPIDCOL} 78%, #dceaf1 22%)`;
                return (
                  <div
                    key={'r' + i}
                    className={'bar rapid' + (sel === 'r' + i ? ' sel' : '')}
                    style={{ left: riverX - armL, width: armL + armR, top: tops.r[i] - 7, height: 14 }}
                    onClick={() => open('rapid', d, 'r' + i)}
                  >
                    <div
                      className="stick"
                      style={{ background: `linear-gradient(to right, ${light}, ${RAPIDCOL} 50%, ${light})` }}
                    />
                  </div>
                );
              })}

            {RIVER.camps.map((c, i) => {
              if (!campVis(c)) return null;
              const right = c.bank === 'R';
              const len = c.size == null ? 11 : Math.max(8, (((right ? barMaxR : barMaxL) - 4) * c.size) / 9);
              const col = qColor(c.qual);
              const light = `color-mix(in srgb, ${col} 78%, #f3efd6 22%)`;
              return (
                <div
                  key={'c' + i}
                  className={'bar camp ' + (right ? 'bright' : 'bleft') + (sel === 'c' + i ? ' sel' : '')}
                  style={{
                    left: right ? riverX + 4 : riverX - 4 - len,
                    width: len,
                    top: tops.c[i] - 7,
                    height: 14,
                  }}
                  onClick={() => open('camp', c, 'c' + i)}
                >
                  <div
                    className="stick"
                    style={{
                      background: `linear-gradient(to ${right ? 'right' : 'left'}, ${col}, ${light})`,
                      boxShadow: planned.has(c.name) ? '0 0 0 1.4px #2c1b0f' : undefined,
                    }}
                  />
                </div>
              );
            })}

            {RIVER.landmarks.map((d, i) => (
              <div
                key={'l' + i}
                className={'lm' + (sel === 'l' + i ? ' sel' : '')}
                style={{ left: riverX - 5, top: y(d.mile) - 11 }}
                onClick={() => open('rapid', d, 'l' + i)}
              >
                <span className="ld" />
                <span className="lpill">{d.name.replace(/ Boat Ramp| - Water Refill/, '')}</span>
              </div>
            ))}

            {RIVER.hikes.map((h, i) => {
              if (!hikeVis(h)) return null;
              const right = h.bank === 'R';
              const w = h.diff == null ? 11 : Math.max(8, (((right ? barMaxR : barMaxL) - 4) * clamp15(h.diff)) / 5);
              return (
                <div
                  key={'h' + i}
                  className={'hike ' + (right ? 'bright' : 'bleft') + (sel === 'h' + i ? ' sel' : '')}
                  style={{ left: right ? riverX + 4 : riverX - 4 - w, width: w, top: tops.h[i] - 9, height: 18 }}
                  onClick={() => open('hike', h, 'h' + i)}
                >
                  <div className="hdash" style={{ background: hColor(h.qual) }} />
                </div>
              );
            })}
          </div>
          <div className="foot">Tap a marker for details</div>
        </div>
      </div>
      </div>

      <div className={'fsheetWrap' + (filters ? ' show' : '')} onClick={(e) => e.target === e.currentTarget && setFilters(false)}>
        <div className="fsheet">
          <div className="fshead">
            <div className="fstitle">Map Filters</div>
            <div className="fsclose" onClick={() => setFilters(false)}>
              ×
            </div>
          </div>

          <FSec title="Camps" onAll={() => groupAll(['q', 's'])} onNone={() => groupNone(['q', 's'])}>
            <FGrp name="Quality" kind="q" sets={sets} toggle={toggle} />
            <FGrp name="Size" kind="s" sets={sets} toggle={toggle} />
          </FSec>
          <FSec title="Rapids" onAll={() => groupAll(['d'])} onNone={() => groupNone(['d'])}>
            <FGrp name="Difficulty" kind="d" sets={sets} toggle={toggle} />
          </FSec>
          <FSec title="Hikes" onAll={() => groupAll(['hq', 'hd'])} onNone={() => groupNone(['hq', 'hd'])}>
            <FGrp name="Quality" kind="hq" sets={sets} toggle={toggle} />
            <FGrp name="Difficulty" kind="hd" sets={sets} toggle={toggle} />
          </FSec>

          <div className="fshint">
            Tap a number to hide it · camp quality &amp; size run 1–9, hikes run 1–5. Items with no rating stay on the
            map unless you use Hide all, which clears the whole category.
          </div>

          <div className="fsfoot">
            <button
              className="tsbtn"
              type="button"
              onClick={() => {
                setSets(allOn());
                setHide({ c: false, r: false, h: false });
              }}
            >
              Reset all
            </button>
            <button className="tsbtn solid" type="button" onClick={() => setFilters(false)}>
              Done
            </button>
          </div>
        </div>
      </div>

      <DetailSheet
        sheet={sheet}
        trip={s.trip}
        onClose={() => {
          setSheet(null);
          setSel(null);
        }}
      />
    </div>
  );
}

// River > Map > Topo: the real map, the same detail sheet, and dropped pins with their own sun data
function RiverTopo({ s }) {
  const [sheet, setSheet] = useState(null);
  const [focus, setFocus] = useState(null);
  const [, setRev] = useState(0);
  useEffect(() => onGeoChange(() => setRev((r) => r + 1)), []);
  const planned = useMemo(
    () => new Set(Object.values(s.trip?.plans || {}).filter((p) => p.camp).map((p) => p.camp)),
    [s.trip]
  );
  const colors = useMemo(() => ({ camp: qColor, hike: hColor, rapid: RAPIDCOL }), []);
  const date = s.trip && okDate(s.trip.start) ? s.trip.start : null;
  const open = (kind, item) => {
    setSheet({ kind: kind === 'landmark' ? 'rapid' : kind, item, geoKind: kind });
    // the shade timeline shows direct sun for the last camp or pin you opened
    if (kind === 'camp') {
      const p = position(RIVER.id, 'camp', item), h = campHorizon(RIVER.id, item);
      if (p && h) setFocus({ id: 'c:' + item.name, name: item.name, lat: p.lat, lon: p.lon, h });
    } else if (kind === 'drop') setFocus({ id: item.id, name: item.name, lat: item.lat, lon: item.lon, h: dropHorizon(item) });
  };
  // a dropped pin's horizon arrives a moment after the pin: keep the sheet and the focus on the live record
  const live = sheet?.kind === 'drop' ? drops().find((d) => d.id === sheet.item.id) : null;
  const shown = sheet?.kind === 'drop' ? (live ? { ...sheet, item: live } : null) : sheet;
  const f = focus && live && focus.id === live.id && !focus.h && live.h ? { ...focus, h: dropHorizon(live) } : focus;
  return (
    <div className="topoWrap">
      <TopoMap
        rid={RIVER.id}
        river={RIVER}
        planned={planned}
        colors={colors}
        date={date}
        onOpen={open}
        focus={f}
        onClearFocus={() => setFocus(null)}
      />
      <DetailSheet
        sheet={shown}
        trip={s.trip}
        onClose={() => setSheet(null)}
        actions={shown && shown.kind === 'hike' ? <HikeTrack item={shown.item} /> : null}
      />
    </div>
  );
}

function HikeTrack({ item }) {
  const [err, setErr] = useState('');
  const [, bump] = useState(0);
  const track = hikeTrack(RIVER.id, item);
  const st = track ? trackStats(track) : null;
  return (
    <div className="pinActions">
      {st ? (
        <div className="small">
          Track {st.miles.toFixed(1)} mi{st.gainFt != null ? ` · ${Math.round(st.gainFt).toLocaleString()} ft gain` : ''}
        </div>
      ) : null}
      <div className="row">
        <label className="btn ghost">
          {track ? 'Replace GPX' : 'Attach GPX track'}
          <input
            type="file"
            accept=".gpx,application/gpx+xml,application/xml,text/xml"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                setHikeTrack(RIVER.id, item, parseGPX(await file.text()));
                setErr('');
                bump((n) => n + 1);
              } catch (x) {
                setErr(x.message);
              }
            }}
          />
        </label>
        {track ? (
          <button className="btn ghost" onClick={() => { setHikeTrack(RIVER.id, item, null); bump((n) => n + 1); }}>Remove track</button>
        ) : null}
      </div>
      {err ? <div className="muted small">{err}</div> : null}
    </div>
  );
}

// the sky from one spot for one day: when the sun clears the walls and when it goes behind them
function SpotSun({ lat, lon, h, iso }) {
  if (!h) return null;
  const cs = sunDay(iso, lat, lon, RIVER.tz, h);
  return (
    <div className="spotSun">
      <div className="campSun">
        <Icon name="sunset" size={16} />
        <span>
          {cs.on ? (
            <>
              Direct sun <b>{clock(cs.on)}</b> – <b>{clock(cs.off)}</b> · {cs.hours.toFixed(1)} h
              {cs.spans.length > 1 ? <> (in {cs.spans.length} spells: {cs.spans.map(([a, b]) => `${clock(a)}–${clock(b)}`).join(', ')})</> : null}
            </>
          ) : (
            <>No direct sun</>
          )}
          <span className="muted"> · {fmt(iso)} · open-sky sunrise {clock(cs.rise)}, sunset {clock(cs.set)}</span>
        </span>
      </div>
      <SunChart h={h} lat={lat} lon={lon} iso={iso} tz={RIVER.tz} />
      <div className="muted small">The shaded shape is the skyline from this spot; the line is the sun's path. Solid = direct sun, dashed = behind the walls.</div>
    </div>
  );
}

function DropDetails({ d, trip }) {
  const [iso, setIso] = useState(trip && okDate(trip.start) ? trip.start : todayISO());
  const h = dropHorizon(d);
  return (
    <>
      <div className="row mb-s">
        <Field value={d.name} onChange={(e) => updateDrop(d.id, { name: e.target.value })} placeholder="Name" />
        <Field type="date" value={iso} onChange={(e) => okDate(e.target.value) && setIso(e.target.value)} />
      </div>
      {h ? <SpotSun lat={d.lat} lon={d.lon} h={h} iso={iso} /> : <div className="muted">Working out the walls around this spot…</div>}
      <div className="row mt">
        <button
          className="btn ghost"
          onClick={() => saveFile('eddy-pins.gpx', dropsGPX(drops()), 'application/gpx+xml')}
        >
          Export pins (GPX)
        </button>
        <button className="btn ghost danger" onClick={() => removeDrop(d.id)}>Delete pin</button>
      </div>
    </>
  );
}

// a raft seen from above, bow downstream (up the chart), marking the mile shown in the header
const RaftMark = ({ style }) => (
  <div className="reachraft" style={style} aria-hidden="true">
    <svg width="17" height="25" viewBox="0 0 17 25">
      <path d="M1 12.5h3M13 12.5h3" stroke="#5a3a1e" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="2.5" y="1" width="12" height="23" rx="6" fill="#c0532f" stroke="#6e2414" strokeWidth="1" />
      <rect x="5.2" y="4.6" width="6.6" height="15.8" rx="3.3" fill="#ead6b8" />
      <path d="M4.2 9.4h8.6M4.2 15.6h8.6" stroke="#6e2414" strokeWidth="1.5" />
    </svg>
  </div>
);

const FSec = ({ title, onAll, onNone, children }) => (
  <div className="fsec">
    <div className="fseckicker">
      {title}
      <span className="fsecbtns">
        <span className="fseclink" onClick={onAll}>
          Show all
        </span>
        <span className="fseclink hide" onClick={onNone}>
          Hide all
        </span>
      </span>
    </div>
    {children}
  </div>
);

function FGrp({ name, kind, sets, toggle }) {
  const max = FMAX[kind];
  return (
    <div className="fgrp">
      <span className="fgname">{name}</span>
      <div className="fgchips chips">
        {Array.from({ length: max }, (_, i) => i + 1).map((d) => {
          const off = !sets[kind].has(d);
          const style =
            kind === 'q'
              ? { background: QCOLORS[d - 1], color: d <= 4 ? '#3a2818' : '#f3efd6' }
              : kind === 'd'
                ? { background: RAPIDCOL, color: '#f3e6cf' }
                : kind === 'hq'
                  ? { background: HQCOLORS[d - 1], color: d <= 2 ? '#3a2818' : '#f3efd6' }
                  : kind === 'hd'
                    ? { background: '#c9a68f', color: '#3a2818' }
                    : { background: '#b3a585', color: '#3a2818' };
          return (
            <div
              key={d}
              className={'chip' + (max === 9 ? '' : ' sm') + (off ? ' off' : '')}
              style={style}
              onClick={() => toggle(kind, d)}
            >
              {d}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailSheet({ sheet, onClose, trip, actions }) {
  if (!sheet) return <div className="sheet" />;
  const { kind, item: d } = sheet;
  let name = '';
  let meta = null;
  let desc = null;
  let foot = '';

  if (kind === 'rapid') {
    name = d.name;
    meta = d.civ ? (
      <>
        <span>
          River Mile <b>{d.mile}</b>
        </span>
        <span>Landmark</span>
      </>
    ) : (
      <>
        <span>
          River Mile <b>{d.mile}</b>
        </span>
        <span>
          Difficulty <b>{d.diff}/9</b>
        </span>
        <span>{d.tier}</span>
      </>
    );
    desc = d.desc || '';
  } else if (kind === 'camp') {
    name = d.name;
    const sw = sizeWord(d.size);
    const qw = qualWord(d.qual);
    meta = (
      <>
        <span>
          River Mile <b>{d.mile}</b>
        </span>
        <span>
          <span className="qdot" style={{ background: qColor(d.qual) }} />
          Quality <b>{d.qual == null ? '—' : d.qual + '/9'}</b>
        </span>
        <span>
          Size <b>{d.size == null ? '—' : d.size + '/9'}</b>
        </span>
        <span>
          River <b>{d.bank === 'R' ? 'right' : d.bank === 'L' ? 'left' : '—'}</b>
        </span>
      </>
    );
    desc = d.desc || (sw && qw ? `A ${sw}, ${qw} campsite.` : 'Camp size and quality not recorded for this site.');
    if (/Hualapai Permit/i.test(d.name)) desc += ' Requires a Hualapai permit.';
    const cp = position(RIVER.id, 'camp', d), ch = campHorizon(RIVER.id, d);
    desc = (
      <>
        <div>{desc}</div>
        {cp && ch ? <SpotSun lat={cp.lat} lon={cp.lon} h={ch} iso={campDate(trip, d)} /> : <CampSunLine c={d} iso={campDate(trip, d)} />}
        {cp ? <div className="muted small mt">{cp.lat.toFixed(5)}, {cp.lon.toFixed(5)} · {cp.gps ? 'GPS position' : 'placed from the river mile'}</div> : null}
      </>
    );
    foot = RIVER.notes.camp;
  } else if (kind === 'drop') {
    name = d.name || 'Pin';
    meta = (
      <>
        <span>
          <b>{d.lat.toFixed(5)}, {d.lon.toFixed(5)}</b>
        </span>
        {d.elev != null ? (
          <span>
            Elevation <b>{Math.round(d.elev * 3.28084).toLocaleString()} ft</b>
          </span>
        ) : null}
        {d.near ? (
          <span>
            Near mile <b>{d.near.mile}</b> · river {d.near.side === 'R' ? 'right' : 'left'} · {Math.round(d.near.m * 3.28084).toLocaleString()} ft from the river
          </span>
        ) : null}
      </>
    );
    desc = <DropDetails d={d} trip={trip} />;
  } else if (kind === 'geo') {
    name = d.full;
    meta = (
      <>
        <span>
          River Mile <b>{d.s}–{d.hi}</b>
        </span>
        <span>{d.era}</span>
        <span>{d.age}</span>
      </>
    );
    desc = d.d;
  } else if (kind === 'hike') {
    name = d.name;
    meta = (
      <>
        <span>
          River Mile <b>{d.mile}</b>
        </span>
        <span>{hBank(d.bank)}</span>
        <span>
          Est. Time: <b>{hTime(d.time)}</b>*
        </span>
        <span>
          <span className="qdot" style={{ background: hColor(d.qual) }} />
          Quality <b className="stars">{hStars(d.qual)}</b>
        </span>
      </>
    );
    desc = (
      <>
        <div className="hdiff">
          {d.diff != null ? (<><b>Difficulty {d.diff}/5</b> — {RIVER.hdiff[d.diff] || ''}</>) : null}
        </div>
        <div>{d.desc || ''}</div>
      </>
    );
    foot = RIVER.notes.hike;
  }

  return (
    <div className="sheet show">
      <div className="grab" />
      <span className="close" onClick={onClose}>
        ×
      </span>
      <div className="iname">{name}</div>
      <div className="imeta">{meta}</div>
      <div className="idesc">{desc}</div>
      {actions}
      <div className="ifoot" style={{ whiteSpace: 'pre-line' }}>
        {foot}
      </div>
    </div>
  );
}

function Search({ data, placeholder, render }) {
  const [q, setQ] = useState('');
  const hits = useMemo(
    () => data.filter((x) => x.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.mile - b.mile),
    [q, data]
  );
  return (
    <>
      <Field value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      {hits.map(render)}
    </>
  );
}

const Rapids = () => (
  <Search
    data={RIVER.rapids}
    placeholder="Rapid"
    render={(r, i) => (
      <Acc
        key={i}
        title={`${r.mile.toFixed(1)}  ${r.name}`}
        note={`${r.tier} · ${r.diff}`}
        tag={r.diff >= 8 ? <Tag label="major" tint="#9c3326" /> : null}
      >
        <div className="line">{r.desc}</div>
      </Acc>
    )}
  />
);

function Camps({ s }) {
  const t = s?.trip;
  const [iso, setIso] = useState(t && okDate(t.start) ? t.start : todayISO());
  const geo = hasGeo(RIVER.id);
  return (
    <>
      {geo ? (
        <div className="row mb campSunDate">
          <Field label="Sun in camp on" type="date" value={iso} onChange={(e) => okDate(e.target.value) && setIso(e.target.value)} />
        </div>
      ) : null}
      <Search
        data={RIVER.camps}
        placeholder="Camp"
        render={(c, i) => {
          const cs = geo ? campSunOn(c, iso) : null;
          return (
            <div className="listRow" key={i}>
              <span className="mile">{c.mile.toFixed(1)}</span>
              <span>
                {c.name} <span className="muted">{[c.bank, c.size != null ? 'size ' + c.size : '', c.qual != null ? 'qual ' + c.qual : ''].filter(Boolean).join(' · ')}</span>
                {cs ? (
                  <span className="campSunRow">
                    {cs.on ? `sun ${clock(cs.on)} – ${clock(cs.off)} · ${cs.hours.toFixed(1)} h` : 'no direct sun'}
                  </span>
                ) : null}
              </span>
            </div>
          );
        }}
      />
    </>
  );
}

const Hikes = () => (
  <Search
    data={RIVER.hikes}
    placeholder="Hike"
    render={(h, i) => (
      <Acc key={i} title={`${h.mile.toFixed(1)}  ${h.name}`} note={[h.bank, h.time, h.diff].filter(Boolean).join(' · ')}>
        <div className="line">{h.desc}</div>
      </Acc>
    )}
  />
);

const Geology = () =>
  RIVER.geology.map((g, i) => (
    <Acc key={i} title={g.full || g.n} note={`${g.s}–${g.e} · ${g.age}`}>
      <div className="swatch" style={{ background: g.c }} />
      <div className="line">{g.d}</div>
    </Acc>
  ));

function Guide() {
  const [g, setG] = useState(0);
  return (
    <>
      <div className="chips">
        {RIVER.guide.map((x, i) => (
          <button key={x.name} className={'chip' + (g === i ? ' on river' : '')} onClick={() => setG(i)}>
            {x.name}
          </button>
        ))}
      </div>
      {(RIVER.guide[g]?.subs || []).map((sub) => (
        <Acc key={sub.name} title={sub.name} note={String(sub.items.length)}>
          {sub.items.map((it, i) => (
            <div className="line mb-s" key={i}>
              <b>{it.n}</b> {it.d}
            </div>
          ))}
        </Acc>
      ))}
    </>
  );
}

function Almanac() {
  const keys = Object.keys(RIVER.almanac);
  const [k, setK] = useState(keys[0]);
  return (
    <>
      <div className="chips">
        {keys.map((x) => (
          <button key={x} className={'chip' + (k === x ? ' on river' : '')} onClick={() => setK(x)}>
            {x}
          </button>
        ))}
      </div>
      {(RIVER.almanac[k] || []).map(([title, body], i) => (
        <Acc key={i} title={title}>
          <div className="line pre">{clean(body)}</div>
        </Acc>
      ))}
    </>
  );
}

const nf = (n) => Number(n).toLocaleString('en-US');

// The river at a glance: class, length, elevation, gradient, season, recommended flow and the gauges to watch.
function Overview() {
  const st = RIVER.stats || {};
  const f = st.flow || {};
  const len = +(RIVER.miles[1] - RIVER.miles[0]).toFixed(1);
  const el = st.elev || [];
  const tiles = [
    ['Class', st.class, '', true],
    ['Length', len + ' mi'],
    ['Put-in', el[0] != null ? nf(el[0]) + ' ft' : null],
    ['Take-out', el[1] != null ? nf(el[1]) + ' ft' : null],
    ['Gradient', st.gradient != null ? st.gradient + ' ft/mi' : null, st.steep ? `${st.steep.gradient} ft/mi at its steepest, over ${st.steep.miles} mi from mile ${st.steep.from}` : ''],
    ['Season', st.season, '', true],
  ].filter((t) => t[1]);
  // an odd half-width tile would leave a blank cell, so let the last one span the row
  const half = tiles.filter((t) => !t[3]);
  if (half.length % 2) half[half.length - 1][3] = true;
  const range = f.min != null && f.max != null ? `${nf(f.min)} to ${nf(f.max)}` : f.min != null ? `At least ${nf(f.min)}` : f.max != null ? `Up to ${nf(f.max)}` : '';
  const tick = f.min != null && f.max != null && f.typical != null && f.max > f.min ? Math.max(0, Math.min(100, ((f.typical - f.min) / (f.max - f.min)) * 100)) : null;
  let prev = null;
  return (
    <>
      <div className="ovTiles">
        {tiles.map(([k, v, sub, wide]) => (
          <div className={'ovTile' + (wide ? ' wide' : '')} key={k}>
            <div className="ovKey">{k}</div>
            <div className="ovVal">{v}</div>
            {sub ? <div className="ovSub">{sub}</div> : null}
          </div>
        ))}
      </div>
      {range || f.typical != null || f.note ? (
        <div className="mt">
          <span className="label">{range || f.typical != null ? 'Recommended flow' : 'Flow'}</span>
          <div className="card ovFlow">
            {range ? (
              <div className="ovRange">
                {range} <span className="ovUnit">cfs</span>
              </div>
            ) : null}
            {f.min != null && f.max != null ? (
              <div className="ovTrack" aria-hidden="true">
                {tick != null ? <span className="ovTick" style={{ left: tick + '%' }} /> : null}
              </div>
            ) : null}
            {f.typical != null ? <div className="ovSub">Typical {nf(f.typical)} cfs</div> : null}
            {f.note ? <div className="ovNote">{clean(f.note)}</div> : null}
          </div>
        </div>
      ) : null}
      {(st.bands || []).length ? (
        <div className="mt">
          <span className="label">What each flow feels like</span>
          <div className="card permitList">
            {st.bands.map((b, i) => {
              const from = prev;
              prev = b.upto;
              return (
                <div className="permitItem" key={i}>
                  <div className="permitT">
                    {from == null ? `Up to ${nf(b.upto)} cfs` : `${nf(from)} to ${nf(b.upto)} cfs`} · {b.label}
                  </div>
                  <div className="permitD">{clean(b.d)}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {(st.craft || []).length ? (
        <div className="mt">
          <span className="label">Good for</span>
          <div className="chips">
            {st.craft.map((c) => (
              <span className="chip" key={c}>
                {c}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {(st.gauges || []).length ? (
        <div className="mt">
          <span className="label">Gauges to watch</span>
          <div className="card permitList">
            {st.gauges.map((g, i) => (
              <div className="permitItem ovGauge" key={i}>
                <div className="permitT">{g.name}</div>
                {g.id ? (
                  <button className="linkBtn" onClick={() => openUrl('https://waterdata.usgs.gov/monitoring-location/' + g.id + '/')}>
                    USGS {g.id}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

const Permits = () => {
  const p = RIVER.permit;
  if (!p) return null;
  const c = p.contact || {};
  return (
    <>
      <div className="card permitHead">
        <div className="cardTop">
          <div className="serif">{RIVER.name}</div>
        </div>
        <div className="permitStatus">{p.status}</div>
        {p.apply ? (
          <button className="btn block" onClick={() => openUrl(p.apply.url)}>
            {p.apply.label}
          </button>
        ) : null}
        <div className="permitContact">
          {c.phone ? <a href={'tel:' + c.phone.replace(/[^0-9+]/g, '')}>{c.phone}</a> : null}
          {c.email ? <a href={'mailto:' + c.email}>{c.email}</a> : null}
          {c.web ? (
            <button className="linkBtn" onClick={() => openUrl(c.web)}>
              Agency page
            </button>
          ) : null}
        </div>
      </div>
      {p.sections.map((g) => (
        <div className="mt" key={g.name}>
          <span className="label">{g.name}</span>
          <div className="card permitList">
            {g.items.map((r, i) => (
              <div className="permitItem" key={i}>
                <div className="permitT">{r.t}</div>
                <div className="permitD">{clean(r.d)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
};

const Rules = () =>
  RIVER.rules.map((g) => (
    <div className="mt" key={g.name}>
      <span className="label">{g.name}</span>
      {g.rules.map((r, i) => (
        <Acc key={i} title={r.t}>
          <div className="line">{clean(r.d)}</div>
        </Acc>
      ))}
    </div>
  ));

/* ---------- general ---------- */

function Account({ s }) {
  const [prov, setProv] = useState(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email'); // email -> code
  const [dn, setDn] = useState(() => {
    const m = s.session && s.session.user && s.session.user.user_metadata;
    return (m && (m.full_name || m.name)) || savedName();
  });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    authApi.loadProviders().then(setProv);
  }, []);
  const run = async (fn) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setMsg(netMsg(e));
    }
    setBusy(false);
  };
  const user = s.session && s.session.user;
  const stLabel = { busy: 'Syncing…', ok: 'Your trips are backed up and in sync', offline: 'Offline. Changes will sync when you are back online' }[s.cloudStatus] || '';

  if (user) {
    const name = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || '';
    return (
      <>
        <div className="card formCard">
          <span className="label">Display name</span>
          <div className="muted mb-s">Shown to people on trips you share. A first name or nickname is fine.</div>
          <div className="row">
            <Field value={dn} onChange={(e) => setDn(e.target.value)} placeholder="Your name" />
            <button
              className="btn"
              disabled={busy || !dn.trim() || dn.trim() === name}
              onClick={() =>
                run(async () => {
                  const v = dn.trim().slice(0, 40);
                  await authApi.setDisplayName(v);
                  try {
                    localStorage.setItem(NAME_KEY, v);
                  } catch {}
                  for (const [id, e] of Object.entries(s.sync)) if (e.trip && !e.removed) await s.renameMe(id, v).catch(() => {});
                  setMsg('Saved.');
                })
              }
            >
              Save
            </button>
          </div>
        </div>
        <div className="card formCard mt">
          <span className="label">Signed in</span>
          <div className="serif" style={{ marginBottom: 4 }}>{name || user.email}</div>
          {name ? <div className="muted">{user.email}</div> : null}
          {stLabel ? <div className="muted mt-s"><Icon name="cloud" size={14} /> {stLabel}</div> : null}
          <div className="row mt">
            <button className="btn ghost" onClick={() => s.cloudNow()}>
              <Icon name="refresh" size={16} /> Sync now
            </button>
          </div>
        </div>
        <div className="card formCard mt">
          <span className="label">Sign out</span>
          <button className="btn ghost block" onClick={() => run(() => s.signOut(false))}>
            Sign out (keep trips on this device)
          </button>
          <button
            className="btn ghost block"
            onClick={() => window.confirm('Sign out and remove your synced trips from this device? They stay in your account and come back when you sign in again.') && run(() => s.signOut(true))}
          >
            Sign out and remove trips from this device
          </button>
        </div>
        <div className="card formCard dangerCard mt">
          <span className="label">Delete account</span>
          <div className="muted mb-s">Permanently deletes your account, your backed-up trips on our server, and any trips you shared with a join code. Trips on this device stay unless you erase them.</div>
          <button
            className="btn ghost danger"
            onClick={() =>
              window.confirm('Delete your account? This permanently deletes your account, your backed-up trips and any trips you shared. It cannot be undone.') &&
              window.confirm('Really delete the account?') &&
              run(async () => {
                await s.deleteAccount();
                setMsg('Your account was deleted.');
              })
            }
          >
            <Icon name="trash" size={16} /> Delete my account
          </button>
          {msg ? <div className="warn mb-s">{msg}</div> : null}
        </div>
      </>
    );
  }

  // Apple requires Sign in with Apple wherever another social login is offered
  const showApple = prov && prov.apple;
  const showGoogle = prov && prov.google && (!isNative || prov.apple);
  const none = prov && !prov.offline && !prov.email && !showApple && !showGoogle;
  return (
    <>
      <div className="card formCard">
        <span className="label">Account</span>
        <div className="muted mb-s">An account is optional. Sign in to back up your trips and keep them in sync across your phone and tablet. We only store your email address and your trips.</div>
        {!prov ? <div className="muted mb-s">Loading…</div> : null}
        {prov && prov.offline ? <div className="warn mb-s">Could not reach the sign-in service. Check your connection.</div> : null}
        {none ? <div className="warn mb-s">Sign-in is not available yet.</div> : null}
        {showApple ? (
          <button className="btn block" disabled={busy} onClick={() => run(() => authApi.oauth('apple'))}>
            Continue with Apple
          </button>
        ) : null}
        {showGoogle ? (
          <button className="btn ghost block" disabled={busy} onClick={() => run(() => authApi.oauth('google'))}>
            Continue with Google
          </button>
        ) : null}
        {prov && prov.email ? (
          <>
            {(showApple || showGoogle) && <div className="muted" style={{ textAlign: 'center', margin: '4px 0 12px' }}>or use your email</div>}
            {step === 'email' ? (
              <>
                <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoCapitalize="none" autoCorrect="off" autoComplete="email" inputMode="email" />
                <button
                  className="btn ghost block"
                  disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())}
                  onClick={() =>
                    run(async () => {
                      await authApi.emailCode(email);
                      setStep('code');
                    })
                  }
                >
                  {busy ? 'Sending…' : 'Email me a sign-in code'}
                </button>
                <div className="muted mt-s">
                  By continuing you agree to the{' '}
                  <button className="linkBtn inline" onClick={() => openUrl(TERMS_URL)}>
                    Terms of use
                  </button>{' '}
                  and{' '}
                  <button className="linkBtn inline" onClick={() => openUrl(POLICY_URL)}>
                    Privacy policy
                  </button>
                  .
                </div>
              </>
            ) : (
              <>
                <div className="muted mb-s">We sent a code to {email.trim()}. Enter it below.</div>
                <Field label="Code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" />
                <button className="btn block" disabled={busy || code.replace(/\s/g, '').length < 6} onClick={() => run(() => authApi.verifyCode(email, code))}>
                  {busy ? 'Checking…' : 'Sign in'}
                </button>
                <button className="btn ghost block" onClick={() => { setStep('email'); setCode(''); setMsg(''); }}>
                  Use a different email
                </button>
              </>
            )}
          </>
        ) : null}
        {msg ? <div className="warn mb-s">{msg}</div> : null}
      </div>
    </>
  );
}

const REMINDERS_KEY = 'eddy.v1.reminders';

function About({ s, part = 'about' }) {
  const [msg, setMsg] = useState('');
  const [rem, setRem] = useState(() => localStorage.getItem(REMINDERS_KEY) === '1');
  const file = useRef(null);

  const backup = async () => {
    const data = { app: 'eddy', format: 1, exported: new Date().toISOString(), trips: s.trips, rivers: s.rivers };
    const ok = await saveBackup(`eddy-backup-${today()}.json`, JSON.stringify(data));
    setMsg(ok ? 'Backup ready.' : 'Could not create the backup.');
  };
  const restore = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!['eddy', 'river-guide'].includes(data.app) || !Array.isArray(data.trips)) throw new Error('not an Eddy backup');
      const n = s.restore(data);
      success();
      setMsg(`Restored ${n} trip${n === 1 ? '' : 's'}.`);
    } catch {
      setMsg('That file is not an Eddy backup.');
    }
  };
  const toggleRem = async () => {
    if (rem) {
      localStorage.setItem(REMINDERS_KEY, '0');
      setRem(false);
      await clearReminders();
      setMsg('Reminders off.');
      return;
    }
    if (!(await remindersAllowed()) && !(await askReminders())) {
      setMsg('Notifications are off for Eddy. Turn them on in Settings → Notifications.');
      return;
    }
    localStorage.setItem(REMINDERS_KEY, '1');
    setRem(true);
    const n = await scheduleReminders(s.trips);
    setMsg(n ? `Reminders set for ${n} upcoming date${n === 1 ? '' : 's'}.` : 'Reminders on. They will appear for trips that have not started yet.');
  };

  return (
    <>
      {part === 'about' && (
      <div className="card formCard">
        <span className="label">Eddy</span>
        <div className="line">Plan river trips: crew, itinerary, meals, gear, shuttles and costs, with built-in guides for more than 20 western rivers.</div>
        <div className="muted mt-s">Version {APP_VERSION}</div>
      </div>
      )}

      {part === 'data' && (
      <div className="card formCard">
        <span className="label">Your data</span>
        <div className="muted mb-s">Trips are stored on this device. Sign in under Account to back them up, or save a backup file.</div>
        <button className="btn ghost block" onClick={backup}>
          Back up all trips
        </button>
        <button className="btn ghost block" onClick={() => file.current && file.current.click()}>
          Restore from backup
        </button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={restore} />
        {msg ? <div className="muted mb-s">{msg}</div> : null}
      </div>
      )}

      {part === 'data' && isNative && (
        <div className="card formCard mt">
          <span className="label">Trip reminders</span>
          <div className="muted mb-s">A notification a week before launch, the evening before, and on launch morning.</div>
          <button className={'btn ' + (rem ? '' : 'ghost')} onClick={toggleRem}>
            {rem ? 'Reminders on' : 'Turn on reminders'}
          </button>
        </div>
      )}

      {part === 'about' && (
      <div className="card formCard mt">
        <span className="label">Safety &amp; sources</span>
        <div className="muted mb-s">Eddy is a planning aid, not a source of truth. River, camp, hike, flow, permit and rule information is compiled from public agency publications, guidebooks and community knowledge, and it can be wrong, incomplete or out of date. Do not rely on this app to make decisions. Confirm current regulations, flows, closures and conditions with the managing agency and current guides, scout every rapid yourself, use your own judgment, and carry a satellite communicator. Medical and rescue pages are general reference only.</div>
      </div>

      )}

      {part === 'about' && SOURCES.some((x) => x.confirmed) && (
        <div className="card formCard mt">
          <span className="label">Sources &amp; credits</span>
          {SOURCES.filter((x) => x.confirmed).map((x, i) => (
            <div className="pair" key={i}>
              <div className="pairKey">{x.title}</div>
              {x.note ? <div className="line">{x.note}</div> : null}
            </div>
          ))}
        </div>
      )}

      {part === 'about' && (
      <div className="card formCard mt">
        <span className="label">Help</span>
        <button className="btn ghost block" onClick={() => openUrl(POLICY_URL)}>
          Privacy policy
        </button>
        <button className="btn ghost block" onClick={() => openUrl(TERMS_URL)}>
          Terms of use
        </button>
        <button className="btn ghost block" onClick={() => openUrl(SUPPORT_URL)}>
          Support &amp; feedback
        </button>
      </div>
      )}

      {part === 'data' && (
      <div className="card formCard dangerCard mt">
        <span className="label">Erase</span>
        <div className="muted mb-s">Deletes every trip and any rivers you added from this device. If you are signed in, your backed-up trips return at the next sync; sign out first, or delete your account, to remove them from the server.</div>
        <button
          className="btn ghost danger"
          onClick={() => {
            if (!window.confirm('Delete ALL trips and custom rivers from this device? This cannot be undone.')) return;
            s.wipe();
            setMsg('All data erased.');
          }}
        >
          <Icon name="trash" size={16} /> Erase all data
        </button>
      </div>
      )}
    </>
  );
}

function Safety() {
  const [tab, setTab] = useState(['Medical', 'Signals', 'Rescue', 'Swim'].includes(QS.get('sub')) ? QS.get('sub') : 'Medical');
  return (
    <>
      <Tabs items={['Medical', 'Signals', 'Rescue', 'Swim']} value={tab} onChange={setTab} />
      <div className="pad">
        {tab === 'Medical' && <Medical />}
        {tab === 'Signals' && <Pairs data={GENERAL.signals} />}
        {tab === 'Rescue' && <Pairs data={GENERAL.rescue} numbered />}
        {tab === 'Swim' && <Pairs data={GENERAL.swim} />}
      </div>
    </>
  );
}

function Profile({ s, initial, ctx }) {
  const [tab, setTab] = useState(initial || (['Account', 'Data', 'Feedback', 'About'].includes(QS.get('sub')) ? QS.get('sub') : 'Account'));
  return (
    <>
      <Tabs items={['Account', 'Data', 'Feedback', 'About']} value={tab} onChange={setTab} />
      <div className="pad">
        {tab === 'Account' && <Account s={s} />}
        {tab === 'Data' && <About s={s} part="data" />}
        {tab === 'Feedback' && <Feedback s={s} ctx={ctx} />}
        {tab === 'About' && <About s={s} part="about" />}
      </div>
    </>
  );
}

const DEVICE_KEY = 'eddy.device';
const deviceId = () => {
  try {
    let d = localStorage.getItem(DEVICE_KEY);
    if (!d) {
      d = remote.newSecret();
      localStorage.setItem(DEVICE_KEY, d);
    }
    return d;
  } catch {
    return remote.newSecret();
  }
};

function Feedback({ s, ctx }) {
  const user = s.session && s.session.user;
  const [kind, setKind] = useState('idea');
  const [text, setText] = useState('');
  const [reply, setReply] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [sent, setSent] = useState(false);
  const KINDS = [
    ['idea', 'Idea'],
    ['problem', 'Problem'],
    ['other', 'Other'],
  ];
  const contact = reply ? (user && user.email) || email.trim() : '';
  const ok = text.trim().length >= 3 && (!reply || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact));

  const send = async () => {
    setBusy(true);
    setMsg('');
    try {
      await remote.feedbackSubmit(kind, text.trim(), contact, deviceId(), {
        screen: ctx && ctx.screen,
        river: ctx && ctx.river,
        version: APP_VERSION,
        platform: isNative ? 'ios' : 'web',
        locale: navigator.language,
      });
      success();
      setSent(true);
      setText('');
    } catch (e) {
      setMsg(/too many/.test(e.message) ? 'Too many messages in a short time. Try again later.' : 'Could not send. Check your connection and try again.');
    }
    setBusy(false);
  };

  if (sent)
    return (
      <div className="card formCard">
        <span className="label">Sent</span>
        <div className="line">Thank you.</div>
        <button className="btn ghost block mt" onClick={() => setSent(false)}>
          Send another
        </button>
      </div>
    );

  return (
    <div className="card formCard">
      <div className="tabs" style={{ position: 'static', padding: 0, border: 0, background: 'none' }}>
        {KINDS.map(([k, label]) => (
          <button key={k} className={'tab' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>
            {label}
          </button>
        ))}
      </div>
      <Field
        area
        rows={6}
        maxLength={4000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={kind === 'idea' ? 'What should Eddy do?' : kind === 'problem' ? 'What went wrong?' : 'Tell us anything.'}
      />
      <label className="checkRow">
        <input type="checkbox" checked={reply} onChange={(e) => setReply(e.target.checked)} />
        <span>You can email me about this</span>
      </label>
      {reply && !user ? <Field value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" inputMode="email" autoComplete="email" /> : null}
      {reply && user ? <div className="muted">{user.email}</div> : null}
      <button className="btn block mt" disabled={!ok || busy} onClick={send}>
        {busy ? 'Sending' : 'Send'}
      </button>
      {msg ? <div className="muted mt">{msg}</div> : null}
    </div>
  );
}

function Disclaimer() {
  return (
    <div className="notice mb">
      <div className="noticeHead">
        <Icon name="alert" size={17} /> Reference only
      </div>
      <div className="muted">
        Not medical advice. This does not replace training or professional care. In an emergency call 911 or use your satellite SOS.
      </div>
    </div>
  );
}

function Medical() {
  const [q, setQ] = useState('');
  const groups = useMemo(
    () =>
      GENERAL.medical
        .map((g) => ({
          ...g,
          conditions: g.conditions.filter(
            (c) =>
              c.title.toLowerCase().includes(q.toLowerCase()) ||
              c.recognize.some((r) => r.toLowerCase().includes(q.toLowerCase()))
          ),
        }))
        .filter((g) => g.conditions.length),
    [q]
  );
  return (
    <>
      <Disclaimer />
      <Field value={q} onChange={(e) => setQ(e.target.value)} placeholder="Symptom or condition" />
      {groups.map((g) => (
        <div className="mt" key={g.name}>
          <span className="label">{g.name}</span>
          {g.conditions.map((c) => (
            <Acc key={c.title} title={c.title} tag={<Tag label={`E${c.evac}`} tint={EVAC[c.evac]} />}>
              {c.recognize.map((r, i) => (
                <div className="line" key={i}>• {r}</div>
              ))}
              <div className="rule" />
              {c.treat.map((r, i) => (
                <div className="line" key={i}>• {r}</div>
              ))}
            </Acc>
          ))}
        </div>
      ))}
    </>
  );
}

const Pairs = ({ data, numbered }) =>
  data.map(([a, b], i) => (
    <div className="pair" key={a}>
      <div className="pairKey">{numbered ? `${i + 1}. ${a}` : a}</div>
      <div className="line">{b}</div>
    </div>
  ));

const GearRef = () => (
  <div className="mt">
    <span className="label">Packing reference</span>
    {Object.entries(GENERAL.gear).map(([cat, items]) => (
      <Acc key={cat} title={cat} note={items.length + ' items'}>
        {items.map((x) => (
          <div className="line" key={x}>{x}</div>
        ))}
      </Acc>
    ))}
  </div>
);

const Card = ({ s }) => (
  <>
    <div className="muted mb">Read this out in an emergency. Give the river mile and bank first.</div>
    <div className="card red">
      <div className="line">{RIVER.name} — {RIVER.reach}</div>
      <div className="line">{RIVER.coords[0].toFixed(5)}, {RIVER.coords[1].toFixed(5)}</div>
      <div className="line">{RIVER.agency}</div>
    </div>
    {s.trip && (
      <div className="card mt">
        <span className="label">{s.trip.name}</span>
        <div className="line">
          {okDate(s.trip.start) ? `${fmt(s.trip.start)} ${s.trip.start.slice(0, 4)}` : s.trip.start} · {s.trip.days} days · {s.trip.crew.length} people
        </div>
        {s.trip.crew.map((c) => (
          <div className="mt-s" key={c.id}>
            <div className="line">
              <b>{c.name}</b>
              {c.boat ? ` · ${((s.trip.boats || []).find((b) => b.id === c.boat) || {}).name || ''}` : ''}
            </div>
            {c.ice ? <div className="muted">{c.ice}</div> : null}
            {c.diet ? <div className="muted">{c.diet}</div> : null}
          </div>
        ))}
      </div>
    )}
  </>
);

/* ---------- trips list ---------- */

const riverOf = (t) => (t && t.river) || DEFAULT_RIVER;
const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'river';

function NewTrip({ s, preset, onDone, onCancel }) {
  const rivers = s.riverList();
  const [rid, setRid] = useState(preset || (s.trip && riverOf(s.trip)) || DEFAULT_RIVER);
  const rec = rivers.find((r) => r.id === rid) || rivers[0];
  const [name, setName] = useState('');
  const [start, setStart] = useState(today());
  const [len, setLen] = useState(String(rec.days || 7));
  const [touched, setTouched] = useState(false);
  const n = parseInt(len, 10);
  const ok = okDate(start) && n > 0 && n <= 60;
  const fallback = `${rec.name} ${start.slice(0, 4)}`;
  return (
    <div className="pad">
      <h1>New trip</h1>
      <Sel
        label="River"
        value={rid}
        onChange={(v) => {
          setRid(v);
          if (!touched) setLen(String(rivers.find((r) => r.id === v)?.days || 7));
        }}
      >
        {rivers.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
            {r.reach ? ` — ${r.reach}` : ''}
          </option>
        ))}
      </Sel>
      <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder={fallback} />
      <div className="row">
        <Field label="Launch" value={start} onChange={(e) => setStart(e.target.value)} placeholder="YYYY-MM-DD" />
        <Field
          label="Days"
          value={len}
          onChange={(e) => {
            setTouched(true);
            setLen(e.target.value);
          }}
          inputMode="numeric"
          className="narrow"
        />
      </div>
      <div className="row">
        <button
          className="btn"
          disabled={!ok}
          onClick={() => {
            s.create({ name: name.trim() || fallback, start, days: n, river: rid });
            onDone && onDone();
          }}
        >
          Create
        </button>
        {onCancel && (
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

const syncLabel = (st, owner) => ({ busy: 'Syncing…', ok: owner ? 'Shared · up to date' : 'Shared with you · up to date', offline: 'Shared · offline, will sync later', gone: 'Sharing was stopped', removed: 'You were removed from this trip' }[st] || (owner ? 'Shared' : 'Shared with you'));

function tripStatus(t) {
  if (!okDate(t.start)) return null;
  const toStart = dnum(t.start, today());
  const into = -toStart;
  if (toStart > 0) return { cls: 'soon', text: toStart === 1 ? 'Tomorrow' : `In ${toStart} days` };
  if (into <= t.days) return { cls: 'live', text: `Day ${into + 1} of ${t.days + 1}` };
  return { cls: 'done', text: 'Completed' };
}

const netMsg = (e) => (/Failed to fetch|NetworkError|Load failed|network/i.test(String((e && e.message) || e)) ? 'No internet connection. Try again when you are online.' : (e && e.message) || 'Something went wrong.');

function WhoAreYou({ s, tripId, onDone }) {
  const t = s.trips.find((x) => x.id === tripId);
  const [name, setName] = useState(() => savedName());
  const [adding, setAdding] = useState(false);
  const finish = (crewId, crewName) => {
    if (crewId) setMeFor(tripId, crewId);
    if (crewName) s.renameMe(tripId, crewName).catch(() => {});
    try {
      localStorage.setItem('eddy.v1.joinedNudge', '1');
    } catch {}
    onDone();
  };
  if (!t) return <div className="pad muted">Joining…</div>;
  return (
    <div className="pad">
      <h1>Which one are you?</h1>
      {(t.crew || []).map((c) => (
        <button key={c.id} className="btn ghost block mb-s" onClick={() => finish(c.id, c.name)}>
          {c.name}
        </button>
      ))}
      {!adding ? (
        <button className="btn ghost block mt" onClick={() => setAdding(true)}>
          I'm not listed
        </button>
      ) : (
      <div className="mt">
        <Field label="Your name" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        <button
          className="btn block"
          disabled={!name.trim()}
          onClick={() => {
            const id = uid();
            s.push('crew', { id, name: name.trim(), role: '', boat: '', ice: '', diet: '', days: '' });
            finish(id, name.trim());
          }}
        >
          Add me
        </button>
      </div>
      )}
      <button className="linkBtn mt" onClick={() => finish('')}>
        Skip
      </button>
    </div>
  );
}

function JoinTrip({ s, initial, by, onJoined, onCancel }) {
  const [code, setCode] = useState(initial || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [peek, setPeek] = useState(null); // preview of the invited trip
  const [yourName, setYourName] = useState(() => savedName());
  useEffect(() => {
    const c = remote.cleanCode(code);
    if (!c) {
      setPeek(null);
      return;
    }
    let live = true;
    remote
      .v2Peek(c)
      .then(async (p) => {
        if (p && !p.missing) return { name: p.name, start: p.start, days: p.days, people: p.people, role: p.role, by: p.by };
        const g = await remote.get(c, 0); // a trip shared before members existed
        return g && g.data && !g.missing && !g.upgraded ? { name: g.data.name, start: g.data.start, days: g.data.days, people: (g.data.crew || []).length } : { missing: true };
      })
      .then((p) => live && setPeek(p))
      .catch(() => live && setPeek(null));
    return () => {
      live = false;
    };
  }, [code]);
  const join = async () => {
    setBusy(true);
    setErr('');
    try {
      const id = await s.joinTrip(code, yourName);
      success();
      onJoined(id);
    } catch (e) {
      setErr(netMsg(e));
    }
    setBusy(false);
  };
  return (
    <div className="pad">
      <h1>{peek && peek.name ? (by || peek.by ? (by || peek.by) + ' invited you' : "You're invited") : 'Join a trip'}</h1>
      {peek && peek.name ? (
        <div className="card mb">
          <div className="serif">{peek.name}</div>
          <div className="muted">
            {okDate(peek.start) ? `${fmt(peek.start)} to ${fmt(addDays(peek.start, peek.days))} · ` : ''}
            {peek.people} {peek.people === 1 ? 'person' : 'people'}
            {peek.role === 'viewer' ? ' · view only' : ''}
          </div>
        </div>
      ) : peek && peek.missing ? (
        <div className="warn mb-s">This invite is no longer active. Ask for a new one.</div>
      ) : (
        <div className="muted mb-s">Paste the invite code you were sent.</div>
      )}
      <Field
        label="Join code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="XXXX-XXXX-XXXX-XXXX"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
      />
      <Field label="Your name" value={yourName} onChange={(e) => setYourName(e.target.value)} placeholder="First name or nickname" autoComplete="name" />
      {err ? <div className="warn mb-s">{err}</div> : null}
      <div className="muted mb-s">
        By joining you agree to the{' '}
        <button className="linkBtn inline" onClick={() => openUrl(TERMS_URL)}>
          Terms of use
        </button>{' '}
        and{' '}
        <button className="linkBtn inline" onClick={() => openUrl(POLICY_URL)}>
          Privacy policy
        </button>
        .
      </div>
      <div className="row">
        <button className="btn" disabled={busy || !remote.cleanCode(code) || !yourName.trim()} onClick={join}>
          {busy ? 'Joining…' : 'Join trip'}
        </button>
        <button className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Trips({ s, preset, clearPreset, joinCode, joinBy, clearJoin, welcome, setWelcome, onOpen, onAccount }) {
  const [adding, setAdding] = useState(!!preset);
  const [joining, setJoining] = useState(!!joinCode);
  useEffect(() => {
    if (joinCode) setJoining(true);
  }, [joinCode]);
  useEffect(() => {
    if (preset) setAdding(true);
  }, [preset]);
  if (welcome)
    return (
      <WhoAreYou
        s={s}
        tripId={welcome}
        onDone={() => {
          setWelcome('');
          onOpen();
        }}
      />
    );
  if (joining)
    return (
      <JoinTrip
        s={s}
        initial={joinCode}
        by={joinBy}
        onCancel={() => {
          setJoining(false);
          clearJoin();
        }}
        onJoined={(id) => {
          setJoining(false);
          clearJoin();
          setWelcome(id);
        }}
      />
    );
  const rivers = s.riverList();
  const rname = (id) => rivers.find((r) => r.id === id)?.name || 'Unknown river';
  const groups = [...new Set(s.trips.map(riverOf))];
  const done = () => {
    setAdding(false);
    clearPreset();
  };
  return (
    <div className="pad">
      {adding ? (
        <NewTrip
          s={s}
          preset={preset}
          onCancel={done}
          onDone={() => {
            done();
            onOpen();
          }}
        />
      ) : (
        <div className="row">
          <button className="btn" onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} /> New trip
          </button>
          <button className="btn ghost" onClick={() => setJoining(true)}>
            <Icon name="users" size={16} /> Join a trip
          </button>
        </div>
      )}
      {!s.session && !adding && s.trips.length > 0 && localStorage.getItem('eddy.v1.hideBanner') !== '1' ? (
        <div className="notice info mt note">
          <div className="noticeHead">
            <Icon name="cloud" size={17} /> Back up your trips
          </div>
          <div className="muted mb-s">Sign in to sync across your devices.</div>
          <div className="row">
            <button className="btn" onClick={onAccount}>
              Sign in
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                localStorage.setItem('eddy.v1.hideBanner', '1');
                s.activate(s.trip ? s.trip.id : s.trips[0].id); // re-render
              }}
            >
              Not now
            </button>
          </div>
        </div>
      ) : null}
      {!s.trips.length && !adding ? (
        <Empty icon="calendar" title="No trips yet">
          Create a trip to start planning crew, gear, meals and shuttles.
        </Empty>
      ) : null}
      {groups.map((g) => (
        <div className="mt" key={g}>
          <span className="label">{rname(g)}</span>
          {s.trips
            .filter((t) => riverOf(t) === g)
            .sort((a, b) => (a.start < b.start ? 1 : -1))
            .map((t) => (
              <div
                className="card mt tripCard"
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  s.activate(t.id);
                  onOpen();
                }}
              >
                <div className="cardTop">
                  <div className="serif">{t.name}</div>
                  {tripStatus(t) ? <span className={'badge ' + tripStatus(t).cls}>{tripStatus(t).text}</span> : null}
                </div>
                <div className="meta">
                  <span>
                    <Icon name="calendar" size={15} />
                    {okDate(t.start) ? `${fmt(t.start)} ${t.start.slice(0, 4)} → ${fmt(addDays(t.start, t.days))}` : t.start}
                  </span>
                  <span>
                    <Icon name="users" size={15} />
                    {(t.crew || []).length} people · {t.days} days
                  </span>
                  {s.sync[t.id] ? (
                    <span>
                      <Icon name="cloud" size={15} />
                      {syncLabel(s.syncStatus[t.id], !!s.sync[t.id].owner)}
                    </span>
                  ) : null}
                </div>
                <div className="tripActs" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="linkBtn"
                    onClick={() => {
                      const { id: _i, code: _c, at: _a, ...rest } = t;
                      s.create({ ...rest, name: t.name + ' (copy)' });
                    }}
                  >
                    Duplicate
                  </button>
                  <button
                    className="linkBtn danger"
                    onClick={() => window.confirm(`Delete "${t.name}"? This cannot be undone.`) && s.remove(t.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

/* ---------- rivers library ---------- */

const ENTRY = {
  rapids: {
    label: 'Rapids',
    fields: [
      ['name', 'Name', 'text'],
      ['mile', 'Mile', 'num'],
      ['diff', 'Difficulty (1–10)', 'num'],
      ['tier', 'Class / tier', 'text'],
      ['desc', 'Notes', 'area'],
    ],
    defaults: { civ: false },
  },
  camps: {
    label: 'Camps',
    fields: [
      ['name', 'Name', 'text'],
      ['mile', 'Mile', 'num'],
      ['bank', 'Bank', 'bank'],
      ['size', 'Size (1–9)', 'num'],
      ['qual', 'Quality (1–9)', 'num'],
    ],
    defaults: {},
  },
  hikes: {
    label: 'Hikes',
    fields: [
      ['name', 'Name', 'text'],
      ['mile', 'Mile', 'num'],
      ['bank', 'Bank', 'bank'],
      ['time', 'Hours', 'num'],
      ['diff', 'Difficulty (1–5)', 'num'],
      ['qual', 'Quality (1–5)', 'num'],
      ['desc', 'Notes', 'area'],
    ],
    defaults: {},
  },
};

function EntryList({ kind, items, onChange }) {
  const spec = ENTRY[kind];
  const blank = Object.fromEntries(spec.fields.map(([k, , t]) => [k, t === 'bank' ? 'R' : '']));
  const [draft, setDraft] = useState(blank);
  const [adding, setAdding] = useState(false);
  const mile = parseFloat(draft.mile);
  const ok = draft.name.trim() && isFinite(mile);
  const add = () => {
    const e = { ...spec.defaults };
    spec.fields.forEach(([k, , t]) => {
      const v = draft[k];
      if (t === 'num') {
        if (v !== '' && isFinite(parseFloat(v))) e[k] = parseFloat(v);
      } else if (v !== '') e[k] = k === 'name' ? v.trim() : v;
    });
    onChange([...items, e].sort((a, b) => a.mile - b.mile));
    setDraft(blank);
    setAdding(false);
  };
  return (
    <Acc title={spec.label} note={String(items.length)}>
      {items.map((e, i) => (
        <div className="listRow" key={i}>
          <span className="mile">{e.mile.toFixed(1)}</span>
          <span style={{ flex: 1 }}>{e.name}</span>
          <button className="btn ghost danger" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      {!adding ? (
        <button className="btn ghost mt-s" onClick={() => setAdding(true)}>
          Add
        </button>
      ) : (
      <div className="mt">
        {spec.fields.map(([k, label, t]) =>
          t === 'bank' ? (
            <Sel key={k} label={label} value={draft[k]} onChange={(v) => setDraft({ ...draft, [k]: v })}>
              <option value="R">River right</option>
              <option value="L">River left</option>
            </Sel>
          ) : (
            <Field
              key={k}
              label={label}
              area={t === 'area'}
              inputMode={t === 'num' ? 'decimal' : undefined}
              value={draft[k]}
              onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
            />
          )
        )}
        <div className="row">
          <button className="btn" disabled={!ok} onClick={add}>
            Save
          </button>
          <button className="btn ghost" onClick={() => (setAdding(false), setDraft(blank))}>
            Cancel
          </button>
        </div>
      </div>
      )}
    </Acc>
  );
}

function RiverEditor({ s, id, onClose }) {
  const base = id ? s.riverRec(id) : {};
  const norm = normalizeRiver(base);
  const [f, setF] = useState({
    name: id ? norm.name : '',
    reach: norm.reach,
    agency: norm.agency,
    state: norm.state || '',
    tz: norm.tz,
    lat: id ? String(norm.coords[0]) : '',
    lon: id ? String(norm.coords[1]) : '',
    m0: id ? String(norm.miles[0]) : '0',
    m1: id ? String(norm.miles[1]) : '',
    days: base.days ? String(base.days) : '',
    cls: norm.stats.class || '',
    season: norm.stats.season || '',
    e0: norm.stats.elev && norm.stats.elev[0] != null ? String(norm.stats.elev[0]) : '',
    e1: norm.stats.elev && norm.stats.elev[1] != null ? String(norm.stats.elev[1]) : '',
    grad: norm.stats.gradient != null ? String(norm.stats.gradient) : '',
    fmin: norm.stats.flow && norm.stats.flow.min != null ? String(norm.stats.flow.min) : '',
    ftyp: norm.stats.flow && norm.stats.flow.typical != null ? String(norm.stats.flow.typical) : '',
    fmax: norm.stats.flow && norm.stats.flow.max != null ? String(norm.stats.flow.max) : '',
    fnote: (norm.stats.flow && norm.stats.flow.note) || '',
  });
  const [access, setAccess] = useState(norm.access);
  const [lists, setLists] = useState({ rapids: norm.rapids, camps: norm.camps, hikes: norm.hikes });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const [acc, setAcc] = useState({ name: '', mile: '', hub: false });
  const [addingAcc, setAddingAcc] = useState(false);
  const used = id ? s.trips.filter((t) => riverOf(t) === id).length : 0;

  const save = () => {
    const miles = [parseFloat(f.m0), parseFloat(f.m1)];
    const lat = parseFloat(f.lat);
    const lon = parseFloat(f.lon);
    let tzOk = true;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: f.tz });
    } catch {
      tzOk = false;
    }
    if (!f.name.trim()) return setErr('Give the river a name.');
    if (!isFinite(miles[0]) || !isFinite(miles[1]) || miles[1] <= miles[0]) return setErr('Mile range needs an end greater than the start.');
    if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return setErr('Put-in latitude / longitude look wrong (used for sunrise and sunset).');
    if (!tzOk) return setErr('Unknown time zone. Use a name like America/Denver.');
    const rid = id || (s.riverList().some((r) => r.id === slug(f.name)) ? slug(f.name) + '-' + uid().slice(-4) : slug(f.name));
    const days = parseInt(f.days, 10);
    // overview stats: keep what the form doesn't edit (steepest stretch, flow bands, craft, gauges)
    const num = (v) => {
      const n = parseFloat(String(v).replace(/,/g, ''));
      return isFinite(n) ? n : undefined;
    };
    const e0 = num(f.e0), e1 = num(f.e1);
    const flow = { ...(base.stats?.flow || {}), min: num(f.fmin), typical: num(f.ftyp), max: num(f.fmax), note: f.fnote.trim() || undefined };
    const stats = {
      ...(base.stats || {}),
      class: f.cls.trim() || undefined,
      season: f.season.trim() || undefined,
      elev: e0 != null || e1 != null ? [e0, e1] : undefined,
      gradient: num(f.grad),
      flow: Object.values(flow).some((v) => v !== undefined) ? flow : undefined,
    };
    Object.keys(stats).forEach((k) => stats[k] === undefined && delete stats[k]);
    s.saveRiver({
      ...base,
      id: rid,
      name: f.name.trim(),
      reach: f.reach.trim(),
      agency: f.agency.trim(),
      state: f.state.trim(),
      tz: f.tz.trim(),
      coords: [lat, lon],
      miles,
      days: days > 0 ? days : undefined,
      stats: Object.keys(stats).length ? stats : undefined,
      access,
      ...lists,
    });
    onClose();
  };
  const builtin = id && BUILTIN_RIVERS[id];
  return (
    <div className="pad">
      <h1>{id ? 'Edit river' : 'Add river'}</h1>
      <Field label="Name" value={f.name} onChange={set('name')} placeholder="Salmon River" />
      <Field label="Reach" value={f.reach} onChange={set('reach')} placeholder="Corn Creek to Carey Creek" />
      <Field label="Managing agency / permits" value={f.agency} onChange={set('agency')} />
      <Field label="State" value={f.state} onChange={set('state')} placeholder="Idaho" />
      <div className="row">
        <Field label="Start mile" value={f.m0} onChange={set('m0')} inputMode="decimal" />
        <Field label="End mile" value={f.m1} onChange={set('m1')} inputMode="decimal" />
        <Field label="Typical days" value={f.days} onChange={set('days')} inputMode="numeric" />
      </div>
      <div className="row">
        <Field label="Put-in latitude" value={f.lat} onChange={set('lat')} inputMode="decimal" placeholder="45.2" />
        <Field label="Put-in longitude" value={f.lon} onChange={set('lon')} inputMode="decimal" placeholder="-114.5" />
      </div>
      <Field label="Time zone" value={f.tz} onChange={set('tz')} placeholder="America/Denver" />

      <div className="mt">
        <span className="label">Overview</span>
        <div className="muted">Shown on the river's Overview tab. All optional.</div>
        <Field label="Class" value={f.cls} onChange={set('cls')} placeholder="III to IV" />
        <Field label="Season" value={f.season} onChange={set('season')} placeholder="Year-round; runoff peaks May to June" />
        <div className="row">
          <Field label="Put-in elevation (ft)" value={f.e0} onChange={set('e0')} inputMode="numeric" />
          <Field label="Take-out elevation (ft)" value={f.e1} onChange={set('e1')} inputMode="numeric" />
          <Field label="Gradient (ft/mi)" value={f.grad} onChange={set('grad')} inputMode="decimal" />
        </div>
        <div className="row">
          <Field label="Min flow (cfs)" value={f.fmin} onChange={set('fmin')} inputMode="numeric" />
          <Field label="Typical (cfs)" value={f.ftyp} onChange={set('ftyp')} inputMode="numeric" />
          <Field label="Max flow (cfs)" value={f.fmax} onChange={set('fmax')} inputMode="numeric" />
        </div>
        <Field label="Flow note" area rows={3} value={f.fnote} onChange={set('fnote')} placeholder="Which gauge, what changes at low and high water" />
      </div>

      <div className="mt">
        <span className="label">Put-ins, take-outs &amp; hubs</span>
        <div className="muted">Used by the trip's launch / take-out pickers and the Shuttle planner. Add them in river order; deleting one renumbers those after it.</div>
        {access.map((p, i) => (
          <div className="listRow" key={i}>
            <span className="mile">{p.mile != null ? p.mile : p.hub ? 'hub' : '—'}</span>
            <span style={{ flex: 1 }}>{p.name}</span>
            <button className="btn ghost danger" onClick={() => setAccess(access.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        ))}
        {!addingAcc ? (
          <button className="btn ghost mt-s" onClick={() => setAddingAcc(true)}>
            Add access point
          </button>
        ) : (
          <>
        <Field label="Name" value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value })} placeholder="Corn Creek" />
        <div className="row">
          <Field label="River mile" value={acc.mile} onChange={(e) => setAcc({ ...acc, mile: e.target.value })} inputMode="decimal" placeholder="blank for a town / hub" />
          <label className="check">
            <input type="checkbox" checked={acc.hub} onChange={(e) => setAcc({ ...acc, hub: e.target.checked })} /> Hub / town
          </label>
        </div>
        <div className="row">
        <button
          className="btn"
          disabled={!acc.name.trim() || (!acc.hub && !isFinite(parseFloat(acc.mile)))}
          onClick={() => {
            const m = parseFloat(acc.mile);
            const p = { name: acc.name.trim(), road: true, park: !acc.hub };
            if (acc.hub) p.hub = true;
            if (isFinite(m)) p.mile = m;
            setAccess([...access, p]);
            setAcc({ name: '', mile: '', hub: false });
            setAddingAcc(false);
          }}
        >
          Save
        </button>
        <button className="btn ghost" onClick={() => (setAddingAcc(false), setAcc({ name: '', mile: '', hub: false }))}>
          Cancel
        </button>
        </div>
          </>
        )}
      </div>

      <div className="mt">
        <EntryList kind="rapids" items={lists.rapids} onChange={(v) => setLists({ ...lists, rapids: v })} />
        <EntryList kind="camps" items={lists.camps} onChange={(v) => setLists({ ...lists, camps: v })} />
        <EntryList kind="hikes" items={lists.hikes} onChange={(v) => setLists({ ...lists, hikes: v })} />
      </div>

      {err ? <div className="warn mt">{err}</div> : null}
      <div className="row mt">
        <button className="btn" onClick={save}>
          Save river
        </button>
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        {id && (builtin ? s.rivers[id] : true) ? (
          <button
            className="btn ghost danger"
            onClick={() => {
              const msg = builtin
                ? 'Reset this river to the built-in version? Your edits are lost.'
                : used
                ? `Delete this river? ${used} trip(s) use it and will lose their river data.`
                : 'Delete this river?';
              if (window.confirm(msg)) {
                s.dropRiver(id);
                onClose();
              }
            }}
          >
            {builtin ? 'Reset' : 'Delete'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function RiverList({ s, onOpen }) {
  const [edit, setEdit] = useState(null); // 'new' | null
  const [json, setJson] = useState('');
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  if (edit) return <RiverEditor s={s} id={null} onClose={() => setEdit(null)} />;

  const importJson = () => {
    try {
      const raw = JSON.parse(json);
      const list = Array.isArray(raw) ? raw : raw.rivers || [raw];
      list.forEach((r) => {
        if (!r || typeof r.name !== 'string' || !Array.isArray(r.miles)) throw new Error('Each river needs a "name" and "miles": [start, end].');
      });
      list.forEach((r) => s.saveRiver({ ...r, id: r.id || (s.riverList().some((x) => x.id === slug(r.name)) ? slug(r.name) + '-' + uid().slice(-4) : slug(r.name)) }));
      setJson('');
      setMsg(`Imported ${list.length} river${list.length === 1 ? '' : 's'}.`);
    } catch (e) {
      setMsg('Could not import: ' + e.message);
    }
  };

  const term = q.trim().toLowerCase();
  const rows = s
    .riverList()
    .map((r) => ({ r, n: normalizeRiver(r) }))
    .filter(({ n }) => !term || [n.name, n.reach, n.state, n.agency].some((v) => (v || '').toLowerCase().includes(term)))
    .sort((a, b) => a.n.name.localeCompare(b.n.name));
  const mine = new Set(s.trips.map((t) => riverOf(t)));
  const groups = [];
  const onTrips = rows.filter(({ r }) => mine.has(r.id));
  if (onTrips.length) groups.push(['Your trips', onTrips]);
  const rest = rows.filter(({ r }) => !mine.has(r.id));
  const states = [...new Set(rest.map(({ n }) => n.state || 'Other'))].sort((a, b) => (a === 'Other') - (b === 'Other') || a.localeCompare(b));
  states.forEach((st) => groups.push([st, rest.filter(({ n }) => (n.state || 'Other') === st)]));

  return (
    <div className="pad">
      <Field value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search rivers" />
      {groups.map(([label, list]) => (
        <div className="mt" key={label}>
          <span className="label">{label}</span>
          {list.map(({ r, n }) => (
            <div className="card mt tripCard" key={r.id} role="button" tabIndex={0} style={riverCardStyle(r.id)} onClick={() => onOpen(r.id)}>
              <div className="cardTop">
                <div className="serif" style={riverCardStyle(r.id) ? { color: 'var(--accent)' } : undefined}>{n.name}</div>
              </div>
              <div className="muted">
                {n.reach ? n.reach + ' · ' : ''}
                {+(n.miles[1] - n.miles[0]).toFixed(1)} mi
              </div>
            </div>
          ))}
        </div>
      ))}
      {!rows.length ? (
        <Empty icon="search" title="No rivers">
          Nothing matches.
        </Empty>
      ) : null}
      <button className="btn ghost mt" onClick={() => setEdit('new')}>
        + Add river
      </button>
      <div className="mt">
        <Acc title="Import river JSON" note="paste a river record, or { rivers: [...] }">
          <Field area value={json} onChange={(e) => setJson(e.target.value)} placeholder='{"name":"Salmon River","miles":[0,53],"coords":[45.2,-114.5],"tz":"America/Boise","access":[...]}' />
          <button className="btn" disabled={!json.trim()} onClick={importJson}>
            Import
          </button>
        </Acc>
      </div>
      {msg ? <div className="muted mt">{msg}</div> : null}
    </div>
  );
}

/* ---------- shell ---------- */

const TABS = [
  {
    id: 'Trips',
    tab: 'roster',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    ),
  },
  {
    id: 'River',
    label: 'Rivers',
    tab: 'map',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M2 8c2.2-2.4 4.5-2.4 6.7 0s4.4 2.4 6.6 0 4.5-2.4 6.7 0" />
        <path d="M2 13c2.2-2.4 4.5-2.4 6.7 0s4.4 2.4 6.6 0 4.5-2.4 6.7 0" />
        <path d="M2 18c2.2-2.4 4.5-2.4 6.7 0s4.4 2.4 6.6 0 4.5-2.4 6.7 0" />
      </svg>
    ),
  },
  {
    id: 'Safety',
    tab: 'safety',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />
        <path d="M12 9v6M9 12h6" />
      </svg>
    ),
  },
  {
    id: 'Profile',
    tab: 'safety',
    icon: (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
      </svg>
    ),
  },
];

const RISK_KEY = 'eddy.risk';
const RISK_VERSION = '2';
function RiskGate({ onAccept }) {
  return (
    <div className="gate">
      <div className="gateCard">
        <div className="gateIcon">
          <Icon name="alert" size={28} />
        </div>
        <h1>River trips are dangerous</h1>
        <p>
          Rafting, kayaking and backcountry travel can cause serious injury or death. Eddy is a planning aid, not a source of truth. Everything in it can be wrong, incomplete or out of date, and it cannot account for changing conditions.
        </p>
        <p>
          <strong>Do not rely on Eddy to make decisions.</strong> Before any trip, confirm flows, closures, permits and rules with current official sources, use a current guidebook and gauges, scout every rapid yourself, and use your own judgment on the water.
        </p>
        <p>
          <strong>You alone are responsible for your safety and your decisions.</strong> Eddy is not responsible for them or for unforeseen circumstances.
        </p>
        <button className="btn block" onClick={onAccept}>
          I understand and accept the risk
        </button>
        <div className="muted gateLinks">
          <button className="linkBtn inline" onClick={() => openUrl(TERMS_URL)}>
            Terms of use
          </button>
          {' · '}
          <button className="linkBtn inline" onClick={() => openUrl(POLICY_URL)}>
            Privacy policy
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [riskOk, setRiskOk] = useState(() => {
    if (QS.get('shot')) return true;
    try {
      return localStorage.getItem(RISK_KEY) === RISK_VERSION;
    } catch {
      return false;
    }
  });
  const s = useStore();
  const [tab, setTab] = useState(QS.get('join') ? 'Trips' : { General: 'Safety' }[QS.get('tab')] || QS.get('tab') || 'Trips');
  const [inTrip, setInTrip] = useState(QS.get('open') === '1'); // Trips tab: false = overview list, true = inside the active trip
  const [browse, setBrowse] = useState(QS.get('river') || null); // river being browsed on the River tab (null = the trip's own)
  const [preset, setPreset] = useState(null); // river chosen from the library for a new trip
  const [joinCode, setJoinCode] = useState(() => remote.cleanCode(QS.get('join')) || ''); // from an invite link or eddy://join/CODE
  const [welcome, setWelcome] = useState(''); // trip just joined; asks which crew member you are
  const [joinBy] = useState(() => (QS.get('by') || '').replace(/[^\p{L}\p{N} '.-]/gu, '').slice(0, 24));
  const [profSub, setProfSub] = useState(null); // open Profile on a given sub-tab
  const lastCtx = useRef({ screen: 'Trips', river: null });
  const [fromTrip, setFromTrip] = useState(null);
  const onMap = false;
  const riverOpen = tab === 'River' && !!browse;
  const detail = tab === 'Trips' && inTrip && !!s.trip;

  const firstTrip = useRef(true);
  useEffect(() => {
    if (firstTrip.current) firstTrip.current = false;
    else setBrowse(null);
  }, [s.trip?.id]);

  useEffect(() => {
    onOpenUrl((url) => {
      if (/auth-callback/.test(url || '')) {
        authApi.handleAuthUrl(url).then(() => { setProfSub('Account'); setTab('Profile'); }).catch(() => {});
        return;
      }
      const m = /join\/([A-Za-z0-9-]+)/.exec(url || '');
      if (m) {
        setJoinCode(m[1]);
        setInTrip(false);
        setTab('Trips');
      }
    });
  }, []);

  // keep trip reminders in step with the trip list (only if the user opted in)
  useEffect(() => {
    if (isNative && localStorage.getItem(REMINDERS_KEY) === '1') scheduleReminders(s.trips);
  }, [s.trips]);

  // Trip screens use the trip's river; the River tab can browse any river.
  const tripRid = riverOf(s.trip);
  const rid = tab === 'River' ? browse || tripRid : tripRid;
  selectRiver(s.riverRec(rid));

  // the rock-art motif behind the page is keyed off body[data-tab]
  useEffect(() => {
    document.body.dataset.tab = detail ? 'itinerary' : TABS.find((t) => t.id === tab).tab;
  }, [tab, detail]);

  // river screens (a river being browsed, or inside a trip) wear that river's palette; everything else is the app's own
  const themed = (tab === 'River' && riverOpen) || detail ? rid : null;
  useEffect(() => applyTheme(themed), [themed]);

  if (tab !== 'Profile') lastCtx.current = { screen: tab === 'Trips' && detail ? 'Trip' : tab, river: rid || null };
  const title = detail ? s.trip.name : tab === 'River' ? (riverOpen ? RIVER.name : 'Rivers') : tab === 'Trips' ? 'Trips' : tab;
  if (!riskOk)
    return (
      <RiskGate
        onAccept={() => {
          try {
            localStorage.setItem(RISK_KEY, RISK_VERSION);
          } catch {}
          setRiskOk(true);
        }}
      />
    );

  return (
    <div className={'shell rg' + (onMap ? ' onmap' : '')}>
      <div id="bgmotif" aria-hidden="true" />

      {!onMap && (
        <div className="pageHeader" style={{ display: 'flex' }}>
          {detail && (
            <button className="hback" onClick={() => setInTrip(false)} aria-label="Back to all trips">
              <Icon name="back" size={18} /> Trips
            </button>
          )}
          {riverOpen &&
            (fromTrip ? (
              <button
                className="hback"
                onClick={() => {
                  setFromTrip(null);
                  setBrowse(null);
                  setInTrip(true);
                  setTab('Trips');
                }}
                aria-label="Back to the trip"
              >
                <Icon name="back" size={18} /> {short(fromTrip, 18)}
              </button>
            ) : (
              <button className="hback" onClick={() => setBrowse(null)} aria-label="Back to all rivers">
                <Icon name="back" size={18} /> Rivers
              </button>
            ))}
          <div className="phtitle">{title}</div>
          {riverOpen && (
            <button
              className="hact"
              onClick={() => {
                setPreset(rid);
                setInTrip(false);
                setTab('Trips');
              }}
            >
              Plan trip
            </button>
          )}
        </div>
      )}

      <main key={rid}>
        {tab === 'Trips' &&
          (detail ? (
            <Trip s={s} back={() => setInTrip(false)} onRiver={() => { setBrowse(tripRid); setFromTrip(s.trip?.name || 'Trip'); setTab('River'); }} onAccount={() => { setProfSub('Account'); setTab('Profile'); }} />
          ) : (
            <Trips s={s} preset={preset} clearPreset={() => setPreset(null)} joinCode={joinCode} joinBy={joinBy} welcome={welcome} setWelcome={setWelcome} clearJoin={() => { setJoinCode(''); try { history.replaceState(null, '', location.pathname); } catch {} }} onOpen={() => setInTrip(true)} onAccount={() => { setProfSub('Account'); setTab('Profile'); }} />
          ))}
        {tab === 'River' && (
          <River
            s={s}
            browse={browse}
            onBrowse={setBrowse}
            onPlan={(id) => {
              setPreset(id);
              setInTrip(false);
              setTab('Trips');
            }}
          />
        )}
        {tab === 'Safety' && <Safety />}
        {tab === 'Profile' && <Profile s={s} initial={profSub} ctx={lastCtx.current} />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={'tabbtn' + (tab === t.id ? ' on' : '')}
            onClick={() => {
              if (t.id === 'Trips') setInTrip(false); // tapping Trips always returns to the overview
              if (t.id === 'River') setBrowse(null); // and Rivers to the list
              setFromTrip(null);
              setTab(t.id);
            }}
          >
            {t.icon}
            <span className="tlabel">{t.label || t.id}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

if (QS.get('shot')) {
  document.body.classList.add('shot');
  const f = document.createElement('div');
  f.id = 'fakeStatus';
  f.innerHTML = '<span>9:41</span><span class="ind"><svg width="18" height="12" viewBox="0 0 18 12" fill="#1b130c"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2.5" width="3" height="9.5" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg><svg width="26" height="12" viewBox="0 0 26 12"><rect x=".5" y=".5" width="22" height="11" rx="3.5" fill="none" stroke="#1b130c" opacity=".5"/><rect x="2" y="2" width="19" height="8" rx="2.5" fill="#1b130c"/><rect x="24" y="4" width="2" height="4" rx="1" fill="#1b130c" opacity=".5"/></svg></span>';
  document.body.appendChild(f);
}
// web app: keep a saved copy so it opens with no signal (the native app already ships its files)
if (!IS_STORE && !isNative && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
boot().finally(() => {
  createRoot(document.getElementById('root')).render(<App />);
  setTimeout(hideSplash, 150);
});
