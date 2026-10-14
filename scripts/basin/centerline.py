#!/usr/bin/env python3
"""Builds data/geo/nhd/<river>.json: a river's centerline for the Topo map, with the guide's river miles pinned to it.

The line is the USGS National Hydrography Dataset main stem along the trip's run (the same network scripts/basin/build.py
traces; see rivers.json). Miles come from the guide: every rapid, camp, landmark, access point and hike that has a river
mile and shares its name with a USGS Geographic Names (GNIS) feature that sits on the line (a rapid, falls, bar, or the
mouth of a creek) is a known point. The script finds the chain of those points that runs downstream in mile order and
keeps the mile -> position fit consistent, then writes the line cut to the guide's put-in and take-out with those points
as mile marks. `npm run geo -- <river>` turns the file into data/geo/<river>.json (positions, camp horizons).

  python3 scripts/basin/centerline.py                      # every river in rivers.json except those with DEM anchors
  python3 scripts/basin/centerline.py rogue --preview /tmp/p
  python3 scripts/basin/centerline.py --cache .cache/basin  # NHD packages and GNIS files live here (same as build.py)

GNIS: https://prd-tnm.s3.amazonaws.com/StagedProducts/GeographicNames/DomesticNames/DomesticNames_<ST>_Text.zip
"""
import argparse, collections, importlib.util, json, math, os, re, sys, urllib.request, warnings, zipfile

import numpy as np
import pandas as pd
import shapely

warnings.filterwarnings('ignore')
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
_spec = importlib.util.spec_from_file_location('basin_build', os.path.join(HERE, 'build.py'))
bb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bb)

MI = 1.609344
STATES = ['AZ', 'CA', 'CO', 'ID', 'MT', 'NM', 'NV', 'OR', 'UT', 'WA', 'WY']
GNIS = 'https://prd-tnm.s3.amazonaws.com/StagedProducts/GeographicNames/DomesticNames/DomesticNames_%s_Text.zip'
# features that sit on the river itself (a creek's coordinates are its mouth)
CLASSES = {'Rapids', 'Falls', 'Stream', 'Bar', 'Bend', 'Beach', 'Island', 'Channel', 'Gut', 'Cape', 'Pillar', 'Arch', 'Cliff'}
EXTEND_KM = (40.0, 120.0)  # walk this far past both ends of the run, so a put-in guess that is off still finds the real one
NEAR_KM = 1.0  # a GNIS point must lie within this of the line
SIMPLIFY_M = 6.0


def load_gnis(cache):
    pk = os.path.join(cache, 'gnis-points.pkl')
    if os.path.exists(pk):
        return pd.read_pickle(pk)
    frames = []
    for st in STATES:
        txt = os.path.join(cache, f'gnis_{st}', 'Text', f'DomesticNames_{st}.txt')
        if not os.path.exists(txt):
            os.makedirs(os.path.dirname(os.path.dirname(txt)), exist_ok=True)
            zp = os.path.join(cache, f'DomesticNames_{st}_Text.zip')
            print(f'  downloading GNIS {st} ...', flush=True)
            urllib.request.urlretrieve(GNIS % st, zp)
            with zipfile.ZipFile(zp) as z:
                z.extractall(os.path.join(cache, f'gnis_{st}'))
        df = pd.read_csv(txt, sep='|', usecols=['feature_name', 'feature_class', 'prim_lat_dec', 'prim_long_dec'], dtype=str, encoding_errors='replace')
        df = df[df.feature_class.isin(CLASSES)]
        frames.append(pd.DataFrame({'name': df.feature_name.values, 'cls': df.feature_class.values,
                                    'lat': df.prim_lat_dec.astype(float).values, 'lon': df.prim_long_dec.astype(float).values}))
    out = pd.concat(frames).dropna().drop_duplicates()
    out.to_pickle(pk)
    return out


def norm(n):
    n = n.lower().replace('&', ' and ')
    n = re.sub(r'\([^)]*\)', ' ', n)
    n = re.sub(r'[^a-z0-9 ]', ' ', n)
    n = re.sub(r'\b(rapids|rapid|riffles|riffle)\b', 'rapid', n)
    n = re.sub(r'\b(camp|campground|camps|boat ramp|ramp|launch|put in|take out|trailhead|hot springs|ranch)\b', ' ', n)
    n = re.sub(r'\b(the|of)\b', ' ', n)
    return ' '.join(n.split())


class Line:
    """A polyline in flow order with cumulative distance (km)."""

    def __init__(self, coords):
        self.ll = np.array(coords)  # lat, lon
        d = [0.0]
        for i in range(1, len(coords)):
            d.append(d[-1] + bb.hav(coords[i - 1], coords[i]))
        self.cum = np.array(d)
        self.n = len(coords)

    def project(self, lat, lon):
        """(distance to the line in km, distance along it in km)"""
        k = math.cos(math.radians(lat))
        ax, ay = self.ll[:-1, 1] * k, self.ll[:-1, 0]
        bx, by = self.ll[1:, 1] * k, self.ll[1:, 0]
        vx, vy = bx - ax, by - ay
        px, py = lon * k, lat
        t = np.clip(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy + 1e-18), 0, 1)
        d = np.hypot(px - (ax + vx * t), py - (ay + vy * t)) * 111.0
        i = int(np.argmin(d))
        return float(d[i]), float(self.cum[i] + t[i] * (self.cum[i + 1] - self.cum[i]))

    def at(self, s):
        s = min(max(s, 0.0), self.cum[-1])
        i = int(np.searchsorted(self.cum, s, side='right')) - 1
        i = min(max(i, 0), self.n - 2)
        f = (s - self.cum[i]) / ((self.cum[i + 1] - self.cum[i]) or 1)
        return (self.ll[i, 0] + (self.ll[i + 1, 0] - self.ll[i, 0]) * f, self.ll[i, 1] + (self.ll[i + 1, 1] - self.ll[i, 1]) * f)


def run_line(net, spec, rid, run_km, extend):
    path, tot, start = bb.find_run(rid, spec, run_km, net)
    up, _ = net.walk_up(path[0], extend + net.fl.km[path[0]])
    dn, _ = net.walk(path[-1], net.fl.km[path[-1]] + extend)
    full = up[:-1] + path + dn[1:]
    coords = []
    for p in full:
        for ln in bb.lines_of(net.fl.geom[p]):
            cs = [(c[1], c[0]) for c in ln.coords]
            if coords and abs(coords[-1][0] - cs[0][0]) < 1e-6 and abs(coords[-1][1] - cs[0][1]) < 1e-6:
                cs = cs[1:]
            coords += cs
    s_run0 = float(sum(net.fl.km[p] for p in up[:-1]))
    return Line(coords), s_run0, tot


def candidates(river, line, gn):
    """(item, mile, s km along the line, distance km, GNIS class) for every guide item matching a GNIS point on the line"""
    lat0, lat1 = line.ll[:, 0].min() - 0.03, line.ll[:, 0].max() + 0.03
    lon0, lon1 = line.ll[:, 1].min() - 0.03, line.ll[:, 1].max() + 0.03
    g = gn[(gn.lat > lat0) & (gn.lat < lat1) & (gn.lon > lon0) & (gn.lon < lon1)]
    byname = collections.defaultdict(list)
    for r in g.itertuples():
        byname[norm(r.name)].append(r)
    out, seen = [], set()
    for kind in ('rapids', 'landmarks', 'access', 'camps', 'hikes'):
        for it in river.get(kind, []):
            if it.get('mile') is None:
                continue
            for key in {norm(it['name']), norm(re.sub(r'\b(creek|cr)\b', 'creek', it['name']))}:
                for r in byname.get(key, ()):
                    d, s = line.project(r.lat, r.lon)
                    if d <= NEAR_KM and (it['name'], it['mile'], round(s, 2)) not in seen:
                        seen.add((it['name'], it['mile'], round(s, 2)))
                        out.append((f'{kind}:{it["name"]}@{it["mile"]}', float(it['mile']), s, d, r.cls))
    return out


def chain(cands, b0, band_km):
    """The longest downstream chain of matches (mile and position both increasing, local scale within a loose range of
    the global one); each extra point in the chain pins the mile scale more tightly."""
    cs = sorted(cands, key=lambda c: (c[1], c[2]))
    n = len(cs)
    best = [1.0] * n
    prev = [-1] * n
    for j in range(n):
        for i in range(j):
            dm = cs[j][1] - cs[i][1]
            ds = cs[j][2] - cs[i][2]
            if dm < 0.5 or ds <= 0:
                continue
            sl = ds / dm / b0
            if not 0.6 <= sl <= 1.6:
                continue
            v = best[i] + 1.0 - 0.3 * min(1.0, abs(sl - 1.0))
            if v > best[j]:
                best[j], prev[j] = v, i
    if not n:
        return []
    j = int(np.argmax(best))
    out = []
    while j >= 0:
        out.append(cs[j])
        j = prev[j]
    return out[::-1]


def global_fit(cands, M, nominal=MI):
    """s = a + b * mile through the bulk of the matches (random pairs, count points within a band)"""
    m = np.array([c[1] for c in cands])
    s = np.array([c[2] for c in cands])
    n = len(m)
    rng = np.random.default_rng(7)
    best, bscore = None, -1
    for _ in range(min(30000, n * n)):
        i, j = rng.integers(0, n, 2)
        dm = m[j] - m[i]
        if dm < max(1.0, 0.12 * M):
            continue
        b = (s[j] - s[i]) / dm
        if not 0.9 * nominal <= b <= 1.1 * nominal:
            continue
        a = s[i] - b * m[i]
        r = np.abs(s - (a + b * m))
        score = int((r < 1.0).sum())
        if score > bscore:
            best, bscore = (a, b), score
    if best is None:
        return None
    a, b = best
    for _ in range(3):
        r = np.abs(s - (a + b * m))
        k = r < max(0.7, 2.5 * np.sqrt(np.mean(r[r < 1.5] ** 2)) if (r < 1.5).any() else 0.7)
        if k.sum() < 2:
            break
        b, a = np.polyfit(m[k], s[k], 1)
    return a, b, bscore


def thin(points, min_mi=0.8):
    """keep a point only when it is far enough from the last kept one and the scale between them stays sane"""
    out = []
    for p in points:
        if not out or (p[1] - out[-1][1] >= min_mi and p[2] > out[-1][2]):
            out.append(p)
    return out


def build_line(line, marks_s, s0, s1):
    """the line from s0 to s1 with a vertex at every marks_s position, simplified between marks.
    -> (pts [(lat, lon)], vertex index of each position in marks_s)"""
    stops = [s0] + [s for s in marks_s if s0 < s < s1] + [s1]
    pts, idx = [], []
    k = math.cos(math.radians(line.ll[:, 0].mean()))
    for a, b in zip(stops[:-1], stops[1:]):
        inner = [(float(la), float(lo)) for la, lo, c in zip(line.ll[:, 0], line.ll[:, 1], line.cum) if a < c < b]
        seg = [line.at(a)] + inner + [line.at(b)]
        xy = shapely.linestrings([(lo * 111320 * k, la * 110540) for la, lo in seg])
        simp = shapely.simplify(xy, SIMPLIFY_M)
        sc = np.array(shapely.get_coordinates(simp))
        seg2 = [(y / 110540, x / (111320 * k)) for x, y in sc]
        if pts:
            seg2 = seg2[1:]
        pts += seg2
        idx.append(len(pts) - 1)
    first = 0
    return pts, [first] + idx


def encode_line(pts, marks, offset=40):
    out, la, lo = [], 0, 0
    for lat, lon in pts:
        a, b = round(lat * 1e5), round(lon * 1e5)
        out += [a - la, b - lo]
        la, lo = a, b
    return {'v': 1, 'pts': out, 'marks': marks, 'offset': offset}


def solve(rid, spec, net, gn, args, extend):
    river = bb.load_json(os.path.join(ROOT, 'data', 'rivers', rid + '.json'))
    M = river['miles'][1] - river['miles'][0]
    run_km = spec.get('run_mi', M) * MI
    line, s_run0, tot = run_line(net, spec, rid, run_km, extend)
    cands = candidates(river, line, gn)
    note = []
    fit = global_fit(cands, M) if len(cands) >= 3 else None
    ch = []
    if fit:
        a, b, score = fit
        near = [c for c in cands if abs(c[2] - (a + b * c[1])) < 4.0]
        ch = thin(chain(near, b, 4.0))
    covers = (ch[-1][1] - ch[0][1]) / M if len(ch) >= 2 else 0
    if args.debug:
        kept = {c[0] + str(round(c[2], 2)) for c in ch}
        print(f'    line {line.cum[-1]:.1f} km; the basin run starts at {s_run0:.1f} km and is {tot:.1f} km long; global fit {fit}')
        for c in sorted(cands, key=lambda c: (c[1], c[2])):
            print(f'    {"*" if c[0] + str(round(c[2], 2)) in kept else " "} mile {c[1]:6.1f}  s {c[2]:7.2f} km  d {c[3]:.2f}  {c[4]:8s} {c[0]}')
    if len(ch) >= 4 and covers >= 0.3:
        ms = np.array([c[1] for c in ch]) - river['miles'][0]
        ss = np.array([c[2] for c in ch])
        b, a = np.polyfit(ms, ss, 1)
        res = ss - (a + b * ms)
        rms = float(np.sqrt(np.mean(res ** 2)))
        # ends: carry on at the global scale from the outermost matches
        s_start = ss[0] - b * ms[0]
        s_end = ss[-1] + b * (M - ms[-1])
        marks = [(river['miles'][0], s_start)] + [(float(c[1]), float(c[2])) for c in ch] + [(river['miles'][1], s_end)]
        method = 'gnis'
    else:
        b, rms = run_km / M, None
        s_start, s_end = s_run0, s_run0 + run_km
        marks = [(river['miles'][0], s_start), (river['miles'][1], s_end)]
        method = 'length'
        note.append(f'only {len(ch)} usable matches: put-in and take-out by run length')
    total = float(line.cum[-1])
    return dict(river=river, M=M, run_km=run_km, line=line, s_run0=s_run0, tot=tot, cands=cands, ch=ch, covers=covers, rms=rms, b=b,
                s_start=s_start, s_end=s_end, marks=marks, method=method, note=note, total=total)


def make(rid, spec, net, gn, args):
    for extend in EXTEND_KM:
        r = solve(rid, spec, net, gn, args, extend)
        if r['method'] != 'gnis' or (r['s_start'] >= 0 and r['s_end'] <= r['total']):
            break
    river, M, line, s_run0, tot = r['river'], r['M'], r['line'], r['s_run0'], r['tot']
    cands, ch, covers, rms, b, method, note = r['cands'], r['ch'], r['covers'], r['rms'], r['b'], r['method'], r['note']
    s_start, s_end, marks = r['s_start'], r['s_end'], r['marks']
    total = r['total']
    if s_start < 0 or s_end > total:
        note.append(f'ends fall outside the traced line ({s_start:.1f}..{s_end:.1f} of {total:.1f} km)')
        s_start, s_end = max(s_start, 0.0), min(s_end, total)
    m_start = marks[0][0] + (s_start - marks[0][1]) / b  # mile at the (possibly clipped) first vertex
    m_end = marks[-1][0] - (marks[-1][1] - s_end) / b
    mm = [(m_start, s_start)] + [m for m in marks[1:-1] if s_start < m[1] < s_end] + [(m_end, s_end)]
    pts, vidx = build_line(line, [m[1] for m in mm[1:-1]], s_start, s_end)
    mark_list = [[vidx[i], round(float(m[0]), 3)] for i, m in enumerate(mm)]
    # the last mark must be the final vertex
    mark_list[-1][0] = len(pts) - 1
    geo = encode_line(pts, mark_list, river.get('geoOffset', 40))
    out = os.path.join(ROOT, 'data', 'geo', 'nhd', rid + '.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w') as f:
        json.dump({**geo, 'source': 'USGS National Hydrography Dataset main stem; miles pinned with USGS GNIS points (' + method + ')'}, f, separators=(',', ':'))
        f.write('\n')
    put = line.at(s_start)
    take = line.at(s_end)
    walk0 = line.at(s_run0)
    print(f'{rid}: {method}, {len(cands)} matches, chain {len(ch)} ({covers * 100:.0f}% of the miles), scale {b / MI * 100:.1f}% of 1.609 km/mi'
          + (f', residual rms {rms:.2f} km' if rms is not None else '') + f', {len(pts)} points, {os.path.getsize(out) / 1024:.0f} KB')
    print(f'    put-in {put[0]:.4f}, {put[1]:.4f} ({bb.hav(put, walk0):.1f} km from the basin put-in); take-out {take[0]:.4f}, {take[1]:.4f}; line {(s_end - s_start) / MI:.1f} mi for {M:g} guide miles')
    for n in note:
        print('    NOTE', n)
    if args.preview:
        preview(rid, line, cands, ch, pts, args.preview)
    return {'id': rid, 'method': method, 'matches': len(cands), 'chain': len(ch), 'covers': covers, 'rms': rms}


def preview(rid, line, cands, ch, pts, outdir):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    os.makedirs(outdir, exist_ok=True)
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(14, 6))
    a1.plot(line.ll[:, 1], line.ll[:, 0], color='#9bb', lw=2)
    p = np.array(pts)
    a1.plot(p[:, 1], p[:, 0], color='#c0392b', lw=1)
    for c in ch:
        la, lo = line.at(c[2])
        a1.plot(lo, la, 'o', color='#222', ms=3)
    a1.set_aspect(1 / math.cos(math.radians(p[:, 0].mean())))
    a1.set_title(f'{rid}: line and mile marks')
    ms = np.array([c[1] for c in cands]); ss = np.array([c[2] for c in cands])
    a2.plot(ms, ss, '.', color='#bbb')
    a2.plot([c[1] for c in ch], [c[2] for c in ch], 'o-', color='#c0392b', ms=3)
    a2.set_xlabel('guide mile'); a2.set_ylabel('km along line'); a2.set_title('matches (grey) and the chain kept (red)')
    fig.savefig(os.path.join(outdir, f'centerline-{rid}.png'), dpi=80, bbox_inches='tight')
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('rivers', nargs='*')
    ap.add_argument('--cache', default=os.path.join(ROOT, '.cache', 'basin'))
    ap.add_argument('--preview')
    ap.add_argument('--debug', action='store_true', help='print every match and the chain kept')
    args = ap.parse_args()
    spec = bb.load_json(os.path.join(HERE, 'rivers.json'))
    anchors = bb.load_json(os.path.join(ROOT, 'data', 'geo', 'anchors.json'))
    todo = args.rivers or [r for r in spec['rivers'] if r not in anchors]
    todo.sort(key=lambda r: spec['rivers'][r]['net'])
    gn = load_gnis(args.cache)
    nets = {}
    results = []
    for rid in todo:
        sp = spec['rivers'][rid]
        if sp['net'] not in nets:
            nets.clear()
            print(f'loading network "{sp["net"]}" ...', flush=True)
            nets[sp['net']] = bb.Net(spec['groups'][sp['net']], args.cache)
        results.append(make(rid, sp, nets[sp['net']], gn, args))
    weak = [r['id'] for r in results if r['method'] != 'gnis']
    if weak:
        print('by length only (check by eye):', ', '.join(weak))


if __name__ == '__main__':
    main()
