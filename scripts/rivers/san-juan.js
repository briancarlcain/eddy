const { parse, write } = require('./common.js');

// Miles from the Sand Island boat ramp (0); Mexican Hat ramp 27.46; Clay Hills ramp 84.32.
// Mile log and camp notes from GoRafting's mile-by-mile guide; permit details from the BLM and Recreation.gov.
const N = 'Navajo Nation land: a Navajo permit is required to camp.';
const d = parse(`
R|12.19|Four Foot Rapid|II|The first true riffle. Watch the rock on the left at low flow.
R|17.77|Eight Foot Rapid|II|Boulder-strewn; scout from river left. Left-bank camping is closed here to protect bighorn sheep.
R|19.88|Ledge Rapid|II|Named for a shelf on the left bank. Run right to avoid shallowing.
R|25.56|25 Mile Riffle|I|Read and run.
R|27.98|Gypsum Creek Rapid|II|The steepest rapid on the trip. Take the left channel and work right, watching the left shore. Harder at low flow.
R|48.92|Twin Canyon Rapid|II|Run left at all flows. Scout at low flows, when boulders block the right channel. American Whitewater rates it III-.
R|53.24|Ross Rapid|II|Named for Kenny Ross, an early San Juan outfitter. Watch the rocks at the bottom.
R|64.46|Government Rapid|III|The last rapid. A short boulder garden with a debris fan from the river-left canyon. Scout from river left.

C|1.70|Sand Island camps|R|?|Several camps over the next couple of miles. Road access, so expect sharing.
C|2.04|Goldmine|R|?|Multiple pull-ins and camps.
C|2.40|2.2 Mile|R|m|Medium.
C|3.33|3 Mile|L|l|Large. Navajo Nation land. The unloading spot varies with water level.
C|5.35|Desecration|L|l|Large camp.
C|6.80|River House|R|l|Large, with the best parking for River House access.
C|6.95|Cottonwood|L|l|Large, in a cottonwood grove.
C|7.35|Comb Ridge|R|?|Hard to reach at low water.
C|8.39|Lime Ridge|R|l|Large.
C|8.68|Upper Chinle|L|?|Hike up Chinle Creek from camps on this bank.
C|8.86|Chinle|L|l|Large and open. Parking depends on water level.
C|9.11|Big Stick|R|l|Large.
C|9.65|Lower Chinle|L|?|Hot, wide open, with plenty of space.
C|10.00|Mule Ear|L|?|Navajo Nation permit required.
C|10.75|10.3 Mile|R|s|Small; not desirable.
C|10.89|10.4 Mile|L|m|Medium. Navajo permit required. Hike to the ridge behind camp.
C|11.81|Prospector|R|?|
C|13.58|Midway|R|m|Decent and medium. No river-right camps again until about mile 20.
C|15.46|14.9 Mile|L|?|Navajo permit required.
C|16.12|15.5 Mile|L|m|Popular and medium. Navajo permit required.
C|17.96|Lower Eight Foot|L|m|Medium, just below the rapid. Navajo permit required. Not affected by the closure.
C|18.05|Below Lower Eight Foot|L|?|Navajo permit required.
C|19.96|Ledge|L|?|Navajo permit required.
C|20.85|Fossil Stop|R|m|Medium. Backs onto the old road, which climbs toward Soda Basin.
C|21.04|20.5 Mile|L|s|Small. Navajo permit required.
C|21.60|Lime Creek|R|m|Medium, extending toward the creek drainage.
C|22.92|Pour Off|R|s|Small sandy beach just below the canyon.
C|23.76|Mexican Hat|L|l|Large, with a view of Mexican Hat rock. Navajo permit required.
C|25.62|25 Mile|L|s|Small as of 2021. Navajo permit required.
C|29.08|28.5 Mile|L|?|${N}
C|29.27|28.7 Mile|L|?|${N}
C|29.69|Pontiac Wash|L|?|${N}
C|31.91|Mendenhall|L|?|Hot and exposed. ${N}
C|32.56|32 Mile|R|?|
C|33.63|Tabernacle|R|?|
C|35.50|35 Mile|L|?|${N}
C|36.06|35.4 Mile|L|?|Backs against a cliff, shaded on hot days. ${N}
C|36.19|Minisazi|L|s|Similar to 35.4 Mile but smaller. ${N}
C|37.76|37 Mile|R|?|
C|38.26|37.7 Mile|R|?|
C|38.86|GSP|L|?|${N}
C|41.56|Bump|R|?|
C|42.96|42.3 Mile|L|?|${N}
C|43.46|42.9 Mile|L|?|${N}
C|44.66|False Honaker|L|?|${N}
C|45.11|Upper Honaker|R|?|
C|45.26|Honaker|R|l|Large. The Honaker Trail starts near its lower end, so expect trail traffic.
C|47.11|46.6 Mile|L|?|${N}
C|47.22|46.7 Mile|L|?|${N}
C|49.06|Twin Canyon|R|m|Nice, with easy access to the canyon behind. A long sandy beach that is good for kids.
C|50.24|49.7 Mile|L|?|${N}
C|51.27|50.7 Mile|R|?|
C|53.34|Ross Rapid|R|?|
C|55.40|54.8 Mile|L|?|${N}
C|56.97|56.3 Mile|L|?|${N}
C|57.36|False Johns|R|?|
C|58.73|58 Mile Right|R|?|
C|59.54|Johns Canyon|R|?|
C|59.74|Lower Johns Canyon|R|?|
C|59.96|59.3 Mile|L|?|Navajo permit required.
C|61.90|61.2 Mile|R|?|
C|62.07|Art Gallery|R|?|
C|62.24|61.5 Mile|R|s|Small. Several unremarkable small camps follow until Government Camp.
C|62.71|62 Mile|R|s|Small.
C|64.08|Furnace Flat|R|?|
C|64.52|Government|L|?|Navajo land, with no shade. The last camp before BLM reservations are required.
C|66.90|Slickhorn A|R|?|BLM reservation required. Slickhorn is one of nine designated camps below Government Rapid.
C|67.27|Slickhorn B|R|?|BLM reservation required.
C|67.47|Slickhorn C|R|?|BLM reservation required. One of the larger, preferred sites, next to D.
C|67.52|Slickhorn D|R|?|BLM reservation required. One of the larger, preferred sites, next to C.
C|67.57|Slickhorn E|L|?|BLM reservation required.
C|71.17|Grand Gulch|R|?|BLM reservation required. On a shelf just below Grand Gulch; at low water park at the downstream end. Good wash access.
C|72.67|Trimble|L|s|BLM reservation required. Small.
C|76.67|Oljeto Wash|L|s|BLM reservation required. Small, with big views. Not on Navajo land, but hiking up the canyon enters it and needs a permit. Flash-flood caution: a large drainage. False Oljeto, just upstream, is not the real one.
C|78.47|Steer Gulch|R|?|BLM reservation required. The last camp before the take-out. Flash-flood caution.

H|0.00|Sand Island petroglyphs|R|1|A petroglyph panel under a mile upriver of the launch, near the campground.
H|3.60|Moki Steps|R|1|Ancient toe holds in the wall, visible from about 100 yards downstream. Look, but stay off them.
H|4.63|Butler Wash petroglyphs|R|1|A petroglyph panel reached by walking upstream from the wash. Camping is closed here.
H|5.00|Lower Butler Wash petroglyphs|R|1|More rock art, directly below the island.
H|6.80|River House ruin|R|2|A 14-room 13th-century pueblo ruin about a quarter mile from the river. A must-stop. Do not climb on the walls.
H|9.53|Chinle Creek|L|3|Hike up the wash from the camps on this bank. Navajo permit required.
H|31.87|Mendenhall's Cabin|R|2|Trail starts on the far side of the saddle across the Mendenhall Loop. An easy hike with views.
H|45.30|Honaker Trail|R|4|A clearly marked historic trail to the rim, about 1,200 ft of climb over roughly 2.5 miles. It starts at the lower end of Honaker camp.
H|67.34|Slickhorn Gulch|R|3|The most-cited hike on the river: plunge pools and hanging gardens, with a swimming pool up the gulch. A longer hike reaches Trail Canyon, about 7 miles round trip.
H|71.17|Grand Gulch|R|3|A "must-stop" side hike up a well-known canyon. Watch for flash floods.

L|0.00|Sand Island boat ramp|1|Put-in. A paved ramp with toilets and water. The only drinking water on the river. The campground can be booked on Recreation.gov.
L|0.48|Highway 191 bridge|1|There is no other bridge until Mexican Hat.
L|1.79|Tiger Wall|0|A striped sandstone cliff that forces a sharp right turn.
L|7.10|Barton's Trading Post|0|Listed in river logs at this bend on river right.
L|9.53|Chinle Creek confluence|0|The river splits just above the confluence and can look like a braided stream.
L|18.09|Left-bank camping closure|0|Camping on river left is closed from here to mile 19.9 to protect bighorn sheep.
L|21.60|Lime Creek|0|Confluence with the San Juan.
L|27.46|Mexican Hat boat ramp|1|Upper take-out and lower put-in. A large gravel bar; no water and an outhouse. Park at the private lot uphill in town; cars have been broken into at the ramp.
L|28.54|Mexican Hat bridge|1|Highway 163. Most of the town is visible just below.
L|30.73|Mendenhall Loop|0|About 1.1 river miles around, but only about 450 feet across the saddle.
L|38.00|Tabernacle|0|The peak marks the start of the Goosenecks, with the overlook of Goosenecks State Park above.
L|46.10|Halfway Rock|0|A large rock seen from the Honaker Trail, close to halfway to Clay Hills.
L|65.11|Start of reservations|0|From here downriver, BLM camp reservations are required for campsites on both banks.
L|65.40|Flatwater and sandbars begin|0|Lake Powell sediment has filled the channel and the current ends. The river drops under about 1 ft per mile to the take-out. Large boats can hang up on mud bars.
L|79.77|Whirlwind Draw|0|The last big draw before the take-out.
L|81.57|Final straightaway|0|About 2.75 miles to the boat ramp. Shifting sandbars; sand waves can reach about 10 ft.
L|84.32|Clay Hills boat ramp|1|Take-out. A toilet only, with no trash service or water. At low levels a trailer may not reach the water. Piute Farms waterfall lies downstream; do not continue past the ramp.
`);

const permit = {
  status: 'Required year-round · lottery April 15 to July 15',
  apply: { label: 'Apply on Recreation.gov', url: 'https://www.recreation.gov/permits/250986' },
  contact: { phone: '435-587-1544', email: 'blm_ut_sanjuan_permits@blm.gov', web: 'https://www.blm.gov/programs/recreation/passes-and-permits/lotteries/utah/sanjuanriver' },
  sections: [
    {
      name: 'How to get one',
      items: [
        { t: 'Choose your launch date', d: 'A permit is required year-round on the river between Montezuma Creek and Clay Hills, and you must hold it before arriving at the ramp. Permits are for private groups only; commercial and organized groups need a BLM Special Recreation Permit.' },
        { t: 'Lottery season: April 15 to July 15', d: 'Apply on Recreation.gov from December 1 to January 31 (11:59 p.m. Mountain). Results come out February 14. Winners must accept and pay by March 15. Unclaimed dates and cancellations are released on March 16.' },
        { t: 'Before the lottery season: January 1 to April 14', d: 'Reservations open December 1 at 8 a.m. Mountain. Cancellations are released within 24 hours.' },
        { t: 'After the lottery season: July 16 to December 31', d: 'Reservations open March 16 at 8 a.m. Mountain.' },
        { t: 'Alternates', d: 'An alternate permit holder can be added only on the lottery application or at purchase outside the lottery season. BLM will not add one by phone or email.' },
        { t: 'Print the permit', d: 'You can print it 14 days before launch. Gear is inspected at the put-in.' },
        { t: 'Short notice', d: 'For launches five days away or less, and for Montezuma Creek to Sand Island, call the River Desk at 435-587-1544.' },
      ],
    },
    {
      name: 'Camps and the Navajo Nation',
      items: [
        { t: 'Reserved camps below Government Rapid', d: 'If you exit at Clay Hills you must reserve at least one campsite, and may reserve up to two nights, in the nine designated sites below Government Rapid (about mile 65). The first night must be at Slickhorn A through E; the second must be downstream of Slickhorn. Sites cannot be reused or shared without written BLM approval.' },
        { t: 'How to ask', d: 'Submit camp preferences online when you book. They cannot be submitted by phone or email. If you give none, BLM assigns sites, usually within five days.' },
        { t: 'Sand Island to Mexican Hat', d: 'No camp reservations are needed on river right. A camp on river left is Navajo Nation land and needs a Navajo permit.' },
        { t: 'Navajo permit', d: 'Camping on river left from Montezuma Creek to Trimble Camp, and any hiking or visiting of archaeological sites there, needs a Navajo permit. Call the Navajo Parks and Recreation office at 928-871-6647 well ahead; turnaround can be as short as 3 days. Monument Valley Navajo Tribal Park: 435-727-5871.' },
        { t: 'Bighorn closure', d: 'Camping on river left is closed from about mile 18.1 to 19.9 to protect bighorn sheep.' },
      ],
    },
    {
      name: 'Costs',
      items: [
        { t: 'Transaction fee', d: '$6, non-refundable, on every lottery application and reservation.' },
        { t: 'Per person', d: 'Sand Island to Mexican Hat $10. Mexican Hat to Clay Hills $20. Sand Island to Clay Hills $30. Montezuma Creek to Sand Island is free.' },
        { t: 'When the fee applies', d: 'Per-person fees apply to launches March 1 to October 31. There are none for launches from November 1 to the end of February.' },
        { t: 'Sand Island campground', d: 'Reported at $10 to $15 per night on Recreation.gov. It is useful for the night before launch.' },
      ],
    },
    {
      name: 'Limits and refunds',
      items: [
        { t: 'Group size', d: 'Up to 25 people, all ages counting toward the limit and the fees.' },
        { t: 'No pets', d: 'Pets are not allowed between Sand Island and Clay Hills. Service animals must be preauthorized by the Monticello River Office.' },
        { t: 'Refunds', d: 'Cancelling or reducing the group 15 or more days before entry is refunded. There is no refund 14 days or less before entry, even for poor flows or weather.' },
        { t: 'Changes', d: 'Group size can change until 5 days before entry, before the permit is printed. A change of date or segment means cancelling and rebooking. Changes less than 5 days out must be made by phone.' },
        { t: 'Launch limit', d: 'One planning guide reports a limit of 75 people per day launching from Sand Island. Confirm with BLM.' },
      ],
    },
  ],
};

const rules = [
  {
    name: 'Required equipment',
    rules: [
      { t: 'Life jackets', d: 'A properly sized Type I, III or V life jacket for each person. Type II is legal in Utah but BLM strongly advises against it. One planning guide reports that everyone aged 13 or older must wear theirs at all times until below Slickrock Canyon, and children under 13 always.' },
      { t: 'Repair and rescue gear', d: 'A first-aid kit, a repair kit for every type of boat, and a boat pump for each type of boat.' },
      { t: 'Spares', d: 'One extra oar, paddle or motor for rafts, dories and canoes. One extra paddle per three kayaks, stand-up boards or inflatable kayaks.' },
      { t: 'Toilet', d: 'An approved portable toilet system. Pack all waste out.' },
      { t: 'Fire pan', d: 'A fire pan is required even if you use a camp stove, except on one-day trips between April 1 and October 31.' },
      { t: 'Water', d: 'Bring all your drinking water: about 1 gallon per person per day. The river carries about 25 million tons of sediment a year and clogs most filters. The only potable water is at Sand Island.' },
    ],
  },
  {
    name: 'Conditions and hazards',
    rules: [
      { t: 'Sediment and Lake Powell', d: 'Below about mile 65 the current dies and the river braids across mud bars. Large rafts can hang up, especially from Slickhorn to Clay Hills.' },
      { t: 'Flash floods', d: 'Side canyons such as Grand Gulch, Slickhorn, Oljeto and Steer Gulch drain large areas. Camp above the high-water line and watch the sky.' },
      { t: 'Wind and heat', d: 'Afternoon up-canyon winds are common in the lower section, and summer heat is severe. Plan to cover ground in the morning.' },
      { t: 'Cold water', d: 'Wear a wetsuit and booties from spring through early summer.' },
      { t: 'No cell service', d: 'Service is unreliable. A satellite phone or messenger is recommended. San Juan County Sheriff: 435-587-2237.' },
    ],
  },
  {
    name: 'Cultural sites',
    rules: [
      { t: 'Do not touch or climb', d: 'Do not touch petroglyphs, climb on ruin walls or stand on the Moki steps. Leave artifacts where they lie.' },
    ],
  },
];

const access = [
  { name: 'Bluff', road: true, hub: true, note: 'Nearest town to Sand Island; permits and shuttle services', grid: [2, 2] },
  { name: 'Mexican Hat', road: true, hub: true, note: 'Town at the half-way ramp', grid: [6, 2] },
  { name: 'Sand Island', road: true, mile: 0, park: true, note: 'Put-in. Ramp, campground, toilets and water', grid: [1, 6] },
  { name: 'Mexican Hat ramp', road: true, mile: 27.46, note: 'Upper take-out or lower put-in; no water. Do not leave vehicles overnight', grid: [5, 6] },
  { name: 'Clay Hills', road: true, mile: 84.32, park: true, note: 'Take-out. Toilet only, no water or trash. Long dirt road', grid: [10, 6] },
];
const roads = [
  { a: 'Bluff', b: 'Sand Island', h: '' },
  { a: 'Mexican Hat', b: 'Mexican Hat ramp', h: '' },
  { a: 'Bluff', b: 'Mexican Hat', h: '' },
  { a: 'Mexican Hat', b: 'Clay Hills', h: '' },
  { a: 'Outfitter', b: 'Bluff', h: '' },
];

write('san-juan', {
  name: 'San Juan River',
  reach: 'Sand Island to Clay Hills Crossing',
  agency: 'Bureau of Land Management, Monticello Field Office',
  miles: [0, 84.4],
  days: 7,
  coords: [37.2, -109.95],
  tz: 'America/Denver',
  note: 'About 84 miles through Bears Ears country: the Upper San Juan (Class I-II) to Mexican Hat, then the Lower San Juan (Class II-III) through the Goosenecks to Clay Hills. Miles follow one guide from Sand Island; other guides count from different points and may differ. River-left camps are Navajo Nation land. Camps are listed by size only where a source gave one; quality is not rated. Compiled from public sources; verify with the BLM and a current guidebook.',
  camps: d.camps,
  rapids: d.rapids,
  hikes: d.hikes,
  geology: [],
  guide: [],
  almanac: {
    history: [
      ['Kenny Ross', 'Ross Rapid is named for Kenny Ross, an early outfitter on the San Juan.'],
      ['The 1879 expedition', 'Butler Wash is named for John Butler, a member of the 1879 San Juan expedition.'],
      ['The Goosenecks', 'Below Mexican Hat the river doubles back on itself in tight, entrenched bends. Goosenecks State Park looks down on them from the rim.'],
      ['Lake Powell sediment', 'When Lake Powell backs water up the canyon, the silt the river carries settles out and fills the channel, which is why the current dies below Government Rapid.'],
    ],
  },
  rules,
  landmarks: d.landmarks,
  clusters: [
    { s: 38, e: 46, n: 'The Goosenecks' },
    { s: 65.1, e: 84.3, n: 'Reserved camps and flatwater' },
  ],
  notes: {
    camp: '*Only some camps have a size in the sources. Quality is not rated. River-left camps are Navajo Nation land and need a Navajo permit. Camps below mile 65 need a BLM reservation.',
    hike: '*Difficulty is a rough estimate (1 = short, easy walk; 4 = climb of about 1,200 ft). Times are not given.',
  },
  hdiff: { 1: 'Short, easy walk', 2: 'Easy trail', 3: 'Longer trail with some climbing', 4: 'Steep climb' },
  access,
  yardGrid: [5, 1],
  roads,
  permit,
});
