#!/usr/bin/env python3
"""Builds data/basin/<river>.json: the drainage basin above each river's take-out, for the River > Map > Basin view.

Source data (all USGS, public domain), downloaded once into --cache:
  National Hydrography Dataset, high resolution, one GeoPackage per 4-digit hydrologic unit (HU4):
    https://prd-tnm.s3.amazonaws.com/StagedProducts/Hydrography/NHD/HU4/GPKG/NHD_H_<HU4>_HU4_GPKG.zip
  Each package carries the flowlines, the flow table, the waterbodies and the Watershed Boundary Dataset (WBD) layers.

What it does for each river (see rivers.json):
  1. snaps the put-in to the named main stem and walks the run's length downstream to find the take-out;
  2. traces every natural channel upstream of the take-out and measures each one (upstream channel length, Strahler order);
  3. keeps the largest channels that fit a size budget, merged into named polylines;
  4. outlines the basin from the WBD HUC12 watersheds that contain upstream channels;
  5. picks the biggest reservoirs and lakes in the basin and puts a dam marker at each reservoir's outlet,
     named from dams.json (a reservoir with no entry there gets no dam marker rather than a guessed name).
Geometry is stored as delta-encoded polylines (see enc()); src/BasinMap.jsx decodes them.

  python3 scripts/basin/build.py                       # every river
  python3 scripts/basin/build.py dolores smith         # some rivers
  python3 scripts/basin/build.py --list-reservoirs     # print the reservoirs it would label (to fill in dams.json)
  python3 scripts/basin/build.py --dams-only           # after editing dams.json: re-apply it to the built files (seconds, no network)
  python3 scripts/basin/build.py --preview /tmp/prev   # also write PNG previews (needs matplotlib)

Needs: python 3.10+, geopandas, pyogrio, shapely>=2, numpy, pandas.
"""
import argparse, collections, json, math, os, sys, urllib.request, zipfile

import numpy as np
import pandas as pd
import geopandas as gpd
import pyogrio
import shapely
from shapely.geometry import Point, LineString, MultiLineString, Polygon, MultiPolygon
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
TNM = 'https://prd-tnm.s3.amazonaws.com/StagedProducts/Hydrography/NHD/HU4/GPKG/NHD_H_%s_HU4_GPKG.zip'

# natural channels only: stream/river, artificial path (through lakes and wide rivers), connector. No canals or pipelines.
KEEP = (460, 558, 334)
PREC = 1e4  # coordinate precision of the encoded geometry (about 11 m)


# --------------------------------------------------------------------------- encoding
def _num(v, out):
    v = ~(v << 1) if v < 0 else v << 1
    while v >= 0x20:
        out.append(chr((0x20 | (v & 0x1F)) + 63))
        v >>= 5
    out.append(chr(v + 63))


def enc(coords):
    """[(lon, lat), ...] -> Google-style encoded polyline string at PREC (lat first, then lon, as deltas)."""
    out, la, lo = [], 0, 0
    for c in coords:  # (lon, lat[, z])
        a, b = round(c[1] * PREC), round(c[0] * PREC)
        _num(a - la, out)
        _num(b - lo, out)
        la, lo = a, b
    return ''.join(out)


# --------------------------------------------------------------------------- geometry helpers
def hav(a, b):
    """km between (lat, lon) points"""
    r = 6371.0088
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dl = math.radians(b[1] - a[1])
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def ends(g):
    """first and last vertex of a (possibly multipart) line"""
    if g.geom_type == 'LineString':
        c = g.coords
        return (c[0][0], c[0][1]), (c[-1][0], c[-1][1])
    parts = list(g.geoms)
    return (parts[0].coords[0][0], parts[0].coords[0][1]), (parts[-1].coords[-1][0], parts[-1].coords[-1][1])


def lines_of(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == 'LineString':
        return [g]
    if g.geom_type == 'MultiLineString':
        return list(g.geoms)
    return [p for x in getattr(g, 'geoms', []) for p in lines_of(x)]


def polys_of(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    return [p for x in getattr(g, 'geoms', []) for p in polys_of(x)]


# --------------------------------------------------------------------------- network
class Net:
    """All natural flowlines of a group of HU4s, with the flow graph, a spanning tree and its measures."""

    def __init__(self, hu4s, cache):
        self.hu4s = hu4s
        self.cache = cache
        frames, flows, wbs, h12 = [], [], [], []
        for h in hu4s:
            f = self.gpkg(h)
            print(f'  reading HU4 {h}', flush=True)
            fl = gpd.read_file(f, layer='NHDFlowline', columns=['permanent_identifier', 'gnis_name', 'lengthkm', 'ftype', 'wbarea_permanent_identifier'])
            fl = fl[fl.ftype.isin(KEEP) & fl.geometry.notna()]
            g = shapely.force_2d(fl.geometry.values)
            g = np.array([shapely.line_merge(x) if x.geom_type == 'MultiLineString' else x for x in g], dtype=object)
            fl = pd.DataFrame({'pid': fl.permanent_identifier.astype(str).values, 'name': fl.gnis_name.values, 'km': fl.lengthkm.values.astype(float),
                               'ftype': fl.ftype.values, 'wb': fl.wbarea_permanent_identifier.astype(str).values, 'geom': g})
            frames.append(fl)
            fw = pyogrio.read_dataframe(f, layer='NHDFlow', read_geometry=False)
            fw = fw[fw.direction == 709]
            flows.append(pd.DataFrame({'a': fw.from_permanent_identifier.astype(str).values, 'b': fw.to_permanent_identifier.astype(str).values}))
            wbs.append((h, f))
        self.fl = pd.concat(frames).drop_duplicates('pid').set_index('pid')
        ids = set(self.fl.index)
        fw = pd.concat(flows)
        fw = fw[fw.a.isin(ids) & fw.b.isin(ids) & (fw.a != fw.b)]
        self.down = collections.defaultdict(list)
        self.up = collections.defaultdict(list)
        for a, b in zip(fw.a, fw.b):
            if b not in self.down[a]:
                self.down[a].append(b)
                self.up[b].append(a)
        self.link_hu4_edges()
        self.wbfiles = wbs
        self.tree()
        if self.bridge_dams():
            self.tree()

    def gpkg(self, h):
        path = os.path.join(self.cache, f'NHD_H_{h}_HU4_GPKG.gpkg')
        if not os.path.exists(path):
            os.makedirs(self.cache, exist_ok=True)
            zp = path.replace('.gpkg', '.zip')
            print(f'  downloading HU4 {h} ...', flush=True)
            urllib.request.urlretrieve(TNM % h, zp)
            with zipfile.ZipFile(zp) as z:
                z.extract(os.path.basename(path), self.cache)
            os.remove(zp)
        return path

    def link_hu4_edges(self):
        """Flowlines are clipped at HU4 borders: join a channel that ends with no outflow to a channel that starts on the same vertex."""
        starts = collections.defaultdict(list)
        endsd = {}
        for pid, g in self.fl.geom.items():
            s, e = ends(g)
            starts[(round(s[0], 6), round(s[1], 6))].append(pid)
            endsd[pid] = (round(e[0], 6), round(e[1], 6))
        added = 0
        for pid, k in endsd.items():
            if self.down.get(pid):
                continue
            for t in starts.get(k, []):
                if t != pid:
                    self.down[pid].append(t)
                    self.up[t].append(pid)
                    added += 1
        print(f'  linked {added} flowlines across HU4 borders', flush=True)

    def bridge_dams(self, min_arb=20.0, max_m=1500.0):
        """A dam cuts its river in two: the channel above ends at the dam and the one below starts a few hundred metres on, with
        nothing in the flow table between them. Join a named channel's loose end to the nearest start of a channel with the same
        name (and no channel above it), unless that start is already upstream of it."""
        fl = self.fl
        pids = list(fl.index)
        pos = {p: i for i, p in enumerate(pids)}
        names = fl.name.values
        by_name = collections.defaultdict(list)
        starts = np.zeros((len(pids), 2))
        for i, p in enumerate(pids):
            starts[i] = ends(fl.geom[p])[0]
            if isinstance(names[i], str) and not self.up.get(p):
                by_name[names[i]].append(i)
        loose = [p for p in pids if not self.down.get(p) and isinstance(names[pos[p]], str) and self.arb.get(p, 0) >= min_arb]
        loose.sort(key=lambda p: -self.arb[p])
        done = []
        for p in loose:
            idx = [i for i in by_name.get(names[pos[p]], ()) if pids[i] != p]
            if not idx:
                continue
            e = ends(fl.geom[p])[1]
            s = starts[idx]
            d = np.hypot((s[:, 0] - e[0]) * 111320 * math.cos(math.radians(e[1])), (s[:, 1] - e[1]) * 110570)
            j = int(np.argmin(d))
            if d[j] > max_m:
                continue
            t = pids[idx[j]]
            if t in self.upstream(p):
                continue
            self.down[p].append(t)
            self.up[t].append(p)
            by_name[names[pos[p]]].remove(idx[j])
            done.append((self.arb[p], names[pos[p]], d[j]))
        # a sizeable tributary that stops a few metres short of the river it joins
        starts_all = starts
        loose = [p for p in pids if not self.down.get(p) and self.arb.get(p, 0) >= 100.0]
        loose.sort(key=lambda p: -self.arb[p])
        for p in loose:
            e = ends(fl.geom[p])[1]
            d = np.hypot((starts_all[:, 0] - e[0]) * 111320 * math.cos(math.radians(e[1])), (starts_all[:, 1] - e[1]) * 110570)
            d[pos[p]] = 1e9
            j = int(np.argmin(d))
            if d[j] > 150:
                continue
            t = pids[j]
            if self.arb[t] < self.arb[p] * 0.5 or t in self.upstream(p):
                continue
            self.down[p].append(t)
            self.up[t].append(p)
            done.append((self.arb[p], f'{names[pos[p]]} -> {names[j]}', d[j]))
        for a, n, m in done:
            print(f'  bridged a gap on {n} ({a:,.0f} km of channel above, {m:,.0f} m)', flush=True)
        return len(done)

    def tree(self):
        """One primary downstream flowline each (braids broken), then upstream channel length and Strahler order along that tree."""
        fl = self.fl
        name, km = fl.name.to_dict(), fl.km.to_dict()
        tdown = {}
        for n, ds in self.down.items():
            if not ds:
                continue
            if len(ds) == 1:
                tdown[n] = ds[0]
                continue
            same = [d for d in ds if name.get(n) and name.get(d) == name.get(n)]
            tdown[n] = max(same or ds, key=lambda d: km[d])
        tup = collections.defaultdict(list)
        for n, d in tdown.items():
            tup[d].append(n)
        indeg = {n: len(tup.get(n, ())) for n in fl.index}
        stack = [n for n, v in indeg.items() if v == 0]
        arb = dict(km)
        order = {}
        done = 0
        while stack:
            n = stack.pop()
            done += 1
            us = tup.get(n)
            if not us:
                order[n] = 1
            else:
                m = [order[u] for u in us]
                mx = max(m)
                order[n] = mx + 1 if m.count(mx) > 1 else mx
            d = tdown.get(n)
            if d is not None:
                arb[d] += arb[n]
                indeg[d] -= 1
                if indeg[d] == 0:
                    stack.append(d)
        if done != len(fl):
            print(f'  warning: {len(fl) - done} flowlines sit in cycles and have no measures', file=sys.stderr)
        self.tdown, self.arb, self.order = tdown, arb, order

    def snap(self, names, lat, lon, tol_km):
        sub = self.fl[self.fl.name.isin(names)]
        if sub.empty:
            raise SystemExit(f'no flowlines named {names}')
        d = shapely.distance(np.array(sub.geom.values, dtype=object), Point(lon, lat))
        i = int(np.argmin(d))
        km = d[i] * 111.0 * math.cos(math.radians(lat))
        if km > tol_km:
            raise SystemExit(f'put-in {lat},{lon} is {km:.1f} km from the nearest {names}')
        return sub.index[i]

    def walk(self, start, km):
        path, tot, cur = [start], self.fl.km[start], start
        while tot < km:
            nxt = self.tdown.get(cur)
            if nxt is None:
                break
            cur = nxt
            path.append(cur)
            tot += self.fl.km[cur]
        return path, tot

    def walk_until(self, start, target, limit_km):
        path, tot, cur = [start], self.fl.km[start], start
        while cur != target:
            nxt = self.tdown.get(cur)
            if nxt is None or tot > limit_km:
                return None, tot
            cur = nxt
            path.append(cur)
            tot += self.fl.km[cur]
        return path, tot

    def walk_up(self, end, km):
        """follow the biggest upstream channel from `end` until `km` of river is covered"""
        path, tot, cur = [end], self.fl.km[end], end
        while tot < km:
            ups = [u for u in self.up.get(cur, ()) if self.tdown.get(u) == cur]
            if not ups:
                break
            cur = max(ups, key=lambda u: self.arb[u])
            path.append(cur)
            tot += self.fl.km[cur]
        return path[::-1], tot

    def upstream(self, outlet):
        seen, stack = {outlet}, [outlet]
        while stack:
            c = stack.pop()
            for u in self.up.get(c, ()):
                if u not in seen:
                    seen.add(u)
                    stack.append(u)
        return seen


# --------------------------------------------------------------------------- one river
def load_json(p):
    with open(p) as f:
        return json.load(f)


def build(rid, spec, groups, dams, nets, args):
    river = load_json(os.path.join(ROOT, 'data', 'rivers', rid + '.json'))
    run_km = spec.get('run_mi', river['miles'][1] - river['miles'][0]) * 1.609344
    gname = spec['net']
    if gname not in nets:
        nets.clear()
        print(f'loading network "{gname}" ...', flush=True)
        nets[gname] = Net(groups[gname], args.cache)
    net = nets[gname]
    tol_km = spec.get('tol', 12)
    if 'put' in spec:
        start = net.snap(spec['main'], spec['put'][0], spec['put'][1], tol_km)
        if 'take' in spec:  # both ends known: the run is the main-stem path between them
            tid = net.snap(spec['main'], spec['take'][0], spec['take'][1], tol_km)
            path, tot = net.walk_until(start, tid, run_km * 2)
            if path is None:
                raise SystemExit(f'{rid}: no downstream path from the put-in to the take-out')
        else:
            path, tot = net.walk(start, run_km)
    else:  # only the take-out is known: walk up the main stem by the guide's length
        if spec['take'] == 'mouth':  # the downstream-most flowline carrying the main-stem name
            sub = net.fl[net.fl.name.isin(spec['main'])]
            tid = max(sub.index, key=lambda p: net.arb[p])
        else:
            tid = net.snap(spec['main'], spec['take'][0], spec['take'][1], tol_km)
        path, tot = net.walk_up(tid, run_km)
        start = path[0]
    t_end = ends(net.fl.geom[path[-1]])[1]
    takeout = (t_end[1], t_end[0])
    outlet = path[-1]
    if spec.get('basin_until'):  # the trip ends on a bigger river: the basin stops at this river's mouth
        keep_names = set(spec['basin_until'])
        idx = [i for i, p in enumerate(path) if net.fl.name[p] in keep_names]
        outlet = path[idx[-1]]
    o_end = ends(net.fl.geom[outlet])[1]
    if outlet != path[-1]:
        print(f'  basin ends at the mouth of the {net.fl.name[outlet]}', flush=True)
    pi0 = ends(net.fl.geom[path[0]])[0]
    msg = f'{rid}: put-in ({pi0[1]:.4f}, {pi0[0]:.4f}) on "{net.fl.name[start]}", run {tot:.1f} km against the guide\'s {run_km:.1f} km'
    msg += f', take-out ({takeout[0]:.4f}, {takeout[1]:.4f})'
    if 'check' in spec:
        msg += f', {hav(takeout, spec["check"]):.1f} km from the reference point'
    if abs(tot - run_km) / run_km > 0.12:
        msg += '   <-- run length differs by more than 12%'
    print(msg, flush=True)

    seen = net.upstream(outlet)
    ids = list(seen)
    fl = net.fl.loc[ids]
    arb = np.array([net.arb[p] for p in ids])
    out_arb = net.arb[outlet]
    print(f'  {len(seen):,} upstream flowlines, {out_arb:,.0f} km of channel above the take-out', flush=True)

    # ---- basin outline: HUC12 watersheds that hold upstream channels
    mids = gpd.GeoDataFrame(geometry=[g.interpolate(0.5, normalized=True) if g.geom_type == 'LineString' else g.representative_point() for g in fl.geom.values], crs=4269)
    h12s, wbs = [], []
    for h, f in net.wbfiles:
        h12s.append(gpd.read_file(f, layer='WBDHU12', columns=['huc12', 'name', 'areasqkm']).to_crs(4269))
        wbs.append(gpd.read_file(f, layer='NHDWaterbody', columns=['permanent_identifier', 'gnis_name', 'areasqkm', 'ftype', 'fcode']).to_crs(4269))
    h12 = pd.concat(h12s).drop_duplicates('huc12')
    h12 = gpd.GeoDataFrame(h12, geometry='geometry', crs=4269)
    j = gpd.sjoin(mids, h12[['huc12', 'geometry']], how='inner', predicate='within')
    hs = h12[h12.huc12.isin(set(j.huc12))]
    basin = unary_union(shapely.make_valid(hs.geometry.values))
    area_km2 = float(hs.areasqkm.sum())
    minx, miny, maxx, maxy = basin.bounds
    diag = hav((miny, minx), (maxy, maxx))
    tol = max(0.0004, (maxx - minx + maxy - miny) / 2 * 0.0013)  # degrees; coarser for bigger basins
    print(f'  basin {area_km2:,.0f} km2 from {len(hs)} HUC12s, {diag:,.0f} km across, simplify {tol * 111:.2f} km', flush=True)

    # ---- streams: biggest channels first, as many as the point budget allows
    geoms = np.array(fl.geom.values, dtype=object)
    simp = shapely.simplify(geoms, tol)
    npts = shapely.get_num_points(simp)
    budget = int(min(args.points * 2.2, args.points + 22 * diag))  # bigger basins get more points
    o = np.argsort(-arb)
    cum = np.cumsum(npts[o])
    k = int(np.searchsorted(cum, budget)) if cum[-1] > budget else len(o)
    k = max(k, 1)
    sel = np.zeros(len(o), bool)
    sel[o[:k]] = True
    sel[ids.index(outlet)] = True
    ratio = arb / out_arb
    cls = np.where(ratio >= 0.20, 1, np.where(ratio >= 0.05, 2, np.where(ratio >= 0.012, 3, 4)))
    names = [x if isinstance(x, str) and x else None for x in fl.name.values]
    groupd = collections.defaultdict(list)
    for i in np.nonzero(sel)[0]:
        groupd[(names[i], int(cls[i]))].append(simp[i])
    streams, namelist, nameidx = [], [], {}
    namearb = collections.defaultdict(float)
    namelines = collections.defaultdict(list)
    for (nm, c), gs in sorted(groupd.items(), key=lambda kv: kv[0][1]):
        merged = shapely.line_merge(shapely.multilinestrings([ln for g in gs for ln in lines_of(g)]))
        for ln in lines_of(merged):
            if ln.length < tol * 0.6 and c == 4:
                continue
            ni = -1
            if nm:
                ni = nameidx.setdefault(nm, len(namelist))
                if ni == len(namelist):
                    namelist.append(nm)
            streams.append([c, enc(ln.coords), ni])
            if nm:
                namelines[nm].append(ln)
    for i in np.nonzero(sel)[0]:
        if names[i]:
            namearb[names[i]] = max(namearb[names[i]], arb[i])
    labels = []
    for nm, a in sorted(namearb.items(), key=lambda kv: -kv[1])[: args.labels]:
        ln = max(namelines[nm], key=lambda g: g.length)
        p = ln.interpolate(0.5, normalized=True)
        labels.append([nameidx[nm], round(p.y, 4), round(p.x, 4), round(a / out_arb, 4)])
    print(f'  {len(streams)} polylines, {int(npts[sel].sum()):,} points before merging, {len(labels)} river labels', flush=True)

    # ---- the run itself (put-in to take-out along the main stem)
    run_geoms = [net.fl.geom[p] for p in path]
    run = shapely.line_merge(shapely.multilinestrings([ln for g in run_geoms for ln in lines_of(g)]))
    run_lines = [enc(ln.coords) for ln in lines_of(shapely.simplify(run, tol * 0.35))]
    pi = ends(run_geoms[0])[0]
    putin = (pi[1], pi[0])

    # ---- reservoirs and lakes inside the basin, biggest first
    wb = pd.concat(wbs)
    wb = wb[wb.gnis_name.notna() & wb.ftype.isin([390, 436]) & (wb.areasqkm >= args.min_area)]
    wb = gpd.GeoDataFrame(wb, geometry='geometry', crs=4269)
    wb = wb[wb.geometry.representative_point().within(basin)]
    wb = wb.assign(areasqkm=wb.areasqkm.astype(float))
    byname = wb.groupby('gnis_name').areasqkm.sum().sort_values(ascending=False)
    keep_names = list(byname.index[: args.reservoirs])
    for nm in spec.get('reservoirs', []):  # named explicitly in rivers.json
        if nm in set(wb.gnis_name) and nm not in keep_names:
            keep_names.append(nm)
    res, outs = [], {}
    flwb = net.fl[net.fl.wb != 'None']
    for nm in keep_names:
        g = wb[wb.gnis_name == nm]
        rings = []
        for geom in g.geometry:
            for pgn in polys_of(shapely.simplify(shapely.make_valid(geom), tol * 0.4)):
                if pgn.area > (tol * 0.5) ** 2:
                    rings.append(enc(pgn.exterior.coords))
        if not rings:
            continue
        big = g.sort_values('areasqkm', ascending=False).iloc[0]
        c = big.geometry.representative_point()
        rec = {'n': nm, 'a': round(float(byname[nm]), 2), 'c': [round(c.y, 4), round(c.x, 4)], 'p': rings}
        dll = dam_outlet(net, flwb, set(g.permanent_identifier.astype(str)), seen)
        if dll:
            outs[nm] = [round(dll[1], 4), round(dll[0], 4)]
        dn = dam_name(dams, rid, nm)
        if dn and nm in outs:
            rec['dam'] = {'n': dn, 'll': outs[nm]}
        res.append(rec)
    # keep where every reservoir drains out, so dams.json can be applied again later without the network (--dams-only)
    os.makedirs(args.cache, exist_ok=True)
    with open(os.path.join(args.cache, f'outlets-{rid}.json'), 'w') as fh:
        json.dump(outs, fh)
    if args.list_reservoirs:
        print('  reservoirs:')
        for r in res:
            print(f'    {r["n"]:34s} {r["a"]:9.2f} km2  outlet above the run: {"yes" if r["n"] in outs else "no ":3s}  dam: {r.get("dam", {}).get("n", "-")}')

    # ---- context: state lines clipped to the basin's box
    # view box: the basin plus the whole run (a trip can end on a bigger river outside the basin)
    rx0, ry0, rx1, ry1 = shapely.total_bounds(shapely.multilinestrings([ln for ln in lines_of(run)]))
    bbox = [round(min(minx, rx0), 3), round(min(miny, ry0), 3), round(max(maxx, rx1), 3), round(max(maxy, ry1), 3)]
    basin_s = shapely.simplify(basin, tol * 1.2)
    rings = []
    for pgn in polys_of(basin_s):
        if pgn.area > basin_s.area * 0.002:
            rings.append(enc(pgn.exterior.coords))
    data = {
        'v': 1, 'id': rid, 'bbox': bbox, 'area': round(area_km2), 'km': round(out_arb),
        'putin': [round(putin[0], 4), round(putin[1], 4)], 'takeout': [round(takeout[0], 4), round(takeout[1], 4)],
        'run': run_lines, 'basin': rings, 'names': namelist, 'streams': streams, 'labels': labels, 'res': res,
        'src': 'USGS National Hydrography Dataset (HR) and Watershed Boundary Dataset, HU4 ' + ', '.join(net.hu4s),
    }
    if spec.get('basin_until'):
        data['mouth'] = True  # the trip ends on a bigger river, so this is the basin of the river itself, not of the take-out
    out = os.path.join(ROOT, 'data', 'basin', rid + '.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w') as f:
        json.dump(data, f, separators=(',', ':'), ensure_ascii=False)
    print(f'  wrote {out} ({os.path.getsize(out) / 1024:.0f} KB)', flush=True)
    if args.preview:
        preview(data, basin_s, fl, sel, cls, args.preview, rid)


def dam_outlet(net, flwb, wbids, seen):
    """Where the main channel leaves a reservoir: the end of the biggest artificial path inside it that flows to a channel
    outside it. Returns None when that exit lies downstream of the take-out (the dam is not above this river's run)."""
    inside = flwb[flwb.wb.isin(wbids)]
    if inside.empty:
        return None
    ids = set(inside.index)
    best, ba = None, -1.0
    for pid in ids:
        ds = net.down.get(pid, ())
        if not ds or any(d not in ids for d in ds):
            a = net.arb[pid]
            if a > ba:
                best, ba = pid, a
    if best is None or best not in seen:
        return None
    return ends(net.fl.geom[best])[1]


def preview(data, basin, fl, sel, cls, outdir, rid):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    os.makedirs(outdir, exist_ok=True)

    def dec(s):
        out, i, la, lo = [], 0, 0, 0
        while i < len(s):
            vals = []
            for _ in range(2):
                shift = res = 0
                while True:
                    b = ord(s[i]) - 63
                    i += 1
                    res |= (b & 0x1F) << shift
                    shift += 5
                    if b < 0x20:
                        break
                vals.append(~(res >> 1) if res & 1 else res >> 1)
            la += vals[0]
            lo += vals[1]
            out.append((lo / PREC, la / PREC))
        return out

    fig, ax = plt.subplots(figsize=(9, 9))
    for r in data['basin']:
        xs, ys = zip(*dec(r))
        ax.fill(xs, ys, color='#efe9dc', zorder=0)
        ax.plot(xs, ys, color='#b9ad94', lw=0.8, zorder=1)
    for r in data['res']:
        for p in r['p']:
            xs, ys = zip(*dec(p))
            ax.fill(xs, ys, color='#7fa9cf', zorder=2)
        ax.annotate(r['n'], (r['c'][1], r['c'][0]), fontsize=5.5, zorder=6)
        if 'dam' in r:
            ax.plot(r['dam']['ll'][1], r['dam']['ll'][0], 's', color='#222', ms=3.5, zorder=7)
            ax.annotate(r['dam']['n'], (r['dam']['ll'][1], r['dam']['ll'][0]), fontsize=5, color='#7a2a10', xytext=(3, -6), textcoords='offset points', zorder=7)
    lw = {1: 2.4, 2: 1.5, 3: 0.9, 4: 0.5}
    for c, p, ni in data['streams']:
        xs, ys = zip(*dec(p))
        ax.plot(xs, ys, color='#2b6c99' if c < 4 else '#6aa0c8', lw=lw[c], zorder=3 + (4 - c) * 0.1, solid_capstyle='round')
    for p in data['run']:
        xs, ys = zip(*dec(p))
        ax.plot(xs, ys, color='#c2501b', lw=2.6, zorder=8)
    for ni, la, lo, rk in data['labels'][:30]:
        ax.annotate(data['names'][ni], (lo, la), fontsize=5.5, color='#1d4f73', zorder=9)
    ax.plot(data['putin'][1], data['putin'][0], 'o', color='#c2501b', zorder=10)
    ax.plot(data['takeout'][1], data['takeout'][0], 'D', color='#c2501b', zorder=10)
    la0 = (data['bbox'][1] + data['bbox'][3]) / 2
    ax.set_aspect(1 / math.cos(math.radians(la0)))
    ax.set_title(f'{rid}: {data["area"]:,} km2')
    plt.savefig(os.path.join(outdir, rid + '.png'), dpi=100, bbox_inches='tight')
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('rivers', nargs='*')
    ap.add_argument('--cache', default=os.path.join(ROOT, '.cache', 'basin'))
    ap.add_argument('--preview')
    ap.add_argument('--list-reservoirs', action='store_true')
    ap.add_argument('--points', type=int, default=14000, help='base point budget for stream geometry (per river; scaled up for big basins)')
    ap.add_argument('--labels', type=int, default=40)
    ap.add_argument('--reservoirs', type=int, default=28, help='most reservoirs and lakes to label per river')
    ap.add_argument('--dams-only', action='store_true', help='re-apply dams.json to the files already built (needs the cache from a full run)')
    ap.add_argument('--min-area', type=float, default=0.6, help='smallest reservoir or lake (km2) to consider')
    args = ap.parse_args()
    spec = load_json(os.path.join(HERE, 'rivers.json'))
    groups, rivers = spec['groups'], spec['rivers']
    dams = load_json(os.path.join(HERE, 'dams.json'))
    todo = args.rivers or [r for r in rivers]
    if args.dams_only:
        for rid in todo:
            apply_dams(rid, dams, args.cache)
        write_index()
        return
    # run rivers that share a network back to back so it loads once
    todo.sort(key=lambda r: rivers[r]['net'])
    nets = {}
    for rid in todo:
        build(rid, rivers[rid], groups, dams, nets, args)
    write_index()


def dam_name(dams, rid, reservoir):
    """dams.json maps a reservoir's name to its dam; "<river id>/<name>" entries win, for names shared by unrelated lakes"""
    return dams.get(f'{rid}/{reservoir}') or dams.get(reservoir)


def apply_dams(rid, dams, cache):
    path = os.path.join(ROOT, 'data', 'basin', rid + '.json')
    outs = load_json(os.path.join(cache, f'outlets-{rid}.json'))
    data = load_json(path)
    for r in data['res']:
        r.pop('dam', None)
        dn = dam_name(dams, rid, r['n'])
        if dn and r['n'] in outs:
            r['dam'] = {'n': dn, 'll': outs[r['n']]}
    with open(path, 'w') as f:
        json.dump(data, f, separators=(',', ':'), ensure_ascii=False)
    print(f'{rid}: {sum(1 for r in data["res"] if r.get("dam"))} dams named, {sum(1 for r in data["res"] if r["n"] in outs)} of {len(data["res"])} reservoirs have an outlet above the run')


def write_index():
    """data/basin/index.json: which rivers have a basin map (the app imports it to know when to offer the Basin view)"""
    d = os.path.join(ROOT, 'data', 'basin')
    rivers = {}
    for f in sorted(os.listdir(d)):
        if not f.endswith('.json') or f == 'index.json':
            continue
        j = load_json(os.path.join(d, f))
        rivers[j['id']] = {'area': j['area'], 'lakes': len(j['res']), 'dams': sum(1 for r in j['res'] if r.get('dam'))}
    with open(os.path.join(d, 'index.json'), 'w') as fh:
        json.dump({'rivers': rivers}, fh, indent=1)
        fh.write('\n')
    print(f'index.json: {len(rivers)} rivers')


if __name__ == '__main__':
    main()
