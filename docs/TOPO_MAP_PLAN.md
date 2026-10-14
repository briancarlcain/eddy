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

Round 2 (after first review):
- **No editing of rapids or camps on the device.** Their positions come from the data: a surveyed GPS point
  when there is one (`data/geo/coords/<river>.json`, from `scripts/geo/import-coords.mjs`), otherwise the
  river mile. Every surveyed point also becomes a mile mark that re-calibrates the line around it.
- **Drop pin / My location**: any spot gets its own terrain horizon computed on the device (from saved
  terrain when offline), its sun times for any date, a skyline-and-sun-path chart, and "near mile 94.1, river
  right, 574 ft from the river". Pins export as GPX, which is also how camp positions recorded on a trip get
  back into the data.
- **Day timeline**: Sun & shade precomputes the whole day in 10-minute frames in a worker pool (Grand
  Canyon view: ~2 s for 60 frames in desktop Chromium), so the slider scrubs instantly and ▶ plays the day. The
  last opened camp or pin shows its direct-sun spells along the slider.
- **Wider terrain**: the offline pack is 10 km either side at z13 (~15 m), 15 km at z12 and 25-30 km below,
  which covers both rims and the terrain beyond (1,256 tiles, ~130 MB for the Grand Canyon). Online, the map
  goes anywhere.
- **Offline on the iPhone**: terrain is saved as files in the app's data folder (Capacitor Filesystem; iOS
  doesn't purge it), downloaded natively straight to disk, and read back through the WebView's file URL.
  Requests time out after 6 s and back off for a minute, so a weak signal doesn't stall the map. Tested in
  Chromium with all map traffic blocked, on both the browser store and the Filesystem store: terrain draws at
  every zoom, the day shades, and dropped pins get horizons.
- Satellite (USGS imagery) and USGS Topo layers for checking the line and camps by eye (online only).

Still open:
- [x] The other 21 rivers: centerlines from the USGS hydrography main stem with the guide's miles pinned by GNIS name matches (`scripts/basin/centerline.py` -> `data/geo/nhd/<id>.json`), then `npm run geo -- <id>` for positions and camp horizons. Rivers without name matches (Rio Chama, Flaming Gorge, Westwater, Ruby-Horsethief) run on the put-in, take-out and trip length; a few GNIS-matched ones fit to within 0.3-1 km (see the script's report).
- [ ] Surveyed camp coordinates for the Grand Canyon (see "Higher resolution and accuracy" below).
- [ ] 1 m lidar at build time for camp horizons (USGS 3DEP `AZ_GrandCanyonNP_2019` and others cover parts of
  the canyon).
- [ ] Sync dropped pins and GPX tracks through the shared db (today they're per device).

## Higher resolution and accuracy

- On device the terrain is USGS 3DEP 1/3 arc-second (~10 m), drawn at up to ~15 m per pixel offline. For
  canyon-wall shade that's the right size: the walls are hundreds of metres tall, and phones can hold it.
- USGS has **1 m lidar** for parts of the Grand Canyon (`AZ_GrandCanyonNP_2019_B19`, 51 tiles, plus
  Coconino / Navajo Nation / Mohave projects). It is far too large to ship (many GB), but it could sharpen each
  camp's horizon at build time (close ledges and boulders) and refine the river line.
- The river line is traced from the 10 m terrain between surveyed anchors (within 3.5% of official miles
  everywhere). Pins placed by mile can still be a few hundred feet along the river from the real camp. The
  fix is surveyed GPS per camp, and the importer and calibration are built for it. Satellite view lets you
  eyeball both the line and the pins.

## Phases

1. Geo pipeline + Grand Canyon anchors, centerline, placement, horizons. *(this build)*
2. Sun engine + sun-on/off times in Camps, the camp sheet and the Itinerary. *(this build)*
3. Topo map view with DEM rendering, river and pins. *(this build)*
4. Shade overlay with date and time. *(this build)*
5. Offline tile cache + download, CSP. *(this build)*
6. Move pin + GPX tracks. *(this build, if time allows)*
7. The other 21 rivers. *(done: NHD main stem calibrated with GNIS points instead of DEM-traced anchors, which also avoids shortcuts across meanders in wide valleys)*
8. Later: NHD/OSM centerline import for accuracy, trail import, 3D terrain view.
