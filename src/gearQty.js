// Grand Canyon 2026: counts (who needs, brings, lends and rents each item) come from the trip sheet.
// Replaces them on older copies of the trip; names, prices, categories and notes are left alone.
export function applySheetQty(gear, seedGear) {
  const by = new Map(seedGear.map((g) => [g.id, g]));
  return gear.map((g) => {
    const s = by.get(g.id);
    if (!s) return g;
    const { q, rn, rnTo, e, ...rest } = g;
    // people the sheet leaves out are emptied, not dropped, so an older copy can't bring them back when synced
    const blank = Object.fromEntries(Object.keys(e || {}).map((k) => [k, {}]));
    return { ...rest, e: { ...blank, ...s.e }, ...(s.q !== undefined ? { q: s.q } : {}), ...(s.rn !== undefined ? { rn: s.rn, rnTo: s.rnTo } : {}) };
  });
}
