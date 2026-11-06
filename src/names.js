// How a crew member is named where only a short name fits:
// a first name nobody else shares stays "Jane"; shared first names get a last initial ("Brian C.");
// if that initial is shared too, the full name is used.
const parts = (name) => String(name || '').trim().split(/\s+/).filter(Boolean);

export function shortNames(crew) {
  const key = (c) => (parts(c.name)[0] || '').toLowerCase();
  const init = (c) => {
    const p = parts(c.name);
    return p.length > 1 ? p[p.length - 1][0].toUpperCase() : '';
  };
  const out = {};
  (crew || []).forEach((c) => {
    const p = parts(c.name);
    if (!p.length) return (out[c.id] = '');
    const same = crew.filter((x) => key(x) === key(c));
    if (same.length < 2) return (out[c.id] = p[0]);
    const i = init(c);
    if (!i) return (out[c.id] = p[0]);
    out[c.id] = same.filter((x) => init(x) === i).length > 1 ? p.join(' ') : `${p[0]} ${i}.`;
  });
  return out;
}

export const shortOf = (crew, id) => shortNames(crew)[id] || '';
