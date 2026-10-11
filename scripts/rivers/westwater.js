const { parse, write } = require('./common.js');

// Miles from the Westwater Ranger Station (0) to the Cisco boat ramp (17.55).
const d = parse(`
R|4.3|Little Wild Horse Rapids|II|Several small rapids between miles 3.7 and 4.9, a warm-up for the canyon.
R|4.72|Wild Horse Rapids|II|A cobble stretch; some rock-dodging at low water.
R|7.43|Little Dolores Rapids|II+|A two-part rapid at the Little Dolores confluence, with a large hole center right that is easy to avoid but hard to recognize. A good kayak play wave in the second half.
R|8.7|Marble Canyon Rapids|III|The first significant canyon rapid: a long wave train with a left bend, fun down the right side.
R|8.96|Staircase Rapids|III|
R|9.6|Big Hummer Rapids|III|
R|9.85|Funnel Falls|III|The first rapid of the main gorge, formed by two boulders. Run left, center or right depending on the water level; most challenging at high water.
R|10.08|Surprise Rapids|III|Two parts, mostly two steep wave trains.
R|10.43|Skull Rapid|IV|The most consequential rapid, with a boulder jumble on the left, a steep wall on the right and a distinct horizon line; a small eddy to scout. Below about 4,000 cfs a large center rock forces a squeeze between rock and wall; above that, run center to left, and don't pull left too early. At medium to high flow the center forms a large hole that has flipped rafts. Room of Doom, a circling eddy on river right, can trap boats above about 6,000 cfs and has no exit above 10,000.
R|10.76|Bowling Alley|III|
R|10.91|Sock It To Me|III|The largest wave train in the canyon, with a meaty wave-hole. It angles right to left, so start from the right and hit the entrance hard and straight, then pull right to avoid the wall.
R|11.07|Last Chance Rapid|III|A boulder in the center splits the channel. At 3,000 to 4,000 cfs left and right both work, the right steep and bumpy. The last rapid in the canyon.

C|0.0|Westwater campground|-|?|At the put-in. Sites 1 to 7 are first come, first served, $20 a night, along the river; sites 8 to 11 and a group site for up to 30 are reserved on Recreation.gov.
C|4.17|Miners Camp|-|l|A large camp with 4WD roads and washes for hiking into the desert. About halfway through the upper flatwater.
C|4.89|Folley's Camp|-|s|
C|5.97|Upper Cougar Bar|-|l|A large camp with a small sandy beach.
C|6.2|Lower Cougar Bar|-|s|A small camp usable at low water only. A wash leads uphill to an overlook of the Little Dolores River.
C|7.08|Little Hole|-|l|A large camp across from Little Hole. Ferry across to hike the petroglyphs.
C|7.39|Upper Little Dolores|L|l|A large, popular camp with hikes up the Little Dolores, a spring waterfall, and eddy service to the Little D surf wave.
C|7.58|Lower Little Dolores|L|l|A second large, popular camp. At low and medium water you carry gear across a brushy cobble bar and up a hill.
C|7.8|Hades Bar|-|s|A small camp with a rocky beach.
C|12.04|Big Hole|-|xs|Good for exploring on foot but with very little room.
C|13.77|Big Horn|R|l|A large camp with rock walls on both sides of a beach.
C|14.77|Bald Eagle|-|l|A large camp with a nice beach.

H|4.0|Miner's cabin|L|1|A small cabin reached by a short hike. Look but do not touch.
H|7.08|Little Hole petroglyphs|-|2|Ferry across from Little Hole Camp.
H|7.39|Little Dolores River|L|2|Hike upstream from Upper Little Dolores Camp to a spring waterfall about three quarters of a mile up.
H|8.2|Outlaw Cave|L|1|A small cave, once the home of two outlaws, with historical artifacts. Do not touch.
H|12.4|Schist canyon exit hike|R|2|A short hike out of the schist canyon for a view of the canyon within a canyon.

L|0.0|Westwater Ranger Station|1|Put-in with a boat ramp, campground, pit toilets and trash and recycling. Check in with the ranger for a campsite assignment.
L|3.35|Good Luck Wall|0|A large cliff face coming straight down to the river on the right. Tradition is to touch it for luck.
L|7.7|Little Dolores River|0|The Little Dolores enters on the left. The last campsites above the rapids.
L|17.5|Cliff hole|0|A large hole in the cliff face on river right near the take-out, a popular bouldering problem.
L|17.55|Cisco boat ramp|1|Take-out with a three-lane concrete ramp, pit toilets, dumpsters and overnight parking. Fish Ford, 5 miles farther, is an optional lower take-out.
`);

const permit = {
  status: 'Required year-round · reserved on Recreation.gov',
  asOf: 'October 2026',
  apply: { label: 'Reserve on Recreation.gov', url: 'https://www.recreation.gov/permits/621744' },
  contact: { phone: '435-259-2100', web: 'https://www.blm.gov/visit/westwater-canyon' },
  sections: [
    {
      name: 'How to get one',
      items: [
        { t: 'Reserve', d: 'Private permits open on Recreation.gov two months before the launch date at 8 a.m. Mountain. Any open date can be reserved until 11:59 a.m. on the launch day.' },
        { t: 'Print', d: 'Permits can be printed starting 14 days before launch. No changes are allowed after printing.' },
        { t: 'Check in', d: 'At the Westwater Ranger Station a ranger checks your permit and equipment and assigns a campsite. If no ranger is on duty, self-register at the kiosk by the boat ramp.' },
        { t: 'Walk-up', d: 'No permits are issued at the ranger station.' },
      ],
    },
    {
      name: 'Costs and limits',
      items: [
        { t: 'Fees', d: '$10 per person, plus a non-refundable $6 reservation fee.' },
        { t: 'Group size', d: 'Up to 25 people per permit. Private use is limited to five permits or 75 people per day.' },
        { t: 'Who', d: 'Permit holders must be 18 or older. Permits are for private, non-commercial use and are not transferable. One person may hold up to three permits at a time.' },
      ],
    },
    {
      name: 'Cancelling',
      items: [
        { t: 'Refund', d: 'Cancellations or group size reductions more than 14 days before launch are refunded, minus the $6 fee. No refund within 14 days of launch.' },
        { t: 'Changes', d: 'Group size can be changed up to 25, if quota allows, until 11:59 a.m. on launch day. Trips can switch between day and overnight if space allows. The alternate trip leader cannot be changed.' },
      ],
    },
  ],
};

const rules = [
  {
    name: 'At the pre-launch check',
    rules: [
      { t: 'Equipment', d: 'A first aid kit, a repair kit, an air pump, and a washable, leak-proof, reusable toilet system. Wag bags must be in a hard-sided, clamped or screw-top container.' },
      { t: 'Fire pan', d: 'All fires must be in a fire pan at least 12 inches in diameter with a 1.5 inch lip. A fire blanket and ash container are recommended.' },
      { t: 'Life jackets', d: 'A properly sized Type I, III or V life jacket for each person. Life jackets are required from the ranger station to Big Hole, and children 12 and under must wear one at all times.' },
      { t: 'Boats', d: 'Each raft, dory or canoe needs an extra oar or paddle and a bail bucket or bilge pump unless self-bailing. Every boat needs a whistle. Boats 16 feet or longer need a throwable and a throw bag with at least 40 feet of line.' },
      { t: 'Kayaks', d: 'Parties of kayaks, inflatable kayaks or SUPs carry one spare paddle for every three vessels.' },
    ],
  },
  {
    name: 'In the canyon',
    rules: [
      { t: 'Together', d: 'Trips must launch, travel within visual contact, and camp together from the ranger station to Cisco.' },
      { t: 'Camping', d: 'One overnight is allowed, on your launch date only, at the site the ranger assigns. Groups launching separately may not camp together if the site would hold more than 25.' },
      { t: 'Launch', d: 'Launch only from the Westwater Ranger Station, once per day. Boat tags must stay attached.' },
      { t: 'Wood', d: 'Gather only driftwood from banks and beaches.' },
      { t: 'Dogs and drones', d: 'No dogs in the canyon. Drones are prohibited.' },
      { t: 'Waste', d: 'Carry out all trash, ash and charcoal, and solid human and service dog waste. Keep side canyon streams and springs free of soap.' },
      { t: 'Cisco', d: 'Camping is not authorized for two river miles below Cisco Landing, and motors are not allowed below it for two miles. Use the far river-right channel around the large island below the landing.' },
    ],
  },
  {
    name: 'Safety',
    rules: [
      { t: 'Water', d: 'Bring all your drinking water, at least a gallon per person per day.' },
      { t: 'Communication', d: 'There is no cell coverage in the canyon.' },
      { t: 'Emergencies', d: 'Call 911. The Grand County Sheriff leads search and rescue.' },
      { t: 'Flash floods', d: 'Burned slopes in the upper Little Dolores increase flash flood and debris flow risk. Check the weather before camping or hiking nearby.' },
    ],
  },
];

const access = [
  { name: 'Moab', road: true, hub: true, note: 'BLM Moab Field Office and shuttle base', grid: [3, 2] },
  { name: 'Grand Junction', road: true, hub: true, note: 'Nearest large city', grid: [9, 2] },
  { name: 'Westwater', road: true, mile: 0, park: true, note: 'Put-in. I-70 exit 227', grid: [2, 6] },
  { name: 'Cisco', road: true, mile: 17.55, park: true, note: 'Take-out. I-70 exit 204 or 214', grid: [10, 6] },
];
const roads = [
  { a: 'Moab', b: 'Westwater', h: '' },
  { a: 'Grand Junction', b: 'Cisco', h: '' },
  { a: 'Westwater', b: 'Cisco', h: '' },
];

write('westwater', {
  name: 'Westwater Canyon',
  reach: 'Westwater Ranger Station to Cisco',
  agency: 'BLM Moab Field Office',
  miles: [0, 17.6],
  days: 1,
  coords: [39.15, -109.1],
  tz: 'America/Denver',
  camps: d.camps,
  rapids: d.rapids,
  hikes: d.hikes,
  geology: [],
  guide: [],
  almanac: {
    flows: [
      ['Typical flows', 'The river peaks around 20,000 cfs in late May or early June and recedes to about 3,000 cfs in the fall.'],
      ['Trip time', 'A high-water trip above 10,000 cfs can take 4 hours; at 1,000 to 5,000 cfs it can take 10 or more.'],
      ['Terrible Teens', 'Between 13,000 and 20,000 cfs the main canyon is serious Class IV with few eddies between rapids, and a swim or flip can last miles.'],
    ],
    geology: [
      ['Vishnu Schist', 'The canyon is cut through 1.7-billion-year-old Vishnu Schist, rock that also appears in Ruby-Horsethief and the Grand Canyon.'],
    ],
  },
  rules,
  landmarks: d.landmarks,
  clusters: [{ s: 8.6, e: 11.1, n: 'Main gorge' }],
  hdiff: { 1: 'Short, easy walk', 2: 'Easy trail', 3: 'Longer hike' },
  access,
  yardGrid: [5, 1],
  roads,
  permit,
});
