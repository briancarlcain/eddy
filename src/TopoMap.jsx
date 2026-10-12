// Topographic map of the active river: DEM-rendered basemap (tint, hillshade, contours), the traced
// centerline, rapids / camps / hikes at their positions, GPX tracks, a sun-and-shade overlay for any date
// and time, an offline tile download, and tap-to-move for pins.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { demTile, mosaic, mpp, lon2x, lat2y, y2lat, corridorTiles, cachedCount, download } from './geo/dem.js';
import { shadeCanvas } from './geo/shade.js';
import { sunPos, sunDay, localMidnight } from './geo/sun.js';
import { riverLine, position, hikeTrack, onGeoChange } from './geo/index.js';

// --- DEM basemap
const TINT = [
  [0, [196, 214, 178]], [600, [214, 220, 180]], [1000, [228, 220, 186]], [1500, [226, 204, 168]],
  [2000, [214, 186, 152]], [2600, [204, 180, 160]], [3200, [226, 220, 214]], [4200, [250, 250, 250]],
];
function tint(z) {
  if (z <= TINT[0][0]) return TINT[0][1];
  for (let i = 1; i < TINT.length; i++) {
    if (z <= TINT[i][0]) {
      const [z0, a] = TINT[i - 1], [z1, b] = TINT[i], t = (z - z0) / (z1 - z0);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  return TINT[TINT.length - 1][1];
}
const contourStep = (z) => (z <= 9 ? 500 : z === 10 ? 200 : z === 11 ? 100 : z === 12 ? 50 : z === 13 ? 40 : 20);

function paintTile(canvas, t, coords) {
  const g = canvas.getContext('2d');
  const img = g.createImageData(256, 256);
  const lat = y2lat(coords.y + 0.5, coords.z);
  const m = mpp(lat, coords.z);
  const step = contourStep(coords.z);
  // hillshade light from the north-west, 45 degrees up
  const lx = -Math.SQRT1_2 * Math.SQRT1_2, ly = Math.SQRT1_2 * Math.SQRT1_2, lz = Math.SQRT1_2;
  const d = img.data;
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const i = y * 256 + x, z = t[i];
      const zl = t[x > 0 ? i - 1 : i], zr = t[x < 255 ? i + 1 : i], zu = t[y > 0 ? i - 256 : i], zd = t[y < 255 ? i + 256 : i];
      const dzdx = (zr - zl) / ((x > 0 && x < 255 ? 2 : 1) * m), dzdn = (zu - zd) / ((y > 0 && y < 255 ? 2 : 1) * m);
      const n = Math.sqrt(dzdx * dzdx + dzdn * dzdn + 1);
      const hs = Math.max(0, (-dzdx * lx - dzdn * ly + lz) / n);
      const c = tint(z);
      const k = 0.45 + 0.75 * hs;
      let r = c[0] * k, gg = c[1] * k, b = c[2] * k;
      // contour where this cell and its right / lower neighbour fall in different bands
      const band = Math.floor(z / step);
      if ((x < 255 && Math.floor(zr / step) !== band) || (y < 255 && Math.floor(zd / step) !== band)) {
        const index = Math.floor(Math.max(z, Math.min(zr, zd)) / step) % 5 === 0;
        const a = index ? 0.55 : 0.3;
        r = r * (1 - a) + 110 * a; gg = gg * (1 - a) + 72 * a; b = b * (1 - a) + 40 * a;
      }
      d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
    }
  g.putImageData(img, 0, 0);
}

const DemLayer = L.GridLayer.extend({
  createTile(coords, done) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    demTile(coords.z, coords.x, coords.y).then((t) => {
      if (t) paintTile(c, t, coords);
      done(null, c);
    });
    return c;
  },
});

const USGS = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}';
const RELIEF = 1700;
const PIN_ZOOM = 11; // metres: tallest wall we expect a shadow to come from

const fmtTime = (d, tz) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
const todayIn = (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

export default function TopoMap({ rid, river, planned, colors, date: date0, onOpen, picking, onPicked, onCancelPick }) {
  const el = useRef(null);
  const map = useRef(null);
  const layers = useRef({});
  const [base, setBase] = useState('dem');
  const [shadeOn, setShadeOn] = useState(false);
  const [date, setDate] = useState(date0 || todayIn(river.tz));
  const [mins, setMins] = useState(null);
  const [busy, setBusy] = useState('');
  const [panel, setPanel] = useState(null);
  const [rev, setRev] = useState(0);
  const pickRef = useRef(null);
  pickRef.current = picking ? onPicked : null;
  useEffect(() => onGeoChange(() => setRev((r) => r + 1)), []);
  // fill the screen from the map's top edge down to the tab bar
  const [h, setH] = useState(null);
  useEffect(() => {
    const fit = () => {
      if (!el.current) return;
      const nav = document.querySelector('.tabbar')?.getBoundingClientRect().height || 58;
      setH(Math.max(320, Math.round(window.innerHeight - el.current.getBoundingClientRect().top - nav)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  useEffect(() => { if (date0) setDate(date0); }, [date0]);

  const line = useMemo(() => riverLine(rid), [rid]);
  const center = useMemo(() => (line ? line.ll[Math.floor(line.ll.length / 2)] : river.coords), [line, river]);
  const sky = useMemo(() => sunDay(date, center[0], center[1], river.tz, null, 5), [date, center, river.tz]);
  // slider value = minutes after local midnight; default mid-afternoon
  const dayStart = useMemo(() => localMidnight(date, river.tz), [date, river.tz]);
  const lo = sky.rise ? Math.floor((sky.rise.getTime() - dayStart) / 60000) - 10 : 0;
  const hi = sky.set ? Math.ceil((sky.set.getTime() - dayStart) / 60000) + 10 : 1440;
  const cur = mins == null ? Math.min(hi, Math.max(lo, 15 * 60)) : Math.min(hi, Math.max(lo, mins));
  const when = new Date(dayStart + cur * 60000);
  const sp = sunPos(when, center[0], center[1]);

  // --- create the map once
  useEffect(() => {
    const m = L.map(el.current, { zoomControl: false, preferCanvas: true, attributionControl: true, maxZoom: 17, minZoom: 6, zoomSnap: 0.25 });
    // ?ll=lat,lon,zoom deep link to a spot
    const ll = (new URLSearchParams(location.search).get('ll') || '').split(',').map(Number);
    const deep = ll.length === 3 && ll.every(isFinite);
    map.current = m;
    L.control.zoom({ position: 'topright' }).addTo(m);
    m.attributionControl.setPrefix(false);
    layers.current.dem = new DemLayer({ maxZoom: 17, attribution: 'Elevation: USGS 3DEP via AWS Terrain Tiles' });
    layers.current.usgs = L.tileLayer(USGS, { maxZoom: 17, maxNativeZoom: 16, attribution: 'USGS The National Map' });
    layers.current.dem.addTo(m);
    layers.current.marks = L.layerGroup();
    layers.current.overview = L.layerGroup().addTo(m);
    layers.current.tracks = L.layerGroup().addTo(m);
    if (line) {
      layers.current.river = L.polyline(line.ll, { color: '#3a6f92', weight: 3, opacity: 0.85, interactive: false }).addTo(m);
      m.fitBounds(layers.current.river.getBounds(), { padding: [16, 16] });
    } else m.setView(river.coords, 11);
    if (deep) m.setView([ll[0], ll[1]], ll[2]);
    // every pin only once they spread apart; zoomed out, just the trip's camps
    const byZoom = () => {
      const near = m.getZoom() >= PIN_ZOOM;
      if (near && !m.hasLayer(layers.current.marks)) m.addLayer(layers.current.marks);
      if (!near && m.hasLayer(layers.current.marks)) m.removeLayer(layers.current.marks);
    };
    m.on('zoomend', byZoom);
    byZoom();
    m.on('click', (e) => pickRef.current && pickRef.current(e.latlng.lat, e.latlng.lng));
    // the container gets its real size after first layout: refit once it does
    let fitted = false;
    const ro = new ResizeObserver(() => {
      m.invalidateSize();
      if (!fitted && !deep && layers.current.river && el.current.clientHeight > 0) {
        fitted = true;
        m.fitBounds(layers.current.river.getBounds(), { padding: [16, 16] });
      }
    });
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const want = base === 'usgs' ? layers.current.usgs : layers.current.dem;
    const other = base === 'usgs' ? layers.current.dem : layers.current.usgs;
    if (m.hasLayer(other)) m.removeLayer(other);
    if (!m.hasLayer(want)) want.addTo(m).bringToBack();
  }, [base]);

  // --- pins and tracks
  useEffect(() => {
    const g = layers.current.marks, tr = layers.current.tracks, ov = layers.current.overview;
    g.clearLayers(); tr.clearLayers(); ov.clearLayers();
    const add = (kind, it, style, into = g) => {
      const p = position(rid, kind, it);
      if (!p) return;
      const mk = L.circleMarker([p.lat, p.lon], { radius: 6, weight: 1.5, color: '#fff', fillOpacity: 1, ...style });
      mk.on('click', (e) => { L.DomEvent.stop(e); onOpen(kind, it); });
      mk.bindTooltip(`${it.mile != null ? it.mile.toFixed(1) + ' · ' : ''}${it.name}`, { direction: 'top', offset: [0, -6] });
      into.addLayer(mk);
    };
    (river.landmarks || []).filter((d) => d.civ).forEach((d) => add('landmark', d, { radius: 4, fillColor: '#7a6a55' }));
    river.rapids.forEach((d) => add('rapid', d, { radius: 3 + Math.min(5, d.diff / 2), fillColor: colors.rapid, color: '#e9f1f6' }));
    river.hikes.forEach((h) => {
      add('hike', h, { fillColor: colors.hike(h.qual) });
      const t = hikeTrack(rid, h);
      if (t) {
        const pl = L.polyline(t.map((p) => [p[0], p[1]]), { color: '#9a4a28', weight: 3, dashArray: '6 5', opacity: 0.9 });
        pl.on('click', (e) => { L.DomEvent.stop(e); onOpen('hike', h); });
        tr.addLayer(pl);
      }
    });
    river.camps.forEach((c) => {
      if (!planned.has(c.name)) return add('camp', c, { fillColor: colors.camp(c.qual) });
      const st = { fillColor: colors.camp(c.qual), color: '#9c3326', weight: 3, radius: 8 };
      add('camp', c, st);
      add('camp', c, { ...st, radius: 6, weight: 2.5 }, ov);
    });
  }, [rid, river, planned, rev]);

  // --- shade overlay
  const shadeJob = useRef(0);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const clear = () => { if (layers.current.shade) { m.removeLayer(layers.current.shade); layers.current.shade = null; } };
    if (!shadeOn) { clear(); setBusy(''); return; }
    let timer = null;
    const run = async () => {
      const job = ++shadeJob.current;
      const z = Math.max(9, Math.min(13, Math.round(m.getZoom()) - 1));
      const b = m.getBounds();
      const s = b.getSouth(), n = b.getNorth(), w = b.getWest(), e = b.getEast();
      // shadows fall away from the sun, so only pad the side the sun is on
      const pad = Math.min(12000, RELIEF / Math.tan(Math.max(3, sp.alt) * Math.PI / 180));
      const dLat = pad / 110540, dLon = pad / (111320 * Math.cos((center[0] * Math.PI) / 180));
      const ax = Math.sin((sp.az * Math.PI) / 180), ay = Math.cos((sp.az * Math.PI) / 180);
      const box = [s - Math.max(0, -ay) * dLat, w - Math.max(0, -ax) * dLon, n + Math.max(0, ay) * dLat, e + Math.max(0, ax) * dLon];
      const tiles = (Math.floor(lon2x(box[3], z)) - Math.floor(lon2x(box[1], z)) + 1) * (Math.floor(lat2y(box[0], z)) - Math.floor(lat2y(box[2], z)) + 1);
      if (tiles > 64) { setBusy('Zoom in to see sun and shade'); clear(); return; }
      setBusy('Computing shade…');
      const mo = await mosaic(z, box);
      if (job !== shadeJob.current) return;
      const c = await shadeCanvas(mo, sp.alt, sp.az);
      if (job !== shadeJob.current) return;
      clear();
      layers.current.shade = L.imageOverlay(c.toDataURL(), mo.bounds, { opacity: 1, interactive: false }).addTo(m);
      setBusy('');
    };
    const later = () => { clearTimeout(timer); timer = setTimeout(run, 250); };
    later();
    m.on('moveend', later);
    return () => { clearTimeout(timer); m.off('moveend', later); };
  }, [shadeOn, cur, date]);

  const sunLabel = sp.alt > 0 ? `${fmtTime(when, river.tz)} · sun ${Math.round(sp.alt)}° up, from ${compass(sp.az)}` : `${fmtTime(when, river.tz)} · sun down`;

  return (
    <div className="topo">
      <div className="topoMap" ref={el} style={h ? { height: h } : undefined} />
      <div className="topoBar">
        <button className={'chip' + (base === 'dem' ? ' on river' : '')} onClick={() => setBase('dem')}>Terrain</button>
        <button className={'chip' + (base === 'usgs' ? ' on river' : '')} onClick={() => setBase('usgs')} title="USGS topo map, needs signal">USGS</button>
        <button className={'chip' + (shadeOn ? ' on river' : '')} onClick={() => setShadeOn((v) => !v)}>Sun &amp; shade</button>
        <button className={'chip' + (panel === 'offline' ? ' on river' : '')} onClick={() => setPanel(panel === 'offline' ? null : 'offline')}>Offline</button>
      </div>
      {picking ? (
        <div className="topoPanel pick">
          <span>Tap the map where <b>{picking.name}</b> really is.</span>
          <button className="btn ghost" onClick={onCancelPick}>Cancel</button>
        </div>
      ) : null}
      {shadeOn ? (
        <div className="topoPanel">
          <div className="row">
            <input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
            <span className="muted small">{sunLabel}</span>
          </div>
          <input type="range" className="topoRange" min={lo} max={hi} step={5} value={cur} onChange={(e) => setMins(+e.target.value)} aria-label="Time of day" />
          <div className="muted small topoLegend">
            <span><i className="sw shadeSw" /> shade</span>
            <span><i className="sw sunSw" /> direct sun</span>
            <span>{sky.rise ? `sky ${fmtTime(sky.rise, river.tz)} – ${fmtTime(sky.set, river.tz)}` : ''}</span>
            {busy ? <span>{busy}</span> : null}
          </div>
        </div>
      ) : null}
      {panel === 'offline' ? <OfflinePanel line={line} /> : null}
    </div>
  );
}

function compass(az) {
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(az / 45) % 8];
}

function OfflinePanel({ line }) {
  const keys = useMemo(() => (line ? corridorTiles(line.ll) : []), [line]);
  const [have, setHave] = useState(null);
  const [prog, setProg] = useState(null);
  const [err, setErr] = useState('');
  const ctl = useRef(null);
  useEffect(() => { cachedCount(keys).then(setHave, () => setHave(0)); }, [keys]);
  if (!line) return <div className="topoPanel muted">This river has no map data to download yet.</div>;
  const mb = Math.round((keys.length * 110) / 1024);
  const start = async () => {
    setErr('');
    ctl.current = new AbortController();
    try {
      const r = await download(keys, (d, n, f) => setProg({ d, n, f }), ctl.current.signal);
      setHave(await cachedCount(keys));
      if (r.failed) setErr(`${r.failed} tiles failed; tap Download again to retry.`);
    } catch (e) {
      setErr(e.message);
    }
    setProg(null);
  };
  return (
    <div className="topoPanel">
      <div>
        Terrain for this river: {keys.length} tiles, about {mb} MB. {have != null ? `${have} saved on this device.` : ''}
      </div>
      <div className="muted small">Saved terrain draws the map and the sun-and-shade overlay with no signal. Camp sun times need nothing; they ship with the app.</div>
      {prog ? (
        <div className="row">
          <progress max={prog.n} value={prog.d} style={{ flex: 1 }} />
          <button className="btn ghost" onClick={() => ctl.current?.abort()}>Stop</button>
        </div>
      ) : (
        <button className="btn" onClick={start} disabled={have === keys.length}>
          {have === keys.length ? 'Saved for offline' : 'Download'}
        </button>
      )}
      {err ? <div className="muted small">{err}</div> : null}
    </div>
  );
}

