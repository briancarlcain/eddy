// The sky from one spot: the terrain skyline (horizon profile) with the day's sun path over it. Where the path
// is above the skyline the spot has direct sun; where it dips behind, shade. Optional `at` marks a moment.
import React, { useMemo } from 'react';
import { sunPos, horizonAt, localMidnight } from './geo/sun.js';

const W = 340, H = 150, PL = 26, PR = 8, PT = 8, PB = 22;

export default function SunChart({ h, lat, lon, iso, tz, at }) {
  const d = useMemo(() => {
    const t0 = localMidnight(iso, tz);
    const path = [];
    for (let m = 0; m <= 1440; m += 5) {
      const t = new Date(t0 + m * 60000);
      const p = sunPos(t, lat, lon);
      if (p.alt > -2) path.push({ t, m, ...p, lit: p.alt > horizonAt(h, p.az) - 0.27 && p.alt > -0.27 });
    }
    if (!path.length) return null;
    const az0 = Math.max(0, Math.floor((Math.min(...path.map((p) => p.az)) - 20) / 10) * 10);
    const az1 = Math.min(360, Math.ceil((Math.max(...path.map((p) => p.az)) + 20) / 10) * 10);
    let top = Math.max(...path.map((p) => p.alt));
    for (let a = az0; a <= az1; a += 2) top = Math.max(top, horizonAt(h, a));
    top = Math.min(90, Math.ceil((top + 5) / 10) * 10);
    return { path, az0, az1, top };
  }, [h, lat, lon, iso, tz]);
  if (!d) return null;
  const { path, az0, az1, top } = d;
  const X = (az) => PL + ((az - az0) / (az1 - az0)) * (W - PL - PR);
  const Y = (alt) => PT + (1 - Math.max(0, alt) / top) * (H - PT - PB);
  let sky = `M${X(az0)},${Y(0)}`;
  for (let a = az0; a <= az1; a += 1) sky += ` L${X(a).toFixed(1)},${Y(horizonAt(h, a)).toFixed(1)}`;
  sky += ` L${X(az1)},${Y(0)} Z`;
  // split the path into lit and shaded runs
  const runs = [];
  for (const p of path) {
    const last = runs[runs.length - 1];
    if (!last || last.lit !== p.lit) runs.push({ lit: p.lit, pts: last ? [last.pts[last.pts.length - 1], p] : [p] });
    else last.pts.push(p);
  }
  const hours = path.filter((p) => p.m % 60 === 0 && p.alt > 0);
  const hourLabel = (t) => {
    const s = t.toLocaleTimeString('en-US', { hour: 'numeric', timeZone: tz });
    return s.replace(/\s?([AP])M/, (_, x) => x.toLowerCase());
  };
  const mark = at ? sunPos(at, lat, lon) : null;
  const compass = { 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 45: 'NE', 315: 'NW' };
  return (
    <svg className="sunChart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sun path against the canyon skyline">
      {[...Array(top / 10 + 1).keys()].map((i) => (
        <g key={i}>
          <line x1={PL} x2={W - PR} y1={Y(i * 10)} y2={Y(i * 10)} className="scGrid" />
          {i % 2 === 0 ? <text x={PL - 4} y={Y(i * 10) + 3} className="scAxis" textAnchor="end">{i * 10}°</text> : null}
        </g>
      ))}
      {Object.entries(compass).filter(([a]) => a >= az0 && a <= az1).map(([a, n]) => (
        <text key={a} x={X(+a)} y={H - 6} className="scAxis" textAnchor="middle">{n}</text>
      ))}
      <path d={sky} className="scTerrain" />
      {runs.map((r, i) => (
        <polyline key={i} points={r.pts.map((p) => `${X(p.az).toFixed(1)},${Y(p.alt).toFixed(1)}`).join(' ')} className={r.lit ? 'scSun' : 'scShade'} />
      ))}
      {hours.map((p) => (
        <g key={p.m}>
          <circle cx={X(p.az)} cy={Y(p.alt)} r="2.2" className={p.lit ? 'scDot' : 'scDotOff'} />
          <text x={X(p.az)} y={Y(p.alt) - 5} className="scHour" textAnchor="middle">{hourLabel(p.t)}</text>
        </g>
      ))}
      {mark && mark.alt > 0 ? <circle cx={X(mark.az)} cy={Y(mark.alt)} r="5" className="scNow" /> : null}
    </svg>
  );
}
