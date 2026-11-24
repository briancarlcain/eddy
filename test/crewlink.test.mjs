import assert from 'node:assert/strict';
import { linkMembers } from '../src/crewLink.js';

const crew = [{ id: 'tyler', name: 'Tyler Karian' }, { id: 'maya', name: 'Maya Husayni', m: 'm2' }, { id: 'bo', name: 'Bo' }];
const members = [
  { id: 'old', n: 'Tyler Karian', t: '2026-10-12T00:00:00Z' },
  { id: 'new', n: 'tyler  karian', t: '2026-11-23T00:00:00Z' },
  { id: 'm2', n: 'M H', t: '2026-11-01T00:00:00Z' },
  { id: 'x', n: 'Stranger', t: '2026-11-02T00:00:00Z' },
];
const { byCrew, loose } = linkMembers(crew, members);
assert.equal(byCrew.tyler, 'new', 'newest login with the name');
assert.equal(byCrew.maya, 'm2', 'saved link beats the name');
assert.equal(byCrew.bo, undefined);
assert.deepEqual(loose.map((m) => m.id).sort(), ['old', 'x']);
// a link to a login that was removed falls back to the name
assert.equal(linkMembers([{ id: 'tyler', name: 'Tyler Karian', m: 'gone' }], members).byCrew.tyler, 'new');
console.log('crew link tests passed');
