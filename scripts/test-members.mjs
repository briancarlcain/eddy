// Live check of the members functions on the sync server (creates and deletes a throwaway trip).
//   node scripts/test-members.mjs
import assert from 'node:assert/strict';
import * as r from '../src/sync.js';

const ok = (n) => console.log('ok  ', n);
const doc = { id: 'test_members', name: 'Members test', start: '2027-01-01', days: 3, crew: [], meals: [] };
const code = r.newCode();
const [O, E, V, X] = [r.newSecret(), r.newSecret(), r.newSecret(), r.newSecret()];
let trip;
try {
  const c = await r.v2Create(code, O, 'Brian', doc);
  trip = c.trip;
  assert.equal(c.role, 'owner');
  const e = await r.v2Join(code, E, 'Jamie');
  assert.equal(e.role, 'editor');
  assert.equal(e.members.length, 2);
  ok('create and join');

  const p1 = await r.v2Put(trip, E, e.version, { ...doc, name: 'Renamed' }, 'Jamie renamed the trip');
  assert.ok(p1.version > e.version);
  const g = await r.v2Get(trip, O, 0);
  assert.equal(g.data.name, 'Renamed');
  assert.ok(g.activity.some((a) => /renamed/.test(a.s)));
  ok('editor writes, owner sees data and activity');

  // outsiders: no reads, no writes, and no owner or member controls
  const pat = g.members.find((m) => m.n === 'Jamie');
  assert.deepEqual(await r.v2Get(trip, X, 0), { removed: true });
  assert.deepEqual(await r.v2Put(trip, X, g.version, doc, 'x'), { removed: true });
  assert.equal(await r.v2Role(trip, X, pat.id, 'viewer'), false);
  assert.equal(await r.v2Remove(trip, X, pat.id), false);
  assert.equal(await r.v2Rotate(trip, X, r.newCode()), false);
  assert.equal(await r.v2InviteRole(trip, X, 'viewer'), false);
  assert.equal(await r.v2Delete(trip, X), false);
  assert.equal(await r.v2Leave(trip, X), false);
  assert.equal(await r.v2Rename(trip, X, 'Mallory'), false);
  assert.equal(await r.v2Delete(trip, ''), false);
  ok('outsiders cannot read, write or use any control');

  // editors are not owners
  assert.equal(await r.v2Role(trip, E, pat.id, 'viewer'), false);
  assert.equal(await r.v2Remove(trip, E, pat.id), false);
  assert.equal(await r.v2Rotate(trip, E, r.newCode()), false);
  assert.equal(await r.v2InviteRole(trip, E, 'viewer'), false);
  assert.equal(await r.v2Delete(trip, E), false);
  ok('editors cannot use owner controls');

  // viewers
  assert.equal(await r.v2InviteRole(trip, O, 'viewer'), true);
  const v = await r.v2Join(code, V, 'Pat');
  assert.equal(v.role, 'viewer');
  assert.ok((await r.v2Put(trip, V, v.version, { ...doc, name: 'vandal' }, 'x')).forbidden);
  ok('viewer cannot write');

  // owner controls
  const patId = (await r.v2Get(trip, O, 0)).members.find((m) => m.n === 'Pat').id;
  assert.equal(await r.v2Role(trip, O, patId, 'editor'), true);
  assert.equal((await r.v2Get(trip, V, 0)).role, 'editor');
  assert.equal(await r.v2Remove(trip, O, patId), true);
  assert.deepEqual(await r.v2Get(trip, V, 0), { removed: true });
  const newCode = r.newCode();
  assert.equal(await r.v2Rotate(trip, O, newCode), true);
  assert.deepEqual(await r.v2Join(code, V, 'Pat'), { missing: true });
  assert.ok((await r.v2Join(newCode, V, 'Pat')).trip);
  ok('owner can change roles, remove people and reset the invite');

  // the owner cannot be removed or demoted; nobody can delete the trip
  const ownerId = (await r.v2Get(trip, O, 0)).members.find((m) => m.r === 'owner').id;
  assert.equal(await r.v2Remove(trip, O, ownerId), false);
  assert.equal(await r.v2Role(trip, O, ownerId, 'viewer'), false);
  assert.equal(await r.v2Delete(trip, O), false);
  ok('owner is protected and delete is refused');

  // legacy upgrade needs the owner secret
  const lc = r.newCode();
  const lo = r.newSecret();
  await r.create(lc, lo, { ...doc, id: 'test_members_legacy' });
  assert.deepEqual(await r.v2Upgrade(lc, r.newSecret(), X, 'Mallory'), { missing: true });
  const up = await r.v2Upgrade(lc, lo, O, 'Brian');
  assert.equal(up.role, 'owner');
  assert.deepEqual(await r.get(lc, 0), { upgraded: true });
  assert.equal(await r.v2Delete(up.trip, O), false);
  assert.equal(await r.v2Leave(up.trip, O), true);
  ok('legacy upgrade needs the owner secret');
} finally {
  if (trip) console.log('cleanup', await r.v2Leave(trip, O));
}
