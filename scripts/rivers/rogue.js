const { parse, write } = require('./common.js');

// Miles from the Grave Creek boat ramp (0) to the Foster Bar take-out (34.52); the Wild section ends at Watson Creek, 32.75.
// Mile log and camp capacities (people / tents / boats) from GoRafting, which uses BLM's scouted figures. Permit and rules from the BLM.
const CAMPS = [
  // [mile, name, bank, people, tents, boats, note]
  [0.45, 'First Stop Beach', 'L', 8, 5, 8],
  [0.52, 'Main Sanderson', 'R', 2, 1, 8],
  [0.56, 'Lower Sanderson', 'R', 6, 2, 3],
  [0.6, 'Sanderson Left', 'L', 2, 1, 2],
  [1.53, 'Rainie Falls Left', 'L', 2, 1, 5],
  [1.55, 'Rainie Falls Right', 'R', 12, 6, 5],
  [1.79, 'Upper Fishermans Haven', 'L', 6, 3, 5],
  [1.88, 'Whoo Beach', 'R', 6, 3, 6],
  [1.9, 'Fishbone', 'L', 8, 5, 8],
  [2.0, 'China Gulch', 'R', 10, 5, 5],
  [2.4, 'Pre-rum Creek', 'L', 4, 2, 8],
  [2.48, 'Too Tires', 'R', 2, 1, 2],
  [2.96, 'Whiskey Creek (Upper Whiskey)', 'R', 30, 15, 11, 'The Whisky Creek cabin is beside it.'],
  [3.03, 'Lower Whiskey', 'R', 20, 12, 6],
  [3.2, 'Lower Rum Creek Bar', 'L', 12, 6, 12],
  [3.22, 'BLS', 'L', 12, 6, 12],
  [3.29, 'Cave Rock (Big Slide Left)', 'L', 16, 8, 11, 'Swimming.'],
  [3.46, 'Doe Creek', 'L', 20, 20, 10],
  [3.46, 'Fawn', 'R', 6, 4, 2],
  [3.59, 'Buck', 'L', 4, 2, 4],
  [4.33, 'Tyee', 'R', 20, 10, 10, 'Room for more than 20.'],
  [4.89, 'Upper Wildcat', 'L', 20, 10, 10, 'Room for more than 20.'],
  [5.0, 'Wildcat (Lower Wildcat)', 'L', 20, 10, 10, 'Room for more than 20.'],
  [6.23, 'Slanted Slate', 'L', 6, 3, 4],
  [7.0, 'Roll Over Bar', 'R', 10, 4, 5],
  [7.32, 'Island Beach', 'L', 6, 3, 7, 'A common lunch spot.'],
  [7.47, 'Gravel Slide', 'R', 4, 2, 3],
  [7.64, 'Sand Rock', 'L', 6, 3, 3],
  [7.81, 'Gravel Garden', 'R', 6, 3, 3],
  [7.84, 'Sand Trap', 'R', 6, 3, 3],
  [8.06, 'Big Windy', 'L', 8, 4, 4, 'A rocky carry.'],
  [8.24, 'Upper Black Bar', 'R', 2, 1, 4],
  [9.1, 'Little Windy', 'L', 15, 7, 8],
  [9.97, 'Upper Jenny', 'L', 6, 3, 5],
  [10.02, 'Jenny Creek', 'L', 16, 8, 7, 'Good for kayak groups, with a view and a jump spot from the rocks.'],
  [10.36, 'Upper Horseshoe Bend', 'R', 20, 8, 8, 'Room for more than 20.'],
  [10.48, 'Horseshoe Bend', 'R', 20, 12, 8, 'Room for more than 20. Bear fence.'],
  [10.71, 'Madrone Monkey (Cowley Creek)', 'R', 6, 3, 3],
  [10.89, 'Middle Horseshoe Bend', 'R', 12, 6, 8],
  [10.97, 'Lower Horseshoe Bend', 'R', 20, 12, 12],
  [11.04, 'Telephone Bar Left', 'L', 6, 3, 10],
  [11.06, 'Bar View', 'R', 4, 2, 2],
  [11.4, "Mary's Beach (Upper Meadow)", 'R', 6, 3, 6],
  [11.58, 'Meadow Creek', 'R', 14, 7, 7],
  [12.19, 'Dulog (Upper Dulog)', 'L', 10, 5, 6],
  [12.31, 'Lower Dulog', 'L', 10, 5, 5],
  [13.28, 'Kelsey Creek', 'R', 8, 4, 4],
  [13.43, 'Upper Kelsey Left', 'L', 20, 15, 10, 'Called Lower Kelsey in the BLM guidebook.'],
  [13.47, 'Lower Kelsey Left (Terraces)', 'L', null, null, null, 'Large; recognized by boaters but not in the BLM guidebook.'],
  [13.49, 'Kelsey Canyon Overflow (Geology)', 'R', 6, 3, 3],
  [13.58, 'Green Rattlesnake', 'L', 6, 3, 3],
  [14.27, 'Battle Bar', 'L', 24, 12, 12, 'Named for an 1855-56 fight in the Rogue River Indian Wars.'],
  [15.27, 'Lower Winkle Bar', 'R', 10, 5, 5],
  [15.48, 'J and J Rock Bar', 'L', 2, 1, 5],
  [15.63, 'J and B Rock Bar', 'R', 6, 3, 4],
  [16.05, 'Turtle Rock', 'R', null, null, null, 'Medium. On the BLM GPS files but not the map.'],
  [16.43, 'Upper Missouri (Missouri Bar)', 'L', 20, 10, 10, 'Room for more than 20.'],
  [16.47, 'Middle Missouri Bar', 'L', 14, 6, 6],
  [16.54, 'Lower Missouri', 'L', 6, 4, 4],
  [16.73, 'Quail Creek', 'R', 12, 6, 6, 'A small pool in the creek downstream.'],
  [16.8, 'Corner (Quail Creek Left)', 'L', 4, 3, 4],
  [17.27, 'Long Gulch', 'L', 6, 3, 6],
  [17.43, 'Long Beach (Long Gulch Right)', 'R', 12, 5, 12, 'Cobbly.'],
  [18.14, 'Kai Beach', 'R', 6, 3, 4, 'A lunch spot.'],
  [18.89, 'Little Maggie', 'L', 4, 2, 3],
  [19.75, 'Rogue River Ranch East (Upper)', 'R', 16, 8, 8, 'Bear fence.'],
  [19.76, 'Rogue River Ranch West (Lower)', 'R', 14, 7, 7, 'Bear fence.'],
  [19.78, 'Rogue River Ranch South Bank', 'L', 2, 1, 2],
  [19.84, 'Rogue River Ranch South Bank Overflow', 'L', 4, 2, 4],
  [19.9, 'Last Chance', 'R', 2, 1, 2],
  [19.9, 'East Mule Creek', 'R', 20, 10, 10, 'Room for more than 20. Mule Creek flows through camp.'],
  [19.92, 'West Mule Creek', 'R', 10, 5, 5],
  [20.17, 'Marial Beach', 'R', 4, 4, 6],
  [23.21, 'Upper South Gleason', 'L', 4, 7, 6],
  [23.23, 'Lower South Gleason', 'L', 2, 1, 4],
  [23.26, 'North Gleason', 'R', 6, 3, 8, 'A cobble bar below Blossom Bar with a steep beach, suited to small groups.'],
  [23.45, 'Pinnacle Point', 'L', 6, 3, 3],
  [24.5, 'Upper Half Moon Bar (Champagne)', 'R', 18, 8, 15, 'Named for finishing Blossom Bar. Bear fence.'],
  [24.62, 'Middle Half Moon Bar', 'R', 12, 6, 6, 'Bear fence.'],
  [24.65, 'Lower Half Moon Bar', 'R', 14, 9, 6, 'Bear fence.'],
  [25.99, 'Sturgeon (Mimosa Beach)', 'R', 4, 2, 4],
  [26.38, 'Black Bear Bar', 'L', 12, 6, 6],
  [26.39, 'Brushy Bar', 'R', 8, 5, 5, 'Bear fence.'],
  [26.55, 'Lower Brushy Bar', 'R', 6, 4, 4],
  [27.2, 'Upper Solitude', 'R', 18, 8, 8, 'Bear fence.'],
  [27.44, 'Lower Solitude', 'R', 20, 12, 10, 'Bear fence. Upper camp sites on the bar.'],
  [27.67, "Yann's", 'R', null, null, null, 'Small and not recommended; not in the BLM guide.'],
  [27.8, 'Penguin Beach', 'R', null, null, null, 'Small; not in the BLM guide.'],
  [28.16, 'Tate Alcove', 'L', 4, 2, 3],
  [28.36, 'Upper Tate Creek', 'R', 6, 3, 4, 'Bear fence.'],
  [28.55, 'Lower Tate Creek', 'R', 12, 6, 10, 'Bear fence.'],
  [28.62, 'Upper Tacoma', 'R', 17, 8, 10, 'Bear fence.'],
  [28.66, 'Tacoma (Middle Tacoma)', 'R', 20, 10, 7, 'Bear fence.'],
  [28.7, 'Lower Tacoma', 'R', 20, 10, 8, 'Bear fence.'],
  [28.79, 'Tacoma Boulders', 'R', 6, 4, 5],
  [28.83, 'Tacoma Sandbar', 'R', 18, 9, 6],
  [28.99, 'Tacoma Rapid Right', 'R', 16, 8, 5],
  [29.02, 'Tacoma Rapid Left', 'L', 4, 2, 4],
  [29.69, 'Clay Hill', 'R', 20, 15, 10, 'Room for more than 20. The jump rock is reached from the upper camp.'],
  [30.17, 'Fall Creek Bar', 'R', 6, 3, 5],
  [30.72, 'Flora Dell', 'R', 6, 4, 3],
  [30.78, 'Bent Oak', 'R', 6, 3, 3],
  [32.48, 'Burnt Rock (Oly Rock)', 'L', 18, 8, 7],
  [32.67, 'Eagle Rock', 'R', null, null, null, 'Small.'],
];
const campLines = CAMPS.map(([mile, name, bank, p, t, b, note]) => {
  const size = p ? Math.min(9, Math.max(1, Math.round(p / 3))) : null;
  const cap = p ? `Fits about ${p} people, ${t} tents and ${b} boats.` : '';
  const sizeKey = size == null ? '?' : size <= 1 ? 'xs' : size <= 2 ? 's' : size <= 4 ? 'm' : size <= 6 ? 'l' : 'xl';
  return `C|${mile}|${name}|${bank}|${sizeKey}|${[cap, note].filter(Boolean).join(' ')}`;
}).join('\n');

const d = parse(`
R|0.04|Grave Creek Riffle|III|An island split. Follow the main current down the tongue on the left. A boulder emerges below about 2,000 cfs.
R|0.23|Grave Creek Falls|III|A ledge drop that can be run down the middle.
R|0.76|Sanderson Riffle|II|A surf wave at some flows. A plaque on the cliff marks the 1964 flood.
R|1.66|Fish Ladder|III|The standard run on the far right of Rainie Falls. There may be a queue; let boats clear the channel.
R|1.66|Middle Chute|IV|An alternative line, sometimes the only option for large rafts.
R|1.66|Rainie Falls|V|The main drop: a 10 to 12 ft bedrock ledge with powerful reversals. Scout from river left; most boats take the Fish Ladder.
R|2.1|China Gulch Riffles|II|Named for 1800s Chinese miners.
R|3.2|Big Slide Riffle|I|The site of a late-1800s landslide.
R|4.13|Tyee Rapid|III|A large house rock on the left. Work left to avoid the right wall; a gravel bar pushes the flow right.
R|4.55|Wildcat Rapid|III|An island splits the flow; the right channel is usual. Willows and a wrap rock. Wrapping is reported at low flow.
R|5.12|Russian Rapid|II|Long and splashy with several channels. Named for a legendary 1800s Russian miner.
R|5.42|Montgomery Chutes|II|A defined tongue into wave trains. The left side is cleaner at low water.
R|5.68|Howard Creek Chutes|II|Wave trains in a fast chute; take the left for the third wave train.
R|6.76|Slim Pickins Rapid|III|A large split rock. Drift boats must use the narrow right channel; left is recommended for rafts.
R|7.38|Washboard Rapids|II|A read-and-run wave train.
R|7.51|Plowshare Rapid|II|Swirly. A pocket eddy on the left wall is a raft magnet.
R|7.92|Windy Creek Chutes|II|Two chutes; oars may ship at low water.
R|8.28|Upper Black Bar Falls|III|A steep drop into a large curling wave. Scout from river right and take the right line.
R|8.4|Lower Black Bar Falls|III|A steep wave train. A rock on the left bank may cause a bump. Run the tongue right of center.
R|9.17|Little Windy Riffle|II|Kayakers' "Eddy Alley", with small playful features below Black Bar Lodge.
R|10.33|Horseshoe Bend|III|A tight right-left turn. Pass left of the bedrock island, then go right.
R|11.31|Telephone Hole|II|Named for an old Forest Service telephone line. A ducky-flipping hole on the left.
R|12.08|Dulog Riffle|II|Enter left and exit between the mid-river boulders. Scraping risk at low water.
R|12.27|Quiz Show|III|A boulder garden. Move slowly.
R|12.77|Kelsey Creek Falls|II|A left-side wave train.
R|12.9|Lower Kelsey|II|Run center and pass right of any log at the entrance.
R|14.37|Battle Bar Riffle|II|Stay right; a pillow rock midway.
R|17.67|Boulder Alley|II|A boulder series; hidden rocks at lower water.
R|17.81|Big Boulder Rapids|II|A fast chute right of Elephant Rock.
R|18.09|Island Rapid|I|
R|18.32|John's Rapid|II|Named for Chief John (Tecumtum). Enter in the middle and pass right of the boulder.
R|19.5|China Bar Rapid|II|Enter left. A "can opener" rock sits right of center; holes at low water.
R|20.68|Narrows Rapid|II|
R|20.97|Jaws|II|Two tooth-like boulders on the left. Pass left of both and avoid the left hole.
R|21.09|Wall One|II|Avoid the wall.
R|21.23|Telfer's Hole|III|A ducky-flipping hole.
R|21.3|The Narrows|II|The canyon tightens.
R|21.32|Coffee Pot|III+|The signature rapid of Mule Creek Canyon: bedrock constrictions create boils and surging eddy lines. Rated III by one guide and IV by American Whitewater.
R|22.78|Blossom Bar|IV-|The hardest rapid of the trip. Boulders force the flow left into the "Picket Fence": enter left, then cut right above it. Scouting is advised for every boater. Boats wrapping and blocking the channel are common.
R|23.1|Devils Staircase Rapid|III|A wave train just below Blossom Bar. Avoid the bottom-right wall and the helicopter eddy.
R|25.29|Quarter Inch Rapid|II|Jet boats have about a quarter inch of clearance at low water. Read and run for rafts.
R|27.37|Solitude Rapid|II|A "decision rock": pass left, since the right passage is now small.
R|28.95|Tacoma Rapids|II|Enter right of center and exit left. Rocks on the right at low water.
R|29.34|Clay Hill Rapid|III-|The last significant rapid before Foster Bar. Stay right of the island and ride the inside of the turn. Rated II by one guide and III by American Whitewater.
R|31.24|Payton Riffle|II|Exit right to avoid the left-side ledges.
R|32.13|Burnt Rapids|II|The final Class II before the take-out.
R|32.89|Watson Riffle|I|Most of the flow goes right around the island.
R|34.16|Foster Rapid|I|The final riffle.

${campLines}

H|2.99|Whisky Creek cabin|R|1|An 1880 mining cabin on the National Register, the oldest standing mining cabin in the valley.
H|5.96|Howard Creek|L|1|A popular swimming hole with room for 2 to 3 rafts.
H|8.08|Big Windy Creek|L|1|A creek and swimming hole.
H|13.25|Kelsey Creek|R|3|A worthwhile hike up the creek.
H|13.69|Sports Illustrated Rock|L|1|A large, popular jump rock.
H|15.18|Zane Grey's cabin|R|1|Built in 1926 by the novelist; a protected historic site on Winkle Bar.
H|19.75|Rogue River Ranch|R|1|A National Register site with a visitor center, swimming hole and toilets. Volunteer caretakers are there from May to October.
H|21.59|Inspiration Point|R|2|A view of Stair Creek Falls, a popular stop on the Rogue River Trail.
H|30.54|Fall Creek|L|2|A short hike to a waterfall.

L|0.0|Grave Creek boat ramp|1|Start of the Wild section, where permits are required. A small ramp with outhouses. Day use only; overnight parking is not permitted.
L|1.05|Sanderson bridge abutments|0|Remnants of an early-1900s bridge lost in the 1927 flood.
L|8.69|Black Bar Lodge|1|The first lodge on the trip.
L|14.27|Battle Bar|0|Named for an 1855-56 fight in the Rogue River Indian Wars.
L|20.17|BLM-USFS boundary|0|The BLM section ends and the Forest Service manages to the take-out.
L|20.37|Marial Lodge|1|Reservations May to November.
L|21.03|Mule Creek Canyon|0|A half-mile narrow gorge with fast current. Avoid the walls.
L|21.58|Stair Creek|0|A waterfall cascading into the river from the left.
L|23.0|Start of jet boat section|0|Jet boat traffic begins.
L|23.54|Paradise Creek waterfall|0|A small waterfall at the creek mouth.
L|23.95|Paradise Lodge|1|A lodge with a river-view deck.
L|24.5|Half Moon Bar Lodge|1|Across the river from Paradise Lodge.
L|29.2|Clay Hill Lodge|1|The final lodge before the take-out.
L|30.73|Flora Dell Creek|0|Used in the film The River Wild.
L|31.8|Checker Board Rocks|0|A checkerboard pattern at low water, near Wild River Ranch.
L|32.75|Watson Creek|0|Marks the end of the Wild section; the take-out is just downstream.
L|34.52|Foster Bar|1|Take-out, a large gravel bar below Foster Creek. A SCAT machine for toilets ($2). Do not leave vehicles on the ramp.
`);

const permit = {
  status: 'Required year-round · lottery May 15 to Oct 15',
  apply: { label: 'Apply on Recreation.gov', url: 'https://www.recreation.gov/permits/251982' },
  contact: { phone: '541-479-3735', web: 'https://www.blm.gov/programs/national-conservation-lands/oregon-washington/rogue-wsr/permits' },
  sections: [
    {
      name: 'How to get one',
      items: [
        { t: 'Enter the lottery', d: 'For the control season (May 15 to October 15), apply on Recreation.gov from December 1 to January 31. Applications are online only. Results are emailed in mid-February with confirmation instructions.' },
        { t: 'April give-away', d: 'Leftover dates are offered in a competitive phone call-in during the first five business days of April, 8 a.m. to 3 p.m., on 541-479-3735.' },
        { t: 'Open season', d: 'From May 5 to October 15, new permits are allocated by competitive call-in, 8 a.m. to 3 p.m., phone only. BLM posts open dates and space counts. Day-of-launch spaces go first come, first served or from a waiting list at the Smullin Visitor Center at Rand.' },
        { t: 'Pick-up', d: 'Control-season permits are picked up at the Smullin Visitor Center at Rand on launch day. Outside the control season you self-issue a permit at the Smullin Visitor Center or the Grave Creek drop box.' },
        { t: 'Every party leader', d: 'Party leaders must watch the Wild Rogue permit guidelines video once a year.' },
      ],
    },
    {
      name: 'Costs and limits',
      items: [
        { t: 'Fees', d: '$6 non-refundable lottery application fee. $10 per person, paid when a reservation becomes a permit.' },
        { t: 'Daily limit', d: 'The river is regulated by the number of people launching each day, 120 in the control season, not by the number of groups.' },
        { t: 'Skills', d: 'Boat operators need Class IV skills. The Wild section has about three Class IV and nine Class III rapids.' },
      ],
    },
    {
      name: 'Cancelling and penalties',
      items: [
        { t: 'Cancel a permit', d: 'Cancel the entire permit by 3 p.m. the day before launch. Email the Rogue River Permits office (preferred), or from May 5 to October 15 call 541-479-3735. Give the party leader, launch date and party size.' },
        { t: 'Cancelling spaces', d: 'You can cancel individual spaces on a permit at any time without penalty. Non-confirmation or non-payment of a reservation also carries no penalty.' },
        { t: 'No-show penalty', d: 'Failing to cancel an entire permit by the deadline puts the party leader on the no-show list: no permit for the rest of the year and all of the next year, including the lottery.' },
      ],
    },
  ],
};

const rules = [
  {
    name: 'Required equipment',
    rules: [
      { t: 'Toilet system', d: 'A dedicated, reusable, washable, watertight system with a screw-on or latching gasket lid. Snap-on lids and RV toilets are not acceptable. Pouch systems (Biffy Bag, CleanWaste, ReStop2) are allowed with a watertight container for used pouches. Capacity is 1 pint per person per day.' },
      { t: 'Set it up', d: 'Have the toilet out of the boat and accessible within 30 minutes of arriving at camp, away from the central camp area unless a pit toilet is on site. Urine may go in the river.' },
      { t: 'Empty it properly', d: 'Untreated solid waste may be emptied only at the SCAT machine at Foster Bar or an RV dump station. The SCAT machine cannot take wipes, paper towels or trash.' },
      { t: 'Fire pan, shovel and bucket', d: 'A fire pan is required year-round for all campfires within 400 feet of the river. A shovel and a bucket of at least one gallon are required per party. Fireworks are prohibited.' },
      { t: 'Life jackets', d: 'A U.S. Coast Guard approved life jacket for each person, worn in Class III or greater rapids, and worn at all times by children 12 and younger on or near the water. Helmets are recommended in Class III and up.' },
    ],
  },
  {
    name: 'Camping',
    rules: [
      { t: 'First come, first served', d: 'Camping on the Wild section is first come, first served. Quiet hours are 10 p.m. to 6 a.m. Be prepared to share: large sites for 10 to 20 people are limited, so use one side if you are a small group.' },
      { t: 'Fires', d: 'Scavenged wood must be dead and down; cutting wood is prohibited. Fire restrictions change, so check with the Smullin Visitor Center. Gas and propane stoves are allowed.' },
      { t: 'Pit toilets', d: 'Some pit toilets are being phased out. Prefer sites without one.' },
    ],
  },
  {
    name: 'Bears and food',
    rules: [
      { t: 'Store food away', d: 'Remove all coolers, food, trash and waste from boats at night. Leaving attractants in boats teaches wildlife to claw and chew them.' },
      { t: 'Bear fences', d: 'From May 15 to October 15 the BLM maintains electric bear fences, food hoists and storage containers at some camps, including Whisky Creek, Horseshoe Bend, Rogue River Ranch, Half Moon Bar, Brushy Bar, Solitude, Tate Creek and Tacoma. Keep the fence turned on and closed at all times.' },
      { t: 'No habituating', d: 'It is unlawful to habituate bears and other wildlife. Report sightings on the Bear Observation Form from permit check-in.' },
    ],
  },
  {
    name: 'Safety and etiquette',
    rules: [
      { t: 'Scout', d: 'Scouting Blossom Bar is advised for all boaters. Passengers may walk around Rainie Falls, the Fish Ladder and Blossom Bar.' },
      { t: 'Water level', d: 'Extreme low flows can be as risky as high flows. Watch for trees, debris, landslides and wildfire on the shoreline.' },
      { t: 'Pass in flatwater', d: 'Pass other groups in flatwater, not in rapids. Give fishing parties a wide berth.' },
      { t: 'Dogs', d: 'Bring a leash for use on shore. Pet waste is handled like human waste and carried out in a watertight container.' },
      { t: 'Shuttles', d: 'The Bear Camp road is the fastest route but is closed November 5 to May 31 for snow and slides. Check road conditions first.' },
    ],
  },
];

const access = [
  { name: 'Grants Pass', road: true, hub: true, note: 'Nearest city; shuttle base. The Smullin Visitor Center is at Rand', grid: [2, 2] },
  { name: 'Agness', road: true, hub: true, note: 'Nearest community to the take-out', grid: [9, 2] },
  { name: 'Grave Creek', road: true, mile: 0, park: true, note: 'Put-in. Day use only; no overnight parking', grid: [1, 6] },
  { name: 'Foster Bar', road: true, mile: 34.52, park: true, note: 'Take-out. SCAT machine for toilets', grid: [10, 6] },
];
const roads = [
  { a: 'Grants Pass', b: 'Grave Creek', h: '' },
  { a: 'Grants Pass', b: 'Foster Bar', h: '' },
  { a: 'Agness', b: 'Foster Bar', h: '' },
  { a: 'Outfitter', b: 'Grants Pass', h: '' },
];

write('rogue', {
  name: 'Rogue River',
  reach: 'Grave Creek to Foster Bar',
  agency: 'BLM Medford District / Rogue River-Siskiyou National Forest',
  miles: [0, 34.6],
  days: 4,
  coords: [42.63, -123.8],
  tz: 'America/Los_Angeles',
  note: 'The 34-mile Wild section: Rainie Falls, Mule Creek Canyon and Blossom Bar, with wilderness lodges along the way. Miles are from the Grave Creek ramp as in one mile-by-mile guide; the BLM counts the take-out a little farther. Camp capacities come from the BLM\'s scouted figures (people, tents, boats). Quality is not rated. Fire closures can shut the river, so check conditions. Compiled from public sources; verify with the BLM and a current guidebook.',
  camps: d.camps,
  rapids: d.rapids,
  hikes: d.hikes,
  geology: [],
  guide: [],
  almanac: {
    history: [
      ['Zane Grey', 'The western novelist Zane Grey owned the bar at Winkle Bar in the 1920s and built a cabin there in 1926.'],
      ['The Rogue River Indian Wars', 'Battle Bar is named for a fight in 1855-56 during the Rogue River Indian Wars.'],
      ['A dam that was blocked', 'Wild and Scenic designation in 1968 protected the Rogue from dams.'],
    ],
  },
  rules,
  landmarks: d.landmarks,
  clusters: [{ s: 21.0, e: 21.6, n: 'Mule Creek Canyon' }],
  notes: {
    camp: '*Camps are first come, first served. Capacities are BLM scouted figures. Camps with bear fences are noted. Quality is not rated.',
    hike: '*Difficulty is a rough estimate (1 = short, easy walk; 3 = longer hike). Times are not given.',
  },
  hdiff: { 1: 'Short, easy walk', 2: 'Easy trail', 3: 'Longer hike' },
  access,
  yardGrid: [5, 1],
  roads,
  permit,
});
