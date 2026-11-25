import { num } from './gearLedger.js';

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
  const sub = [
    bring > 0 && (bringLines.length === 1 && bringLines[0].to.length === 1 && bringLines[0].to[0] === me ? '' : 'Bringing ' + bringLines.map(short).join(', ')),
    borrowN > 0 && `From ${who(borrow.map((b) => b.id))}${borrow.some((b) => b.lines.some((l) => others(l.to).length)) ? ', shared' : ''}`,
    ...(renting ? rentMine.map(rentShort) : []),
  ].filter(Boolean);
  return { bring, bringLines, borrow, borrowN, elsewhere, share, renting, rentMine, rentElse, sub, full, rentFull, who };
}
