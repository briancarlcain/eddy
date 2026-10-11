const { parse, write } = require('./common.js');

// Miles from Sand Wash (0) to Swasey's boat ramp (84.0), as in GoRafting's mile-by-mile guide.
// Permit rules from the BLM Price Field Office stipulations and Recreation.gov. River left from Sand Wash to Coal Creek is Ute Tribal land.
const d = parse(`
R|9.1|Tabyago Riffle|I|Read and run.
R|15.6|Rock House Rapid|II|Read and run.
R|16.6|Little Rock House Riffle|II|Run the right side.
R|25.7|Jack Creek Rapid|-|Read and run, with rocks on the left at low water. Life jackets are mandatory from here to the take-out.
R|28.6|Big Canyon Rapid|II|
R|29.6|Firewater Rapid|II|
R|30.4|Cedar Ridge Rapid|II|
R|32.7|Flat Canyon Rapid|II|
R|33.7|Dripping Springs Rapid|II|Very shallow on the left at low water.
R|36.2|Fretwater Falls Rapid|II|
R|37.2|Upper Wild Horse Rapid|II|
R|37.9|Lower Wild Horse Rapid|II|
R|39.0|Upper Steer Ridge Rapid|III|Scout from the left and run left of center. A sharp rock from 2022 rockfall sits in the left channel and wraps and tears boats; it is hard to see at medium flows.
R|39.2|Lower Steer Ridge Rapid|II|
R|39.7|Surprise Rapid|II|A flat rock center-left can be a pour-over at high water; easily avoided on the right.
R|41.0|Log Cabin Rapid|II|
R|41.7|Rock Creek Rapid|II|
R|43.3|Calf Canyon Rapid|II|
R|44.4|Upper Snap Canyon Rapid|II|Large holes on the left at high water.
R|44.7|Lower Snap Canyon Rapid|II|
R|45.7|Three Canyons Rapid|II|
R|47.1|Belknap Falls|II|
R|48.7|Chandler Falls Rapid|II|Run right of center.
R|50.0|Trail Canyon Rapid|II|
R|51.5|Bull Canyon Rapid|II|
R|52.8|Moonwater Rapid|II|Pass either side of the island at high water; use the left channel at medium to low.
R|53.2|Red Point Rapid|II|A large hole on the left at high water. The common line threads boulders mid-rapid; watch the right.
R|54.2|Joe Hutch Creek Rapid|-|Read and run. A large hole above it at high water (over 30,000 cfs); run center or right of center.
R|55.2|Joe Hutch Canyon Rapid (Cow Swim)|III|Scouting recommended. Run left of the main features, then move right near the bottom.
R|57.0|Florence Creek Rapid|II|
R|58.8|Wire Fence Rapid|III|Right or left at high water; left at medium to low.
R|59.2|Three Fords Rapid|III|Take the right channel for a fun wave train. Optional right-bank scout. A possible undercut wall on the right.
R|64.2|Range Creek Rapid|II|At low to medium flow take the left channel above and run left.
R|66.9|Rabbit Valley Rapid|II|
R|67.7|Curry Rapid|II|
R|69.0|Saleratus Rapid|II|
R|69.8|Coal Creek Rapid|III|Run right of center: left of the "thunderous" feature at the top and right of the large rock below.
R|70.5|Poverty Rapid|II|
R|73.7|Rattlesnake Rapid|II|Pull left to avoid rocks on the right.
R|75.7|Nefertiti Rapid|II|
R|79.8|Butler Rapid|II|
R|80.3|Sand Knolls Rapid|II|
R|81.4|Stone Cabin Rapid|II|Watch the boulders at the top.
R|82.7|Short Canyon Rapid|II|
R|83.6|Swasey's Rapid|II|

C|13.7|Gold Hole 1|R|m|Medium. Best at medium to high water.
C|13.9|Gold Hole 2|R|m|Medium, with more shade than Gold Hole 1. Best at low to medium water. Dense vegetation.
C|14.6|Lower Gold Hole|R|l|Large. Best at medium to high water.
C|15.6|Rock House|R|l|Large. Hike up the wash to reach the sites; avoid dry washes because of flash floods.
C|17.6|Opposite Stampede Flat|R|xs|Very small after rockfall; fits a couple of people.
C|18.7|Low-water sandbar|R|?|Occasionally available at low water.
C|18.9|Fossil 1|R|l|Large. Best at medium to high water; hard to identify at high water.
C|18.95|Fossil (Turtle) 2|R|l|Large. Same water notes as Fossil 1.
C|25.8|Jack Creek|R|?|If it is taken, use a site farther downstream. Pull over quickly after entering the rapid.
C|25.85|Lower Jack Creek|R|?|Morning shade.
C|26.8|Mushroom|R|s|Small after a fallen cottonwood. Good for lunch and access to the petroglyphs.
C|29.9|Upper Cedar Ridge|R|l|Large and very nice. A deep eddy good for swimming and kayak rolls. A cut bank to the beach at low water.
C|30.1|Cedar Ridge 1|R|xl|Very large.
C|30.2|Cedar Ridge 2|R|m|Medium.
C|30.3|Cedar Ridge 3|R|m|Medium.
C|32.8|Flat Canyon|R|l|Large and very rocky at low water. Spring runoff can block the petroglyph hike. Arch hike up the canyon.
C|33.9|Dripping Springs|R|l|Large.
C|36.3|Fretwater|R|l|Large.
C|39.2|Steer Ridge|R|l|Large.
C|39.8|Surprise|R|s|Small, best at lower water.
C|43.6|Calf Canyon|R|m|Medium.
C|44.5|Snap Canyon|R|m|Medium.
C|45.9|Three Canyon|R|l|Large, with a big beach at low water. A popular layover spot.
C|46.0|Three Canyon 2|R|m|Medium. Best at medium to high water.
C|46.2|Lower Three Canyon|R|l|Large.
C|47.8|Lion Hollow|R|l|Large and sandy.
C|48.6|Chandler|R|sm|Small to medium.
C|49.7|Trail Canyon 1|R|l|Large.
C|49.8|Trail Canyon 2|R|l|Large.
C|51.1|Above Bull Canyon|R|l|Large, sandy and shaded.
C|52.2|Moonwater|R|l|Large.
C|52.9|Red Point|R|m|Medium.
C|53.4|Below Red Point|R|l|Large, with a sandy beach at medium to low water.
C|55.3|Joe Hutch|R|l|Large. A tight pull-in that is hard at high water and rocky at low.
C|56.3|McPherson|R|l|Large. Take the right channel around the island; sandy beach at low water.
C|58.5|Above Wire Fence|R|l|Large and shady.
C|58.7|Wire Fence 2|R|m|Medium and shady.
C|59.0|Wire Fence 3|R|l|The largest Wire Fence camp with the least shade. Difficult pull-in at high water.
C|60.2|Emergency camp|R|?|An option at lower water. No shade, and no viable camps until Range Creek.
C|64.5|Lower Range Creek|R|?|Sunny, with a late sunset. The upper Range Creek camp is no longer viable after a large fire.
C|67.0|Upper Rabbit Valley|R|s|Small. Only viable at medium to high water.
C|67.2|Rabbit Valley|R|l|Large and sandy.
C|70.8|Poverty|L|l|Large. Late sun and no shade.
C|73.6|School Section|R|l|Large. Many bugs from the willows.
C|73.7|Rattlesnake|L|l|Large, popular for swimming and very sunny. Hike up Rattlesnake Canyon.
C|75.7|Nefertiti|L|l|Large. A pit toilet, picnic tables and road access, so expect other users.
C|79.9|Upper Butler|R|m|Medium.
C|80.1|Lower Butler|R|m|Medium.
C|80.3|Sand Knolls|R|l|A big sandy beach with lots of shade, good at all levels.
C|82.9|Short Canyon|R|?|About a mile above the take-out. Sandy beach at lower flows.
C|83.8|Swasey's Beach|L|?|A BLM campground with 12 sites, fire rings, tables and an outhouse, $15 per night.

H|15.6|Rock House Canyon petroglyphs|R|2|Hike up the wash from camp. Do not touch the rock art.
H|26.8|Mushroom Rock petroglyphs|R|1|Fremont rock art about a quarter mile from camp. Do not touch.
H|32.4|Flat Canyon petroglyphs|R|1|A short walk to Fremont figures (arrived around 600 AD) and fainter Desert Archaic designs. A sacred site: stay on the trail.
H|32.8|Flat Canyon arch|R|2|An arch hike up the canyon.
H|41.6|Rock Creek petroglyphs|R|3|About 4 miles round trip. Stay on the upstream-side trail and do not cross the creek. A Fremont panel is at the mouth.
H|46.0|Three Canyons overlook|R|3|An overlook and loop hike from the trailhead.
H|64.5|Range Creek|R|3|A major Fremont site area with over 500 identified sites. Hiking is restricted and allowed only through the north gate, May through November.
H|69.8|Coal Creek overlook|L|3|A hike from camp. Ute land ends above Coal Creek.
H|73.6|Rattlesnake Canyon|L|2|A hike up the canyon from camp.
H|73.8|School Section overlook|R|2|A hike from camp.
H|77.5|Desert Archaic petroglyphs|R|1|A panel at the petroglyph parking. Watch for poison ivy and do not touch.

L|0.0|Sand Wash|1|Put-in. A primitive ramp and campground with first-come sites, plus "bug huts" that can be reserved and are recommended in spring and early summer. No running water; pack out trash.
L|38.5|Undercut wall|0|An undercut rock wall that is hazardous to smaller craft.
L|38.9|Steer Ridge scout parking|0|River-left parking for scouting the rapid, approved by the Ute Tribe.
L|42.4|Rock Creek Ranch|0|A historic ranch. Do not camp on the property or within half a mile of the mouth of Rock Creek.
L|56.3|Ouray Lodge and McPherson Ranch|0|River left, no access: Ute land.
L|57.7|Jack's Rock|0|A large mid-channel rock.
L|59.3|End of Desolation Canyon|0|Gray Canyon begins. The K-T boundary shows in the rock here.
L|67.7|Curry Canyon|0|Named for Flat Nose George Curry, a Wild Bunch member.
L|70.1|Historic cabin|0|Used by dam surveyors in 1911. River-left access is permitted from here to the take-out.
L|77.7|Price River confluence|0|
L|83.8|Swasey's Beach|1|A BLM campground, formerly free camping.
L|84.0|Swasey's boat ramp|1|The take-out.
`);

const permit = {
  status: 'Required year-round · lottery May 1 to Sept 30',
  asOf: 'October 2026',
  apply: { label: 'Apply on Recreation.gov', url: 'https://www.recreation.gov/permits/233393' },
  contact: { phone: '435-636-3600', email: 'utprmail@blm.gov', web: 'https://www.blm.gov/programs/recreation/passes-and-permits/lotteries/utah/desolationgray' },
  sections: [
    {
      name: 'How to get one',
      items: [
        { t: 'Where it applies', d: 'A permit is required year-round for travel on the Green River between Sand Wash and Nefertiti Rapid. Boating season is usually March through November; the river freezes from December through February.' },
        { t: 'Peak season lottery: May 1 to September 30', d: 'Apply on Recreation.gov from December 1 to January 31, one entry per person. Notifications are emailed on February 15. You must accept awarded dates by March 14, or they are cancelled on March 15.' },
        { t: 'Leftover dates', d: 'Unawarded and cancelled dates become reservable on Recreation.gov on March 15 at 8 a.m. Mountain. Later cancellations reappear at random times.' },
        { t: 'Outside the peak season', d: 'Launches before May 1 and after September 30 are not in the lottery. They can be reserved starting December 1.' },
        { t: 'Alternates', d: 'An alternate trip leader can be added only at the time of reservation.' },
        { t: 'Finish and print', d: 'Payment for everyone must be completed and the permit printed in the two weeks before launch, or the reservation is cancelled. No changes can be made once it is printed.' },
        { t: 'Odds', d: 'One report from 2023 put the success rate at about 6 percent.' },
      ],
    },
    {
      name: 'Costs and limits',
      items: [
        { t: 'Fees', d: '$6, one time and non-refundable, plus $40 per person. The first person is paid at booking.' },
        { t: 'Launches', d: 'Reported at six groups per day in the peak season.' },
        { t: 'Group size', d: '25 people or fewer, and no more than the number prepaid. Groups launching separately may not camp together if that puts more than 25 people at one campsite.' },
        { t: 'Trip length', d: 'At least 3 and at most 9 calendar days.' },
        { t: 'Pets', d: 'Pets are prohibited year-round on Desolation and Gray Canyons.' },
        { t: 'Refunds', d: 'Cancel more than 30 days before launch for a refund of everything but the $6. There is no refund within 30 days, or for reducing the group. Permits cannot be transferred or sold.' },
      ],
    },
    {
      name: 'Ute Tribal land',
      items: [
        { t: 'River left to Coal Creek', d: 'The east bank from Sand Wash to Coal Creek is Ute Tribal land. All activity there has been prohibited since September 2018: no landing, no visiting sites, no camping, no hiking. Plan every camp on river right, which is BLM land.' },
        { t: 'Questions', d: 'Ute Tribe Fish and Wildlife: 435-722-5511.' },
        { t: 'River left below Coal Creek', d: 'River-left access is permitted from below Coal Creek to the take-out.' },
      ],
    },
  ],
};

const rules = [
  {
    name: 'Required at launch',
    rules: [
      { t: 'Permit and ID', d: 'A physical copy of the permit and photo ID for the permit check. Rangers also check equipment and give a safety and etiquette orientation. Boat tags stay attached to the boats for the whole trip.' },
      { t: 'Life jackets', d: 'A properly sized Type I, III or V PFD approved for paddling or whitewater for each person. Children 12 and under wear theirs at all times, and everyone wears one from Jack Creek Rapid to the take-out.' },
      { t: 'First aid and repair', d: 'A first-aid kit adequate for the group and for serious injuries, repair kits for the types of boats, and air pumps to reinflate after repairs.' },
      { t: 'Toilet', d: 'A washable, leak-proof, reusable system sized for the group and trip length. Leaving solid human waste, or dumping it in vault toilets or trash at BLM facilities, is prohibited.' },
      { t: 'Fire pan', d: 'A durable metal fire pan at least 12 inches wide with a lip of at least 1.5 inches, carried on all trips even if you cook on stoves. A fire blanket under it is recommended.' },
      { t: 'Each raft or dory', d: 'An extra oar, paddle or motor, and a bail bucket or bilge pump unless self-bailing.' },
      { t: 'Spare paddles for small craft', d: 'One spare paddle for 1 to 3 kayaks, canoes or inflatable kayaks, two for 4 to 6, three for 7 to 9, and so on.' },
      { t: 'Boats 16 feet or longer', d: 'A Type IV throwable or a rescue rope with at least 40 feet of line, and a whistle or horn.' },
    ],
  },
  {
    name: 'On the river',
    rules: [
      { t: 'Stay together', d: 'Launch, travel within visual contact, and camp together. Boats may not be sent ahead to secure campsites.' },
      { t: 'Leave no trace', d: 'Carry out charcoal, ash, garbage and human waste. Dishwater strainers are recommended. Keep side-canyon streams and springs free of soap.' },
      { t: 'Fires', d: 'Fires only in fire pans, and only with driftwood found along the banks and beaches.' },
      { t: 'Rock Creek', d: 'Do not camp or build fires on public land within half a mile of the mouth of Rock Creek.' },
      { t: 'Cultural sites', d: 'Do not remove, damage or destroy archaeological or historical resources. Do not touch rock art.' },
      { t: 'Not for profit', d: 'The trip must not be commercial: participants share actual costs equally and no one profits.' },
      { t: 'Motors', d: 'No upstream motorized travel except in emergencies, and slow, wakeless speed downstream.' },
    ],
  },
];

const access = [
  { name: 'Price', road: true, hub: true, note: 'BLM Price Field Office, permits and shuttle information', grid: [2, 2] },
  { name: 'Green River', road: true, hub: true, note: 'Nearest town to the take-out', grid: [10, 2] },
  { name: 'Sand Wash', road: true, mile: 0, park: true, note: 'Put-in. Primitive ramp, 8-site campground, ranger station, toilets', grid: [1, 6] },
  { name: 'Nefertiti', road: true, mile: 75.7, note: 'Road access to the lower canyon; permit boundary', grid: [8, 6] },
  { name: "Swasey's", road: true, mile: 84.0, park: true, note: 'Take-out. BLM campground with 12 sites', grid: [10, 6] },
];
const roads = [
  { a: 'Price', b: 'Sand Wash', h: '' },
  { a: 'Green River', b: "Swasey's", h: '' },
  { a: 'Price', b: 'Green River', h: '' },
  { a: 'Outfitter', b: 'Price', h: '' },
];

write('desolation-gray', {
  name: 'Desolation and Gray Canyons',
  reach: "Sand Wash to Swasey's",
  agency: 'Bureau of Land Management, Price Field Office',
  miles: [0, 84.1],
  days: 6,
  coords: [39.3, -110.05],
  tz: 'America/Denver',
  note: "About 84 miles of the Green River through the remote Book Cliffs: Desolation Canyon to mile 59.3, then Gray Canyon to Swasey's. Mostly Class II with a few Class III rapids. Miles are from Sand Wash as in one mile-by-mile guide and may differ a mile or two from others. River left from Sand Wash to Coal Creek is Ute Tribal land and closed to all activity. Camp sizes are from that guide. Quality is not rated. Compiled from public sources; verify with the BLM and a current guidebook.",
  camps: d.camps,
  rapids: d.rapids,
  hikes: d.hikes,
  geology: [],
  guide: [],
  almanac: {
    history: [
      ['The Fremont', 'Rock art along the canyon was made by the Fremont people, who arrived around 600 AD, and earlier Desert Archaic people. The Range Creek side canyon has over 500 identified Fremont sites.'],
      ['Flat Nose George Curry', 'Curry Canyon is named for Flat Nose George Curry, a member of the Wild Bunch.'],
      ['Dam surveyors', 'A cabin in Gray Canyon was used by dam surveyors in 1911.'],
    ],
  },
  rules,
  landmarks: d.landmarks,
  clusters: [
    { s: 0, e: 59.3, n: 'Desolation Canyon' },
    { s: 59.3, e: 84, n: 'Gray Canyon' },
  ],
  notes: {
    camp: '*Camps are on river right (BLM land) until below Coal Creek. Sizes come from one guide and change with water level. Quality is not rated.',
    hike: '*Difficulty is a rough estimate (1 = short, easy walk; 3 = longer trail with climbing). Times are not given.',
  },
  hdiff: { 1: 'Short, easy walk', 2: 'Easy trail', 3: 'Longer trail with some climbing' },
  access,
  yardGrid: [5, 1],
  roads,
  permit,
});
