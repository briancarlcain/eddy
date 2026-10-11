const { parse, write } = require('./common.js');

// Miles from the El Vado Ranch put-in (0). Public sources name only a few rapids and camps on this run; the permit and rules are well documented.
const d = parse(`
R|10.21|Aragon Rapid|III|Can be scouted from the boat. Run a line left of center.
R|13.12|Dark Canyon Rapid|II+|One of the longer rapids on the Rio Chama.
R|14.00|Gypsum Rapid|-|Listed without a class or description.
R|29.10|Gauging Station rapid|-|Near the USGS gauge. A trip report mentions a rapid at the gauging station.

C|7.50|Chute the Moon|?|l|A lower bench for the kitchen and an upper bench that holds a large group. Reported by trip reports; mile is approximate.
C|13.10|Jurassic Park|?|?|A camp and lunch stop reached by a hike up Dark Canyon to dinosaur tracks. Mile is approximate.
C|16.50|Two Step|?|?|An upper bench for camping and the kitchen, with many trees for shade and shelter. Mile is approximate.

H|13.12|Dark Canyon|-|2|A hike up Dark Canyon from Jurassic Park camp to Allosaurus tracks.
H|26.81|Skull Bridge|-|1|The Continental Divide Trail crosses the river here. A possible access for a shorter day on the lower river.

L|0.00|El Vado Ranch put-in|1|River left. The main launch for multiday floats through the Chama Canyon Wilderness, just below El Vado Dam. Fee parking, cabins and a small store. Private launch fee.
L|21.50|Christ in the Desert Monastery|1|The monastery stands above the river just above Chavez Canyon. The wild upper river ends here.
L|21.71|Chavez Canyon boat launch|1|River left, off Forest Road 151, with limited parking and a vault toilet. Take-out of the wilderness run, and the put-in for a no-permit day run to Big Eddy.
L|22.57|Chama Campground|1|An alternate access for small craft. No ramp.
L|26.81|Skull Bridge|1|A Continental Divide Trail crossing and a possible access.
L|29.10|USGS gauge 08286500|0|The primary flow reference, Rio Chama above Abiquiu Reservoir.
L|30.32|Big Eddy take-out|1|River left, off Forest Road 151. Open year-round. A long diagonal shoal about half a mile above can cause hang-ups at low flow.
`);

const permit = {
  status: 'Required April 15 to Sept 15 · lottery for weekends',
  asOf: 'October 2026',
  apply: { label: 'Apply on Recreation.gov', url: 'https://www.recreation.gov/gateways/14575' },
  contact: { phone: '575-758-8851', email: 'blm_nm_tafo_admin@blm.gov', web: 'https://www.blm.gov/programs/recreation/permits-and-passes/lotteries-and-permit-systems/new-mexico/rio-chama-river' },
  sections: [
    {
      name: 'How to get one',
      items: [
        { t: 'Where it applies', d: 'An advance permit is required from April 15 to September 15 for launches at El Vado Ranch (the Wild portion, through Chavez Canyon). A day run from Chavez Canyon to Big Eddy needs no permit or fee, only a boater registration form at the launch.' },
        { t: 'Weekends: lottery', d: 'Friday and Saturday launches are assigned by lottery on Recreation.gov. Applications run December 1 to January 31. The lottery awards Friday launches, and winners may launch on Friday or Saturday. You can apply for each season separately.' },
        { t: 'Other days', d: 'Sunday through Thursday launches, and unclaimed weekend dates, open on Recreation.gov on April 1 at 8 a.m.' },
        { t: 'The two seasons', d: 'Early season runs April 15 to July 15. Release season runs July 16 to September 15.' },
        { t: 'Print the permit', d: 'You can print it 14 days before launch, and cannot change it afterward. Bring the permit and photo ID to the launch inspection.' },
        { t: 'Outside the season', d: 'Before April 15 and after September 15 no reservation is needed: fill out a self-permit envelope and pay at the put-in. Winter flows can be about 50 cfs, which is not boatable.' },
      ],
    },
    {
      name: 'Limits and costs',
      items: [
        { t: 'Launches per day', d: 'Reported by an aggregator: Fridays 6 (early) or 7 (release), Saturdays 6 or 4, Sunday and Monday 2 or 3, Tuesday and Wednesday 1 or 3, Thursday 1. Confirm on Recreation.gov.' },
        { t: 'Group size', d: 'Up to 16 people between El Vado Ranch and Chavez Canyon, with at most 2 dogs counted in the group. There is no group limit from Chavez Canyon to Big Eddy.' },
        { t: 'Eligibility', d: 'The permit holder must be at least 18 and present at the launch. One permit per person per season, and permits are not transferable. Private, non-commercial use only.' },
        { t: 'Fees', d: 'A $6 non-refundable lottery application fee and $5 per person per launch are reported. At least one person\'s fee must be paid to accept a lottery award. Cooper\'s El Vado Ranch charges its own per-person launch fee and a parking fee.' },
        { t: 'Cancellation', d: 'Cancel 14 or more days before launch for a refund of the recreation fee (less the $6). There is no refund inside 13 days. Cancel at least 5 days before launch to avoid a no-show penalty. Dates cannot be changed; cancel and rebook.' },
        { t: 'Penalty', d: 'Permit violations may bring a 3-year suspension.' },
      ],
    },
    {
      name: 'Flows',
      items: [
        { t: 'Recommended minimums', d: 'About 300 cfs for kayaks, canoes and rafts under 12 ft. Small rafts 300 to 400. Rafts over 12 ft need about 500 cfs. A canoe or kayak can get through to Chavez Canyon at 200 cfs.' },
        { t: 'What to expect', d: 'Flows come from El Vado Dam and are not guaranteed. Release-season weekends are augmented to about 500 cfs; weekdays can be as low as 80 to 100 cfs.' },
      ],
    },
  ],
};

const rules = [
  {
    name: 'Required equipment',
    rules: [
      { t: 'Life jackets', d: 'A Coast Guard approved Type I, III or V life jacket for every person, plus one spare per group.' },
      { t: 'Bailing and rope', d: 'A bailing device on each non-self-bailing craft, and a throw line of at least 50 ft on each boat over 10 ft. A rope at least as long as the boat.' },
      { t: 'Repair and first aid', d: 'A first-aid kit, patching and repair equipment, and an air pump for inflatables.' },
      { t: 'Fire pan', d: 'All fires must be in a fire pan with 2-inch sides and at least 12 inches across. Carry out all ashes and coals. Lightweight stoves have much less impact.' },
      { t: 'Toilet', d: 'Solid human waste must be carried out in a washable, reusable container. Plastic bags are not allowed, except bag systems for very small groups. Strain liquid kitchen waste into the river. Empty your toilet at an RV dump station (Espanola, Santa Fe, Taos or Durango).' },
    ],
  },
  {
    name: 'On the river',
    rules: [
      { t: 'Dogs', d: 'Dogs must be leashed and under control at all times, and their waste carried out.' },
      { t: 'Camping and fire', d: 'Choose an established site, stay on durable surfaces, and keep pollutants out of the water. Collect only dead and down wood.' },
      { t: 'Facilities', d: 'There are no facilities on the river. Restrooms and drinking water are at El Vado Ranch only.' },
      { t: 'Roads', d: 'Forest Road 151 to Chavez Canyon and Big Eddy is dirt and can be impassable when wet.' },
      { t: 'Shuttle', d: 'About 50 miles each way. Up the Creek Shuttle Service: 505-490-2052.' },
    ],
  },
];

const access = [
  { name: 'Abiquiu', road: true, hub: true, note: 'Nearest town to the take-out', grid: [10, 2] },
  { name: 'Tierra Amarilla', road: true, hub: true, note: 'Nearest town to the put-in; El Vado Ranch is off NM 112', grid: [1, 2] },
  { name: 'El Vado Ranch', road: true, mile: 0, park: true, note: 'Put-in. Private launch and parking fees', grid: [1, 6] },
  { name: 'Chavez Canyon', road: true, mile: 21.71, park: true, note: 'River left. Limited parking, vault toilet; FR 151', grid: [7, 6] },
  { name: 'Big Eddy', road: true, mile: 30.32, park: true, note: 'Take-out. FR 151; dirt, impassable when wet', grid: [10, 6] },
];
const roads = [
  { a: 'Tierra Amarilla', b: 'El Vado Ranch', h: '' },
  { a: 'Abiquiu', b: 'Big Eddy', h: '' },
  { a: 'Abiquiu', b: 'Chavez Canyon', h: '' },
  { a: 'Tierra Amarilla', b: 'Abiquiu', h: '' },
  { a: 'Outfitter', b: 'Tierra Amarilla', h: '' },
];

write('rio-chama', {
  name: 'Rio Chama',
  reach: 'El Vado Ranch to Big Eddy',
  agency: 'Bureau of Land Management, Taos Field Office, with the Santa Fe National Forest',
  miles: [0, 30.4],
  days: 3,
  coords: [36.4, -106.6],
  tz: 'America/Denver',
  note: 'About 31 miles of Class II-III through the Chama Canyon Wilderness: 22.5 miles from El Vado Ranch to Chavez Canyon (the permitted wilderness run) and 8.5 more to Big Eddy. Mile numbers are from the put-in. Public sources name only three rapids and three camps, with approximate miles; a mile-by-mile guidebook (such as RiverMaps) has much more. Flows depend on releases from El Vado Dam. Compiled from public sources; verify with the BLM.',
  camps: d.camps,
  rapids: d.rapids,
  hikes: d.hikes,
  geology: [],
  guide: [],
  almanac: {
    history: [
      ['Wild and Scenic', 'Congress designated the Rio Chama a Wild and Scenic River in 1988. The first 24.6 miles from El Vado are designated; the lower section is a study river.'],
      ['The canyon', 'The river runs through a multi-colored sandstone canyon up to 1,500 feet deep, with heavily wooded side canyons, historic sites and dinosaur tracks.'],
    ],
  },
  rules,
  landmarks: d.landmarks,
  clusters: [{ s: 0, e: 21.7, n: 'Chama Canyon Wilderness' }],
  notes: {
    camp: '*Only three camps are named in public sources, with approximate miles. Quality and size are mostly not given.',
    hike: '*Difficulty is a rough estimate (1 = short, easy walk; 2 = easy trail). Times are not given.',
  },
  hdiff: { 1: 'Short, easy walk', 2: 'Easy trail' },
  access,
  yardGrid: [5, 1],
  roads,
  permit,
});
