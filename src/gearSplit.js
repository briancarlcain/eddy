import { gearKind, ledger, num, priceMode } from './gearLedger.js';

// Billing is now just "Split evenly" or "Split based on nights on the river" (s: even | nights), and
// whether an item is personal or group is its own setting (k). Rentals are either divided among the
// whole group (ra: 'group') or listed unit by unit with the people paying for each (ra: 'manual', ru: [{ n, to }]).
// Moves older copies over without changing what anyone pays.
export function convertSplits(t) {
  const crew = t.crew || [];
  const ids = crew.map((c) => c.id);
  let L = { items: [] };
  try {
    L = ledger(t);
  } catch {}
  const by = new Map(L.items.map((i) => [i.id, i]));
  const D = Math.max(1, num(t.days) || 1);
  return (t.gear || []).map((g) => {
    const k = gearKind(g);
    const out = { ...g, k, s: g.s === 'nights' ? 'nights' : 'even' };
    if (g.s === 'personal' && k === 'personal') delete out.q; // the group total was ignored on these
    const e = {};
    const groups = [];
    const seen = new Set();
    Object.keys(g.e || {}).forEach((id) => {
      const { rentWith, ...rest } = g.e[id] || {};
      e[id] = rest;
      if (Array.isArray(rentWith)) rentWith.filter((o) => o !== id && ids.includes(o)).forEach((o) => groups.push([id, o]));
    });
    if (g.e) out.e = e;
    delete out.rw;
    if (g.ra !== undefined) return out;
    const rt = g.rnTo && typeof g.rnTo === 'object' ? g.rnTo : null;
    const rn = Math.max(0, num(g.rn));
    delete out.rnTo;
    if (!(rn > 0) && !rt) return out;
    const pers = (id) => Math.max(0, num(rt && rt[id]));
    const rg = rt ? Math.max(0, num(rt.group)) : 0;
    if (rt && !ids.some((id) => pers(id) > 0) && Math.abs(rg - rn) < 0.005) return { ...out, ra: 'group' };
    // people who split a unit become one row
    const parts = [];
    groups.forEach(([a, b]) => {
      let p = parts.find((x) => x.includes(a) || x.includes(b));
      if (!p) parts.push((p = []));
      [a, b].forEach((x) => !p.includes(x) && p.push(x));
    });
    const rows = [];
    const done = new Set();
    parts.forEach((p) => {
      const n = p.reduce((a, id) => a + pers(id), 0);
      p.forEach((id) => done.add(id));
      if (n > 0) rows.push({ ...(n === 1 ? {} : { n }), to: p });
    });
    if (parts.some((p) => p.some((id) => pers(id) > 0))) out.s = g.rw || (priceMode(g, D) === 'day' ? 'nights' : 'even');
    ids.forEach((id) => {
      if (!done.has(id) && pers(id) > 0) rows.push({ ...(pers(id) === 1 ? {} : { n: pers(id) }), to: [id] });
    });
    if (rg > 0) {
      const it = by.get(g.id);
      const free = ids.filter((id) => !(it && it.excl && it.excl[id]));
      rows.push({ ...(rg === 1 ? {} : { n: rg }), to: free.length ? free : ids });
    }
    const left = +(rn - rows.reduce((a, r) => a + (r.n === undefined ? 1 : r.n), 0)).toFixed(4);
    if (left > 0.005) rows.push({ ...(left === 1 ? {} : { n: left }), to: [] });
    return { ...out, ra: 'manual', ru: rows };
  });
}
