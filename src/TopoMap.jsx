// Topographic map of the active river: DEM-rendered basemap (tint, hillshade, contours), the traced
// centerline, rapids / camps / hikes, GPX tracks, dropped pins with their own sun data, and a sun-and-shade
// overlay that plays through any day. Everything here runs from downloaded terrain with no signal.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { demTile, mosaic, mpp, lon2x, lat2y, y2lat, corridorTiles, cachedCount, download, removeDownloads, sampler, tileStore } from './geo/dem.js';
import { setGrid, shade, paint } from './geo/shade.js';
import { sunPos, sunDay, localMidnight, encodeHorizon } from './geo/sun.js';
import { horizon } from './geo/horizon.js';
import { nearest } from './geo/line.js';
import { riverLine, position, hikeTrack, onGeoChange, drops, addDrop, updateDrop } from './geo/index.js';

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
  const lx = -0.5, ly = 0.5, lz = Math.SQRT1_2;
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

// a canvas pinned to lat/lon bounds, redrawn in place for each shade frame
const CanvasOverlay = L.ImageOverlay.extend({
  _initImage() {
    const el = (this._image = this._url);
    L.DomUtil.addClass(el, 'leaflet-image-layer');
    if (this._zoomAnimated) L.DomUtil.addClass(el, 'leaflet-zoom-animated');
    el.onselectstart = L.Util.falseFn;
    el.onmousemove = L.Util.falseFn;
  },
});

const USGS_TOPO = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}';
const USGS_IMG = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}';
const PIN_ZOOM = 11;
const BASES = ['dem', 'usgs', 'img'];
const BASE_NAME = { dem: 'Terrain', usgs: 'Topo', img: 'Satellite' };
const STEP = 10; // minutes between shade frames
const PAD = 7000; // metres of terrain around the view that can throw a shadow into it
const MAX_TILES = 30;

export const fmtTime = (d, tz) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
const todayIn = (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
const pinIcon = (on) =>
  L.divIcon({ className: 'dropPin' + (on ? ' on' : ''), html: '<span></span>', iconSize: [22, 30], iconAnchor: [11, 29] });

// terrain horizon for any spot, from saved tiles (or the network): base64 + ground elevation
export async function spotHorizon(lat, lon) {
  const { elev, missing } = await sampler(lat, lon, 3300, 25500);
  if (missing) throw new Error('No terrain here yet. Download this river for offline use, or try again with signal.');
  return { h: encodeHorizon(horizon(lat, lon, elev)), elev: elev(lat, lon, false) };
}

export default function TopoMap({ rid, river, planned, colors, date: date0, onOpen, focus, onClearFocus }) {
  const el = useRef(null);
  const map = useRef(null);
  const layers = useRef({});
  const [base, setBase] = useState('dem');
  const [shadeOn, setShadeOn] = useState(false);
  const [date, setDate] = useState(date0 || todayIn(river.tz));
  const [mins, setMins] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [dropMode, setDropMode] = useState(false);
  const [msg, setMsg] = useState('');
  const [panel, setPanel] = useState(null);
  const [rev, setRev] = useState(0);
  const [online, setOnline] = useState(navigator.onLine !== false);
  const dropRef = useRef(null);
  useEffect(() => onGeoChange(() => setRev((r) => r + 1)), []);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
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
  // slider value = minutes after local midnight, on the frame grid; default mid-afternoon
  const dayStart = useMemo(() => localMidnight(date, river.tz), [date, river.tz]);
  const lo = sky.rise ? Math.floor((sky.rise.getTime() - dayStart) / 60000 / STEP) * STEP : 0;
  const hi = sky.set ? Math.ceil((sky.set.getTime() - dayStart) / 60000 / STEP) * STEP : 1440;
  const cur = Math.min(hi, Math.max(lo, mins == null ? 15 * 60 : mins));
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
    layers.current.usgs = L.tileLayer(USGS_TOPO, { maxZoom: 17, maxNativeZoom: 16, attribution: 'USGS The National Map' });
    layers.current.img = L.tileLayer(USGS_IMG, { maxZoom: 17, maxNativeZoom: 16, attribution: 'USGS The National Map: imagery' });
    layers.current.dem.addTo(m);
    layers.current.marks = L.layerGroup();
    layers.current.overview = L.layerGroup().addTo(m);
    layers.current.tracks = L.layerGroup().addTo(m);
    layers.current.drops = L.layerGroup().addTo(m);
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
    m.on('click', (e) => dropRef.current && dropRef.current(e.latlng.lat, e.latlng.lng));
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
    for (const k of ['dem', 'usgs', 'img']) {
      const lyr = layers.current[k];
      if (k === base && !m.hasLayer(lyr)) lyr.addTo(m).bringToBack();
      if (k !== base && m.hasLayer(lyr)) m.removeLayer(lyr);
    }
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
    river.hikes.forEach((hk) => {
      add('hike', hk, { fillColor: colors.hike(hk.qual) });
      const t = hikeTrack(rid, hk);
      if (t) {
        const pl = L.polyline(t.map((p) => [p[0], p[1]]), { color: '#9a4a28', weight: 3, dashArray: '6 5', opacity: 0.9 });
        pl.on('click', (e) => { L.DomEvent.stop(e); onOpen('hike', hk); });
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

  // --- dropped pins
  useEffect(() => {
    const g = layers.current.drops;
    g.clearLayers();
    for (const d of drops()) {
      const mk = L.marker([d.lat, d.lon], { icon: pinIcon(focus?.id === d.id), keyboard: false });
      mk.on('click', (e) => { L.DomEvent.stop(e); onOpen('drop', d); });
      g.addLayer(mk);
    }
  }, [rev, focus]);

  const drop = async (lat, lon, name) => {
    setDropMode(false);
    const near = line ? nearest(line, lat, lon) : null;
    const d = addDrop({ lat: +lat.toFixed(6), lon: +lon.toFixed(6), name: name || `Pin ${drops().length + 1}`, near: near && near.d < 3000 ? { mile: +near.mile.toFixed(1), side: near.side, m: Math.round(near.d) } : null });
    onOpen('drop', d);
    setMsg('Working out the walls around this spot…');
    try {
      updateDrop(d.id, await spotHorizon(lat, lon));
      setMsg('');
    } catch (e) {
      setMsg(e.message);
    }
  };
  dropRef.current = dropMode ? drop : null;

  const locate = () => {
    if (!navigator.geolocation) return setMsg('This device has no location service.');
    setMsg('Finding you…');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        map.current.setView([p.coords.latitude, p.coords.longitude], Math.max(14, map.current.getZoom()));
        drop(p.coords.latitude, p.coords.longitude, 'Here · ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      },
      (e) => setMsg(e.code === 1 ? 'Location is turned off for River Guide (Settings > River Guide > Location).' : 'Could not get a GPS fix. Try again with a view of the sky.'),
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 }
    );
  };

  // --- sun & shade: one terrain grid per view and date, a frame every STEP minutes, computed in the background
  const day = useRef({ key: '', gid: 0, frames: new Map(), W: 0, H: 0, data: null, bounds: null });
  const [progress, setProgress] = useState({ done: 0, total: 0, note: '' });
  const showFrame = (minute) => {
    const D = day.current, f = D.frames.get(minute);
    if (!f || !layers.current.shade) return false;
    paint(layers.current.shadeCanvas, D.W, D.H, f, D.data);
    return true;
  };
  useEffect(() => {
    const m = map.current;
    const clear = () => {
      if (layers.current.shade) m.removeLayer(layers.current.shade);
      layers.current.shade = null;
    };
    if (!shadeOn) { clear(); day.current.key = ''; setPlaying(false); return; }
    let timer = null, alive = true;
    const build = async () => {
      const b = m.getBounds();
      const dLat = PAD / 110540, dLon = PAD / (111320 * Math.cos((center[0] * Math.PI) / 180));
      const box = [b.getSouth() - dLat, b.getWest() - dLon, b.getNorth() + dLat, b.getEast() + dLon];
      const count = (z) => (Math.floor(lon2x(box[3], z)) - Math.floor(lon2x(box[1], z)) + 1) * (Math.floor(lat2y(box[0], z)) - Math.floor(lat2y(box[2], z)) + 1);
      // the most detail that keeps a day of frames quick on a phone
      let z = Math.min(13, Math.floor(m.getZoom()));
      while (z > 9 && count(z) > MAX_TILES) z--;
      if (count(z) > MAX_TILES) { clear(); day.current.key = ''; setProgress({ done: 0, total: 0, note: 'Zoom in to see sun and shade' }); return; }
      const key = `${date}|${z}|${box.map((v) => v.toFixed(3)).join(',')}`;
      if (key === day.current.key) return;
      day.current.key = key;
      setProgress({ done: 0, total: 0, note: 'Loading terrain…' });
      const mo = await mosaic(z, box);
      if (!alive || day.current.key !== key) return;
      const gid = setGrid(mo);
      const frames = new Map();
      Object.assign(day.current, { gid, frames, W: mo.W, H: mo.H, data: mo.data, bounds: mo.bounds });
      clear();
      const canvas = document.createElement('canvas');
      layers.current.shadeCanvas = canvas;
      layers.current.shade = new CanvasOverlay(canvas, mo.bounds, { interactive: false }).addTo(m);
      // the frame on screen first, then outward from it so scrubbing nearby is instant
      const all = [];
      for (let t = lo; t <= hi; t += STEP) all.push(t);
      const now = curRef.current;
      all.sort((a, b2) => Math.abs(a - now) - Math.abs(b2 - now));
      let done = 0;
      setProgress({ done, total: all.length, note: '' });
      all.forEach((t, i) => {
        const p = sunPos(new Date(dayStart + t * 60000), center[0], center[1]);
        shade(gid, p.alt, p.az, i === 0).then((bits) => {
          if (!bits || day.current.gid !== gid) return;
          frames.set(t, bits);
          setProgress({ done: ++done, total: all.length, note: '' });
          if (t === curRef.current) showFrame(t);
        });
      });
    };
    const later = () => { clearTimeout(timer); timer = setTimeout(build, 300); };
    later();
    m.on('moveend', later);
    return () => { alive = false; clearTimeout(timer); m.off('moveend', later); };
  }, [shadeOn, date, lo, hi]);
  const curRef = useRef(cur);
  curRef.current = cur;
  useEffect(() => { if (shadeOn) showFrame(cur); }, [cur, shadeOn, progress.done > 0]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setMins((v) => {
      const n = (v == null ? cur : v) + STEP;
      return n > hi ? lo : n;
    }), 220);
    return () => clearInterval(t);
  }, [playing, lo, hi]);

  const sunLabel = sp.alt > 0 ? `${fmtTime(when, river.tz)} · sun ${Math.round(sp.alt)}° up, from the ${compass(sp.az)}` : `${fmtTime(when, river.tz)} · sun down`;
  // direct sun at the focused camp or pin, drawn along the slider track
  const fsun = useMemo(() => (focus?.h ? sunDay(date, focus.lat, focus.lon, river.tz, focus.h) : null), [focus, date, river.tz]);
  const pct = (d) => ((Math.min(hi, Math.max(lo, (d.getTime() - dayStart) / 60000)) - lo) / (hi - lo || 1)) * 100;
  const ticks = [];
  for (let t = Math.ceil(lo / 120) * 120; t <= hi; t += 120) ticks.push(t);
  const onlineOnly = base !== 'dem' && !online;

  return (
    <div className="topo">
      <div className="topoMap" ref={el} style={h ? { height: h } : undefined} />
      <div className="topoBar">
        <button className="chip" onClick={() => setBase(BASES[(BASES.indexOf(base) + 1) % BASES.length])} title="Map style">
          {BASE_NAME[base]} ▾
        </button>
        <button className={'chip' + (shadeOn ? ' on river' : '')} onClick={() => setShadeOn((v) => !v)}>Sun &amp; shade</button>
        <button className={'chip' + (panel === 'offline' ? ' on river' : '')} onClick={() => setPanel(panel === 'offline' ? null : 'offline')}>Offline</button>
      </div>
      <div className="topoTools">
        <button className={'toolBtn' + (dropMode ? ' on' : '')} onClick={() => setDropMode((v) => !v)} aria-label="Drop a pin" title="Drop a pin">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 22s7-6.6 7-12a7 7 0 0 0-14 0c0 5.4 7 12 7 12z" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="10" r="2.5" fill="currentColor" /></svg>
        </button>
        <button className="toolBtn" onClick={locate} aria-label="My location" title="My location">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="2.5" fill="currentColor" /><path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="currentColor" strokeWidth="2" /></svg>
        </button>
      </div>
      {dropMode || msg || onlineOnly ? (
        <div className="topoNote">
          {dropMode ? 'Tap anywhere to drop a pin and see its sun and shade.' : onlineOnly ? 'Topo and Satellite need signal. Terrain works offline.' : msg}
          {dropMode ? <button className="linkBtn" onClick={() => setDropMode(false)}>Cancel</button> : msg ? <button className="linkBtn" onClick={() => setMsg('')}>×</button> : null}
        </div>
      ) : null}
      {shadeOn ? (
        <div className="topoPanel">
          <div className="row">
            <input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
            <button className="btn ghost playBtn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play the day'}>
              {playing ? '❚❚' : '▶'}
            </button>
            <span className="small topoTime">{sunLabel}</span>
          </div>
          <div className="topoTrack">
            {fsun
              ? fsun.spans.map(([a, b], i) => <span key={i} className="litSpan" style={{ left: pct(a) + '%', width: pct(b || sky.set || a) - pct(a) + '%' }} />)
              : null}
            <input type="range" className="topoRange" min={lo} max={hi} step={STEP} value={cur} onChange={(e) => { setPlaying(false); setMins(+e.target.value); }} aria-label="Time of day" />
          </div>
          <div className="topoTicks">
            {ticks.map((t) => (
              <span key={t} style={{ left: ((t - lo) / (hi - lo || 1)) * 100 + '%' }}>{fmtTime(new Date(dayStart + t * 60000), river.tz).replace(':00', '')}</span>
            ))}
          </div>
          <div className="muted small topoLegend">
            <span><i className="sw shadeSw" /> shade</span>
            <span><i className="sw sunSw" /> direct sun</span>
            {fsun ? (
              <span className="focusName">
                <i className="sw litSw" /> {focus.name}: {fsun.on ? `${fmtTime(fsun.on, river.tz)}–${fmtTime(fsun.off, river.tz)}` : 'no direct sun'}
                <button className="linkBtn" onClick={onClearFocus} aria-label="Clear">×</button>
              </span>
            ) : null}
            {progress.note ? <span>{progress.note}</span> : progress.total && progress.done < progress.total ? <span>shading the day {Math.round((progress.done / progress.total) * 100)}%</span> : null}
          </div>
        </div>
      ) : null}
      {panel === 'offline' ? <div className="topoPanel"><OfflinePanel rid={rid} /></div> : null}
    </div>
  );
}

function compass(az) {
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(az / 45) % 8];
}

// Download a river's terrain (map + sun-and-shade) for use with no signal. Used on the map and on River > More.
export function OfflinePanel({ rid }) {
  const line = useMemo(() => riverLine(rid), [rid]);
  const keys = useMemo(() => (line ? corridorTiles(line.ll) : []), [line]);
  const [have, setHave] = useState(null);
  const [prog, setProg] = useState(null);
  const [err, setErr] = useState('');
  const ctl = useRef(null);
  const refresh = () => cachedCount(keys).then(setHave, () => setHave(0));
  useEffect(() => { refresh(); }, [keys]);
  if (!line) return <div className="muted">This river has no map data to download yet.</div>;
  const mb = Math.round((keys.length * 105) / 1024);
  const ready = have === keys.length;
  const start = async () => {
    setErr('');
    ctl.current = new AbortController();
    try {
      const r = await download(keys, (d, n, f) => setProg({ d, n, f }), ctl.current.signal);
      if (r.failed) setErr(`${r.failed} pieces failed. Tap Download again with better signal to finish.`);
    } catch (e) {
      setErr(e.message);
    }
    setProg(null);
    refresh();
  };
  return (
    <div className="offline">
      <div className="offlineHead">
        <b>{ready ? 'Ready offline ✓' : 'Offline map and shade'}</b>
        <span className="muted small">{ready ? `${mb} MB on this ${tileStore.kind === 'device' ? 'iPhone' : 'browser'}` : `about ${mb} MB`}</span>
      </div>
      <div className="muted small">
        Terrain 10 km either side of the river at full detail (rim to rim and beyond), wider at lower detail. With it saved, the
        map, dropped pins and sun-and-shade all work with no signal. Camp sun times already work offline.
        {have != null && !ready && have > 0 ? ` ${Math.round((have / keys.length) * 100)}% saved so far.` : ''}
      </div>
      {prog ? (
        <div className="row">
          <progress max={prog.n} value={prog.d} style={{ flex: 1 }} />
          <span className="small">{Math.round((prog.d / prog.n) * 100)}%</span>
          <button className="btn ghost" onClick={() => ctl.current?.abort()}>Stop</button>
        </div>
      ) : (
        <div className="row">
          {!ready ? <button className="btn" onClick={start}>{have ? 'Finish download' : 'Download'}</button> : null}
          {have ? (
            <button className="btn ghost" onClick={async () => { if (window.confirm('Remove all downloaded terrain from this device?')) { await removeDownloads(); refresh(); } }}>
              Remove
            </button>
          ) : null}
        </div>
      )}
      {err ? <div className="muted small">{err}</div> : null}
    </div>
  );
}
