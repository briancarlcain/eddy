const { parse, write } = require('./common.js');

// Miles from the Hells Canyon boat launch below the dam (0); Pittsburg Landing 32.1; Heller Bar 79.7.
// Mile log and camp notes from GoRafting; classes cross-checked against American Whitewater (the higher class is used where they differ).
const d = parse(`
R|0.5|Cliff Mountain Rapids|II|Easy and visible from the put-in. Keep off the right-side rock face.
R|2.2|Brush Creek Rapids|II|A read-and-run wave train.
R|3.4|Rocky Point Rapids|II|Run best left of center.
R|5.8|Wild Sheep Rapid|IV|The longest rapid on the river, with big waves; the line changes with flow. Scout from river left at the creek confluence.
R|7.8|Granite Rapid|IV|A large submerged rock. The standard line is left under 20,000 cfs; the "Green Room" line opens around 19,000 cfs and up and few boats get through it without flipping. Scout river right just below Lower Granite Creek camp.
R|8.8|Three Creek Rapid|III|A read-and-run wave train. Rated II+ by American Whitewater.
R|11.7|Upper Bernard Creek Rapid|III|Short; the weakness is usually on the left.
R|11.8|Lower Bernard Creek Rapid|III+|Longer, with a large standing wave in the lower half. Great surfing for kayakers.
R|13.3|Waterspout Rapid|IV-|A rock creates a hole at some flows and a sleeper hole on the lower left. At low water run from center left and drive hard right before the bottom. Washes out at high water. The river-right scout trail is shorter. Rated III+ by American Whitewater.
R|13.8|Bills Creek Rapid|III|A read-and-run wave train.
R|15.1|Sluice Creek Rapid|III|Roller-coaster waves; a clear wave train down the right. Rated II by American Whitewater.
R|15.6|Rush Creek Rapids|IV|A large mid-river rock at the top can form a boat-sized hydraulic. A clear wave train runs down the right; more technical at low water. Rated III+ by American Whitewater.
R|17.4|Sheep Creek Rapids|III|Mostly read and run; avoid the rocks.
R|23.9|Hominy Creek Rapids|II|Mostly read and run.
R|28.1|Kirby Creek Rapids|III|A large read-and-run wave train.
R|33.5|Pleasant Valley Rapids|III-|Class II or III depending on flow; hit the big features straight on.
R|51.9|Warm Springs Rapid|III|Read and run; milder at low flow.
R|55.4|Imnaha Rapids|III|Read and run at low flow; washes out at high flow.
R|58.8|Salmon River Falls|II|Read and run, with camps on both sides below.
R|62.3|Frenchy Creek Rapid|II|A long, fun wave train.
R|69.0|Little Cougar Creek Rapid|II|The river splits; the right side of the island is the most fun.
R|71.5|China Garden Rapid|III|Enter left and watch the rocks at the bottom.
R|73.3|Shovel Creek Rapid|III|A medium wave train; watch for holes and rocks.
R|74.8|Wild Goose Rapid|III|Stay left of the large island.
R|75.3|Deer Head Rapid|II|Read and run, with fun waves.
R|78.3|Limekiln Rapid|II|The final rapid. Shallows on the left; stay right.

C|1.1|Stud Creek|L|l|Large and shaded. Named for a horse that fathered colts.
C|1.2|Lamont Springs|R|l|Large group, with a beach. A former mining claim.
C|1.8|Square Beach|R|s|Small group, with a beach.
C|2.3|Brush Creek|R|m|A sandy beach for a medium group.
C|3.4|Rocky Point|R|m|Medium group, with shade and a steep bank.
C|3.6|Chimney Bar|R|l|Large group, with shade.
C|4.0|Warm Springs|R|l|Large group, with shade and a rocky landing.
C|4.7|Battle Creek|L|l|Large, with shade. The hike up Battle Creek is worthwhile.
C|5.2|Sand Dunes|L|s|Small group, with a sandy beach at some flows.
C|5.5|Birch Springs|R|m|A rocky beach for a medium group.
C|5.8|Wild Sheep|L|m|A rocky beach for a medium group, and a large bench camp. The scout for Wild Sheep Rapid.
C|6.6|Rock Bar|R|l|Large, with a rocky beach.
C|7.4|Upper Granite Creek|R|l|Large group, with a very difficult carry.
C|7.5|Lower Granite Creek|R|l|Large group, with a gravel beach at low water.
C|7.9|Cache Creek|L|l|Large group. The landing is in swift current.
C|9.0|Three Creek|R|l|Large group, with a steep climb and shade.
C|9.1|Upper Oregon Hole|L|s|Small group on a rocky shoreline.
C|9.2|Oregon Hole|L|l|Large group, with some shade.
C|9.5|Upper Dry Gulch|R|l|Large group, with shade and an easy landing.
C|9.8|Lower Dry Gulch|R|l|Large group. A spring above camp; treat the water.
C|10.2|Hastings|R|m|Medium group. Evidence of placer mining.
C|10.8|Saddle Creek|L|l|Large group. The eddy may vanish above 30,000 cfs.
C|11.8|Bernard Creek|R|l|Large group, with shade and water.
C|15.2|Sluice Creek|L|l|Large groups. A difficult landing. The airstrip is closed except for emergencies and Forest Service use.
C|15.7|Rush Creek|L|?|A tough rocky landing; camping above.
C|17.1|Johnson Bar Landing|R|l|Large group, with a sandy beach and swimming holes.
C|17.6|Sheep Creek|R|?|A dynamic eddy, water, and cozy nooks with a flat bench.
C|17.8|Steep Creek|R|m|A beach at low water, for a medium group.
C|18.4|Yreka Bar|L|l|Large and shady.
C|18.7|Upper Sand Creek|L|m|Medium, with little shade.
C|19.5|Pine Bar|R|l|Large, with a beach and shade. Hunters camp here in fall.
C|20.5|Upper Quartz Creek|L|l|Large group, with little shade.
C|20.8|Lower Quartz Creek|L|l|Large group, with more shade.
C|21.8|Caribou Creek|R|l|Large group, with shade.
C|22.5|Dry Gulch|L|l|Large group, with a beach, some shade and a late sunset.
C|22.5|Big Bar|R|l|Large group, at the end of the airstrip.
C|24.1|Hominy Bar|L|l|Large group at low to medium water.
C|24.4|Salt Creek|L|l|Large group, with a beach, shade and water.
C|24.8|Two Corral Creek|L|l|Large group, with a beach and some shade.
C|25.0|Gracie Bar|R|l|Large group, with shade and a good landing. Suicide Point access.
C|25.4|Half Moon Bar|R|s|Small group, with an easy landing. Hike to Suicide Point and Kirkwood.
C|26.0|Slaughter Gulch|L|l|Large group, with an easy landing.
C|26.7|Kirkwood Bar|R|l|Four large group sites with toilets, tables and shade.
C|27.0|Yankee Bar|L|s|Small group, with little shade; rarely used.
C|27.4|Russel Bar|R|l|Large group, with some shade.
C|28.7|Cat Gulch|R|m|A small beach with shade, for a medium group.
C|30.0|Corral Creek|R|l|A cobble beach with shade and water upstream. A small camp at the creek mouth.
C|30.6|Fish Trap Bar|L|l|Large group, with a sandy beach.
C|30.7|Upper Pittsburg Landing|R|?|Six road-accessible sites with tables and toilets, some shade and no water.
C|31.3|Wilson Eddy|L|l|Large group, with some shade.
C|33.0|Pleasant Valley|R|?|Campsites used by road-access users.
C|34.6|Davis Creek|L|m|Medium group, with an easy landing.
C|35.0|McCarty Creek|L|m|Medium group.
C|36.4|Big Canyon|R|l|Large group, with water and shade.
C|36.6|Lower Big Canyon|R|s|A small sandy beach.
C|37.0|Somers Creek|L|l|Large, with shade.
C|37.2|Camp Creek|L|l|Large group, with a sandy beach.
C|37.6|Tyron Creek|L|l|Large group, with water and shade.
C|39.0|Lookout Creek|L|l|Large group, with minimal shade.
C|42.5|Bob Creek|L|l|Large group, with a sandy beach.
C|45.1|Bar Creek|L|l|Large group, with shade.
C|47.7|Deep Creek|L|sm|Small to medium group, with a tough carry.
C|48.6|Robinson Gulch|L|l|Large group, with shade.
C|48.8|Dug Creek|L|s|Small group, with accessible water.
C|53.0|Zig Zag|R|s|Small group, with a sandy beach.
C|53.5|Divide Creek|R|s|Small group, with a sandy beach.
C|54.6|China Bar|L|l|Large group, with a sandy beach.
C|55.3|Imnaha|L|m|Medium group, with a tough carry at low water. The mine tunnel is gated to protect Townsend's big-eared bats.
C|55.5|Fargo|L|m|Medium group, near the Fargo town and mining site.
C|56.6|Knight Creek|L|l|Large group, with shade and water.
C|59.1|Salmon Bar|L|?|There is a seldom-used 762-ft airstrip behind camp.
C|59.2|Salmon Falls Beach|R|l|A medium to large sandy beach; windy.
C|61.0|Cave Cove|L|l|Large, with a shallow cave behind camp.
C|62.5|Upper Geneva Bar|L|xl|Very large; often used by outfitters.
C|62.6|Lower Geneva Bar|L|l|A large beach; outfitters are common.
C|63.2|Taco Bell Beach|L|l|A large beach.
C|64.4|Sentinel Rock|L|l|Medium to large, with a good eddy.
C|65.0|Jim Creek|L|l|Large; the creek enters downstream.
C|65.2|Lower Jim Creek|L|l|Large.
C|65.4|Across the Meat|L|l|Large.
C|65.5|Meat Hole|R|l|Large, with a strong eddy near the bottom.
C|66.0|Upper Cottonwood|R|l|Large, with a single tree in the center.
C|66.4|Lower Cottonwood|R|l|Large, below the creek.
C|67.5|Across from Upper Cougar|L|l|A large beach.
C|67.5|Upper Cougar|R|l|Large.
C|69.9|Upper Cache Creek|L|l|A large beach upstream of the ranch.
C|71.4|Upper China Garden|R|l|Large, near private homes.
C|71.5|China Garden|R|l|Large, near private homes.
C|71.9|Lower China Garden|R|l|A large beach that shrinks at high flow.

H|3.9|Warm Springs pit houses|R|1|Depressions where Native American pit houses stood. Respect the site.
H|4.6|Battle Creek|L|3|A worthwhile hike up the creek from the confluence. Barton Cabin, built by Ralph Barton, is a short walk from the eddy.
H|7.7|Granite Rapids scout and pictographs|R|1|An overlook along the base of the cliff with pictographs. Do not touch.
H|11.7|McGaffee Cabin|R|1|Built in 1905 and on the National Register of Historic Places, at Bernard Creek.
H|17.7|Sheep Creek Cabin|R|1|An 1884 homestead, often leased; pit toilets may be available.
H|24.2|Suicide Point|R|3|About a 400 ft climb to spectacular views. Watch for rattlesnakes.
H|26.3|Kirkwood Historic Ranch|R|1|A Forest Service staffed ranch with toilets, no drinking water and communications. A 6-mile trail leads to Pittsburg Landing.
H|47.8|Chinese Miners Massacre memorial|L|1|Stone wall remnants and a memorial for the 1887 killings, erected in 2012.
H|57.2|Imnaha steamboat rings|-|1|Iron rings in the walls used to winch steamboats upstream.
H|70.5|Cache Creek Ranch|L|1|A museum, orchard, boat ramp and toilets, for day use.

L|0.0|Hells Canyon boat launch|1|Day use only: a long ramp with limited parking, a bathroom, and no camping or water.
L|18.0|Dry Diggins view|0|A ridge described as the highest visible point on the Idaho side (7,828 ft).
L|20.0|High Bar|0|A gravel bar from a landslide and the Bonneville Floods about 15,000 years ago.
L|22.5|Big Bar airstrip|1|The only public airstrip on the Idaho side.
L|23.3|Temperance Creek Lodge|1|Cabins and a private airstrip.
L|26.3|Kirkwood Historic Ranch|1|Staffed year-round by the Forest Service.
L|28.3|Kirby Creek Lodge|1|A lodge for up to 20 people.
L|30.5|Wild and Scenic boundary|0|Scenic to the north and Wild to the south, designated in 1975.
L|32.1|Pittsburg Landing|1|Road-accessible launch and take-out with a visitor center. No camping; a spigot in summer. Most 3 to 4 day trips end here.
L|34.0|Proposed Pleasant Valley dam|0|A 1954 dam proposal; yellow paint marks the site. Wild and Scenic protection blocked it.
L|41.6|Copper Creek Lodge|1|41 acres and 23 cabins. Reservations are required and camping is prohibited.
L|50.3|Nez Perce crossing|0|The 1877 river crossing during the spring flood.
L|50.4|Dug Bar landing|1|A primitive launch and airstrip. High-clearance 4WD only; toilets and camping.
L|55.3|Imnaha River confluence|0|A Wild and Scenic river known for fishing and wildlife.
L|58.7|Salmon River confluence|0|The longest undammed free-flowing river in the lower 48.
L|59.3|Mr. Peanut|0|A rock formation on the Oregon-side ridge.
L|73.3|Homes and lodges|0|Private homes and lodges continue to the take-out.
L|79.3|Grande Ronde confluence|0|Another whitewater river, just above the take-out.
L|79.7|Heller Bar|1|Take-out. A paved ramp and restrooms; a Washington Discover Pass is required for vehicles.
`);

const permit = {
  status: 'Required May 22 to Sept 10 (2026) · lottery for the Wild section',
  asOf: 'October 2026',
  apply: { label: 'Apply on Recreation.gov', url: 'https://www.recreation.gov/permits/234625' },
  contact: { phone: '509-758-0616', web: 'https://www.recreation.gov/permits/234625' },
  sections: [
    {
      name: 'How to get one',
      items: [
        { t: 'The primary season', d: 'From the Friday before Memorial Day through September 10 (May 22 to September 10 in 2026), a Wild River Reservation is required seven days a week for the Wild section: Hells Canyon Dam to Upper Pittsburg Landing. Reservations are available only through Recreation.gov (877-444-6777).' },
        { t: 'Lottery', d: 'Hells Canyon is part of the Four Rivers Lottery, with applications due January 31. Cancellations can be picked up on Recreation.gov. Confirm the current dates there.' },
        { t: 'Secondary season', d: 'Outside the primary season, and Monday through Thursday in the primary season, a self-issue permit is required for the whole corridor. No advance reservation is needed. Boat tags and permits come from the Clarkston, Washington Snake River office or a launch officer at Pittsburg Landing.' },
        { t: 'Eligibility', d: 'The permit holder must be at least 18, must not be under a late-cancellation or no-show penalty on this river, must sign a statement that they understand the definition of a private float boat trip, and cannot transfer the permit.' },
        { t: 'Launches', d: 'Three private permit launches are available daily in the primary season. Scenic floats launching from Pittsburg are limited to two a day on Fridays, Saturdays, Sundays and holidays.' },
      ],
    },
    {
      name: 'Costs and cancellation',
      items: [
        { t: 'Fees', d: 'A $6 reservation fee, non-refundable, paid by card on Recreation.gov. There are no per-person recreation fees.' },
        { t: 'Group size', d: 'Up to 24 people.' },
        { t: 'Cancellation', d: 'Cancel on Recreation.gov no later than 15 days before launch. The deadline may be waived for extreme water conditions, but you must still cancel. A missed deadline is a no-show and affects permit eligibility for one year.' },
      ],
    },
    {
      name: 'Motors',
      items: [
        { t: 'Non-motorized periods', d: 'Powerboats are prohibited in the Wild section from the top of Wild Sheep Rapids to Kirkwood Upper Landing during non-motorized periods. These fall on Monday through Wednesday, beginning the first Monday in June and continuing every other week through the primary season.' },
        { t: 'Kicker motors', d: 'Operating a kicker motor in the Wild section, from the Hells Canyon launch to Upper Pittsburg Landing, is prohibited except in an emergency.' },
      ],
    },
  ],
};

const rules = [
  {
    name: 'Required equipment',
    rules: [
      { t: 'Life jackets', d: 'At least one U.S. Coast Guard approved life jacket per person.' },
      { t: 'Human waste', d: 'A reusable, sealable, leak-proof human waste carry-out system.' },
      { t: 'Fire pan', d: 'A fire pan for all fires.' },
      { t: 'Invasive species', d: 'An Oregon or Idaho invasive species sticker.' },
    ],
  },
  {
    name: 'On the river',
    rules: [
      { t: 'Cultural sites', d: 'Respect pictographs and pit house sites; do not touch pictographs.' },
      { t: 'Water', d: 'Treat all water before drinking. Pittsburg Landing has a spigot only in summer.' },
      { t: 'Rattlesnakes', d: 'Rattlesnakes are present, including at the Suicide Point and Waterspout scout trails. Watch for poison ivy too.' },
      { t: 'Jet boats', d: 'Jet boats share the river and trip reports describe heavy traffic. Hold your line, and pull aside only as needed.' },
      { t: 'Bats', d: 'The Imnaha mine tunnel is gated to protect Townsend\'s big-eared bats.' },
    ],
  },
];

const access = [
  { name: 'Oxbow', road: true, hub: true, note: 'Nearest community to the put-in; Hells Canyon launch office', grid: [1, 2] },
  { name: 'Clarkston', road: true, hub: true, note: 'Washington side; Snake River office and take-out region', grid: [10, 2] },
  { name: 'Hells Canyon launch', road: true, mile: 0, park: true, note: 'Put-in below the dam', grid: [1, 6] },
  { name: 'Pittsburg Landing', road: true, mile: 32.1, park: true, note: 'Take-out for the Wild section; visitor center', grid: [4, 6] },
  { name: 'Dug Bar', road: true, mile: 50.4, note: 'Primitive access; high-clearance 4WD only', grid: [7, 6] },
  { name: 'Heller Bar', road: true, mile: 79.7, park: true, note: 'Take-out. Paved ramp; Washington Discover Pass', grid: [10, 6] },
];
const roads = [
  { a: 'Oxbow', b: 'Hells Canyon launch', h: '' },
  { a: 'Clarkston', b: 'Heller Bar', h: '' },
  { a: 'Oxbow', b: 'Pittsburg Landing', h: '' },
  { a: 'Oxbow', b: 'Clarkston', h: '' },
  { a: 'Outfitter', b: 'Oxbow', h: '' },
];

write('hells-canyon', {
  name: 'Hells Canyon of the Snake River',
  reach: 'Hells Canyon Dam to Heller Bar',
  agency: 'Hells Canyon National Recreation Area, Wallowa-Whitman National Forest',
  miles: [0, 79.8],
  days: 5,
  coords: [45.1, -116.7],
  tz: 'America/Los_Angeles',
  note: 'The deepest river canyon in North America. The 32-mile Wild section from the dam to Pittsburg Landing holds the big rapids and usually takes 3 to 4 days; the river continues about 48 miles to Heller Bar. Miles are from the Hells Canyon launch as in one mile-by-mile guide. The Snake is dam-controlled, with trip-reported flows of about 8,500 to 20,000 cfs. Camp sizes are from that guide; quality is not rated. Compiled from public sources; verify with the Forest Service and the USFS Boater\'s Guide.',
  camps: d.camps,
  rapids: d.rapids,
  hikes: d.hikes,
  geology: [],
  guide: [],
  almanac: {
    history: [
      ['The canyon', 'Hells Canyon averages about 5,500 feet below the rim for roughly 75 miles, with the Seven Devils Mountains on the Idaho side. The dam complex upstream was built between 1959 and 1967.'],
      ['Chinese miners', 'In 1887 a group of Chinese miners was killed on the Oregon side. A memorial was erected in 2012.'],
      ['The Nez Perce', 'In 1877 the Nez Perce crossed the Snake near Dug Bar during spring flood.'],
      ['Wild and Scenic', 'The river was designated Wild and Scenic in 1975. A 1954 proposal for a dam at Pleasant Valley was blocked by that protection.'],
    ],
    flows: [
      ['Flows', 'Releases are controlled at the dam. Granite Rapid was "juicing" near 20,000 cfs and ran fine at 14,000 to 15,000. Waterspout has options above 14,000 cfs. Check Idaho Power\'s flow line at 800-422-3143.'],
    ],
  },
  rules,
  landmarks: d.landmarks,
  clusters: [
    { s: 0, e: 32.1, n: 'Wild section' },
    { s: 32.1, e: 79.7, n: 'Scenic section' },
  ],
  notes: {
    camp: '*Camp sizes are from one guide and vary with river level. Quality is not rated.',
    hike: '*Difficulty is a rough estimate (1 = short, easy walk; 3 = long or steep trail). Times are not given.',
  },
  hdiff: { 1: 'Short, easy walk', 2: 'Easy trail', 3: 'Long or steep trail' },
  access,
  yardGrid: [5, 1],
  roads,
  permit,
});
