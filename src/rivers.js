// River library. Built-in rivers ship in data/rivers/*.json; rivers added or
// edited in the app live in the store (state.rivers) and win over built-ins.
import grandCanyon from '../data/rivers/grand-canyon.json';
import smith from '../data/rivers/smith.json';
import rogue from '../data/rivers/rogue.json';
import mainSalmon from '../data/rivers/main-salmon.json';
import yampa from '../data/rivers/yampa.json';
import middleForkSalmon from '../data/rivers/middle-fork-salmon.json';
import sanJuan from '../data/rivers/san-juan.json';
import rioChama from '../data/rivers/rio-chama.json';
import cataractCanyon from '../data/rivers/cataract-canyon.json';
import desolationGray from '../data/rivers/desolation-gray.json';
import lodore from '../data/rivers/lodore.json';
import hellsCanyon from '../data/rivers/hells-canyon.json';
import rubyHorsethief from '../data/rivers/ruby-horsethief.json';
import selway from '../data/rivers/selway.json';
import greenFlamingGorge from '../data/rivers/green-flaming-gorge.json';
import westwater from '../data/rivers/westwater.json';
import illinois from '../data/rivers/illinois.json';
import tuolumne from '../data/rivers/tuolumne.json';
import salt from '../data/rivers/salt.json';
import alsek from '../data/rivers/alsek.json';
import tatshenshini from '../data/rivers/tatshenshini.json';
import bruneauJarbidge from '../data/rivers/bruneau-jarbidge.json';
import deschutes from '../data/rivers/deschutes.json';
import johnDay from '../data/rivers/john-day.json';
import owyhee from '../data/rivers/owyhee.json';
import greenLabyrinth from '../data/rivers/green-labyrinth.json';
import dolores from '../data/rivers/dolores.json';

export const DEFAULT_RIVER = 'grand-canyon';

export const BUILTIN_RIVERS = {
  'grand-canyon': { id: 'grand-canyon', days: 19, ...grandCanyon },
  smith: { id: 'smith', ...smith },
  rogue: { id: 'rogue', ...rogue },
  'main-salmon': { id: 'main-salmon', ...mainSalmon },
  yampa: { id: 'yampa', ...yampa },
  'middle-fork-salmon': { id: 'middle-fork-salmon', ...middleForkSalmon },
  'san-juan': { id: 'san-juan', ...sanJuan },
  'rio-chama': { id: 'rio-chama', ...rioChama },
  'cataract-canyon': { id: 'cataract-canyon', ...cataractCanyon },
  'desolation-gray': { id: 'desolation-gray', ...desolationGray },
  lodore: { id: 'lodore', ...lodore },
  'hells-canyon': { id: 'hells-canyon', ...hellsCanyon },
  'ruby-horsethief': { id: 'ruby-horsethief', ...rubyHorsethief },
  selway: { id: 'selway', ...selway },
  'green-flaming-gorge': { id: 'green-flaming-gorge', ...greenFlamingGorge },
  westwater: { id: 'westwater', ...westwater },
  illinois: { id: 'illinois', ...illinois },
  tuolumne: { id: 'tuolumne', ...tuolumne },
  salt: { id: 'salt', ...salt },
  alsek: { id: 'alsek', ...alsek },
  tatshenshini: { id: 'tatshenshini', ...tatshenshini },
  'bruneau-jarbidge': { id: 'bruneau-jarbidge', ...bruneauJarbidge },
  deschutes: { id: 'deschutes', ...deschutes },
  'john-day': { id: 'john-day', ...johnDay },
  owyhee: { id: 'owyhee', ...owyhee },
  'green-labyrinth': { id: 'green-labyrinth', ...greenLabyrinth },
  dolores: { id: 'dolores', ...dolores },
};

// Fill every field the views read, so a bare-bones river (just a name, reach
// and access points) renders without special cases.
export function normalizeRiver(r) {
  const miles = Array.isArray(r.miles) && r.miles.length === 2 ? r.miles.map(Number) : [0, 1];
  const coords = Array.isArray(r.coords) && r.coords.length === 2 ? r.coords.map(Number) : [39.5, -105];
  return {
    name: 'Untitled river',
    reach: '',
    agency: '',
    note: '',
    tz: 'America/Denver',
    camps: [],
    rapids: [],
    hikes: [],
    geology: [],
    guide: [],
    rules: [],
    landmarks: [],
    clusters: [],
    access: [],
    roads: [],
    ...r,
    miles: miles[1] > miles[0] ? miles : [0, Math.max(1, miles[0] + 1)],
    coords,
    almanac: r.almanac || {},
    notes: { camp: '', hike: '', ...(r.notes || {}) },
    hdiff: r.hdiff || {},
  };
}
