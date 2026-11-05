export const num = (v) => (Number.isFinite(+v) ? +v : 0);
const okDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T12:00:00Z'));

// personal = each person brings their own; group = shared by the whole crew
const GROUP_PERSONAL_BILLED = /^(Guitar & Other Musical|Guitar Dry Bag|Food, ice and sundries|Boil-in-a-Bag)/;
export const gearKind = (g) => g.k || (g.s && g.s !== 'personal' ? 'group' : GROUP_PERSONAL_BILLED.test(g.n ?? g.name ?? '') ? 'group' : 'personal');

// an item can carry both a flat fee and a per-day price; the cheaper one for the trip is charged.
// pm only says which of the two the form shows.
const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';
export const priceOf = (g, days) => {
  const c = [];
  if (!isBlank(g.f)) c.push(num(g.f));
  if (!isBlank(g.d)) c.push(num(g.d) * days);
  return c.length ? Math.min(...c) : 0;
};
export const priceMode = (g, days) => {
  if (g.pm === 'flat' || g.pm === 'day') return g.pm;
  return !isBlank(g.d) && (isBlank(g.f) || num(g.d) * days < num(g.f)) ? 'day' : 'flat';
};

export const norm = (g) => ({
  kind: gearKind(g),
  name: g.n ?? g.name ?? '',
  cat: g.c ?? g.cat ?? 'Gear',
  split: g.s || 'even',
  req: g.r === 'req' || g.r === 'rec' ? g.r : '',
  flat: num(g.f),
  day: num(g.d),
  e: g.e || {},
});

// What a person brings: a quantity, and for each unit who uses it.
// e.bring is the quantity; e.use[i] = { to: [crew ids, the owner included when it is for them], g: true when it is for the group, x }.
// A unit with nothing chosen is for the owner on a personal item and for the group on a group item.
// Older copies keep have / lend / share / lends / lendTo instead; they read the same way.
export const bringOf = (e) => (e && e.bring !== undefined ? num(e.bring) : num(e && e.have) + num(e && e.lend));

// every unit, in order: { to: ids (owner included when it is for them), g: for the group, x: excused from rental cost }
export function unitList(e, owner, ids, kind) {
  const valid = (u) => (Array.isArray(u && u.to) ? [...new Set(u.to.filter((id) => ids.has(id)))] : []);
  const out = [];
  if (e.bring !== undefined || e.use !== undefined) {
    for (let i = 0; i < Math.floor(num(e.bring)); i++) {
      const u = (e.use || [])[i] || {};
      let to = valid(u);
      let g = !!u.g && !to.length;
      if (!g && !to.length) {
        if (kind === 'group') g = true;
        else to = [owner];
      }
      out.push({ to, g, x: !!u.x });
    }
    return out;
  }
  const others = (u) => valid(u).filter((id) => id !== owner);
  for (let i = 0; i < Math.floor(num(e.have)); i++) {
    const u = (e.share || [])[i] || {};
    out.push({ to: [owner, ...others(u)], g: false, x: !!u.x });
  }
  const cnt = Math.floor(num(e.lend));
  if (e.lendTo) {
    let left = cnt;
    for (const id of Object.keys(e.lendTo)) {
      if (id === owner || !ids.has(id)) continue;
      const n = Math.min(left, Math.floor(num((e.lendTo[id] || {}).n)));
      for (let k = 0; k < n; k++) out.push({ to: [id], g: false, x: !!e.lendTo[id].x });
      left -= Math.max(0, n);
    }
    for (let k = 0; k < left; k++) out.push({ to: [], g: true, x: false });
  } else {
    for (let j = 0; j < cnt; j++) {
      const u = (e.lends || [])[j] || {};
      const to = others(u);
      out.push({ to, g: !to.length, x: !!u.x });
    }
  }
  return out;
}

// the same units split into what the owner uses (own, possibly shared with others) and what is only for others (lent)
export function unitsOf(e, owner, ids, kind) {
  const own = [],
    lent = [];
  unitList(e, owner, ids, kind).forEach((u) => {
    const to = u.to.filter((id) => id !== owner);
    if (u.to.includes(owner)) own.push({ to, x: u.x });
    else lent.push({ to, group: u.g, x: u.x });
  });
  return { own, lent };
}

// the stored form of a person's units, with the old keys dropped
export function bringForm(e, owner, ids, kind) {
  const { have: _h, lend: _l, share: _s, lends: _ls, lendTo: _lt, ...rest } = e || {};
  const list = unitList(e || {}, owner, ids, kind);
  const use = list.map((u) => ({ ...(u.g ? { g: true } : { to: u.to }), ...(u.x ? { x: true } : {}) }));
  return { ...rest, bring: String(+bringOf(e || {}).toFixed(2) || ''), use };
}

// what a person is bringing for others, as quantities per person ({ id: { n, x } })
export function lendAlloc(e, owner) {
  if (e.lendTo) return e.lendTo;
  const out = {};
  for (let j = 0; j < Math.floor(num(e.lend)); j++) {
    const u = (e.lends || [])[j] || {};
    const to = Array.isArray(u.to) ? u.to.filter((id) => id !== owner) : [];
    if (to.length === 1) out[to[0]] = { n: String(num((out[to[0]] || {}).n) + 1), x: !!(u.x || (out[to[0]] || {}).x) };
  }
  return out;
}

// how one person is covered for an item: bringing their own, borrowing from someone, or sharing a rental
export function coverOf(it, id) {
  return { own: bringOf(it.e[id] || {}) > 0, borrowed: (it.named[id] || 0) > 0, rented: (it.rented[id] || 0) > 0 || (it.share[id] || 0) > 0.005 };
}

export function ledger(t) {
  const D = Math.max(1, num(t.days) || 1);
  const crew = t.crew;
  const ids = new Set(crew.map((c) => c.id));
  const byId = Object.fromEntries(crew.map((c) => [c.id, c]));
  const span = (c) => (okDate(c.onDate) && okDate(c.offDate) ? Math.round((new Date(c.offDate + 'T12:00:00Z') - new Date(c.onDate + 'T12:00:00Z')) / 864e5) : 0);
  const nights = (c) => (num(c.days) > 0 ? num(c.days) : span(c) > 0 ? span(c) : D);
  const allNights = crew.reduce((a, c) => a + nights(c), 0);
  const items = (t.gear || []).map((g) => {
    const it = norm(g);
    const unit = priceOf(g, D);
    let bring = 0,
      have = 0,
      lend = 0;
    const own = {},
      raw = {},
      excl = {},
      units = [];
    crew.forEach((c) => {
      const e = it.e[c.id] || {};
      own[c.id] = bringOf(e);
      bring += own[c.id];
      const u = unitsOf(e, c.id, ids, it.kind);
      have += u.own.length;
      lend += u.lent.length;
      u.own.forEach((x) => units.push({ owner: c.id, kind: 'own', ...x }));
      u.lent.forEach((x) => units.push({ owner: c.id, kind: 'lend', ...x }));
    });
    // a unit shared with named people covers each of them once
    units.forEach((x) =>
      x.to.forEach((id) => {
        raw[id] = (raw[id] || 0) + 1;
        if (x.x) excl[id] = true;
      })
    );
    // units lent to someone by name
    const named = {};
    crew.forEach((c) => (named[c.id] = raw[c.id] || 0));
    const borrowed = lend;
    // rentals are entered by hand: how many, then who each unit is for.
    // 'manual': each unit lists the people who pay for it, split by the item's method.
    // otherwise the whole group pays, split the same way. (Old copies keep a quantity per person or group in rnTo.)
    const manual = g.ra === 'manual';
    const legacy = !manual && g.ra === undefined && g.rnTo && typeof g.rnTo === 'object';
    const rows = manual
      ? (Array.isArray(g.ru) ? g.ru : []).map((r) => ({ n: r && r.n !== undefined && String(r.n) !== '' ? Math.max(0, num(r.n)) : 1, to: [...new Set((r && Array.isArray(r.to) ? r.to : []).filter((id) => ids.has(id)))] }))
      : [];
    const rent = Math.max(0, num(g.rn));
    const rt = legacy ? g.rnTo : {};
    const rented = {},
      single = {},
      share = {},
      lines = [];
    let rg = manual ? 0 : legacy ? Math.max(0, num(rt.group)) : rent;
    let rAssigned = rg;
    const wOf = (c) => (it.split === 'nights' ? nights(c) : 1);
    rows.forEach((r) => {
      if (!(r.n > 0) || !r.to.length) return;
      rAssigned += r.n;
      lines.push({ to: r.to, n: r.n });
      const ws = r.to.reduce((a, id) => a + wOf(byId[id]), 0) || 1;
      r.to.forEach((id) => {
        const f = wOf(byId[id]) / ws;
        rented[id] = (rented[id] || 0) + r.n * f;
        if (unit) {
          share[id] = (share[id] || 0) + unit * r.n * f;
          if (r.to.length === 1) single[id] = (single[id] || 0) + unit * r.n;
        }
      });
    });
    crew.forEach((c) => {
      const n = Math.max(0, num(rt[c.id]));
      if (n) {
        rented[c.id] = n;
        rAssigned += n;
        lines.push({ to: [c.id], n });
        if (unit) share[c.id] = single[c.id] = unit * n;
      }
    });
    const count = bring + rent;
    const total = unit * rent;
    if (rg > 0) lines.unshift({ to: [], n: rg });
    if (rg > 0 && unit > 0) {
      // the group's units are split by the item's method, skipping people who were excused
      const free = crew.filter((c) => !excl[c.id]);
      const pool = free.length ? free : crew;
      const ws = pool.reduce((a, c) => a + wOf(c), 0);
      if (ws) pool.forEach((c) => (share[c.id] = (share[c.id] || 0) + (unit * rg * wOf(c)) / ws));
    }
    const assigned = Object.values(share).reduce((a, b) => a + b, 0);
    // what needs fixing before the numbers can be trusted
    const issues = [];
    const blank = (v) => v === undefined || v === null || String(v).trim() === '';
    const f2 = (x) => +x.toFixed(2);
    if (Math.abs(rAssigned - rent) > 0.005) {
      issues.push(
        rAssigned < rent
          ? `Renting ${f2(rent)}, but only ${f2(rAssigned)} is assigned. Assign the other ${f2(rent - rAssigned)} to people.`
          : `${f2(rAssigned)} is assigned, but Renting is ${f2(rent)}. Lower the assigned numbers or raise Renting.`
      );
    }
    if (rent > 0 && blank(g.f) && blank(g.d)) issues.push('Add a rental price. $0 is fine, but it can’t be blank.');
    return { id: g.id, raw: g, ...it, unit, bring, bringBy: own, have, lend, borrowed, count, rent, total, share, single, lines, manual, loose: Math.max(0, total - assigned), units, named, excl, rented, rAssigned, issues };
  });
  const by = {};
  crew.forEach((c) => (by[c.id] = { even: 0, nights: 0, users: 0, personal: 0, total: 0, nightsCount: nights(c) }));
  let total = 0,
    loose = 0;
  items.forEach((it) => {
    total += it.total;
    loose += it.loose;
    crew.forEach((c) => {
      const v = it.share[c.id] || 0;
      const one = Math.min(v, it.single[c.id] || 0);
      by[c.id].personal += one;
      by[c.id][it.split] = (by[c.id][it.split] || 0) + v - one;
      by[c.id].total += v;
    });
  });
  return { items, by, total, loose, allNights, days: D, nights: Object.fromEntries(crew.map((c) => [c.id, nights(c)])) };
}
