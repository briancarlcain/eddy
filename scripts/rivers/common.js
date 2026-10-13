// Shared helpers for the river generators. Each generator writes data/rivers/<id>.json.
const fs = require('fs');

const DIFF = { I: 1, 'II-': 2, II: 3, 'II+': 4, 'III-': 4, III: 5, 'III+': 6, 'IV-': 7, IV: 8, 'IV+': 9, V: 10 };
const SIZE = { xs: 1, s: 2, sm: 4, m: 5, l: 7, xl: 8, '?': null };

// line DSL
//  R|mile|name|class|description           rapid ("class" may be "-" for unrated)
//  C|mile|name|bank|size|description        camp (bank L/R/-, size xs/s/sm/m/l/xl/?)
//  H|mile|name|bank|difficulty 1-5|desc    hike / side trip / hot spring
//  L|mile|name|civ(0/1)|description         landmark
function parse(dsl) {
  const out = { rapids: [], camps: [], hikes: [], landmarks: [] };
  for (const raw of dsl.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const p = line.split('|').map((x) => x.trim());
    const kind = p[0];
    const mile = parseFloat(p[1]);
    if (!isFinite(mile)) throw new Error('bad mile: ' + line);
    if (kind === 'R') {
      const cls = p[3];
      const rated = cls !== '-';
      if (rated && !(cls in DIFF)) throw new Error('bad class: ' + line);
      out.rapids.push({ name: p[2], mile, civ: false, diff: rated ? DIFF[cls] : 3, tier: rated ? 'Class ' + cls : 'Unrated', desc: p[4] || '' });
    } else if (kind === 'C') {
      if (!(p[4] in SIZE)) throw new Error('bad size: ' + line);
      out.camps.push({ name: p[2], mile, size: SIZE[p[4]], qual: null, bank: p[3] === '-' ? null : p[3], desc: p[5] || '' });
    } else if (kind === 'H') {
      out.hikes.push({ name: p[2], mile, bank: p[3] === '-' ? null : p[3], time: null, diff: parseInt(p[4], 10), qual: null, desc: p[5] || '' });
    } else if (kind === 'L') {
      out.landmarks.push({ name: p[2], mile, civ: p[3] === '1', diff: null, tier: 'Landmark', desc: p[4] || '' });
    } else throw new Error('bad kind: ' + line);
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.mile - b.mile);
  return out;
}

const STATE = {"grand-canyon":"Arizona","smith":"Montana","rogue":"Oregon","main-salmon":"Idaho","yampa":"Colorado","middle-fork-salmon":"Idaho","san-juan":"Utah","rio-chama":"New Mexico","cataract-canyon":"Utah","desolation-gray":"Utah","lodore":"Colorado","hells-canyon":"Idaho","ruby-horsethief":"Colorado","selway":"Idaho","green-flaming-gorge":"Utah","westwater":"Utah","illinois":"Oregon","tuolumne":"California","black-canyon":"Nevada","salt":"Arizona"};
function write(id, river) {
  if (STATE[id] && !river.state) river = { name: river.name, state: STATE[id], ...river };
  river.note = ''; river.notes = { camp: '', hike: '' };
  const f = `data/rivers/${id}.json`;
  fs.writeFileSync(f, JSON.stringify(river, null, 1) + '\n');
  const c = (k) => (river[k] || []).length;
  console.log(`${id}: camps ${c('camps')}, rapids ${c('rapids')}, hikes ${c('hikes')}, landmarks ${c('landmarks')}, access ${c('access')}`);
}

module.exports = { parse, write, DIFF };
