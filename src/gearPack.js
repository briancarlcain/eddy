import { num } from './gearLedger.js';

// in the saved order; anything not saved yet follows
export const inOrder = (list, saved) => {
  const at = (x) => (saved.includes(x) ? saved.indexOf(x) : saved.length);
  return [...list].sort((a, b) => at(a) - at(b));
};

// move one of the shown entries; the ones not shown keep their places
export const moveShown = (all, shown, from, to) => {
  const next = [...shown];
  next.splice(to, 0, ...next.splice(from, 1));
  let k = 0;
  return all.map((x) => (shown.includes(x) ? next[k++] : x));
};

// packed ticks: one key for the whole item, or one per part (base#part) while only some are packed
export function flipParts(done, base, all, parts, on) {
  const have = new Set(done[base] ? all : all.filter((a) => done[base + '#' + a]));
  parts.forEach((a) => (on ? have.add(a) : have.delete(a)));
  const next = Object.fromEntries(Object.entries(done).filter(([k]) => k !== base && !k.startsWith(base + '#')));
  if (all.every((a) => have.has(a))) next[base] = true;
  else have.forEach((a) => (next[base + '#' + a] = true));
  return next;
}

// one person's part in an item: what they bring, what others bring them, what they rent, and everyone else's part
export function packInfo(i, me, crew, label) {
  const who = (ids) => {
    const ns = ids.map(label);
    return ns.length > 1 ? ns.slice(0, -1).join(', ') + ' & ' + ns[ns.length - 1] : ns[0] || '';
  };
  // who each unit is for: the owner is left out of to on units they use themselves
  const forOf = (u) => (u.kind === 'own' ? [u.owner, ...u.to.filter((id) => id !== u.owner)] : u.group || !u.to.length ? [] : u.to);
  const tally = (units) => {
    const m = new Map();
    units.forEach((x) => {
      const u = { to: forOf(x) };
      const k = !u.to.length ? 'group' : [...u.to].sort((a, b) => (a === me ? -1 : b === me ? 1 : 0) || label(a).localeCompare(label(b))).join('+');
      m.set(k, (m.get(k) || 0) + 1);
    });
    return [...m.entries()].map(([k, n]) => ({ n, to: k === 'group' ? [] : k.split('+') }));
  };
  const others = (to) => to.filter((id) => id !== me);
  // short phrase for the row, full one for the detail
  const short = ({ n, to }) => {
    if (!to.length) return `${n} for the group`;
    const o = others(to);
    if (to.includes(me)) return o.length ? `${n} shared with ${o.length > 1 ? o.length + ' others' : label(o[0])}` : `${n} for ${label(me)}`;
    return `${n} for ${to.length > 2 ? to.length + ' people' : who(to)}`;
  };
  const full = ({ n, to }) => `${n} for ${to.length ? who(to) : 'the group'}`;
  const mine = i.units.filter((u) => u.owner === me);
  const bring = Math.max(mine.length, num(i.bringBy[me]));
  const bringLines = tally(mine);
  const fromIds = [...new Set(i.units.filter((u) => u.owner !== me && u.to.includes(me)).map((u) => u.owner))];
  const borrow = fromIds.map((id) => ({ id, lines: tally(i.units.filter((u) => u.owner === id && u.to.includes(me))) }));
  const borrowN = borrow.reduce((a, b) => a + b.lines.reduce((x, l) => x + l.n, 0), 0);
  const elseIds = [...new Set(i.units.filter((u) => u.owner !== me && !u.to.includes(me)).map((u) => u.owner))];
  const elsewhere = elseIds.map((id) => ({ id, lines: tally(i.units.filter((u) => u.owner === id && !u.to.includes(me))) }));
  // rentals: the group's units are split among everyone who wasn't excused
  const pool = crew.filter((c) => !i.excl[c.id]);
  const groupIds = (pool.length ? pool : crew).map((c) => c.id);
  const inLine = (l) => (l.to.length ? l.to.includes(me) : groupIds.includes(me));
  const share = i.share[me] || 0;
  const rentMine = i.lines.filter(inLine);
  const rentElse = i.lines.filter((l) => !inLine(l));
  const renting = share > 0.005 || rentMine.some((l) => l.to.length);
  const rentShort = (l) => {
    if (!l.to.length) return `Rented by the group${groupIds.length > 1 ? `, split ${groupIds.length} ways` : ''}`;
    const o = others(l.to);
    return o.length ? `Renting ${l.n}, split with ${o.length > 1 ? o.length + ' others' : label(o[0])}` : `Renting ${l.n} for ${label(me)}`;
  };
  const rentFull = (l) => `${l.n} for ${l.to.length ? who(l.to) : `the group (${groupIds.length})`}`;
  // what this person brings, borrows and rents, split by who uses it
  const whoUses = (to) => (!to.length ? 'group' : to.includes(me) ? 'me' : 'else');
  const atoms = [];
  const add = (how, use, n) => {
    const a = atoms.find((x) => x.how === how && x.use === use);
    if (a) a.n += n;
    else atoms.push({ how, use, n });
  };
  bringLines.forEach((l) => add('bring', whoUses(l.to), l.n));
  if (bring > mine.length) add('bring', 'me', bring - mine.length);
  if (borrowN > 0) add('borrow', 'me', borrowN);
  if (renting) {
    rentMine.forEach((l) => add('rent', whoUses(l.to), l.n));
    if (!rentMine.length) add('rent', 'me', 0);
  }
  // the row's phrases, for one source and one user, or all of them
  const subFor = (how, use) => {
    const fits = (to) => !use || whoUses(to) === use;
    const out = [];
    if (!how || how === 'bring') {
      const ls = bringLines.filter((l) => fits(l.to));
      if (ls.length && !(ls.length === 1 && ls[0].to.length === 1 && ls[0].to[0] === me)) out.push('Bringing ' + ls.map(short).join(', '));
    }
    if ((!how || how === 'borrow') && borrowN > 0 && fits([me])) out.push(`From ${who(borrow.map((b) => b.id))}${borrow.some((b) => b.lines.some((l) => others(l.to).length)) ? ', shared' : ''}`);
    if ((!how || how === 'rent') && renting) out.push(...rentMine.filter((l) => fits(l.to)).map(rentShort));
    return out;
  };
  const sub = subFor();
  return { bring, bringLines, borrow, borrowN, elsewhere, share, renting, rentMine, rentElse, atoms, sub, subFor, full, rentFull, who };
}
