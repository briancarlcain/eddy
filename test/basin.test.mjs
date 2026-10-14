// Data check for the Basin maps: every data/basin/<river>.json decodes, sits inside its own box, names line up,
// and index.json lists exactly the files that exist. Run after `python3 scripts/basin/build.py`.
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dec, area, approx } from '../src/geo/basin.js';

const dir = new URL('../data/basin/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json').sort();
const index = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8')).rivers;
assert.deepEqual(Object.keys(index).sort(), files.map((f) => f.replace('.json', '')), 'index.json lists a different set of rivers than data/basin');

// the Python encoder's output for (-120.2, 38.5), (-120.1999, 38.5012), (-120.25, 38.49), decoded at 1e-4 degrees
const pts = dec('o}nV~sjhAWA~Eh^');
assert.deepEqual(pts.map((p) => p.map((v) => +v.toFixed(4))), [[38.5, -120.2], [38.5012, -120.1999], [38.49, -120.25]]);
assert.equal(area(5324), '2,056 sq mi (5,324 km²)');
assert.equal(approx(5324), '2,060 sq mi (5,320 km²)');

let lakes = 0, dams = 0;
for (const f of files) {
  const id = f.replace('.json', '');
  const d = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
  assert.equal(d.id, id);
  assert.equal(d.v, 1);
  const [w, s, e, n] = d.bbox;
  assert.ok(w < e && s < n, `${id}: bbox`);
  const inside = (p, pad = 0.05) => p[1] >= w - pad && p[1] <= e + pad && p[0] >= s - pad && p[0] <= n + pad;
  assert.ok(d.area > 50, `${id}: basin area`);
  assert.ok(d.basin.length >= 1 && d.run.length >= 1 && d.streams.length >= 10, `${id}: missing geometry`);
  for (const r of d.basin) { const c = dec(r); assert.ok(c.length >= 4 && c.every((p) => inside(p)), `${id}: basin ring`); }
  for (const r of d.run) { const c = dec(r); assert.ok(c.length >= 2 && c.every((p) => inside(p)), `${id}: run`); }
  for (const [cls, p, ni] of d.streams) {
    assert.ok(cls >= 1 && cls <= 4, `${id}: stream class`);
    assert.ok(ni === -1 || d.names[ni], `${id}: stream name index`);
    const c = dec(p);
    assert.ok(c.length >= 2 && c.every((q) => inside(q)), `${id}: stream outside box`);
  }
  assert.ok(inside(d.putin) && inside(d.takeout), `${id}: put-in or take-out`);
  for (const [ni, la, lo, rank] of d.labels) { assert.ok(d.names[ni], `${id}: label name`); assert.ok(inside([la, lo]) && rank > 0, `${id}: label`); }
  for (const r of d.res) {
    assert.ok(r.n && r.a > 0 && inside(r.c), `${id}: reservoir ${r.n}`);
    assert.ok(r.p.length && r.p.every((p) => dec(p).length >= 3), `${id}: reservoir ring ${r.n}`);
    if (r.dam) { assert.ok(r.dam.n && inside(r.dam.ll), `${id}: dam ${r.n}`); dams++; }
    lakes++;
  }
  assert.equal(index[id].area, d.area);
  assert.equal(index[id].lakes, d.res.length);
  assert.equal(index[id].dams, d.res.filter((r) => r.dam).length);
}
console.log(`basin tests passed (${files.length} rivers, ${lakes} lakes and reservoirs, ${dams} dams)`);
