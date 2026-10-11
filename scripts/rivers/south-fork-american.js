const { parse, write } = require('./common.js');

// Miles from the Chili Bar put-in (0) to the Salmon Falls Bridge take-out (20.5), from the California Boating Trail guide.
const d = parse(`
R|0.6|Meatgrinder|III+|The opening rapid below Chili Bar.
R|1.3|Racehorse Bend|II+|
R|1.5|Maya|II+|Class II-III.
R|1.8|Rock Garden|II|
R|2.0|African Queen|II|
R|3.1|Triple Threat|III|Miner's Creek, on the right, is a recommended lunch stop with restrooms.
R|5.2|Troublemaker|III+|The last major rapid of the Chili Bar run. Commercial photographers often stand along it.
R|7.1|Old Scary|II|
R|9.0|Barking Dog|II|At Camp Lotus.
R|10.6|Current Divider|II+|
R|11.2|Highway Rapid|II|
R|12.0|Cable Crossing|II|
R|15.8|Fowler's Rock|III-|The beginning of the Gorge. Bends left over a gravel bar, then right toward bedrock; the current runs left past the rock and slaloms through boulders.
R|16.2|Upper Haystack Canyon|II+|A narrow, scenic gorge with fun waves over a long distance.
R|16.9|Satan's Cesspool|III+|The most challenging section of the run. A long rapid bending left around a low rocky island; a sneak runs right and the standard route left. A cliff forces the current back right into a final chute with ledges at top right and left. Clean and deep below with a large catch pool.
R|17.0|Son of Satan's|II+|A short pool after Satan's. The current heads toward the right wall, but moving left is easy. Runs together with Satan's at high flows.
R|17.5|Scissors|III|The river bends left above the drop, then narrows through the length of the rapid.
R|17.6|Lower Haystack Canyon|II+|A long canyon with mostly continuous waves.
R|18.2|Bouncing Rock|II+|On far river right, a steep drop over the rock and into a hole. Easy to avoid.
R|18.4|Pre-Op|III|The river bends right and runs mostly north toward Hospital Bar.
R|18.6|Hospital Bar|III|Past boulders and down a chute with the largest wave on the river.
R|18.7|Recovery Room|II+|
R|19.4|Surprise|II+|Appears when the lake level is low. Class II rapids continue to mile 20.
R|20.0|Salmon Falls|II+|Read-and-run wave trains, chutes and boofs. Exposed when Folsom Lake is low.

C|3.0|Miner's Creek lunch area|R|?|A BLM lunch and primitive camp area with restrooms.
C|5.2|American River Resort|-|?|Fee river access and campground.
C|5.5|Coloma Resort|-|?|Fee river access and campground.
C|9.0|Camp Lotus|-|?|Fee river access and campground.
C|12.2|BLM lunch and camp area|R|?|A recommended lunch or primitive camp site with restrooms.
C|12.8|Hastings Creek camps|R|?|Several lunch and camp sites with no facilities on BLM land, from Hastings Creek to mile 13.4.
C|15.3|BLM camp area|R|?|A lunch and camp site with restrooms.

H|5.7|Sutter's Mill site|-|1|Where James Marshall discovered gold in 1848, in Marshall Gold Discovery State Historic Park. Historic buildings, a museum and interpretive programs.
H|9.7|Dave Moore Nature Area|R|1|BLM public land on river right to mile 9.9.
H|13.9|Gorilla Rock (Convict Rock)|L|1|A landmark on the left.
H|15.0|Indian grinding holes|R|1|Grinding holes atop a large boulder on river right. Lollipop Tree, marking the beginning of the Gorge, is visible here.

L|0.0|Chili Bar|1|Put-in with river access (fee).
L|4.4|Indian Creek|0|Enters on the left. The beginning of the Quiet Zone.
L|5.6|Coloma Bridge|0|Built in 1917.
L|5.7|Sutter's Mill site|0|Where gold was discovered in 1848.
L|6.0|Marshall Gold Discovery State Historic Park|1|North Beach river access (fee) with picnic and restroom facilities. Take-outs are prohibited.
L|7.4|Highway 49 Bridge access|1|River access. Parking under the bridge is prohibited.
L|8.0|Henningsen-Lotus County Park|1|River access with parking, restrooms and a boat launch (fee).
L|9.0|Camp Lotus|1|River access and campground (fee).
L|11.5|Greenwood Creek|1|Enters on river right. The end of the Quiet Zone. Free BLM put-in for the Gorge run.
L|13.9|Gorilla Rock|0|Also called Convict Rock, on river left.
L|15.0|Lollipop Tree|0|Marks the beginning of the Gorge.
L|18.1|Weber Creek|0|Enters on river left.
L|18.8|Folsom Lake maximum elevation|0|The high-water line of Folsom Lake.
L|20.5|Salmon Falls Bridge|1|Take-out on the right bank upstream of the bridge. Parking fees are charged.
`);

const permit = {
  status: 'No permit · free annual boat tag',
  asOf: 'October 2026',
  contact: { phone: '530-621-5349', web: 'https://www.edcgov.us/Government/Parks/Pages/south-fork-american-river.aspx' },
  sections: [
    {
      name: 'Private boaters',
      items: [
        { t: 'Boat tag', d: 'El Dorado County requires private boaters to display a free annual registration tag on the boat, available at access-point information boards, local campgrounds and stores.' },
        { t: 'Large groups', d: 'Non-commercial groups of 18 or more must register before launching, online or at the major access points.' },
      ],
    },
    {
      name: 'Rules',
      items: [
        { t: 'Quiet Zone', d: 'From half a mile above Troublemaker (mile 4.4) to Greenwood Creek (mile 11.5), reduce noise near homes.' },
        { t: 'Trash', d: 'Every boat must carry a waterproof trash bag.' },
        { t: 'Toilets', d: 'Use designated restrooms or carry a portable toilet if you use land without facilities.' },
      ],
    },
  ],
};

const rules = [
  {
    name: 'Equipment',
    rules: [
      { t: 'Life jackets', d: 'One Coast Guard approved life jacket per person on board. Children under 12 must wear theirs while underway in vessels 26 feet or less. A Class III or V whitewater life jacket is advised.' },
      { t: 'Wetsuits', d: 'Wear a wetsuit when flows are above 4,500 cfs or when air and water temperature combined is under 120 degrees.' },
    ],
  },
  {
    name: 'Flows',
    rules: [
      { t: 'Releases', d: 'Summer flows from Chili Bar Dam are usually 1,000 to 2,000 cfs. Boatable flows above 900 cfs usually run 9 a.m. to 1 p.m. Sunday through Friday and 7 a.m. to 1 p.m. on Saturday, through the first weekend of October.' },
      { t: 'Surges', d: 'Upstream utilities may release up to 3,600 cfs on midweek evenings. Flows can rise quickly.' },
      { t: 'Difficulty', d: 'Both runs are Class III below 6,000 cfs. Above that some rapids are Class IV and for advanced boaters only. Above 8,000 cfs demand the utmost respect.' },
    ],
  },
  {
    name: 'Access',
    rules: [
      { t: 'Stopping', d: 'Most riverside land is private. Public lands are the only acceptable stopping places. Signs mark where BLM land begins and ends.' },
      { t: 'Marshall park', d: 'Marshall Gold Discovery State Historic Park prohibits all take-outs. Put-ins are allowed at North Beach.' },
      { t: 'Fire', d: 'California campfire permits are required on BLM lands during fire season from May through October.' },
    ],
  },
];

const access = [
  { name: 'Placerville', road: true, hub: true, note: 'Nearest city; El Dorado County Parks', grid: [3, 2] },
  { name: 'Folsom', road: true, hub: true, note: 'Nearest city to the take-out', grid: [9, 2] },
  { name: 'Chili Bar', road: true, mile: 0, park: true, note: 'Put-in, Highway 193', grid: [1, 6] },
  { name: 'Camp Lotus', road: true, mile: 9, park: true, note: 'Common take-out and Gorge put-in area', grid: [5, 6] },
  { name: 'Salmon Falls', road: true, mile: 20.5, park: true, note: 'Take-out. Parking fee', grid: [10, 6] },
];
const roads = [
  { a: 'Placerville', b: 'Chili Bar', h: '' },
  { a: 'Placerville', b: 'Camp Lotus', h: '' },
  { a: 'Folsom', b: 'Salmon Falls', h: '' },
];

write('south-fork-american', {
  name: 'American River, South Fork',
  reach: 'Chili Bar to Salmon Falls',
  agency: 'El Dorado County Parks / BLM Mother Lode Field Office / California State Parks',
  miles: [0, 20.5],
  days: 2,
  coords: [38.8, -120.9],
  tz: 'America/Los_Angeles',
  camps: d.camps,
  rapids: d.rapids,
  hikes: d.hikes,
  geology: [],
  guide: [],
  almanac: {},
  rules,
  landmarks: d.landmarks,
  clusters: [
    { s: 0, e: 9, n: 'Chili Bar run' },
    { s: 9, e: 20.5, n: 'The Gorge' },
  ],
  hdiff: { 1: 'Short, easy walk', 2: 'Easy trail', 3: 'Longer hike' },
  access,
  yardGrid: [5, 1],
  roads,
  permit,
});
