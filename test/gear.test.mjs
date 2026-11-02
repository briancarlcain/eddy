import assert from 'node:assert/strict';
import { coverOf, gearKind, ledger } from '../src/gearLedger.js';

const crew = [{ id: 's', name: 'Sam' }, { id: 'a', name: 'Alex' }, { id: 'j', name: 'Jo' }];
const run = (g, c = crew) => ledger({ days: 10, crew: c, gear: [{ id: 'g', n: 'Tent', f: 100, ...g }] });
const one = (g, c) => run(g, c).items[0];
const near = (x, y, m) => assert.ok(Math.abs(x - y) < 1e-9, `${m}: ${x} vs ${y}`);
const balanced = (it) => near(Object.values(it.share).reduce((a, b) => a + b, 0) + it.loose, it.total, 'shares + loose = total');

// legacy: a lent extra with no one named goes to the group and lowers the rental
{
  const it = one({ s: 'personal', e: { s: { need: 1, have: 1, lend: 1 }, a: { need: 1 }, j: { need: 1 } } });
  near(it.rent, 1, 'rent'); near(it.total, 100, 'total');
  near(it.share.a, 50, 'alex'); near(it.share.j, 50, 'jo'); assert.equal(it.share.s, undefined);
  balanced(it);
}
// own tent shared with Alex: only Jo rents
{
  const it = one({ s: 'personal', e: { s: { need: 1, have: 1, share: [{ to: ['a'] }] }, a: { need: 1 }, j: { need: 1 } } });
  near(it.rent, 1, 'rent'); near(it.share.j, 100, 'jo pays'); assert.equal(it.share.a, undefined);
  assert.equal(it.borrowed, 1);
  balanced(it);
}
// a lent unit shared by two named people covers both; a person with no need is not covered
{
  const it = one({ s: 'personal', e: { s: { lend: 1, lends: [{ to: ['a', 'j'] }] }, a: { need: 1 }, j: { need: 1 } } });
  near(it.rent, 0, 'rent'); near(it.total, 0, 'total');
  const z = one({ s: 'personal', e: { s: { lend: 1, lends: [{ to: ['a'] }] }, a: { need: 0 }, j: { need: 1 } } });
  near(z.rent, 1, 'uncovered need still rents'); near(z.share.j, 100, 'jo');
}
// two units go to different people
{
  const it = one({ s: 'personal', e: { s: { have: 2, need: 1, share: [{ to: ['a'] }, { to: ['j'] }] }, a: { need: 1 }, j: { need: 1 } } });
  near(it.rent, 0, 'both covered'); assert.deepEqual(it.units.map((u) => u.to), [['a'], ['j']]);
}
// users split: a borrower pays a share of rentals unless excluded
{
  const g = (x) => ({ s: 'users', k: 'personal', q: 4, e: { s: { need: 1, have: 1 }, a: { need: 1 }, j: { need: 1 }, k: { need: 1 }, m: { lend: 1, lends: [{ to: ['k'], x }] } } });
  const c4 = [...crew, { id: 'k', name: 'Kai' }, { id: 'm', name: 'Mo' }];
  const keep = one(g(false), c4);
  near(keep.rent, 4 - 1 - 1, 'rent'); near(keep.total, 200, 'total');
  near(keep.share.k, 200 / 3, 'borrower pays'); balanced(keep);
  const skip = one(g(true), c4);
  assert.equal(skip.share.k, undefined);
  near(skip.share.a + skip.share.j, 200, 'others cover it'); balanced(skip);
}
// even and nights splits go to the people using it once it is shared; excluded borrowers owe nothing
{
  for (const sp of ['even', 'nights']) {
    const it = one({ s: sp, k: 'personal', q: 3, e: { s: { need: 1, have: 1, share: [{ to: ['a'], x: true }] }, a: { need: 1 }, j: { need: 1 } } });
    near(it.rent, 1, sp + ' rent'); assert.equal(it.share.a, undefined, sp + ' excluded');
    near(it.share.s + it.share.j, 100, sp + ' split'); balanced(it);
  }
  const plain = one({ s: 'even', k: 'personal', q: 3, e: { s: { need: 3, have: 3 } } });
  near(plain.total, 0, 'covered');
  const legacy = one({ s: 'even', k: 'personal', q: 2, e: { s: { need: 1 } } });
  near(legacy.share.a, 200 / 3, 'unshared even split stays across the whole crew');
}
// junk in saved units is ignored
{
  const it = one({ s: 'personal', e: { s: { need: 1, have: 1, share: [{ to: ['s', 'zzz', 'a'] }] }, a: { need: 1 } } });
  assert.deepEqual(it.units[0].to, ['a']); near(it.rent, 0, 'rent');
}
// who is bringing, borrowing or renting
{
  const it = one({ s: 'personal', e: { s: { need: 1, have: 1, share: [{ to: ['a'] }] }, a: { need: 1 }, j: { need: 1 } } });
  assert.deepEqual(coverOf(it, 's'), { own: true, borrowed: false, rented: false });
  assert.deepEqual(coverOf(it, 'a'), { own: false, borrowed: true, rented: false });
  assert.deepEqual(coverOf(it, 'j'), { own: false, borrowed: false, rented: true });
  const pool = one({ s: 'personal', e: { s: { have: 1, need: 1, lend: 1 }, a: { need: 1 } } });
  assert.equal(coverOf(pool, 'a').borrowed, true); assert.equal(coverOf(pool, 'a').rented, false);
}
// group items: one count for the group, no personal need
{
  const it = one({ s: 'even', q: 3, e: { s: { have: 1 }, a: { have: 1, need: 5 } } });
  near(it.rent, 1, 'group rent'); near(it.total, 100, 'total'); near(it.need, 0, 'personal needs are ignored');
  near(it.share.s, 100 / 3, 'even split'); balanced(it);
  assert.deepEqual(coverOf(it, 's'), { own: true, borrowed: false, rented: true });
  const lent = one({ s: 'even', q: 3, e: { s: { have: 1, lend: 1, lends: [{ to: ['a'] }] }, j: { have: 1 } } });
  near(lent.rent, 0, 'lent extra covers the rest'); assert.equal(coverOf(lent, 'a').borrowed, true);
  const shared = one({ s: 'even', q: 2, e: { s: { have: 1, share: [{ to: ['a'] }] } } });
  near(shared.rent, 1, 'sharing a unit does not make it count twice'); near(shared.share.s, 100 / 3, 'everyone pays');
  const nights = one({ s: 'nights', q: 1, e: {} }, [{ id: 's', days: 10 }, { id: 'a', days: 30 }]);
  near(nights.share.a, 75, 'nights split'); balanced(nights);
  const per = one({ s: 'personal', k: 'group', q: 3, e: {} });
  near(per.share.s, 100, 'group item billed per person splits evenly'); balanced(per);
  const skip = one({ s: 'even', q: 3, e: { s: { lend: 1, lends: [{ to: ['a'], x: true }] } } });
  assert.equal(skip.share.a, undefined); balanced(skip);
}
assert.equal(gearKind({ n: 'Cot', s: 'personal' }), 'personal');
assert.equal(gearKind({ n: 'Roster', s: 'even' }), 'group');
assert.equal(gearKind({ n: 'Guitar Dry Bag', s: 'personal' }), 'group');
assert.equal(gearKind({ n: 'Camp Chair', s: 'personal' }), 'personal');
assert.equal(gearKind({ n: 'x', s: 'even', k: 'personal' }), 'personal');
console.log('gear tests passed');
