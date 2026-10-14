// Preliminary entries for permitted rivers on the American Whitewater permit
// list (https://www.americanwhitewater.org/content/River/list-permits).
// Each has only the reach, a put-in and take-out, and the AW permit text.
// Mileage and coordinates are approximate and unverified. Replace each entry
// with a full generator (see smith.json / westwater.js) once sourced.
const fs = require('fs');
const NOTE = 'Preliminary entry: reach, access points and permit rules only. Mileage and map position are approximate; confirm against the managing agency.';
const AW = 'American Whitewater permit list';

const R = [
  { id: 'alsek', name: 'Alsek River', state: 'Alaska', reach: 'Haines Junction to Dry Bay', agency: 'Parks Canada / NPS Glacier Bay', miles: [0, 260], coords: [59.9, -138.0], tz: 'America/Anchorage',
    put: 'Haines Junction', take: 'Dry Bay',
    status: 'Required · waitlist application', items: [['Apply', 'Send in an application to get on the waitlist for your preferred dates.']] },
  { id: 'tatshenshini', name: 'Tatshenshini River', state: 'Alaska', reach: 'Dalton Post to Dry Bay (Alsek)', agency: 'BC Parks / Parks Canada / NPS Glacier Bay', miles: [0, 140], coords: [59.2, -137.3], tz: 'America/Anchorage',
    put: 'Dalton Post', take: 'Dry Bay (Alsek)',
    status: 'Required · waitlist application', items: [['Apply', 'Send in an application to get on the waitlist for your preferred dates.']] },
  { id: 'bruneau-jarbidge', name: 'Bruneau and Jarbidge Rivers', state: 'Idaho', reach: 'Jarbidge Forks to 8 miles south of Bruneau (via Indian Hot Springs)', agency: 'BLM Boise District', miles: [0, 80], coords: [42.5, -115.7], tz: 'America/Boise',
    put: 'Jarbidge Forks', take: '8 miles south of Bruneau', mid: ['Indian Hot Springs', 40],
    status: 'Required · free, self-issued', items: [['Self-issue permit', 'Download a self-issue permit from the BLM website, or fill one out at the self-registration stations at the put-in and take-out. This covers both the Jarbidge (Jarbidge Forks to Indian Hot Springs) and the Bruneau (Indian Hot Springs to 8 miles south of Bruneau).']] },
  { id: 'deschutes', name: 'Deschutes River', state: 'Oregon', reach: 'US 26 (Warm Springs) to the Columbia River', agency: 'BLM Prineville / Oregon State Parks', miles: [0, 100], coords: [45.2, -121.0], tz: 'America/Los_Angeles',
    put: 'US 26 (Warm Springs)', take: 'Columbia River', mid: ["Sherar's Falls", 57],
    status: 'Required · boater pass, online reservation', items: [['Boater pass', 'Buy a boater pass through the online reservation system. Launches are distributed on a rolling basis.'], ['Sections', 'The pass applies to Warm Springs to Sherar\'s Falls and Sherar\'s Falls to the Columbia River.']] },
  { id: 'john-day', name: 'John Day River', state: 'Oregon', reach: 'Service Creek to Cottonwood (via Clarno)', agency: 'BLM Prineville', miles: [0, 125], coords: [44.9, -120.4], tz: 'America/Los_Angeles',
    put: 'Service Creek', take: 'Cottonwood', mid: ['Clarno', 53],
    status: 'Required year-round · Recreation.gov, rolling four-month release', items: [['Online permit', 'A permit is required year-round from Recreation.gov. Reservations are distributed on a rolling four-month basis.']] },
  { id: 'owyhee', name: 'Owyhee River', state: 'Oregon', reach: "Crutcher's Crossing to Birch Creek or Leslie Gulch (via Three Forks and Rome)", agency: 'BLM Vale / Idaho / Oregon', miles: [0, 120], coords: [43.0, -117.5], tz: 'America/Boise',
    put: "Crutcher's Crossing", take: 'Birch Creek or Leslie Gulch', mid: ['Three Forks', 26], mid2: ['Rome', 66],
    status: 'Required · free, self-issued', items: [['Self-issue permit', 'Download a self-issue permit from the BLM website. It covers Crutcher\'s Crossing to Three Forks, Three Forks to Rome, and Rome to Birch Creek or Leslie Gulch.']] },
  { id: 'green-labyrinth', name: 'Green River: Labyrinth and Stillwater', state: 'Utah', reach: 'Green River town to the Colorado confluence', agency: 'NPS Canyonlands / BLM Moab', miles: [0, 120], coords: [38.6, -110.0], tz: 'America/Denver',
    put: 'Green River town', take: 'Colorado confluence',
    status: 'Required for overnight trips · reserve online', items: [['Overnight permits', 'Permits are required year-round for all overnight river trips and are available by reservation. Launch dates from mid April to mid October are released the December before; mid October to mid April the June before.']] },
  { id: 'dolores', name: 'Dolores River', state: 'Colorado', reach: 'Gateway to the Colorado River (Utah)', agency: 'BLM Grand Junction / Moab', miles: [0, 35], coords: [38.7, -109.0], tz: 'America/Denver',
    put: 'Gateway', take: 'Colorado River confluence',
    status: 'Required year-round · available from January 1', items: [['Permits', 'Permits are required year-round and become available starting January 1 for that year.']] },
];

for (const r of R) {
  const pt = (n, mile, note) => ({ name: n, road: true, mile, park: true, note });
  const access = [pt(r.put, 0, 'Put-in')];
  if (r.mid) access.push(pt(r.mid[0], r.mid[1], 'Access'));
  if (r.mid2) access.push(pt(r.mid2[0], r.mid2[1], 'Access'));
  access.push(pt(r.take, r.miles[1], 'Take-out'));
  const out = {
    name: r.name, state: r.state, reach: r.reach, agency: r.agency, miles: r.miles, coords: r.coords, tz: r.tz,
    note: NOTE, access,
    permit: { status: r.status, sections: [{ name: 'Rules', items: r.items.map(([t, d]) => ({ t, d })) }], source: AW },
    notes: { camp: '', hike: '' },
  };
  fs.writeFileSync(`data/rivers/${r.id}.json`, JSON.stringify(out, null, 2) + '\n');
}
console.log(R.map((r) => r.id).join(' '));
