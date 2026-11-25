// tests.js — the game's tests. They run in the browser (tests.html) and in
// Node (run.mjs). Each test is a name plus a function that throws if it fails.
import { hasSave, SAVE_KEY } from '../js/storage.js';
import { checkMap, indexBoxes, boxName, trenchMax } from '../js/engine/boxes.js';
import { newGame, currentMonth, monthLabel } from '../js/engine/state.js';
import { battleCounts, bigBattles, scarLevel, shortMonth } from '../js/engine/battles.js';

export const tests = [];

// Register a test.
function test(name, fn) {
  tests.push({ name, fn });
}

// Fail the test unless `condition` is true.
function check(condition, message) {
  if (!condition) throw new Error(message || 'check failed');
}

// A pretend localStorage, so tests don't touch the real one.
function fakeStorage(items = {}) {
  return {
    getItem: (key) => (key in items ? items[key] : null),
  };
}

// ---------- storage.js ----------
test('hasSave: false when nothing is saved', () => {
  check(hasSave(fakeStorage()) === false);
});

test('hasSave: true when a save exists', () => {
  check(hasSave(fakeStorage({ [SAVE_KEY]: '{"version":1}' })) === true);
});

test('hasSave: false (no crash) when storage throws', () => {
  const broken = { getItem: () => { throw new Error('blocked'); } };
  check(hasSave(broken) === false);
});

test('hasSave: false when there is no storage at all', () => {
  check(hasSave(null) === false);
});

// ---------- map data (data/boxes-west.json) ----------
// The data files are loaded once by runAll() and kept here for the tests.
const data = {};

// A deep copy, so a test can break the map without spoiling other tests.
const copy = (obj) => JSON.parse(JSON.stringify(obj));

test('map: checkMap finds no problems in boxes-west.json', () => {
  const problems = checkMap(data.map, data.terrain);
  check(problems.length === 0, problems.join('; '));
});

test('map: 72 boxes, ids like l07-e3, all unique', () => {
  check(data.map.boxes.length === 72, 'found ' + data.map.boxes.length + ' boxes');
  const ids = new Set();
  for (const b of data.map.boxes) {
    check(/^l(0[1-9]|1[0-2])-(e|g)[1-3]$/.test(b.id), 'bad id ' + b.id);
    check(b.id === `${b.lane}-${b.column}`, b.id + ' does not match its lane and column');
    ids.add(b.id);
  }
  check(ids.size === 72, 'duplicate ids');
});

test('map: every neighbour exists and adjacency goes both ways', () => {
  const byId = indexBoxes(data.map);
  for (const b of data.map.boxes) {
    for (const n of b.neighbours) {
      check(byId[n], `${b.id}: neighbour ${n} does not exist`);
      check(byId[n].neighbours.includes(b.id), `${b.id} → ${n} is one-way`);
    }
  }
});

test('map: neighbours share a side, no diagonals (RULES.md §2)', () => {
  const byId = indexBoxes(data.map);
  const cols = data.map.columns.map((c) => c.id);
  for (const b of data.map.boxes) {
    const lane = Number(b.lane.slice(1));
    const col = cols.indexOf(b.column);
    const expected = data.map.boxes.filter((o) => {
      const dl = Math.abs(Number(o.lane.slice(1)) - lane);
      const dc = Math.abs(cols.indexOf(o.column) - col);
      return dl + dc === 1;
    }).map((o) => o.id).sort();
    check(JSON.stringify([...b.neighbours].sort()) === JSON.stringify(expected),
      `${b.id} neighbours ${b.neighbours} should be ${expected}`);
    check(byId[b.id] === b);
  }
});

test('map: checkMap catches a one-way neighbour and a missing id', () => {
  const broken = copy(data.map);
  const a = broken.boxes.find((b) => b.id === 'l01-e1');
  const b = broken.boxes.find((x) => x.id === 'l02-e1');
  b.neighbours = b.neighbours.filter((n) => n !== 'l01-e1');   // now one-way
  a.neighbours.push('l99-x9');                                  // doesn't exist
  const problems = checkMap(broken, data.terrain).join(' | ');
  check(problems.includes('one-way'), 'missed the one-way neighbour');
  check(problems.includes('l99-x9 does not exist'), 'missed the missing id');
});

test('map: checkMap catches unknown terrain and a duplicate id', () => {
  const broken = copy(data.map);
  broken.boxes[0].terrain.push('lava');
  broken.boxes.push(copy(broken.boxes[1]));
  const problems = checkMap(broken, data.terrain).join(' | ');
  check(problems.includes('unknown terrain lava'));
  check(problems.includes('duplicate box id'));
});

test('map: named boxes and VP match RULES.md §2', () => {
  const expected = {
    'l01-e3': ['Channel Ports', 8], 'l01-g3': ['Bruges–Ghent', 2], 'l02-e3': ['Hazebrouck', 3],
    'l03-g2': ['Lille', 3], 'l05-g3': ['Cambrai', 2], 'l06-e3': ['Amiens', 5],
    'l06-g3': ['St-Quentin', 2], 'l07-e3': ['Paris', 15], 'l08-g3': ['Laon', 2],
    'l09-e2': ['Reims', 2], 'l09-e3': ['Châlons', 2], 'l10-g3': ['Sedan–Mézières rail', 5],
    'l11-e1': ['Verdun', 5], 'l11-e3': ['Bar-le-Duc', 2], 'l11-g3': ['Metz', 4],
    'l12-e3': ['Nancy–Belfort', 2], 'l12-g3': ['Strasbourg', 3],
  };
  for (const b of data.map.boxes) {
    const want = expected[b.id];
    if (want) check(b.name === want[0] && b.vp === want[1], `${b.id} should be ${want}`);
    else check(b.name === null && b.vp === 0, `${b.id} should have no name or VP`);
  }
});

test('map: terrain matches RULES.md §3', () => {
  for (const b of data.map.boxes) {
    const lane = Number(b.lane.slice(1));
    const c = b.column;
    const want = [];
    if (lane <= 3) want.push('mud');
    if ([4, 5, 6, 8, 9].includes(lane)) want.push('chalk');
    if ([5, 6, 9].includes(lane)) want.push('open');
    if (lane === 10) want.push('forest');
    if (lane === 12) want.push('mountains');
    if (lane === 1 && c === 'e1') want.push('flooded');
    if ((c === 'g1' && [2, 3, 4, 8, 9].includes(lane)) || (lane === 11 && (c === 'e1' || c === 'g1'))) want.push('ridge');
    if (b.id === 'l11-e1' || b.id === 'l11-g3') want.push('fortress');
    check(JSON.stringify([...b.terrain].sort()) === JSON.stringify(want.sort()),
      `${b.id} terrain ${b.terrain} should be ${want}`);
  }
});

// The colours docs/STYLE.md §2 allows (map, nations and desk).
export const PALETTE = ['#E8DCC0', '#D6C7A3', '#2B241C', '#6E6253', '#5F7F95', '#5E6B45', '#8A7454',
  '#8E1B1B', '#6F8FAF', '#9C8A5A', '#6B6E63', '#5E5B33', '#B58B3A', '#221D18', '#2E2721', '#B08D57',
  '#F1E6C8', '#A3241F'];
const inPalette = (c) => PALETTE.includes(String(c).toUpperCase());

test('map: every terrain type has a way to be drawn, in palette colours', () => {
  check(data.terrain.types.length === 8, 'RULES.md §3 lists 8 terrain types');
  check(inPalette(data.terrain.plainGround), 'plainGround must be a STYLE.md palette colour');
  for (const t of data.terrain.types) {
    const d = t.draw;
    check(d.ground || d.texture || d.badge || d.plain, t.id + ' needs a ground, texture, badge or plain');
    check(inPalette(d.color), t.id + ' colour must be in the STYLE.md palette');
    if (d.ground) check(inPalette(d.ground) && typeof d.priority === 'number', t.id + ' ground needs a palette colour and priority');
    check(t.effect && t.name, t.id + ' needs a name and effect');
  }
});

test('nations: side and nation colours are STYLE.md palette colours', () => {
  for (const s of data.nations.sides) check(inPalette(s.color), s.id + ' colour');
  for (const n of data.nations.nations) check(inPalette(n.color), n.id + ' colour');
});

test('boxName: named box uses its name, others use lane + column', () => {
  const byId = indexBoxes(data.map);
  check(boxName(data.map, byId['l07-e3']) === 'Paris');
  check(boxName(data.map, byId['l02-e1']) === 'Ypres E1');
});

test('trenchMax: follows the RULES.md §9.5 table', () => {
  const byId = indexBoxes(data.map);
  const normal = byId['l07-e1'];   // Noyon: no special terrain
  const chalk = byId['l06-e1'];    // Somme
  const mud = byId['l02-e1'];      // Ypres
  const cases = [
    ['1914-12', 1, 1, 1], ['1915-05', 1, 1, 1],
    ['1915-06', 2, 3, 2], ['1916-05', 2, 3, 2],
    ['1916-06', 3, 3, 2], ['1918-11', 3, 3, 2],
  ];
  for (const [month, n, c, m] of cases) {
    check(trenchMax(normal, data.terrain, month) === n, `normal in ${month}`);
    check(trenchMax(chalk, data.terrain, month) === c, `chalk in ${month}`);
    check(trenchMax(mud, data.terrain, month) === m, `mud in ${month}`);
  }
});

// ---------- scenario and state ----------
test('scenario 1914: every box has a start; E is Entente, G is Germany', () => {
  const ids = Object.keys(data.scenario.boxes);
  check(ids.length === 72, 'scenario has ' + ids.length + ' boxes');
  for (const b of data.map.boxes) {
    const s = data.scenario.boxes[b.id];
    check(s, b.id + ' missing from scenario');
    check(s.owner === (b.column.startsWith('e') ? 'entente' : 'germany'), b.id + ' wrong owner');
  }
});

test('scenario 1914: E1 and G1 start at trench 1, the rest at 0 (RULES.md §9.5)', () => {
  for (const b of data.map.boxes) {
    const want = b.column === 'e1' || b.column === 'g1' ? 1 : 0;
    check(data.scenario.boxes[b.id].trench === want, b.id + ' wrong trench');
  }
});

test('newGame: copies owners and trenches, starts in December 1914', () => {
  const state = newGame(data.scenario, 12345);
  check(state.seed === 12345 && state.turn === 1 && state.version === 1);
  check(state.boxes['l07-e3'].owner === 'entente' && state.boxes['l07-g1'].trench === 1);
  check(currentMonth(state) === '1914-12');
  check(monthLabel(currentMonth(state)) === 'December 1914');
  state.boxes['l07-e3'].owner = 'germany';
  check(data.scenario.boxes['l07-e3'].owner === 'entente', 'changing the game changed the scenario');
});

test('currentMonth: turn 48 is November 1918', () => {
  const state = newGame(data.scenario, 1);
  state.turn = 2;
  check(currentMonth(state) === '1915-01');
  state.turn = 48;
  check(currentMonth(state) === '1918-11');
});

// Run every test and return the results.
// `loadJson(path)` reads a file relative to the project folder; the browser
// page and the Node runner each pass their own version.
// ---------------------------------------------------------------- the map picture
// (img/map-west.svg, made by tools/build-map.mjs from data/boxes-west.json and
// tools/map-extra.json; docs/STYLE.md §4 and §13)

const inFrame = ([lat, lon]) => {
  const [south, west, north, east] = data.extra.frame.bounds;
  return lat > south && lat < north && lon > west && lon < east;
};

test('map: every box has an anchor town inside the map area', () => {
  for (const b of data.map.boxes) {
    check(b.anchor && b.anchor.town, b.id + ' needs an anchor town');
    check(inFrame([b.anchor.lat, b.anchor.lon]), b.id + ' anchor is outside the map');
  }
});

test('map picture: one territory per box and one border per neighbour pair', () => {
  const ids = [...data.svg.matchAll(/class="territory" data-box="([a-z0-9-]+)"/g)].map((m) => m[1]);
  check(ids.length === data.map.boxes.length, `${ids.length} territories, expected ${data.map.boxes.length}`);
  for (const b of data.map.boxes) check(ids.includes(b.id), b.id + ' has no territory on the map');
  const borders = new Set([...data.svg.matchAll(/class="edge" data-a="([a-z0-9-]+)" data-b="([a-z0-9-]+)"/g)]
    .map((m) => m[1] + '|' + m[2]));
  const wanted = new Set();
  for (const b of data.map.boxes) for (const n of b.neighbours) wanted.add([b.id, n].sort().join('|'));
  for (const w of wanted) check(borders.has(w), `neighbours ${w} have no border on the map`);
  for (const e of borders) check(wanted.has(e), `border ${e} joins boxes that aren't neighbours`);
});

test('map picture: detail appears by zoom level (STYLE.md §13)', () => {
  for (const [id, level] of [['railways', 'lod-mid'], ['roads', 'lod-mid'], ['villages', 'lod-near'],
    ['landmarks', 'lod-near'], ['contours', 'lod-near']]) {
    check(data.svg.includes(`<g id="${id}" class="${level}">`), `${id} should be tagged ${level}`);
  }
  check(/class="label town map-label lod-mid"/.test(data.svg), 'town names appear from mid zoom');
  check(/class="river-label map-label lod-mid"/.test(data.svg), 'river names appear from mid zoom');
});

test('map extras: railways, roads, villages and landmarks are named and on the map', () => {
  for (const r of data.extra.railways.list) {
    check(r.id && r.name && r.points.length >= 2, 'railway needs an id, name and points');
    check(r.points.some(inFrame), r.id + ' is entirely off the map');
  }
  for (const r of data.extra.roads.list) check(r.name && r.points.every(inFrame), 'road ' + r.name);
  for (const v of data.extra.villages.list) check(v.name && inFrame(v.at), 'village ' + v.name);
  const landmarks = data.extra.landmarks.list.map((l) => l.name);
  for (const name of ['Fort Douaumont', 'Mort Homme', 'Hill 304', 'Vimy Ridge', 'Hill 60', 'Delville Wood',
    'Messines Ridge', 'Chemin des Dames', 'Butte de Vauquois']) {
    check(landmarks.includes(name), 'missing landmark ' + name);
  }
  for (const l of data.extra.landmarks.list) {
    check(['fort', 'hill', 'wood', 'ridge'].includes(l.kind) && inFrame(l.at), 'landmark ' + l.name);
  }
});

test('map picture: uses only STYLE.md palette colours', () => {
  const hexes = new Set((data.svg.match(/#[0-9a-fA-F]{6}\b/g) || []).map((h) => h.toUpperCase()));
  for (const h of hexes) check(PALETTE.includes(h), h + ' is not a STYLE.md colour');
});

// ---------------------------------------------------------------- the battle record
const sampleBattles = {
  battles: [
    { box: 'l11-e1', month: '1916-02', stepsLost: 9 },
    { box: 'l11-e1', month: '1916-03', stepsLost: 2 },
    { box: 'l11-e1', month: '1916-10', stepsLost: 6 },
    { box: 'l06-g1', month: '1916-07', stepsLost: 12 },
    { box: 'l02-g1', month: '1917-10', stepsLost: 5 },
  ],
};

test('battles: counts how often each territory was fought over', () => {
  const c = battleCounts(sampleBattles);
  check(c['l11-e1'] === 3 && c['l06-g1'] === 1 && c['l02-g1'] === 1, JSON.stringify(c));
  check(Object.keys(battleCounts(newGame(data.scenario, 1))).length === 0, 'a new game has no battles');
});

test('battles: scar level grows with the number of battles', () => {
  check([0, 1, 2, 3, 4, 9].map(scarLevel).join() === '0,1,2,2,3,3', [0, 1, 2, 3, 4, 9].map(scarLevel).join());
});

test('battles: pencil notes only for 6+ steps lost, grouped by territory, oldest first', () => {
  const big = bigBattles(sampleBattles);
  check(big.length === 2, `${big.length} notes, expected 2`);
  check(big[0].box === 'l11-e1' && big[0].months.join() === '1916-02,1916-10', JSON.stringify(big[0]));
  check(big[1].box === 'l06-g1', JSON.stringify(big[1]));
  check(shortMonth('1916-02') === 'Feb 1916', shortMonth('1916-02'));
});

export async function runAll(loadJson, loadText) {
  const results = [];
  try {
    data.extra = await loadJson('tools/map-extra.json');
    data.svg = await loadText('img/map-west.svg');
    data.map = await loadJson('data/boxes-west.json');
    data.terrain = await loadJson('data/terrain.json');
    data.nations = await loadJson('data/nations.json');
    data.scenario = await loadJson('data/scenarios/1914-west.json');
  } catch (err) {
    results.push({ name: 'load data files', ok: false, error: err.message });
    return results;
  }
  for (const t of tests) {
    try {
      await t.fn();
      results.push({ name: t.name, ok: true });
    } catch (err) {
      results.push({ name: t.name, ok: false, error: err.message });
    }
  }
  return results;
}
