// Favorites (starred camps and hikes, each with a note).
// Your own favorites live on this device and follow you from trip to trip: opening a trip on the same river
// copies them into that trip's `favs` list under your crew member, so the crew sees them, and picks up
// anything you starred in another trip. Each entry carries `t` (when it was last changed); the newest wins.
import { useSyncExternalStore } from 'react';

const KEY = 'eddy.v1.favs';
let data = {};
try {
  data = JSON.parse(localStorage.getItem(KEY)) || {};
} catch {}
const subs = new Set();
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
};
const emit = () => subs.forEach((f) => f());
export const subscribeFavs = (f) => (subs.add(f), () => subs.delete(f));
export const getFavs = () => data;

export const favKey = (rid, kind, it) => `${rid}|${kind}|${it.name}|${Number(it.mile).toFixed(1)}`;

// change your own star and/or note (kept as a removal marker when unstarred so other trips drop it too)
export function setFav(key, patch) {
  const cur = data[key] || {};
  const next = { ...cur, ...patch };
  data = { ...data, [key]: { s: next.s ? 1 : 0, n: next.n || '', t: Date.now() } };
  save();
  emit();
}

// take in entries (from a trip) that are newer than what this device has
export function mergeFavs(entries) {
  let out = null;
  for (const [k, v] of Object.entries(entries)) {
    if ((v.t || 0) > ((data[k] || {}).t || 0)) (out ||= { ...data })[k] = { s: v.s ? 1 : 0, n: v.n || '', t: v.t };
  }
  if (!out) return;
  data = out;
  save();
  emit();
}

export const useFavs = () => useSyncExternalStore(subscribeFavs, getFavs);

const favId = (me, k) => `${me}~${k}`;

// Compare your personal favorites with what a trip holds under your crew id, for one river.
// Returns the trip's new favs list (or null when nothing changed) and the entries the device should take from the trip.
export function reconcileFavs(favs, me, mine, rid) {
  const pre = rid + '|';
  const list = Array.isArray(favs) ? favs : [];
  const have = new Map(list.filter((f) => f.by === me && f.k.startsWith(pre)).map((f) => [f.k, f]));
  const add = [];
  const pull = {};
  for (const [k, v] of Object.entries(mine)) {
    if (!k.startsWith(pre)) continue;
    const f = have.get(k);
    const t = v.t || 0;
    if (!f) {
      if (v.s || v.n) add.push({ id: favId(me, k), k, by: me, s: v.s ? 1 : 0, n: v.n || '', t });
    } else if (t > (f.t || 0)) add.push({ id: f.id, k, by: me, s: v.s ? 1 : 0, n: v.n || '', t });
    else if ((f.t || 0) > t) pull[k] = { s: f.s, n: f.n, t: f.t };
  }
  for (const [k, f] of have) if (!(k in mine)) pull[k] = { s: f.s, n: f.n, t: f.t };
  if (!add.length) return { favs: null, pull };
  const ids = new Set(add.map((a) => a.id));
  return { favs: [...list.filter((f) => !ids.has(f.id)), ...add], pull };
}

// everyone else's stars on one item in a trip
export function crewFavs(trip, key, me) {
  return ((trip && trip.favs) || []).filter((f) => f.k === key && f.by !== me && f.s);
}
