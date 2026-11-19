// Gear ids are positions in the list a trip was first built from. Copies built from an older list number
// the same items differently, so combining them by id moves one item's quantities onto another.
// Matching by name puts each item back under its current id before copies are combined.
const hash = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
};

export function alignGear(trip, ref, renames = {}) {
  const gear = trip && Array.isArray(trip.gear) ? trip.gear : null;
  if (!gear || !ref.length) return trip;
  const refName = new Map(ref.map((g) => [g.id, g.n]));
  const refIds = new Map();
  ref.forEach((g) => refIds.set(g.n, [...(refIds.get(g.n) || []), g.id]));
  const nm = (g) => renames[g.n] || g.n;
  // an item that already has an id its name belongs to is in place (names can repeat in the list)
  const want = gear.map((g) => {
    const ids = refIds.get(nm(g));
    return ids ? (ids.includes(g.id) ? g.id : ids[0]) : null;
  });
  if (!gear.some((g, i) => want[i] && want[i] !== g.id)) return trip;
  const taken = new Set();
  const ids = gear.map((g, i) => {
    if (want[i] === g.id && !taken.has(g.id)) {
      taken.add(g.id);
      return g.id;
    }
    return null;
  });
  gear.forEach((g, i) => {
    if (ids[i] || !want[i]) return;
    const free = refIds.get(nm(g)).find((id) => !taken.has(id));
    if (!free) return;
    taken.add(free);
    ids[i] = free;
  });
  gear.forEach((g, i) => {
    if (ids[i]) return;
    // keep its own id unless another item now holds it
    const keep = !taken.has(g.id) && !(refName.has(g.id) && want.includes(g.id));
    ids[i] = keep ? g.id : 'x' + hash(g.id + '|' + g.n);
    taken.add(ids[i]);
  });
  const out = { ...trip, gear: gear.map((g, i) => (ids[i] === g.id ? g : { ...g, id: ids[i] })) };
  // removals recorded under the old numbering can't be matched to an item
  if (trip._del && trip._del.gear) out._del = { ...trip._del, gear: Object.fromEntries(Object.entries(trip._del.gear).filter(([id]) => !refName.has(id))) };
  return out;
}
