const { parse, write } = require('./common.js');

// Miles from the Lodore boat ramp (0). Echo Park / Yampa confluence at 18.5; Split Mountain ramp at about 44.
// Features and miles from Adventure Bound's Gates of Lodore river log; rapid detail from American Whitewater.
// The miles of the beaches between Jones Hole and Island Park are only given as a span (about 27 to 31); they are listed in log order.
const d = parse(`
R|3.0|Winnie's Rapid|-|The first rapid. A huge boulder splits the river in half, and the easiest scout is on the right. Avoid the big center boulder and the shallow rocks on river right. A scout trail runs along river left. A pillow rock called Lucifer sits below the first drop; guides suggest riding it.
R|5.5|Buster Basin Creek rapid|-|Debris flows from Buster Basin Creek in recent years have made an exciting rapid here.
R|6.8|Upper Disaster Falls|IV|The first Class IV of the trip. A long, tumultuous rapid with many obstacles that gets harder at certain water levels. Powell's party lost a supply boat here.
R|7.1|Middle Disaster|-|Technical. Stay left and read the water. The right side can be dangerous; one group flipped three oar rigs there.
R|7.4|Lower Disaster Falls|III|A rock garden with a possibly submerged cobble island right of mid-channel.
R|9.8|Harp Falls|III|Marked Class III on the map before Triplet Falls. A 2007 trip noticed no rapid there at low flow.
R|11.5|Triplet Falls|III+|Three drops through two large turns. Scout river left and run center, right, left. Avoid the rock on river right at the last drop; the run-out can be shallow. Rated III in some sources and IV in others.
R|12.0|Hell's Half Mile|III+|One of the nation's top-ten "Big Drops". Weave through boulders to the center slot into a wave train, then a quarter mile of rocks, waves and holes that ease gradually. Rated III by American Whitewater and IV in a guidebook. The rapid splits into three channels at the bottom, with a large beach on river left.
R|29.0|Greasy Pliers Rapid|-|In Whirlpool Canyon. Not rated individually.
R|37.5|Moonshine Rapid|-|In Split Mountain Gorge. Pretty easy: center, then right. Scout left to avoid odd rocks in the last drop. Life jackets required.
R|38.5|S.O.B. Rapid|-|In Split Mountain Gorge. Technical. Pass the small center boulder, pull right, then move into the right channel. Scout left.
R|39.0|Schoolboy Rapid|-|In Split Mountain Gorge.
R|42.0|Inglesby Rapid|-|The last rapid in Split Mountain Gorge, just above the take-out.

C|8.5|Pot Creek|R|?|Two campsites. The creek runs to the river in spring runoff, and the cliff walls opposite are a playground for desert bighorn sheep.
C|11.0|Triplet Falls Beach|L|?|A campsite marked by a post just before you hear the rapid.
C|14.0|Wild Mountain Beach|R|?|There have been sightings of a moose in this area.
C|15.5|Limestone Beach|L|?|Many shady trees. Hike up the cliffs to the Hanging Garden.
C|26.5|Jones Hole|-|?|Three sites near the mouth of cold, clear Jones Creek.
C|27.5|Compromise Beach|-|?|Listed in log order between Jones Hole and Sage Creek; mile is estimated.
C|30.0|Cove Beach|L|?|Listed in log order below Red Wash Canyon; mile is estimated.
C|30.5|Island Park|-|?|One site in the flatwater of Island Park.

H|3.0|Winnie's Rapid scout trail|L|1|A trail on river left that overlooks the first drop. Winnie's Grotto and a sandy beach make a good stop.
H|15.5|Hanging Garden|L|2|Hike up the cliffs from Limestone Beach to the Hanging Garden and an overlook.
H|19.5|Echo Park trails|-|2|Pool Creek, petroglyphs on the cliffs, inscriptions by the hermit Pat Lynch, and Whispering Cave, a deep cave that travels far into the mountain. More intricate petroglyphs lie farther along.
H|26.5|Jones Hole|-|3|Hike along the creek, or go 2.5 miles to Ely Creek and Butt Plug Falls. Fremont pictographs and petroglyphs line the creek. Gold-medal fishing water.

L|0.0|Lodore boat ramp|1|Put-in, ranger station and campground (first come, first served). Steep canyon walls open to the Gates of Lodore.
L|4.5|Trailer Draw|0|River left.
L|8.0|Zenobia Creek|0|River left. A rare Zenobia rock is here.
L|9.5|Holstrom inscription|0|River left. Left by Buzz Holstrom and his companions Berg and Lundstrom on 9-11-37. Holstrom was the first to run the Green River in a rubber boat.
L|18.5|Yampa River confluence|0|The muddy Yampa joins the Green. In spring the river speeds up with the added water.
L|19.5|Echo Park and Steamboat Rock|0|A wall almost a mile long that resembles a steamboat. The river makes a 180-degree turn around it. Echo Park campground is not for multiday river trips, and the tap may be dry.
L|21.0|Mitten Park fault|0|A dramatic display of geology, running about a mile.
L|21.5|Harpers Corner overlook|0|From the top of the canyon you can see both rivers.
L|23.0|Echo Park dam site|0|The proposed 1955 dam site. Former Sierra Club director David Brower's efforts kept it from being built.
L|25.0|Colorado-Utah state line|0|
L|28.2|Sage Creek|0|River right. Listed in log order; mile is estimated.
L|29.6|Red Wash Canyon|0|River right. Listed in log order; mile is estimated.
L|30.5|Island Park|0|The river opens into a large valley meandering around islands, with views of the Uintah Mountains, Split Mountain and Ruple Ranch. This is Utah flat water: life jackets are not required for people over 14, except in inflatable kayaks.
L|35.5|Rainbow Park boat ramp|1|Life jackets are required from here to the take-out. Not a camp for multiday trips.
L|36.5|Split Mountain Gorge|0|The river cuts through in a short, rapid-filled run to the take-out. No camping in the gorge.
L|41.5|Warm spring|0|A natural warm spring flows into the river, a good stop to warm up in cool early-season weather.
L|44.0|Split Mountain boat ramp|1|Take-out. A working dinosaur quarry, museum and gift shop are just minutes away.
`);

const permit = {
  status: 'Required year-round · lottery May to September',
  apply: { label: 'Apply on Recreation.gov', url: 'https://www.recreation.gov/permits/250014' },
  contact: { phone: '970-374-2468', web: 'https://www.nps.gov/dino/planyourvisit/boating-and-rafting.htm' },
  sections: [
    {
      name: 'How to get one',
      items: [
        { t: 'Apply in the lottery', d: 'High-use season applications are taken on Recreation.gov from December 1 to January 31. Results are emailed by mid-February. Pick the Gates of Lodore launch and Split Mountain take-out. About 300 permits are awarded each year for the Green and Yampa combined.' },
        { t: 'One application each', d: 'Each person may submit one high-use lottery application, and multiple applications forfeit any trip won. Applicants must be at least 18.' },
        { t: 'Unclaimed dates', d: 'Low-use trips and unclaimed high-use dates open for reservation on March 6 at 8 a.m. Mountain Standard Time.' },
        { t: 'Camps are assigned', d: 'In the high-use season you camp only in sites assigned to your trip. Campsites are first come at the Gates of Lodore campground before launch.' },
        { t: 'Extra day', d: 'Standard high-season Green River trips are 4 days. You may request one extra day for $35, refunded if denied. Requests are decided 30 days before launch.' },
      ],
    },
    {
      name: 'Dates and costs',
      items: [
        { t: 'High-use season', d: 'The second Monday of May through the second Friday of September. The rest of the year is low-use. Flaming Gorge Dam regulates the flow, so the Green can usually be floated most of the year.' },
        { t: 'Application', d: '$15.' },
        { t: 'Multiday permit', d: '$185 per trip. Park entrance and campground fees are separate.' },
        { t: 'Refunds', d: 'Permit fees are nonrefundable, except an overlength fee when the extra day is denied.' },
      ],
    },
    {
      name: 'Limits and logistics',
      items: [
        { t: 'Group size', d: 'Up to 25 per site.' },
        { t: 'Take-out options', d: 'Split Mountain Campground can be reserved on Recreation.gov from mid-April to late September. Below Split Mountain, only small craft (canoes, duckies, kayaks) may take out at Placer Point.' },
        { t: 'Shuttle', d: 'River Runners Transport in Vernal, Utah has run shuttles. A 2018 report said it required a three-car minimum and may not shuttle a single private group in the low season. Confirm.' },
        { t: 'Experience', d: 'Private boaters need qualifying experience and equipment. Trips must be self-guided.' },
        { t: 'Flows', d: 'Reports range from about 600 cfs (rapids technical; Lucifer pinned a boat for three hours) to about 2,300 cfs from Flaming Gorge. Hell\'s Half Mile was run in an oar rig at 1,800 cfs.' },
      ],
    },
  ],
};

const rules = [
  {
    name: 'Camping',
    rules: [
      { t: 'Assigned sites and noon checkout', d: 'In the high-use season camp only in your assigned sites, and pack up and clear the landing by noon so the next group can use it.' },
      { t: 'Where you cannot camp', d: 'No camping on multiday trips at Echo Park, Rainbow Park or in Split Mountain Gorge.' },
      { t: 'One group per site', d: 'One group per campsite, up to 25 people. Where sites are grouped, stay inside the posted boundaries.' },
      { t: 'Quiet hours', d: '10 p.m. to 6 a.m.' },
      { t: 'Closures', d: 'The Superintendent may close campsites for bighorn lambing, bear activity or wildfire.' },
    ],
  },
  {
    name: 'Equipment',
    rules: [
      { t: 'Documents', d: 'The printed, signed permit and the permit holder\'s ID, and the NPS boater\'s guide.' },
      { t: 'Fire pan', d: 'A fire pan with a 2.5-inch lip and at least 12 inches wide, with a fire blanket.' },
      { t: 'River toilet', d: 'A river toilet system (groover or day-use kit).' },
      { t: 'Life jackets and spares', d: 'One life jacket per person, plus one spare per 10 people. Spare oars or paddles: one per raft plus one per three small craft. Helmets for small craft.' },
      { t: 'Life jackets in the gorge', d: 'Life jackets are required from Rainbow Park to the take-out.' },
      { t: 'Pets', d: 'Pets are not allowed on the river.' },
    ],
  },
];

const access = [
  { name: 'Dinosaur', road: true, hub: true, note: 'Monument headquarters and River Permit Office, in Colorado', grid: [1, 2] },
  { name: 'Vernal', road: true, hub: true, note: 'Nearest city to the take-out; shuttle services', grid: [10, 2] },
  { name: 'Lodore', road: true, mile: 0, park: true, note: 'Put-in. Ranger station and campground', grid: [1, 6] },
  { name: 'Echo Park', road: true, mile: 18.5, note: 'Emergency vehicle access only; not a trip put-in or take-out', grid: [4, 6] },
  { name: 'Rainbow Park', road: true, mile: 35.5, note: 'Ramp; not for multiday trips', grid: [8, 6] },
  { name: 'Split Mountain', road: true, mile: 44, park: true, note: 'Take-out. Reservable group campground', grid: [10, 6] },
];
const roads = [
  { a: 'Dinosaur', b: 'Lodore', h: '' },
  { a: 'Vernal', b: 'Split Mountain', h: '' },
  { a: 'Dinosaur', b: 'Vernal', h: '' },
  { a: 'Outfitter', b: 'Vernal', h: '' },
];

write('lodore', {
  name: 'Lodore Canyon of the Green River',
  reach: 'Gates of Lodore to Split Mountain',
  agency: 'Dinosaur National Monument, River Permit Office',
  miles: [0, 44.1],
  days: 4,
  coords: [40.73, -108.9],
  tz: 'America/Denver',
  note: 'About 44 miles of the Green River through Dinosaur National Monument: Lodore Canyon to the Yampa confluence at Echo Park (about mile 18.5), then Whirlpool Canyon, Island Park and Split Mountain Gorge. Miles are from the Lodore ramp as in one river log; other sources give totals from 43 to 45. The camps between Jones Hole and Island Park are listed in log order with estimated miles. Camp sizes are not rated. Compiled from public sources; verify with the park and a current guidebook.',
  camps: d.camps,
  rapids: d.rapids,
  hikes: d.hikes,
  geology: [],
  guide: [],
  almanac: {
    history: [
      ['Disaster Falls', 'In 1869 John Wesley Powell\'s expedition lost a boat, much of its food and scientific instruments at Disaster Falls. Winnie\'s Rapid is supposedly named for Powell\'s daughter.'],
      ['Buzz Holstrom', 'Buzz Holstrom was the first to run the Green River in a rubber boat, and ran the whole river solo after being turned down as a boatman on the second Powell expedition. His 1937 inscription is on river left.'],
      ['The Echo Park dam', 'A dam was proposed at Echo Park in the 1950s and was never built, thanks to the efforts of Sierra Club director David Brower.'],
    ],
  },
  rules,
  landmarks: d.landmarks,
  clusters: [
    { s: 0, e: 18.5, n: 'Lodore Canyon' },
    { s: 19.5, e: 29.5, n: 'Whirlpool Canyon' },
    { s: 36.5, e: 44, n: 'Split Mountain Gorge' },
  ],
  notes: {
    camp: '*Camps are assigned with your permit. Sizes and quality are not given. Only a few camps are named in the sources I found.',
    hike: '*Difficulty is a rough estimate (1 = short, easy walk; 3 = longer trail). Times are not given.',
  },
  hdiff: { 1: 'Short, easy walk', 2: 'Easy trail', 3: 'Longer trail' },
  access,
  yardGrid: [5, 1],
  roads,
  permit,
});
