// tests.js — the game's tests. They run in the browser (tests.html) and in
// Node (run.mjs). Each test is a name plus a function that throws if it fails.
import { hasSave, SAVE_KEY } from '../js/storage.js';
import { checkMap, indexBoxes, boxName, trenchMax } from '../js/engine/boxes.js';
import { newGame, currentMonth, monthLabel } from '../js/engine/state.js';
import { battleCounts, bigBattles, scarLevel, shortMonth } from '../js/engine/battles.js';
import { unitsIn, stepsIn, stackRoom, unitType } from '../js/engine/units.js';
import { moveTargets, railTargets, moveUnit, railMove } from '../js/engine/moves.js';
import { next as rngNext, rollD6, roll2d6 } from '../js/engine/rng.js';
import { resourcesFor } from '../js/engine/resources.js';
import { beginGame, endPhase, phaseOf, digIn } from '../js/engine/turn.js';
import { inSupply, rearColumn, supplySources } from '../js/engine/supply.js';
import { supplyPhase } from '../js/engine/systems/supply.js';
import { spendReplacements, threat } from '../js/engine/systems/replacements.js';
import { willPhase, armisticeScore, suddenVictory } from '../js/engine/systems/will.js';
import { columnAverages, ratioColumn, planAttack, oddsPreview, resolveAttack, applyCombatResult,
  barrageMax, eligibleAttackers } from '../js/engine/combat.js';

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
  check(state.seed === 12345 && state.turn === 1 && state.version === 2);
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

// ---------------------------------------------------------------- Milestone 3: units
// A deep copy, for tests that change a state by hand.
const copyOf = (x) => JSON.parse(JSON.stringify(x));
// The data bundle the engine expects.
const bundle = () => ({ map: data.map, terrain: data.terrain, nations: data.nations,
  unitTypes: data.unitTypes, phases: data.phases, combat: data.combat, victory: data.victory });
const game = (seed = 7) => newGame(data.scenario, seed, bundle());
const phaseIndex = (id) => data.phases.phases.findIndex((p) => p.id === id);

test('units: unit types match RULES.md §5 (steps 4 / 5 / 2 / 4, stacking 3)', () => {
  const t = Object.fromEntries(data.unitTypes.types.map((x) => [x.id, x]));
  check(t.infantry.maxSteps === 4 && t['us-infantry'].maxSteps === 5 && t.tanks.maxSteps === 2 &&
    t.stormtroopers.maxSteps === 4, 'max steps');
  check(t.tanks.attackShift === 1 && t.tanks.cannotHoldAlone && t.tanks.rebuild === false, 'tank rules');
  check(data.unitTypes.stackLimit === 3, 'stacking limit 3');
});

test('scenario 1914: starting units match RULES.md §12', () => {
  const u = data.scenario.units;
  const count = (nat) => u.filter((x) => x.nation === nat).length;
  check(count('ger') === 17 && count('bel') === 1 && count('gbr') === 2 && count('fra') === 18,
    `GER ${count('ger')} BEL ${count('bel')} GBR ${count('gbr')} FRA ${count('fra')}`);
  const at = (nat, box) => u.some((x) => x.nation === nat && x.box === box);
  for (let l = 1; l <= 12; l++) check(at('ger', `l${String(l).padStart(2, '0')}-g1`), `GER in G1 lane ${l}`);
  for (const l of [2, 6, 7, 8, 11]) check(at('ger', `l${String(l).padStart(2, '0')}-g2`), `GER in G2 lane ${l}`);
  check(at('bel', 'l01-e1') && at('gbr', 'l02-e1') && at('gbr', 'l03-e1'), 'BEL and GBR places');
  for (let l = 4; l <= 12; l++) check(at('fra', `l${String(l).padStart(2, '0')}-e1`), `FRA in E1 lane ${l}`);
  for (const l of [1, 2, 4, 6, 7, 8, 9, 11, 12]) check(at('fra', `l${String(l).padStart(2, '0')}-e2`), `FRA in E2 lane ${l}`);
  check(new Set(u.map((x) => x.id)).size === u.length, 'unit ids are unique');
});

test('newGame: units start at full strength, on their own side, within stacking', () => {
  const s = game();
  for (const u of s.units) {
    check(u.steps === unitType(bundle(), u).maxSteps, u.id + ' full strength');
    const side = data.nations.nations.find((n) => n.id === u.nation).side;
    check(s.boxes[u.box].owner === side, u.id + ' is in a friendly box');
  }
  for (const b of data.map.boxes) check(unitsIn(s, b.id).length <= 3, b.id + ' within stacking');
  check(stepsIn(s, 'l06-g2') === 4 && stackRoom(s, bundle(), 'l06-g2') === 2, 'steps and room in a box');
});

test('newGame: starting Will and December 1914 resources match RULES.md §6 and §11', () => {
  const s = game();
  check(s.will.ger === 105 && s.will.fra === 75 && s.will.gbr === 85, JSON.stringify(s.will));
  check(s.will.usa === undefined, 'the USA has no Will until it enters the war');
  const r = s.resources;
  check(r.ger.op === 2 && r.ger.munitions === 3 && r.ger.rp === 3 && r.ger.rail === 3, 'GER ' + JSON.stringify(r.ger));
  check(r.fra.op === 2 && r.fra.munitions === 2 && r.fra.rp === 3 && r.fra.rail === 2, 'FRA ' + JSON.stringify(r.fra));
  check(r.gbr.op === 1 && r.gbr.munitions === 1 && r.gbr.rp === 2 && r.gbr.rail === 1, 'GBR ' + JSON.stringify(r.gbr));
});

test('resources: follow the RULES.md §6 table through the war', () => {
  const r = (m) => resourcesFor(bundle(), m);
  check(r('1918-01').ger.op === 4 && r('1917-01').ger.rp === 2 && r('1918-08').ger.rp === 1, 'GER');
  check(r('1915-06').fra.munitions === 2 && r('1916-06').fra.munitions === 3 && r('1917-06').fra.munitions === 4 &&
    r('1918-06').fra.munitions === 5, 'FRA munitions');
  check(r('1916-06').fra.rp === 2 && r('1918-06').fra.rp === 1, 'FRA RP');
  check(r('1915-06').gbr.munitions === 1 && r('1916-06').gbr.munitions === 3 && r('1917-06').gbr.munitions === 4, 'GBR munitions');
  check(r('1916-06').gbr.op === 2 && r('1918-06').gbr.op === 3 && r('1916-06').gbr.rp === 3, 'GBR OP and RP');
  check(r('1918-08').usa.op === 2 && r('1918-07').usa.op === 1, 'USA OP');
  check(r('1916-06').bel.op === 0, 'BEL');
});

test('selection: a unit can move into adjacent friendly boxes with room', () => {
  const s = { ...game(), phase: phaseIndex('entente-move') };
  const targets = moveTargets(s, bundle(), 'fra-01').sort();   // fra-01 is in l04-e1
  check(JSON.stringify(targets) === JSON.stringify(['l03-e1', 'l04-e2', 'l05-e1']), targets.join());
  check(!targets.includes('l04-g1'), 'never into an enemy box');
});

test('selection: a full box (3 units) is not a move target', () => {
  const s = { ...game(), phase: phaseIndex('entente-move') };
  for (const id of ['fra-02', 'fra-11']) s.units.find((u) => u.id === id).box = 'l03-e1';  // l03-e1 now holds 3
  check(!moveTargets(s, bundle(), 'fra-01').includes('l03-e1'), 'full box excluded');
});

test('selection: rail targets are friendly boxes joined by friendly boxes', () => {
  const s = { ...game(), phase: phaseIndex('germany-move') };
  const t = railTargets(s, bundle(), 'ger-06');                    // in l06-g1
  check(t.includes('l12-g3') && t.includes('l01-g3'), 'can rail the length of the German rear');
  check(!t.some((id) => id.includes('-e')), 'never into Entente boxes');
});

test('selection: no orders outside your own move phase', () => {
  const s = { ...game(), phase: phaseIndex('germany-move') };
  check(moveTargets(s, bundle(), 'fra-01').length === 0, 'French unit in the German phase');
  check(moveTargets(s, bundle(), 'ger-06').length > 0, 'German unit in the German phase');
});

// ---------------------------------------------------------------- the dice
test('rng: the same seed gives the same rolls; rolls are 1–6 and fair', () => {
  let a = 42; let b = 42; const counts = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 6000; i++) {
    const ra = rollD6(a); const rb = rollD6(b);
    check(ra.roll === rb.roll, 'same seed, same roll');
    check(ra.roll >= 1 && ra.roll <= 6, 'roll in range');
    counts[ra.roll - 1]++; a = ra.rng; b = rb.rng;
  }
  for (const c of counts) check(c > 850 && c < 1150, 'each face about 1000 times: ' + counts.join());
  const two = roll2d6(1);
  check(two.total === two.dice[0] + two.dice[1], '2d6 adds up');
  check(rngNext(5).value !== rngNext(6).value, 'different seeds differ');
});

// ---------------------------------------------------------------- Milestone 4: turns
const started = (seed = 7) => beginGame(game(seed), bundle());
// Press End Phase until the phase with this id comes round.
function endUntil(state, id) {
  let s = state;
  for (let i = 0; i < 40 && phaseOf(s, bundle()).id !== id; i++) s = endPhase(s, bundle());
  return s;
}

test('turn: phases follow RULES.md §7 order', () => {
  const ids = data.phases.phases.map((p) => p.id);
  check(ids.join() === 'events,germany-move,germany-attack,entente-move,entente-attack,supply,dig-in,replacements,will,newspaper', ids.join());
});

test('turn: a new game waits at the German move; End Phase steps through the turn', () => {
  let s = started();
  check(phaseOf(s, bundle()).id === 'germany-move' && s.turn === 1, 'starts at the German move');
  const seen = [phaseOf(s, bundle()).id];
  for (let i = 0; i < 4; i++) { s = endPhase(s, bundle()); seen.push(phaseOf(s, bundle()).id); }
  check(seen.join() === 'germany-move,germany-attack,entente-move,entente-attack,germany-move', seen.join());
  check(s.turn === 2 && currentMonth(s) === '1915-01', 'January 1915 is turn 2');
});

test('turn: the war ends after November 1918 (48 turns)', () => {
  let s = started();
  for (let i = 0; i < 47 * 4; i++) s = endPhase(s, bundle());
  check(s.turn === 48 && currentMonth(s) === '1918-11' && !s.over, 'turn 48 is November 1918');
  for (let i = 0; i < 4; i++) s = endPhase(s, bundle());
  check(s.over, 'the game is over');
  check(endPhase(s, bundle()) === s, 'nothing happens after the end');
});

test('turn: End Phase never changes the state it is given', () => {
  const s = started(); const before = JSON.stringify(s);
  endPhase(s, bundle());
  check(JSON.stringify(s) === before, 'the old state was changed');
});

test('dig in: boxes with units gain +1 trench up to the month\'s maximum (RULES.md §9.5)', () => {
  let s = started();
  // Dec 1914: maximum 1 everywhere, so the front (trench 1) stays at 1; G2 with units goes 0 → 1
  s = endUntil(endPhase(s, bundle()), 'germany-move');
  check(s.boxes['l06-g1'].trench === 1, 'front stays at 1 in Dec 1914');
  check(s.boxes['l06-g2'].trench === 1, 'G2 with a unit dug in to 1');
  check(s.boxes['l05-g2'].trench === 0, 'empty boxes do not dig in');
  // run to June 1915: normal 2, chalk 3, mud 2
  while (currentMonth(s) < '1915-09') s = endUntil(endPhase(s, bundle()), 'germany-move');
  check(s.boxes['l11-g1'].trench === 2, 'normal ground reaches 2 by Sep 1915: ' + s.boxes['l11-g1'].trench);
  check(s.boxes['l06-g1'].trench === 3, 'chalk reaches 3 by Sep 1915: ' + s.boxes['l06-g1'].trench);
  check(s.boxes['l02-g1'].trench === 2, 'Flanders mud stops at 2: ' + s.boxes['l02-g1'].trench);
});

test('dig in: a box that was attacked this turn does not dig in', () => {
  const s = copyOf(started());
  s.boxes['l06-g2'].trench = 0;
  s.attackedBoxes = ['l06-g2'];
  digIn(s, bundle());
  check(s.boxes['l06-g2'].trench === 0, 'attacked box dug in');
});

test('move: a unit moves once per turn, and can move again next turn', () => {
  let s = endUntil(started(), 'entente-move');
  s = moveUnit(s, bundle(), 'fra-01', 'l04-e2');
  check(s.units.find((u) => u.id === 'fra-01').box === 'l04-e2', 'moved');
  check(moveTargets(s, bundle(), 'fra-01').length === 0, 'no second move this turn');
  let threw = false;
  try { moveUnit(s, bundle(), 'fra-01', 'l04-e1'); } catch (e) { threw = true; }
  check(threw, 'second move refused');
  s = endUntil(endPhase(s, bundle()), 'entente-move');
  check(moveTargets(s, bundle(), 'fra-01').length > 0, 'can move again next turn');
});

test('move: never into an enemy box, a full box, or out of turn', () => {
  const s = endUntil(started(), 'entente-move');
  for (const [unit, to] of [['fra-01', 'l04-g1'], ['ger-06', 'l06-g2']]) {
    let threw = false;
    try { moveUnit(s, bundle(), unit, to); } catch (e) { threw = true; }
    check(threw, `${unit} to ${to} should be refused`);
  }
});

test('rail: uses up the nation\'s rail moves; a railed unit has moved', () => {
  let s = started();                                  // German move
  check(s.resources.ger.rail === 3, 'GER has 3 rail moves');
  s = railMove(s, bundle(), 'ger-13', 'l12-g3');      // ger-13 is in l02-g2
  check(s.units.find((u) => u.id === 'ger-13').box === 'l12-g3' && s.resources.ger.rail === 2, 'railed');
  const u = s.units.find((x) => x.id === 'ger-13');
  check(u.railed && u.moved, 'marked as railed');
  for (const id of ['ger-14', 'ger-15']) s = railMove(s, bundle(), id, 'l01-g3');
  check(s.resources.ger.rail === 0 && railTargets(s, bundle(), 'ger-16').length === 0, 'no rail moves left');
  s = endUntil(endPhase(s, bundle()), 'germany-move');
  check(s.resources.ger.rail === 3, 'rail moves come back next turn');
});

test('rail: enemy boxes block the line', () => {
  const s = copyOf(started());
  // cut the German side in two: lane 6 G1–G3 become Entente
  for (const c of ['g1', 'g2', 'g3']) s.boxes['l06-' + c].owner = 'entente';
  s.units = s.units.filter((u) => !u.box.startsWith('l06-g'));
  const t = railTargets(s, bundle(), 'ger-01');       // lane 1
  check(t.includes('l05-g3') && !t.includes('l07-g3'), 'cannot rail past lane 6');
});

test('supply: units trace to their rear column; Britain to the Channel Ports or Hazebrouck', () => {
  const s = started();
  check(rearColumn(data.map, 'entente') === 'e3' && rearColumn(data.map, 'germany') === 'g3', 'rear columns');
  check(supplySources(bundle(), 'gbr').join() === 'l01-e3,l02-e3', 'GBR sources');
  for (const u of s.units) check(inSupply(s, bundle(), u), u.id + ' starts in supply');
  const cut = copyOf(s);
  for (const id of ['l01-e3', 'l02-e3']) cut.boxes[id].owner = 'germany';
  check(!inSupply(cut, bundle(), cut.units.find((u) => u.id === 'gbr-01')), 'GBR cut off from the ports');
  check(inSupply(cut, bundle(), cut.units.find((u) => u.id === 'fra-01')), 'FRA still traces to E3');
});

test('turn: the same seed and orders give the same game', () => {
  const play = () => {
    let s = started(99);
    s = railMove(s, bundle(), 'ger-13', 'l12-g3');
    for (let i = 0; i < 12; i++) s = endPhase(s, bundle());
    return JSON.stringify(s);
  };
  check(play() === play(), 'two runs differ');
});

// ---------------------------------------------------------------- Milestone 5: combat
// A game set in a given month, waiting at a side's attack phase.
function atWar(month, side = 'germany', seed = 3) {
  const s = copyOf(started(seed));
  const [y, m] = month.split('-').map(Number);
  s.turn = (y * 12 + m) - (1914 * 12 + 12) + 1;
  s.phase = phaseIndex(side + '-attack');
  s.resources = resourcesFor(bundle(), month);
  return s;
}
const unit = (s, id) => s.units.find((u) => u.id === id);
const place = (s, id, box, extra = {}) => Object.assign(unit(s, id), { box }, extra);
const shiftOf = (plan, label) => (plan.shifts.find((x) => x.label.startsWith(label)) || {}).value;

test('combat table: averages match RULES.md §9.3 exactly', () => {
  const want = [[2.75, 0.86, 0], [2.39, 1.44, 3], [1.75, 2.00, 17], [1.39, 2.28, 42], [1.00, 2.75, 58], [0.58, 3.28, 83]];
  want.forEach(([a, d, r], col) => {
    const got = columnAverages(data.combat, col);
    const label = data.combat.columns[col].label;
    check(Math.abs(got.a - a) < 0.006, `${label} attacker ${got.a.toFixed(3)} ≠ ${a}`);
    check(Math.abs(got.d - d) < 0.006, `${label} defender ${got.d.toFixed(3)} ≠ ${d}`);
    check(Math.round(got.r * 100) === r, `${label} retreat ${(got.r * 100).toFixed(1)}% ≠ ${r}%`);
  });
});

test('combat: odds give the highest column reached; below 1:2 is refused', () => {
  const t = data.combat;
  const cols = [[2, 4], [3, 4], [4, 4], [6, 4], [8, 4], [12, 4], [16, 4], [20, 4]].map(([a, d]) => ratioColumn(t, a, d));
  check(cols.join() === '0,0,1,2,3,4,5,5', cols.join());
  check(ratioColumn(t, 1, 4) === -1, '1:4 is below 1:2');
  const s = atWar('1916-06');
  place(s, 'ger-06', 'l06-g1', { steps: 1 });
  const plan = planAttack(s, bundle(), { target: 'l06-e1', units: ['ger-06'] });
  check(!plan.ok && plan.reasons.some((r) => r.includes('below 1:2')), 'a 1:4 attack is refused');
});

test('combat: trench, winter and the 1914 traits all shift the column (RULES.md §4, §9.2)', () => {
  const s = atWar('1914-12');
  // German 4 steps vs French 4 steps in the Somme E1 (trench 1), December 1914
  const plan = planAttack(s, bundle(), { target: 'l06-e1', units: ['ger-06'] });
  check(plan.ok, plan.reasons.join());
  check(plan.ratioColumn === 1, '4 v 4 is 1:1');
  check(shiftOf(plan, 'Trench') === -1 && shiftOf(plan, 'Winter') === -1, 'trench and winter −1');
  check(shiftOf(plan, 'Heavy howitzers') === 1 && shiftOf(plan, 'The 75s') === -1, 'howitzers +1, the 75s −1');
  check(plan.finalColumn === 0 && plan.columnLabel === '1:2', 'clamped to 1:2: ' + plan.columnLabel);
});

test('combat: terrain shifts — flooded, ridge, fortress, mud only in autumn', () => {
  let s = atWar('1915-04');
  let plan = planAttack(s, bundle(), { target: 'l01-e1', units: ['ger-01'] });
  check(shiftOf(plan, 'Flooded') === -2 && shiftOf(plan, 'Flanders mud') === undefined, 'flooded −2, no mud in April');
  s = atWar('1915-10');
  plan = planAttack(s, bundle(), { target: 'l01-e1', units: ['ger-01'] });
  check(shiftOf(plan, 'Flanders mud') === -1, 'mud −1 in October');
  s = atWar('1915-04', 'entente');
  plan = planAttack(s, bundle(), { target: 'l11-g1', units: ['fra-08'] });     // fra-08 holds Verdun E1
  check(shiftOf(plan, 'Ridge') === -1, 'ridge −1');
  s = atWar('1915-04');
  plan = planAttack(s, bundle(), { target: 'l11-e1', units: ['ger-11'] });
  check(shiftOf(plan, 'Ridge') === -1 && shiftOf(plan, 'Fortress') === -1, 'Verdun: ridge and fortress');
});

test('combat: the 75s stop at trench 2 and in 1917; howitzers end after 1915; exhaustion from Aug 1918', () => {
  let s = atWar('1916-04');
  s.boxes['l06-e1'].trench = 2;
  let plan = planAttack(s, bundle(), { target: 'l06-e1', units: ['ger-06'] });
  check(shiftOf(plan, 'The 75s') === undefined, 'no 75s at trench 2');
  check(shiftOf(plan, 'Heavy howitzers') === undefined, 'no howitzers in 1916');
  s = atWar('1917-04'); s.boxes['l06-e1'].trench = 1;
  plan = planAttack(s, bundle(), { target: 'l06-e1', units: ['ger-06'] });
  check(shiftOf(plan, 'The 75s') === undefined, 'no 75s in 1917');
  s = atWar('1918-08', 'entente');
  plan = planAttack(s, bundle(), { target: 'l06-g1', units: ['fra-03'] });
  check(shiftOf(plan, 'Exhaustion') === 1, 'Entente +1 from August 1918');
  s = atWar('1918-07', 'entente');
  plan = planAttack(s, bundle(), { target: 'l06-g1', units: ['fra-03'] });
  check(shiftOf(plan, 'Exhaustion') === undefined, 'not before August 1918');
});

test('combat: barrage +1 per munition, at most 2 (3 from June 1916)', () => {
  let s = atWar('1916-05');
  let plan = planAttack(s, bundle(), { target: 'l06-e1', units: ['ger-06'], munitions: 2 });
  check(plan.ok && shiftOf(plan, 'Barrage') === 2, 'barrage of 2');
  plan = planAttack(s, bundle(), { target: 'l06-e1', units: ['ger-06'], munitions: 3 });
  check(!plan.ok, '3 munitions refused in May 1916');
  check(barrageMax(bundle(), '1916-05') === 2 && barrageMax(bundle(), '1916-06') === 3, 'limits');
  s = atWar('1916-06');
  plan = planAttack(s, bundle(), { target: 'l06-e1', units: ['ger-06'], munitions: 3 });
  check(plan.ok && shiftOf(plan, 'Barrage') === 3, 'creeping barrage of 3 in June 1916');
});

test('combat: unit quality — Green majority −1, any Elite +1, stormtroopers cancel a trench level', () => {
  let s = atWar('1916-04', 'entente');
  place(s, 'gbr-01', 'l06-e1', { quality: 'green' });
  let plan = planAttack(s, bundle(), { target: 'l06-g1', units: ['gbr-01', 'fra-03'] });
  check(shiftOf(plan, 'Green') === undefined, 'half Green is not more than half');
  unit(s, 'fra-03').quality = 'green';
  plan = planAttack(s, bundle(), { target: 'l06-g1', units: ['gbr-01', 'fra-03'] });
  check(shiftOf(plan, 'Green') === -1, 'all Green −1');
  unit(s, 'fra-03').quality = 'elite';
  plan = planAttack(s, bundle(), { target: 'l06-g1', units: ['gbr-01', 'fra-03'] });
  check(shiftOf(plan, 'Elite') === 1, 'any Elite +1');
  s = atWar('1918-03');
  unit(s, 'ger-06').type = 'stormtroopers';
  plan = planAttack(s, bundle(), { target: 'l06-e1', units: ['ger-06'] });
  check(shiftOf(plan, 'Stormtroopers') === 1, 'stormtroopers +1 against a trench');
});

test('combat: tanks +1, +2 on open ground, nothing in forest or mountains', () => {
  const s = atWar('1917-04', 'entente');
  const tank = { id: 'gbr-t1', nation: 'gbr', type: 'tanks', steps: 2, quality: 'regular', moved: false, railed: false, attacked: false };
  s.units.push({ ...tank, box: 'l06-e1' });                       // the Somme: open ground
  let plan = planAttack(s, bundle(), { target: 'l06-g1', units: ['gbr-t1', 'fra-03'] });
  check(shiftOf(plan, 'Tanks') === 2, 'open ground +2: ' + shiftOf(plan, 'Tanks'));
  unit(s, 'gbr-t1').box = 'l10-e1';                                // the Argonne: forest
  plan = planAttack(s, bundle(), { target: 'l10-g1', units: ['gbr-t1', 'fra-07'] });
  check(shiftOf(plan, 'Tanks') === undefined, 'forest: no tank bonus');
  unit(s, 'gbr-t1').box = 'l04-e1';                                // Artois: chalk, not open
  plan = planAttack(s, bundle(), { target: 'l04-g1', units: ['gbr-t1', 'fra-01'] });
  check(shiftOf(plan, 'Tanks') === 1, 'elsewhere +1');
});

test('combat: costs 1 OP, 2 for a coalition; refused without OP', () => {
  const s = atWar('1916-04', 'entente');
  place(s, 'fra-02', 'l03-e1');
  let plan = planAttack(s, bundle(), { target: 'l03-g1', units: ['gbr-02'] });
  check(plan.ok && plan.opCost === 1 && plan.payer === 'gbr', 'single nation 1 OP');
  plan = planAttack(s, bundle(), { target: 'l03-g1', units: ['gbr-02', 'fra-02'] });
  check(plan.opCost === 2 && plan.nations.length === 2, 'coalition 2 OP');
  s.resources.gbr.op = 0;
  plan = planAttack(s, bundle(), { target: 'l03-g1', units: ['gbr-02'] });
  check(!plan.ok, 'refused with no OP left');
});

test('combat: who may attack — adjacent, in supply, own phase, not after rail; Belgium never', () => {
  let s = atWar('1915-04', 'entente');
  check(!planAttack(s, bundle(), { target: 'l01-g1', units: ['bel-01'] }).ok, 'Belgium can\'t attack');
  check(!planAttack(s, bundle(), { target: 'l08-g1', units: ['fra-01'] }).ok, 'not adjacent');
  unit(s, 'fra-01').railed = true;
  check(!planAttack(s, bundle(), { target: 'l04-g1', units: ['fra-01'] }).ok, 'railed this turn');
  s = atWar('1915-04', 'entente');
  for (const id of ['l04-e2', 'l03-e1', 'l05-e1']) s.boxes[id].owner = 'germany';
  check(!planAttack(s, bundle(), { target: 'l04-g1', units: ['fra-01'] }).ok, 'out of supply');
  s = atWar('1915-04', 'germany');
  check(!planAttack(s, bundle(), { target: 'l04-g1', units: ['fra-01'] }).ok, 'not the Entente phase');
});

test('combat results: losses come off the strongest unit first; destroyed units go to the pool', () => {
  const s = atWar('1915-04');
  place(s, 'fra-12', 'l06-e1', { steps: 2 });                       // l06-e1: fra-03 (4) + fra-12 (2)
  const plan = planAttack(s, bundle(), { target: 'l06-e1', units: ['ger-06'] });
  const r = applyCombatResult(s, bundle(), plan, { a: 0, d: 2, r: false });
  check(unit(s, 'fra-03').steps === 2 && unit(s, 'fra-12').steps === 2, 'strongest first, one at a time');
  check(r.defenderLost.fra === 2 && !r.taken, 'two steps lost, not taken');
  applyCombatResult(s, bundle(), plan, { a: 4, d: 0, r: false });
  check(!unit(s, 'ger-06') && s.pool.ger === 1, 'a unit at 0 steps is destroyed and goes to the pool');
});

test('combat results: R — defenders fall back deeper, up to 2 attackers advance, trench drops to 0', () => {
  const s = atWar('1915-04', 'entente');
  place(s, 'fra-12', 'l06-e1');
  place(s, 'fra-13', 'l06-e1');                                     // 3 French units attack
  const plan = planAttack(s, bundle(), { target: 'l06-g1', units: ['fra-03', 'fra-12', 'fra-13'] });
  const r = applyCombatResult(s, bundle(), plan, { a: 1, d: 1, r: true });
  check(r.taken && s.boxes['l06-g1'].owner === 'entente' && s.boxes['l06-g1'].trench === 0, 'box taken, trench 0');
  check(unit(s, 'ger-06').box === 'l06-g2', 'defender fell back to G2');
  const inBox = s.units.filter((u) => u.box === 'l06-g1').length;
  check(inBox === 2, `${inBox} attackers advanced (max 2)`);
});

test('combat results: dug in (trench 2+) turns R into +1 D and no retreat', () => {
  const s = atWar('1916-04', 'entente');
  s.boxes['l06-g1'].trench = 2;
  const plan = planAttack(s, bundle(), { target: 'l06-g1', units: ['fra-03'] });
  const r = applyCombatResult(s, bundle(), plan, { a: 1, d: 2, r: true });
  check(!r.taken && unit(s, 'ger-06').box === 'l06-g1' && unit(s, 'ger-06').steps === 1, 'held, 3 steps lost');
  applyCombatResult(s, bundle(), plan, { a: 0, d: 1, r: true });
  check(s.boxes['l06-g1'].owner === 'entente', 'wiped out: the attacker may advance anyway');
});

test('combat results: defence in depth — +1 attacker loss vs German trench 2+ from 1917', () => {
  let s = atWar('1917-04', 'entente');
  s.boxes['l06-g1'].trench = 2;
  let plan = planAttack(s, bundle(), { target: 'l06-g1', units: ['fra-03'] });
  applyCombatResult(s, bundle(), plan, { a: 1, d: 0, r: false });
  check(unit(s, 'fra-03').steps === 2, 'lost 2 steps, not 1');
  s = atWar('1916-10', 'entente');
  s.boxes['l06-g1'].trench = 2;
  plan = planAttack(s, bundle(), { target: 'l06-g1', units: ['fra-03'] });
  applyCombatResult(s, bundle(), plan, { a: 1, d: 0, r: false });
  check(unit(s, 'fra-03').steps === 3, 'not before 1917');
});

test('combat results: a defender with nowhere to go is destroyed', () => {
  const s = atWar('1915-04', 'entente');
  for (const id of ['l06-g2', 'l05-g1', 'l07-g1']) s.boxes[id].owner = 'entente';
  s.units = s.units.filter((u) => !['l06-g2', 'l05-g1', 'l07-g1'].includes(u.box));
  const plan = planAttack(s, bundle(), { target: 'l06-g1', units: ['fra-03'] });
  const r = applyCombatResult(s, bundle(), plan, { a: 1, d: 1, r: true });
  check(r.taken && !unit(s, 'ger-06') && s.pool.ger === 1, 'cut off and destroyed');
});

test('combat: an empty enemy box is taken without a roll for 1 OP; tanks alone count as empty', () => {
  let s = atWar('1915-04', 'entente');
  place(s, 'ger-05', 'l05-g2');                                     // leave Arras G1 empty
  const before = s.rng;
  let out = resolveAttack(s, bundle(), { target: 'l05-g1', units: ['fra-02'] });
  check(out.result.empty && out.result.taken && out.state.boxes['l05-g1'].owner === 'entente', 'taken');
  check(out.state.resources.fra.op === s.resources.fra.op - 1 && out.state.rng === before, '1 OP, no dice');
  check(unit(out.state, 'fra-02').box === 'l05-g1', 'the attacker moved in');
  s = atWar('1917-04', 'entente');
  place(s, 'ger-05', 'l05-g2');
  s.units.push({ id: 'ger-t1', nation: 'ger', type: 'tanks', box: 'l05-g1', steps: 2, quality: 'regular', moved: false, railed: false, attacked: false });
  out = resolveAttack(s, bundle(), { target: 'l05-g1', units: ['fra-02'] });
  check(out.result.empty && unit(out.state, 'ger-t1').box !== 'l05-g1', 'tanks alone: box counts as empty and they fall back');
});

test('combat: a futile attack (1:1 or worse, box not taken) costs the attacking nation 3 Will', () => {
  let s = atWar('1915-04', 'entente');
  let plan = planAttack(s, bundle(), { target: 'l06-g1', units: ['fra-03'] });
  check(plan.finalColumn <= 1, 'this attack is at 1:1 or worse: ' + plan.columnLabel);
  let r = applyCombatResult(s, bundle(), plan, { a: 2, d: 1, r: false });
  check(r.futile && s.will.fra === 75 - 3, 'FRA Will ' + s.will.fra);
  s = atWar('1915-04', 'entente');
  place(s, 'fra-12', 'l06-e1');
  place(s, 'fra-13', 'l06-e1');
  plan = planAttack(s, bundle(), { target: 'l06-g1', units: ['fra-03', 'fra-12', 'fra-13'], munitions: 2 });
  check(plan.finalColumn >= 2, 'a careful attack at 3:2 or better: ' + plan.columnLabel);
  r = applyCombatResult(s, bundle(), plan, { a: 1, d: 2, r: false });
  check(!r.futile && s.will.fra === 75, 'no Will cost beyond losses');
});

test('combat: taking a named box changes Will (RULES.md §11)', () => {
  // Germany takes Amiens (5 VP, lane 6): FRA −5, GER +2
  let s = atWar('1915-04');
  s.boxes['l06-e3'].owner = 'entente';
  place(s, 'ger-06', 'l06-e2'); s.boxes['l06-e2'].owner = 'germany';
  s.units = s.units.filter((u) => !['l06-e2'].includes(u.box) || u.nation === 'ger');
  let plan = planAttack(s, bundle(), { target: 'l06-e3', units: ['ger-06'] });
  let r = applyCombatResult(s, bundle(), plan, { a: 0, d: 0, r: true });
  check(r.taken && s.will.fra === 70 && s.will.ger === 107, `FRA ${s.will.fra} GER ${s.will.ger}`);
  // Germany takes the Channel Ports (8 VP, lane 1): GBR −8 −15, GER +4
  s = atWar('1915-04');
  s.boxes['l01-e2'].owner = 'germany';
  s.units = s.units.filter((u) => u.box !== 'l01-e2');
  place(s, 'ger-01', 'l01-e2');
  plan = planAttack(s, bundle(), { target: 'l01-e3', units: ['ger-01'] });
  applyCombatResult(s, bundle(), plan, { a: 0, d: 0, r: true });
  check(s.will.gbr === 85 - 8 - 15 && s.will.ger === 105 + 4, `GBR ${s.will.gbr} GER ${s.will.ger}`);
  // The Entente takes Lille (3 VP): GER −3; FRA and GBR +0 (¼ of 3, rounded down)
  s = atWar('1915-04', 'entente');
  s.boxes['l03-g1'].owner = 'entente';
  s.units = s.units.filter((u) => u.box !== 'l03-g1');
  place(s, 'gbr-02', 'l03-g1');
  plan = planAttack(s, bundle(), { target: 'l03-g2', units: ['gbr-02'] });
  applyCombatResult(s, bundle(), plan, { a: 0, d: 0, r: true });
  check(s.will.ger === 102 && s.will.fra === 75 && s.will.gbr === 85, `GER ${s.will.ger}`);
});

test('combat: every attack is recorded for the map (battle scars and pencil notes)', () => {
  const s = atWar('1916-02', 'germany');
  const plan = planAttack(s, bundle(), { target: 'l11-e1', units: ['ger-11', 'ger-17'] });
  applyCombatResult(s, bundle(), plan, { a: 3, d: 3, r: false });
  const last = s.battles[s.battles.length - 1];
  check(last.box === 'l11-e1' && last.month === '1916-02' && last.stepsLost === 6, JSON.stringify(last));
  check(bigBattles(s).some((b) => b.box === 'l11-e1'), '6 steps lost earns a pencil note');
});

test('combat: the same seed gives the same result, and the old state is untouched', () => {
  const s = atWar('1915-04', 'entente', 11);
  const before = JSON.stringify(s);
  const one = resolveAttack(s, bundle(), { target: 'l06-g1', units: ['fra-03'] });
  const two = resolveAttack(s, bundle(), { target: 'l06-g1', units: ['fra-03'] });
  check(JSON.stringify(one.state) === JSON.stringify(two.state) && one.result.roll === two.result.roll, 'same seed, same battle');
  check(JSON.stringify(s) === before, 'the state passed in was changed');
  check(unit(one.state, 'fra-03').attacked && one.state.attackedBoxes.includes('l06-g1'), 'attacker marked, box marked');
  check(one.state.rng !== s.rng, 'the dice moved on');
});

test('combat: the order slip lists only units that may attack the target', () => {
  const s = atWar('1915-04', 'entente');
  place(s, 'fra-12', 'l06-e1');
  unit(s, 'fra-13').railed = true; place(s, 'fra-13', 'l05-e1');
  const ids = eligibleAttackers(s, bundle(), 'l06-g1').sort();
  check(ids.join() === 'fra-03,fra-12', ids.join());
  check(eligibleAttackers(s, bundle(), 'l06-e1').length === 0, 'not against a friendly box');
  check(eligibleAttackers(atWar('1915-04', 'germany'), bundle(), 'l06-g1').length === 0, 'not in the German phase');
});

test('combat: the odds preview — better columns mean better chances', () => {
  const s = atWar('1916-08', 'entente');
  place(s, 'fra-12', 'l06-e1');
  place(s, 'fra-13', 'l06-e1');
  const low = oddsPreview(s, bundle(), { target: 'l06-g1', units: ['fra-03'] });
  const high = oddsPreview(s, bundle(), { target: 'l06-g1', units: ['fra-03', 'fra-12', 'fra-13'], munitions: 3 });
  check(high.plan.finalColumn > low.plan.finalColumn, 'more men and guns, better column');
  check(high.pTake > low.pTake && high.attackerLoss < low.attackerLoss + 1, `pTake ${low.pTake.toFixed(2)} → ${high.pTake.toFixed(2)}`);
  check(low.pTake >= 0 && high.pTake <= 1, 'chances between 0 and 1');
});

// ---------------------------------------------------------------- Milestone 7: supply, replacements, Will
test('supply phase: a cut-off unit loses 1 step; at 0 it is destroyed', () => {
  const s = copyOf(started());
  for (const id of ['l01-e3', 'l02-e3']) s.boxes[id].owner = 'germany';   // cut GBR off from the ports
  unit(s, 'gbr-02').steps = 1;
  supplyPhase(s, bundle());
  check(unit(s, 'gbr-01').steps === 3, 'gbr-01 lost a step');
  check(!unit(s, 'gbr-02') && s.pool.gbr === 1, 'gbr-02 destroyed');
  check(s.lostThisTurn.gbr === 2 && unit(s, 'fra-01').steps === 4, 'losses counted; others untouched');
});

test('replacements: 1 RP = +1 step, weakest in the most threatened box first; 2 RP rebuild', () => {
  const s = copyOf(started());
  unit(s, 'fra-01').steps = 2; unit(s, 'fra-12').steps = 3;
  check(threat(s, bundle(), 'l04-e1') > threat(s, bundle(), 'l04-e2'), 'the front box is more threatened');
  let used = spendReplacements(s, bundle(), 'fra', 1);
  check(used === 1 && unit(s, 'fra-01').steps === 3 && unit(s, 'fra-12').steps === 3, 'front unit repaired first');
  s.pool.fra = 1;
  used = spendReplacements(s, bundle(), 'fra', 4);
  const rebuilt = s.units.find((u) => u.id.startsWith('fra-r'));
  check(unit(s, 'fra-01').steps === 4 && unit(s, 'fra-12').steps === 4, 'all repaired');
  check(rebuilt && rebuilt.steps === 1 && rebuilt.box.endsWith('-e3') && rebuilt.type === 'infantry' && s.pool.fra === 0,
    'rebuilt at 1 step in a rear box: ' + JSON.stringify(rebuilt));
  check(used === 4, 'used 2 to repair and 2 to rebuild: ' + used);
});

test('Will: 1 per 3 steps (GER) or 2 (FRA, GBR), rounded down; Belgian losses count against France', () => {
  const s = copyOf(started());
  s.lostThisTurn = { ger: 7, fra: 5, gbr: 1, bel: 2, usa: 0 };
  willPhase(s, bundle());
  check(s.will.ger === 105 - 2 && s.will.gbr === 85, `GER ${s.will.ger} GBR ${s.will.gbr}`);
  check(s.will.fra === 75 - 2 - 1, `FRA ${s.will.fra} (5 French steps → 2, 2 Belgian → 1)`);
});

test('mutinies: the first time FRA Will drops below 35 — no attacks for 3 turns, then +10, only once', () => {
  let s = copyOf(started());
  s.will.fra = 34;
  willPhase(s, bundle());
  check(s.cannotAttack.fra && s.mutinies.fra.left === 3, 'mutiny starts');
  const at = { ...atWar('1917-05', 'entente'), will: s.will, cannotAttack: s.cannotAttack, mutinies: s.mutinies };
  check(!planAttack(at, bundle(), { target: 'l06-g1', units: ['fra-03'] }).ok, 'French units can\'t attack');
  check(eligibleAttackers(at, bundle(), 'l06-g1').length === 0, 'none offered on the order slip');
  for (let i = 0; i < 3; i++) { s.lostThisTurn = {}; willPhase(s, bundle()); }
  check(!s.cannotAttack.fra && s.will.fra === 44, 'over after 3 turns, +10: ' + s.will.fra);
  s.will.fra = 20; willPhase(s, bundle());
  check(!s.cannotAttack.fra, 'it never happens twice');
});

test('victory: FRA or GBR Will at 0, or Paris taken — Germany wins; GER Will at 0 — Entente wins', () => {
  let s = copyOf(started()); s.will.fra = 1; s.lostThisTurn.fra = 2;
  willPhase(s, bundle());
  check(s.over && s.result.winner === 'germany', 'FRA collapse');
  s = copyOf(started()); s.boxes['l07-e3'].owner = 'germany';
  check(suddenVictory(s, bundle()).winner === 'germany', 'Paris taken');
  s = copyOf(started()); s.will.ger = 0;
  willPhase(s, bundle());
  check(s.result.winner === 'entente', 'GER collapse');
  check(phaseOf(s, bundle()).id === 'germany-move' && endPhase(s, bundle()) === s, 'the game stops when won');
});

test('victory: the Armistice Score after November 1918 (RULES.md §11)', () => {
  const s = copyOf(started());
  check(armisticeScore(s, bundle()) === 105 - 80, 'start: 105 − (75 + 85) / 2 = 25');
  s.boxes['l06-e3'].owner = 'germany';   // Amiens (5)
  s.boxes['l03-g2'].owner = 'entente';   // Lille (3)
  check(armisticeScore(s, bundle()) === 25 + 5 - 3, 'captured VP count');
  s.turn = 48; s.will = { ger: 70, fra: 70, gbr: 72 };
  s.boxes['l06-e3'].owner = 'entente';
  willPhase(s, bundle());
  check(s.over && s.result.winner === 'entente' && Math.abs(s.finalScore - (-4)) < 1e-9, 'score −4 is an Entente victory: ' + s.finalScore);
  const d = copyOf(started());
  d.turn = 48; d.will = { ger: 72, fra: 70, gbr: 72 };
  willPhase(d, bundle());
  check(d.result.winner === 'draw', '−2 to +2 is a stalemate peace: ' + d.finalScore);
});

test('USA: US units can\'t attack while US Will is 0 (pending rule fix 16)', () => {
  const s = copyOf(started());
  s.will.usa = 0; s.cannotAttack = {};
  willPhase(s, bundle());
  check(s.cannotAttack.usa, 'US units can\'t attack');
  s.will.usa = 5; willPhase(s, bundle());
  check(!s.cannotAttack.usa, 'they can again when Will returns');
});

// ---------------------------------------------------------------- commanders and headlines
test('commanders: all nine cards from RULES.md §15, with Strength, Flaw and history', () => {
  const ids = data.commanders.cards.map((c) => c.id).sort();
  check(ids.join() === 'falkenhayn,foch,french,haig,hindenburg-ludendorff,joffre,nivelle,pershing,petain', ids.join());
  const nations = new Set([...data.nations.nations.map((n) => n.id), ...data.nations.sides.map((s) => s.id)]);
  for (const c of data.commanders.cards) {
    check(nations.has(c.nation), c.id + ' nation');
    check(c.strength && c.strength.name && c.strength.effects.length, c.id + ' strength');
    check(c.flaw === null || (c.flaw.name && c.flaw.effects.length), c.id + ' flaw');
    check(c.history && c.history.length > 40, c.id + ' history note');
    for (const n of c.next) check(ids.includes(n), `${c.id} → ${n}`);
  }
  for (const list of Object.values(data.commanders.succession)) for (const id of list) check(ids.includes(id), id);
  const r = data.commanders.rules;
  check(r.keepOldCommanderWill === -3 && r.sackWill === -5 && r.noSackingFirstTurns === 3, 'choice costs');
});

test('commanders: only real historical nicknames (Papa Joffre, Black Jack); the rest have none', () => {
  const nick = Object.fromEntries(data.commanders.cards.map((c) => [c.id, c.nickname]));
  check(nick.joffre === 'Papa Joffre' && nick.pershing === 'Black Jack', 'Joffre and Pershing');
  const others = Object.entries(nick).filter(([id]) => !['joffre', 'pershing'].includes(id));
  for (const [id, n] of others) check(n === null, `${id} should have no nickname, has "${n}"`);
});

test('headlines: every RULES.md §17 type, in priority order, 2–3 versions each', () => {
  const types = data.headlines.types;
  check(types.map((t) => t.priority).join() === '1,2,3,4,5,6', 'priorities 1–6');
  for (const t of types) {
    for (const [v, list] of Object.entries(t.variants)) {
      check(list.length >= 2 && list.length <= 3, `${t.id}/${v} has ${list.length}`);
      for (const h of list) {
        check(h.head && h.deck, `${t.id}/${v} needs head and deck`);
        for (const ph of (h.head + h.deck).match(/\{[a-z]+\}/g) || []) check(ph in data.headlines.placeholders, `${t.id}: ${ph}`);
      }
    }
  }
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
    data.unitTypes = await loadJson('data/unit-types.json');
    data.phases = await loadJson('data/phases.json');
    data.combat = await loadJson('data/combat-table.json');
    data.commanders = await loadJson('data/commanders.json');
    data.victory = await loadJson('data/victory.json');
    data.headlines = await loadJson('data/headlines.json');
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
