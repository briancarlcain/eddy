// Import surveyed GPS positions for camps (and rapids / hikes) from a GPX or CSV file.
//   node scripts/geo/import-coords.mjs grand-canyon camps.gpx            report matches only
//   node scripts/geo/import-coords.mjs grand-canyon camps.csv --write    save them
// GPX: <wpt lat lon><name>. CSV: header with name, lat, lon and optionally kind (camp|rapid|hike) and mile.
// Matches by name (ignoring "camp", punctuation and parentheses) near the item's river mile, checks each
// point against the traced river line, and writes data/geo/coords/<river>.json:
//   { "camp:Name@mile": [lat, lon, "source"] }
// Then run `npm run geo -- <river>`: positions, horizons and the mile calibration all use these.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { decodeLine, nearest, itemKey } from '../../src/geo/line.js';

const [rid, file, ...flags] = process.argv.slice(2);
if (!rid || !file) {
  console.error('usage: node scripts/geo/import-coords.mjs <river> <file.gpx|file.csv> [--write] [--max-m 400]');
  process.exit(1);
}
const write = flags.includes('--write');
const maxM = +(flags[flags.indexOf('--max-m') + 1] || 400);
const river = JSON.parse(readFileSync(`data/rivers/${rid}.json`, 'utf8'));
const L = existsSync(`data/geo/${rid}.json`) ? decodeLine(JSON.parse(readFileSync(`data/geo/${rid}.json`, 'utf8'))) : null;

function parse(text) {
  if (/<gpx[\s>]/i.test(text)) {
    const out = [];
    for (const m of text.matchAll(/<(wpt|rtept|trkpt)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      const lat = +(/lat="([^"]+)"/.exec(m[2]) || [])[1], lon = +(/lon="([^"]+)"/.exec(m[2]) || [])[1];
      const name = ((/<name>([\s\S]*?)<\/name>/i.exec(m[3]) || [])[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      const desc = ((/<(?:desc|cmt)>([\s\S]*?)<\/(?:desc|cmt)>/i.exec(m[3]) || [])[1] || '').trim();
      if (isFinite(lat) && isFinite(lon) && name) out.push({ name, lat, lon, desc });
    }
    return out;
  }
  const rows = text.split(/\r?\n/).filter((l) => l.trim());
  const split = (l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).slice(0, -1).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim());
  const head = split(rows[0]).map((h) => h.toLowerCase());
  const col = (n) => head.findIndex((h) => n.includes(h));
  const ci = { name: col(['name', 'camp', 'title']), lat: col(['lat', 'latitude', 'y']), lon: col(['lon', 'lng', 'long', 'longitude', 'x']), kind: col(['kind', 'type']), mile: col(['mile', 'rm', 'river mile']) };
  if (ci.name < 0 || ci.lat < 0 || ci.lon < 0) throw new Error('CSV needs name, lat and lon columns');
  return rows.slice(1).map((l) => {
    const c = split(l);
    return { name: c[ci.name], lat: +c[ci.lat], lon: +c[ci.lon], kind: ci.kind >= 0 ? c[ci.kind]?.toLowerCase() : null, mile: ci.mile >= 0 && c[ci.mile] !== '' ? +c[ci.mile] : null };
  }).filter((p) => p.name && isFinite(p.lat) && isFinite(p.lon));
}

const norm = (s) => String(s).toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\b(camp|camps|rapid|rapids|the|mile)\b/g, ' ').replace(/[^a-z0-9.]+/g, ' ').trim();
const tokens = (s) => new Set(norm(s).split(' ').filter(Boolean));
const jaccard = (a, b) => {
  const A = tokens(a), B = tokens(b);
  let n = 0;
  for (const t of A) if (B.has(t)) n++;
  return n / (A.size + B.size - n || 1);
};

const KINDS = { camp: river.camps || [], rapid: river.rapids || [], hike: river.hikes || [] };
const pts = parse(readFileSync(file, 'utf8'));
const out = existsSync(`data/geo/coords/${rid}.json`) ? JSON.parse(readFileSync(`data/geo/coords/${rid}.json`, 'utf8')) : {};
const rows = [];
let saved = 0;
for (const p of pts) {
  const at = L ? nearest(L, p.lat, p.lon) : null;
  const mile = p.mile ?? (/\b(\d{1,3}(?:\.\d)?)\s*(?:mile|mi\b)|\b(?:mile|rm)\s*(\d{1,3}(?:\.\d)?)/i.exec(p.name + ' ' + (p.desc || '')) || []).slice(1).find(Boolean) ?? at?.mile;
  let best = null;
  for (const [kind, list] of Object.entries(KINDS)) {
    if (p.kind && !kind.startsWith(p.kind.slice(0, 4))) continue;
    for (const it of list) {
      const sim = norm(it.name) === norm(p.name) ? 1 : jaccard(it.name, p.name);
      const dm = mile != null ? Math.abs(it.mile - +mile) : 0;
      // a bare name like "Hance" could be the camp or the rapid: waypoint files are mostly camps, and a point
      // off the centerline on the item's bank is the better fit
      const onBank = it.bank && at && at.d > 25 && it.bank === at.side ? 0.1 : 0;
      const score = sim - Math.min(1, dm / 3) * 0.5 + (kind === 'camp' ? 0.15 : 0) + onBank;
      if (sim >= 0.5 && dm <= 2 && (!best || score > best.score)) best = { kind, it, sim, dm, score };
    }
  }
  const status = !best ? 'no match' : at && at.d > maxM ? `${Math.round(at.d)} m from the river line (over ${maxM})` : 'ok';
  rows.push({ point: p.name.slice(0, 34), match: best ? `${best.kind}: ${best.it.name}`.slice(0, 40) : '', itemMile: best?.it.mile ?? '', lineMile: at ? +at.mile.toFixed(1) : '', fromRiver: at ? Math.round(at.d) : '', side: at?.side ?? '', bank: best?.it.bank ?? '', status });
  if (best && status === 'ok') {
    out[`${best.kind}:${itemKey(best.it)}`] = [+p.lat.toFixed(6), +p.lon.toFixed(6), basename(file)];
    saved++;
  }
}
console.table(rows);
const wrongBank = rows.filter((r) => r.status === 'ok' && r.bank && r.side && r.bank !== r.side && r.fromRiver > 60).length;
console.log(`${pts.length} points, ${saved} matched${wrongBank ? `, ${wrongBank} on the opposite bank from the data (check those)` : ''}.`);
if (write) {
  mkdirSync('data/geo/coords', { recursive: true });
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(`data/geo/coords/${rid}.json`, JSON.stringify(sorted, null, 1) + '\n');
  console.log(`wrote data/geo/coords/${rid}.json (${Object.keys(sorted).length} positions). Next: npm run geo -- ${rid}`);
} else console.log('dry run: add --write to save');
