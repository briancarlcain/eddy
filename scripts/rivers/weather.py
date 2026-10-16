#!/usr/bin/env python3
"""Typical weather by time of year for each river, from Open-Meteo's historical archive (ERA5-Land reanalysis).

    python3 scripts/rivers/weather.py            # every river
    python3 scripts/rivers/weather.py yampa      # one river

Writes `climateDoy` into data/rivers/<id>.json (nothing else in the file changes). For the river's `coords` it
downloads daily values for 1991-2020 and, for 53 points a year (every 7th day from 1 Jan), summarises all days within
3 days either side:
  hi / lo       average daily high and low, deg F
  hi90 / lo10   a hot afternoon (90th percentile of highs) and a cold night (10th percentile of lows), deg F
  rain          percent of days with at least 0.04 in (1 mm) of precipitation
  cloud         average cloud cover, percent
This is a model of the weather on a grid roughly 9 km across, not a weather station. Temperature is adjusted to a
height: the average of the river's put-in and take-out (`stats.elev`) when the record has them (`elevFrom: 'river'`),
otherwise the height of the terrain at `coords` (`elevFrom: 'point'`), which for a river whose coords sit on a ridge
can be far from the water. The height used is stored in `elev` (feet) and shown. Rain and cloud are the weakest of the
numbers.

Open-Meteo's free tier has a daily request limit shared by everyone on the same IP address. If a run fails with "Daily
API request limit exceeded", rerun the rivers that are missing `climateDoy` the next day.
"""
import json, sys, time, urllib.request, urllib.parse, datetime, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
Y0, Y1 = 1991, 2020


def get(url, tries=6):
    err = None
    for k in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            err = e
            if e.code == 400:  # a bad request will not improve
                raise RuntimeError(e.read().decode())
            time.sleep(10 * (k + 1))
        except Exception as e:
            err = e
            time.sleep(5 * (k + 1))
    raise RuntimeError(f'{err}')


def pct(vals, p):
    vals = sorted(vals)
    k = (len(vals) - 1) * p
    f = int(k)
    c = min(f + 1, len(vals) - 1)
    return vals[f] + (vals[c] - vals[f]) * (k - f)


def build(rid, r):
    lat, lon = r['coords']
    el = (r.get('stats') or {}).get('elev')
    params = {}
    if el and len(el) == 2:
        params['elevation'] = round((el[0] + el[1]) / 2 / 3.28084)
    q = urllib.parse.urlencode({
        **params,
        'latitude': lat, 'longitude': lon, 'start_date': f'{Y0}-01-01', 'end_date': f'{Y1}-12-31',
        'daily': 'temperature_2m_max,temperature_2m_min,precipitation_sum,cloud_cover_mean',
        'temperature_unit': 'fahrenheit', 'precipitation_unit': 'inch', 'timezone': r.get('tz') or 'auto',
    })
    d = get('https://archive-api.open-meteo.com/v1/archive?' + q)
    day = d['daily']
    by = {}  # day of year on a non-leap calendar (29 Feb folded into 28 Feb) -> rows
    for i, t in enumerate(day['time']):
        row = (day['temperature_2m_max'][i], day['temperature_2m_min'][i], day['precipitation_sum'][i], day['cloud_cover_mean'][i])
        if row[0] is None or row[1] is None:
            continue
        dt = datetime.date.fromisoformat(t)
        k = datetime.date(2001, dt.month, min(dt.day, 28) if dt.month == 2 else dt.day).timetuple().tm_yday - 1
        by.setdefault(k, []).append(row)
    out = {k: [] for k in ('hi', 'lo', 'hi90', 'lo10', 'rain', 'cloud')}
    for start in range(0, 365, 7):
        pool = []
        for off in range(-3, 4):
            pool += by.get((start + off) % 365, [])
        his = [x[0] for x in pool]
        los = [x[1] for x in pool]
        wet = [x for x in pool if x[2] is not None]
        cl = [x[3] for x in pool if x[3] is not None]
        out['hi'].append(round(sum(his) / len(his)))
        out['lo'].append(round(sum(los) / len(los)))
        out['hi90'].append(round(pct(his, .9)))
        out['lo10'].append(round(pct(los, .1)))
        out['rain'].append(round(100 * sum(1 for x in wet if x[2] >= 0.04) / len(wet)) if wet else None)
        out['cloud'].append(round(sum(cl) / len(cl)) if cl else None)
    return {
        'lat': lat, 'lon': lon,
        'elev': round(d.get('elevation', 0) * 3.28084 / 50) * 50,
        'elevFrom': 'river' if params else 'point',
        'years': [Y0, Y1],
        'source': 'Open-Meteo historical weather archive (ERA5-Land reanalysis, about 9 km grid), daily values 1991 to 2020',
        **out,
    }


def main():
    named = [a for a in sys.argv[1:] if not a.startswith('-')]
    force = '--force' in sys.argv
    ids = named or sorted(f[:-5] for f in os.listdir(os.path.join(ROOT, 'data', 'rivers')) if f.endswith('.json'))
    for rid in ids:
        path = os.path.join(ROOT, 'data', 'rivers', rid + '.json')
        raw = open(path).read()
        d = json.loads(raw)
        if 'climateDoy' in d and not force:
            continue  # already done; --force to redo
        try:
            res = build(rid, d)
        except Exception as e:
            print(f'{rid}: FAILED {e}')
            continue
        d['climateDoy'] = res
        indent = 2 if raw.startswith('{\n  "') else None
        with open(path, 'w') as f:
            f.write(json.dumps(d, ensure_ascii=False, indent=indent) + ('\n' if raw.endswith('\n') else ''))
        e = (d.get('stats') or {}).get('elev')
        print(f"{rid}: {res['elev']} ft from {res['elevFrom']} (river {e[0] if e else '?'}-{e[1] if e else '?'}); 27 Dec {res['lo'][51]}/{res['hi'][51]}F; mid-May {res['lo'][19]}/{res['hi'][19]}F rain {res['rain'][19]}% cloud {res['cloud'][19]}%")
        time.sleep(2)


if __name__ == '__main__':
    main()
