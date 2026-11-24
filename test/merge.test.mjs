import assert from 'node:assert/strict';
import { canon, mergeTrips, stamp, strip } from '../src/merge.js';

const base = {
  id: 't1', name: 'Trip', start: '2027-01-01', days: 5, at: 1,
  crew: [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bo' }],
  gear: [{ id: 'g1', n: 'Stove', s: 'nights', e: {} }, { id: 'g2', n: 'Tent', s: 'personal', e: {} }],
  meals: [{ id: 'm1', day: 0, slot: 'Dinner', name: 'Chili' }],
  plans: { 0: { camp: 'X', mile: 1 } },
};
let T = 1000;
const edit = (t, fn) => { T += 10; return stamp(t, { ...fn(structuredClone(t)), at: T }, T); };
const sync = (a, b) => { // one round trip: each side merges the other's copy
  const A2 = mergeTrips(a, b, T), B2 = mergeTrips(b, a, T);
  return [A2, B2];
};
const converge = (a, b) => { for (let i = 0; i < 4; i++) [a, b] = sync(a, b); return [a, b]; };

// 1. Concurrent edits to different things are all kept
{
  let A = edit(base, (t) => { t.name = 'Grand Trip'; return t; });
  let B = edit(base, (t) => { t.days = 7; t.crew.push({ id: 'c', name: 'Cy' }); return t; });
  A = edit(A, (t) => { t.meals.push({ id: 'm2', day: 1, slot: 'Lunch', name: 'Wraps' }); return t; });
  const [a, b] = converge(A, B);
  assert.equal(canon(a), canon(b), 'devices converge');
  assert.equal(a.name, 'Grand Trip'); assert.equal(a.days, 7);
  assert.deepEqual(a.crew.map((c) => c.id).sort(), ['a', 'b', 'c']);
  assert.equal(a.meals.length, 2);
}
// 2. Two people fill in their own gear quantities on the same item at once
{
  let A = edit(base, (t) => { t.gear[0].e.a = { have: 1 }; return t; });
  let B = edit(base, (t) => { t.gear[0].e.b = { lend: 2 }; return t; });
  const [a, b] = converge(A, B);
  assert.deepEqual(strip(a.gear[0].e), { a: { have: 1 }, b: { lend: 2 } });
  assert.equal(canon(a), canon(b));
}
// 3. Same field edited by both: later edit wins
{
  let A = edit(base, (t) => { t.name = 'Early'; return t; });
  let B = edit(base, (t) => { t.name = 'Late'; return t; });
  const [a] = converge(A, B);
  assert.equal(a.name, 'Late');
}
// 4. Deletes are not undone by a stale copy, but a later edit revives the item
{
  let A = edit(base, (t) => { t.crew = t.crew.filter((c) => c.id !== 'b'); return t; });
  const [a, b] = converge(A, base);
  assert.deepEqual(a.crew.map((c) => c.id), ['a']);
  assert.equal(canon(a), canon(b));
  const B = edit(base, (t) => { t.crew[1].name = 'Bo Peep'; return t; });
  const [r] = converge(A, B);
  assert.equal(r.crew.find((c) => c.id === 'b')?.name, 'Bo Peep');
}
// 5. Edits to the same item: later one wins; different items both survive
{
  let A = edit(base, (t) => { t.gear[0].n = 'Big stove'; t.gear[1].n = 'Big tent'; return t; });
  let B = edit(base, (t) => { t.gear[0].n = 'Tiny stove'; return t; });
  const [a] = converge(A, B);
  assert.equal(a.gear[0].n, 'Tiny stove'); assert.equal(a.gear[1].n, 'Big tent');
}
// 6. Plans merge per day
{
  let A = edit(base, (t) => { t.plans[1] = { camp: 'Y', mile: 9 }; return t; });
  let B = edit(base, (t) => { t.plans[2] = { camp: 'Z', mile: 20 }; return t; });
  const [a] = converge(A, B);
  assert.deepEqual(Object.keys(a.plans).sort(), ['0', '1', '2']);
}
// 7. Merging is idempotent and an untouched copy produces no change (no push ping-pong)
{
  const A = edit(base, (t) => { t.name = 'N'; return t; });
  const m1 = mergeTrips(base, A, T);
  const m2 = mergeTrips(m1, A, T);
  assert.equal(canon(m1), canon(m2));
  assert.equal(canon(mergeTrips(A, A, T)), canon(A));
}
// 8. A private list that the other copy never has survives a merge with it (personal journal)
{
  const mine = { ...base, journal: [{ id: 'j1', date: '2027-01-01', text: 'private', _u: 5 }] };
  const m = mergeTrips(mine, base, T);
  assert.deepEqual(m.journal.map((x) => x.text), ['private']);
  const m2 = mergeTrips(mine, { ...base, name: 'Renamed' }, T);
  assert.equal(m2.journal.length, 1);
}
// 9. A stale copy upgraded on open (one-time gear upgrades) does not overwrite newer edits from the crew
{
  const old = edit(base, (t) => t);
  let crew = edit(old, (t) => { t.gear[0].f = 40; t.gear[0].rn = '2'; t.gear[0].e.a = { bring: '3' }; t.rentV = 3; return t; });
  T += 1e6; // the stale device opens much later
  const upgrade = (t) => ({ ...t, rentV: 3, gear: t.gear.map((g) => ({ ...g, rn: '1', e: { a: {}, b: {} } })), at: T });
  const stale = stamp(old, upgrade(old), T, true);
  const [a, b] = converge(stale, crew);
  assert.equal(canon(a), canon(b));
  assert.equal(a.gear[0].f, 40, 'price kept'); assert.equal(a.gear[0].rn, '2', 'renting kept');
  assert.equal(a.gear[0].e.a.bring, '3', 'quantity kept'); assert.equal(a.rentV, 3);
  // where nobody else changed anything, the upgrade still applies over the old copy
  const [c] = converge(stale, old);
  assert.equal(c.gear[1].rn, '1'); assert.equal(c.rentV, 3);
  // a normal edit is still stamped with the time it was made
  assert.equal(stamp(old, upgrade(old), T).gear[0]._u, T);
}
// 10. Different fields of one gear item edited on two devices: both edits survive
{
  const A = edit(base, (t) => { t.gear[0].f = 40; return t; });
  const B = edit(base, (t) => { t.gear[0].rn = '3'; t.gear[0].ra = 'group'; return t; });
  const [a, b] = converge(A, B);
  assert.equal(canon(a), canon(b));
  assert.equal(a.gear[0].f, 40, 'price kept'); assert.equal(a.gear[0].rn, '3', 'renting kept');
  // the same field: the later edit wins
  const C = edit(a, (t) => { t.gear[0].f = 50; return t; });
  const D = edit(b, (t) => { t.gear[0].f = 60; return t; });
  const [c] = converge(C, D);
  assert.equal(c.gear[0].f, 60);
  // a field removed (price switched to per day) stays removed
  const E = edit(c, (t) => { delete t.gear[0].f; t.gear[0].d = 5; return t; });
  const [e1, e2] = converge(E, c);
  assert.equal(e1.gear[0].f, undefined); assert.equal(e1.gear[0].d, 5); assert.equal(canon(e1), canon(e2));
}
// 11. A copy that missed a newer price edit can't put the old price back by changing something else on the item
{
  const priced = edit(base, (t) => { t.gear[0].f = 40; return t; }); // on the server, from a device without field times
  delete priced.gear[0]._f;
  const stale = edit(base, (t) => { t.gear[0].rn = '2'; return t; }); // a phone that never saw it
  const [a] = converge(stale, priced);
  assert.equal(a.gear[0].f, 40, 'newer price kept'); assert.equal(a.gear[0].rn, '2', 'rental kept');
}
// 12. An edit from an app that doesn't keep field times still wins over older values
{
  const A = edit(base, (t) => { t.gear[0].f = 40; t.gear[0].rn = '1'; return t; });
  T += 10;
  const old = { ...A, gear: A.gear.map((g, i) => (i ? g : { ...g, rn: '5', _u: T })) }; // older app: bumps _u, leaves _f alone
  const [a, b] = converge(old, A);
  assert.equal(a.gear[0].rn, '5'); assert.equal(a.gear[0].f, 40); assert.equal(canon(a), canon(b));
}
// 13. Meals, crew details and day plans merge per field too
{
  const A = edit(base, (t) => { t.meals[0].name = 'Tacos'; t.plans[0].camp = 'Y'; t.crew[0].diet = 'vegan'; return t; });
  const B = edit(base, (t) => { t.meals[0].items = 'tortillas'; t.plans[0].note = 'early start'; t.crew[0].ice = 'Mom'; return t; });
  const [a, b] = converge(A, B);
  assert.equal(canon(a), canon(b));
  assert.equal(a.meals[0].name, 'Tacos'); assert.equal(a.meals[0].items, 'tortillas');
  assert.equal(a.plans[0].camp, 'Y'); assert.equal(a.plans[0].note, 'early start'); assert.equal(a.plans[0].mile, 1);
  assert.equal(a.crew[0].diet, 'vegan'); assert.equal(a.crew[0].ice, 'Mom');
}
console.log('merge tests passed');
