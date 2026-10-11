const { parse, write } = require('./common.js');

// Miles from Meral's Pool (0) to Ward's Ferry Bridge (18).
const d = parse(`
R|0.1|Rock Garden|IV|A boulder slalom, hardest at low water, where rafts usually have to cross from right to left part way down. Rafts often hang up or wrap. Scout right. A dangerous reversal forms at the bottom at very high flows; a sneak runs right.
R|0.4|Nemesis|IV|A long, multi-level rapid with boulders called the Jacks, just past a sharp left bend. At low flow run left of the obstacle; a cheat line far right opens above about 3,000 cfs. Rafts often wrap above the chute.
R|0.8|Sunderland's Chute|IV+|A chute at the end of a short pool with a sharp right turn. A large rock guards the right, which becomes a hole at higher flows. Enter right at low and moderate flows, then ferry left. Scouting from the right means boulder climbing and poison oak.
R|1.0|Hackamack Hole|IV|A sharp drop split by two big rocks. At high flows they form a river-wide reversal.
R|1.5|Ram's Head|IV|A left bend and rocky drop with a boulder plugging the exit. A powerful spouting hole forms at medium and high flows and the rapid becomes Class V above 3,500 cfs. Good recovery pool below.
R|1.9|India|IV|A short chute ending in a sharp drop plugged by big rocks, which become river-wide holes at high water. Named for kayaker India Fleming.
R|2.1|Lower India (Phil's Folly)|IV|A second short chute with blind exits. Rafts are limited to one or two channels at low flows.
R|4.2|Ugly-Easy|III|A big hole on the left and an easy tongue on the right.
R|4.4|Stern|IV|Boulders block the river at low flow, forcing rafts through a narrow chute between the left wall and a van-sized rock. Avoid being turned sideways. A center route is better at high flow.
R|4.7|Evangelist|IV|A right bend into a series of short drops with a big rock and hole right of center. The low-water route is left of it. Wraps are common.
R|5.2|Airborne (Bent Thole Pin)|IV|A steep falls; the left side is gentler. The name comes from a rock wall that jams oars.
R|5.4|Clavey Falls|V|The biggest rapid on the run, a two-drop staircase just past the Clavey confluence after a sharp left turn. The first is an eight-foot vertical that pushes boats into the left wall; the second has a boat-eating hole across the left half. Dinosaur Rock at the bottom is the main hazard and flip risk grows above about 2,000 cfs. Rafts above 3,000 cfs usually go left. Portage on the right; an emergency trail leaves from the left above the Clavey. Fatalities have occurred here.
R|5.6|Son of Clavey|IV|Steep drops over rocks; the rapids taper to Class II afterward.
R|6.7|Wrap King (Little Niagara)|IV|A steep drop beside boulders with a wrap hazard at low water.
R|9.5|Gray's Grindstone|IV|A long pool ends at boulders blocking the left, starting a maze of about a thousand yards. Zigzag at low flow, a big right-side hole at about 2,500 cfs, and flip risk for rafts above 4,000. Fatalities have occurred here.
R|10.5|Surf City|III+|Big waves.
R|11.0|Thread the Needle|IV|Rocks block most of the river. Even at low flow take the Chicken Shot on the left rather than threading the center rocks.
R|11.8|Steamboat|IV|A boulder bar leads into a big hole that often flips rafts at high water. Usually sneak left; a surf spot for rafts at summer flows.
R|12.6|Cabin|IV|Big Humbug Creek enters on the left. A right bend into a curving chute with a big rock and hole just below the entrance. Ferry left after the boulder bar.
R|12.9|Hell's Kitchen|IV|A wide chute nearly blocked by a boulder jumble from river right, with a runnable slalom down the left made tighter by a snag. Wraps are common at the second or third slalom. Use the left side above 5,000 cfs.
R|16.8|Matterhorn|III|A series of rapids visible when the reservoir is low, named for a rock resembling a small Matterhorn.
R|17.6|Pinball|IV|Appears only when New Don Pedro Reservoir is low. When exposed, boaters must find a route over a river-wide ledge guarded by a jumbled boulder fence.

C|0.0|Lumsden Campground|L|m|Near the put-in, with vault toilets and picnic tables.
C|3.3|Tin Can Cabin|L|s|On river left. Fishermen reach it by a steep trail from Lumsden Road.
C|5.4|Clavey Falls camps|-|s|Small campsites on both banks, with a trail from the left bank down and out of the canyon.
C|7.5|Powerhouse|R|l|A large sandy beach at the site of an old miners' powerhouse destroyed by flood in 1937.
C|7.9|Grapevine|L|m|Downstream of Grapevine Creek, which enters on the right.
C|8.3|Indian Creek|R|l|A large campsite across from the creek. The beach was reduced by the 1997 flood.
C|11.4|Driftwood camps|L|m|Two camps on the left with sandy beaches and oak shade.
C|12.8|Big Creek|-|l|A large unshaded camp where Big Creek enters on the left, with Indian mortar holes near the mouth.
C|15.1|North Fork Tuolumne|-|l|Good campsites on both sides of the creek, some reserved for outfitters.

H|5.9|Ferretti Road trail|L|3|A trail above Clavey Falls on the left bank climbing out of the canyon to Ferretti Road.
H|8.2|Abandoned mine shaft|L|1|A hard-rock mine shaft on the left.
H|12.2|Quartz mines|L|2|Mine shafts on both banks abandoned around 1909, with a large steam engine on river right. A trail leaves the canyon from river left.
H|12.8|Big Creek waterfall|L|1|A short hike upstream to a waterfall.
H|14.4|Mohican and Mary Ellen mines|L|3|A tattered suspension bridge marks the abandoned quartz mines with old mining equipment including a stamp mill. The Mohican Trail leads to Groveland.
H|15.1|North Fork waterfalls|R|2|About a mile up the tributary to waterfalls and the old Devil's Gate bridge site.

L|0.0|Meral's Pool|1|Put-in with two good sites on the left bank. A flow gauge sits at the water's edge with a conversion chart above it.
L|5.4|Clavey River|0|Enters from the right at the end of a long pool, just above Clavey Falls.
L|7.9|Grapevine Creek|0|Enters from the right.
L|8.3|Indian Creek|0|Enters from the left. An old road climbs out just downstream.
L|12.6|Big Humbug Creek|0|Enters from the left.
L|14.4|Mohican Mine|0|Abandoned quartz mine and stamp mill.
L|15.1|North Fork Tuolumne|0|Enters from the right.
L|15.8|Don Pedro high-water mark|0|The New Don Pedro Reservoir high-water line. More whitewater appears when the reservoir is low.
L|16.5|Turnback Creek|0|Enters from the right. The site of a gold rush in 1856.
L|18.0|Ward's Ferry Bridge|1|Take-out. A steep, slippery carry; rafts use a winch to lift boats to the deck.
`);

const permit = {
  status: 'Required May 1 to Oct 15 from 2027 · reserved on Recreation.gov',
  asOf: 'October 2026',
  apply: { label: 'Reserve on Recreation.gov', url: 'https://www.recreation.gov/permits/621750' },
  contact: { phone: '209-962-7825', web: 'https://www.fs.usda.gov/r05/stanislaus' },
  sections: [
    {
      name: 'How to get one',
      items: [
        { t: 'Reserve', d: 'Reservations are online only at Recreation.gov. Booking opens January 1 and is first come, first served, closing at midnight the day before launch.' },
        { t: 'Scope', d: 'Permits cover launches from May 1 to October 15, from below Holm and Kirkwood Powerhouses to the Don Pedro Reservoir high-water mark. A permit covers one to three days on the Main Tuolumne.' },
        { t: 'Rafting permits', d: 'Rafting permits were not required during the 2026 season because of road repairs. They return in 2027.' },
        { t: 'Carry', d: 'Carry the permit, front and back, or an electronic copy showing both sides. Cell service is limited.' },
      ],
    },
    {
      name: 'Costs and limits',
      items: [
        { t: 'Fees', d: '$6 non-refundable reservation fee per reservation, plus a recreation fee of $2 per person per trip. The fee is approved to rise to $5 in 2027 and $10 in 2028.' },
        { t: 'Group size', d: 'Up to 26 people per trip. A person may hold no more than four launch-date reservations at once.' },
      ],
    },
    {
      name: 'Cancelling',
      items: [
        { t: 'Refund', d: 'Recreation fees are refundable if you cancel 7 or more days before launch. Reservation fees are not.' },
        { t: 'Changes', d: 'Changes seven or more days before launch, adding or reducing people, are allowed subject to availability. Changing the start date means cancelling and rebooking.' },
        { t: 'No-shows', d: 'A no-show can cancel all your future reservations for that season.' },
      ],
    },
  ],
};

const rules = [
  {
    name: 'Required equipment',
    rules: [
      { t: 'Life jackets', d: 'A Coast Guard approved Type I, II, III or V life jacket worn at all times, plus one extra per boat; two extra for groups of two or more boats. Helmets are required for all kayakers.' },
      { t: 'Each boat', d: 'An extra oar or paddle, a throw line, 20 feet of mooring line and a coil of at least 100 feet of extra line.' },
      { t: 'Kits', d: 'A first aid kit, a repair kit, and one air pump per inflatable boat.' },
      { t: 'Toilets', d: 'Portable toilets or disposable travel toilet bags are required on all trips, including kayaks. Waste must be carried out.' },
    ],
  },
  {
    name: 'Camping',
    rules: [
      { t: 'Fires', d: 'Fires are allowed only in fire pans, with all ash and charcoal carried out. During fire restrictions only portable gas, jellied petroleum or pressurized liquid stoves are allowed.' },
      { t: 'Trash and water', d: 'Pack out all trash, including burnables. Strain liquid waste into sump holes dug away from camp and above the high-water line. Boil or treat surface water.' },
    ],
  },
  {
    name: 'Flows',
    rules: [
      { t: 'Releases', d: 'Summer dam releases run about 900 to 1,300 cfs. Flows are minimized to 150 to 400 cfs every other Wednesday. Call the ranger district for the schedule.' },
      { t: 'Reservoir', d: 'Pinball and Matterhorn appear only when New Don Pedro Reservoir is low. When Wards Ferry Road is closed the only exit is a tow to Moccasin Point Marina.' },
      { t: 'Scouting', d: 'Scout rapids before running them, since conditions change.' },
    ],
  },
];

const access = [
  { name: 'Groveland', road: true, hub: true, note: 'Nearest town; Groveland Ranger District', grid: [3, 2] },
  { name: 'Sonora', road: true, hub: true, note: 'Alternate route to the take-out', grid: [9, 2] },
  { name: "Meral's Pool", road: true, mile: 0, park: true, note: 'Put-in. Five miles of one-lane dirt road down Lumsden Road', grid: [2, 6] },
  { name: "Ward's Ferry", road: true, mile: 18, park: true, note: 'Take-out. Steep, single-lane road', grid: [10, 6] },
];
const roads = [
  { a: 'Groveland', b: "Meral's Pool", h: '' },
  { a: 'Groveland', b: "Ward's Ferry", h: '' },
  { a: 'Sonora', b: "Ward's Ferry", h: '' },
];

write('tuolumne', {
  name: 'Tuolumne River',
  reach: "Meral's Pool to Ward's Ferry",
  agency: 'USFS Stanislaus National Forest, Groveland Ranger District',
  miles: [0, 18],
  days: 2,
  coords: [37.85, -120.4],
  tz: 'America/Los_Angeles',
  camps: d.camps,
  rapids: d.rapids,
  hikes: d.hikes,
  geology: [],
  guide: [],
  almanac: {},
  rules,
  landmarks: d.landmarks,
  clusters: [{ s: 0, e: 2.2, n: "Meral's Pool rapids" }],
  hdiff: { 1: 'Short, easy walk', 2: 'Easy trail', 3: 'Longer hike' },
  access,
  yardGrid: [5, 1],
  roads,
  permit,
});
