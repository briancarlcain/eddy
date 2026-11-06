import assert from 'node:assert/strict';
import { bringForm, coverOf, gearKind, ledger, lendAlloc, unitList, unitsOf } from '../src/gearLedger.js';
import { convertRentals, legacyLedger } from '../src/gearLegacy.js';
import { applySheetQty } from '../src/gearQty.js';
import { convertSplits } from '../src/gearSplit.js';
import { readFileSync } from 'node:fs';

const crew = [{ id: 's', name: 'Sam' }, { id: 'a', name: 'Alex' }, { id: 'j', name: 'Jo' }];
const run = (g, c = crew) => ledger({ days: 10, crew: c, gear: [{ id: 'g', n: 'Tent', f: 100, ...g }] });
const one = (g, c) => run(g, c).items[0];
const near = (x, y, m) => assert.ok(Math.abs(x - y) < 1e-9, `${m}: ${x} vs ${y}`);
const balanced = (it) => near(Object.values(it.share).reduce((a, b) => a + b, 0) + it.loose, it.total, 'shares + loose = total');

// nothing is rented unless someone enters it; the group total is what people bring plus what is rented
{
  const it = one({ k: 'personal', s: 'even', e: { s: { have: 1 }, a: { have: 1 } } });
  near(it.rent, 0, 'no rental'); near(it.total, 0, 'no cost'); near(it.count, 2, 'group total'); assert.equal(it.issues.length, 0);
  near(one({ s: 'even' }).count, 0, 'nobody has it');
  near(one({ s: 'even', rn: 2, e: { s: { have: 1, lend: 1 } } }).count, 4, 'own + lent + rented');
}
// a lent extra with no one named goes to the group
{
  const it = one({ k: 'personal', e: { s: { have: 1, lend: 1 } } });
  near(it.borrowed, 1, 'lent'); near(it.count, 2, 'group total');
  assert.equal(coverOf(it, 'a').borrowed, false);
}
// own tent shared with Alex
{
  const it = one({ k: 'personal', e: { s: { have: 1, share: [{ to: ['a'] }] } } });
  assert.equal(it.named.a, 1); near(it.count, 1, 'sharing a unit does not count it twice');
  assert.deepEqual(coverOf(it, 's'), { own: true, borrowed: false, rented: false });
  assert.deepEqual(coverOf(it, 'a'), { own: false, borrowed: true, rented: false });
  assert.deepEqual(coverOf(it, 'j'), { own: false, borrowed: false, rented: false });
}
// a lent unit shared by two named people goes to both
{
  const it = one({ k: 'personal', e: { s: { lend: 1, lends: [{ to: ['a', 'j'] }] } } });
  assert.equal(it.named.a, 1); assert.equal(it.named.j, 1); near(it.count, 1, 'one unit');
}
// two units go to different people
{
  const it = one({ k: 'personal', e: { s: { have: 2, share: [{ to: ['a'] }, { to: ['j'] }] } } });
  assert.deepEqual(it.units.map((u) => u.to), [['a'], ['j']]);
}
// junk in saved units is ignored
{
  const it = one({ k: 'personal', e: { s: { have: 1, share: [{ to: ['s', 'zzz', 'a'] }] } } });
  assert.deepEqual(it.units[0].to, ['a']);
}
// old per-person needs and group totals are ignored
{
  const it = one({ s: 'even', q: 3, e: { s: { have: 1, need: 5 } } });
  near(it.count, 1, 'only what people bring counts'); assert.equal(it.need, undefined); assert.equal(it.short, undefined);
}
// renting: the group's units split by the item's billing; a person's units are theirs to pay
{
  const it = one({ s: 'even', q: 3, rn: 3, rnTo: { group: 1, a: 2 } });
  near(it.total, 300, 'total'); near(it.share.a, 200 + 100 / 3, 'alex pays his two and a third of the group unit');
  near(it.share.s, 100 / 3, 'sam'); assert.equal(it.issues.length, 0); balanced(it);
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
// both a flat fee and a per-day price can be saved; the cheaper one for the trip is charged (10 days)
{
  const cost = (g) => one({ s: 'even', q: 1, rn: 1, rnTo: { group: 1 }, ...g }).total;
  near(cost({ f: 800, d: 30 }), 300, 'per day is cheaper'); near(cost({ f: 200, d: 30 }), 200, 'flat is cheaper');
  near(cost({ f: undefined, d: 30 }), 300, 'only per day'); near(cost({ f: 200, d: undefined }), 200, 'only flat');
  near(cost({ f: 800, d: 30, pm: 'flat' }), 300, 'the toggle only picks what the form shows');
}
// bringing for others: quantities per person, the rest to the group
{
  const ids = new Set(['s', 'a', 'j']);
  const u = unitsOf({ lend: 3, lendTo: { a: { n: 2, x: true }, zzz: { n: 1 } } }, 's', ids).lent;
  assert.deepEqual(u.map((x) => x.to), [['a'], ['a'], []]); assert.equal(u[0].x, true); assert.equal(u[2].group, true);
  assert.equal(unitsOf({ lend: 1, lendTo: { a: { n: 5 } } }, 's', ids).lent.length, 1);
  assert.deepEqual(lendAlloc({ lend: 2, lends: [{ to: ['a'] }, { to: ['a'], x: true }] }, 's'), { a: { n: '2', x: true } });
  const it = one({ s: 'even', e: { s: { have: 1, lend: 2, lendTo: { a: { n: 1 } } } } });
  near(it.count, 3, 'group total'); assert.equal(coverOf(it, 'a').borrowed, true); assert.equal(coverOf(it, 'j').borrowed, false);
}
assert.equal(gearKind({ n: 'Cot', s: 'personal' }), 'personal');
assert.equal(gearKind({ n: 'Roster', s: 'even' }), 'group');
assert.equal(gearKind({ n: 'Guitar Dry Bag', s: 'personal' }), 'group');
assert.equal(gearKind({ n: 'Camp Chair', s: 'personal' }), 'personal');
assert.equal(gearKind({ n: 'x', s: 'even', k: 'personal' }), 'personal');
// converting a saved trip keeps what each person pays
{
  const trip = {
    days: 10,
    crew: [...crew, { id: 'k', name: 'Kai' }],
    gear: [
      { id: 'a', n: 'Tent', c: 'Sleep', s: 'personal', f: 100, e: { s: { need: 1 }, a: { need: 1, have: 1 }, j: { need: 1 } } },
      { id: 'b', n: 'Stove', c: 'Kitchen', s: 'nights', f: 60, q: 2, e: { s: { have: 1 } } },
      { id: 'c', n: 'Permit', c: 'Shuttle', s: 'users', f: 30, q: 1, e: { s: { need: 1 }, a: { need: 1 } } },
    ],
  };
  const before = legacyLedger(trip);
  const conv = convertRentals(trip);
  const after = ledger({ ...trip, gear: trip.gear.map((g) => ({ ...g, ...(conv[g.id] || {}) })) });
  assert.ok(before.total > 0, 'the sample trip rents things');
  assert.ok(Math.abs(before.total - after.total) < 0.5, `total ${before.total} vs ${after.total}`);
  for (const c of trip.crew) assert.ok(Math.abs(before.by[c.id].total - after.by[c.id].total) < 1, `${c.name}: ${before.by[c.id].total} vs ${after.by[c.id].total}`);
  assert.equal(after.items.filter((i) => i.issues.length).length, 0, 'converted rentals have nothing to fix');
}
// rentals listed unit by unit: each unit's people pay for it by the item's method
{
  const c4 = [{ id: 'j', name: 'Joe', days: 3 }, { id: 'm', name: 'Jim', days: 3 }, { id: 'n', name: 'John', days: 2 }, { id: 'k', name: 'Jack', days: 3 }, { id: 'x', name: 'James', days: 2 }];
  const pads = { k: 'personal', s: 'nights', f: undefined, d: 10, ra: 'manual', rn: '4', ru: [{ to: ['j'] }, { to: ['j'] }, { to: ['m'] }, { to: ['n', 'k'] }], e: { j: { need: 2 }, m: { need: 1 }, n: { need: 1 }, k: { need: 1 }, x: { need: 0 } } };
  const it = ledger({ days: 3, crew: c4, gear: [{ id: 'p', n: 'Paco Pad', ...pads }] }).items[0];
  near(it.total, 120, 'four pads at $30'); near(it.share.j, 60, 'Joe'); near(it.share.m, 30, 'Jim'); near(it.share.n, 12, 'John'); near(it.share.k, 18, 'Jack'); near(it.share.x || 0, 0, 'James');
  near(it.loose, 0, 'all assigned'); assert.equal(it.issues.length, 0);
  const even = ledger({ days: 3, crew: c4, gear: [{ id: 'p', n: 'Paco Pad', ...pads, s: 'even' }] }).items[0];
  near(even.share.n, 15, 'equal'); near(even.share.k, 15, 'equal');
  // the units do not add up to what is rented
  const few = ledger({ days: 3, crew: c4, gear: [{ id: 'p', n: 'Paco Pad', ...pads, rn: '6' }] }).items[0];
  assert.equal(few.issues.length, 1); assert.match(few.issues[0], /only 4 is assigned/); near(few.loose, 60, 'unassigned cost');
  const over = ledger({ days: 3, crew: c4, gear: [{ id: 'p', n: 'Paco Pad', ...pads, rn: '3' }] }).items[0];
  // lowering Renting leaves the extra assignments unused: only the first 3 units count, with no warning
  assert.equal(over.issues.length, 0); near(over.total, 90, 'three pads'); near(over.loose, 0, 'covered'); near(Object.values(over.share).reduce((x, y) => x + y, 0), 90, 'shares add up to three pads');
  const zero = ledger({ days: 3, crew: c4, gear: [{ id: 'p', n: 'Paco Pad', ...pads, rn: '0' }] }).items[0];
  assert.equal(zero.issues.length, 0); near(zero.total, 0, 'nothing rented');
  // a unit with no one on it is not assigned
  const none = ledger({ days: 3, crew: c4, gear: [{ id: 'p', n: 'Paco Pad', ...pads, ru: [{ to: [] }, ...pads.ru.slice(1)] }] }).items[0];
  assert.match(none.issues[0], /only 3 is assigned/);
  // dividing among the entire group uses the same method
  const grp = ledger({ days: 3, crew: c4, gear: [{ id: 'p', n: 'Paco Pad', k: 'group', s: 'nights', f: undefined, d: 10, ra: 'group', rn: '1' }] }).items[0];
  near(grp.share.j, 30 * 3 / 13, 'by nights'); near(grp.share.x, 30 * 2 / 13, 'by nights'); balanced(grp);
}
// saved trips move to the two methods and unit rentals without changing what anyone pays
{
  const c3 = [{ id: 's', name: 'Sam', days: 6 }, { id: 'a', name: 'Alex', days: 10 }, { id: 'j', name: 'Jo', days: 10 }];
  const old = {
    days: 10,
    crew: c3,
    gear: [
      { id: '1', n: 'Tent', c: 'Sleep', s: 'personal', d: 10, rn: '2', rnTo: { s: '1', j: '1' }, e: { s: { need: 1, rentWith: ['a'] }, a: { need: 1 }, j: { need: 1 } } },
      { id: '2', n: 'Kitchen', c: 'Kitchen', s: 'nights', f: 90, q: 1, rn: '1', rnTo: { group: '1' }, e: {} },
      { id: '3', n: 'Fee', c: 'Shuttle', s: 'users', f: 30, q: 2, rn: '3', rnTo: { group: '1', a: '1' }, e: {} },
      { id: '4', n: 'Cot', c: 'Sleep', s: 'personal', d: 5, q: 9, rn: '1', rnTo: { j: '1' }, e: { j: { need: 1 } } },
      { id: '5', n: 'Stove', c: 'Kitchen', s: 'even', f: 40, rn: '2', e: {} },
    ],
  };
  const before = ledger(old);
  const gear = convertSplits(old);
  const after = ledger({ ...old, gear });
  assert.ok(before.total > 0);
  before.items.forEach((x, i) => {
    const y = after.items[i];
    if (x.name === 'Tent' || x.name === 'Stove') return; // sharing a unit lived in each person's entry; a rental nobody was assigned stays unassigned
    for (const f of ['total', 'rent', 'loose']) near(x[f], y[f], `${x.name} ${f}`);
    for (const c of c3) near(x.share[c.id] || 0, y.share[c.id] || 0, `${x.name} ${c.name}`);
    assert.equal(x.issues.length, y.issues.length, x.name);
  });
  const tent = after.items[0];
  near(tent.share.s, 37.5, 'Sam 6 of 16 nights'); near(tent.share.a, 62.5, 'Alex'); near(tent.share.j, 100, 'Jo');
  near(after.items[4].loose, 80, 'unassigned rental stays unassigned'); assert.equal(after.items[4].issues.length, 1);
  assert.deepEqual(gear.map((g) => g.s), ['nights', 'nights', 'even', 'even', 'even']);
  assert.equal(gear[0].ra, 'manual'); assert.deepEqual(gear[0].ru[0].to, ['s', 'a']); assert.equal(gear[0].rnTo, undefined); assert.equal(gear[0].e.s.rentWith, undefined);
  assert.equal(gear[1].ra, 'group'); assert.equal(gear[3].q, undefined);
  assert.deepEqual(convertSplits({ ...old, gear }).map((g) => [g.s, g.k, g.ra]), gear.map((g) => [g.s, g.k, g.ra]));
}
// Grand Canyon 2026: the counts match the trip sheet
{
  const trip = JSON.parse(readFileSync(new URL('../data/trip.json', import.meta.url)));
  const L = ledger(trip);
  const it = (n) => L.items.find((x) => x.name.startsWith(n));
  near(L.total, 16071.65, 'total'); near(L.loose, 0, 'every rented unit is assigned');
  const tent = it('Personal Tent');
  near(tent.rent, 1, 'tent rented'); near(tent.rented['davis-snedeker'], 1, 'Davis rents it'); near(tent.total, 133, 'tent cost');
  assert.deepEqual(['brian-cain', 'brian-laitsch', 'violet-scott'].map((id) => tent.bringBy[id]), [1, 1, 1]);
  const cot = it('Cot');
  near(cot.rent, 3, 'cots rented'); near(cot.total, 285, 'cot cost');
  for (const x of L.items) near(x.count, x.have + x.lend + x.rent, x.name + ' group total');
  assert.ok(trip.gear.every((g) => g.q === undefined && Object.values(g.e).every((e) => e.need === undefined)), 'no needs or group totals in the seed');
  // older copies take the sheet's counts and keep everything else
  const old = [{ ...trip.gear[0], q: 99, rn: '4', rnTo: { group: '4' }, e: { gone: { have: 3 } }, f: 1 }, { id: 'mine', n: 'Mine', e: { s: { have: 1 } } }];
  const fixed = applySheetQty(old, trip.gear);
  assert.deepEqual(fixed[0].e.gone, {}); assert.equal(fixed[0].f, 1); assert.equal(fixed[0].rn, trip.gear[0].rn);
  assert.equal(fixed[1], old[1]);
}
// quantity I can bring, then who uses each one
{
  const ids = new Set(['s', 'a', 'j']);
  const ul = (e) => unitList(e, 's', ids);
  // unallocated units are for the owner, on every item
  assert.deepEqual(ul({ bring: '2' }).map((u) => [u.to, u.g]), [[['s'], false], [['s'], false]]);
  // each unit: the owner, others, both, or the group
  const e = { bring: '4', use: [{}, { g: true }, { to: ['a'] }, { to: ['s', 'j'], x: true }] };
  assert.deepEqual(ul(e).map((u) => [u.to, u.g, u.x]), [[['s'], false, false], [[], true, false], [['a'], false, false], [['s', 'j'], false, true]]);
  const { own, lent } = unitsOf(e, 's', ids);
  assert.deepEqual(own.map((u) => u.to), [[], ['j']]); assert.deepEqual(lent.map((u) => [u.to, u.group]), [[[], true], [['a'], false]]);
  const it = one({ k: 'personal', e: { s: e } });
  near(it.count, 4, 'group total'); assert.equal(it.named.a, 1); assert.equal(it.named.j, 1); assert.equal(it.bringBy.s, 4);
  assert.equal(coverOf(it, 's').own, true); assert.equal(coverOf(it, 'a').borrowed, true); assert.equal(coverOf(it, 'j').borrowed, true);
  // allocation does not change what a rental costs anyone
  assert.equal(it.excl.j, true);
  // old copies convert without changing anything
  const old = { have: 2, lend: 3, share: [{ to: ['a'] }, { x: true, to: ['j'] }], lendTo: { a: { n: 1, x: true } } };
  const conv = bringForm(old, 's', ids);
  assert.equal(conv.have, undefined); assert.equal(conv.lendTo, undefined); assert.equal(conv.bring, '5');
  assert.deepEqual(unitList(conv, 's', ids), unitList(old, 's', ids));
  const a = one({ k: 'personal', e: { s: old, a: { have: 1 } } }), b = one({ k: 'personal', e: { s: conv, a: { have: 1 } } });
  near(a.count, b.count, 'count'); assert.deepEqual(a.named, b.named); assert.deepEqual(a.excl, b.excl);
  // a bigger quantity keeps what was chosen; fewer units ignore the rest
  assert.equal(ul({ bring: '1', use: [{ to: ['a'] }, { g: true }] }).length, 1);
}
console.log('gear tests passed');

// cost breakdown lines add up to each person's share (Grand Canyon seed)
{
  const { costLines } = await import('../src/gearCost.js');
  const SEED = JSON.parse((await import('node:fs')).readFileSync(new URL('../data/trip.json', import.meta.url)));
  const L = ledger(SEED);
  let n = 0;
  for (const it of L.items) {
    for (const c of SEED.crew) {
      const sum = costLines(it, SEED.crew, L.nights, c.id).reduce((a, x) => a + x.amount, 0);
      const want = it.share[c.id] || 0;
      assert.ok(Math.abs(sum - want) < 0.005, `${it.name} / ${c.name}: ${sum} vs ${want}`);
      n++;
    }
  }
  assert.ok(n > 1000);
}
