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
  split: g.s || 'personal',
  req: g.r === 'req' || g.r === 'rec' ? g.r : '',
  flat: num(g.f),
  day: num(g.d),
  qty: num(g.q),
  e: g.e || {},
});

// Units a person brings. Each is { to: [crew ids or 'group'], x: true when named borrowers owe no rental cost }.
// Own units (have) can be shared with others; lent units (lend) go to named people or the group (the default).
export function unitsOf(e, owner, ids) {
  const clean = (u) => (Array.isArray(u && u.to) ? u.to.filter((id) => id !== owner && ids.has(id)) : []);
  const own = [],
    lent = [];
  for (let i = 0; i < Math.floor(num(e.have)); i++) {
    const u = (e.share || [])[i] || {};
    own.push({ to: clean(u), x: !!u.x });
  }
  const cnt = Math.floor(num(e.lend));
  if (e.lendTo) {
    // quantities per person; whatever is not given to someone goes to the group
    let left = cnt;
    for (const id of Object.keys(e.lendTo)) {
      if (id === owner || !ids.has(id)) continue;
      const n = Math.min(left, Math.floor(num((e.lendTo[id] || {}).n)));
      for (let k = 0; k < n; k++) lent.push({ to: [id], group: false, x: !!e.lendTo[id].x });
      left -= Math.max(0, n);
    }
    for (let k = 0; k < left; k++) lent.push({ to: [], group: true, x: false });
  } else {
    for (let j = 0; j < cnt; j++) {
      const u = (e.lends || [])[j] || {};
      const to = clean(u);
      lent.push({ to, group: !to.length, x: !!u.x });
    }
  }
  return { own, lent, spare: Math.max(0, num(e.lend) - Math.floor(num(e.lend))) };
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

// how one person's need for an item is covered: bringing their own, borrowed, or rented
export function coverOf(it, id) {
  if (it.kind === 'group') return { own: num((it.e[id] || {}).have) > 0, borrowed: (it.named[id] || 0) > 0, rented: (it.rented[id] || 0) > 0 || (it.share[id] || 0) > 0.005 };
  const need = num((it.e[id] || {}).need);
  const own = Math.min(num((it.e[id] || {}).have), need);
  const named = it.named[id] || 0;
  const left = Math.max(0, need - own - named);
  const pool = left > 0 && it.rent <= 0.005 && it.lendGroup > 0;
  return { own: own > 0, borrowed: named > 0 || pool, rented: (it.rented[id] || 0) > 0 || (it.share[id] || 0) > 0.005 };
}

export function ledger(t) {
  const D = Math.max(1, num(t.days) || 1);
  const crew = t.crew;
  const ids = new Set(crew.map((c) => c.id));
  const span = (c) => (okDate(c.onDate) && okDate(c.offDate) ? Math.round((new Date(c.offDate + 'T12:00:00Z') - new Date(c.onDate + 'T12:00:00Z')) / 864e5) : 0);
  const nights = (c) => (num(c.days) > 0 ? num(c.days) : span(c) > 0 ? span(c) : D);
  const allNights = crew.reduce((a, c) => a + nights(c), 0);
  const items = (t.gear || []).map((g) => {
    const it = norm(g);
    const unit = priceOf(g, D);
    // a group item has one count for the whole group; nobody enters a personal need
    const grp = it.kind === 'group';
    let have = 0,
      need = 0,
      lend = 0,
      lendGroup = 0;
    const own = {},
      raw = {},
      excl = {},
      units = [];
    crew.forEach((c) => {
      const e = it.e[c.id] || {};
      // what a person brings for themselves only covers what they need
      own[c.id] = grp ? num(e.have) : Math.min(num(e.have), num(e.need));
      have += own[c.id];
      need += grp ? 0 : num(e.need);
      lend += num(e.lend);
      const u = unitsOf(e, c.id, ids);
      lendGroup += u.spare;
      u.own.forEach((x) => units.push({ owner: c.id, kind: 'own', ...x }));
      u.lent.forEach((x) => {
        if (x.group) lendGroup += 1;
        units.push({ owner: c.id, kind: 'lend', ...x });
      });
    });
    // a unit shared with named people covers each of them once
    units.forEach((x) =>
      x.to.forEach((id) => {
        raw[id] = (raw[id] || 0) + 1;
        if (x.x) excl[id] = true;
      })
    );
    const named = {};
    let namedTotal = 0;
    crew.forEach((c) => {
      const e = it.e[c.id] || {};
      named[c.id] = grp ? raw[c.id] || 0 : Math.min(raw[c.id] || 0, Math.max(0, num(e.need) - own[c.id]));
      if (!grp) namedTotal += named[c.id];
    });
    const shared = units.some((x) => x.to.length);
    // lent units are extra physical units, whoever they go to
    const borrowed = grp ? lend : namedTotal + lendGroup;
    const target = grp ? it.qty : it.split === 'personal' ? need : it.qty || need;
    // rentals are entered by hand: a quantity, and who each unit is for (the group or a person)
    const rt = g.rnTo && typeof g.rnTo === 'object' ? g.rnTo : {};
    const rent = Math.max(0, num(g.rn));
    const rg = Math.max(0, num(rt.group));
    const rented = {};
    let rAssigned = rg;
    crew.forEach((c) => {
      const n = Math.max(0, num(rt[c.id]));
      if (n) {
        rented[c.id] = n;
        rAssigned += n;
      }
    });
    const short = Math.max(0, target - have - borrowed - rent);
    const total = unit * rent;
    const share = {};
    crew.forEach((c) => {
      if (rented[c.id] && unit) share[c.id] = unit * rented[c.id];
    });
    if (rg > 0 && unit > 0) {
      // the group's units are split by the item's billing, skipping people who were excused
      const free = crew.filter((c) => !excl[c.id]);
      const pool = free.length ? free : crew;
      const w = (c) => (it.split === 'nights' ? nights(c) : 1);
      const ws = pool.reduce((a, c) => a + w(c), 0);
      if (ws) pool.forEach((c) => (share[c.id] = (share[c.id] || 0) + (unit * rg * w(c)) / ws));
    }
    const assigned = Object.values(share).reduce((a, b) => a + b, 0);
    // what needs fixing before the numbers can be trusted
    const issues = [];
    const blank = (v) => v === undefined || v === null || String(v).trim() === '';
    const f2 = (x) => +x.toFixed(2);
    if (Math.abs(rAssigned - rent) > 0.005) {
      issues.push(
        rAssigned < rent
          ? `Renting ${f2(rent)}, but only ${f2(rAssigned)} is assigned. Assign the other ${f2(rent - rAssigned)} to the group or crew.`
          : `${f2(rAssigned)} is assigned, but Renting is ${f2(rent)}. Lower the assigned numbers or raise Renting.`
      );
    }
    if (rent > 0 && blank(g.f) && blank(g.d)) issues.push('Add a rental price. $0 is fine, but it can’t be blank.');
    return { id: g.id, raw: g, ...it, unit, have, need, lend, borrowed, lendGroup, target, rent, short, total, share, loose: Math.max(0, total - assigned), units, named, excl, rented, rAssigned, issues };
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
      by[c.id][it.split] += v;
      by[c.id].total += v;
    });
  });
  return { items, by, total, loose, allNights, days: D };
}
