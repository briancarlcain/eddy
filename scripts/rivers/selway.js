const { parse, write } = require('./common.js');

// Miles from the Paradise launch (0) to the Race Creek take-out (47.7), per one detailed river log (cacreeks.com).
// American Whitewater's log runs 0.2 to 0.4 mile longer in places (Ham 23.6 vs 23.3, Wolf Creek 38.0 vs 37.7).
const d = parse(`
R|0.2|Rocky rapids below launch|-|Tight for rafts.
R|3.5|Slalom Slide|III|A boulder bar with a diagonal channel.
R|4.2|Galloping Gertie|III+|Hard at low water; rafts can wedge on the left. Enter right.
R|4.4|Washer Woman|III|Scout from the center or right. Especially hard for rafts at low flow, with a good chance of sticking: pick where to stick. American Whitewater rates it IV.
R|4.7|Cougar Bluff|III|A wave train along the left cliff.
R|5.5|Holy Smokes|III-|Possibly II+ at low water.
R|9.3|Ping Pong Alley|III|Rated II on the Forest Service map but hard for rafts at low flow, with a lot of pushing off rocks.
R|11.5|Goat Creek Rapid|IV|Large boulders; a boulder garden. Watch for logs early in the season.
R|14.9|Selway Lodge Bridge Rapid|II+|Rafts often stick on exposed rocks at low flow.
R|16.2|Bear Creek Rapid|II|About 0.2 mile below Bear Creek camp.
R|17.8|Rodeo Rapid|II|Likely just below Black Sands. Position approximate.
R|18.5|Pettibone Rapid|II|Follows Dead Elk camp. Position approximate.
R|23.3|False Ham|III-|Just above Ham.
R|23.3|Ham Rapid|IV-|Two major drops through big boulders and a narrow channel; precise moves are required. Named for a dinner ham lost there in 1961.
R|24.1|Hell Creek rapids|II+|The start of nearly continuous Class II+ rapids.
R|26.0|Tony Point Rapid|II+|Plan your route at low water.
R|26.5|Divide Creek Rapid|II|
R|27.2|Double Drop|IV|Two drops after Jake Creek. At higher flows they merge into one big rapid; good recovery at low flow.
R|27.9|Wa-Poots (Grizzly Saddle)|III+|A steep bedrock chute at low flow; an S-turn with rocks on the outside corners.
R|28.2|The Ladle|IV+|The hardest rapid on the run at any flow. A complex boulder garden; scout from the trail on river right. A sneak route on the far left works for kayaks and canoes.
R|28.5|Little Niagara|IV-|Big hydraulics at higher flows; usually run down the right side, close to the cliff.
R|28.8|Puzzle Creek|III|A waterfall over a meter high, right of center.
R|29.0|No Slouch|III|
R|29.5|Miranda Jane|III|A Class II rapid comes first.
R|31.0|Meeker Rapid|III|Per the Forest Service map; location unconfirmed, about half a mile above Osprey.
R|31.5|Osprey|III|A steep drop among boulders.
R|34.6|Three Links Rapid|III|Per the Forest Service map; about 0.4 mile below the pack bridge.
R|37.7|Wolf Creek Rapid|IV|Scout from the trail or island. Rafts usually run the right tongue and ferry right; watch for laterals at higher flows and a ledge hole at the bottom at low flow.
R|40.4|Tee Kem Falls (Jims Creek Falls)|III+|Jims Creek's debris fan pushes the river to the right bank; follow the tongue right. Rated IV by American Whitewater.
R|40.8|Cupboard Rapid|III|Per the Forest Service map; may be easier at low flow.
R|42.5|Renshaw Rapid|III|A stiff drop along the left bank into a cliff.
R|47.9|Selway Falls|-|Not runnable. Selway Falls is a Class VI hazard just below the take-out, with massive boulders, surging boils and sieves. Take out at Race Creek and view it from the overlook on the road.

C|2.1|Bad Luck Bar|L|l|A large high-water camp. Bad Luck Creek enters on the right 0.3 mile downstream.
C|4.6|Waldo Bar|R|l|A large high-water camp with few trees.
C|5.0|Driftwood Bar|L|m|A medium camp at moderate flow.
C|6.6|Running Creek bridge camp|R|m|A camp before the trail bridge to a private ranch on the left. Often has horseflies.
C|6.7|Running Creek Flat|L|l|A large wooded high-water camp with no sandy beach; a swimming hole by the trail.
C|8.7|Archer|L|l|A large high-water camp with a sandy beach. North Star ranch (private) is across the river.
C|10.8|Goat Creek|L|s|A small high-water camp and lunch stop.
C|11.1|Pom Beach|R|s|A small low-water camp. Mile approximate.
C|11.8|Little Goat Creek|L|l|An excellent large camp at moderate flow, in a rapid, with a swimming hole below.
C|14.5|Cougar Flats|R|m|Near Ditch Creek and the private Selway Lodge.
C|15.6|White Trail Flats|R|l|A large high-water camp.
C|15.8|Mills Camp|L|l|A large high-water camp, 0.2 mile below White Trail Flats.
C|16.0|Bear Creek|R|s|A small low-water camp at the creek mouth.
C|16.5|Big Cedar (island camp)|L|l|A large high-water camp on the left; a medium low-water camp on the right. An island splits the river.
C|17.8|Black Sands|L|l|A large camp at moderate flow, with a cave and a swimming hole nearby.
C|18.5|Dead Elk|R|m|A medium low-water camp with a sandy beach and a swimming hole.
C|20.8|Rattlesnake Bar|R|m|A medium high-water camp with no swimming hole.
C|24.0|Roots|L|s|A small camp at moderate flow.
C|25.9|Tony Point bridge camp|R|m|A medium high-water camp above the suspension bridge; an emergency camp on the left below. A trail leads about a mile to the Moose Creek ranger station.
C|26.1|Tony Point|R|m|An excellent medium high-water camp with a sandy beach and a shallow swimming hole.
C|26.5|Divide Creek|L|m|A medium camp at moderate flow. Position approximate.
C|31.5|Meeker Creek|R|m|A good camp at moderate flow at the creek mouth.
C|31.6|Tango Bar|L|l|An excellent large camp at moderate flow with a big sandy beach and a swimming hole.
C|33.3|Trapper Camp (Marten Creek)|L|m|Marten Creek enters on the left; this camp is about 0.2 mile upstream.
C|35.9|Boulder Bar|R|s|0.3 mile above Dry Bar.
C|36.2|Dry Bar|R|m|A beautiful medium camp at moderate flow.
C|37.4|Upper Pinchot|R|m|A medium camp at moderate flow.
C|37.6|Lower Pinchot|R|l|A large high-water camp.
C|39.2|Ballinger|R|m|A medium high-water camp at the creek mouth.
C|40.4|Tee Kem|L|m|An excellent medium camp at moderate flow just below the falls, with a swimming hole.
C|40.8|Cupboard|R|m|A medium camp at moderate flow near Cupboard Creek.
C|42.4|Trapper Camp (lower)|L|?|Not on the Forest Service inventory; an alternative to Tee Kem or Renshaw.
C|42.5|Renshaw|R|m|A good camp below Renshaw Rapid with a sandy beach and a swimming hole. Not on the Forest Service inventory.

H|0.0|White Cap Creek guard station|L|1|About half a mile up White Cap Creek from the launch, with a nice campsite.
H|6.9|Running Creek swimming hole|L|1|Around the corner below the creek mouth.
H|13.7|Shearer guard station|L|1|A Forest Service station with a public airstrip upstream.
H|17.8|Black Sands cave|L|1|A cave and swimming hole near camp.
H|25.9|Moose Creek ranger station|R|2|About a mile on trail from the suspension bridge at Tony Point.

L|0.0|Paradise launch|1|Wooden boat ramp at 3,050 ft below the White Cap Creek confluence. Campground with 11 sites, vault toilets and a host who checks permits.
L|6.6|Running Creek bridge|0|A trail bridge to a private ranch; the first place below the launch to cross on foot.
L|13.7|Shearer|0|Forest Service guard station and airstrip.
L|14.5|Selway Lodge|1|Private lodge reached by a pack bridge; the river crossing at Ditch Creek.
L|24.1|Hell Creek|0|The start of continuous Class II+ rapids.
L|25.9|Tony Point suspension bridge|0|A trail to the Moose Creek ranger station.
L|26.2|Moose Creek confluence|0|The largest tributary; nearly doubles the flow and picks up the gradient to about 50 feet per mile. About 7 miles with no large camps follow.
L|34.6|Pack bridge|0|Three Links Creek enters right, Mink Creek left.
L|44.9|Wilderness boundary|0|Selway-Bitterroot Wilderness boundary.
L|46.7|Race Creek campground|1|On the right bank, reached by road.
L|47.7|Race Creek take-out|1|A boat ramp below the campground and above the bridge to Selway Falls. Selway Falls is just downstream.
`);

const permit = {
  status: 'Required May 15 to July 31 · one party per day · lottery',
  apply: { label: 'Apply on Recreation.gov', url: 'https://www.recreation.gov/permits/234624' },
  contact: { phone: '406-821-3269', web: 'https://www.fs.usda.gov/r01/bitterroot/permits/selway-river-four-rivers-lottery' },
  sections: [
    {
      name: 'How to get one',
      items: [
        { t: 'Apply', d: 'Apply online on Recreation.gov from December 1 to January 31. Hard copy applications are not accepted. The Selway is part of the Four Rivers lottery, with one application per lottery and one permit and launch reservation during the season.' },
        { t: 'Results', d: 'Results are emailed on February 14 and are viewable in your Recreation.gov profile.' },
        { t: 'Confirm', d: 'Accept your reservation by March 15. After confirming you receive regulations you must read in full.' },
        { t: 'Left over', d: 'Cancelled or unconfirmed dates are released March 16 at 8:00 a.m. Mountain, first come, first served. Late-season dates in mid to late July are easiest to get, but flows are often too low.' },
        { t: 'Pick up', d: 'Pick up the permit at the West Fork Ranger Station in Darby, Montana, up to 14 days before launch.' },
      ],
    },
    {
      name: 'Costs and limits',
      items: [
        { t: 'Fees', d: '$6 non-refundable application fee. No per-person recreation fee.' },
        { t: 'Season', d: 'The control season is May 15 to July 31. Pre-season trips must be off the river by 11:59 p.m. May 14; post-season trips cannot launch before August 1. No permit is required outside the control season.' },
        { t: 'Launches', d: 'One party of up to 16 people may launch each day in the control season. Outside it, groups are limited to 20 and there is no daily limit.' },
        { t: 'Who can hold one', d: 'The permit holder must be 18 by the launch date and is the responsible person. Private non-commercial floats only. Launch date and holder cannot be changed after issuance; group size, exit date and watercraft can be changed before issuance.' },
      ],
    },
    {
      name: 'Cancelling and penalties',
      items: [
        { t: 'Cancel early', d: 'Cancel on Recreation.gov at least 15 days before launch.' },
        { t: 'Penalty', d: 'A late cancellation or no-show bars you from holding a Selway permit for one year.' },
        { t: 'Waiver', d: 'The 15-day rule is waived if the river is above 5 feet at the Paradise gauge or snow blocks the road to Paradise, but you must still cancel.' },
      ],
    },
  ],
};

const rules = [
  {
    name: 'The permit',
    rules: [
      { t: 'Float only', d: 'The Four Rivers permit covers private, non-commercial floats. Outfitted trips follow separate authorizations.' },
      { t: 'Wilderness', d: 'The Selway runs through the Selway-Bitterroot Wilderness. Leave No Trace applies, with no motorized equipment and no mechanized travel.' },
      { t: 'Gauge', d: 'The Paradise gauge is the one that matters at the ramp. Rafts need about 0.9 ft to launch, kayaks 0.5 ft and inflatable kayaks 0.1 ft; above about 5 ft the river is dangerous.' },
    ],
  },
  {
    name: 'Camping and sanitation',
    rules: [
      { t: 'Camp choice', d: 'Camp at moderate-flow sites in normal water; at high flow use the ones marked high-water. After Moose Creek about 7 miles have no large camps, so plan your night before scouting the Ladle.' },
      { t: 'Human waste', d: 'Pack out solid waste in a washable, reusable toilet system. Giardia is a risk; filter or treat all drinking water.' },
      { t: 'Fires', d: 'Fire restrictions change through the season. Use a fire pan and burn only small dead wood. Check with the West Fork Ranger Station.' },
      { t: 'Bears and cougars', d: 'Store food and trash away from the boats and camp. Selway corridor is active bear country.' },
    ],
  },
  {
    name: 'Safety',
    rules: [
      { t: 'Scout', d: 'Scout the Ladle from the trail on river right. Wolf Creek is also scouted, from the trail or island.' },
      { t: 'Selway Falls', d: 'Do not float past the take-out. Selway Falls, less than half a mile below, is Class VI.' },
      { t: 'Water level', d: 'Late June is usually the most dependable. Peak melt in early June can be dangerous, and flows are often too low by mid-July. Flows can rise sharply overnight.' },
    ],
  },
];

const access = [
  { name: 'Darby, MT', road: true, hub: true, note: 'Shuttle base and the West Fork Ranger Station', grid: [3, 2] },
  { name: 'Lowell, ID', road: true, hub: true, note: 'Nearest town to the take-out', grid: [9, 2] },
  { name: 'Paradise', road: true, mile: 0, park: true, note: 'Launch. Campground with vault toilets and a permit host', grid: [2, 6] },
  { name: 'Race Creek', road: true, mile: 47.7, park: true, note: 'Take-out. Selway Falls is just below', grid: [10, 6] },
];
const roads = [
  { a: 'Darby, MT', b: 'Paradise', h: '' },
  { a: 'Lowell, ID', b: 'Race Creek', h: '' },
  { a: 'Darby, MT', b: 'Lowell, ID', h: '' },
];

write('selway', {
  name: 'Selway River',
  reach: 'Paradise to Race Creek',
  agency: 'USFS Bitterroot National Forest, West Fork Ranger District',
  miles: [0, 48],
  days: 5,
  coords: [46.0, -114.85],
  tz: 'America/Boise',
  note: 'The 48-mile Wild and Scenic Selway through the Selway-Bitterroot Wilderness. One of the hardest permits to draw in the country; the Ladle is its hardest rapid. Miles follow one river log and run a few tenths different from American Whitewater. Camp quality is not rated. Rapid classes at low water are the log authors\' estimates and may be harder than the Forest Service map shows. Compiled from public sources; verify with the West Fork Ranger Station and a current guidebook.',
  camps: d.camps,
  rapids: d.rapids,
  hikes: d.hikes,
  geology: [],
  guide: [],
  almanac: {},
  rules,
  landmarks: d.landmarks,
  clusters: [{ s: 26.2, e: 29.0, n: 'Moose Creek to Puzzle Creek' }],
  notes: {
    camp: '*Size: l = large, m = medium, s = small, from a river log. Quality is not rated. Camps marked high-water are usable in high flows.',
    hike: '*Difficulty is a rough estimate (1 = short, easy; 2 = a mile or so of trail).',
  },
  hdiff: { 1: 'Short, easy walk', 2: 'Easy trail', 3: 'Longer hike' },
  access,
  yardGrid: [5, 1],
  roads,
  permit,
});
