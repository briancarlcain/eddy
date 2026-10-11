const { parse, write } = require('./common.js');

// Miles from the Loma boat launch (0) to the Westwater ranger station take-out (about 25), using the BLM's official site list.
// Notes and the extra features come from GoRafting's guide, whose miles run about 1.8 percent longer and are rescaled to the BLM's.
const g = (x) => Math.round(x * 0.982 * 100) / 100;
const d = parse(`
R|${g(16.75)}|Black Rocks Rapid|II|Swirling currents at Black Rocks. The only rapid in this flatwater stretch.

C|3.2|Rattlesnake|L|s|A small site, good for a short first day, on the upstream side of Rattlesnake Canyon.
C|3.5|Beaver Tail 1|R|l|A cobblestone landing with no shade; tricky at high water. Up to 25 people.
C|3.6|Beaver Tail 2|R|l|Shaded, flat and large. Up to 25 people.
C|3.7|Bull Draw|L|?|One of the 34 designated sites.
C|5.6|Banjo|L|?|One of the 34 designated sites.
C|5.8|Cottonwood 1|L|l|Shares a bar with the other Cottonwood sites. Up to 25. Dogs leashed.
C|5.9|Cottonwood 2|L|l|A cobble and clay landing with shade. Up to 25. Dogs leashed.
C|6.0|Cottonwood 3|L|l|A sand landing with shade. Up to 25. Dogs leashed.
C|6.1|Cottonwood 4|L|l|A sand beach with shade. Up to 25. Dogs leashed.
C|6.2|Cottonwood 5|L|l|Many trees. Up to 25. Dogs leashed.
C|7.9|Salt Creek 1|L|m|A grass landing with no shade. Up to 14 people. Hug the left bank two miles past Cottonwood.
C|8.0|Salt Creek 2|L|m|A grass landing with shade. Up to 14 people.
C|10.3|Fault Line 1|L|m|A grass landing with shade. Up to 14 people. Easy to miss at high flows: look for large cottonwoods at the river fork. Burned in May 2025.
C|10.5|Fault Line 2|L|m|A cobble and sand beach with limited shade. Up to 14. Difficult at high water; take the left channel at Fault Line 1. Burned in May 2025.
C|12.7|Mee Corner|L|l|A cobble and sand beach with shade. Up to 25. Hiking to Mee Canyon, though access is better from the other Mee sites.
C|13.1|Mee 1|L|l|A clay and grass landing with some shade. Up to 25. Easy Mee Canyon hiking. Dogs leashed.
C|13.2|Mee 2|L|l|Clay and grass with no shade. Up to 25. Dogs leashed.
C|13.3|Mee 3|L|l|Clay and grass with no shade. Up to 25. Dogs leashed.
C|13.4|Mee 4|L|l|Clay and grass with no shade. Dogs leashed.
C|13.6|Mee Canyon|L|l|A sand landing with shade. Up to 25. The best access for Mee Canyon hiking. Dogs leashed.
C|14.7|Dog Island|L|l|A campsite on an island with a cobble landing and shade. Up to 25. Use the right channel. Swimming is good at suitable flows.
C|15.8|Split Rock|L|l|A cobble landing with great shade. Up to 25. Hard to land at high water, so use a rope. Access to Black Rocks and Moore Canyon.
C|16.0|Black Rocks 1|L|l|A sand landing with some shade. Up to 25. Very difficult at high water.
C|16.1|Black Rocks 2|L|l|A sand beach with no shade. Up to 25.
C|16.2|Black Rocks 3|L|l|A sand beach with no shade. Up to 25.
C|16.4|Black Rocks 4|L|l|A beach with no shade. Up to 25.
C|16.5|Black Rocks 5|L|l|A sand beach with some shade. Up to 25.
C|16.6|Black Rocks 6|L|l|A sand beach with no shade. Up to 25.
C|16.7|Black Rocks 7|L|l|A steep sand beach with no shade. Up to 25. The eddy can be hard to catch.
C|16.8|Black Rocks 8|L|l|A sand beach with no shade. Up to 25.
C|17.0|Black Rocks 9|L|l|A sand beach with no shade. Up to 25. The Moore Canyon trail starts here.
C|18.1|Island Camp|-|s|A cobble and sand landing with no shade. Up to 5 people. Take the left channel of the island.
C|18.3|Knowles|L|l|A cobble and sand beach with shade. Up to 25. Difficult at high flows; look for the cottonwood grove.
C|20.3|May Flats|R|l|A cobble landing with no shade. Up to 25. Hard to locate: look for boulders on the left bank.

H|${g(3.24)}|Rattlesnake Canyon|L|4|A hike to a large concentration of natural arches, about 5 miles round trip with some scrambling. A milder option follows the canyon path.
H|13.6|Mee Canyon|L|5|A large canyon with a very large alcove at the end, a long and challenging hike, and easier spires. The trailhead is reached by road about 8 miles from the river. Climbing routes exist.
H|16.4|Black Rocks Canyon rim|L|2|About a 30-minute hike for views from the rim of some of the oldest exposed rock on Earth.
H|17.0|Moore Canyon|L|3|A trail from Black Rocks 9 into a large canyon with extensive exploring.
H|${g(18.4)}|McDonald Creek pictographs|R|3|About 4 miles round trip with little shade. Take the right channel of the island to reach it.
H|18.3|Knowles Canyon|L|4|A huge side canyon that parallels Mee Canyon. The trail starts at Knowles camp and a longer hike of about 5 miles reaches the desert waterfall of Hell's Hole.
H|${g(10.0)}|Abandoned cabin|L|1|An old cabin a short distance off the bank.

L|0.00|Loma boat launch|1|Put-in, off I-70 exit 15. A large rigging area. No camping at the launch or parking; parking is 200 yards upriver.
L|${g(8.5)}|Salt Creek|0|Salt Creek enters on river right.
L|${g(8.9)}|Start of the train section|0|Union Pacific tracks run alongside the river to the take-out. Amtrak's California Zephyr uses this line.
L|16.0|Black Rocks|0|Some of the oldest exposed rock on Earth: Precambrian granite and gneiss up to 1.8 billion years old (Vishnu Schist), like the bottom of the Grand Canyon.
L|${g(18.6)}|USGS gaging station|0|Flow records since 1951.
L|${g(21.02)}|Utah-Colorado border|0|"Welcome to Utah" is painted on the canyon wall. Upstream motorized travel is prohibited in Utah.
L|25.00|Westwater ranger station and take-out|1|Reached from I-70 exit 227, 9 miles south. A paved ramp for 2 to 3 vehicles; park upstream until ready. A Westwater permit is needed beyond this point.
`);

const permit = {
  status: 'Overnight permit required year-round · reserve on Recreation.gov',
  asOf: 'October 2026',
  apply: { label: 'Reserve on Recreation.gov', url: 'https://www.recreation.gov/permits/74466' },
  contact: { phone: '970-244-3000', web: 'https://www.recreation.gov/permits/74466' },
  sections: [
    {
      name: 'How to get one',
      items: [
        { t: 'Overnight permits', d: 'Overnight camping permits are required year-round and must be reserved in advance on Recreation.gov for one of the 34 designated campsites. You may camp only at the site you reserved.' },
        { t: 'Day use', d: 'A day trip needs no permit.' },
        { t: 'When to book', d: 'Reservations can be made two months ahead on a daily rolling window, opening at 8 a.m. Mountain.' },
        { t: 'Black Rocks', d: 'The Black Rocks sites are limited to one night on Fridays and Saturdays, with no layovers.' },
        { t: 'Printing', d: 'Once a permit is printed it cannot be edited.' },
        { t: 'Westwater', d: 'Boating in Westwater Canyon in Utah, beyond the take-out, needs a separate permit from the Moab Field Office (435-259-2100).' },
      ],
    },
    {
      name: 'Costs',
      items: [
        { t: 'Reservation fee', d: '$6 on every reservation, non-refundable.' },
        { t: 'April 1 to October 31', d: 'Per camp, per night: $20 for 1 to 5 people, $50 for 6 to 14, and $100 for 15 to 25. Children 16 and under camp free but count toward the group size, as do dogs.' },
        { t: 'November 1 to March 31', d: 'No camping fee, only the reservation fee.' },
        { t: 'Cancelling', d: 'Cancel at least 8 days before the trip for a refund of the camping fees.' },
      ],
    },
    {
      name: 'Limits',
      items: [
        { t: 'Group size', d: 'Up to 25 people including adults, children and dogs. Some sites are smaller: Salt Creek and Fault Line hold up to 14, and Island Camp up to 5.' },
        { t: 'Dogs', d: 'A maximum of two dogs, leashed at campsites, put-ins and take-outs, and in the Mee Canyon and Black Rocks sections.' },
        { t: 'Motors', d: 'Motorized use is allowed. Slow down and yield to non-motorized boats. Upstream motorized travel is prohibited in Utah.' },
      ],
    },
  ],
};

const rules = [
  {
    name: 'Etiquette and rules',
    rules: [
      { t: 'Gear and waste', d: 'See Recreation.gov for the current requirements on waste containment systems and fires. Pack it in, pack it out.' },
      { t: 'Micro-trash', d: 'Strain dishwater and pick up every scrap so food does not attract insects and animals.' },
      { t: 'Cultural sites', d: 'It is illegal to deface or remove historical, archaeological or paleontological resources.' },
      { t: 'Ramps', d: 'Leave room for others, including jet boats, which need deeper water. Consolidate gear and move vehicles off the ramp quickly.' },
      { t: 'Shooting', d: 'Target shooting is prohibited in McInnis Canyons National Conservation Area. Hunting follows Colorado Parks and Wildlife regulations.' },
      { t: 'Fire damage', d: 'A 2015 illegal-fireworks fire destroyed 168 cottonwoods at Dog Island, and the Fault Line sites burned in May 2025. Check fire restrictions.' },
    ],
  },
];

const access = [
  { name: 'Grand Junction', road: true, hub: true, note: 'BLM Grand Junction Field Office; I-70 west to Loma', grid: [3, 2] },
  { name: 'Loma', road: true, mile: 0, park: true, note: 'Put-in at I-70 exit 15. Parking 200 yards upriver', grid: [1, 6] },
  { name: 'Westwater', road: true, mile: 25, park: true, note: 'Take-out at the ranger station; I-70 exit 227, then 9 miles south', grid: [10, 6] },
];
const roads = [
  { a: 'Grand Junction', b: 'Loma', h: '' },
  { a: 'Grand Junction', b: 'Westwater', h: '' },
  { a: 'Outfitter', b: 'Grand Junction', h: '' },
];

write('ruby-horsethief', {
  name: 'Ruby-Horsethief Canyons',
  reach: 'Loma to Westwater',
  agency: 'Bureau of Land Management, Grand Junction Field Office',
  miles: [0, 25.1],
  days: 2,
  coords: [39.15, -109.05],
  tz: 'America/Denver',
  note: 'About 25 miles of the Colorado River from Loma, Colorado to the Westwater ranger station in Utah: mostly flat water with one Class II spot at Black Rocks, usually a two-day trip. Miles and the 34 designated sites are from the BLM\'s official site list; descriptions come from a commercial guide and are rescaled to it. Camp quality is not rated. Compiled from public sources; verify with the BLM.',
  camps: d.camps,
  rapids: d.rapids,
  hikes: d.hikes,
  geology: [],
  guide: [],
  almanac: {
    history: [
      ['Black Rocks', 'The Black Rocks section exposes Precambrian granite and gneiss up to 1.8 billion years old, similar in age and composition to the Black Canyon of the Gunnison and the bottom of the Grand Canyon. Most of Ruby Canyon cuts through Mesozoic sandstone and shale.'],
      ['Dog Island', 'An illegal-fireworks fire in 2015 destroyed 168 cottonwoods and burned 50 acres at Dog Island.'],
    ],
  },
  rules,
  landmarks: d.landmarks,
  clusters: [{ s: 15.5, e: 17.5, n: 'Black Rocks' }],
  notes: {
    camp: '*The 34 designated campsites are reserved ahead on Recreation.gov. Quality is not rated.',
    hike: '*Difficulty is a rough estimate (1 = short, easy walk; 5 = long, challenging). Times are not given.',
  },
  hdiff: { 1: 'Short, easy walk', 2: 'Easy trail', 3: 'Trail with some climbing', 4: 'Long hike with scrambling', 5: 'Long and challenging' },
  access,
  yardGrid: [5, 1],
  roads,
  permit,
});
