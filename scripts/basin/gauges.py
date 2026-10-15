#!/usr/bin/env python3
"""Adds the USGS stream gauges inside each basin to data/basin/<river>.json (key `gauges`).

Source: USGS National Water Information System site service (waterservices.usgs.gov/nwis/site), active stream sites
that report discharge (00060) in real time. Only gauges whose point falls inside the basin outline are kept, and small
creeks are dropped (--min-area, square miles of drainage; by default 0.2% of the basin, between 10 and 250) so the map stays readable; any gauge the guide itself names
for the river (data/rivers/<id>.json: stats.gauges, flowDoy.gauges) is always kept. Each gauge is
[site number, station name, lat, lon, drainage area in sq mi or null]. Run after scripts/basin/build.py (which rewrites
those files without `gauges`):  python3 scripts/basin/gauges.py [river ...]   (standard library only)
"""
import argparse, json, math, os, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
URL = 'https://waterservices.usgs.gov/nwis/site/?format=rdb&siteType=ST&parameterCd=00060&hasDataTypeCd=iv&siteStatus=active&siteOutput=expanded&bBox=%s'
PREC = 1e4


def dec(s):
    out, i, la, lo = [], 0, 0, 0
    while i < len(s):
        vals = []
        for _ in range(2):
            r = sh = 0
            while True:
                b = ord(s[i]) - 63
                i += 1
                r |= (b & 31) << sh
                sh += 5
                if b < 32:
                    break
            vals.append(~(r >> 1) if r & 1 else r >> 1)
        la += vals[0]
        lo += vals[1]
        out.append((la / PREC, lo / PREC))
    return out


def inside(pt, ring):
    y, x = pt
    c = False
    for i in range(len(ring)):
        (y1, x1), (y2, x2) = ring[i - 1], ring[i]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def fetch(box, cache):
    key = os.path.join(cache, 'sites_%s.rdb' % box.replace(',', '_'))
    if os.path.exists(key):
        return open(key, encoding='utf-8').read()
    for attempt in range(4):
        try:
            with urllib.request.urlopen(URL % box, timeout=120) as r:
                txt = r.read().decode('utf-8')
            open(key, 'w', encoding='utf-8').write(txt)
            return txt
        except Exception as e:  # 404 means no sites in this box
            if getattr(e, 'code', 0) == 404:
                return ''
            time.sleep(2 ** attempt)
    raise RuntimeError('could not fetch ' + box)


def sites(txt):
    rows = [l.split('\t') for l in txt.splitlines() if l and not l.startswith('#')]
    if len(rows) < 3:
        return
    head = rows[0]
    for r in rows[2:]:
        d = dict(zip(head, r))
        try:
            yield d['site_no'], d['station_nm'], float(d['dec_lat_va']), float(d['dec_long_va']), d.get('drain_area_va', '')
        except (KeyError, ValueError):
            pass


def nice(n):
    # NWIS names are upper case ("GUNNISON RIVER AT DELTA, CO."); title-case them, keeping the state and fork letters
    ws = n.rstrip('.').split(' ')
    out = []
    for i, w in enumerate(ws):
        bare = w.rstrip(',')
        tail = w[len(bare):]
        if bare in STATES and (tail or i == len(ws) - 1):
            out.append(w)
        elif bare in ('MF', 'NF', 'SF', 'EF', 'WF', 'FK'):
            out.append(w)
        elif bare in ('AT', 'NR', 'BL', 'BLW', 'AB', 'ABV', 'NEAR', 'BELOW', 'ABOVE', 'AND', 'OF', 'THE', 'IN', 'ON', 'TO', 'FROM'):
            out.append(w.lower())
        else:
            out.append('-'.join(p.capitalize() for p in w.split('-')))
    s = ' '.join(out)
    return s[:1].upper() + s[1:]


STATES = set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC BC YT AB SK'.split())


def guide_gauges(rid):
    p = os.path.join(ROOT, 'data', 'rivers', rid + '.json')
    if not os.path.exists(p):
        return set()
    d = json.load(open(p, encoding='utf-8'))
    out = set()
    for src in ((d.get('stats') or {}).get('gauges') or [], (d.get('flowDoy') or {}).get('gauges') or []):
        for g in src:
            if g.get('id'):
                out.add(g['id'])
    return out


def run(rid, min_area, cache):
    p = os.path.join(ROOT, 'data', 'basin', rid + '.json')
    data = json.load(open(p, encoding='utf-8'))
    if min_area is None:  # 0.2% of the basin, so a small basin still gets pins and the Colorado does not get a thousand
        min_area = min(250.0, max(10.0, round(data['area'] / 2.589988 * 0.002)))
    rings = [dec(r) for r in data['basin']]
    w, s, e, n = data['bbox']
    keep, seen = [], set()
    must = guide_gauges(rid)
    step = 4.0
    la = math.floor(s)
    while la < n:
        lo = math.floor(w)
        while lo < e:
            box = '%.5f,%.5f,%.5f,%.5f' % (lo, la, lo + step, la + step)
            for sid, name, y, x, da in sites(fetch(box, cache)):
                if sid in seen:
                    continue
                seen.add(sid)
                if not any(inside((y, x), r) for r in rings):
                    continue
                try:
                    area = round(float(da), 1)
                except ValueError:
                    area = None
                if sid in must or (area is not None and area >= min_area):
                    keep.append([sid, nice(name), round(y, 5), round(x, 5), area])
            lo += step
        la += step
    keep.sort(key=lambda g: -(g[4] or 0))
    data['gauges'] = keep
    json.dump(data, open(p, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
    print('%-22s %4d gauges in the basin outline (%d examined, drainage >= %g sq mi or named in the guide)' % (rid, len(keep), len(seen), min_area))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('rivers', nargs='*')
    ap.add_argument('--min-area', type=float, help='smallest drainage area (sq mi) to show; default 0.2%% of the basin, between 10 and 250; gauges the guide names are always kept')
    ap.add_argument('--cache', default=os.path.join(ROOT, '.cache', 'basin'))
    a = ap.parse_args()
    os.makedirs(a.cache, exist_ok=True)
    todo = a.rivers or sorted(f[:-5] for f in os.listdir(os.path.join(ROOT, 'data', 'basin')) if f.endswith('.json') and f != 'index.json')
    for rid in todo:
        run(rid, a.min_area, a.cache)


if __name__ == '__main__':
    main()
