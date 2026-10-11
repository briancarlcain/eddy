const { parse, write } = require('./common.js');

// Miles below Hoover Dam (0). River miles on the water trail count up from the mouth: Hoover Dam is river mile 64, Willow Beach 52.5.
const d = parse(`
R|4.25|Ringbolt Rapid|I|A riffle at Arizona Hot Springs, river mile 59.75.

C|4.25|Arizona Hot Springs|L|m|Camping is allowed on any available beach, and a pit toilet serves the hot springs. Gold Strike and Arizona Hot Springs close mid-May to September for heat.
C|9.5|Emerald Cave beaches|R|s|Beaches below the cave; camping is allowed on any available beach.
C|11.5|Willow Beach|R|l|A campground with nine tent sites and a 28-site full-service RV park, with a marina, store and restaurant.

H|1.0|Sauna Cave|-|2|A 50-foot tunnel begun during dam construction, ending in a geothermal pool and natural steam room. The back requires crawling. River mile 63.
H|1.5|Nevada Hot Springs (Gold Strike)|L|3|Walk up Gold Strike Canyon wash to a series of blue pools of 85 to 105 degrees. River mile 62.5. The trail has eight rope-assisted descents of about 20 feet each; kayakers can reach it from the river.
H|2.25|Boy Scout Canyon|-|3|The first pools are about a quarter mile upstream; going further requires scrambling with installed ropes at small waterfalls. River mile 61.75.
H|4.25|Arizona Hot Springs|L|3|Pools in a slot canyon with walls as narrow as 6 feet, reached by a metal ladder beside a warm waterfall. River mile 59.75.
H|9.5|Emerald Cave|R|1|A shallow cave on the Arizona side. Glide in backwards; at the right angle sunlight makes the water sparkle green. River mile 54.5.

L|0.0|Hoover Dam|1|Launch point at river mile 64. A bridge spans the tall cliffs above. Launching requires a permit through an approved vendor, who shuttles you into the Federal Security Zone; you have about 15 minutes to launch.
L|1.0|Sauna Cave|0|River mile 63.
L|1.5|Gold Strike Canyon|0|River mile 62.5.
L|2.25|Boy Scout Canyon|0|River mile 61.75.
L|4.25|Arizona Hot Springs|0|River mile 59.75.
L|9.5|Emerald Cave|0|River mile 54.5, about 2 miles upstream of Willow Beach.
L|9.75|Gauging station|0|The historic station that monitored water level, flow and silt before and during Hoover Dam's construction, on the Nevada side. Two cable cars and a catwalk link it to the gauger's home.
L|10.5|Gauger's Homesite|0|Where the gauger who collected Colorado River data lived from 1935 to 1939. Only the foundation and retaining walls remain.
L|11.5|Willow Beach|1|River mile 52.5. Paddlecraft launch and take out here at a marina with a launch ramp, rentals, store and restaurant, and a National Fish Hatchery with self-guided tours.
`);

const permit = {
  status: 'Required to launch at Hoover Dam · through approved vendors',
  apply: { label: 'Approved vendors (NPS)', url: 'https://www.nps.gov/lake/getinvolved/cua-directory.htm' },
  contact: { phone: '702-293-8990', web: 'https://www.nps.gov/lame/planyourvisit/black-canyon-water-trail.htm' },
  sections: [
    {
      name: 'Launching at Hoover Dam',
      items: [
        { t: 'Permit', d: 'A permit is required to launch below Hoover Dam. It is issued through a limited number of approved vendors, who also provide the shuttle into the Federal Security Zone. You cannot self-shuttle.' },
        { t: 'Booking', d: 'Dates can sell out months ahead, particularly in spring and fall.' },
        { t: 'Launch', d: 'The launch is inside a security zone, so you have about 15 minutes to rig and go.' },
      ],
    },
    {
      name: 'From Willow Beach',
      items: [
        { t: 'Paddling up', d: 'Paddlecraft can launch and take out at Willow Beach and paddle upstream. No dam launch permit is needed; a park entrance fee applies.' },
        { t: 'Overnight', d: 'Camping is allowed on any available beach. Carry a portable toilet; the only pit toilet is at Arizona Hot Springs.' },
      ],
    },
  ],
};

const rules = [
  {
    name: 'Boat zones, Hoover Dam to Willow Beach',
    rules: [
      { t: 'Sunday and Monday', d: 'Year-round, motorless recreation only. Personal watercraft and motorized vessels are prohibited.' },
      { t: 'Tuesday to Saturday, Labor Day to Memorial Day weekend', d: 'Personal watercraft are prohibited and motors are limited to 65 horsepower or less.' },
      { t: 'Tuesday to Saturday, Memorial Day weekend to Labor Day', d: 'No horsepower limits and personal watercraft are allowed.' },
      { t: 'Banned', d: 'Houseboating, water-skiing and wakeboarding are prohibited year-round.' },
    ],
  },
  {
    name: 'Safety',
    rules: [
      { t: 'Life jackets', d: 'Life jackets must be worn while underway.' },
      { t: 'Water', d: 'Water below the dam is about 53 degrees year-round and levels can change 4 to 6 vertical feet during the day. Tie up your boat when exploring side canyons; a beach can flood within an hour.' },
      { t: 'Wind', d: 'Upriver winds are common and can make paddling very difficult, especially on a stand-up paddleboard.' },
      { t: 'Hot springs', d: 'Naegleria fowleri can be present in hot springs. Keep water out of your nose while soaking.' },
      { t: 'Remote', d: 'The canyon is remote with limited rescue options. Accompany trips south of Burro Wash with a powerboat. Check the NPS site for flash flood and side-canyon conditions.' },
    ],
  },
  {
    name: 'Season',
    rules: [
      { t: 'Best months', d: 'The trail is open year-round. Spring and fall are best for the hot springs; Gold Strike and Arizona Hot Springs close from mid-May to September for extreme heat.' },
    ],
  },
];

const access = [
  { name: 'Boulder City', road: true, hub: true, note: 'Nearest town; Lake Mead NRA headquarters', grid: [3, 2] },
  { name: 'Las Vegas', road: true, hub: true, note: 'Nearest large city', grid: [8, 2] },
  { name: 'Hoover Dam', road: true, mile: 0, park: false, note: 'Launch by approved vendor shuttle only', grid: [1, 6] },
  { name: 'Willow Beach', road: true, mile: 11.5, park: true, note: 'Take-out. 14 miles south of the dam off US 93', grid: [10, 6] },
];
const roads = [
  { a: 'Boulder City', b: 'Willow Beach', h: '' },
  { a: 'Las Vegas', b: 'Boulder City', h: '' },
];

write('black-canyon', {
  name: 'Black Canyon of the Colorado',
  reach: 'Hoover Dam to Willow Beach',
  agency: 'NPS Lake Mead National Recreation Area',
  miles: [0, 12],
  days: 2,
  coords: [35.95, -114.73],
  tz: 'America/Los_Angeles',
  camps: d.camps,
  rapids: d.rapids,
  hikes: d.hikes,
  geology: [],
  guide: [],
  almanac: {
    trail: [
      ['Black Canyon National Water Trail', 'Designated in 2014, the first National Water Trail in the Southwest and the first flowing through a desert. About 30 miles from the base of Hoover Dam to Eldorado Canyon (river mile 39), with Willow Beach in between.'],
      ['Below Willow Beach', 'The trail continues 18 miles to Eldorado Canyon, named by Spanish gold seekers. Expect open water, wind and fast current with hidden rocks. Paddlers carry watercraft about a quarter mile up a desert wash to reach a vehicle.'],
    ],
  },
  rules,
  landmarks: d.landmarks,
  clusters: [{ s: 1, e: 4.5, n: 'Hot springs' }],
  hdiff: { 1: 'Short, easy walk', 2: 'Scramble', 3: 'Ropes and scrambling' },
  access,
  yardGrid: [5, 1],
  roads,
  permit,
});
