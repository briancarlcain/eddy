// River > Map > Basin: the drainage basin above a river's take-out. Streams (thicker = bigger), the basin outline,
// reservoirs and lakes, and a marker plus name for every dam we could place. Built from USGS hydrography by
// scripts/basin/build.py and shipped as data/basin/<river>.json. The streams and outline draw from that file, so they work offline
// once it has been fetched (the service worker keeps it; the store build bundles it). Under them sits an optional base map
// (see BASE below).
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import INDEX from '../data/basin/index.json';
import { dec, area, approx } from './geo/basin.js';
import { DemLayer } from './TopoMap.jsx';
import { openUrl } from './native.js';

// base maps under the basin: relief shading from the saved terrain tiles (works offline), or OpenTopoMap (roads, towns,
// contours; needs signal). 'plain' is the original flat outline.
const OTM = 'https://tile.opentopomap.org/{z}/{x}/{y}.png';
const BASE = [['dem', 'Terrain'], ['otm', 'Roads & towns'], ['plain', 'Outline']];
const WORLD = [[-85, -180], [-85, 180], [85, 180], [85, -180]];

export const hasBasin = (id) => !!INDEX.rivers?.[id];

const cache = new Map();
function loadBasin(id) {
  if (!cache.has(id)) {
    cache.set(
      id,
      fetch(`data/basin/${id}.json`).then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).catch((e) => { cache.delete(id); throw e; })
    );
  }
  return cache.get(id);
}

// stream classes 1 (the main rivers) to 4 (smallest shown)
const STREAM = {
  1: { weight: 3.4, color: '#2d6794', opacity: 0.95 },
  2: { weight: 2.2, color: '#3a77a3', opacity: 0.92 },
  3: { weight: 1.3, color: '#5b94bd', opacity: 0.9 },
  4: { weight: 0.8, color: '#86aecb', opacity: 0.9 },
};

export default function BasinMap({ rid, river }) {
  const el = useRef(null);
  const map = useRef(null);
  const lay = useRef({});
  const cand = useRef([]);
  const obst = useRef([]);
  const dataRef = useRef(null);
  const fitted = useRef(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [show, setShow] = useState({ names: true, lakes: true, gauges: true });
  const showRef = useRef(show);
  showRef.current = show;
  const [sel, setSel] = useState(null);
  const [base, setBase] = useState(() => {
    try { return localStorage.getItem('eddyBasinBase') || 'dem'; } catch { return 'dem'; }
  });

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

  useEffect(() => {
    let live = true;
    setData(null);
    setErr('');
    loadBasin(rid).then((d) => live && setData(d), () => live && setErr('The basin map is not available yet. Open this river once with a connection and it will be kept on this device.'));
    return () => { live = false; };
  }, [rid]);

  // --- the map itself, created once
  useEffect(() => {
    const m = L.map(el.current, { zoomControl: false, preferCanvas: true, attributionControl: true, minZoom: 3, maxZoom: 13, zoomSnap: 0.25 });
    map.current = m;
    m.attributionControl.setPrefix(false);
    m.attributionControl.addAttribution('Hydrography: USGS National Hydrography Dataset');
    L.control.zoom({ position: 'topright' }).addTo(m);
    m.setView(river.coords, 8);
    lay.current.dem = new DemLayer({ maxZoom: 13, attribution: 'Terrain: AWS Terrain Tiles' });
    lay.current.otm = L.tileLayer(OTM, { maxZoom: 13, maxNativeZoom: 13, attribution: 'Map data: © OpenStreetMap contributors, SRTM | Style: © OpenTopoMap (CC-BY-SA)' });
    lay.current.labels = L.layerGroup().addTo(m);
    let raf = 0;
    const again = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(relabel); };
    m.on('zoomend moveend', again);
    const ro = new ResizeObserver(() => {
      m.invalidateSize();
      fitBasin(); // the container gets its real height after first layout
      again();
    });
    ro.observe(el.current);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); m.remove(); map.current = null; };
  }, []);

  // --- draw the basin once its data arrives
  useEffect(() => {
    const m = map.current;
    if (!m || !data) return;
    const g = (lay.current.data = L.layerGroup().addTo(m));
    const items = [];
    // outside the basin is veiled over the base map (the world with the basin cut out); the basin keeps its plain fill only in Outline
    const rings = data.basin.map(dec);
    lay.current.veil = L.polygon([WORLD, ...rings], { stroke: false, fillColor: '#f6f1e5', fillOpacity: 0, interactive: false }).addTo(g);
    lay.current.edge = rings.map((r) => L.polygon(r, { color: '#8a7a58', weight: 1.3, dashArray: '5 4', fillColor: '#f6f1e5', fillOpacity: 1, interactive: false }).addTo(g));
    for (const c of [4, 3, 2, 1]) {
      const s = STREAM[c];
      for (const [k, p] of data.streams) if (k === c) L.polyline(dec(p), { ...s, smoothFactor: 1.1, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(g);
    }
    // reservoirs and lakes over the streams that run through them
    for (const r of data.res) {
      for (const p of r.p) {
        L.polygon(dec(p), { color: '#3a6f92', weight: 1, fillColor: '#a3c6df', fillOpacity: 0.96 })
          .on('click', () => setSel({ kind: 'res', r }))
          .addTo(g);
      }
      items.push({ kind: 'lake', ll: r.c, text: r.n, pri: 500 + Math.log10(r.a + 1) * 120, onClick: () => setSel({ kind: 'res', r }) });
      if (r.dam) {
        const ic = L.divIcon({ className: 'bDamIcon', html: '<span></span>', iconSize: [14, 14], iconAnchor: [7, 7] });
        L.marker(r.dam.ll, { icon: ic, keyboard: false }).on('click', () => setSel({ kind: 'dam', r })).addTo(g);
        items.push({ kind: 'dam', ll: r.dam.ll, text: r.dam.n, pri: 1000, onClick: () => setSel({ kind: 'dam', r }) });
      }
    }
    // USGS stream gauges (scripts/basin/gauges.py); a layer of their own so the Gauges switch can hide it
    const gg = (lay.current.gauges = L.layerGroup());
    for (const [id, name, la, lo, da] of data.gauges || []) {
      const ic = L.divIcon({ className: 'bGaugeIcon', html: '<span></span>', iconSize: [16, 16], iconAnchor: [8, 8] });
      L.marker([la, lo], { icon: ic, keyboard: false, title: name }).on('click', () => setSel({ kind: 'gauge', g: { id, name, da } })).addTo(gg);
    }
    if (showRef.current.gauges) gg.addTo(g);
    // the trip's run, with a pale casing so it reads over the streams
    for (const p of data.run) {
      const pts = dec(p);
      L.polyline(pts, { color: '#fffaf0', weight: 7, opacity: 0.85, interactive: false, lineCap: 'round' }).addTo(g);
      L.polyline(pts, { color: '#b8522a', weight: 4, opacity: 0.98, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(g);
    }
    const ends = (river.reach || '').split(' to ');
    const mk = (ll, text) => {
      L.circleMarker(ll, { radius: 5.5, color: '#b8522a', weight: 2.5, fillColor: '#fffaf0', fillOpacity: 1, interactive: false }).addTo(g);
      items.push({ kind: 'run', ll, text, pri: 900 });
    };
    mk(data.putin, ends[0] ? `Put-in · ${ends[0]}` : 'Put-in');
    if (!data.mouth) mk(data.takeout, ends.length > 1 ? `Take-out · ${ends[ends.length - 1]}` : 'Take-out');
    for (const [ni, la, lo, rank] of data.labels) items.push({ kind: 'river', ll: [la, lo], text: data.names[ni], pri: Math.min(480, rank * 520) });
    cand.current = items.sort((a, b) => b.pri - a.pri);
    obst.current = [...data.res.filter((r) => r.dam).map((r) => ({ kind: 'dam', ll: r.dam.ll })), { kind: 'run', ll: data.putin }, ...(data.mouth ? [] : [{ kind: 'run', ll: data.takeout }])];
    dataRef.current = data;
    fitted.current = false;
    fitBasin();
    relabel();
    return () => { m.removeLayer(g); lay.current.data = null; };
  }, [data]);

  useEffect(() => { relabel(); }, [show, data]);
  useEffect(() => {
    const g = lay.current.gauges, d = lay.current.data;
    if (!g || !d) return;
    if (show.gauges) g.addTo(d); else d.removeLayer(g);
  }, [show.gauges, data]);

  useEffect(() => {
    const m = map.current, l = lay.current;
    if (!m) return;
    for (const k of ['dem', 'otm']) if (k === base) { if (!m.hasLayer(l[k])) l[k].addTo(m); l[k].bringToBack(); } else if (m.hasLayer(l[k])) m.removeLayer(l[k]);
    try { localStorage.setItem('eddyBasinBase', base); } catch {}
    if (!data || !l.veil) return;
    const plain = base === 'plain';
    l.veil.setStyle({ fillOpacity: plain ? 0 : base === 'dem' ? 0.5 : 0.4 });
    for (const e of l.edge) e.setStyle({ fillOpacity: plain ? 1 : 0, color: plain ? '#b3a68c' : '#6b5a38', weight: plain ? 1.3 : 2 });
  }, [base, data]);

  // greedy, collision-free labels in screen space: dams, then reservoirs, then the biggest rivers. Each label tries a few
  // spots around its point (a dam: right, left, above, below) and is dropped if none is clear.
  function relabel() {
    const m = map.current, grp = lay.current.labels;
    if (!m || !grp) return;
    grp.clearLayers();
    const size = m.getSize();
    const placed = [];
    const hit = (b) => placed.some((q) => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]);
    const sh = showRef.current;
    for (const o of obst.current) {
      if (o.kind === 'dam' && !sh.lakes) continue;
      const q = m.latLngToContainerPoint(o.ll);
      placed.push([q.x - 8, q.y - 8, q.x + 8, q.y + 8]);
    }
    for (const c of cand.current) {
      if (c.kind === 'river' && !sh.names) continue;
      if ((c.kind === 'lake' || c.kind === 'dam') && !sh.lakes) continue;
      const p = m.latLngToContainerPoint(c.ll);
      if (p.x < -30 || p.y < -10 || p.x > size.x + 30 || p.y > size.y + 10) continue;
      const w = c.text.length * (c.kind === 'river' ? 5.7 : 6.3) + 8;
      const spots = {
        dam: [[10, -8], [-10 - w, -8], [-w / 2, -26], [-w / 2, 10]],
        lake: [[-w / 2, -8], [-w / 2, 8], [-w / 2, -24], [10, -8], [-10 - w, -8]],
        river: [[-w / 2, -8]],
        run: [[-w / 2, 10], [-w / 2, -26]],
      }[c.kind];
      if (w > size.x - 8) continue;
      let at = null; // top-left of the label box on screen; nudged back inside the map when its point is near an edge
      for (const [dx, dy] of spots) {
        const x0 = Math.min(Math.max(p.x + dx, 4), size.x - w - 4), y0 = p.y + dy;
        if (!hit([x0, y0, x0 + w, y0 + 16])) { at = [x0, y0]; break; }
      }
      if (!at) continue;
      placed.push([at[0], at[1], at[0] + w, at[1] + 16]);
      const ic = L.divIcon({
        className: 'bLabel bl-' + c.kind + (c.onClick ? ' tap' : ''),
        html: c.text.replace(/&/g, '&amp;').replace(/</g, '&lt;'),
        iconSize: [w, 16],
        iconAnchor: [p.x - at[0], p.y - at[1]],
      });
      const mk = L.marker(c.ll, { icon: ic, interactive: !!c.onClick, keyboard: false, zIndexOffset: Math.round(c.pri) });
      if (c.onClick) mk.on('click', c.onClick);
      mk.addTo(grp);
    }
  }

  function fitBasin(force) {
    const m = map.current, d = dataRef.current;
    if (!m || !d || !el.current || el.current.clientHeight < 200) return;
    if (fitted.current && !force) return;
    fitted.current = true;
    m.fitBounds(L.latLngBounds([d.bbox[1], d.bbox[0]], [d.bbox[3], d.bbox[2]]), { paddingTopLeft: [14, 122], paddingBottomRight: [14, 64] });
  }
  const reset = () => fitBasin(true);
  const dams = data ? data.res.filter((r) => r.dam).length : 0;
  const tail = (river.reach || '').split(' to ').pop();

  return (
    <div className="topo basin">
      <div className="topoMap" ref={el} style={h ? { height: h } : undefined} />
      <div className="topoBar">
        <button className={'chip' + (show.names ? ' on' : '')} onClick={() => setShow({ ...show, names: !show.names })}>Rivers</button>
        <button className={'chip' + (show.lakes ? ' on' : '')} onClick={() => setShow({ ...show, lakes: !show.lakes })}>Lakes &amp; dams</button>
        <button className="chip" onClick={reset}>Reset view</button>
      </div>
      {data ? (
        <div className="topoNote">
          <span>
            {data.mouth ? (
              <>The whole {river.name} basin: <b>about {approx(data.area)}</b></>
            ) : (
              <>
                <b>About {approx(data.area)}</b> drains to the take-out{tail ? ` at ${tail}` : ''}
              </>
            )}
            {data.res.length ? <> · {data.res.length} lake{data.res.length === 1 ? '' : 's'} and reservoirs{dams ? `, ${dams} dam${dams === 1 ? '' : 's'}` : ''}</> : null}
          </span>
        </div>
      ) : null}
      {!data && !err ? <div className="topoNote"><span>Loading the basin…</span></div> : null}
      {err ? <div className="topoNote"><span>{err}</span></div> : null}
      <div className="basinDock">
        <div className="basinBase" role="group" aria-label="Base map">
          {BASE.map(([k, n]) => <button key={k} className={base === k ? 'on' : ''} onClick={() => setBase(k)}>{n}</button>)}
        </div>
        {data?.gauges?.length ? (
          <button className={'basinGauges' + (show.gauges ? ' on' : '')} onClick={() => setShow({ ...show, gauges: !show.gauges })}>Gauges</button>
        ) : null}
      </div>
      <div className="basinLegend">
        <span><i className="lgRun" /> This trip</span>
        <span><i className="lgStream" /> Streams (thicker = bigger)</span>
        <span><i className="lgDam" /> Dam</span>
        {data?.gauges?.length && show.gauges ? <span><i className="lgGauge" /> USGS gauge</span> : null}
      </div>
      {sel ? (
        <div className="topoPanel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>{sel.kind === 'gauge' ? sel.g.name : sel.kind === 'dam' ? sel.r.dam.n : sel.r.n}</b>
            <button className="linkBtn" onClick={() => setSel(null)}>Close</button>
          </div>
          {sel.kind === 'gauge' ? (
            <div>
              USGS stream gauge {sel.g.id}{sel.g.da ? <>, draining {area(sel.g.da * 2.589988)}</> : null}.{' '}
              <button className="linkBtn" onClick={() => openUrl('https://waterdata.usgs.gov/monitoring-location/' + sel.g.id + '/')}>Open on USGS</button>
            </div>
          ) : sel.kind === 'dam' ? (
            <div>Impounds {sel.r.n}, a surface of {area(sel.r.a)}.</div>
          ) : (
            <div>
              Surface {area(sel.r.a)}.{sel.r.dam ? <> Held back by {sel.r.dam.n}.</> : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
