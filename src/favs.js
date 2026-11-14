// Personal favorites (starred camps and hikes, with a note). Kept on this device only: never part of a trip, so crew never see them.
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
const subscribe = (f) => (subs.add(f), () => subs.delete(f));
const snap = () => data;

export const favKey = (rid, kind, it) => `${rid}|${kind}|${it.name}|${Number(it.mile).toFixed(1)}`;

// set a favorite's star and/or note; an entry with no star and no note is dropped
export function setFav(key, patch) {
  const cur = data[key] || {};
  const next = { ...cur, ...patch };
  const out = { ...data };
  if (next.s || (next.n || '').trim()) out[key] = { ...(next.s ? { s: 1 } : {}), ...((next.n || '') ? { n: next.n } : {}) };
  else delete out[key];
  data = out;
  save();
  emit();
}

export const useFavs = () => useSyncExternalStore(subscribe, snap);
