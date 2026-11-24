// Which app login (trip member) is each crew person: their saved link first, then the same name.
// The newest login with a name wins, so signing in again replaces an old device's login.
const key = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function linkMembers(crew = [], members = []) {
  const ids = new Set(members.map((m) => m.id));
  const byCrew = {};
  const used = new Set();
  crew.forEach((c) => {
    if (c.m && ids.has(c.m) && !used.has(c.m)) {
      byCrew[c.id] = c.m;
      used.add(c.m);
    }
  });
  const newest = [...members].sort((a, b) => String(b.t || '').localeCompare(String(a.t || '')));
  crew.forEach((c) => {
    if (byCrew[c.id] || !key(c.name)) return;
    const m = newest.find((x) => !used.has(x.id) && key(x.n) === key(c.name));
    if (m) {
      byCrew[c.id] = m.id;
      used.add(m.id);
    }
  });
  return { byCrew, loose: members.filter((m) => !used.has(m.id)) };
}
