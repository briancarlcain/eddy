import assert from 'node:assert/strict';
import { shortNames } from '../src/names.js';

const m = shortNames([
  { id: 'a', name: 'Jane Edmonds' },
  { id: 'b', name: 'Brian Cain' },
  { id: 'c', name: 'Brian Laitsch' },
  { id: 'd', name: 'Sam Lee' },
  { id: 'e', name: 'Sam Lopez' },
  { id: 'f', name: 'Sam Smith' },
  { id: 'g', name: 'Maya' },
  { id: 'h', name: 'maya Kay' },
  { id: 'i', name: '' },
]);
assert.equal(m.a, 'Jane');
assert.equal(m.b, 'Brian C.');
assert.equal(m.c, 'Brian L.');
assert.equal(m.d, 'Sam Lee');
assert.equal(m.e, 'Sam Lopez');
assert.equal(m.f, 'Sam S.');
assert.equal(m.g, 'Maya');
assert.equal(m.h, 'maya K.');
assert.equal(m.i, '');
console.log('names tests passed');
