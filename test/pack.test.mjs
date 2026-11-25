import assert from 'node:assert/strict';
import { ledger } from '../src/gearLedger.js';
import { packInfo, flipParts, inOrder, moveShown } from '../src/gearPack.js';

const crew = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() }));
const t = {
  days: 4,
  crew,
  gear: [
    // a brings 3: one for herself, one shared with b, one for the group; c brings one for b
    { id: 'chair', n: 'Chair', c: 'Camp', e: { a: { bring: '3', use: [{ to: ['a'] }, { to: ['a', 'b'] }, { g: true }] }, c: { bring: '1', use: [{ to: ['b'] }] }, d: { bring: '1' } } },
    // 3 rented at $10: 1 for the group, 1 for a & c, 1 for d
    { id: 'tent', n: 'Tent', c: 'Sleep', f: 10, rn: '3', ra: 'manual', ru: [{ g: true }, { to: ['a', 'c'] }, { to: ['d'] }] },
  ],
};
const L = ledger(t);
const it = (id) => L.items.find((i) => i.id === id);
const label = (id) => (id === 'a' ? 'you' : id.toUpperCase());

const ch = packInfo(it('chair'), 'a', crew, label);
assert.equal(ch.bring, 3);
assert.deepEqual(ch.sub, ['Bringing 1 for you, 1 shared with B, 1 for the group']);
assert.deepEqual(ch.atoms, [{ how: 'bring', use: 'me', n: 2 }, { how: 'bring', use: 'group', n: 1 }]);
assert.deepEqual(ch.subFor(null, 'group'), ['Bringing 1 for the group']);
assert.deepEqual(ch.bringLines.map(ch.full), ['1 for you', '1 for you & B', '1 for the group']);
assert.deepEqual(ch.elsewhere.map((x) => x.id), ['c', 'd']);

const chB = packInfo(it('chair'), 'b', crew, (id) => (id === 'b' ? 'you' : id.toUpperCase()));
assert.equal(chB.bring, 0);
assert.equal(chB.borrowN, 2);
assert.deepEqual(chB.sub, ['From A & C, shared']);

const tn = packInfo(it('tent'), 'a', crew, label);
assert.ok(tn.renting);
assert.deepEqual(tn.sub, ['Rented by the group, split 4 ways', 'Renting 1, split with C']);
assert.deepEqual(tn.subFor('rent'), tn.sub);
assert.deepEqual(tn.atoms, [{ how: 'rent', use: 'group', n: 1 }, { how: 'rent', use: 'me', n: 1 }]);
assert.deepEqual(tn.rentElse.map(tn.rentFull), ['1 for D']);
assert.equal(+tn.share.toFixed(2), 7.5);

// someone with nothing on an item
const none = packInfo(it('tent'), 'b', crew, label);
assert.deepEqual(none.rentMine.map(none.rentFull), ['1 for the group (4)']);
// saved order comes first; new entries follow
assert.deepEqual(inOrder(['A', 'B', 'C', 'D'], ['C', 'A']), ['C', 'A', 'B', 'D']);
// moving within the shown entries leaves the others in place
assert.deepEqual(moveShown(['A', 'B', 'C', 'D'], ['A', 'C', 'D'], 2, 0), ['D', 'B', 'A', 'C']);
// ticking one part leaves the others unpacked; all parts make the item packed
const all = ['bring:me', 'bring:group'];
const one = flipParts({}, 'ownx', all, ['bring:me'], true);
assert.deepEqual(one, { 'ownx#bring:me': true });
assert.deepEqual(flipParts(one, 'ownx', all, ['bring:group'], true), { ownx: true });
assert.deepEqual(flipParts({ ownx: true, ownxy: true }, 'ownx', all, ['bring:me'], false), { ownxy: true, 'ownx#bring:group': true });
console.log('pack tests passed');
