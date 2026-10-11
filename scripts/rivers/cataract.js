const { parse, write } = require('./common.js');

// Miles from the Potash boat ramp (0); the Green River confluence is about 47.5; Hite is about 96.
// Above the confluence: a commercial river log. Below it: American Whitewater's rapid list (distances from the
// confluence, plus 47.5) and trip-report camp names. Camps below the confluence are designated and must be registered.
const o = 47.5;
const m = (x) => Math.round((o + x) * 100) / 100;
const d = parse(`
R|${m(4.21)}|Rapid 1 (Brown Bettie)|III|Hole in the center at low water; an easy line right.
R|${m(4.44)}|Rapid 2|III|Rocks left at low water; go center-right.
R|${m(4.89)}|Rapid 3|II|Straightforward, center-right.
R|${m(5.51)}|Rapid 4|III|Long, with rocks right at low water.
R|${m(5.82)}|Rapid 5 (Surprise)|III|A hidden hole left at low water and pour-overs on the right.
R|${m(6.66)}|Rapid 6|III|Big rocks right at low water; a good line left.
R|${m(6.84)}|Rapid 7|III|Longer and straightforward; follow the main current.
R|${m(7.29)}|Rapid 8|III|Options. Rocks at low water, a wall at the bottom right; the right side is good.
R|${m(7.65)}|Rapid 9|II|Easy, down the middle.
R|${m(8.16)}|Rapid 10|III|A big low-water wave: a surf for kayaks, a hit for rafts.
R|${m(9.26)}|Rapid 11|II|An inconsequential riffle.
R|${m(9.51)}|Rapid 12|II|The channel is constrained by debris from a river-left side canyon.
R|${m(11.48)}|Rapid 13|II|Outwash from Range Canyon. The start of about 3 miles of whitewater, the Mile Long Rapids.
R|${m(11.67)}|Rapid 14|III|A hole in the center, also Range Canyon outwash.
R|${m(11.83)}|Rapid 15 (Capsize)|III|Midstream boulders; line center-right. Inscriptions on river right mark the 1891 Best party's lost boat.
R|${m(11.99)}|Rapid 16|III|A midstream boulder at low water.
R|${m(12.29)}|Rapid 17|II|Easy, down the middle.
R|${m(12.43)}|Rapid 18|III|Fun waves and hydraulics.
R|${m(12.76)}|The Button (Rapid 19)|III|A very large center hole at 35,000 cfs and up; a mid-river rock and wave hole left at low water.
R|${m(13.24)}|Ben Hurt (Rapid 20)|III|The river splits around an island; take the river-right channel.
R|${m(13.68)}|Big Drop 1 (Rapid 21)|IV|The start of the main whitewater. Most pull out left at high water to scout.
R|${m(14.0)}|Big Drop 2 (Rapid 22)|IV|A ledge wave. Left to right is preferred below 40,000 cfs. Scout river left.
R|${m(14.24)}|Big Drop 3, Satan's Gut (Rapid 23)|IV|The biggest rapid. Right at high water, left at low water. Scout.
R|${m(14.58)}|Rapid 24|III|Read and run, down the middle.
R|${m(14.94)}|Rapid 25|III|Read and run, down the middle.
R|${m(15.39)}|Ten Cent Rapid (Rapid 26)|III|A midstream island; take the right channel.
R|${m(16.17)}|Imperial Rapid (Rapid 27)|III|Long, with big waves at the bottom. The first significant Lake Powell sediment deposits.
R|${m(16.53)}|Short Rapid|III|The narrowest part of the canyon; waves down the middle.
R|${m(17.47)}|The Chute|II|Easy; carved from sediment between 2007 and 2012.
R|${m(17.95)}|Water Hole Canyon Rapid|III|A wave hole center-right.
R|${m(18.55)}|Can Opener Rapid|III|Named for the tower on river left.
R|${m(18.95)}|Benchmark Riffle|II|Near a USGS benchmark.
R|${m(19.56)}|La Rue's Riffle|II|Straightforward.
R|${m(19.84)}|Gypsum Canyon Rapid|IV-|Appeared as a riffle in 2018 and is now significant. Scout left. A large pour-over can form middle right.

C|17.00|Little Bridge|R|?|Named in trip reports, in Meander Canyon above the confluence.
C|23.60|Upper Lathrop Ledges|R|?|Above Lathrop Canyon. River trips may not camp at Lathrop Canyon itself, where the road ends.
C|36.00|Upper Loop|L|?|At The Loop, where the river nearly doubles back on itself.
C|51.00|Lower Red Lake|R|?|Near Lower Red Lake Canyon, which has a trail to the Needles District.
C|51.40|Upper Spanish Bottom|R|?|Above the first rapid.
C|51.55|Middle Spanish Bottom|R|?|Above the first rapid.
C|51.90|Brown Bettie beach|R|?|Below Rapid 1, with a trail upstream to the Dollhouse.
C|55.00|Upper X/Y Canyon|R|?|Between Rapids 9 and 10.
C|55.60|Middle X/Y Canyon|R|?|At the top of Rapid 10.
C|55.70|Lower X/Y Canyon|R|?|Beside the Rapid 10 surf wave.
C|67.50|Gypsum|-|l|A large, silt-free beach below the rapids.
C|72.10|Clearwater Canyon|R|?|Named in trip reports.
C|85.50|Millie Crag|L|?|Near Millie Crag Bend.

H|10.00|Petrified wood|R|1|A pullout with petrified wood and a rock diving board.
H|12.00|Gooseneck|-|1|Hike across the neck of the meander; trip reports say it is faster than motoring around.
H|23.50|Lathrop Canyon ruins|R|2|Ancestral Puebloan ruins at Lathrop Canyon, where the road from the rim ends.
H|30.50|Indian Creek ruins|L|2|Ruins along the cliff walls up the creek.
H|38.00|The Loop|L|2|Walk across the neck and rejoin the river, passing ruins and panoramic views.
H|51.50|Lower Red Lake Canyon|R|4|A hiking trail up to the Needles District.
H|52.00|Dollhouse trail|R|3|A trail from Spanish Bottom to the Doll House formations in the Maze District. Hiking is limited to designated trails.
H|81.20|Dark Canyon|L|3|A creek-bed hike to waterfalls and rock formations. A designated camp no longer exists here.

L|0.00|Potash boat ramp|1|The usual put-in, near Moab. A potash mine just upstream makes fertilizer.
L|1.00|Shafer oil well|0|Site of a 1925 oil fire that spilled thousands of barrels into the river over several months.
L|5.00|Pyramid Butte|0|
L|8.50|J.H. Shafer oil well|0|
L|11.00|Dead Horse Point|0|Horse thieves corralled stolen horses on the cliff-top, where they died of thirst.
L|20.00|Lockhart Canyon|0|
L|21.00|Horsethief Canyon|0|
L|27.00|Coffee Pot Ruin|0|An Ancestral Puebloan granary built in a sandstone spire. Hard to reach but visible from the river.
L|29.00|Sheep Bottom|0|
L|32.00|Monument Creek|0|
L|43.00|Salt Creek|0|The mouth is closed March 15 to September 1 for bighorn lambing, as are Big Spring, Little Spring and Elephant Canyons.
L|44.00|Elephant Canyon|0|
L|47.50|Green River confluence|0|The start of Cataract Canyon. Life jackets must be worn from here to the last active rapid. Up-running is prohibited from the first rapid to Imperial Canyon. A courtesy register box is a little below.
L|${m(16.17)}|Imperial Canyon|0|The first significant Lake Powell sediment deposits (the Dominy Formation) start here.
L|${m(33.67)}|Dark Canyon Rapid|0|Once a top rapid; buried by Lake Powell sediment as of 2021.
L|${m(47.6)}|North Wash boat ramp|1|The usual take-out, on river right just below the Dirty Devil confluence. A steep, eroded ramp with mud flats and quicksand; a winch and rollers are often needed. Contact the NPS about conditions.
L|${m(48.6)}|Hite Marina boat ramp|1|River left. Usually high and dry unless the reservoir is full.
`);

const permit = {
  status: 'Required for overnight trips · reserve on Recreation.gov, no lottery',
  asOf: 'October 2026',
  apply: { label: 'Reserve on Recreation.gov', url: 'https://www.recreation.gov/permits/621748' },
  contact: { phone: '435-719-2313', web: 'https://www.nps.gov/cany/planyourvisit/riverpermits.htm' },
  sections: [
    {
      name: 'How to get one',
      items: [
        { t: 'Reserve online', d: 'There is no lottery. Overnight river permits are reserved on Recreation.gov, up to four months before each season. Reservations close two days before the launch date.' },
        { t: 'Opening dates', d: 'Launches April 14 to October 15 open on December 14. Launches October 16 to April 13 open on June 15.' },
        { t: 'Where it applies', d: 'The permit is valid only within Canyonlands National Park, downstream of the Potash and Mineral Bottom boat ramps. If you launch upstream, the start date is the day you enter the park. Mineral Bottom trips on the Green River above that need a separate BLM permit (Labyrinth Canyon).' },
        { t: 'Day use', d: 'Day-use permits are separate and open up to 24 hours ahead.' },
        { t: 'Camp registration', d: 'River users must register for campsites below the confluence. Designated campsites are along the rivers; sandbars are usually plentiful in late summer and fall, but camps can be hard to find at high water.' },
        { t: 'Experience', d: 'Private trips need technical whitewater experience. Guided trips must use an NPS-authorized company.' },
      ],
    },
    {
      name: 'Costs and limits',
      items: [
        { t: 'Reservation fee', d: '$36 per permit, which includes the $6 Recreation.gov fee.' },
        { t: 'Per person', d: '$25 per person for overnight Cataract Canyon and flatwater trips. Older pages say $20. Day use is $6 plus $10 per person. Fees are non-refundable.' },
        { t: 'Group size', d: 'Up to 40 people. Combined groups camping together may not exceed 40.' },
        { t: 'Length', d: 'Up to 14 consecutive nights.' },
        { t: 'Launch limits', d: 'There are no daily launch limits in Canyonlands.' },
      ],
    },
    {
      name: 'Getting out',
      items: [
        { t: 'North Wash', d: 'The usual take-out at Lake Powell is the North Wash ramp. It is steep and eroded, and a winch or rollers are often needed. Check lake levels and the take-out calendar with the park.' },
        { t: 'Hite', d: 'The Hite Marina ramp is usually high and dry. Bullfrog, about 48 river miles farther, is the alternative.' },
        { t: 'Invasive mussels', d: 'Mussels are in Lake Powell. Utah and Arizona laws require you to clean, drain and dry your boat after take-out.' },
      ],
    },
  ],
};

const rules = [
  {
    name: 'Required equipment',
    rules: [
      { t: 'Life jackets', d: 'One approved Type I, III or V whitewater life jacket per person, plus one spare per ten people or one per boat, whichever is fewer. Inflatable life jackets are not allowed on Utah rivers.' },
      { t: 'Wear them in the canyon', d: 'Between the Green and Colorado confluence and the last active rapid, life jackets must be worn, on the torso and fastened. Children 12 and under wear them at all times on the river.' },
      { t: 'Spares', d: 'One readily accessible spare oar, paddle or motor per boat. One spare paddle per three canoes or kayaks.' },
      { t: 'Throwables', d: 'One Type IV throw cushion per boat 16 feet or longer. Smaller boats may carry a throw bag with at least 40 feet of line.' },
      { t: 'Repair and first aid', d: 'A repair kit and air pump for inflatables, a bailing device or bilge pump for boats that are not self-bailing, and a first-aid kit adequate for the group.' },
      { t: 'Fire pan', d: 'A rigid, durable metal fire pan large enough to hold all ash and debris. Turkey basting pans are not allowed.' },
      { t: 'Human waste', d: 'A reusable, washable container with RV dump fittings, or a commercial bag system, stored in a hard-sided container or heavy-duty waterproof bag labelled "Human Waste". Pack all waste out.' },
    ],
  },
  {
    name: 'Camping and fire',
    rules: [
      { t: 'One camp', d: 'A group on one permit travels and camps together and occupies only one campsite.' },
      { t: 'Distances', d: 'Do not camp within 300 feet of springs, intermittent streams, or archeological and historic sites. Do not use soap within 100 feet of springs or streams.' },
      { t: 'Where not to camp', d: 'River trips may not camp at Lathrop Canyon, or at designated vehicle campsites on White Rim Road or in the Maze, unless the permit allows it.' },
      { t: 'Firewood', d: 'Collect only driftwood below the high-water mark. Dead and down wood does not count. Fires stay in the fire pan, and all ash is packed out. Fire blankets are recommended.' },
    ],
  },
  {
    name: 'Prohibited and closed',
    rules: [
      { t: 'Prohibited', d: 'Pets, firearms discharge, fireworks, personal watercraft, towing people behind boats, littering, and collecting or disturbing fossils, plants and rocks.' },
      { t: 'Up-running', d: 'Traveling upstream between the first rapid in Cataract Canyon and Imperial Canyon is prohibited.' },
      { t: 'Closures', d: 'Salt Creek, Big Spring, Little Spring and Elephant Canyons (lower portions and mouths) are closed March 15 to September 1 for bighorn lambing. Jasper Canyon is closed above the first visible jump. The Doll House area is limited to designated trails.' },
      { t: 'Eagles', d: 'Lower Red Lake Canyon to Cross and Y Canyons is day use only from December 1 to February 28, for bald eagles.' },
    ],
  },
];

const access = [
  { name: 'Moab', road: true, hub: true, note: 'Nearest town to Potash; the park office is here', grid: [2, 2] },
  { name: 'Hanksville', road: true, hub: true, note: 'Nearest town to North Wash and Hite', grid: [10, 2] },
  { name: 'Potash', road: true, mile: 0, park: true, note: 'Put-in on the Colorado, reached from Moab', grid: [1, 6] },
  { name: 'North Wash', road: true, mile: 95.1, park: true, note: 'Usual take-out. Steep, eroded ramp; may need a winch', grid: [10, 6] },
];
const roads = [
  { a: 'Moab', b: 'Potash', h: '' },
  { a: 'Hanksville', b: 'North Wash', h: '' },
  { a: 'Moab', b: 'Hanksville', h: '' },
  { a: 'Outfitter', b: 'Moab', h: '' },
];

write('cataract-canyon', {
  name: 'Cataract Canyon',
  reach: 'Potash to North Wash and Hite',
  agency: 'Canyonlands National Park',
  miles: [0, 96.2],
  days: 5,
  coords: [38.15, -109.85],
  tz: 'America/Denver',
  note: 'About 96 miles of the Colorado River from the Potash ramp: roughly 47 miles of flatwater through Meander Canyon, then about 15 miles of rapids from the Green River confluence, then Lake Powell backwater. Trips usually take 4 to 5 days. Miles above the confluence come from a commercial river log, and below it from American Whitewater distances added to 47.5, so they may differ a mile or two from other guides. Rapids change a lot with flow and with Lake Powell levels. Mineral Bottom, on the Green River, is the other common put-in and adds about 50 miles of flatwater. Other camps named in trip reports without miles include Fallen Slab and Kolb. Compiled from public sources; verify with the park and a current guidebook.',
  camps: d.camps,
  rapids: d.rapids,
  hikes: d.hikes,
  geology: [],
  guide: [],
  almanac: {
    flows: [
      ['Water levels change everything', 'High water runs from early May to late June and can exceed 100,000 cfs; the same rapids at 3,000 cfs are a very different river. Rocks and holes show at low flow; at high flow features drown and big-water runs get pushy. The Button forms a very large center hole at 35,000 cfs and up, and the Big Drops carry more risk above 40,000.'],
      ['Reported ratings by flow', 'At about 3,500 cfs reports describe a Class III river with holes and mid-channel rocks at Big Drop 3. At about 5,000 cfs Big Drop 3 is Class IV with the rest mostly III. At 6,000 to 7,000 cfs, reports describe more and larger rapids below Big Drop 3 and Gypsum Canyon at least Class IV.'],
      ['Lake Powell', 'As the reservoir drops, rapids that were drowned begin to show, and Gypsum Canyon Rapid has become significant since 2018. Sediment (the Dominy Formation) buries other rapids, including Dark Canyon Rapid as of 2021.'],
    ],
    history: [
      ['Capsize', 'The 1891 Best party lost a boat at what became Capsize Rapid. Their inscriptions are on river right.'],
      ['The 1925 oil fire', 'A fire at an oil well near the Potash ramp spilled thousands of barrels of oil into the river over several months.'],
    ],
  },
  rules,
  landmarks: d.landmarks,
  clusters: [{ s: 51.7, e: 67.4, n: 'Cataract rapids' }],
  notes: {
    camp: '*Camps are named in trip reports and sizes are mostly unknown. Camps below the confluence are designated and must be registered. Quality is not rated.',
    hike: '*Difficulty is a rough estimate (1 = short, easy walk; 4 = a long, rugged trail). Times are not given.',
  },
  hdiff: { 1: 'Short, easy walk', 2: 'Easy trail', 3: 'Longer trail with some climbing', 4: 'Long, rugged trail' },
  access,
  yardGrid: [5, 1],
  roads,
  permit,
});
