# Topographic map, real coordinates, and canyon-shade sun times

Goal: a real topo map of each river with rapids, camps and hikes at true GPS positions, hiking tracks, and a
terrain-aware sun model: when the sun actually leaves (and reaches) each camp behind the canyon walls, plus
a map overlay showing what is in sun or shade for a chosen date and time.

## What we have and what's missing

- Every rapid, camp and hike is located by **river mile only** (plus bank L/R). There are no coordinates.
- Sunrise/sunset uses a flat horizon at one point per river (`RIVER.coords`), so on the Grand Canyon it can be
  off by hours.
- The current Map tab is a schematic mile chart. It stays as-is; the topo map is a second view.

## Data sources

| Need | Source | Notes |
| --- | --- | --- |
| Elevation (DEM) | AWS Terrain Tiles, Terrarium PNG (`s3.amazonaws.com/elevation-tiles-prod`) | Open data, no key, CORS `*`, zoom 0-15. US coverage is USGS NED 1/3" (~10 m). The map, the shade overlay and the build scripts all use it. |
| River centerline | **Traced from the DEM** | A least-cost path along the canyon floor between anchor points. No hydrography service is needed (NHD/OSM can replace it later if wanted). |
| Item coordinates | River mile, interpolated along the centerline and pushed to the bank | The fix for "the camp is on a cliff": a pin sits on the river edge, never on the wall. A hand-set `ll` always wins. |
| Hiking tracks | GPX import in the app (from Gaia, CalTopo, AllTrails or a recorded track), plus an optional `track` field in river JSON | No open trail service is reachable from the build environment, so tracks come from the user. |
| Basemap | DEM-rendered topo (hypsometric tint + hillshade + contours) drawn on device | Works offline from the same tiles. An optional USGS Topo raster layer is available when online. |

## Pipeline (build time, `scripts/geo/`)

1. **Anchors** (`data/geo/anchors.json`): per river, a list of `{mile, lat, lon, name}` points such as put-in,
   take-out and big confluences. They only need to be within ~250 m of the river; each one snaps to the lowest
   nearby cell.
2. **Trace** (`trace.mjs`): Dijkstra over the z13 DEM (~15 m cells) between consecutive anchors. Step cost is
   `exp((z - z_river)/12 m)`, so leaving the canyon floor is prohibitively expensive. The result is smoothed,
   simplified (Douglas-Peucker, 8 m) and mile-calibrated piecewise between anchors. The report prints
   traced/official length per segment; a scale far from 1.0 means a bad anchor.
3. **Place** (`place.mjs`): for each rapid, camp, hike and landmark, interpolate the mile on the line. Camps
   and hikes are offset perpendicular to the flow toward their bank (river right = right facing downstream)
   by about half the river width.
4. **Horizon** (`horizon.mjs`): for each camp, cast 180 rays (every 2°) out to 25 km over the DEM, from 2 m
   above the local valley floor, with earth curvature and refraction. Store the max elevation angle per
   azimuth at 0.25° resolution: 180 bytes per camp, base64 in the geo file.
5. Output: `data/geo/<river>.json` with `{line, items, horizons}`, imported by `src/rivers.js` next to the
   river record.

## Sun model (runtime, `src/geo/sun.js`)

- Solar position (NOAA algorithm: altitude and azimuth) for any instant.
- **Sun on / sun off a camp**: walk the day in 2-minute steps and compare sun altitude with the camp's
  horizon angle at the sun's azimuth (interpolated). This gives the first and last direct sun, and total hours
  of direct sun. Flat-horizon sunrise/sunset is shown alongside.
- Shown on: Camps list and camp detail ("Sun leaves camp 3:41 pm · sky sunset 6:02"), each Itinerary day for
  the planned camp, and the camp picker.
- Limits: DEM resolution (~10-15 m) misses overhangs, trees and single boulders. A camp's pin is mile-based
  unless corrected, but walls are far enough away that a pin 50 m off moves times by only a few minutes.

## Topo map (runtime)

- Leaflet 1.9 (small, touch-friendly, bundled, no CDN). New **Topo** view on the River > Map tab, next to the
  existing chart.
- A custom canvas tile layer decodes Terrarium tiles and draws tint, hillshade and contours (interval chosen
  by zoom).
- Overlays: river centerline, rapids, camps (colored by quality, planned camps highlighted), hikes and their
  GPX tracks. Tapping a pin opens the existing detail sheet.
- **Shade mode**: a date (defaults to today or the selected trip day) and a time slider (sunrise to sunset).
  For the visible area plus a margin, the app builds a DEM mosaic and ray-marches each cell toward the sun
  (cast shadow), combined with self-shading (slope facing away from the sun). The work runs in a Web Worker
  and the result is drawn as a translucent overlay.

## Offline

There's no signal on the river, so this matters:
- DEM tiles are fetched through a cache layer (Cache Storage) that both the map and shade mode read.
- **Download for offline** on the topo view prefetches tiles z8-z13 along a corridor around the centerline
  (Grand Canyon: roughly 25-40 MB).
- The sun-off-camp times need no tiles at all: horizons ship inside the app.
- The iOS build's Content-Security-Policy gains `https://s3.amazonaws.com` (connect/img) and the USGS host.

## Corrections in the app

- **Move pin**: from a camp or hike sheet on the topo map, tap the true spot. The override is stored per
  river on the device (and synced with the river record later). A moved camp gets its horizon recomputed on
  device from DEM tiles.
- **Attach GPX** to a hike: parse `<trkpt>`/`<rtept>` and draw the track with its length and elevation gain.

## Status

Built and checked in headless Chromium against the real app (Grand Canyon):

- [x] **Phase 1, pipeline.** 8 anchors; every traced segment is within 3.5% of official miles and climbs ≤ 9 m off
  the river (a first run caught the Deer Creek loop leaving its search box, which is now guarded by the climb check).
  272 camp horizons. `data/geo/grand-canyon.json` is 88 KB.
- [x] **Phase 2, sun.** NOAA solar position checked against Flagstaff (05:14 / 19:46 on the June solstice,
  published 05:10 / 19:47). Shown in Camps (date picker), the camp sheet, the camp picker ("sun off 3:52 PM"),
  and Itinerary days (morning = camp you woke at, evening = tonight's camp; "no sun" when the walls win).
- [x] **Phase 3, topo map.** River > Map > Mile chart | Topo map. Pins show from zoom 11; planned camps show at
  every zoom. Optional USGS topo layer (online).
- [x] **Phase 4, shade overlay.** Date + time slider; cast shadow plus self-shading in a worker.
- [x] **Phase 5, offline.** Cache Storage for every DEM read, plus a corridor download (Grand Canyon: 656 tiles,
  ~70 MB). iOS CSP allows the tile hosts.
- [x] **Phase 6, corrections.** Move pin (a camp's horizon is recomputed on device) and Reset pin; GPX attach /
  replace / remove on hikes with length and gain.
- [ ] **Phase 7, other rivers.** Each needs anchors in `data/geo/anchors.json`, then `npm run geo -- <id>`.
- [ ] Check on an iPhone: Cache Storage inside the Capacitor WebView (if it's missing there, the map still works
  online but Download reports no offline storage; the fallback is Capacitor Filesystem).
- [ ] Sync moved pins and GPX tracks through the shared db (today they're per device).
- [ ] Offline download limited to the trip's put-in / take-out miles, instead of the whole river.

## Phases

1. Geo pipeline + Grand Canyon anchors, centerline, placement, horizons. *(this build)*
2. Sun engine + sun-on/off times in Camps, the camp sheet and the Itinerary. *(this build)*
3. Topo map view with DEM rendering, river and pins. *(this build)*
4. Shade overlay with date and time. *(this build)*
5. Offline tile cache + download, CSP. *(this build)*
6. Move pin + GPX tracks. *(this build, if time allows)*
7. Anchors for the other 21 rivers (put-in, take-out and a few confluences each), then rerun the pipeline.
   Needs verified coordinates, so it's a follow-up.
8. Later: NHD/OSM centerline import for accuracy, trail import, 3D terrain view.
