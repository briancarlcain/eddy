#!/usr/bin/env python3
"""Typical flow by time of year for each river, from USGS daily mean discharge (parameter 00060).

    python3 scripts/rivers/flows.py            # every river in GAUGES
    python3 scripts/rivers/flows.py yampa      # one river

Writes `flowDoy` into data/rivers/<id>.json (nothing else in the file changes). For 53 points a year (every 7th
day, starting 1 Jan) it stores the 25th, 50th and 75th percentile of all daily means within 3 days either side,
across every full year in `from`..last complete year. Rivers that sit below a dam use a `from` year after the dam
(or after the current operating regime began), so the numbers describe the river as it is run now.

The gauge for each river is chosen by hand below. Where the gauge is not on the run itself, `where` says so and the
app shows that. Leave a river out of GAUGES rather than guess: it then shows no flow data.
"""
import json, sys, time, urllib.request, datetime, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
LAST_YEAR = datetime.date.today().year - 1
MIN_DAYS = 300  # a year needs this many daily values to count

# id -> { gauges: [USGS site numbers, summed when more than one], from: first year used,
#         regime: 'natural' | 'regulated', where: how the gauge relates to the run }
GAUGES = {
    'bruneau-jarbidge': dict(gauges=['13168500'], from_=1960, regime='natural', where='Bruneau River near Hot Spring, ID (below the Jarbidge confluence, on the run). Irrigation diversions upstream.'),
    'cataract-canyon': dict(gauges=['09180500', '09315000'], from_=1970, regime='regulated', where='Colorado River near Cisco plus Green River at Green River, summed: the two rivers that meet at the put-in. Both are regulated by upstream dams.'),
    'deschutes': dict(gauges=['14103000'], from_=1970, regime='regulated', where='Deschutes River at Moody, near Biggs: the bottom of the run. Regulated by the Pelton-Round Butte dams, so flow is fairly steady.'),
    'desolation-gray': dict(gauges=['09315000'], from_=1970, regime='regulated', where='Green River at Green River, UT: the take-out. Regulated by Flaming Gorge Dam.'),
    'dolores': dict(gauges=['09169500'], from_=1986, regime='regulated', where='Dolores River at Bedrock, CO: near the take-out. McPhee Dam holds back most of the runoff, so boatable flows are rare and come only in releases.'),
    'grand-canyon': dict(gauges=['09380000'], from_=1991, regime='regulated', where='Colorado River at Lees Ferry, AZ: the put-in, just below Glen Canyon Dam. Flows swing daily and releases are set monthly.'),
    'green-flaming-gorge': dict(gauges=['09234500'], from_=1970, regime='regulated', where='Green River near Greendale, UT: on the run, just below Flaming Gorge Dam.'),
    'green-labyrinth': dict(gauges=['09315000'], from_=1970, regime='regulated', where='Green River at Green River, UT: the put-in. Regulated by Flaming Gorge Dam.'),
    'hells-canyon': dict(gauges=['13290450'], from_=1970, regime='regulated', where='Snake River at Hells Canyon Dam: the put-in. Released by the dam, so it follows power demand.'),
    'illinois': dict(gauges=['14377100'], from_=1962, regime='natural', where='Illinois River near Kerby, OR: upstream of the run. Free-flowing.'),
    'john-day': dict(gauges=['14046500'], from_=1930, regime='natural', where='John Day River at Service Creek, OR: the put-in. Free-flowing; irrigation takes some water in summer.'),
    'lodore': dict(gauges=['09234500'], from_=1970, regime='regulated', where='Green River near Greendale, UT: upstream of the run, below Flaming Gorge Dam. Browns Park adds a little.'),
    'main-salmon': dict(gauges=['13317000'], from_=1930, regime='natural', where='Salmon River at White Bird, ID: below the take-out, so it also includes the South Fork and Little Salmon and reads higher than the run itself.'),
    'middle-fork-salmon': dict(gauges=['13309220'], from_=1974, regime='natural', where='Middle Fork Salmon River at Middle Fork Lodge: on the run, a day or two in. The river grows below here as creeks join.'),
    'owyhee': dict(gauges=['13181000'], from_=1950, regime='regulated', where='Owyhee River near Rome, OR: on the run. Regulated by Owyhee Dam upstream, but the dam is far enough up that spring runoff still shows.'),
    'rio-chama': dict(gauges=['08286500'], from_=1975, regime='regulated', where='Rio Chama above Abiquiu Reservoir: the take-out. Regulated by El Vado Dam; releases are scheduled for boating in some years.'),
    'rogue': dict(gauges=['14372300'], from_=1978, regime='regulated', where='Rogue River near Agness, OR: the take-out. Regulated by Lost Creek Dam, so summer flows are held up.'),
    'ruby-horsethief': dict(gauges=['09163500'], from_=1970, regime='regulated', where='Colorado River near the Colorado-Utah line: downstream of the run. Upstream dams and diversions change the timing of runoff.'),
    'salt': dict(gauges=['09497500'], from_=1930, regime='natural', where='Salt River near Chrysotile, AZ: on the run, at the Highway 288 end. Free-flowing.'),
    'san-juan': dict(gauges=['09379500'], from_=1970, regime='regulated', where='San Juan River near Bluff, UT: the put-in. Regulated by Navajo Dam upstream.'),
    'selway': dict(gauges=['13336500'], from_=1930, regime='natural', where='Selway River near Lowell, ID: below the take-out, so it reads a little higher than the run itself. Free-flowing.'),
    'smith': dict(gauges=['06077200'], from_=1997, regime='regulated', where='Smith River below Eagle Creek, near Fort Logan, MT: on the run. Mostly free-flowing, with irrigation withdrawals.'),
    'westwater': dict(gauges=['09163500'], from_=1970, regime='regulated', where='Colorado River near the Colorado-Utah line: the put-in. Upstream dams and diversions change the timing of runoff.'),
    'yampa': dict(gauges=['09260050'], from_=1983, regime='natural', where='Yampa River at Deerlodge Park, CO: the put-in, below the Little Snake. Mostly free-flowing. The Green joins at the end of the run.'),
}
# No gauge chosen, on purpose: alsek and tatshenshini (Canadian gauges), tuolumne (flow is a scheduled release from
# Cherry Creek, and the nearby gauges are not on that water), yampa/Deerlodge before 1982.


def get(url, tries=5):
    for k in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return r.read().decode()
        except Exception as e:  # USGS is flaky: 503s and timeouts are routine
            err = e
            time.sleep(4 * (k + 1))
    raise RuntimeError(f'{url}: {err}')


def daily(site, y0, y1):
    """{date: cfs} of daily mean discharge for one site."""
    t = get(f'https://waterservices.usgs.gov/nwis/dv/?format=rdb&sites={site}&parameterCd=00060&statCd=00003'
            f'&startDT={y0}-01-01&endDT={y1}-12-31')
    rows = [l.split('\t') for l in t.splitlines() if l and not l.startswith('#')]
    h = rows[0]
    out = {}
    name = None
    for x in rows[2:]:
        z = dict(zip(h, x))
        v = [z[k] for k in z if k.endswith('_00060_00003')]
        if not v:
            continue
        try:
            out[z['datetime']] = float(v[0])
        except ValueError:
            pass  # ice, equipment malfunction, etc.
    site_t = get(f'https://waterservices.usgs.gov/nwis/site/?format=rdb&sites={site}')
    for l in site_t.splitlines():
        if l.startswith('USGS'):
            name = l.split('\t')[2]
    return out, name


def pct(sorted_vals, p):
    if not sorted_vals:
        return None
    k = (len(sorted_vals) - 1) * p
    f = int(k)
    c = min(f + 1, len(sorted_vals) - 1)
    return sorted_vals[f] + (sorted_vals[c] - sorted_vals[f]) * (k - f)


def build(rid, cfg):
    y0 = cfg['from_']
    series, names = [], []
    for g in cfg['gauges']:
        s, n = daily(g, y0, LAST_YEAR)
        series.append(s)
        names.append({'id': g, 'name': n})
    dates = set(series[0])
    for s in series[1:]:
        dates &= set(s)  # a sum is only valid on days every gauge reported
    vals = {d: sum(s[d] for s in series) for d in dates}
    by_year = {}
    for d in vals:
        by_year[d[:4]] = by_year.get(d[:4], 0) + 1
    years = sorted(y for y, n in by_year.items() if n >= MIN_DAYS)
    use = {d: v for d, v in vals.items() if d[:4] in years}
    if len(years) < 10:
        raise RuntimeError(f'{rid}: only {len(years)} full years of data')
    # day-of-year on a non-leap calendar (29 Feb is folded into 28 Feb) so every year lines up
    doy = {}
    for d, v in use.items():
        dt = datetime.date.fromisoformat(d)
        k = datetime.date(2001, dt.month, min(dt.day, 28 if dt.month == 2 else dt.day)).timetuple().tm_yday - 1
        doy.setdefault(k, []).append(v)
    p25, p50, p75 = [], [], []
    for start in range(0, 365, 7):
        pool = []
        for off in range(-3, 4):
            pool += doy.get((start + off) % 365, [])
        pool.sort()
        p25.append(round(pct(pool, .25)))
        p50.append(round(pct(pool, .50)))
        p75.append(round(pct(pool, .75)))
    return {
        'gauges': names,
        'summed': len(names) > 1,
        'regime': cfg['regime'],
        'where': cfg['where'],
        'years': [int(years[0]), int(years[-1]), len(years)],
        'source': 'USGS National Water Information System, daily mean discharge (00060)',
        'p25': p25, 'p50': p50, 'p75': p75,
    }


def main():
    only = sys.argv[1:] or list(GAUGES)
    for rid in only:
        path = os.path.join(ROOT, 'data', 'rivers', rid + '.json')
        try:
            res = build(rid, GAUGES[rid])
        except Exception as e:
            print(f'{rid}: FAILED {e}')
            continue
        raw = open(path).read()
        d = json.loads(raw)
        d['flowDoy'] = res
        indent = 2 if raw.startswith('{\n  "') else None
        with open(path, 'w') as f:
            f.write(json.dumps(d, ensure_ascii=False, indent=indent) + ('\n' if raw.endswith('\n') else ''))
        y = res['years']
        print(f"{rid}: {y[2]} years ({y[0]}-{y[1]}); mid-May p50 {res['p50'][19]}, mid-Dec p50 {res['p50'][49]} cfs  [{', '.join(g['name'] or g['id'] for g in res['gauges'])}]")


if __name__ == '__main__':
    main()
