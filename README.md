# Eddy

A river-trip planning app: a library of rivers plus any number of trips on them.
Trips (itinerary, crew & crafts, meals, gear, shuttle, ledger, log) are saved
separately and each belongs to a river; the River tab shows map, rapids, camps,
hikes, geology, guide, almanac and rules for the river you pick. Built-in
rivers (22): Grand Canyon (full data) plus Smith, Rogue, Main Salmon, Middle
Fork Salmon, Selway, Hells Canyon, Yampa, Lodore, Green (Flaming Gorge), Desolation-Gray,
Cataract, Westwater, Ruby-Horsethief, Black Canyon, San Juan, Dolores, Rio Chama,
Salt, Illinois, Tuolumne and South Fork American. Each has rapids, camps, access
points, rules, a regional species guide and almanac (history, Indigenous
homeland notes, geology, flows). Camp sizes and ratings, and some hike times, are
still blank where no source gave them.

Add or edit rivers in **River -> Rivers** (form editor, or paste/import river
JSON; "Copy JSON" exports one). Rivers you add or edit are stored with your
trips (localStorage, and the shared db when available).

## Layout

- `src/App.jsx` - the whole app (React, single file)
- `src/rivers.js` - river library (built-ins + `normalizeRiver`)
- `src/shell.html` - page shell: fonts, textures, base CSS, `<div id="root">`
- `src/ui.css` - UI polish layer (type scale, unified form controls, 44px tap targets, cards, buttons); inlined after the shell CSS by the build
- `data/rivers/*.json` - built-in river records
- `data/gear.json`, `data/general.json`, `data/trip.json` - gear catalog, safety reference, seeded Grand Canyon trip
- `build.mjs` - bundles `App.jsx` with esbuild, inlines it into the shell and wraps it in a full HTML document -> `index.html`
- `index.html` - **generated**; this is what GitHub Pages serves. Do not edit by hand.
- `src/TopoMap.jsx` - River > Map > Topo map (Leaflet): terrain basemap, pins, dropped pins, sun & shade day timeline, offline download
- `src/SunChart.jsx` - the skyline-and-sun-path chart for a camp or dropped pin
- `src/geo/` - geo code shared by the app and the build: centerline (`line.js`), sun position and canyon sun times (`sun.js`), horizon casting (`horizon.js`), DEM tiles (`dem.js`) and their offline store (`store.js`), shade worker pool (`shade.js`), per-river state, dropped pins and GPX tracks (`index.js`)
- `data/geo/anchors.json` - per river: known `{mile, lat, lon}` points the centerline is traced between
- `data/geo/<river>.json` - **generated** by `npm run geo`: centerline + a terrain horizon for every camp

## Build

    npm install
    npm run build

## River record shape

`name`, `reach`, `agency`, `miles: [start, end]`, `coords: [lat, lon]` (put-in, for
sunrise/sunset), `tz`, `days` (typical trip length), `access[]` (put-ins,
take-outs, hubs: `{name, mile?, road?, hub?, park?, note?}`), and optional
`rapids[]`, `camps[]`, `hikes[]`, `geology[]`, `guide[]`, `almanac{}`, `rules[]`,
`landmarks[]`, `clusters[]`, `notes{camp,hike}`, `hdiff{}`, `roads[]`. See
`data/rivers/grand-canyon.json`. Missing fields are filled in by `normalizeRiver`.

## Data notes

- Trips have a `river` field (river id); trips without one are Grand Canyon.
- The seed trip is written to localStorage once, guarded by the key
  `eddy.v1.seed2`. If you change the seed trip's shape, bump that key.
- Access points get ids `r0, r1, ...` by position in `access[]`; trips refer to
  launch/take-out by those ids, so append rather than reorder.

## Grand Canyon 2026 trip data

`data/trip.json` (crew, boats, cars, gear with per-person quantities, menu, payments, day notes) and
`data/trips/gc2026-ref.json` (read-only Info tab: constraints, camp jobs, Ceiba Q&A, shopping list,
Crew Council agendas and minutes, education plan, and the sunrise-to-sunrise sky log shown on each
Itinerary day) were generated from the planning spreadsheet. Course logins from the sheet are
deliberately not copied. Seed key `eddy.v1.seed5`: a never-edited seeded trip is replaced; an
edited one keeps its data and only gets the sheet's gear, menu, payments and day notes where empty.
Trip > Trip > "Reload planning-sheet data" replaces everything from the seed.

## Topo map and canyon sun

See `docs/TOPO_MAP_PLAN.md`. In short: elevation comes from the open AWS Terrain Tiles (USGS 3DEP/NED). The
river centerline is traced from that elevation between the anchors in `data/geo/anchors.json`, and every
rapid / camp / hike is placed on it by river mile (camps and hikes pushed to their bank). Each camp gets a
360-degree terrain horizon at build time, which gives "direct sun in camp" times for any date with no
network.

    npm run geo                 # every river with anchors (DEM tiles cache in .cache/dem)
    npm run geo -- grand-canyon # one river
    node scripts/geo/preview.mjs grand-canyon 130 140 out.png   # eyeball the line and pins on a hillshade

Surveyed GPS positions beat mile placement. To add them (from a guidebook GPX, a GIS export, or pins dropped
on a trip and exported from the app):

    node scripts/geo/import-coords.mjs grand-canyon camps.gpx           # dry run: shows each match
    node scripts/geo/import-coords.mjs grand-canyon camps.gpx --write   # saves data/geo/coords/grand-canyon.json
    npm run geo -- grand-canyon

Each matched camp then uses its GPS position for the map and its horizon, and also becomes a mile mark that
re-calibrates the river miles around it.

Offline: River > More (or Offline on the topo map) downloads a river's terrain, about 130 MB for the Grand
Canyon (10 km either side at full detail, wider at lower detail). On the iPhone it is saved as files in the
app's data folder (`src/geo/store.js`); on the web, in Cache Storage. The map, sun & shade and dropped pins
read only from there when there's no signal.

Rerun `npm run geo` after adding or renaming camps (horizons are keyed by `name@mile`). The trace report
prints traced vs official miles per segment; a `climb` warning means the path left the canyon floor, which
needs an extra anchor between those two.
