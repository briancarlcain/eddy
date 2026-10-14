// Colour themes. The app shell uses the "snow" palette (a pale, cool tint of the logo's blues);
// each built-in river has its own palette inspired by the place. Risk and safety colours are
// NOT themed: a river's mood must never change what red or amber means.
//   a = accent (links, active tab, buttons)   t = tint (page and fill background)   s = secondary
export const APP_PALETTE = { a: '#1f6c9f', t: '#e8f2f8', s: '#2f6b45' };

const DESERT = { a: '#9a4a28', t: '#f3ebd9', s: '#3f7d73' };

export const RIVER_PALETTES = {
  // Colorado Plateau, unchanged from the original sandstone palette
  'grand-canyon': DESERT,
  'cataract-canyon': DESERT,
  'desolation-gray': DESERT,
  'green-labyrinth': DESERT,
  // other desert and canyon country
  westwater: { a: '#7a3b3b', t: '#f1e6e2', s: '#4a4a52' },
  'san-juan': { a: '#b4561f', t: '#f8e8d4', s: '#7a5a3a' },
  lodore: { a: '#8a3f2e', t: '#eef0dc', s: '#4f6b3d' },
  yampa: { a: '#a8661a', t: '#f6efd2', s: '#5d7a3a' },
  dolores: { a: '#96502a', t: '#f4ecdc', s: '#6a7f4a' },
  'ruby-horsethief': { a: '#a2432c', t: '#f5ebdd', s: '#c9a640' },
  'rio-chama': { a: '#a85a46', t: '#f6e7df', s: '#3c8a8a' },
  salt: { a: '#3f6b3a', t: '#f7eddb', s: '#c9533a' },
  owyhee: { a: '#9a5a52', t: '#f2e8e4', s: '#7a8a62' },
  'john-day': { a: '#a6402f', t: '#f7e9d0', s: '#c88a2a' },
  'bruneau-jarbidge': { a: '#566b4a', t: '#eef0e6', s: '#5d646b' },
  // forests, granite, glaciers
  rogue: { a: '#1f6b4f', t: '#e8f3ec', s: '#4aa37a' },
  illinois: { a: '#137a6c', t: '#e3f4f0', s: '#7fc8b4' },
  smith: { a: '#6f6a2c', t: '#f3f1de', s: '#b8a45a' },
  deschutes: { a: '#3f5f78', t: '#eef1f2', s: '#c79a3b' },
  'main-salmon': { a: '#2d6a7a', t: '#eef4f2', s: '#d1b377' },
  'middle-fork-salmon': { a: '#1c6f8f', t: '#e6f1f5', s: '#d8c9a0' },
  selway: { a: '#3c5f3a', t: '#ebf1e6', s: '#8a7a4a' },
  'hells-canyon': { a: '#7f5f0f', t: '#f6f0d6', s: '#4e6a8a' },
  'green-flaming-gorge': { a: '#2f6b4a', t: '#f3ecdf', s: '#b5472a' },
  tuolumne: { a: '#5f6b7a', t: '#f1f2f3', s: '#8fb6d9' },
  tatshenshini: { a: '#2f5f55', t: '#e4f3f2', s: '#6cc3c9' },
  alsek: { a: '#5a6f78', t: '#eef1f2', s: '#c2527a' },
};

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
// mix(a, b, k): k of the way from a to b
const mix = (a, b, k) => {
  const x = hex(a);
  const y = hex(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * k));
};
const hue = (h) => {
  const [r, g, b] = hex(h).map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx === mn) return 0;
  const d = mx - mn;
  const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round(((hh * 60) + 360) % 360);
};

export function themeVars(p) {
  const h = hue(p.a);
  const bg = mix(p.t, '#ffffff', 0.55);
  const card = mix(p.t, '#ffffff', 0.85);
  const ink = `hsl(${h}, 30%, 11%)`;
  const rgb = hex(bg).join(', ');
  return {
    '--accent': p.a,
    '--accent-soft': mix(p.a, '#ffffff', 0.86),
    '--accent-line': mix(p.a, '#ffffff', 0.55),
    '--secondary': p.s,
    '--teal': p.s,
    '--river': p.s,
    '--bg': bg,
    '--glass': `rgba(${rgb}, .92)`,
    '--card': card,
    '--surface': card,
    '--surface-2': card,
    '--surface-3': p.t,
    '--ink': ink,
    '--ink-dim': `hsl(${h}, 16%, 32%)`,
    '--ink-faint': `hsl(${h}, 11%, 42%)`,
    '--line': `hsla(${h}, 30%, 20%, .13)`,
    '--line-soft': `hsla(${h}, 30%, 20%, .09)`,
    '--control-line': `hsla(${h}, 30%, 20%, .22)`,
  };
}

export function applyTheme(riverId) {
  const p = (riverId && RIVER_PALETTES[riverId]) || APP_PALETTE;
  const vars = themeVars(p);
  const root = document.documentElement;
  for (const k in vars) root.style.setProperty(k, vars[k]);
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.setAttribute('content', vars['--bg']);
}

// Style for a river's card in the Rivers list: its own tint, a secondary-colour edge and an accent title.
export function riverCardStyle(riverId) {
  const p = RIVER_PALETTES[riverId];
  if (!p) return undefined;
  const v = themeVars(p);
  return {
    background: `linear-gradient(90deg, ${p.s} 0 5px, transparent 5px), ${mix(p.t, '#ffffff', 0.45)}`,
    boxShadow: `0 0 0 1px ${v['--accent-line']}, 0 1px 2px rgba(30, 24, 16, .06)`,
    '--accent': p.a,
    '--ink': v['--ink'],
    '--ink-dim': v['--ink-dim'],
    '--ink-faint': v['--ink-faint'],
  };
}
