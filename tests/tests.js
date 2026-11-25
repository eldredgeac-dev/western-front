// tests.js — the game's tests. They run in the browser (tests.html) and in
// Node (run.mjs). Each test is a name plus a function that throws if it fails.
import { hasSave, SAVE_KEY } from '../js/storage.js';
import { checkMap, indexBoxes, boxName, trenchMax } from '../js/engine/boxes.js';
import { newGame, currentMonth, monthLabel } from '../js/engine/state.js';

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

test('map: every terrain type has a way to be drawn, with colours', () => {
  check(data.terrain.types.length === 8, 'RULES.md §3 lists 8 terrain types');
  const hex = (c) => /^#[0-9a-f]{6}$/i.test(c);
  check(hex(data.terrain.plainGround), 'terrain.json needs a plainGround colour');
  for (const t of data.terrain.types) {
    check(t.draw.texture || t.draw.badge, t.id + ' needs a texture or a badge');
    check(hex(t.draw.color), t.id + ' needs a colour');
    if (t.draw.ground) check(hex(t.draw.ground) && typeof t.draw.priority === 'number', t.id + ' ground needs a colour and priority');
    check(t.effect && t.name, t.id + ' needs a name and effect');
  }
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
export async function runAll(loadJson) {
  const results = [];
  try {
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
