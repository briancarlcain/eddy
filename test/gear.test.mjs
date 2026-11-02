import assert from 'node:assert/strict';
import { coverOf, gearKind, ledger, lendAlloc, unitsOf } from '../src/gearLedger.js';
import { convertRentals, legacyLedger } from '../src/gearLegacy.js';
import { readFileSync } from 'node:fs';

const crew = [{ id: 's', name: 'Sam' }, { id: 'a', name: 'Alex' }, { id: 'j', name: 'Jo' }];
const run = (g, c = crew) => ledger({ days: 10, crew: c, gear: [{ id: 'g', n: 'Tent', f: 100, ...g }] });
const one = (g, c) => run(g, c).items[0];
const near = (x, y, m) => assert.ok(Math.abs(x - y) < 1e-9, `${m}: ${x} vs ${y}`);
const balanced = (it) => near(Object.values(it.share).reduce((a, b) => a + b, 0) + it.loose, it.total, 'shares + loose = total');

// nothing is rented unless someone enters it
{
  const it = one({ k: 'personal', s: 'personal', e: { s: { need: 1 }, a: { need: 1 } } });
  near(it.rent, 0, 'no rental'); near(it.total, 0, 'no cost'); near(it.short, 2, 'still short'); assert.equal(it.issues.length, 0);
  const grp = one({ s: 'even', q: 3 });
  near(grp.rent, 0, 'group needs alone is not a rental'); near(grp.total, 0, 'cost'); near(grp.short, 3, 'short');
}
// a lent extra with no one named goes to the group and lowers what is short
{
  const it = one({ k: 'personal', s: 'personal', e: { s: { need: 1, have: 1, lend: 1 }, a: { need: 1 }, j: { need: 1 } } });
  near(it.borrowed, 1, 'borrowed'); near(it.short, 1, 'short');
  assert.equal(coverOf(it, 'a').borrowed, true);
}
// own tent shared with Alex
{
  const it = one({ k: 'personal', s: 'personal', e: { s: { need: 1, have: 1, share: [{ to: ['a'] }] }, a: { need: 1 }, j: { need: 1 } } });
  assert.equal(it.borrowed, 1); near(it.short, 1, 'only Jo is short');
  assert.deepEqual(coverOf(it, 's'), { own: true, borrowed: false, rented: false });
  assert.deepEqual(coverOf(it, 'a'), { own: false, borrowed: true, rented: false });
  assert.deepEqual(coverOf(it, 'j'), { own: false, borrowed: false, rented: false });
}
// a lent unit shared by two named people covers both; a person with no need is not covered
{
  const it = one({ k: 'personal', s: 'personal', e: { s: { lend: 1, lends: [{ to: ['a', 'j'] }] }, a: { need: 1 }, j: { need: 1 } } });
  near(it.short, 0, 'covered');
  const z = one({ k: 'personal', s: 'personal', e: { s: { lend: 1, lends: [{ to: ['a'] }] }, a: { need: 0 }, j: { need: 1 } } });
  near(z.short, 1, 'uncovered need is short');
}
// two units go to different people
{
  const it = one({ k: 'personal', s: 'personal', e: { s: { have: 2, need: 1, share: [{ to: ['a'] }, { to: ['j'] }] }, a: { need: 1 }, j: { need: 1 } } });
  near(it.short, 0, 'both covered'); assert.deepEqual(it.units.map((u) => u.to), [['a'], ['j']]);
}
// junk in saved units is ignored
{
  const it = one({ k: 'personal', s: 'personal', e: { s: { need: 1, have: 1, share: [{ to: ['s', 'zzz', 'a'] }] }, a: { need: 1 } } });
  assert.deepEqual(it.units[0].to, ['a']); near(it.short, 0, 'short');
}
// group items: one count for the group, no personal need
{
  const it = one({ s: 'even', q: 3, e: { s: { have: 1 }, a: { have: 1, need: 5 } } });
  near(it.need, 0, 'personal needs are ignored'); near(it.short, 1, 'short');
  const lent = one({ s: 'even', q: 3, e: { s: { have: 1, lend: 1, lends: [{ to: ['a'] }] }, j: { have: 1 } } });
  near(lent.short, 0, 'lent extra covers the rest'); assert.equal(coverOf(lent, 'a').borrowed, true);
  const shared = one({ s: 'even', q: 2, e: { s: { have: 1, share: [{ to: ['a'] }] } } });
  near(shared.short, 1, 'sharing a unit does not make it count twice');
}
// renting: the group's units split by the item's billing; a person's units are theirs to pay
{
  const it = one({ s: 'even', q: 3, rn: 3, rnTo: { group: 1, a: 2 } });
  near(it.total, 300, 'total'); near(it.share.a, 200 + 100 / 3, 'alex pays his two and a third of the group unit');
  near(it.share.s, 100 / 3, 'sam'); near(it.short, 0, 'covered'); assert.equal(it.issues.length, 0); balanced(it);
  assert.equal(coverOf(it, 'a').rented, true);
  const n = one({ s: 'nights', q: 1, rn: 1, rnTo: { group: 1 } }, [{ id: 's', days: 10 }, { id: 'a', days: 30 }]);
  near(n.share.a, 75, 'nights split'); balanced(n);
  const skip = one({ s: 'even', q: 3, rn: 1, rnTo: { group: 1 }, e: { s: { lend: 1, lends: [{ to: ['a'], x: true }] } } });
  assert.equal(skip.share.a, undefined); balanced(skip);
}
// renting must be fully assigned and priced
{
  const under = one({ s: 'even', q: 3, rn: 3, rnTo: { group: 1 } });
  assert.equal(under.issues.length, 1); assert.match(under.issues[0], /only 1 is assigned/); near(under.loose, 200, 'unassigned cost');
  const over = one({ s: 'even', q: 3, rn: 1, rnTo: { group: 2 } });
  assert.match(over.issues[0], /Renting is 1/);
  const none = one({ s: 'even', q: 3, rn: 2, rnTo: { group: 2 }, f: undefined });
  assert.match(none.issues[0], /rental price/);
  assert.equal(one({ s: 'even', q: 3, rn: 2, rnTo: { group: 2 }, f: '0' }).issues.length, 0);
  assert.equal(one({ s: 'even', q: 3, rn: 2, rnTo: { group: 2 }, f: undefined, d: 0 }).issues.length, 0);
  assert.equal(one({ s: 'even', q: 3, f: undefined }).issues.length, 0);
}
// bringing for others: quantities per person, the rest to the group
{
  const ids = new Set(['s', 'a', 'j']);
  const u = unitsOf({ lend: 3, lendTo: { a: { n: 2, x: true }, zzz: { n: 1 } } }, 's', ids).lent;
  assert.deepEqual(u.map((x) => x.to), [['a'], ['a'], []]); assert.equal(u[0].x, true); assert.equal(u[2].group, true);
  assert.equal(unitsOf({ lend: 1, lendTo: { a: { n: 5 } } }, 's', ids).lent.length, 1);
  assert.deepEqual(lendAlloc({ lend: 2, lends: [{ to: ['a'] }, { to: ['a'], x: true }] }, 's'), { a: { n: '2', x: true } });
  const it = one({ s: 'even', q: 3, e: { s: { have: 1, lend: 2, lendTo: { a: { n: 1 } } } } });
  near(it.short, 0, 'covered'); assert.equal(coverOf(it, 'a').borrowed, true); assert.equal(coverOf(it, 'j').borrowed, false);
}
assert.equal(gearKind({ n: 'Cot', s: 'personal' }), 'personal');
assert.equal(gearKind({ n: 'Roster', s: 'even' }), 'group');
assert.equal(gearKind({ n: 'Guitar Dry Bag', s: 'personal' }), 'group');
assert.equal(gearKind({ n: 'Camp Chair', s: 'personal' }), 'personal');
assert.equal(gearKind({ n: 'x', s: 'even', k: 'personal' }), 'personal');
// converting a saved trip keeps what each person pays
{
  const trip = JSON.parse(readFileSync(new URL('../data/trip.json', import.meta.url)));
  const before = legacyLedger(trip);
  const conv = convertRentals(trip);
  const after = ledger({ ...trip, gear: trip.gear.map((g) => ({ ...g, ...(conv[g.id] || {}) })) });
  assert.ok(before.total > 0, 'the sample trip rents things');
  assert.ok(Math.abs(before.total - after.total) < 0.5, `total ${before.total} vs ${after.total}`);
  for (const c of trip.crew) assert.ok(Math.abs(before.by[c.id].total - after.by[c.id].total) < 1, `${c.name}: ${before.by[c.id].total} vs ${after.by[c.id].total}`);
  assert.equal(after.items.filter((i) => i.issues.length).length, 0, 'converted rentals have nothing to fix');
}
console.log('gear tests passed');
