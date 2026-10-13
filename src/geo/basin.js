// Pure helpers for the Basin map data (data/basin/<river>.json, written by scripts/basin/build.py).
export const PREC = 1e4;

// delta-encoded polyline (see enc() in build.py): [[lat, lon], ...]
export function dec(s) {
  const out = [];
  let i = 0, la = 0, lo = 0;
  while (i < s.length) {
    let r = 0, sh = 0, b;
    do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
    la += r & 1 ? ~(r >> 1) : r >> 1;
    r = 0; sh = 0;
    do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
    lo += r & 1 ? ~(r >> 1) : r >> 1;
    out.push([la / PREC, lo / PREC]);
  }
  return out;
}

export const sqmi = (km2) => km2 / 2.589988;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const area = (km2) => (km2 >= 10 ? `${fmt(sqmi(km2))} sq mi (${fmt(km2)} km²)` : `${sqmi(km2).toFixed(1)} sq mi (${km2.toFixed(1)} km²)`);
// a basin's area to three figures: it comes from whole watershed units, so more digits would claim too much
export const approx = (km2) => {
  const r = (n) => { const m = 10 ** (Math.floor(Math.log10(n)) - 2); return Math.round(n / m) * m; };
  return km2 >= 100 ? `${fmt(r(sqmi(km2)))} sq mi (${fmt(r(km2))} km²)` : area(km2);
};
