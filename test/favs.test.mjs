import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { reconcileFavs, crewFavs } = await import('../src/favs.js');

const R = 'gc';
const k1 = `${R}|camp|Nevills|75.0`, k2 = `${R}|hike|Deer Creek|136.0`, other = `salmon|camp|Big Bar|1.0`;
// a trip with nothing yet takes my stars on this river only
let r = reconcileFavs([], 'me', { [k1]: { s: 1, n: 'big beach', t: 5 }, [other]: { s: 1, n: '', t: 6 } }, R);
assert.equal(r.favs.length, 1); assert.deepEqual(r.favs[0], { id: `me~${k1}`, k: k1, by: 'me', s: 1, n: 'big beach', t: 5 }); assert.deepEqual(r.pull, {});
// nothing to do when they match
assert.equal(reconcileFavs(r.favs, 'me', { [k1]: { s: 1, n: 'big beach', t: 5 } }, R).favs, null);
// a newer change on the device updates the trip's entry
r = reconcileFavs(r.favs, 'me', { [k1]: { s: 0, n: '', t: 9 } }, R);
assert.equal(r.favs.length, 1); assert.equal(r.favs[0].s, 0);
// a newer trip entry flows back to the device; unknown ones too
const trip = [{ id: `me~${k1}`, k: k1, by: 'me', s: 1, n: 'x', t: 20 }, { id: `me~${k2}`, k: k2, by: 'me', s: 1, n: '', t: 3 }];
r = reconcileFavs(trip, 'me', { [k1]: { s: 0, n: '', t: 9 } }, R);
assert.equal(r.favs, null); assert.equal(r.pull[k1].s, 1); assert.equal(r.pull[k2].s, 1);
// a removal on the device is not undone by an older trip entry
r = reconcileFavs(trip, 'me', { [k2]: { s: 0, n: '', t: 50 } }, R);
assert.equal(r.favs.find((f) => f.k === k2).s, 0);
// others' entries are left alone and shown
const t2 = [...trip, { id: `ann~${k1}`, k: k1, by: 'ann', s: 1, n: 'shade', t: 1 }, { id: `bo~${k1}`, k: k1, by: 'bo', s: 0, n: '', t: 1 }];
assert.deepEqual(crewFavs({ favs: t2 }, k1, 'me').map((f) => f.by), ['ann']);
console.log('favs tests passed');
