import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { campHorizon, campSun, dropHorizon, drops, dropsGPX, hasGeo, hikeTrack, onGeoChange, parseGPX, position, removeDrop, setHikeTrack, trackStats, updateDrop } from './geo/index.js';
import { sunDay } from './geo/sun.js';

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
        {t}
      </button>
    ))}
  </div>
);

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

function Trip({ s, back, onAccount }) {
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
  const [tab, setTab] = useState((q && (OLD[q] || q)) || 'Itinerary');
  if (!s.trip) return <NewTrip s={s} />;
  const tripEnt = s.sync[s.trip.id];
  const tripStatus0 = s.syncStatus[s.trip.id];
  const panels = { Itinerary, Crew, Meals, Gear, Shuttle, Costs: Ledger, Emergency: Card, Journal: Log, Notes: Info, People, Settings };
  const P = panels[tab] || Itinerary;
  const items = ['Itinerary', 'Crew', 'Meals', 'Gear', 'Shuttle', 'Costs', 'Emergency', 'Journal', ...(REFS[s.trip.id] ? ['Notes'] : []), 'People', 'Settings'];
  return (
    <>
      <Tabs items={items} value={tab} onChange={setTab} />
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
      <div className="row">
        <Field label="Launch" type="date" value={t.start} onChange={(e) => okDate(e.target.value) && s.set({ start: e.target.value })} />
        <Field
          label="Take-out"
          type="date"
          value={okDate(t.start) ? addDays(t.start, t.days) : ''}
          onChange={(e) => {
            const n = dnum(e.target.value, t.start);
            if (n > 0 && n <= 60) s.set({ days: n });
          }}
        />
      </div>
      <div className="stack">
        <Sel label="Put in at" value={t.launch || ramps[0]?.id} onChange={(v) => s.set({ launch: v })}>
          {ramps.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Sel>
        <Sel label="Take out at" value={t.out || ramps[ramps.length - 1]?.id} onChange={(v) => s.set({ out: v })}>
          {ramps.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Sel>
      </div>
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
  raft: { label: 'Raft / cataraft', cap: 4 },
  kayak: { label: 'Whitewater kayak', cap: 1 },
  ik: { label: 'Inflatable kayak / packraft', cap: 1 },
  sup: { label: 'SUP', cap: 1 },
};

const CraftPaths = ({ type }) => (
  <>

    {type === 'raft' ? (
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
        {type === 'ik' ? <path d="M23 4.6c7 1.2 13.4 3.4 15.4 4.4-2 1-8.4 3.2-15.4 4.4-7-1.2-13.4-3.4-15.4-4.4 2-1 8.4-3.2 15.4-4.4z" /> : <ellipse cx="23" cy="9" rx="4.4" ry="2.6" />}
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
  const [name, setName] = useState('');
  const [craft, setCraft] = useState('');
  const [open, setOpen] = useState(null);
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
      <div className="row">
        <Field value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <button
          className="btn"
          disabled={!name.trim()}
          onClick={() => {
            s.push('crew', { name: name.trim(), role: '', boat: '', ice: '', diet: '', days: '' });
            setName('');
          }}
        >
          Add
        </button>
      </div>
      {t.crew.map((m) => (
        <Acc key={m.id} lead={<Avatar name={m.name} />} title={m.name} tag={meId === m.id ? 'You' : undefined} note={[m.role, boats.find((b) => b.id === m.boat)?.name].filter(Boolean).join(' · ') || null}>
          <button
            className="btn ghost mb-s"
            onClick={() => {
              setMeFor(t.id, meId === m.id ? '' : m.id);
              setMeId(meId === m.id ? '' : m.id);
            }}
          >
            {meId === m.id ? "This isn't me" : 'This is me'}
          </button>
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
                <span className="carName">{b.name}</span>
                <span className="muted">
                  {CRAFT[b.type]?.label || 'Craft'}
                  {on.length ? ` · ${on.map((m) => m.name).join(', ')}` : ''}
                </span>
              </span>
              <span className={'grAmt' + (cap && on.length > cap ? ' over' : '')}>{cap ? `${on.length}/${cap}` : on.length || ''}</span>
            </button>
            {open === b.id && (
              <div className="grBody">
                <Field label="Name" value={b.name} onChange={(e) => s.patch('boats', b.id, { name: e.target.value })} />
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
      <div className="row mt">
        <Field value={craft} onChange={(e) => setCraft(e.target.value)} placeholder="Add a craft" />
        <button
          className="btn"
          disabled={!craft.trim()}
          onClick={() => {
            s.push('boats', { name: craft.trim(), type: 'raft', cap: CRAFT.raft.cap });
            setCraft('');
          }}
        >
          Add
        </button>
      </div>
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

const SPLITS = { even: 'Even split', nights: 'Person-nights', users: 'Shared by users', personal: 'Individual' };
const SPLIT_HELP = {
  even: 'Everyone on the trip pays the same share.',
  nights: 'Shares scale with each person’s nights on the river.',
  users: 'A group item (set how many the group needs). Billed to the people who enter a Need, in proportion.',
  personal: 'Each person rents their own. Billed only to the people who enter a Need, in proportion.',
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
      lend = 0;
    crew.forEach((c) => {
      const e = it.e[c.id] || {};
      have += num(e.have);
      need += num(e.need);
      lend += num(e.lend);
    });
    const target = it.split === 'personal' ? need : it.qty || need;
    const rent = Math.max(0, target - lend);
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
            : need
              ? (total * num(e.need)) / need
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
function GearFields({ v, up, days, cats }) {
  const unit = Math.max(num(v.f), num(v.d) * days);
  return (
    <>
      <Field label="Item" value={v.n} onChange={(e) => up('n', e.target.value)} />
      <Field label="Category" value={v.c} onChange={(e) => up('c', e.target.value)} placeholder="Kitchen" list="gearCats" />
      <datalist id="gearCats">{(cats || []).map((c) => <option key={c} value={c} />)}</datalist>
      <span className="label">How it’s billed</span>
      <div className="chips">
        {Object.entries(SPLITS).map(([k, l]) => (
          <button key={k} className={'chip' + (v.s === k ? ' on' : '')} onClick={() => up('s', k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="muted mb">{SPLIT_HELP[v.s]}</div>
      <span className="label">Rental price, per item (leave blank if it’s free)</span>
      <div className="numRow">
        <Num usd label="Flat fee" value={v.f} onChange={(x) => up('f', x)} />
        <Num usd label="Per day" value={v.d} onChange={(x) => up('d', x)} />
        {v.s !== 'personal' && <Num label="Group needs" value={v.q} onChange={(x) => up('q', x)} hint={v.qHint} />}
      </div>
      <div className="muted mb">
        {unit > 0
          ? `Each item costs ${usd(unit)} for ${days} days (the larger of the flat fee or per-day × ${days}).`
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
  };
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
  const mineOf = (i) => {
    const e = i.e[me] || {};
    return !!(i.share[me] || num(e.have) || num(e.need) || num(e.lend));
  };
  const shown = L.items.filter(
    (i) => (cat === 'All' || (cat === 'Mine' ? me && mineOf(i) : i.cat === cat)) && (!q || i.name.toLowerCase().includes(q))
  );
  const mine = me ? L.by[me] : null;

  return (
    <>
      {t.crew.length === 0 ? (
        <div className="muted mb">Add crew on the Crew tab to split costs.</div>
      ) : (
        <>
          <span className="label">Who are you? Tap your name to see your share</span>
          <div className="chips scroll">
            {t.crew.map((c) => (
              <button key={c.id} className={'chip' + (me === c.id ? ' on' : '')} onClick={() => setMe(me === c.id ? '' : c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="stats mt">
        <div className="stat">
          <div className="statNum">{usd0(L.total)}</div>
          <div className="statKey">Trip gear cost</div>
        </div>
        <div className="stat">
          <div className="statNum">{mine ? usd0(mine.total) : '—'}</div>
          <div className="statKey">{mine ? 'Your share' : 'Pick your name'}</div>
        </div>
      </div>
      {mine && (
        <div className="muted mb">
          Your share: {usd0(mine.even)} even split · {usd0(mine.nights)} person-nights · {usd0(mine.users)} shared by users · {usd0(mine.personal)} individual
        </div>
      )}

      <div className="row">
        <Field value={find} onChange={(e) => setFind(e.target.value)} placeholder={`Search ${L.items.length} items`} />
        <button className="btn ghost" onClick={() => setAdding(!adding)}>
          {adding ? 'Close' : 'Add item'}
        </button>
      </div>
      {adding && <AddGear s={s} days={L.days} cats={cats} onDone={() => setAdding(false)} />}
      <div className="chips scroll">
        {['All', ...(me ? ['Mine'] : []), ...cats].map((c) => (
          <button key={c} className={'chip' + (cat === c ? ' on river' : '')} onClick={() => setCat(c)}>
            {c === 'Mine' ? 'My items' : c}
          </button>
        ))}
      </div>
      {shown.length === 0 && <div className="muted mt">Nothing matches.</div>}
      {shown.map((it) => (
        <GearRow key={it.id} it={it} s={s} crew={t.crew} days={L.days} cats={cats} me={me} open={open === it.id} onOpen={() => setOpen(open === it.id ? null : it.id)} />
      ))}
      <GearRef />
    </>
  );
}

function GearRow({ it, s, crew, days, cats, me, open, onOpen }) {
  const mine = it.share[me] || 0;
  const tag = REQ[it.req];
  const flag = it.unit > 0 && it.rent > 0;
  const patch = (o) => s.patch('gear', it.id, o);
  const setE = (pid, k, v) => patch({ e: { ...it.e, [pid]: { ...(it.e[pid] || {}), [k]: v } } });
  // the form reads and writes the short stored keys
  const v = { n: it.name, c: it.cat, s: it.split, r: it.req, f: it.raw.f, d: it.raw.d, q: it.raw.q, qHint: it.split === 'personal' ? '' : String(+it.need.toFixed(2)) };
  return (
    <div className={'grItem' + (open ? ' open' : '')}>
      <button className="grHead" onClick={onOpen}>
        <span className="grText">
          <span className="grName">{it.name}</span>
          <span className="muted">
            {SPLITS[it.split]}
            {it.unit ? ` · ${usd(it.unit)}/item` : ''}
            {flag ? ` · renting ${+it.rent.toFixed(2)}` : ''}
          </span>
        </span>
        {tag && !open ? <Tag label={tag[0]} tint={tag[1]} /> : null}
        <span className="grAmt">{mine ? usd(mine) : ''}</span>
      </button>
      {open && (
        <div className="grBody">
          <GearFields v={v} up={(k, x) => patch({ [k]: x })} days={days} cats={cats} />
          <Field area label="Note" value={it.raw.note || ''} onChange={(e) => patch({ note: e.target.value })} placeholder="Where to rent it, sizes, who’s bringing it…" />

          <span className="label">Who has, needs and can lend it</span>
          {crew.length ? (
            <div className="gcrew">
              <div className="gcRow gcHead">
                <span />
                <span>Have</span>
                <span>Need</span>
                <span>Lend</span>
                <span>Pays</span>
              </div>
              {crew.map((c) => {
                const e = it.e[c.id] || {};
                return (
                  <div className={'gcRow' + (c.id === me ? ' me' : '')} key={c.id}>
                    <span className="gcName">{c.name}</span>
                    {['have', 'need', 'lend'].map((k) => (
                      <input key={k} inputMode="decimal" aria-label={`${c.name} ${k}`} placeholder="0" value={e[k] ?? ''} onChange={(ev) => setE(c.id, k, ev.target.value)} />
                    ))}
                    <span className="gcAmt">{it.share[c.id] ? usd(it.share[c.id]) : ''}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="muted">Add crew on the Crew tab first.</div>
          )}
          <div className="muted mb">Have: you own it. Need: how many you’ll use. Lend: how many you’ll lend to the group, so fewer are rented.</div>

          <div className="rule" />
          <div className="grMath">
            <span>{+it.target.toFixed(2)} needed</span>
            <span>{+it.lend.toFixed(2)} lent</span>
            <span>{+it.rent.toFixed(2)} rented</span>
            <span className="grTotal">{it.total ? usd(it.total) : '$0'}</span>
          </div>
          {it.loose > 0.005 && <div className="muted">{usd(it.loose)} unassigned: nobody has claimed this item.</div>}
          <button className="btn ghost danger mt-s" onClick={() => s.drop('gear', it.id)}>
            Remove item
          </button>
        </div>
      )}
    </div>
  );
}

function AddGear({ s, days, cats, onDone }) {
  const [f, setF] = useState({ n: '', c: '', s: 'personal', f: '', d: '', q: '', r: '' });
  const up = (k, v) => setF({ ...f, [k]: v });
  return (
    <div className="card mt mb">
      <GearFields v={f} up={up} days={days} cats={cats} />
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
    <CarPaths trailer={trailer} />
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

const COLS = 12,
  ROWS = 7;
const hm = (h) => {
  if (h == null) return '';
  const m = Math.round(h * 60);
  return [Math.floor(m / 60) ? Math.floor(m / 60) + 'h' : '', m % 60 ? (m % 60) + 'm' : ''].filter(Boolean).join(' ') || '0m';
};
const legsOf = (t) => {
  if (t.legs) return t.legs;
  const out = [];
  (t.cars || []).forEach((c, ci) => {
    const k = {};
    (c.legs || []).forEach((l) => out.push({ ...l, car: c.id, _o: (k[l.date] = (k[l.date] || 0) + 1), _c: ci }));
  });
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a._o - b._o || a._c - b._c));
  return out.map(({ _o, _c, ...l }, i) => ({ ...l, par: i > 0 && out[i - 1].date === l.date && out[i - 1]._o === _o }));
};

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
  const loc = {},
    afloat = {};
  const legs = [];
  Object.keys(byDay)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((d) => {
      t.crew.forEach((m) => {
        if (!afloat[m.id] && onD(m) < d && (loc[m.id] == null || loc[m.id] === onP(m))) (loc[m.id] = 'river'), (afloat[m.id] = 1);
        if (loc[m.id] === 'river' && offD(m) <= d) loc[m.id] = offP(m);
      });
      (t.boats || []).forEach((b) => {
        if (!afloat[b.id] && d > 0 && loc[b.id] === launch?.id) (loc[b.id] = 'river'), (afloat[b.id] = 1);
        if (loc[b.id] === 'river' && d >= N) loc[b.id] = out?.id;
      });
      const rounds = [];
      byDay[d].forEach((l, i) => {
        if (!i || !l.par) rounds.push([]);
        rounds[rounds.length - 1].push(l);
      });
      rounds.forEach((go) => {
        go.forEach((l) => (l.stray = [...(l.who || []), ...(l.boats || [])].filter((x) => loc[x] != null && loc[x] !== l.from)));
        go.forEach((l) => [...(l.who || []), ...(l.boats || [])].forEach((x) => (loc[x] = l.to)));
      });
      const slot = 0.76 / rounds.length;
      rounds.forEach((go, r) => go.forEach((l) => legs.push({ ...l, t0: d + 0.12 + r * slot, t1: d + 0.12 + r * slot + slot * 0.9 })));
    });
  legs.sort((a, b) => a.t1 - b.t1);

  const mileAt = (tt) => {
    const f = Math.max(0, Math.min(N, tt));
    const at = (d) => {
      const p = t.plans?.[d];
      return p && p.mile != null && p.mile !== '' ? num(p.mile) : emile(launch) + ((emile(out) - emile(launch)) * d) / N;
    };
    const i = Math.floor(f);
    return at(i) + (at(Math.min(N, i + 1)) - at(i)) * (f - i);
  };

  const carried = (kind, id) => legs.filter((l) => (kind === 'who' ? l.who || [] : l.boats || []).includes(id));
  const seg = (l) => ({ t0: l.t0, t1: l.t1, from: l.from, to: l.to, leg: l });
  const track = (segs) => segs.sort((a, b) => a.t0 - b.t0);

  const people = t.crew.map((m) => {
    const segs = carried('who', m.id).map(seg);
    segs.push({ t0: onD(m) + 0.9, t1: onD(m) + 0.98, from: onP(m), to: 'river' });
    segs.push({ t0: offD(m) + 0.02, t1: offD(m) + 0.1, from: 'river', to: offP(m) });
    return { ...m, kind: 'person', segs: track(segs) };
  });
  const boats = (t.boats || []).map((b) => {
    const segs = carried('boats', b.id).map(seg);
    const atLaunch = segs.filter((x) => x.t1 <= 0.89).pop();
    if (atLaunch && atLaunch.to === launch?.id) {
      segs.push({ t0: 0.9, t1: 0.98, from: launch.id, to: 'river' });
      const off = segs.find((x) => x.t0 > 1 && x.from !== 'river');
      const endT = off ? Math.min(N + 0.1, off.t0 - 0.01) : N + 0.1;
      segs.push({ t0: endT - 0.08, t1: endT, from: 'river', to: off ? off.from : out?.id });
    }
    return { ...b, kind: 'boat', segs: track(segs) };
  });
  const rigs = cars.map((c) => ({ ...c, kind: 'car', segs: track(legs.filter((l) => l.car.id === c.id).map(seg)) }));

  const at = (e, tt) => {
    const S = e.segs;
    if (!S.length) return null;
    if (tt <= S[0].t0) return { at: S[0].from };
    for (let i = 0; i < S.length; i++) {
      if (tt <= S[i].t1) {
        if (tt >= S[i].t0) return { at: S[i].from, to: S[i].to, f: (tt - S[i].t0) / (S[i].t1 - S[i].t0 || 1), leg: S[i].leg };
        return { at: S[i - 1] ? S[i - 1].to : S[0].from };
      }
    }
    return { at: S[S.length - 1].to };
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

  const grid = {};
  const taken = new Set();
  const claim = (id, c) => {
    grid[id] = c;
    taken.add(c.join());
  };
  const free = ([c0, r0]) => {
    let best = [c0, r0],
      bd = Infinity;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const d = Math.abs(c - c0) + Math.abs(r - r0) * 1.01;
        if (!taken.has(c + ',' + r) && d < bd) (bd = d), (best = [c, r]);
      }
    return best;
  };
  places.forEach((p) => t.grid?.[p.id] && claim(p.id, t.grid[p.id]));
  places.forEach((p) => !grid[p.id] && p.grid && claim(p.id, free(p.grid)));
  let k = 0;
  places.forEach((p) => !grid[p.id] && claim(p.id, free(emile(p) >= 0 ? [Math.round((emile(p) / RIVER.miles[1]) * (COLS - 1)), ROWS - 1] : [(k++ * 4) % COLS, 0])));

  const roads = (t.roads || (RIVER.roads || []).map((r, i) => ({ id: 'd' + i, a: byName[r.a], b: byName[r.b], h: r.h })))
    .map((r) => ({ ...r, a: fix(r.a), b: fix(r.b) }))
    .filter((r) => byId[r.a] && byId[r.b] && r.a !== r.b);
  const memo = {};
  const drive = (a, b) => {
    a = fix(a);
    b = fix(b);
    const k = a + '|' + b;
    if (k in memo) return memo[k];
    if (!byId[a] || !byId[b]) return (memo[k] = null);
    const dist = { [a]: 0 },
      prev = {},
      done = new Set();
    for (;;) {
      let v = null;
      for (const q in dist) if (!done.has(q) && (v == null || dist[q] < dist[v])) v = q;
      if (v == null || v === b) break;
      done.add(v);
      roads.forEach((r) => {
        const w = r.a === v ? r.b : r.b === v ? r.a : null;
        if (w == null) return;
        const c = dist[v] + (num(r.h) > 0 ? num(r.h) : 3);
        if (dist[w] == null || c < dist[w]) (dist[w] = c), (prev[w] = [v, r]);
      });
    }
    if (dist[b] == null) return (memo[k] = null);
    const path = [b];
    let h = 0,
      known = true;
    for (let v = b; prev[v]; v = prev[v][0]) {
      path.unshift(prev[v][0]);
      num(prev[v][1].h) > 0 ? (h += num(prev[v][1].h)) : (known = false);
    }
    return (memo[k] = { path, h: known ? h : null });
  };
  const net = { grid, roads, drive };

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
    knots.push({ u: 0, t: busy[0][0] - 0.1 });
    u = 0.4;
    busy.forEach(([a, b], i) => {
      if (i) u += Math.min(3, 0.35 + 0.12 * (a - busy[i - 1][1]));
      knots.push({ u, t: a, go: true });
      u += b - a < 0.09 ? 0.9 : 2.8;
      knots.push({ u, t: b });
    });
    knots.push({ u: u + 0.5, t: busy[busy.length - 1][1] + 0.1 });
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

  return { start, N, dates, T, byId, places, used, legs, cars: rigs, boats, people, launch, out, mileAt, at, net, U, tOf, stops };
}

function plan(S, all) {
  const { places, used, net, byId } = S;
  const W = 340,
    M = 22,
    T = 20;
  const C = (W - 2 * M) / (COLS - 1);
  const RY = T + (ROWS - 1) * C + 24,
    H = RY + 24;
  const X = (c) => M + c * C,
    Y = (r) => T + r * C;
  const rx = (mile) => M + (Math.max(0, Math.min(MAXMILE, mile)) / MAXMILE) * (W - 2 * M);
  const ry = (x) => RY + Math.sin(x / 17) * 4;
  const linked = new Set();
  net.roads.forEach((r) => (linked.add(r.a), linked.add(r.b)));
  const pos = {};
  places
    .filter((p) => all || used.has(p.id) || linked.has(p.id))
    .forEach((p) => {
      const [c, r] = net.grid[p.id];
      pos[p.id] = { x: X(c), y: Y(r), riv: emile(p) >= 0, foot: p.mile == null, mile: emile(p) };
    });
  const boxes = [];
  Object.keys(pos)
    .sort((a, b) => pos[a].x - pos[b].x)
    .forEach((id) => {
      const q = pos[id];
      const w = textW(short(byId[id]?.name || id, 18)) + 4;
      const x0 = q.x < 40 ? q.x - 4 : q.x > W - 40 ? q.x + 4 - w : q.x - w / 2;
      q.dy = [-7, 13, -16].find((dy) => !boxes.some((b) => x0 < b.x1 && x0 + w > b.x0 && Math.abs(q.y + dy - b.y) < 8)) ?? -7;
      boxes.push({ x0, x1: x0 + w, y: q.y + q.dy });
    });
  const edges = net.roads.filter((r) => pos[r.a] && pos[r.b]);
  const route = (from, to) => {
    const a = pos[from],
      b = pos[to];
    if (!a || !b) return null;
    const d = net.drive(from, to);
    const pts = d && d.path.every((id) => pos[id]) ? d.path.map((id) => pos[id]) : [a, b];
    const cum = [0];
    pts.forEach((q, i) => i && cum.push(cum[i - 1] + Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y)));
    return { pts, cum, len: cum[cum.length - 1] };
  };
  const along = (r, d) => {
    const dd = Math.max(0, Math.min(r.len, d));
    let i = 1;
    while (i < r.pts.length - 1 && r.cum[i] < dd) i++;
    const a = r.pts[i - 1],
      b = r.pts[i] || a;
    const f = (dd - r.cum[i - 1]) / (r.cum[i] - r.cum[i - 1] || 1);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, dx: b.x - a.x };
  };
  let water = '';
  for (let x = M - 12; x <= W - M + 12; x += 3) water += `${water ? 'L' : 'M'}${x} ${ry(x).toFixed(1)}`;
  return { W, H, M, T, C, RY, X, Y, pos, edges, route, along, rx, ry, water, byId };
}

const ease = (f) => f * f * (3 - 2 * f);
const textW = (s) => s.length * 4.3;

function Story({ S, L, tt }) {
  const { byId, cars, boats, people, mileAt, at } = S;
  const { W, H, pos, route, along, rx, ry, water } = L;
  const fx = rx(mileAt(tt));
  const xy = (a) => (a === 'river' ? { x: fx, y: ry(fx) } : pos[a]);

  const rolling = [];
  const parked = {};
  cars.forEach((c) => {
    const a = at(c, tt);
    if (!a) return;
    if (a.to == null) return (parked[a.at] = parked[a.at] || []).push(c);
    rolling.push({ c, a, r: route(a.at, a.to) });
  });
  const lane = {};
  rolling.forEach((m) => {
    if (!m.r) return;
    const k = m.a.at + '|' + m.a.to + '|' + m.a.leg.t0;
    m.k = lane[k] = (lane[k] || 0) + 1;
  });
  rolling.forEach((m) => {
    if (!m.r) return;
    const back = (lane[m.a.at + '|' + m.a.to + '|' + m.a.leg.t0] - m.k) * 20;
    const q = along(m.r, ease(m.a.f) * (m.r.len + back) - back);
    const end = m.r.pts[m.r.pts.length - 1];
    m.q = q;
    m.flip = (q.dx || end.x - m.r.pts[0].x) < 0;
  });

  const here = {},
    moving = {};
  const tally = (e, key) => {
    const a = at(e, tt);
    if (!a) return;
    if (a.leg) return;
    if (a.to == null) return ((here[a.at] = here[a.at] || { who: 0, boats: 0, type: null })[key]++, e.type && (here[a.at].type = here[a.at].type || e.type));
    const k = a.at + '>' + a.to;
    const g = (moving[k] = moving[k] || { a, who: 0, boats: 0, type: null });
    g[key]++;
    if (e.type) g.type = g.type || e.type;
  };
  people.forEach((m) => tally(m, 'who'));
  boats.forEach((b) => tally(b, 'boats'));

  const Pod = ({ x, y, n }) => (
    <g transform={`translate(${x} ${y})`}>
      <circle className="pod" r="5.6" />
      <text className="podN" y="2.6">
        {n}
      </text>
    </g>
  );
  const Fleet = ({ x, y, n, type }) => (
    <g className="fleet" transform={`translate(${x} ${y})`}>
      <g className="glyph boat" transform="translate(0 -3) scale(0.36)">
        <CraftPaths type={type || 'raft'} />
      </g>
      {n > 1 ? (
        <text className="fleetN" x="18" y="2.6">
          ×{n}
        </text>
      ) : null}
    </g>
  );
  const Rig = ({ c, x, y, flip }) => (
    <g style={{ color: c.tint }} transform={`translate(${x} ${y})`}>
      <g className="glyph rig" transform={`translate(${flip ? 8 : -8} -5.5) scale(${flip ? -0.36 : 0.36} 0.36)`}>
        {c.kind === 'outfitter' ? <TruckPaths /> : <CarPaths trailer={c.trailer} />}
      </g>
    </g>
  );
  const load = (x, y, d, g) => {
    const out = [];
    let cx = x;
    if (g.boats) {
      const w = g.boats > 1 ? 30 : 18;
      out.push(<Fleet key="f" x={d > 0 ? cx : cx - w} y={y} n={g.boats} type={g.type} />);
      cx += d * (w + 3);
    }
    if (g.who) out.push(<Pod key="p" x={cx + d * 6} y={y} n={g.who} />);
    return out;
  };

  return (
    <svg className="stage" viewBox={`0 0 ${W} ${H}`}>
      <path className="water" d={water} />
      <Roads L={L} />
      {rolling.map((m, i) => (m.r ? <polyline key={m.c.id} className="way" style={{ stroke: m.c.tint }} transform={`translate(${(i - (rolling.length - 1) / 2) * 1.7} ${(i - (rolling.length - 1) / 2) * 1.7})`} points={m.r.pts.map((q) => `${q.x},${q.y}`).join(' ')} /> : null))}

      {Object.entries(pos).map(([id, q]) => {
        const lot = parked[id] || [];
        const g = here[id] || { who: 0, boats: 0 };
        const many = lot.length > 3;
        const target = rolling.some((m) => m.a.to === id);
        const d = q.x < 60 ? -1 : 1;
        const carAt = (i) => ({ x: q.x - d * (14 + i * 19), y: q.y });
        return (
          <g key={id}>
            <circle className={'lot' + (q.riv ? ' riv' : '') + (target ? ' target' : '')} cx={q.x} cy={q.y} r="3.6" />
            <NodeKey q={q} name={byId[id]?.name || id} W={W} />
            {many ? (
              <g>
                <Rig c={{ tint: 'var(--ink-dim)', trailer: false }} {...carAt(0)} flip={d < 0} />
                <text className="fleetN cars" x={carAt(0).x - d * 10} y={q.y + 2.6} style={{ textAnchor: d < 0 ? 'start' : 'end' }}>
                  ×{lot.length}
                </text>
              </g>
            ) : (
              lot.map((c, i) => <Rig key={c.id} c={c} {...carAt(i)} flip={d < 0} />)
            )}
            {d < 0 ? load(q.x + 10 + (many ? 1 : lot.length) * 19, q.y, 1, g) : load(q.x + 8, q.y, 1, g)}
          </g>
        );
      })}

      {Object.entries(moving).map(([k, g]) => {
        const p1 = xy(g.a.at),
          p2 = xy(g.a.to);
        if (!p1 || !p2) return null;
        const f = ease(g.a.f);
        return <g key={k}>{load(p1.x + (p2.x - p1.x) * f + 8, p1.y + (p2.y - p1.y) * f - 1, 1, g)}</g>;
      })}
      {here.river ? (
        <g className="flotilla">
          <circle className="buoy" cx={fx} cy={ry(fx)} r="3" />
          {load(Math.max(4, Math.min(W - 50, fx - 20)), ry(fx) + 13, 1, here.river)}
        </g>
      ) : null}

      {rolling.map((m, i) => {
        if (!m.q) return null;
        const who = (m.a.leg.who || []).length,
          nb = (m.a.leg.boats || []).length;
        const up = i % 2 === 0;
        const type = boats.find((b) => b.id === (m.a.leg.boats || [])[0])?.type;
        return (
          <g key={m.c.id}>
            <Rig c={m.c} x={m.q.x} y={m.q.y} flip={m.flip} />
            <g transform={`translate(${Math.max(34, Math.min(W - 34, m.q.x))} ${m.q.y + (up ? -11 : 15)})`}>
              <text className="tagName" style={{ fill: m.c.tint }} y="0">
                {short(m.c.name)}
              </text>
              <g transform={`translate(${-((nb ? (nb > 1 ? 33 : 21) : 0) + (who ? 12 : 0)) / 2} ${up ? -11 : 11})`}>{load(0, 0, 1, { who, boats: nb, type })}</g>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

const NodeKey = ({ q, name, W }) => {
  const a = q.x < 40 ? 'start' : q.x > W - 40 ? 'end' : 'middle';
  return (
    <text className="nodeKey" x={a === 'start' ? q.x - 4 : a === 'end' ? q.x + 4 : q.x} y={q.y + (q.dy ?? -7)} style={{ textAnchor: a }}>
      {short(name, 18)}
    </text>
  );
};

const Roads = ({ L, sel, hot, onRoad }) => (
  <>
    {Object.entries(L.pos).map(([id, q]) => (q.riv ? <line key={id} className={q.foot ? 'trail' : 'ramp'} x1={q.x} y1={q.y} x2={L.rx(q.mile)} y2={L.ry(L.rx(q.mile))} /> : null))}
    {L.edges.map((r) => {
      const a = hot?.(r.a) || L.pos[r.a],
        b = hot?.(r.b) || L.pos[r.b];
      const mx = (a.x + b.x) / 2,
        my = (a.y + b.y) / 2;
      const label = num(r.h) > 0 ? hm(num(r.h)) : onRoad ? '?' : '';
      const w = textW(label) + 8;
      return (
        <g key={r.id} className={'road' + (sel === r.id ? ' on' : '')} onPointerDown={onRoad ? (e) => (e.stopPropagation(), onRoad(r.id)) : undefined}>
          {onRoad ? <line className="roadHit" x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> : null}
          <line className="rd" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          {label ? (
            <g transform={`translate(${mx} ${my})`}>
              <rect className="hrsBox" x={-w / 2} y="-5.5" width={w} height="11" rx="5.5" />
              <text className="hrs" y="2.4">
                {label}
              </text>
            </g>
          ) : null}
        </g>
      );
    })}
  </>
);

function Board({ S, s, onDone }) {
  const t = s.trip;
  const L = useMemo(() => plan(S, true), [S]);
  const { net, byId, places } = S;
  const [sel, setSel] = useState(null);
  const [drag, setDrag0] = useState(null);
  const [name, setName] = useState('');
  const svg = useRef(null);
  const dr = useRef(null);
  const setDrag = (v) => setDrag0((dr.current = v));
  const pt = (e) => {
    const p = svg.current.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(svg.current.getScreenCTM().inverse());
  };
  const roads = net.roads;
  const mine = (id) => (t.places || []).some((p) => p.id === id);
  const hot = (id) => (drag?.moved && drag.id === id ? drag : null);
  const cell = (x, y) => [Math.max(0, Math.min(COLS - 1, Math.round((x - L.M) / L.C))), Math.max(0, Math.min(ROWS - 1, Math.round((y - L.T) / L.C)))];

  const grab = (id) => (e) => {
    e.stopPropagation();
    svg.current.setPointerCapture?.(e.pointerId);
    const p = pt(e);
    setDrag({ id, x: p.x, y: p.y, sx: e.clientX, sy: e.clientY, moved: false });
  };
  const move = (e) => {
    const drag = dr.current;
    if (!drag) return;
    const p = pt(e);
    setDrag({ ...drag, x: p.x, y: p.y, moved: drag.moved || Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6 });
  };
  const drop = () => {
    const drag = dr.current;
    if (!drag) return;
    const id = drag.id;
    setDrag(null);
    if (drag.moved) {
      const c = cell(drag.x, drag.y);
      const clash = places.find((q) => q.id !== id && net.grid[q.id][0] === c[0] && net.grid[q.id][1] === c[1]);
      return s.set({ grid: { ...net.grid, [id]: c, ...(clash ? { [clash.id]: net.grid[id] } : {}) } });
    }
    if (sel?.node && sel.node !== id) {
      const ex = roads.find((r) => (r.a === sel.node && r.b === id) || (r.b === sel.node && r.a === id));
      if (ex) return setSel({ road: ex.id });
      const r = { id: uid(), a: sel.node, b: id, h: '' };
      s.set({ roads: [...roads, r] });
      return setSel({ road: r.id });
    }
    setSel(sel?.node === id ? null : { node: id });
  };

  const road = sel?.road && roads.find((r) => r.id === sel.road);
  const node = sel?.node && byId[sel.node];
  const setH = (r, h, m) => s.set({ roads: roads.map((x) => (x.id === r.id ? { ...x, h: num(h) + num(m) / 60 || '' } : x)) });
  const hrs = road ? Math.floor(num(road.h)) : 0;
  const mins = road ? Math.round((num(road.h) - hrs) * 60) : 0;

  return (
    <>
      <svg ref={svg} className="stage board" viewBox={`0 0 ${L.W} ${L.H}`} onPointerMove={move} onPointerUp={drop} onPointerCancel={() => setDrag(null)}>
        <rect className="boardBg" width={L.W} height={L.H} onPointerDown={() => setSel(null)} />
        {Array.from({ length: COLS * ROWS }, (_, i) => (
          <circle key={i} className="dot" cx={L.X(i % COLS)} cy={L.Y(Math.floor(i / COLS))} r="0.9" />
        ))}
        <path className="water" d={L.water} />
        <Roads L={L} sel={sel?.road} hot={hot} onRoad={(id) => setSel({ road: id })} />
        {Object.entries(L.pos).map(([id, q0]) => {
          const q = hot(id) || q0;
          const on = sel?.node === id || (road && (road.a === id || road.b === id));
          return (
            <g key={id} onPointerDown={grab(id)} className="pin">
              <circle className="hit" cx={q.x} cy={q.y} r="12" />
              <circle className={'lot' + (q0.riv ? ' riv' : '') + (on ? ' target' : '')} cx={q.x} cy={q.y} r={on ? 5 : 4.2} />
              <NodeKey q={q} name={byId[id]?.name || id} W={L.W} />
            </g>
          );
        })}
      </svg>

      <div className="boardPanel">
        {road ? (
          <>
            <div className="carName">
              {byId[road.a]?.name} — {byId[road.b]?.name}
            </div>
            <div className="numRow">
              <Num label="Hours" value={road.h === '' ? '' : hrs} onChange={(v) => setH(road, v, mins)} />
              <Num label="Minutes" value={road.h === '' ? '' : mins} onChange={(v) => setH(road, hrs, v)} />
            </div>
            <button className="btn ghost danger mt-s" onClick={() => (s.set({ roads: roads.filter((r) => r.id !== road.id) }), setSel(null))}>
              Remove road
            </button>
          </>
        ) : node ? (
          <>
            {mine(node.id) ? (
              <div className="row">
                <Field label="Name" value={node.name} onChange={(e) => s.patch('places', node.id, { name: e.target.value })} />
                <div className="numRow">
                  <Num label="River mile" value={node.mile ?? ''} onChange={(v) => s.patch('places', node.id, { mile: v === '' ? null : v })} />
                </div>
              </div>
            ) : (
              <div className="carName">
                {node.name}
                {emile(node) >= 0 ? <span className="muted"> · mile {emile(node)}</span> : null}
              </div>
            )}
            <div className="chips">
              {roads
                .filter((r) => r.a === node.id || r.b === node.id)
                .map((r) => (
                  <button key={r.id} className="chip" onClick={() => setSel({ road: r.id })}>
                    {byId[r.a === node.id ? r.b : r.a]?.name}
                    {num(r.h) > 0 ? ` · ${hm(num(r.h))}` : ''}
                  </button>
                ))}
            </div>
            <span className="muted">Tap another place to add a road</span>
            {mine(node.id) ? (
              <button
                className="btn ghost danger mt-s"
                onClick={() => {
                  const { [node.id]: _, ...g } = net.grid;
                  s.set({ places: t.places.filter((p) => p.id !== node.id), roads: roads.filter((r) => r.a !== node.id && r.b !== node.id), grid: g });
                  setSel(null);
                }}
              >
                Remove place
              </button>
            ) : null}
          </>
        ) : (
          <span className="muted">Drag to move · tap two places to connect</span>
        )}
        <div className="row mt-s">
          <Field value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a place" />
          <button
            className="btn"
            disabled={!name.trim()}
            onClick={() => {
              s.push('places', { name: name.trim() });
              setName('');
            }}
          >
            Add
          </button>
        </div>
        <button className="btn mt-s" onClick={onDone}>
          Done
        </button>
      </div>
    </>
  );
}

const TruckPaths = () => (
  <>
    <path d="M2 13h28M4.5 13a2.2 2.2 0 1 0 4.4 0 2.2 2.2 0 1 0-4.4 0M21 13a2.2 2.2 0 1 0 4.4 0 2.2 2.2 0 1 0-4.4 0" />
    <path d="M2 13V3.5h20V13M22 6.5h6l4 4V13" />
    <path d="M32 13h12M34 13a2 2 0 1 0 4 0 2 2 0 1 0-4 0" />
    <path d="M32 12.5V7h11v5.5z" />
</>
);

const TruckIcon = () => (
  <svg className="carIcon" viewBox="0 0 46 18" aria-hidden="true">
    <TruckPaths />
  </svg>
);

function Stage({ S, s }) {
  const [u, setU] = useState(0);
  const [play, setPlay] = useState(false);
  const [edit, setEdit] = useState(false);
  const { U, tOf, stops, start, N, legs, byId, people, mileAt, at } = S;
  const L = useMemo(() => plan(S), [S]);
  useEffect(() => {
    if (!play) return;
    let last = performance.now();
    let id = 0;
    const step = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setU((v) => {
        if (v + dt >= U) {
          setPlay(false);
          return U;
        }
        return v + dt;
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

  if (edit)
    return (
      <div className="stageWrap">
        <Board S={S} s={s} onDone={() => setEdit(false)} />
      </div>
    );

  return (
    <div className="stageWrap">
      <Story S={S} L={L} tt={tt} />
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
        <button className="skip" onClick={() => (setPlay(false), setEdit(true))} aria-label="Edit roads">
          ✎
        </button>
      </div>
      <div className="dayKey">
        <span>{fmt(iso)}</span>
        {rolling.map((l) => {
          const who = (l.who || []).length;
          const bo = (l.boats || []).length;
          const tail = [who ? `${who} aboard` : l.pro ? 'shuttle service' : null, bo ? `${bo} boat${bo > 1 ? 's' : ''}` : null, l.gear ? 'gear' : null].filter(Boolean).join(' · ');
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

function Shuttle({ s }) {
  const t = s.trip;
  const [openLeg, setOpenLeg] = useState(null);
  const [openCar, setOpenCar] = useState(null);
  const [carName, setCarName] = useState('');
  const S = useMemo(() => story(t), [t]);
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
  const setLeg = (id, patch) => save(legs.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const dropLeg = (id) => save(legs.filter((l) => l.id !== id));
  const swap = (a, b) => {
    const i = legs.findIndex((l) => l.id === a),
      j = legs.findIndex((l) => l.id === b);
    const next = [...legs];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };
  const addLeg = () => {
    const last = legs[legs.length - 1];
    const car = last?.car || cars[0]?.id || '';
    const prev = [...legs].reverse().find((l) => l.car === car);
    const l = { id: uid(), car, from: prev ? prev.to : off[0]?.id || '', to: '', date: last ? last.date : start, who: [], boats: [], gear: false, pro: false, par: false };
    save([...legs, l]);
    setOpenLeg(l.id);
  };

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
    if (l.from === l.to || gone.has(k) || S.net.drive(l.from, l.to)) return;
    gone.add(k);
    warn.push(`No road between ${pname(l.from)} and ${pname(l.to)}.`);
  });
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

  const days = [...new Set(legs.map((l) => l.date))].sort();

  return (
    <>
      <Stage S={S} s={s} />
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

      <span className="label mt">Plan</span>
      {days.map((d) => {
        const mine = legs.filter((l) => l.date === d);
        const step = mine.map((l, i) => (i ? (l.par ? 0 : 1) : 1)).map((v, i, arr) => arr.slice(0, i + 1).reduce((x, y) => x + y, 0));
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
                <div className={'grItem' + (isOpen ? ' open' : '')} key={l.id}>
                  <button className="leg" onClick={() => setOpenLeg(isOpen ? null : l.id)}>
                    <span className="legSeq">{l.par && i ? '‖' : step[i]}</span>
                    <span className="legDot" style={{ background: tint(l.car) }} />
                    <span className="carText">
                      <span className="carName">
                        {c?.name || 'No vehicle'} <span className="legWay">{pname(l.from)} → {pname(l.to)}</span>
                      </span>
                      <span className="muted">
                        {[hm(S.net.drive(l.from, l.to)?.h), who ? `${who} aboard` : l.pro ? 'shuttle service' : 'empty', nb ? `${nb} boat${nb > 1 ? 's' : ''}` : null, l.gear ? 'gear' : null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="grBody">
                      <div className="row">
                        <Sel label="Vehicle" value={l.car} onChange={(v) => setLeg(l.id, { car: v })}>
                          <option value="">—</option>
                          {cars.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </Sel>
                        <Sel label="Date" value={l.date} onChange={(v) => setLeg(l.id, { date: v })}>
                          {dates.map((x) => (
                            <option key={x} value={x}>
                              {fmt(x)}
                              {dtag(x)}
                            </option>
                          ))}
                        </Sel>
                      </div>
                      <div className="row">
                        <Sel label="From" value={l.from} onChange={(v) => setLeg(l.id, { from: v })}>
                          {opts}
                        </Sel>
                        <Sel label="To" value={l.to} onChange={(v) => setLeg(l.id, { to: v })}>
                          {opts}
                        </Sel>
                      </div>
                      <div className="chips">
                        {i > 0 && (
                          <button className={'chip' + (l.par ? ' on' : '')} onClick={() => setLeg(l.id, { par: !l.par })}>
                            Same time as the leg above
                          </button>
                        )}
                        {c?.kind !== 'outfitter' && (
                          <button className={'chip' + (l.pro ? ' on' : '')} onClick={() => setLeg(l.id, { pro: !l.pro })}>
                            Shuttle service drives
                          </button>
                        )}
                        <button className={'chip' + (l.gear ? ' on' : '')} onClick={() => setLeg(l.id, { gear: !l.gear })}>
                          Gear aboard
                        </button>
                      </div>
                      {c?.kind !== 'outfitter' && (
                        <>
                          <span className="label">Riding along</span>
                          <div className="chips">
                            {t.crew.map((m) => {
                              const on = (l.who || []).includes(m.id);
                              return (
                                <button key={m.id} className={'chip' + (on ? ' on' : '')} onClick={() => setLeg(l.id, { who: on ? l.who.filter((q) => q !== m.id) : [...(l.who || []), m.id] })}>
                                  {m.name}
                                </button>
                              );
                            })}
                            {!t.crew.length && <span className="muted">Add people on the Crew tab</span>}
                          </div>
                        </>
                      )}
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
                        <button className="btn ghost" disabled={i === 0} onClick={() => swap(l.id, mine[i - 1].id)}>
                          ▲
                        </button>
                        <button className="btn ghost" disabled={i === mine.length - 1} onClick={() => swap(l.id, mine[i + 1].id)}>
                          ▼
                        </button>
                        <button className="btn ghost danger" onClick={() => dropLeg(l.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      <button className="btn ghost mt-s" onClick={addLeg} disabled={!cars.length}>
        Add leg
      </button>

      <span className="label mt">Vehicles</span>
      {cars.map((c) => (
        <div className={'grItem' + (openCar === c.id ? ' open' : '')} key={c.id}>
          <button className="car" onClick={() => setOpenCar(openCar === c.id ? null : c.id)}>
            <span className="carIconWrap" style={{ color: tint(c.id) }}>
              {c.kind === 'outfitter' ? <TruckIcon /> : <CarIcon trailer={c.trailer} />}
            </span>
            <span className="carText">
              <span className="carName">{c.name}</span>
              <span className="muted">
                {t.crew.find((x) => x.id === c.owner)?.name || (c.kind === 'outfitter' ? 'Delivers and collects boats' : 'No owner')}
                {num(c.seats) ? ` · ${num(c.seats)} seats` : ''}
                {c.trailer && c.kind !== 'outfitter' ? ' · trailer' : ''}
                {` · ${legs.filter((l) => l.car === c.id).length} legs`}
              </span>
            </span>
          </button>
          {openCar === c.id && (
            <div className="grBody">
              <Field label="Name" value={c.name} onChange={(e) => s.patch('cars', c.id, { name: e.target.value })} />
              {c.kind !== 'outfitter' && (
                <>
                  <span className="label">Owner</span>
                  <div className="chips">
                    {t.crew.map((x) => (
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
                </>
              )}
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
      <div className="row mt">
        <Field value={carName} onChange={(e) => setCarName(e.target.value)} placeholder="Add a vehicle" />
        <button
          className="btn"
          disabled={!carName.trim()}
          onClick={() => {
            s.push('cars', { name: carName.trim(), owner: '', seats: '', trailer: false });
            setCarName('');
          }}
        >
          Add
        </button>
      </div>
      {!cars.some((c) => c.kind === 'outfitter') && (
        <button className="btn ghost mt-s" onClick={() => s.push('cars', { name: 'Outfitter', kind: 'outfitter', owner: '', seats: '', trailer: true })}>
          Add an outfitter
        </button>
      )}

    </>
  );
}

function Ledger({ s }) {
  const t = s.trip;
  const pay = t.pay || [];
  const L = useMemo(() => ledger(t), [t]);
  const [what, setWhat] = useState('');
  const [by, setBy] = useState('');
  const [amt, setAmt] = useState('');
  const paid = {};
  t.crew.forEach((c) => (paid[c.id] = 0));
  pay.forEach((p) => (paid[p.by] = (paid[p.by] || 0) + num(p.amt)));
  const col = (k) => t.crew.reduce((a, c) => a + L.by[c.id][k], 0);
  const sum = { even: col('even'), personal: col('personal'), group: col('nights') + col('users') };
  const potted = Object.values(paid).reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="tbl">
        <div className="tr th">
          <span className="tName">Crew</span>
          <span>Even</span>
          <span>Rental</span>
          <span>Group</span>
          <span>Total</span>
        </div>
        {t.crew.map((c) => {
          const b = L.by[c.id];
          return (
            <div className="tr" key={c.id}>
              <span className="tName">{c.name}</span>
              <span>{usd0(b.even)}</span>
              <span>{usd0(b.personal)}</span>
              <span>{usd0(b.nights + b.users)}</span>
              <span className="tSum">{usd0(b.total)}</span>
            </div>
          );
        })}
        <div className="tr tf">
          <span className="tName">{t.crew.length} on the river</span>
          <span>{usd0(sum.even)}</span>
          <span>{usd0(sum.personal)}</span>
          <span>{usd0(sum.group)}</span>
          <span className="tSum">{usd0(sum.even + sum.personal + sum.group)}</span>
        </div>
      </div>
      {L.loose > 0.005 && <div className="muted">{usd0(L.loose)} unassigned — no one has claimed those items.</div>}

      <span className="label mt">Paid in</span>
      <div className="tbl">
        <div className="tr2 th">
          <span className="tName">Crew</span>
          <span>Paid</span>
          <span>Owed</span>
          <span>Balance</span>
        </div>
        {t.crew.map((c) => {
          const d = (paid[c.id] || 0) - L.by[c.id].total;
          return (
            <div className="tr2" key={c.id}>
              <span className="tName">{c.name}</span>
              <span>{usd0(paid[c.id] || 0)}</span>
              <span>{usd0(L.by[c.id].total)}</span>
              <span className={'tSum' + (d < -0.5 ? ' owes' : '')}>{(d < 0 ? '−' : '+') + usd0(Math.abs(d))}</span>
            </div>
          );
        })}
      </div>

      {pay.map((p) => (
        <div className="gearRow" key={p.id}>
          <span className="gearName">
            {p.what}
            <span className="muted"> {t.crew.find((c) => c.id === p.by)?.name || '—'}</span>
          </span>
          <span className="grAmt">{usd0(num(p.amt))}</span>
          <button className="x" onClick={() => s.drop('pay', p.id)} aria-label="Remove">
            ✕
          </button>
        </div>
      ))}
      {pay.length > 0 && <div className="muted">{usd0(potted)} paid in so far</div>}

      <div className="mt">
        <Field value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Expense" />
        <div className="chips">
          {t.crew.map((c) => (
            <button key={c.id} className={'chip' + (by === c.id ? ' on' : '')} onClick={() => setBy(by === c.id ? '' : c.id)}>
              {c.name}
            </button>
          ))}
        </div>
        <div className="row">
          <label className="field narrow">
            <input inputMode="decimal" value={amt} placeholder="0" onChange={(e) => setAmt(e.target.value)} />
          </label>
          <button
            className="btn"
            disabled={!what.trim() || !by || !num(amt)}
            onClick={() => {
              s.push('pay', { what: what.trim(), by, amt: num(amt) });
              setWhat('');
              setAmt('');
            }}
          >
            Add
          </button>
        </div>
      </div>
    </>
  );
}

const REF_NOTE = {
  'Shopping list': 'Draft list from the sheet. The day names (Friday, Saturday...) predate the current menu dates, so match items to meals by name.',
  'Crew Council': 'Notes are kept as recorded; plans changed over time, so check the Itinerary and Shuttle tabs for the current plan.',
};

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

function Info({ s }) {
  const ref = REFS[s.trip.id];
  const groups = ref ? [...new Set(ref.sections.map((x) => x.group))] : [];
  const [g, setG] = useState(groups[0]);
  if (!ref) return <div className="muted">No reference notes for this trip.</div>;
  return (
    <>
      <div className="chips scroll">
        {groups.map((x) => (
          <button key={x} className={'chip' + (g === x ? ' on' : '')} onClick={() => setG(x)}>
            {x}
          </button>
        ))}
      </div>
      {REF_NOTE[g] ? <div className="muted mt">{REF_NOTE[g]}</div> : null}
      <div className="mt">
        {ref.sections.filter((x) => x.group === g).map((x, i) => (
          <InfoSection sec={x} key={g + i} />
        ))}
      </div>
    </>
  );
}

function Log({ s }) {
  const [text, setText] = useState('');
  const [date, setDate] = useState(today());
  return (
    <>
      <Field area value={text} onChange={(e) => setText(e.target.value)} placeholder="Today" />
      <div className="row">
        <Field type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button
          className="btn"
          disabled={!text.trim()}
          onClick={() => {
            s.push('log', { date, text: text.trim() });
            setText('');
          }}
        >
          Save
        </button>
      </div>
      {!s.trip.log.length && (
        <Empty icon="inbox" title="No log entries yet">
          Jot down the day's river notes, hazards and wildlife sightings here.
        </Empty>
      )}
      {[...s.trip.log].reverse().map((e) => (
        <div className="entry" key={e.id}>
          <div className="entryHead">
            <span className="label">{fmt(e.date)}</span>
            <button className="x" onClick={() => s.drop('log', e.id)} aria-label="Remove">
              ✕
            </button>
          </div>
          <div className="line">{e.text}</div>
        </div>
      ))}
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
      <div className="mt">
        <Field label="Not listed? Add your name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
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
        <button className="btn" disabled={!ok} onClick={add}>
          Add
        </button>
      </div>
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
        <Field label="Name" value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value })} placeholder="Corn Creek" />
        <div className="row">
          <Field label="River mile" value={acc.mile} onChange={(e) => setAcc({ ...acc, mile: e.target.value })} inputMode="decimal" placeholder="blank for a town / hub" />
          <label className="check">
            <input type="checkbox" checked={acc.hub} onChange={(e) => setAcc({ ...acc, hub: e.target.checked })} /> Hub / town
          </label>
        </div>
        <button
          className="btn ghost"
          disabled={!acc.name.trim() || (!acc.hub && !isFinite(parseFloat(acc.mile)))}
          onClick={() => {
            const m = parseFloat(acc.mile);
            const p = { name: acc.name.trim(), road: true, park: !acc.hub };
            if (acc.hub) p.hub = true;
            if (isFinite(m)) p.mile = m;
            setAccess([...access, p]);
            setAcc({ name: '', mile: '', hub: false });
          }}
        >
          Add access point
        </button>
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
          {riverOpen && (
            <button className="hback" onClick={() => setBrowse(null)} aria-label="Back to all rivers">
              <Icon name="back" size={18} /> Rivers
            </button>
          )}
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
            <Trip s={s} back={() => setInTrip(false)} onAccount={() => { setProfSub('Account'); setTab('Profile'); }} />
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
