const { parse, write } = require('./common.js');

// Miles from Bradfield Bridge (0). Mountain Sheep Point is 19.2, Slickrock 47, Bedrock 95.8.
// Upper rapids are American Whitewater miles from Mountain Sheep Point (+19.2); lower rapids are from Slickrock (+47).
const d = parse(`
R|2.0|Ponderosa Gorge|II|The first ten miles run Class II through ponderosa pine and Douglas fir on the benches above the river.
R|22.4|Cottonwood|III-|
R|22.9|Lunchbox|III+|
R|24.0|Molly's Turn|III-|
R|24.9|Ionesco|III-|
R|26.3|Little Snag|III+|
R|27.2|Snaggletooth|IV+|The biggest rapid on the upper river, with the line changing with flow, and it has been portaged as often as run. Easy to run into before you realize it: approach carefully and scout from river left. A dirt road on river left offers a portage.
R|27.4|Island|II+|Long and continuous. Below about 800 cfs exposed rocks create hazards for rafts.
R|28.0|The Wall (Cannonball)|IV-|A bedrock wall at the bottom right requires a hard left pull.
R|38.4|The Narrows|III-|
R|65.8|Bull Canyon|II|An outwash rapid entering from river right; much bigger than usual at high flows.
R|67.0|Sleeping Rock|III-|Emerges at flows under 1,000 cfs; easier at higher flows.
R|81.2|Spring Canyon|III|An outwash rapid. A hike to a pool and grotto about a mile up the canyon.
R|90.9|One Holer|III+|Stay left of the island to reach the hole at the bottom.
R|91.6|La Sal|III|Above La Sal Canyon. Scout it, especially at lower flows.
R|92.7|S-Curve|III+|
R|94.1|Madame Curie|II+|

C|0.25|Bradfield Recreation Site|L|m|A campground a quarter mile below the bridge, with toilets, potable water, a ramp and parking. $8 a night.
C|19.5|Box Elder|-|s|Limited primitive camping just below Mountain Sheep Point Recreation Site. No fee.
C|23.0|Roadside camps|L|m|An unimproved dirt road runs along river left for the first half of this reach, with roadside campsites.
C|25.0|River-right camps|R|s|A couple of good campsites on river right.

H|81.2|Spring Canyon|-|2|A hike to a pool and grotto about a mile up the canyon.
H|91.6|La Sal Canyon|-|2|A side canyon hike below La Sal Rapid.

L|0.0|Bradfield Bridge|1|Put-in. Bradfield Recreation Site is on river left a quarter mile below the bridge, about 6 miles east of Cahone. Sign in at the put-in. Likely the 1776 camp of the Dominguez-Escalante expedition.
L|19.2|Mountain Sheep Point|1|Recreation site with a ramp, toilets and limited parking, also called Dove Creek Pump Station. Reached by County Road J from Highway 666. A common stopping point and take-out for a one-day trip of 19 miles.
L|47.0|Slickrock|1|The Highway 141 bridge. The access is on private land, with a landowner fee of $10 per day for parking and launching. Once in Slick Rock Canyon, exits are limited.
L|60.65|Gypsum Valley|1|BLM boat ramp on river right, reached by Highway 20 off Highway 141. Skips about 14 miles through private ranchland.
L|95.8|Bedrock|1|Take-out on river left just upstream of the Highway 90 bridge. Beyond it the river continues 10 miles to the San Miguel confluence and on to Gateway.
`);

const permit = {
  status: 'No permit · sign in at the put-in',
  apply: { label: 'Lower Dolores permit (Recreation.gov)', url: 'https://www.recreation.gov/permits/621749' },
  contact: { phone: '970-882-7296', web: 'https://www.blm.gov/visit/dolores-river-co' },
  sections: [
    {
      name: 'This reach',
      items: [
        { t: 'No permit', d: 'Permits are not required to float the Dolores in Colorado. Boaters sign in at the put-in.' },
        { t: 'Group size', d: 'Groups are limited to 25 people.' },
        { t: 'Overnight', d: 'Overnight trips need a fire pan, a portable toilet and a dishwater strainer.' },
        { t: 'Fees', d: 'Bradfield campsites are $8 a night. Slickrock parking and launching is $10 a day, paid to the landowner.' },
      ],
    },
    {
      name: 'Below Gateway',
      items: [
        { t: 'Gateway to Dewey Bridge', d: 'A free permit is required year-round for private trips from Gateway, Colorado, to Dewey Bridge, Utah, through Recreation.gov (or by phone to the Moab office at 435-259-7012, 8 a.m. to noon weekdays). The trip leader signs and carries it.' },
      ],
    },
  ],
};

const rules = [
  {
    name: 'Flows',
    rules: [
      { t: 'McPhee Dam', d: 'The river runs only when McPhee Dam releases. The season is usually April to early June, depending on snowpack, and can be short or absent. Check the Dolores Water Conservancy District for the release schedule.' },
      { t: 'Minimums', d: 'About 200 cfs for canoes, kayaks and duckies; 800 cfs for rafts under 14 feet; 1,000 cfs for larger rafts.' },
      { t: 'Peak', d: 'Flows generally peak late April to early May. Releases of about 3,400 cfs have been reported in May.' },
    ],
  },
  {
    name: 'Safety',
    rules: [
      { t: 'Scout', d: 'Scout Snaggletooth and The Wall, and La Sal Rapid at lower flows. Snaggletooth is easy to run into before you realize it.' },
      { t: 'Vegetation', d: 'Willows have encroached on the channel in low-flow years, making it harder to eddy out and reach camp.' },
      { t: 'Remote', d: 'Once in Slick Rock Canyon, exit options are limited.' },
      { t: 'Water', d: 'The Dolores and its tributaries are not fit to drink. Bring your drinking water.' },
    ],
  },
  {
    name: 'Land',
    rules: [
      { t: 'Private land', d: 'Much of the first 15 miles below Slickrock crosses private ranch land. Respect landowners; the BLM manages the river corridor.' },
      { t: 'Camps', d: 'Campsites in Slick Rock Canyon are infrequent because of surrounding private land, and popular ones fill quickly.' },
    ],
  },
];

const access = [
  { name: 'Cortez', road: true, hub: true, note: 'Nearest city to the put-in', grid: [2, 2] },
  { name: 'Grand Junction', road: true, hub: true, note: 'Nearest large city to the take-out', grid: [9, 2] },
  { name: 'Bradfield Bridge', road: true, mile: 0, park: true, note: 'Put-in', grid: [1, 6] },
  { name: 'Mountain Sheep Point', road: true, mile: 19.2, park: true, note: 'Mid-point access, one-day take-out', grid: [3, 6] },
  { name: 'Slickrock', road: true, mile: 47, park: true, note: 'Private land; $10 a day', grid: [5, 6] },
  { name: 'Gypsum Valley', road: true, mile: 60.65, park: true, note: 'BLM ramp', grid: [7, 6] },
  { name: 'Bedrock', road: true, mile: 95.8, park: true, note: 'Take-out above the Highway 90 bridge', grid: [10, 6] },
];
const roads = [
  { a: 'Cortez', b: 'Bradfield Bridge', h: '' },
  { a: 'Cortez', b: 'Mountain Sheep Point', h: '' },
  { a: 'Grand Junction', b: 'Bedrock', h: '' },
  { a: 'Grand Junction', b: 'Slickrock', h: '' },
];

write('dolores', {
  name: 'Dolores River',
  reach: 'Bradfield Bridge to Bedrock',
  agency: 'BLM Tres Rios Field Office / San Juan National Forest',
  miles: [0, 96],
  days: 5,
  coords: [37.85, -108.7],
  tz: 'America/Denver',
  camps: d.camps,
  rapids: d.rapids,
  hikes: d.hikes,
  geology: [],
  guide: [],
  almanac: {},
  rules,
  landmarks: d.landmarks,
  clusters: [
    { s: 0, e: 19.2, n: 'Ponderosa Gorge' },
    { s: 19.2, e: 47, n: 'Dove Creek to Slickrock' },
    { s: 47, e: 95.8, n: 'Slick Rock Canyon' },
  ],
  hdiff: { 1: 'Short, easy walk', 2: 'Easy trail', 3: 'Longer hike' },
  access,
  yardGrid: [5, 1],
  roads,
  permit,
});
