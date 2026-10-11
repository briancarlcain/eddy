const { parse, write } = require('./common.js');

// Miles from the Miami Bar put-in (0) to the Oak Flat take-out (32.3). Follows one detailed river log.
const d = parse(`
R|0.5|Baker Creek rapid|II|Choppy water near the mouth of Baker Creek on the left, then flatwater.
R|2.5|Briggs Creek|II|The largest rapid so far, just above Briggs Creek on the right. The road ends here.
R|2.9|Panther Creek|II+|A long, technical rapid about 50 meters below Panther Creek on the right. It begins a series of closely spaced rapids.
R|3.0|Rapid 11|II+|Pass right of the boulder field on the left.
R|3.1|Rapid 12|III|Avoid the camel humps in the center.
R|3.2|Rapid 13|III|A midstream boulder at a left bend.
R|3.3|Labrador Creek|III|Labrador Creek enters on the left before a long straightaway rapid. The Kalmiopsis Wilderness begins just downstream.
R|3.7|Nome Creek|III|Nome Creek enters on the left above a drop with a rock wall on the left.
R|4.0|Rapid 16|III|Boulder-bar shelves at the top and bottom.
R|4.1|Rocky Top|IV|Causes more first-timer trouble than any other rapid, and many rafts flip. A large boulder sits above the horizon on the left. Enter left of center in line with the boulder, wait to clear the guard rocks, then move right quickly. A sneak route far right works at high flow.
R|4.2|False York Creek|III|Resembles York Creek but is easier. Pass right of the boulder bar and prepare for a drop at the bottom.
R|4.8|York Creek|IV|York Creek enters on the right. Scout from rocks near the left bank. Enter left of center and drop into the deep channel against the left wall, avoiding the large holes halfway down and on the left at the bottom. A big pool follows.
R|5.3|Mossy Left Bank|III+|Large holes on the left and center push boats toward the wall.
R|5.5|Clear Creek|IV|A long Class II-III lead-in with the main action at the bottom. Stay slightly left at high and low flows, enter the lower section in the center and exit mid-channel or near the left bank. Clear Creek enters over a waterfall just below.
R|6.1|Five rapids|III|Rapids spaced about 0.1 mile apart: II, II, III, III, II.
R|6.9|Rapid at the canyon opening|III|A drop into the left wall where a creek enters. The canyon then opens into Pine Flat.
R|7.9|Pine Creek (Boat Eater)|IV|Pine Creek enters on the right. The left side of the big boulder is easier and lower risk; Boat Eater is on the right side. Scout from the right bank if running it. Sneak routes exist on both sides.
R|8.9|Wallbanger (Florence Creek)|III|A rock bar from the right forces the current into the left wall.
R|9.1|Landslide rapid|II|A boulder-bar rapid with the deepest channel far left. A landslide below shows red soil and red chert boulders.
R|10.0|Klondike Creek|III|Klondike Creek enters on the left as the rapid begins. The rapid intensifies at a sharp right turn.
R|11.4|Three rapids|III|Easy, easier, harder. A waterfall appears on the left below the harder one.
R|11.7|Mike's Nemesis|IV|Identified by white-striated cliffs at a right bend. The river drops about 8 feet around several midstream boulders. Enter center, avoid the right-side guard rocks and work right to avoid the major holes. Easy to flip at high water.
R|12.9|South Bend Mountain|II+|A Class II-III drop about every 0.1 mile as the river bends left around South Bend Mountain.
R|17.6|Pre-Prelude|III|After a long slow stretch, rock slides appear on both sides with fallen boulders in the river on the right.
R|17.8|Prelude (Fawn Falls)|IV|A long boulder-bar rapid ending in a sharp final drop. Start left. Scout the falls from the eddy where a small stream enters on the left; scout the sneak route from the right bank well upstream. Green Wall is 0.2 mile downstream.
R|18.1|Green Wall|V|The crux of the river. A long right-curving Class III leads to a Class V section; scout from a small eddy on the left between the two. Scouting at least the bottom is essentially mandatory. A huge hole sits at the top right and a rock cluster called Harvey at the bottom. At most flows start left to avoid the first hole, move right along the wall to miss Harvey, then away from the wall. Portage on the left is possible but difficult. A short pool below is too small for unassisted recovery.
R|18.8|Little Green Wall|IV|A large rockslide from the left dams the river. The standard route is left of one large midstream boulder, quickly left of another, between two midstream boulders, right of the next cluster and quickly left again.
R|19.0|Whitewater Primer|III|About 20 minutes of closely spaced rapids: II, III, III, III, III, II, then a lull and a III.
R|19.5|Catatonic|IV|Two Class III+ drops at low flow. Run the first section starting left and moving to center; the second starting center and moving slightly left. Catarafts can flip going right at the bottom at high flows.
R|20.1|False Submarine A|III+|Enter left of center between two large boulders, then work far right. A pine tree stands on the right.
R|20.4|False Submarine B|III+|Enter left of center between two small boulders and stay left. Alders on both banks.
R|20.7|Pre-Submarine|III|Starts with a cabin-sized boulder midstream.
R|21.0|Submarine Hole|IV+|Steep and rocky, with a large plug rock at the bottom. At low flow the passage between the left wall and plug rock is very narrow and below 800 cfs rafts may have to deflate tubes. At low flow enter far right, work left, pass the big boulder on the right and move to the extreme left. At moderate and high flow enter center, clear the big boulder and ferry left. Keep the boat straight through the narrows.
R|21.2|Submarine Hole second drop|IV|A rapid with three distinct drops. At high flow a huge hole against the right wall can flip the largest rafts.
R|26.1|Sandy Beach rapid|III|A rapid at a left bend with Sandy Beach camp below on the left.
R|29.5|Horsesign Creek|III+|At some flows this rapid has the largest hole you must run. Horsesign Creek enters on the left below.
R|31.3|Lynch Bar rapid|III|A midstream rock above a large sandbar.
R|31.6|Dunbar Riffle|II|Below Nancy Creek. The only rapid between Ethels Creek and the take-out.

C|0.0|Miami Bar|R|m|The put-in, a gravel beach with an outhouse above the high-water mark. Camping on the beach or on a wooded point 0.5 mile downstream. No running water.
C|1.7|First Camp|R|m|A good place to camp after a late start.
C|6.3|Sandy beach|R|s|A small camp or lunch spot.
C|8.0|Pine Flat|L|l|Large camps under pines on both sides of the river.
C|8.2|Weaver Ranch camps|R|m|Several camps on the right if the pine camp is full.
C|10.0|Klondike Creek|L|m|A medium camp, hard to reach at high flows.
C|12.5|Deadman's Bar|R|l|An excellent large camp about 30 feet above the river, running 0.4 mile. Poison oak on uphill trails. A small stream at the lower end provides drinking water.
C|13.5|Tony's Camp|R|m|Just below the rapid where the river bends left between rock walls.
C|17.1|Red Rock Bar (South Bend)|R|s|A gravel-beach camp on the right just past the bend, below Tin Cabin Pass. A large pinkish-red radiolarian chert boulder marks it.
C|21.7|Collier Creek|L|l|An excellent camp on the left bank just below the creek, with steep access over bare rock. Sandy beaches begin below here.
C|25.4|Silver Creek|R|s|A camp on a high bench with no kitchen near the water.
C|26.1|Sandy Beach|L|m|A medium camp below the Class III rapid. Gather firewood in advance.
C|29.5|Horsesign Creek|R|m|A good camp above the rapid.
C|31.3|Lynch Bar|R|l|A large sandy beach, the popular last-night camp. The best camp is at the downstream end, reached by a small creek leading to a large flat. Gather firewood in advance.

H|2.5|Briggs Creek trail|R|2|A trail follows the right bank to Pine Flat from the end of the road.
H|8.2|Weaver Ranch|R|1|A historic homestead well back from the right bank.
H|25.2|Three Waterfalls|-|1|A scenic landmark.
H|25.4|Silver Creek and Illinois River Trail|R|3|A hiking bridge crosses the creek; a trail follows the right bank for two miles downstream, and a side hike leads to Conner's Place.
H|28.4|Indigo Creek|R|2|Darlingtonia pitcher plants and other rare plants on the left bank.

L|0.0|Miami Bar|1|Put-in, a gravel beach reached by a side road. An alternate put-in lies 4 miles upstream at McCaleb Ranch.
L|1.5|Last residences|0|The last houses on the river. Dead trees from the 2002 Biscuit Fire appear from here on.
L|3.3|Kalmiopsis Wilderness|0|The wilderness begins just below Labrador Creek, with no marker.
L|8.2|Weaver Ranch|0|A historic ranch back from the right bank.
L|17.1|Red Rock Bar|0|Tin Cabin Pass is higher up.
L|18.3|Green Wall pool|0|A short pool at the bottom of Green Wall. Two Class II rapids follow.
L|25.2|Three Waterfalls|0|A scenic landmark.
L|28.4|Indigo Creek|0|Indigo Creek enters on the right.
L|28.9|Buzzard's Roost|0|Cliffs on both sides mark the proposed dam site that would have flooded the entire run. Wild and Scenic protection stopped it in 1984.
L|30.4|Nancy Creek|0|Nancy Creek enters on the left.
L|32.3|Oak Flat|1|Take-out on the right bank above the Rogue confluence, with restrooms behind a row of trees. A dirt road climbs to the paved road to Agness.
`);

const permit = {
  status: 'Required year-round · free, self-issued',
  asOf: 'October 2026',
  contact: { web: 'https://www.fs.usda.gov/r06/rogue-siskiyou' },
  sections: [
    {
      name: 'How to get one',
      items: [
        { t: 'Where', d: 'Permits are free and available 24 hours a day at the self-issue display at the entrance to the Selma Market, at Highway 199 and the Illinois River Road (Deer Creek Road) in Selma, Oregon.' },
        { t: 'What it covers', d: 'A permit is required year-round for all trips on the Wild section between Briggs Creek and Nancy Creek.' },
        { t: 'Return', d: 'Drop your copy of the permit in the box at the Oak Flat take-out to confirm your safe return.' },
      ],
    },
    {
      name: 'Limits',
      items: [
        { t: 'Group size', d: 'Groups are limited to 12 people.' },
        { t: 'Drones', d: 'Drones are prohibited.' },
      ],
    },
  ],
};

const rules = [
  {
    name: 'Season and flows',
    rules: [
      { t: 'Season', d: 'There is no dam, so flows follow weather. The typical window is March through mid-May; boatable flows can occur through the winter rainy season.' },
      { t: 'Flows', d: 'Rafts and kayaks need about 800 to 3,500 cfs at the Kerby gauge, 15 miles upstream of the put-in; inflatable kayaks about 400. Take-out flow is usually two to three times the put-in flow because of side streams.' },
      { t: 'Rain', d: 'Avoid starting when significant rain is forecast. If rain falls unexpectedly while camped at Pine Flat, cross right, tie up boats and walk out; if the flow is rising, start early and reach below Collier Creek (mile 21.7) before dark.' },
    ],
  },
  {
    name: 'Scouting and portages',
    rules: [
      { t: 'Green Wall', d: 'Scouting at least the bottom is essentially mandatory. Preferred lines change with flow and rock movement.' },
      { t: 'Portage', d: 'Green Wall can be portaged on the left with considerable effort, and is very difficult to line or portage with rafts.' },
      { t: 'Safety boat', d: 'The pool below Green Wall is too small for unassisted recovery. Set throw bags for the first boat.' },
    ],
  },
  {
    name: 'Camping',
    rules: [
      { t: 'Where', d: 'Camps are limited at the put-in. After South Bend there are almost no good camps until below Submarine Hole.' },
      { t: 'Leave no trace', d: 'Leave No Trace principles apply. Gather firewood in advance at Sandy Beach and Lynch Bar.' },
      { t: 'Poison oak', d: 'Poison oak grows on uphill trails at Deadman\'s Bar.' },
    ],
  },
];

const access = [
  { name: 'Cave Junction', road: true, hub: true, note: 'Nearest town; Selma is just north', grid: [2, 2] },
  { name: 'Grants Pass', road: true, hub: true, note: 'Nearest city', grid: [5, 2] },
  { name: 'Agness', road: true, hub: true, note: 'Nearest community to the take-out', grid: [9, 2] },
  { name: 'Miami Bar', road: true, mile: 0, park: true, note: 'Put-in. A 16 mile dirt road from Selma', grid: [1, 6] },
  { name: 'Oak Flat', road: true, mile: 32.3, park: true, note: 'Take-out, above the Rogue confluence', grid: [10, 6] },
];
const roads = [
  { a: 'Cave Junction', b: 'Miami Bar', h: '' },
  { a: 'Grants Pass', b: 'Cave Junction', h: '' },
  { a: 'Agness', b: 'Oak Flat', h: '' },
];

write('illinois', {
  name: 'Illinois River',
  reach: 'Miami Bar to Oak Flat',
  agency: 'USFS Rogue River-Siskiyou National Forest',
  miles: [0, 32.3],
  days: 3,
  coords: [42.32, -123.85],
  tz: 'America/Los_Angeles',
  camps: d.camps,
  rapids: d.rapids,
  hikes: d.hikes,
  geology: [],
  guide: [],
  almanac: {},
  rules,
  landmarks: d.landmarks,
  clusters: [{ s: 17.6, e: 21.5, n: 'Prelude to Submarine Hole' }],
  hdiff: { 1: 'Short, easy walk', 2: 'Easy trail', 3: 'Longer hike' },
  access,
  yardGrid: [5, 1],
  roads,
  permit,
});
