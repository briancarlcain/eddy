// node C:/rg_tmp/gen-rivers/middle-fork-salmon.js   (from the repo root)
const { parse, write } = require('./common.js');

// Miles from Boundary Creek (0) to Cache Bar (98.97). Features and miles from American Whitewater's feature list;
// rules and permit details from the Salmon-Challis National Forest. Camp quality is not rated by any source.
const d = parse(`
R|0.05|First Bend Rapid|II|Bends right and splits; center is usually best.
R|0.81|Murph's Hole|IV|Hard above 4 ft, with a boat-flipping hole on the right. Scout on river left.
R|2.47|Pinball Rapid|II|A low-water rapid.
R|3.02|Sulphur Slide Rapid|III|Steep, long rock garden. Start left and work center at moderate to high flow; scout at low water.
R|3.95|Ramshorn Rapid|III|Log jams were reported in 2022; look before you run.
R|4.57|Hells Half Mile Rapid|III|Changed by 2023 debris; very shallow at low flow.
R|5.24|Velvet Falls|IV|Altered by a 2023 debris flow. Scout; the line runs down the right side.
R|7.56|Avalanche Atoll (Upper Chutes)|II|Rated II but very challenging below 2.2 ft.
R|7.77|The Chutes|III+|Stay left and avoid the rock at the channel entrance.
R|11.46|Powerhouse Rapid|IV|Scout from the right-side bench. A cabin and ruins stand here.
R|17.82|Artillery Rapids|III|A series of long, relatively easy rapids.
R|19.92|Cannon Creek Rapid|III|Work left to avoid the ledge.
R|21.49|Lake Creek Rapid|III|Formed by the Lake Creek debris fan; changes with debris flows.
R|21.98|Pistol Creek Rapid|IV|S-turn, usually run left, with rocks and a hole on the right. Scout trail on the right.
R|28.93|Orelano Rapid|II+|Formed by the Orelano Creek debris fan.
R|32.26|Marble Creek Rapid|III|Bedrock ledge; run left of center. Surf wave at some flows.
R|37.73|Jackass Rapid|III|Ledges from the left bank and a boulder at the bottom: a hole at high flow, can snag at low.
R|47.62|White Creek Rapid|II|Hard bend left.
R|58.00|Tappan I Rapid|III|Stay center. Rated II in some guides.
R|58.20|Tappan Falls|IV|Usually best near the right bank; the line changes with flow. Scout at low water. Rated III in some guides.
R|58.63|Tappan II Rapid|III|Pass the boulder in the center, then move right. The lower part was submerged by the 2008 debris flow.
R|58.79|Tappan III (Cove Creek Rapid)|III|Stay left. Altered by the 2008 debris flow.
R|59.14|Tappan IV Rapid|II|The final and easiest of the Tappan rapids.
R|62.82|Aparejo Point Rapids|III|Enter center and work left.
R|67.51|Haystack Rapid|III|Long rock garden with different routes at different flows.
R|67.62|Bernard Creek Rapid|III|A continuation of Haystack, changed by a 2003 debris flow.
R|70.07|Earthquake Rock Rapid|III|Formed by rockfall from the 1983 Borah Peak earthquake.
R|70.51|Jack Creek Rapid|III|End of about half a mile of whitewater in Jack Creek Canyon; big waves at high water.
R|70.78|Little Pine Rapid|II|A fun rapid where the river turns right.
R|70.98|Little Pine Boulders|II|Large boulders form the rapid.
R|71.16|Driftwood Rapid|II|Large boulder left of center; cliff at the bottom.
R|71.41|Lower Driftwood Rapid|II|A wave train below camp.
R|77.06|Waterfall Creek Rapid|-|Waterfall Creek and its falls enter here. Not rated in the source.
R|78.21|Cutthroat Cove Rapid|III-|A rock right of center at the bottom can wrap or flip rafts. Stay left.
R|80.22|Wall Creek Rapid (Porcupine)|III|Short, sharp right bend; enter center and work left.
R|81.84|Redside Rapid|IV|A classic; lines vary with flow.
R|82.25|Weber Rapid|IV|Center or center-left at most flows.
R|82.56|Mist Falls Rapid|III-|Read and run.
R|87.87|Upper Cliffside Rapid|III|Run inside the right-hand corner off the left wall; a surf spot for kayakers.
R|88.05|Lower Cliffside Rapid|III|Rock garden; right-side holes at high flow.
R|89.17|Ouzel Rapid|II|A long rapid of small boulders, past Stoddard Creek.
R|90.50|Rubber Rapid|IV|A classic. Stay center and follow the main current.
R|91.51|Hancock Rapid|IV|Long, with large standing waves below the right-bank creek.
R|92.66|Devil's Molar Rapid|II|A huge boulder that precedes Devil's Tooth.
R|92.94|Devil's Tooth Rapid|III|Run right of center; large boulders.
R|93.10|House of Rocks Rapid|III+|House-sized rocks. Hard left needed at high flow.
R|93.33|Clamshell Rock|II|Midstream boulder with an opening on its downstream side.
R|93.46|Jump Off Rapid|III|Read and run.
R|93.75|Best Rock on the Middle Fork|II|Boulders may form holes at the highest flows.
R|94.10|Upper Goat Creek Rapid|II+|A wave train.
R|94.42|Lower Goat Creek Rapid|II|The last rapid on the Middle Fork.
R|98.05|Cramer Creek Rapid|IV|On the Main Salmon below the confluence. Run right of center; a big hole sits left of center.

C|1.04|Teepee Hole|L|s|Small and heavily used; 10 people or fewer. Fishermen hike in.
C|1.66|Cable Hole|L|s|Small rocky bench; 10 people or fewer.
C|2.88|Gardell's Hole|R|l|Large sand and gravel bar above a pool and Sulphur Slide. Small at high flows.
C|5.55|Boy Scout|R|s|Small and rocky.
C|6.70|Big Bend|R|l|Low sandy bench with timber and open areas.
C|7.24|Trail Flat|L|l|Large bench with a hot spring at the water's edge, which washes out at high water.
C|8.78|Elkhorn Bar|R|l|Look for a big mid-river rock just above.
C|9.62|Saddle|L|?|Timbered flat below a grassy saddle.
C|9.76|Boot|R|xs|Very small, high timbered bench.
C|12.02|Joe Bump|L|l|Large timbered bench across from Soldier Creek. The Joe Bump cabin is up a trail.
C|13.03|Scout|L|?|Near Sheepeater hot springs.
C|13.33|Sheepeater|L|?|Hard landing at low water. Hot spring on the terrace above.
C|14.77|Lake Creek|R|l|Large; across from Lake Creek.
C|14.90|Fire Island|L|l|Large party site on a low timber and grass bench.
C|15.15|John's|R|l|Large bench at a sharp right bend.
C|15.93|Greyhound Creek|R|s|Small, by a pool about 10 ft above the river.
C|15.99|Dome Hole|L|s|Small, just past the pool.
C|18.32|Rapid River|R|l|Large party timbered bench.
C|19.43|Dolly Lake|L|?|On Dolly Lake, one of the largest and deepest pools.
C|19.72|Big Snag|R|l|Large; marked by a big snag if it is still standing.
C|21.60|Quick Stop|R|xs|Very small, at the bend above Pistol Creek Rapid.
C|22.07|Pistol Creek|L|l|Large sandy bench at the lower end of Pistol Creek Gorge.
C|24.82|Airplane|L|l|Large open timbered site across from Short Creek.
C|25.84|Pack Bridge|L|?|Just upstream of the pack bridge.
C|26.79|Indian Creek|L|l|Large, just upstream of Indian Creek.
C|27.97|Pungo Creek|L|l|Large and heavily used, with an easy landing below the creek. Sensitive cultural site: camp below the creek mouth.
C|31.48|Little Soldier|R|?|Land below the creek; timber benches above.
C|32.12|Upper Marble|L|xl|Very large low bench at the upper end of a quiet pool.
C|32.20|Marble Left|L|?|Grassy bench under a small cliff, with a view of Marble Creek Rapid.
C|32.43|Marble Right|R|?|Grassy timber bench below the rapids; easy landing.
C|33.40|Sunflower Flat|R|s|Popular, scenic hot pools. Small campsite downstream.
C|33.43|Lost Oak|L|l|Large timbered bench. Ferry to river right for Sunflower hot spring at moderate flows.
C|35.32|State Land Left|L|?|Ponderosa bench.
C|35.41|State Land Right|R|l|Large low bench with scattered ponderosa.
C|36.26|Little Creek|R|l|Large bench below Little Creek Guard Station.
C|36.36|Hood Ranch|L|l|Large, with an old cabin and a hot spring at the downstream end.
C|37.82|Upper Jackass Flat|R|l|Large, just below Jackass Rapid.
C|38.12|Lower Jackass Flat|R|l|Large, mostly timbered low bench.
C|41.98|Mahoney|R|s|Small beach by a large pool.
C|43.47|Pine Creek Flat|R|l|Large, on a sagebrush flat above the river.
C|45.59|Culver Creek|R|s|Small; rocky outcrop just upstream.
C|46.46|Whitie Cox|R|?|Sandy gravel bar with a fallen ponderosa and a hot spring on the bench above. Named for a miner who died in 1954 and is buried here.
C|46.70|Rock Island|L|l|Large timbered low bench.
C|46.90|Pebble Beach|L|l|Timbered low bench with room for a large party.
C|47.84|White Creek|R|?|Across from White Creek.
C|48.63|Shelf|R|?|Easy pull-in on a gravel bar; tree-covered bench.
C|49.86|Big Loon|R|l|Large with limited shade. Airstrip nearby. Hot spring with a creekside tub 0.8 mi up the Loon Creek trail.
C|50.36|Cow Creek|R|s|Small brushy bar; 1.2 mi walk to Loon Creek hot spring.
C|52.29|Cave|R|s|Small; as the left-bank cove comes into view.
C|52.54|Hospital Bar|L|l|Large and shady. Hot spring at the river's edge upstream, which may be underwater at high flow.
C|53.00|Horsetail|R|s|Small, high timbered bench.
C|53.53|Cub Creek|L|s|Small, just above the creek mouth.
C|56.53|Upper Grouse Creek|R|l|Large; easy landing.
C|56.74|Lower Grouse Creek|R|?|In the middle of Grouse Creek Rapid; a quick eddy pull. Beach at low water.
C|57.29|Tappan Island Center|-|?|Low open island. Land at the downstream end from the right channel.
C|60.13|Camas Creek|R|l|Large; hike up Camas Creek.
C|60.98|Johnny Walker|L|l|Large timbered bench with a steep rock wall behind.
C|61.48|Pool|R|s|Small bench by a large quiet pool.
C|61.78|Funston|L|s|Small sandy beach just below Big Bear Creek.
C|62.04|Broken Oar|R|s|Small sandy sagebrush flat with trees.
C|63.77|Trail|R|l|Large, popular, low timbered bench.
C|63.86|Normandy Beach|L|s|Small pine and sagebrush beach.
C|64.79|Sheep Creek|L|xl|Very large, on the upstream side of Sheep Creek.
C|66.23|Flying B|R|s|Small, at the water's edge.
C|67.01|Flying B Airport|R|l|Large; across from the airfield.
C|68.18|Bernard|L|l|Large, just below the Bernard Creek airstrip.
C|68.35|Short Creek|R|m|Mid-sized sage flat with a rocky shore.
C|69.43|Cold Spring|R|s|Small, 20 ft above the river in trees.
C|70.95|Little Pine|L|m|Medium, just below the Jack Creek rapids.
C|71.35|Driftwood|R|l|Large beach with boulder "rooms" for separate sites.
C|72.18|Wilson Creek|R|l|Large, easily seen, sandy with brush.
C|72.33|Grassy Flat I|L|l|Large open bench across from Wilson Creek.
C|72.60|Grassy Flat II|L|l|Large open bench.
C|74.12|Survey Creek|L|l|Large with timber cover and a small sandy beach downstream.
C|74.23|Woolard Creek|R|l|Large grassy bench; land at the upstream end.
C|75.03|Fly|R|s|Small sandy beach across from Kimmel Creek falls.
C|76.86|Fish|L|s|Small; upstream end of a rock bar.
C|77.47|Big Creek|L|s|Small brushy bivouac. Hike up the creek, the most boated tributary by kayaks and packrafts.
C|77.52|Last Chance|R|xs|Very small; quality varies by year.
C|78.20|Pine Bluff|L|s|Small sandy timbered site.
C|78.34|Cutthroat Cove|L|s|Small sandbar backed by rock and brush.
C|78.67|Big Pine|R|s|Small sandbar at the end of a long pool.
C|79.03|Elk Bar|L|l|Large sandbar below a small rapid, nice in low summer water. A good last-day option, about 20 mi from the take-out.
C|79.11|Love Bar|L|s|Small, just below Elk Bar.
C|81.75|Redside|L|s|Small, on a high bench just above Redside Rapid.
C|83.60|Papoose|L|xs|Very small, at the mouth of Papoose Creek.
C|83.72|Ship Island|L|l|Large bench above a rocky shore. Landing can be fast.
C|84.32|Lightning Strike|L|s|Small beach.
C|85.63|Parrot Placer|R|l|Large sandy beach among trees and brush.
C|87.91|Cradle Creek|R|m|Mid-sized bench by a large boulder. Land in the eddy past Upper Cliffside. A good last night.
C|88.23|Tumble Creek|R|l|Large grassy bench above Tumble Creek.
C|89.06|Ouzel|L|s|Small sandy beach with rocks.
C|89.10|Cliffside|R|?|Sandbar that varies from year to year.
C|89.47|Stoddard|L|?|Reached in the middle of Ouzel Rapid, so commit early. Pictograph trail up Stoddard Creek.
C|89.76|Otter Bar|R|?|Long sandbar.
C|91.98|Solitude|L|s|Small sandbar with swift current. The last feasible camp in Impassable Canyon.
C|94.19|Goat Creek|R|xs|Very small, among rocks below Goat Creek Rapid.

H|0.81|Murph's Hole scout|L|1|Look the hole over from river left before you run it.
H|7.24|Trail Flat hot spring|L|1|A hot spring at the water's edge below camp. It washes out at high water.
H|11.46|Powerhouse cabin and ruins|R|1|A cabin and ruins beside Powerhouse Rapid, reached from the scouting bench.
H|12.02|Joe Bump cabin|L|2|An old cabin up a trail from camp.
H|13.33|Sheepeater hot spring|L|1|A hot spring on the terrace above camp.
H|21.98|Pistol Creek Rapid scout|R|1|A scouting trail on river right.
H|33.40|Sunflower Flat hot spring|R|1|Popular, scenic hot pools.
H|36.36|Hood Ranch hot spring|L|1|A hot spring at the downstream end of camp.
H|39.81|Cameron Creek pictographs|L|2|A trail to pictographs. Day use only; closed to overnight use.
H|46.46|Whitie Cox hot spring|R|1|A hot spring on the bench above camp.
H|49.86|Loon Creek hot spring|R|3|A creekside tub 0.8 mi up the Loon Creek trail, which passes Simplot Ranch. It is 1.2 mi from Cow Creek camp.
H|52.54|Hospital Bar hot spring|L|1|At the river's edge upstream of camp; may be underwater at high flow.
H|60.13|Camas Creek|R|3|Hike up Camas Creek; kayakers have run it.
H|62.31|Shark Fin pictographs|L|2|Pictographs above the river near a shark-fin-shaped boulder.
H|73.75|Rattlesnake Cave|R|2|Pictographs. Day use only; pull in upstream.
H|77.47|Big Creek|L|3|Hike up Big Creek. A separate tributary permit is needed if you float it.
H|79.99|Veil Falls|R|2|Misty falls up a steep, short hike. Popular on hot days.
H|89.47|Stoddard Creek pictographs|L|2|A trail up Stoddard Creek to pictographs.

L|0.00|Boundary Creek launch|1|Put-in, reached on Forest Service Road 568 from Bruce Meadows or Road 579 off Highway 21. The permit zone begins at Dagger Falls just upstream.
L|22.93|Pistol Creek Ranch|1|A small airstrip with private cabins.
L|25.35|Indian Creek launch and guard station|1|Airstrip, launch and Forest Service guard station; fly-in supplies. Alternate put-in at very low or very high flows.
L|34.21|Middle Fork Lodge|1|A private fishing lodge. The flow gauge is on river left.
L|41.02|Cougar Creek Ranch|1|An Idaho Fish and Game patrol cabin and admin site.
L|56.79|Tappan Creek cabin|0|A historic ranch cabin.
L|66.18|Flying B Ranch|1|A small store with cold drinks, ice cream and ice. Water refills.
L|68.18|Bernard Creek airstrip|1|Airstrip just above Bernard camp.
L|87.19|Parrot Cabin|0|A cabin below the mouth of Nugget Creek, with a small camp area.
L|95.39|Salmon River confluence|0|A rough access is possible; most parties continue to Cache Bar.
L|98.97|Cache Bar|1|The standard take-out with paved ramps. Heavy traffic 9 to 11 a.m. from mid-June to mid-August.
`);

const permit = {
  status: 'Required year-round · lottery May 28 to Sept 3',
  asOf: 'October 2026',
  apply: { label: 'Apply on Recreation.gov', url: 'https://www.recreation.gov/permits/234623' },
  contact: { phone: '208-481-2625', email: 'sm.fs.middlefork@usda.gov', web: 'https://www.fs.usda.gov/r04/salmon-challis/recreation/epic-adventures/middle-fork-salmon-river' },
  sections: [
    {
      name: 'How to get one',
      items: [
        { t: 'Enter the lottery', d: 'Applications for control-season dates (May 28 to September 3) are taken on Recreation.gov from December 1 to January 31. Results are emailed February 14, and winners must confirm by March 15 or lose the reservation. You may submit only one application; duplicates bring a three-year restriction.' },
        { t: 'Before and after the control season', d: 'Dates outside May 28 to September 3 are not in the lottery. They open for first-come reservation on October 1 at 8 a.m. Mountain.' },
        { t: 'Camp request', d: 'A camp request form is emailed 14 days before launch. List every person, the trip length and the fees on Recreation.gov no later than 7 days before launch. Camps are assigned from your request and are final once the permit is issued.' },
        { t: 'The permit', d: 'The River Clerk emails the permit 5 or 6 days before launch. Print and sign it and carry it for the whole trip. A reservation is not the permit and does not guarantee passage: fire, debris flows and logjams can block the river or the access roads.' },
        { t: 'Launch date', d: 'The date you first enter the permitted stretch is your launch date, even if you start from a tributary or fly in. It cannot be adjusted.' },
        { t: 'Pick-ups', d: 'For cancellation pick-ups within 14 days of launch, contact the River Office right away.' },
      ],
    },
    {
      name: 'Dates and limits',
      items: [
        { t: 'Control season', d: 'May 28 to September 3. A permit is required all year, between Dagger Falls and the Main Salmon confluence.' },
        { t: 'Launches per day', d: 'No more than seven float parties, commercial and private combined, launch each day.' },
        { t: 'Group size and trip length', d: '1 to 10 people: up to 8 days (7 nights). 11 to 20: up to 7 days (6 nights). 21 to 24: up to 6 days (5 nights).' },
        { t: 'Boats during salmon spawning', d: 'August 8 to September 15: a maximum of 12 watercraft per permit, to protect spawning Chinook.' },
        { t: 'Eligibility', d: 'The permit holder must be at least 18 on the launch date, must be on the trip, and the permit is not transferable. Alternate trip leaders are not allowed.' },
        { t: 'Odds', d: 'Demand is extreme. One report counts nearly 20,000 applicants for about 353 control-season permits in 2025, a chance of under 2 percent.' },
      ],
    },
    {
      name: 'Costs',
      items: [
        { t: 'Application', d: '$6, non-refundable.' },
        { t: 'Per person', d: '$4 per person per day, or a Salmon Rivers Season Pass ($40, covers only the holder).' },
        { t: 'Discount', d: '50 percent off for Senior and Access pass holders. Enter the pass number in the reservation and bring the pass and photo ID.' },
        { t: 'Refunds', d: 'Recreation fees are refunded for reduced or cancelled trips. No-shows are not refunded.' },
      ],
    },
    {
      name: 'Cancellation and penalties',
      items: [
        { t: 'Control season', d: 'Cancel at least 21 days before launch, by 11:59 p.m. Mountain, to avoid a late penalty.' },
        { t: 'Outside the control season', d: 'Cancel at least 3 days before launch.' },
        { t: 'Exceptions', d: 'If water is above 5.0 ft or the Boundary Creek road is closed within 14 days of launch, or you booked within 21 days, you may cancel 3 days before launch. You must still cancel.' },
        { t: 'Penalty', d: 'A late cancellation or no-show means no permit and no lottery for three years.' },
      ],
    },
  ],
};

const rules = [
  {
    name: 'Required equipment',
    rules: [
      { t: 'Documents', d: 'The permit holder\'s government photo ID and the printed, signed permit. Boats are inspected at Boundary Creek and Indian Creek.' },
      { t: 'Fire pan', d: 'A metal fire pan of at least 144 square inches with sides at least 3 inches high (kayakers 2 inches). Required even if you build no fire. An unmodified garbage-can lid does not count.' },
      { t: 'Fire blanket and ash container', d: 'A fire blanket in good condition large enough to catch embers (required since 2023), and a metal or hard plastic ash container with a sealable lid. Bags and dry bags are not acceptable. Kayakers need 300 cubic inches.' },
      { t: 'Toilet', d: 'A porta-potty system sized for all human and pet waste. Plan about 1 lb per person per day. Only toilet paper and solid waste go in; no wipes, tampons or ash. Add water before the take-out.' },
      { t: 'Kitchen', d: 'A mesh strainer fine enough for coffee grounds, a shovel (folding is fine; kayakers may use a paddle) and a bucket (a cooking pot will do).' },
      { t: 'Aquatic invasive species', d: 'An Idaho AIS sticker on each boat (inflatable non-motorized craft under 10 ft are exempt). Boats must be clean, drained and dry on arrival and are inspected.' },
    ],
  },
  {
    name: 'Camping and fire',
    rules: [
      { t: 'Assigned camps', d: 'Camp only in the camps listed on your permit, with the whole group together. An assigned camp is not exclusive; expect to share it, especially at hot springs and airstrips.' },
      { t: 'Hot spring camps', d: 'A group may be assigned at most one hot spring camp, and it is not guaranteed.' },
      { t: 'Below Big Creek', d: 'During the control season, only one night per trip below Big Creek (mile 77.9). Layovers are limited and approved case by case.' },
      { t: 'Evening courtesy', d: 'Do not stay in or visit assigned camps after 7 p.m. Keep noise down.' },
      { t: 'Fires', d: 'Fires only in the fire pan, raised on rocks with a layer of sand or dirt. Gather only dead and down wood. Dampen ashes in the ash container and pack them out. Carry charcoal in case of restrictions.' },
    ],
  },
  {
    name: 'Wilderness and wildlife',
    rules: [
      { t: 'Frank Church Wilderness', d: 'The river runs through the Frank Church-River of No Return Wilderness. Drones, motors and mechanical transport are not allowed. Use a manual pump at Indian Creek.' },
      { t: 'Food and bears', d: 'Put food and drink away after meals and keep containers closed. Do not feed wildlife.' },
      { t: 'Dogs', d: 'Dogs must be leashed at guard stations, launches and take-outs. Pack out dog waste.' },
      { t: 'Cultural sites', d: 'Do not touch pictographs or collect artifacts.' },
      { t: 'Chinook redds', d: 'Avoid disturbing salmon nests in the main river and tributaries, especially in late summer and fall.' },
    ],
  },
  {
    name: 'Fishing',
    rules: [
      { t: 'License and gear', d: 'A valid Idaho fishing license is required and is not sold at the launches. Fishing is mostly catch and release with artificial flies or lures and a single barbless hook. Live bait is prohibited.' },
    ],
  },
];

const access = [
  { name: 'Stanley', road: true, hub: true, note: 'Nearest town to the put-in; Boundary Creek is about 25 miles of dirt road past it', grid: [2, 2] },
  { name: 'Salmon', road: true, hub: true, note: 'Nearest city to the take-out; River Office', grid: [10, 2] },
  { name: 'Boundary Creek', road: true, mile: 0, park: true, note: 'Put-in. Campground, permits checked, ramp', grid: [1, 6] },
  { name: 'Indian Creek', mile: 25.35, note: 'Fly-in alternate put-in and guard station (no road)', grid: [4, 6] },
  { name: 'Cache Bar', road: true, mile: 98.97, park: true, note: 'Take-out. Three ramp lanes; heavy morning traffic in summer', grid: [10, 6] },
];
const roads = [
  { a: 'Stanley', b: 'Boundary Creek', h: '' },
  { a: 'Salmon', b: 'Cache Bar', h: '' },
  { a: 'Stanley', b: 'Salmon', h: '' },
  { a: 'Outfitter', b: 'Stanley', h: '' },
];

write('middle-fork-salmon', {
  name: 'Middle Fork of the Salmon River',
  reach: 'Boundary Creek to Cache Bar',
  agency: 'Salmon-Challis National Forest, River Office',
  miles: [0, 99],
  days: 6,
  coords: [44.85, -115.0],
  tz: 'America/Boise',
  note: 'About 99 miles through the Frank Church-River of No Return Wilderness, with more than 100 rapids and many hot springs. Mile numbers are American Whitewater\'s from Boundary Creek; the Forest Service counts the take-out as about mile 99.7. Camps are listed by size only; quality is not rated. Rapids change with debris flows and flows. Compiled from public sources; verify with the Forest Service and a current guidebook.',
  camps: d.camps,
  rapids: d.rapids,
  hikes: d.hikes,
  geology: [],
  guide: [],
  almanac: {
    history: [
      ['Debris flows reshape the rapids', 'Debris flows from side creeks have rebuilt rapids more than once, including Bernard Creek in 2003, the Tappan rapids in 2008 and Velvet Falls and Hells Half Mile in 2023. Look before you run, even rapids you know.'],
      ['Earthquake Rock', 'Earthquake Rock Rapid was formed by rockfall during the 1983 Borah Peak earthquake.'],
      ['Whitie Cox', 'Whitie Cox, a miner who died in 1954, is buried at the camp that bears his name.'],
    ],
  },
  rules,
  landmarks: d.landmarks,
  clusters: [{ s: 77.5, e: 95.4, n: 'Impassable Canyon' }],
  notes: {
    camp: '*Camps are assigned with your permit and rated for size only. Capacity changes with river level.',
    hike: '*Difficulty is a rough estimate (1 = short, easy walk; 3 = longer trail with climbing). Times are not given.',
  },
  hdiff: { 1: 'Short, easy walk', 2: 'Easy trail or short climb', 3: 'Longer trail with some climbing' },
  access,
  yardGrid: [5, 1],
  roads,
  permit,
});
