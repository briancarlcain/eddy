// Conflict-free merging of a shared trip between devices.
//
// A trip is a plain object. Edits are stamped (stamp()) so two copies edited at the
// same time can be combined (mergeTrips()) without losing either side's work:
//   - scalar fields (name, start, days, ...)  last write wins, per field (_ts)
//   - lists of {id} items (crew, gear, meals)  last write wins, per item (_u);
//       removals are remembered as tombstones (_del) so they are not undone
//   - a gear item's own fields (price, rentals…)  last write wins, per field (_f), once stamped
//   - gear.e[personId]                         merged per person, so two people can fill in
//                                              their own quantities on the same item at once
//   - plans[dayIndex]                          last write wins, per day (_u)
// mergeTrips(local, remote) is deterministic: remote order and remote wins ties, so two
// devices that exchange copies converge on identical data and stop pushing.

const META = new Set(['_ts', '_del', 'at']);
const PRUNE_MS = 60 * 24 * 3600 * 1000;

export const strip = (v) => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) if (k[0] !== '_') o[k] = strip(v[k]);
    return o;
  }
  return v;
};
export const canon = (v) => {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
};
const same = (a, b) => canon(strip(a)) === canon(strip(b));
const U = (x) => (x && x._u) || 0;

// stamp the differences between two versions of a trip with `now`.
// under: a one-time upgrade of a possibly stale copy. Its changes are stamped just after this copy's own
// last edit, so they never beat newer edits made on other devices.
export function stamp(old, next, now, under = false) {
  const at = (x) => (under ? ((x && x._u) || 0) + 1 : now);
  const out = { ...next };
  const ts = { ...(old._ts || {}), ...(next._ts || {}) };
  const del = JSON.parse(JSON.stringify(old._del || {}));
  for (const k of Object.keys(next)) {
    if (k[0] === '_' || META.has(k)) continue;
    const v = next[k];
    const o = old[k];
    if (Array.isArray(v)) {
      const prev = new Map((Array.isArray(o) ? o : []).map((it) => [it.id, it]));
      out[k] = v.map((it) => {
        const p = prev.get(it.id);
        if (!p) return { ...it, _u: under ? 1 : now };
        if (same(p, it)) return it;
        if (it.e && typeof it.e === 'object') {
          // gear-style item: stamp per person, bump the item only if something else changed
          const { e: _e1, ...restNew } = it;
          const { e: _e0, ...restOld } = p;
          const e = {};
          for (const pid of Object.keys(it.e)) e[pid] = same(it.e[pid], (p.e || {})[pid]) ? it.e[pid] : { ...it.e[pid], _u: at((p.e || {})[pid]) };
          if (same(restNew, restOld)) return { ...it, e, _u: it._u || p._u };
          // each of the item's own fields keeps its own time, so edits to different fields both survive a merge
          const _f = {};
          for (const f of itemFields(restNew, restOld)) _f[f] = same(restNew[f], restOld[f]) ? fieldAt(p, f) : under ? fieldAt(p, f) + 1 : now;
          return { ...it, e, _u: at(p), _f };
        }
        return { ...it, _u: at(p) };
      });
      const have = new Set(v.map((it) => it.id));
      for (const [id] of prev) if (!have.has(id)) (del[k] ||= {})[id] = now;
    } else if (k === 'plans') {
      const plans = {};
      for (const d of Object.keys(v || {})) plans[d] = same(v[d], (o || {})[d]) ? v[d] : { ...v[d], _u: at((o || {})[d]) };
      for (const d of Object.keys(o || {})) if (!(d in (v || {}))) (del.plans ||= {})[d] = now;
      out.plans = plans;
    } else if (!same(v, o)) ts[k] = under ? ((old._ts || {})[k] || 0) + 1 : now;
  }
  out._ts = ts;
  out._del = del;
  return out;
}

const pick = (local, remote) => (U(local) > U(remote) ? local : remote); // remote wins ties
const itemFields = (...xs) => [...new Set(xs.flatMap((x) => Object.keys(x || {}).concat(Object.keys((x && x._f) || {}))))].filter((k) => k[0] !== '_' && k !== 'id' && k !== 'e');
// a field missing from _f was never set on that copy; an item edited later by an app without field times counts as edited throughout
const fieldAt = (x, f) => (x._f && U(x) <= Math.max(0, ...Object.values(x._f)) ? x._f[f] || 0 : U(x));

function mergeList(a = [], b = [], delA = {}, delB = {}) {
  const del = { ...delA };
  for (const id of Object.keys(delB)) del[id] = Math.max(del[id] || 0, delB[id]);
  const mine = new Map(a.map((it) => [it.id, it]));
  const seen = new Set();
  const out = [];
  for (const r of b) {
    seen.add(r.id);
    const l = mine.get(r.id);
    out.push(l ? mergeItem(l, r) : r);
  }
  for (const l of a) if (!seen.has(l.id)) out.push(l); // local-only items go after remote's order
  return out.filter((it) => !((del[it.id] || 0) >= U(it) && del[it.id]));
}

function mergeItem(l, r) {
  const base = pick(l, r);
  if (!(l.e || r.e)) return base;
  const e = {};
  for (const pid of new Set([...Object.keys(r.e || {}), ...Object.keys(l.e || {})])) {
    const x = (l.e || {})[pid], y = (r.e || {})[pid];
    e[pid] = x && y ? pick(x, y) : x || y;
  }
  const u = Math.max(U(l), U(r));
  if (!l._f && !r._f) return u ? { ...base, e, _u: u } : { ...base, e };
  const out = { id: r.id };
  const _f = {};
  for (const f of itemFields(l, r)) {
    const a = fieldAt(l, f), b = fieldAt(r, f);
    const src = a > b ? l : r; // remote wins ties
    if (src[f] !== undefined) out[f] = src[f];
    _f[f] = Math.max(a, b);
  }
  return { ...out, e, _u: u, _f };
}

export function mergeTrips(local, remote, now = Date.now()) {
  const out = {};
  const keys = new Set([...Object.keys(remote), ...Object.keys(local)]);
  const tsL = local._ts || {}, tsR = remote._ts || {};
  const delL = local._del || {}, delR = remote._del || {};
  const ts = {};
  const del = {};
  for (const k of keys) {
    if (k === '_ts' || k === '_del' || k === 'at') continue;
    const l = local[k], r = remote[k];
    if (Array.isArray(l) || Array.isArray(r)) {
      out[k] = mergeList(Array.isArray(l) ? l : [], Array.isArray(r) ? r : [], delL[k], delR[k]);
    } else if (k === 'plans') {
      const p = {};
      const dl = { ...(delL.plans || {}) };
      for (const d of Object.keys(delR.plans || {})) dl[d] = Math.max(dl[d] || 0, delR.plans[d]);
      for (const d of new Set([...Object.keys(r || {}), ...Object.keys(l || {})])) {
        const x = (l || {})[d], y = (r || {})[d];
        const m = x && y ? pick(x, y) : x || y;
        if (!(dl[d] && dl[d] >= U(m))) p[d] = m;
      }
      out.plans = p;
    } else if (k in tsL || k in tsR) {
      out[k] = (tsL[k] || 0) > (tsR[k] || 0) ? l : k in remote ? r : l;
      ts[k] = Math.max(tsL[k] || 0, tsR[k] || 0);
    } else {
      out[k] = k in remote ? r : l; // unstamped legacy field: take the remote value
    }
  }
  for (const k of new Set([...Object.keys(delL), ...Object.keys(delR)])) {
    const m = {};
    for (const id of new Set([...Object.keys(delL[k] || {}), ...Object.keys(delR[k] || {})])) {
      const t = Math.max((delL[k] || {})[id] || 0, (delR[k] || {})[id] || 0);
      if (now - t < PRUNE_MS) m[id] = t;
    }
    if (Object.keys(m).length) del[k] = m;
  }
  out._ts = ts;
  out._del = del;
  out.at = Math.max(local.at || 0, remote.at || 0);
  return out;
}
