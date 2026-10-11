const { parse, write } = require('./common.js');

// Miles from the Flaming Gorge Dam spillway launch (0). Rapids and access from American Whitewater; float-in camps from Recreation.gov.
const d = parse(`
R|1.0|First Anticipation|II|The first of the Section A rapids below the dam.
R|2.0|Steamboat|II|
R|3.5|Rollercoaster|II|
R|5.0|Shelf|II|
R|6.5|Mother-in-Law|II+|The most difficult rapid in Section A, with a sign on the right before it. Reaches Class III at some flows.
R|10.9|Red Creek Rapid|III|The biggest rapid on the run, short and easy to scout. At low flow there are two channels: the right carries most of the water, with holes near the top, two large boulders to avoid and a boulder garden at the exit; the left is shallower and straighter. Red Creek can muddy the river after rain.
R|16.05|Taylor Flat Bridge|-|A low bridge, impassable at 4,500 cfs or higher. Take out before it at Indian Crossing or Bridge Hollow.
R|16.5|Splashy water below the bridge|II|A short splashy section just past Taylor Flat Bridge.
R|25.5|Little Swallow|II|The last rapid in Section C, fun and splashy. A sandy camp sits directly below.

C|7.0|Little Hole camps|L|?|Designated riverside camps on the lower Little Hole trail. Camping and fires are not allowed on the upper trail.
C|8.2|Stonefly I & II|-|?|Foot access along the trail.
C|8.3|Sand|-|?|Foot access along the trail.
C|8.42|Bootleg|-|?|Foot access along the trail.
C|8.55|Cats Paw|-|?|Foot access along the trail.
C|8.75|Cottonwood|-|?|Foot access along the trail. A vault toilet is nearby.
C|9.35|Grasshopper I & II|-|?|Boat access only.
C|9.65|Jackson Creek|-|?|Boat access only.
C|9.9|Cicada|-|?|Boat access only.
C|10.0|Trails End|-|?|Foot access along the trail.
C|10.5|Big Pine I & II|-|?|Boat access only.
C|10.75|Pugmire Pocket|-|?|Boat access only.
C|11.6|Red Creek I & II|-|?|Boat access only. A vault toilet is nearby.
C|12.2|Treetop|-|?|Boat access only.
C|15.4|Indian Crossing|-|?|BLM fee campground with ramp, drinking water, toilets and dump station.
C|16.0|Taylor Flat|-|m|A cottonwood camp above Indian Crossing, once heavily used.
C|16.15|Bridge Hollow Campground|-|m|A BLM fee campground about 400 yards below Indian Crossing, beside the John Jarvie Ranch. Water, toilets, boat ramp and credit card phone.
C|25.6|Little Swallow|-|m|A sandy camp directly below Little Swallow Rapid.
C|29.89|Swinging Bridge Campground|-|?|Browns Park National Wildlife Refuge. Free, no potable water, no direct river access.
C|38.5|Crook Campground|-|?|Browns Park National Wildlife Refuge. Free, no potable water, no direct river access.

H|3.5|Little Hole National Recreation Trail|L|2|Follows the river along all of Section A, from the dam to Little Hole. High flows wash out sections of its boardwalk.
H|16.2|John Jarvie Ranch|L|1|A historic BLM ranch beside Bridge Hollow Campground. Guided tours by arrangement with the Vernal Field Office (435-781-4400).

L|0.0|Spillway boat launch|1|Section A put-in below the dam. A day-use fee applies, with a steep staircase from the parking area to the ramp and a busy commercial fishing fleet.
L|7.0|Little Hole|1|End of Section A. Three boat ramps, restrooms and picnic tables. About 90 percent of the traffic drops off below here.
L|15.4|Indian Crossing|1|End of Section B. A BLM fee area with a boat ramp, drinking water, toilets and a dump station.
L|16.05|Taylor Flat Bridge|0|A low bridge just below Indian Crossing. Signs warn that it cannot be floated at extreme high water.
L|16.15|Bridge Hollow Campground|1|A fee campground with a boat ramp, water and toilets, about 400 yards below Indian Crossing.
L|26.0|Swallow Canyon|1|An optional take-out on Browns Park Road, 25 or more miles from the dam.
L|29.89|Swinging Bridge|1|A take-out in Colorado at Browns Park National Wildlife Refuge, about 3 to 4 miles past Swallow Canyon.
L|38.5|Crook Campground|0|Browns Park National Wildlife Refuge campground.
L|47.42|Gates of Lodore|1|Take-out at the head of Lodore Canyon in Dinosaur National Monument; a free permit from the monument is required to go on.
`);

const permit = {
  status: 'No permit to float · float-in camps reserved on Recreation.gov',
  apply: { label: 'Reserve camps on Recreation.gov', url: 'https://www.recreation.gov/camping/campgrounds/250036' },
  contact: { phone: '435-781-5244', web: 'https://www.fs.usda.gov/r04/ashley/recreation/green-river-camps' },
  sections: [
    {
      name: 'Floating',
      items: [
        { t: 'No permit', d: 'No permit is required for private floating from Flaming Gorge Dam to the Dinosaur National Monument boundary at Lodore. Permits are required for commercial float boating only.' },
        { t: 'Lodore', d: 'Continuing into Lodore Canyon requires a permit from Dinosaur National Monument.' },
        { t: 'Recreation pass', d: 'A Recreational Use Pass is required for the float-in sites, which lie in the Flaming Gorge National Recreation Area.' },
      ],
    },
    {
      name: 'Float-in camps',
      items: [
        { t: 'Section B', d: 'The 17 float-in camps between Little Hole and Browns Park are reserved in advance on Recreation.gov or at the Little Hole boat ramp, and can be reached only on foot or by boat.' },
        { t: 'Section A', d: 'No camping is allowed in Section A.' },
        { t: 'Each camp', d: 'A picnic table, a fire ring with benches, tent pads and a blind for a portable toilet. Vault toilets are near Cottonwood and Red Creek. There is no potable water.' },
      ],
    },
  ],
};

const rules = [
  {
    name: 'Required equipment',
    rules: [
      { t: 'Boats', d: 'Carry a bail bucket, a throw line and an extra oar. Life jackets must be worn on the water.' },
      { t: 'Toilets', d: 'A portable toilet system is required for all campers.' },
      { t: 'Motors', d: 'Motors are not allowed in the float-in camp section.' },
      { t: 'Firewood', d: 'Obtain firewood near your destination and burn it on site to prevent the spread of tree-killing pests.' },
    ],
  },
  {
    name: 'Flows',
    rules: [
      { t: 'Dam releases', d: 'Flows fluctuate daily, roughly from 830 to 4,500 cfs depending on dam releases. The river can drop sharply overnight and strand a boat left floating at the beach.' },
      { t: 'Spring peak', d: 'Reclamation runs at least two weeks of high flow each year, up to about 8,600 cfs, for June sucker spawning.' },
      { t: 'Low bridge', d: 'Taylor Flat Bridge, below Indian Crossing, cannot be passed at 4,500 cfs or higher.' },
    ],
  },
  {
    name: 'Etiquette',
    rules: [
      { t: 'Fishing', d: 'Section A and B hold a heavy trout fishery. Let commercial and fishing groups pass in the narrow stretches.' },
      { t: 'Shuttles', d: 'Flaming Gorge Resort and Dutch John Resort run shuttles to the dam and pickups at Little Hole or Indian Crossing.' },
    ],
  },
];

const access = [
  { name: 'Dutch John', road: true, hub: true, note: 'Nearest town; shuttle base', grid: [2, 2] },
  { name: 'Vernal', road: true, hub: true, note: 'Nearest city', grid: [9, 2] },
  { name: 'Spillway', road: true, mile: 0, park: true, note: 'Section A put-in below the dam', grid: [1, 6] },
  { name: 'Little Hole', road: true, mile: 7, park: true, note: 'End of Section A', grid: [4, 6] },
  { name: 'Indian Crossing', road: true, mile: 15.4, park: true, note: 'End of Section B', grid: [7, 6] },
  { name: 'Swinging Bridge', road: true, mile: 29.89, park: true, note: 'Browns Park refuge take-out', grid: [10, 6] },
];
const roads = [
  { a: 'Dutch John', b: 'Spillway', h: '' },
  { a: 'Dutch John', b: 'Little Hole', h: '' },
  { a: 'Dutch John', b: 'Indian Crossing', h: '' },
  { a: 'Vernal', b: 'Swinging Bridge', h: '' },
];

write('green-flaming-gorge', {
  name: 'Green River',
  reach: 'Flaming Gorge Dam to Gates of Lodore',
  agency: 'USFS Ashley National Forest / BLM Vernal Field Office',
  miles: [0, 47.5],
  days: 4,
  coords: [40.92, -109.4],
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
    { s: 0, e: 7, n: 'Section A' },
    { s: 7, e: 15.4, n: 'Section B' },
    { s: 15.4, e: 47.5, n: 'Section C' },
  ],
  hdiff: { 1: 'Short, easy walk', 2: 'Easy trail', 3: 'Longer hike' },
  access,
  yardGrid: [5, 1],
  roads,
  permit,
});
