// River Essentials was split into clearer categories; this moves old copies of a trip over.
const BR = 'Boats & Rigging', PD = 'Permits & Documents';
const RULES = [
  [/sun ?screen|chapstick/i, 'Safety'],
  [/baby powder/i, 'Bathroom'],
  [/lighter|match|tape & sharpie|koozie|solar panel/i, 'Camp'],
  [/dry bag|oar|raft|pump|rear deck|side box|repair kit|paddle|kayak|packraft|foot brace|cargo cover|grips|wd-40/i, BR],
  [/stakes/i, 'Sleep'],
  [/regulation|permit|entrance fee|park service|photo id|river map/i, PD],
];
export const recat = (g) => (g && g.c === 'River Essentials' ? (RULES.find(([re]) => re.test(g.n || '')) || [])[1] || g.c : g && g.c);
