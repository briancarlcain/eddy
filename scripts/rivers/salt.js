const { parse, write } = require('./common.js');

// Miles from First Campground at the Highway 60 bridge (0), per American Whitewater.
const d = parse(`
R|0.0|Apache Falls|V|A large, nearly unrunnable ledge a quarter mile above the Highway 60 bridge. Boating upstream of it is prohibited by the White Mountain Apache Tribe.
R|0.68|Island Rapid|III|A wave train with holes. Below 1,200 cfs use the First Campground access to avoid it.
R|0.95|Kiss and Tell|II|A short drop over a cobble bar just below the put-in.
R|1.81|Bump and Grind|II|A drop over a gravel bar. Route choice matters at low water.
R|2.0|Maytag|III|An island splits the flow. The deepest channel is river right.
R|2.5|Grumman|III|A wave train with a big hole on river left.
R|2.81|Mother Rock|II|A boulder in the channel. The main line is right.
R|3.19|Overboard|III|A shallow shoal on river left. Run the chute to the far right bank.
R|6.4|Exhibition|III|A big wave train with play waves.
R|7.24|Cibecue Rapid|II|Formed by outwash from Cibecue Creek.
R|7.92|Three Way|II|Islands split the flow, most going river right.
R|8.42|Raft Ripper|II|Boulders to avoid, especially at low flows.
R|9.42|Mescal Falls|III|A rock-strewn wave train with occasional play holes.
R|10.81|Salt Banks|II|A cobble bar pushes the flow right. Saline deposits at the bottom on river right.
R|11.08|Ledges|III|Low-angle quartzite ledges with good play waves and holes.
R|11.68|Little Boat Eater|II|Avoid the hydraulic on river left over a rock ledge.
R|12.69|Rock Garden|II|Many rocks to navigate.
R|14.13|The Cheese|II|A cobble bar just above Rat Trap.
R|14.2|Rat Trap|III|A long rapid with large exploding waves and holes. The start of the micro canyon. Trip reports describe swims and difficult current crossings.
R|14.39|White Rock|III|Polished boulders, boiling eddies, and irregular waves and holes.
R|16.77|Granite|III|The largest rapid in the micro gorge, the final drop before Gleason Flat.
R|19.91|Gleason|II|A minor rapid above South Gleason access.
R|22.07|Eye of the Needle|IV|A pinch over a ledge with a powerful hole. Scout river left. Oars have snapped here when not fully stowed.
R|22.71|Black Rock|IV|The final rapid of a small micro gorge, with sharp boulders and ledges; the line varies with flow. Rafts run near river right over a six-foot pourover; kayaks drop the ledge or punch the hole on river left. An undercut rock follows. Rafts scout from upstream river right, kayaks from river left.
R|27.12|Devils Pendejo|III|A huge boulder splits the flow. Rafts go right; hard boats can take slots left.
R|27.67|Upper Corral|II|Easy, with boulders and cobbles.
R|29.7|Lower Corral|III|A wave train with a huge center hole at higher flows. Marks the boundary of tribal lands and Tonto National Forest.
R|29.93|Pinball|III|Large waves, holes and boiling eddies. Do not swim here: it leads into the Maze.
R|30.28|The Maze|IV|A pair of big holes on river left, then a turn right into a narrow canyon with boiling eddies. Hard to swim or flip here.
R|32.17|Quartzite Falls|IV|Once Class V, now Class IV after being blasted. A shallow hole at the base on river right can flip loaded rafts. Scout from the ridge on river left. The standard line is center right, with a lateral from the right needing a pivot. A short recovery pool precedes Corkscrew.
R|32.29|Corkscrew|IV|A complex wave train with a huge hole and exploding waves; rafts can flip at high water. Portage on river left.
R|32.44|Sleeper|III|An easy line right after a hole near the top right.
R|34.77|Cliffhanger|II|A shoal with a huge rock in the main flow. The eddy on river left is hard to escape in a raft.
R|39.53|Horseshoe Bend|II|A gravel bar rapid at a right bend.
R|44.37|Redmond|II|A minor riffle, the end of the whitewater.
R|44.75|Coon Creek|II|
R|53.55|Diversion Dam|V|A 3-foot dam with a lethal hole. Take out at the bridge above it.

C|0.0|First Campground|R|m|The put-in camp, with separate public and outfitter launches. Good for the night before.
C|6.07|Second Campground|R|m|A designated primitive tribal campground, popular with outfitters on day trips.
C|7.3|Below Three Way|-|?|
C|14.8|Unmarked camp|-|?|
C|25.4|Above Hess|-|?|
C|35.9|Mile 36 camp|-|?|
C|44.6|Coon Creek|-|?|

H|16.65|Canyon Creek|-|2|A lunch stop and hike; boatable at higher flows.
H|36.31|Cherry Creek|R|2|A side hike with clear water.
H|44.75|Coon Creek|-|3|A side hike; the ridge hike over to Dry and Chalk Creeks takes a few hours.

L|0.0|First Campground|1|Put-in on river right at the Highway 60 bridge, on Apache Road 1. Separate public and outfitter launches.
L|6.07|Second Campground|1|A primitive tribal campground with river access.
L|6.9|Cibecue Creek access|1|Can wash out in Cibecue Creek floods.
L|9.71|Mescal access|1|Unimproved; the end of the day-trip section.
L|10.09|Hoodoo access|1|Unimproved; the last option at the end of the day-trip section.
L|19.9|South Gleason access|1|By a 4WD road off FR 303B. Wilderness boundary: the Tonto wilderness permit applies below this point.
L|29.7|Tribal land boundary|0|The White Mountain Apache reservation ends and Tonto National Forest begins.
L|39.53|Horseshoe Bend|1|Alternate access and a tuber launch in summer.
L|52.68|Highway 288 bridge|1|Take-out on river left just below the bridge, with a ramp. Diversion Dam lies below.
`);

const permit = {
  status: 'Lottery · March 1 to May 15 · plus tribal permit',
  apply: { label: 'Apply on Recreation.gov', url: 'https://www.recreation.gov/permits/249275' },
  contact: { phone: '928-402-6236', web: 'https://www.fs.usda.gov/r03/tonto/permits/salt-river-canyon-wilderness' },
  sections: [
    {
      name: 'How to get one',
      items: [
        { t: 'Apply', d: 'Apply on Recreation.gov from December 1 to January 31. One application per person. The lottery application fee is $16, non-refundable ($10 for the Wilderness River Program and $6 reservation).' },
        { t: 'Pay', d: 'Lottery winners pay the $125 permit fee by February 20.' },
        { t: 'Leftover', d: 'Unclaimed dates are first come, first served at $125 plus a reservation fee, and cancelled dates are posted at a random time within 24 hours.' },
        { t: 'Season', d: 'A permit is required from March 1 to May 15 for the wilderness section below South Gleason access.' },
      ],
    },
    {
      name: 'Tribal permit',
      items: [
        { t: 'White Mountain Apache', d: 'A tribal permit is required for the roughly 29 miles through the Fort Apache Indian Reservation, from the Highway 60 put-in down to the Tonto National Forest boundary. For multiday trips buy two days. Call 928-338-4385 for costs and rules. The tribe enforces it.' },
        { t: 'Upstream', d: 'Whitewater boating is prohibited upstream of Apache Falls.' },
      ],
    },
    {
      name: 'Limits and cancelling',
      items: [
        { t: 'Group', d: 'Up to 15 people. The permit holder must be 18 or older and on the trip with the signed permit. Everyone carries photo ID. Non-commercial only.' },
        { t: 'Launch', d: 'Launch only on the date on the permit.' },
        { t: 'Cancel', d: 'Cancel at least 21 days before launch for a refund. To change the date, cancel and rebook.' },
      ],
    },
  ],
};

const rules = [
  {
    name: 'Required equipment',
    rules: [
      { t: 'Fire pan', d: 'A fire pan with sides at least 3 inches high; all fires stay in it. Self-supporting kayak trips may use a fire blanket.' },
      { t: 'Toilet', d: 'A portable toilet system. All solid waste is carried out.' },
      { t: 'Life jackets', d: 'A life jacket for each person; the Coast Guard recommends Type III or V.' },
    ],
  },
  {
    name: 'Rules',
    rules: [
      { t: 'Wood', d: 'Collect only dead and down wood. Cutting or stripping limbs is prohibited.' },
      { t: 'Motors', d: 'Motorized equipment and boats are prohibited.' },
      { t: 'Plants', d: 'Possessing or transporting native plants is prohibited.' },
      { t: 'Litter', d: 'Pack out all trash and food remains.' },
    ],
  },
  {
    name: 'Safety',
    rules: [
      { t: 'Flows', d: 'Gear rafts need about 1,200 cfs or more; kayaks and packrafts run down to about 400. Water can rise to flood stage within hours.' },
      { t: 'Scout', d: 'Scout Eye of the Needle, Black Rock and Quartzite Falls. Do not swim Pinball into the Maze.' },
      { t: 'Diversion Dam', d: 'Take out at the Highway 288 bridge. Diversion Dam just below has a lethal hole.' },
      { t: 'Remote', d: 'There is no cell service in the canyon.' },
    ],
  },
];

const access = [
  { name: 'Show Low', road: true, hub: true, note: 'Nearest city to the put-in', grid: [3, 2] },
  { name: 'Globe', road: true, hub: true, note: 'Nearest city to the take-out', grid: [9, 2] },
  { name: 'First Campground', road: true, mile: 0, park: true, note: 'Put-in at the Highway 60 bridge', grid: [1, 6] },
  { name: 'South Gleason', road: true, mile: 19.9, park: false, note: '4WD access; wilderness boundary', grid: [5, 6] },
  { name: 'Highway 288', road: true, mile: 52.68, park: true, note: 'Take-out with a ramp', grid: [10, 6] },
];
const roads = [
  { a: 'Show Low', b: 'First Campground', h: '' },
  { a: 'Globe', b: 'Highway 288', h: '' },
  { a: 'Globe', b: 'First Campground', h: '' },
];

write('salt', {
  name: 'Salt River',
  reach: 'Highway 60 to Highway 288',
  agency: 'USFS Tonto National Forest / White Mountain Apache Tribe',
  miles: [0, 53],
  days: 4,
  coords: [33.8, -110.45],
  tz: 'America/Phoenix',
  camps: d.camps,
  rapids: d.rapids,
  hikes: d.hikes,
  geology: [],
  guide: [],
  almanac: {},
  rules,
  landmarks: d.landmarks,
  clusters: [
    { s: 14.1, e: 16.8, n: 'Micro gorge' },
    { s: 29.7, e: 32.5, n: 'Pinball to Sleeper' },
  ],
  hdiff: { 1: 'Short, easy walk', 2: 'Easy trail', 3: 'Longer hike' },
  access,
  yardGrid: [5, 1],
  roads,
  permit,
});
