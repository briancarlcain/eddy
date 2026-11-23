import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { alignGear } from '../src/gearAlign.js';
import { mergeTrips } from '../src/merge.js';
import { GEAR_RENAMES } from '../src/gearRename.js';

const SEED = JSON.parse(readFileSync(new URL('../data/trip.json', import.meta.url)));
const ref = SEED.gear;
const idOf = (n) => ref.find((g) => g.n === n).id;
const align = (t) => alignGear(t, ref, GEAR_RENAMES);

// an older copy: the coffee table is not in its list, so everything after it is numbered one lower
const old = (extra = {}) => {
  const gear = ref.filter((_, i) => i !== 38).map((g, i) => ({ id: i >= 38 ? ref[i].id : g.id, n: g.n, c: g.c, e: {} }));
  return { id: SEED.id, name: SEED.name, gear, ...extra };
};

// a current copy is left alone
assert.equal(align({ id: SEED.id, gear: ref.map((g) => ({ ...g })) }).gear[40].id, ref[40].id);
{
  const same = { id: SEED.id, gear: ref.map((g) => ({ id: g.id, n: g.n, e: {} })) };
  assert.equal(align(same), same, 'nothing to change returns the same object');
}

// an older numbering is put back under the current ids, by name
{
  const a = align(old());
  const bad = a.gear.filter((g) => !ref.some((r) => r.n === g.n && r.id === g.id));
  assert.equal(bad.length, 0, 'every item sits under its current id');
  assert.equal(new Set(a.gear.map((g) => g.id)).size, a.gear.length, 'ids stay unique');
  assert.equal(align(a), a, 'aligning twice changes nothing');
}

// Maya's koozie count lands on the koozie, not on the item that shares its old id
{
  const koozie = idOf('Voile or Suction Koozie'), packraft = idOf('Inflatable Kayak or Packraft & Paddle');
  const stale = old();
  stale.gear.find((g) => g.n === 'Voile or Suction Koozie').e = { 'maya-husayni': { bring: '1', _u: 500 } };
  const live = { id: SEED.id, gear: ref.map((g) => ({ id: g.id, n: g.n, c: g.c, e: {} })) };
  const merged = mergeTrips(align(live), align(stale));
  const wrong = stale.gear.find((g) => g.n === 'Voile or Suction Koozie').id;
  const raw = mergeTrips(live, stale);
  assert.notEqual(wrong, koozie);
  assert.equal(raw.gear.find((g) => g.id === wrong).e['maya-husayni']?.bring, '1', 'without aligning, the count leaks onto another item');
  assert.equal(merged.gear.length, ref.length);
  assert.equal(merged.gear.find((g) => g.id === koozie).n, 'Voile or Suction Koozie');
  assert.equal(merged.gear.find((g) => g.id === koozie).e['maya-husayni'].bring, '1');
  assert.equal(Object.keys(merged.gear.find((g) => g.id === wrong).e).length, 0, 'nothing leaks onto the item that shares its old id');
}

// custom items keep their ids; an unknown name that sits on a wanted id gets a new one
{
  const stale = old();
  stale.gear.push({ id: 'mine1', n: 'Thermos', e: {} });
  stale.gear[40] = { id: stale.gear[40].id, n: 'Something Renamed', e: { a: { bring: '2' } } };
  const a = align(stale);
  assert.ok(a.gear.some((g) => g.id === 'mine1'));
  const r = a.gear.find((g) => g.n === 'Something Renamed');
  assert.equal(new Set(a.gear.map((g) => g.id)).size, a.gear.length);
  assert.notEqual(r.id, stale.gear[40].id, 'it no longer shares an id with another item');
  assert.deepEqual(r.e, { a: { bring: '2' } }, 'its quantities stay with it');
}

// removals recorded under the old numbering are dropped, custom ones kept
{
  const stale = old({ _del: { gear: { g100: 5, mine1: 6 } } });
  const a = align(stale);
  assert.deepEqual(a._del.gear, { mine1: 6 });
}

// other trips are not touched
{
  const other = { id: 'other', gear: [{ id: 'g001', n: 'Tent' }] };
  assert.equal(align(other), other);
}
// an added item with the same name as a listed one leaves the trip untouched (no endless re-saving)
{
  const t = { id: SEED.id, gear: [...ref.map((g) => ({ ...g })), { id: 'mwlwk9ljwvzb8z', n: ref.find((g) => g.id === 'g178').n }], _del: { gear: { g010: 5 } } };
  assert.equal(align(t), t);
}
console.log('align tests passed');

// ids are permanent: append new items, never reorder; a renamed item needs an entry in gearRename.js and the pin updated
{
  const pin = JSON.parse(readFileSync(new URL('../data/gear-ids.json', import.meta.url)));
  const now = new Map(ref.map((g) => [g.id, g.n]));
  for (const [id, n] of Object.entries(pin)) assert.equal(now.get(id), n, `gear id ${id} must stay "${n}" (append new items; to rename, add it to src/gearRename.js and data/gear-ids.json)`);
}
