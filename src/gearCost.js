import { num } from './gearLedger.js';

const blank = (v) => v === undefined || v === null || String(v).trim() === '';
const money = (n) => '$' + (+n.toFixed(2)).toLocaleString(undefined, { minimumFractionDigits: Number.isInteger(+n.toFixed(2)) ? 0 : 2 });

// the price of one unit, as the person would read it
export function priceText(it, days) {
  const g = it.raw || {};
  const f = blank(g.f) ? null : num(g.f);
  const d = blank(g.d) ? null : num(g.d);
  if (f === null && d === null) return '';
  if (d !== null && (f === null || d * days < f)) return `${money(d)}/day × ${days} days`;
  return `${money(f)} flat`;
}

// what one person pays for an item, piece by piece: [{ n units, who they share with, amount, method }]
// Pieces add up to it.share[id].
export function costLines(it, crew, nights, id) {
  const w = (c) => (it.split === 'nights' ? nights[c] || 1 : 1);
  const name = (c) => (crew.find((x) => x.id === c) || {}).name || 'Someone';
  const out = [];
  (it.lines || []).forEach((r) => {
    if (!(r.n > 0) || !it.unit) return;
    if (r.to.length) {
      if (!r.to.includes(id)) return;
      const ws = r.to.reduce((a, c) => a + w(c), 0) || 1;
      const f = w(id) / ws;
      out.push({ n: r.n * f, units: r.n, with: r.to.filter((c) => c !== id).map(name), amount: it.unit * r.n * f, all: false });
    } else {
      const free = crew.filter((c) => !it.excl[c.id]);
      const pool = free.length ? free : crew;
      if (!pool.some((c) => c.id === id)) return;
      const ws = pool.reduce((a, c) => a + w(c.id), 0);
      if (!ws) return;
      const f = w(id) / ws;
      out.push({ n: r.n * f, units: r.n, with: [], amount: (it.unit * r.n * w(id)) / ws, all: true });
    }
  });
  return out;
}
