// tests.js — the game's tests. They run in the browser (tests.html) and in
// Node (run.mjs). Each test is a name plus a function that throws if it fails.
import { hasSave, SAVE_KEY, saveGame, loadGame, readSave, saveText } from '../js/storage.js';
import { checkMap, indexBoxes, boxName, trenchMax } from '../js/engine/boxes.js';
import { newGame, currentMonth, monthLabel, migrateState, checkState, STATE_VERSION } from '../js/engine/state.js';
import { battleCounts, bigBattles, scarLevel, shortMonth } from '../js/engine/battles.js';
import { unitsIn, stepsIn, stackRoom, unitType } from '../js/engine/units.js';
import { moveTargets, railTargets, moveUnit, railMove } from '../js/engine/moves.js';
import { next as rngNext, rollD6, roll2d6 } from '../js/engine/rng.js';
import { resourcesFor } from '../js/engine/resources.js';
import { beginGame, endPhase, phaseOf, digIn, submitBudget } from '../js/engine/turn.js';
import { manpower, industry, industryParts, cityEffects, researchOptions, techActive, checkBudget, applyBudget,
  autoBudget, warOfficePhase, expectedMonth } from '../js/engine/systems/economy.js';
import { inSupply, rearColumn, supplySources } from '../js/engine/supply.js';
import { supplyPhase } from '../js/engine/systems/supply.js';
import { spendReplacements, threat } from '../js/engine/systems/replacements.js';
import { willPhase, armisticeScore, suddenVictory } from '../js/engine/systems/will.js';
import { runEvents, chooseOption, pendingChoice, eventDue, replacedByResearch } from '../js/engine/events.js';
import { aiMove, aiAttack, frontBoxes } from '../js/engine/ai.js';
import { SILHOUETTES, mix, isDark } from '../js/ui/counters.js';
import { queueCheck, addOrder, cancelOrder, commitOrders } from '../js/engine/orders.js';
import { recordMonth, casualties, ledger } from '../js/engine/history.js';
import { rollOutcomes, attackAdvice, bestAttacks } from '../js/engine/explain.js';
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
  check(state.seed === 12345 && state.turn === 1 && state.version === STATE_VERSION);
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
  unitTypes: data.unitTypes, phases: data.phases, combat: data.combat, victory: data.victory, events: data.events, ai: data.ai });
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
  check(s.will.ger === 108 && s.will.fra === 75 && s.will.gbr === 85, JSON.stringify(s.will));
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
  check(ids.join() === 'events,war-office,germany-move,germany-attack,entente-move,entente-attack,supply,dig-in,replacements,will,newspaper', ids.join());
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
  // Press End Phase all the way through, answering the 1917 questions on the way.
  let s = started();
  let presses = 0;
  while (currentMonth(s) < '1918-11' && presses < 400) {
    s = s.pendingChoice ? chooseOption(s, bundle(), pendingChoice(s, bundle()).aiChoice) : endPhase(s, bundle());
    presses++;
  }
  check(s.turn === 48 && currentMonth(s) === '1918-11' && !s.over, 'turn 48 is November 1918');
  for (let i = 0; i < 4; i++) s = endPhase(s, bundle());
  check(s.over && s.result, 'the game is over, with a result');
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
  check(r.taken && s.will.fra === 70 && s.will.ger === 110, `FRA ${s.will.fra} GER ${s.will.ger}`);
  // Germany takes the Channel Ports (8 VP, lane 1): GBR −8 −15, GER +4
  s = atWar('1915-04');
  s.boxes['l01-e2'].owner = 'germany';
  s.units = s.units.filter((u) => u.box !== 'l01-e2');
  place(s, 'ger-01', 'l01-e2');
  plan = planAttack(s, bundle(), { target: 'l01-e3', units: ['ger-01'] });
  applyCombatResult(s, bundle(), plan, { a: 0, d: 0, r: true });
  check(s.will.gbr === 85 - 8 - 15 && s.will.ger === 108 + 4, `GBR ${s.will.gbr} GER ${s.will.ger}`);
  // The Entente takes Lille (3 VP): GER −3; FRA and GBR +0 (¼ of 3, rounded down)
  s = atWar('1915-04', 'entente');
  s.boxes['l03-g1'].owner = 'entente';
  s.units = s.units.filter((u) => u.box !== 'l03-g1');
  place(s, 'gbr-02', 'l03-g1');
  plan = planAttack(s, bundle(), { target: 'l03-g2', units: ['gbr-02'] });
  applyCombatResult(s, bundle(), plan, { a: 0, d: 0, r: true });
  check(s.will.ger === 105 && s.will.fra === 75 && s.will.gbr === 85, `GER ${s.will.ger}`);
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
  check(s.will.ger === 108 - 2 && s.will.gbr === 85, `GER ${s.will.ger} GBR ${s.will.gbr}`);
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
  check(armisticeScore(s, bundle()) === 108 - 80, 'start: 108 − (75 + 85) / 2 = 28');
  s.boxes['l06-e3'].owner = 'germany';   // Amiens (5)
  s.boxes['l03-g2'].owner = 'entente';   // Lille (3)
  check(armisticeScore(s, bundle()) === 28 + 5 - 3, 'captured VP count');
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

// ---------------------------------------------------------------- Milestone 8: saves
// A pretend localStorage for tests (an object with getItem/setItem).
function fakeStore() {
  const m = {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, raw: m };
}

test('saves: auto-save and load give back exactly the same game', () => {
  let s = started(5);
  s = railMove(s, bundle(), 'ger-13', 'l12-g3');
  for (let i = 0; i < 6; i++) s = endPhase(s, bundle());
  const store = fakeStore();
  check(saveGame(store, s) && hasSave(store), 'saved');
  const back = loadGame(store, data.scenario, bundle());
  check(back.ok && JSON.stringify(back.state) === JSON.stringify(s), 'identical after loading: ' + back.error);
  check(JSON.parse(store.raw[SAVE_KEY]).version === STATE_VERSION, 'stamped with the version');
});

test('saves: export and import round-trip; the game carries on identically', () => {
  const s = endPhase(started(8), bundle());
  const r = readSave(saveText(s), data.scenario, bundle());
  check(r.ok, r.error);
  check(JSON.stringify(endPhase(r.state, bundle())) === JSON.stringify(endPhase(s, bundle())), 'same next phase');
});

test('saves: a bad file gives a friendly error, not a crash', () => {
  for (const text of ['not json at all', '{"hello": 1}', '[]', 'null']) {
    const r = readSave(text, data.scenario, bundle());
    check(!r.ok && typeof r.error === 'string' && r.error.length > 10, `"${text}" → ${r.error}`);
  }
  const s = started();
  const broken = JSON.parse(saveText(s));
  broken.state.units[0].steps = 99; broken.state.boxes['l01-e1'].owner = 'martians';
  const r = readSave(JSON.stringify(broken), data.scenario, bundle());
  check(!r.ok && /damaged/.test(r.error), r.error);
  const future = JSON.parse(saveText(s)); future.state.version = 99;
  check(/newer version/.test(readSave(JSON.stringify(future), data.scenario, bundle()).error), 'a save from the future');
  check(!loadGame(fakeStore(), data.scenario, bundle()).ok, 'no save yet');
  check(!loadGame({ getItem: () => { throw new Error('blocked'); } }, data.scenario, bundle()).ok, 'blocked storage');
  check(saveGame({ setItem: () => { throw new Error('full'); } }, s) === false, 'a full store says no');
});

test('saves: an old version 1 save (owners and trenches only) is upgraded', () => {
  const v1 = { version: 1, scenario: '1914-west', seed: 3, turn: 5, startMonth: '1914-12', boxes: copyOf(started().boxes) };
  v1.boxes['l06-g1'].owner = 'entente'; v1.boxes['l06-g1'].trench = 0;
  const up = migrateState(v1, data.scenario, bundle());
  check(up.version === STATE_VERSION && up.turn === 5 && up.boxes['l06-g1'].owner === 'entente', 'kept month and owners');
  check(up.units.length === 37 && !up.units.some((u) => u.box === 'l06-g1') && up.will.ger === 108 &&
    checkState(up, bundle()).length === 0, 'filled in the rest (and no German unit left in the lost box)');
});

// ---------------------------------------------------------------- Milestone 9: events
// A game sitting at the start of a month, events not yet run, both sides human
// unless `ai` is given.
function monthStart(month, controllers = { germany: 'human', entente: 'human' }) {
  const s = atWar(month, 'germany');
  s.phase = 0; s.controllers = controllers; s.eventsDone = [];
  return s;
}
// Play End Phase straight through to `month`, answering choices the computer's way.
function playTo(state, month) {
  let s = state;
  for (let i = 0; i < 400 && currentMonth(s) < month && !s.over; i++) {
    if (s.pendingChoice) s = chooseOption(s, bundle(), pendingChoice(s, bundle()).aiChoice);
    else s = endPhase(s, bundle());
  }
  return s;
}

test('events: every event in RULES.md §10 is in data/events.json', () => {
  const ids = data.events.events.map((e) => e.id);
  for (const id of ['gas', 'blockade', 'turnip-winter', 'hunger', 'creeping-barrage', 'u-boats', 'hindenburg-line', 'vimy', 'russia', 'stormtroopers', 'kaiserschlacht']) {
    check(ids.includes(id), 'missing ' + id);
  }
  check(eventDue(data.events.events.find((e) => e.id === 'blockade'), '1916-02') &&
    !eventDue(data.events.events.find((e) => e.id === 'blockade'), '1916-03'), 'blockade every other month');
});

test('events: German Will drains — blockade 6 in 1916, Turnip Winter 12 in 1917, Hunger 2 a month in 1918', () => {
  const run = (from, to) => {
    let total = 0;
    for (let m = from; m <= to; m = addMonthsT(m, 1)) {
      const s = monthStart(m); const before = s.will.ger; runEvents(s, bundle()); total += before - s.will.ger;
    }
    return total;
  };
  check(run('1916-01', '1916-12') === 6, '1916: ' + run('1916-01', '1916-12'));
  check(run('1917-01', '1917-11') === 11 && run('1917-12', '1917-12') === 1 - 10, '1917 (Russia +10 in December)');
  check(run('1918-01', '1918-03') === 6, '1918: −2 a month');
});
const addMonthsT = (m, n) => { const [y, mo] = m.split('-').map(Number); const t = y * 12 + mo - 1 + n; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`; };

test('events: the first gas attack gives +2 to Germany\'s first attack in lane 2 in April 1915', () => {
  let s = monthStart('1915-04'); runEvents(s, bundle()); s.phase = phaseIndex('germany-attack');
  const plan = planAttack(s, bundle(), { target: 'l02-e1', units: ['ger-02'] });
  check(shiftOf(plan, 'Gas') === 2, 'gas +2');
  check(shiftOf(planAttack(s, bundle(), { target: 'l01-e1', units: ['ger-01'] }), 'Gas') === undefined, 'only lane 2');
  s = resolveAttack(s, bundle(), { target: 'l02-e1', units: ['ger-02'] }).state;
  check(shiftOf(planAttack(s, bundle(), { target: 'l02-e1', units: ['ger-13'] }), 'Gas') === undefined, 'only the first attack');
});

test('events: reinforcements arrive in the rear on time; Kitchener\'s men are Green until 1917', () => {
  let s = monthStart('1915-03'); runEvents(s, bundle());
  const ger = s.units.filter((u) => u.id.startsWith('ger-n'));
  const gbr = s.units.filter((u) => u.id.startsWith('gbr-n'));
  check(ger.length === 1 && ger[0].box.endsWith('-g3'), 'GER +1 in G3');
  check(gbr.length === 2 && gbr.every((u) => u.quality === 'green' && u.greenUntil === '1917-01'), 'GBR +2 Green');
  const lane = (u) => Number(u.box.slice(1, 3));
  check(gbr.every((u) => u.box.endsWith('-e3') && lane(u) <= 6), 'GBR in lanes 1–6 E3');
  s = monthStart('1917-01'); s.units.push({ ...gbr[0], id: 'gbr-x' }); runEvents(s, bundle());
  check(unit(s, 'gbr-x').quality === 'regular', 'Regular from January 1917');
  s = monthStart('1916-09'); runEvents(s, bundle());
  check(s.units.some((u) => u.type === 'tanks' && u.nation === 'gbr'), 'British tanks, September 1916');
});

test('events: the U-boat decision — Unrestricted brings the USA in April 1917; Restricted in January 1918', () => {
  let s = monthStart('1917-02'); runEvents(s, bundle());
  check(s.pendingChoice && pendingChoice(s, bundle()).event.id === 'u-boats', 'a human gets the question');
  check(endPhase(s, bundle()) === s, 'the turn waits for the answer');
  s = chooseOption(s, bundle(), 'unrestricted');
  check(s.will.gbr === 85 - 2 && s.usaEntry === '1917-04', 'GBR −2 now, USA in April');
  s = playTo(s, '1917-08');
  check(s.will.usa === 90, 'US Will starts on entry');
  check(s.will.gbr <= 85 - 12, 'six months of U-boat pressure: ' + s.will.gbr);
  s = playTo(s, '1917-11');
  const us = s.units.filter((u) => u.nation === 'usa');
  check(us.length === 1 && us[0].quality === 'green' && us[0].greenUntil === '1918-02' && Number(us[0].box.slice(1, 3)) >= 9,
    'first US unit in November 1917, Green 3 turns, lanes 9–12: ' + JSON.stringify(us));
  let r = monthStart('1917-02'); runEvents(r, bundle()); r = chooseOption(r, bundle(), 'restricted');
  check(r.usaEntry === '1918-01' && r.will.gbr === 85, 'restricted: USA in January 1918');
});

test('events: the computer answers its own questions; the Hindenburg Line withdraws lanes 5–8', () => {
  const s = monthStart('1917-03', { germany: 'ai', entente: 'human' });
  runEvents(s, bundle());
  check(!s.pendingChoice, 'no question for the computer');
  for (const l of ['05', '06', '07', '08']) {
    check(s.boxes[`l${l}-g1`].owner === 'entente' && s.boxes[`l${l}-g1`].trench === 0, `lane ${l} G1 given up`);
    check(s.boxes[`l${l}-g2`].trench === 3 && unitsIn(s, `l${l}-g1`).length === 0, `lane ${l} G2 trench 3`);
  }
  check(unit(s, 'ger-06').box === 'l06-g2' && s.resources.ger.rail === 5, 'units fell back; +2 rail');
});

test('events: Vimy makes 2 British units Elite; stormtroopers; the Kaiserschlacht gamble', () => {
  let s = monthStart('1917-04'); runEvents(s, bundle());
  check(s.units.filter((u) => u.nation === 'gbr' && u.quality === 'elite').length === 2, 'two Elite');
  s = monthStart('1918-01'); runEvents(s, bundle());
  check(s.units.filter((u) => u.type === 'stormtroopers').length === 4, 'four stormtrooper units');
  s = monthStart('1918-11'); s.attacks = []; let before = s.will.ger; runEvents(s, bundle());
  check(s.will.ger === before - 2 - 15, 'no attack Apr–Oct 1918: −15 (and Hunger −2)');
  s = monthStart('1918-11'); s.attacks = [{ side: 'germany', month: '1918-05' }]; before = s.will.ger; runEvents(s, bundle());
  check(s.will.ger === before - 2, 'an attack in May 1918 avoids it');
});

// ---------------------------------------------------------------- Milestone 9: the computer opponent
test('difficulty: Will bonuses and the computer\'s resources follow RULES.md §13', () => {
  const g = (player, level) => newGame(data.scenario, 1, bundle(), { player, level });
  let s = g('entente', 'recruit');
  check(s.will.fra === 90 && s.will.gbr === 100 && s.will.ger === 108, 'Recruit: +15 to each of your nations');
  check(s.resources.ger.munitions === Math.round(3 * 0.8) && s.resources.ger.rp === Math.round(3 * 0.8), 'computer ×0.8');
  check(s.controllers.germany === 'ai' && s.controllers.entente === 'human', 'who plays what');
  s = g('germany', 'field-marshal');
  check(s.will.fra === 85 && s.will.ger === 108 && s.aiSkill.entente === 'expert', 'Field Marshal: computer +10, Expert');
  check(s.resources.fra.munitions === Math.round(2 * 1.3), 'computer ×1.3');
  s = g('germany', 'veteran');
  check(s.will.gbr === 90 && s.resources.gbr.rp === Math.round(2 * 1.15), 'Veteran: +5, ×1.15');
  check(g('both').controllers.germany === 'human', 'hot seat: both human');
});

test('computer: plays its own phases and stops at the player\'s', () => {
  const s = beginGame(newGame(data.scenario, 2, bundle(), { player: 'entente', level: 'regular' }), bundle());
  check(phaseOf(s, bundle()).id === 'entente-move', 'Germany moved and attacked by itself: ' + phaseOf(s, bundle()).id);
  const t = beginGame(newGame(data.scenario, 2, bundle(), { player: 'germany', level: 'regular' }), bundle());
  check(phaseOf(t, bundle()).id === 'germany-move', 'a German player starts');
  const u = endPhase(endPhase(t, bundle()), bundle());
  check(phaseOf(u, bundle()).id === 'germany-move' && u.turn === 2, 'the Entente turn played itself');
});

test('computer: moves units up to fill threatened, empty front boxes', () => {
  const s = atWar('1915-04', 'germany');
  s.phase = phaseIndex('entente-move'); s.controllers = { germany: 'human', entente: 'ai' };
  s.units = s.units.filter((u) => u.id !== 'fra-03');                        // the Somme E1 is now empty
  aiMove(s, bundle(), 'entente');
  check(unitsIn(s, 'l06-e1').length === 1, 'someone moved into the empty front box');
  check(frontBoxes(s, bundle(), 'entente').includes('l06-e1'), 'it is a front box');
});

test('computer: only attacks at 2:1 or better, and never without OP', () => {
  let s = atWar('1915-04', 'germany');
  aiAttack(s, bundle(), 'germany');
  for (const b of s.battles) check(true, b.box);
  const cols = (s.log || []).filter((l) => l.text.startsWith('Attack on')).map((l) => /at (\d:\d)/.exec(l.text)[1]);
  check(cols.every((c) => ['2:1', '3:1', '4:1'].includes(c)), 'columns: ' + cols.join());
  s = atWar('1915-04', 'germany'); s.resources.ger.op = 0;
  const before = JSON.stringify(s.battles);
  aiAttack(s, bundle(), 'germany');
  check(JSON.stringify(s.battles) === before, 'no OP, no attack');
});

test('computer: a full computer-vs-computer war plays to a result, the same way every time', () => {
  const war = (seed) => {
    let s = newGame(data.scenario, seed, bundle());
    s.controllers = { germany: 'ai', entente: 'ai' };
    s = beginGame(s, bundle());
    for (let i = 0; i < 2000 && !s.over; i++) s = endPhase(s, bundle());
    return s;
  };
  const a = war(21); const b = war(21);
  check(a.over && a.result && ['germany', 'entente', 'draw'].includes(a.result.winner), 'finished: ' + JSON.stringify(a.result));
  check(JSON.stringify(a) === JSON.stringify(b), 'same seed, same war');
  check((a.attacks || []).length > 5, 'attacks were made: ' + (a.attacks || []).length);
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

// ---------------------------------------------------------------- orders, then commit
// Throws? Returns the error message, or '' if it didn't throw.
const errorOf = (fn) => { try { fn(); return ''; } catch (err) { return err.message; } };

test('orders: a queued move waits for COMMIT ORDERS', () => {
  const s = started();
  const u = s.units.find((x) => x.box === 'l06-g2');
  const q = addOrder(s, bundle(), { kind: 'move', unit: u.id, to: 'l06-g3' });
  check(unit(q, u.id).box === 'l06-g2', 'the unit has not moved yet');
  check(queueCheck(q, bundle()).state.units.find((x) => x.id === u.id).box === 'l06-g3', 'the preview shows it moved');
  const { state, actions } = commitOrders(q, bundle());
  check(unit(state, u.id).box === 'l06-g3' && state.orders.length === 0, 'moved after the commit');
  check(actions.length === 1 && actions[0].kind === 'move' && actions[0].from === 'l06-g2', 'one move action');
});

test('orders: a new move for the same unit replaces its old one', () => {
  const s = started();
  const u = s.units.find((x) => x.box === 'l06-g2');
  let q = addOrder(s, bundle(), { kind: 'move', unit: u.id, to: 'l06-g3' });
  q = addOrder(q, bundle(), { kind: 'move', unit: u.id, to: 'l06-g1' });
  check(q.orders.length === 1 && q.orders[0].to === 'l06-g1', JSON.stringify(q.orders));
});

test('orders: stacking counts the moves already queued (RULES.md §5)', () => {
  const s = copyOf(started());
  const target = 'l06-g3';
  const around = indexBoxes(data.map)[target].neighbours.filter((n) => s.boxes[n].owner === 'germany');
  const movers = s.units.filter((x) => x.nation === 'ger' && !around.includes(x.box) && x.box !== target).slice(0, 4);
  movers.forEach((m, i) => place(s, m.id, around[i % around.length]));
  for (const id of Object.keys(s.boxes)) if (id === target) check(unitsIn(s, id).length === 0, 'target starts empty');
  let q = s;
  for (const m of movers.slice(0, 3)) q = addOrder(q, bundle(), { kind: 'move', unit: m.id, to: target });
  const why = errorOf(() => addOrder(q, bundle(), { kind: 'move', unit: movers[3].id, to: target }));
  check(why !== '', 'a 4th unit is refused');
});

test('orders: a unit can only be in one queued attack, and OP is set aside', () => {
  const s = atWar('1915-05');
  const targets = ['l06-e1', 'l11-e1'];
  const units = targets.map((t) => eligibleAttackers(s, bundle(), t));
  check(units[0].length && units[1].length, 'both targets can be attacked');
  let q = addOrder(s, bundle(), { kind: 'attack', target: targets[0], units: units[0], munitions: 0 });
  check(errorOf(() => addOrder(q, bundle(), { kind: 'attack', target: targets[0], units: units[0], munitions: 0 })) !== '', 'same units twice');
  const poor = copyOf(s); poor.resources.ger.op = 1;
  q = addOrder(poor, bundle(), { kind: 'attack', target: targets[0], units: units[0], munitions: 0 });
  const why = errorOf(() => addOrder(q, bundle(), { kind: 'attack', target: targets[1], units: units[1], munitions: 0 }));
  check(/Offensive Points/.test(why), 'the 2nd attack has no OP left: ' + why);
  // cancelling the first makes room for the second
  q = cancelOrder(q, 0);
  q = addOrder(q, bundle(), { kind: 'attack', target: targets[1], units: units[1], munitions: 0 });
  check(q.orders.length === 1 && q.orders[0].target === targets[1], 'after cancelling, the 2nd fits');
});

test('orders: committing gives the same result as attacking one by one (same seed)', () => {
  const s = atWar('1915-05');
  const a = { kind: 'attack', target: 'l06-e1', units: eligibleAttackers(s, bundle(), 'l06-e1'), munitions: 1 };
  const b = { kind: 'attack', target: 'l11-e1', units: eligibleAttackers(s, bundle(), 'l11-e1'), munitions: 0 };
  const q = addOrder(addOrder(s, bundle(), a), bundle(), b);
  const committed = commitOrders(q, bundle());
  let byHand = resolveAttack(q, bundle(), a).state;
  byHand = resolveAttack(byHand, bundle(), b).state;
  byHand.orders = [];
  check(JSON.stringify(committed.state) === JSON.stringify(byHand), 'identical');
  check(committed.actions.length === 2 && committed.actions.every((x) => x.kind === 'attack' && x.result), 'two attack actions');
});

test('orders: an order that is no longer possible is skipped at commit', () => {
  const s = atWar('1915-05');
  const order = { kind: 'attack', target: 'l06-e1', units: eligibleAttackers(s, bundle(), 'l06-e1'), munitions: 0 };
  const q = copyOf(addOrder(s, bundle(), order));
  q.units = q.units.filter((x) => !order.units.includes(x.id));          // the attackers are gone
  const { state, actions } = commitOrders(q, bundle());
  check(actions.length === 1 && actions[0].kind === 'skipped', JSON.stringify(actions));
  check(state.log.some((l) => /cancelled/.test(l.text || l)), 'a dispatch says so');
});

test('orders: recording the computer\'s turn changes nothing (balance is untouched)', () => {
  const plain = newGame(data.scenario, 11, bundle(), { player: 'entente' });
  let a = beginGame(plain, bundle());
  const seen = [];
  let b = beginGame(plain, bundle(), { record: (action) => seen.push(action) });
  for (let i = 0; i < 16; i++) {
    if (a.pendingChoice) { a = chooseOption(a, bundle(), pendingChoice(a, bundle()).aiChoice); b = chooseOption(b, bundle(), pendingChoice(b, bundle()).aiChoice); continue; }
    a = endPhase(a, bundle());
    b = endPhase(b, bundle(), { record: (action) => seen.push(action) });
  }
  check(JSON.stringify(a) === JSON.stringify(b), 'same game with and without the recorder');
  check(seen.some((x) => x.kind === 'move' || x.kind === 'rail'), 'moves were recorded');
  check(seen.some((x) => x.kind === 'attack' && x.result && x.from), 'attacks were recorded');
});

test('saves: a version 2 save gets an empty order queue', () => {
  const v2 = copyOf(started()); v2.version = 2; delete v2.orders;
  const up = migrateState(v2, data.scenario, bundle());
  check(up.version === STATE_VERSION && Array.isArray(up.orders) && up.orders.length === 0, JSON.stringify(up.orders));
});

// ---------------------------------------------------------------- the War Office
const withCommanders = () => ({ ...bundle(), commanders: data.commanders });

test('war office: each month adds a history row and its losses to the totals', () => {
  const s = copyOf(started());
  s.lostThisTurn.fra = 3; s.lostThisTurn.ger = 2;
  recordMonth(s, bundle());
  check(s.history.length === 1 && s.history[0].month === '1914-12', 'one row for December 1914');
  check(s.history[0].steps.ger > 0 && s.history[0].will.fra === s.will.fra, 'strength and Will recorded');
  check(s.lossesTotal.fra === 3 && s.lossesTotal.ger === 2, JSON.stringify(s.lossesTotal));
});

test('war office: playing on records every month that ends', () => {
  const s = playTo(monthStart('1915-01'), '1915-04');
  check(s.history.map((h) => h.month).join(',') === '1915-01,1915-02,1915-03', s.history.map((h) => h.month).join(','));
});

test('rule: the Butcher\'s Bill is 85,000 casualties a step, 1 in 5 killed, to the nearest 1,000 (RULES.md §16)', () => {
  check(casualties(bundle(), 4).casualties === 340000 && casualties(bundle(), 4).killed === 68000, JSON.stringify(casualties(bundle(), 4)));
  check(casualties(bundle(), 1).killed === 17000, 'one step: 17,000 killed');
});

test('war office: the ledger figures come from the state', () => {
  const s = copyOf(atWar('1916-03'));
  s.lostThisTurn.fra = 2; s.lossesTotal = { fra: 10 };
  s.resources.fra.op = 1;
  const l = ledger(s, withCommanders());
  const fra = l.nations.find((n) => n.id === 'fra');
  check(fra.will === s.will.fra && fra.steps === s.units.filter((u) => u.nation === 'fra').reduce((a, u) => a + u.steps, 0), 'Will and strength');
  check(fra.bill.month.casualties === 170000 && fra.bill.total.casualties === 1020000, JSON.stringify(fra.bill));
  check(fra.resources.find((r) => r.key === 'op').left === 1 && fra.resources.find((r) => r.key === 'op').of >= 1, 'OP left of');
  check(fra.commander && fra.commander.name === 'Joffre', 'Joffre commands France in March 1916');
  const entente = l.sides.find((x) => x.id === 'entente');
  check(entente.cities.some((c) => c.vp === 15), 'the Entente holds Paris');
  check(l.series.length === 1 && l.series[0].germany > 0, 'one chart point (this month)');
});

test('war office: countdowns for a known month', () => {
  const s = copyOf(atWar('1916-03'));
  const l = ledger(s, withCommanders());
  const ends = l.countdowns.find((c) => c.key === 'war-ends');
  check(ends.months === s.turns - s.turn, 'months left in the war');
  check(l.countdowns.find((c) => c.key === 'us-troops').months === null, 'US troops: after the US declares war');
  s.usaEntry = '1917-04';
  const later = copyOf(atWar('1917-05')); later.usaEntry = '1917-04';
  const us = ledger(later, withCommanders()).countdowns.find((c) => c.key === 'us-troops');
  const first = Math.min(...data.events.reinforcements.afterEntry.map((d) => d.after));
  check(us.months === first - 1, `US troops in ${us.months} months, expected ${first - 1}`);
});

test('saves: a version 3 save gets empty War Office records', () => {
  const v3 = copyOf(started()); v3.version = 3; delete v3.history; delete v3.lossesTotal;
  const up = migrateState(v3, data.scenario, bundle());
  check(up.version === STATE_VERSION && Array.isArray(up.history) && up.lossesTotal && typeof up.lossesTotal === 'object', 'records added');
});

// ---------------------------------------------------------------- the war economy (RULES.md §19)
// The data bundle with the economy switched on (data/economy.json).
const eco = () => ({ ...bundle(), economy: data.economy });
// A game set to the start of `month`, both sides human, budgets not yet spent.
function ecoAt(month, options = {}) {
  const s = newGame(data.scenario, 5, eco(), options);
  const [y, m] = month.split('-').map(Number);
  s.turn = (y * 12 + m) - (1914 * 12 + 12) + 1;
  s.resources = resourcesFor(eco(), month);
  for (const r of Object.values(s.resources)) r.munitions = 0;
  return s;
}
const tanksOf = (s, nation) => s.units.filter((u) => u.nation === nation && u.type === 'tanks').length;

test('economy §19.1: Manpower is the replacements schedule (×difficulty) and goes to RP', () => {
  const s = ecoAt('1915-06');
  check(manpower(s, eco(), 'ger') === 3 && manpower(s, eco(), 'fra') === 3 && manpower(s, eco(), 'gbr') === 2, '1915');
  check(manpower(s, eco(), 'ger', '1917-03') === 2 && manpower(s, eco(), 'ger', '1918-08') === 1, 'GER later');
  check(manpower(s, eco(), 'fra', '1916-03') === 2 && manpower(s, eco(), 'fra', '1918-03') === 1, 'FRA later');
  check(manpower(s, eco(), 'gbr', '1916-03') === 3 && manpower(s, eco(), 'usa') === 2, 'GBR 1916, USA');
  s.resourceMult = { germany: 1.3 };
  check(manpower(s, eco(), 'ger') === Math.round(3 * 1.3), 'difficulty ×1.3');
});

test('economy §19.2: Industry = old munitions + war-economy bonus', () => {
  const s = ecoAt('1915-06');
  const ip = (n, m) => industry(s, eco(), n, m);
  check(ip('ger', '1915-06') === 4 && ip('ger', '1918-06') === 4, 'GER 3 + 1');
  check(ip('fra', '1915-06') === 2 && ip('fra', '1916-06') === 4 && ip('fra', '1917-06') === 5 && ip('fra', '1918-06') === 6,
    'FRA 2 / 3+1 / 4+1 / 5+1');
  check(ip('gbr', '1915-06') === 1 && ip('gbr', '1916-06') === 3 && ip('gbr', '1917-06') === 4, 'GBR 1 / 3 / 4');
  check(ip('usa', '1918-06') === 1, 'USA 1');
});

test('economy §19.2: difficulty multiplies the base only, not the bonus', () => {
  const s = ecoAt('1916-06');
  s.resourceMult = { germany: 1.3, entente: 0.8 };
  check(industry(s, eco(), 'ger') === Math.round(3 * 1.3) + 1, 'GER ' + industry(s, eco(), 'ger'));
  check(industry(s, eco(), 'fra') === Math.round(3 * 0.8) + 1, 'FRA ' + industry(s, eco(), 'fra'));
});

test('economy §19.3: industrial cities change Industry when captured', () => {
  const s = ecoAt('1916-06');
  const before = Object.fromEntries(['ger', 'fra', 'gbr'].map((n) => [n, industry(s, eco(), n)]));
  const lose = (box, side, n, change) => {
    const t = copyOf(s); t.boxes[box].owner = side;
    check(industry(t, eco(), n) === before[n] + change, `${box}: ${n} ${industry(t, eco(), n)}`);
    return t;
  };
  lose('l07-e3', 'germany', 'fra', -3);   // Paris
  lose('l06-e3', 'germany', 'fra', -1);   // Amiens
  lose('l01-e3', 'germany', 'gbr', -2);   // Channel Ports
  const lille = lose('l03-g2', 'entente', 'ger', -1);
  check(industry(lille, eco(), 'fra') === before.fra + 1, 'Lille retaken: FRA +1');
  lose('l11-g3', 'entente', 'ger', -2);   // Metz
  lose('l10-g3', 'entente', 'ger', -1);   // Sedan–Mézières
  check(cityEffects(s, eco()).length === 6 && !cityEffects(s, eco()).some((c) => c.lost), 'six cities, none lost at the start');
});

test('economy §19.3: Industry never goes below 0', () => {
  const s = ecoAt('1915-06');
  s.boxes['l07-e3'].owner = 'germany'; s.boxes['l06-e3'].owner = 'germany';
  const p = industryParts(s, eco(), 'fra');
  check(p.base + p.bonus + p.cities === -2 && p.total === 0, JSON.stringify(p));
});

test('economy §19.4: the stockpile starts empty, holds at most 3 and carries over', () => {
  let s = newGame(data.scenario, 5, eco(), { player: 'germany', level: 'regular' });
  check(Object.values(s.resources).every((r) => r.munitions === 0), 'empty at the start');
  s = beginGame(s, eco());
  check(s.pendingBudget.join() === 'germany' && s.resources.ger.munitions === 0, 'the German budget waits');
  check(s.resources.fra.munitions === 2 && s.resources.gbr.munitions === 1, 'the computer bought munitions with all its Industry');
  s = submitBudget(s, eco(), 'germany', { ger: { munitions: 3, research: 0 } });
  check(s.resources.ger.munitions === 3 && !s.pendingBudget, 'stockpile 3');
  // play on to January: the stockpile is still there when the next budget comes
  for (let i = 0; i < 20 && !s.pendingBudget; i++) s = endPhase(s, eco());
  check(currentMonth(s) === '1915-01' && s.pendingBudget, 'January budget waits');
  check(s.resources.ger.munitions === 3, 'carried over: ' + s.resources.ger.munitions);
  check(checkBudget(s, eco(), 'ger', { munitions: 1, research: 0 }).length > 0, 'no room for more than 3');
});

test('economy §19.4: barrages spend the stockpile; unspent Industry is lost', () => {
  const s = ecoAt('1915-04', { player: 'both' });
  s.phase = phaseIndex('entente-attack');
  s.resources.fra.munitions = 2;
  const out = resolveAttack(s, eco(), { target: 'l06-g1', units: ['fra-03'], munitions: 2 });
  check(out.state.resources.fra.munitions === 0, 'spent from the stockpile');
  const t = ecoAt('1916-06');
  applyBudget(t, eco(), 'ger', { munitions: 1, research: 0 });
  check(t.budget.ger.industry === 4 && t.budget.ger.unspent === 3 && t.resources.ger.munitions === 1, JSON.stringify(t.budget.ger));
});

test('economy §19.4: a budget that breaks the rules is refused', () => {
  const s = ecoAt('1916-06');
  check(checkBudget(s, eco(), 'ger', { munitions: 3, research: 2, tech: null }).some((p) => p.includes('more than')), 'overspending');
  check(checkBudget(s, eco(), 'ger', { munitions: 0, research: 2, tech: 'defence-in-depth' }).length > 0, 'before its earliest date');
  check(checkBudget(s, eco(), 'ger', { munitions: 0, research: 2, tech: 'landships' }).length > 0, 'another nation\'s tech');
  check(checkBudget(s, eco(), 'ger', { munitions: -1, research: 0 }).length > 0, 'negative');
  check(checkBudget(s, eco(), 'ger', { munitions: 2, research: 0 }).length === 0, 'a fair budget is fine');
  let threw = false;
  try { applyBudget(s, eco(), 'ger', { munitions: 9, research: 0 }); } catch (e) { threw = true; }
  check(threw && s.resources.ger.munitions === 0, 'applyBudget throws and changes nothing');
});

test('economy §19.5: research only between the earliest and historical dates', () => {
  const ids = (m, n) => researchOptions(ecoAt(m), eco(), n).map((t) => t.id).join();
  check(ids('1915-12', 'fra') === '', 'nothing in 1915');
  check(ids('1916-01', 'fra') === 'creeping-barrage,heavy-artillery' && ids('1916-01', 'gbr') === 'creeping-barrage', 'Jan 1916');
  check(ids('1916-06', 'gbr') === 'landships', 'creeping barrage arrived historically in June 1916');
  check(ids('1916-06', 'ger') === '' && ids('1916-07', 'ger') === 'defence-in-depth', 'Defence in depth from Jul 1916');
  check(ids('1918-01', 'ger') === 'a7v' && ids('1918-01', 'fra') === 'renault-ft,heavy-artillery', '1918');
});

test('economy §19.5: progress carries over; a tech completes when it reaches its cost', () => {
  const s = ecoAt('1916-03');
  applyBudget(s, eco(), 'gbr', { munitions: 0, research: 3, tech: 'landships' });
  check(s.research.landships === 3 && !s.techs.includes('landships'), '3 of 10');
  s.turn += 1;
  const tanks = tanksOf(s, 'gbr');
  applyBudget(s, eco(), 'gbr', { munitions: 0, research: 3, tech: 'landships' });
  s.research.landships = 7; s.turn += 1;
  applyBudget(s, eco(), 'gbr', { munitions: 0, research: 3, tech: 'landships' });
  check(s.techs.includes('landships') && tanksOf(s, 'gbr') === tanks + 1, 'Landships ready: the first British tank arrives');
  check(s.log.some((l) => (l.text || l).toString().includes('Landships')), 'logged');
});

test('economy §19.5: a researched tech\'s historical event doesn\'t happen twice', () => {
  const s = ecoAt('1916-09');
  s.phase = 0; s.eventsDone = []; s.techs = ['landships'];
  const before = tanksOf(s, 'gbr');
  runEvents(s, eco());
  check(tanksOf(s, 'gbr') === before, 'no September 1916 tank: ' + tanksOf(s, 'gbr'));
  check(replacedByResearch(s, eco(), { reinforcement: { month: '1916-09', nation: 'gbr', type: 'tanks' } }), 'replaced');
  const t = ecoAt('1916-09'); t.phase = 0; t.eventsDone = [];
  runEvents(t, eco());
  check(tanksOf(t, 'gbr') === before + 1, 'without research it arrives on time');
  const u = ecoAt('1918-01'); u.phase = 0; u.eventsDone = []; u.techs = ['stormtroop-tactics'];
  runEvents(u, eco());
  check(u.units.filter((x) => x.type === 'stormtroopers').length === 0, 'no second Stormtrooper conversion');
  const r = ecoAt('1918-06'); r.phase = 0; r.eventsDone = []; r.techs = ['renault-ft'];
  const fra = tanksOf(r, 'fra');
  runEvents(r, eco());
  check(tanksOf(r, 'fra') === fra, 'no second June 1918 Renault');
});

test('economy §19.5: each tech does what RULES.md says', () => {
  // Creeping barrage: max 3 for the Entente only, and France and Britain share it
  let s = ecoAt('1916-02');
  s.research = { 'creeping-barrage': 5 };
  applyBudget(s, eco(), 'gbr', { munitions: 0, research: 3, tech: 'creeping-barrage' });
  check(barrageMax(eco(), '1916-02', s, 'entente') === 3 && barrageMax(eco(), '1916-02', s, 'germany') === 2, 'max 3, Entente only');
  check(!researchOptions(s, eco(), 'fra').some((t) => t.id === 'creeping-barrage'), 'France has it too');
  check(barrageMax(eco(), '1916-06', ecoAt('1916-06'), 'entente') === 3, 'free in June 1916');
  // Heavy artillery programme: France +1 IP a month
  s = ecoAt('1916-06');
  const ip = industry(s, eco(), 'fra');
  s.research = { 'heavy-artillery': 9 };
  applyBudget(s, eco(), 'fra', { munitions: 0, research: 1, tech: 'heavy-artillery' });
  check(industry(s, eco(), 'fra') === ip + 1, 'FRA +1 IP');
  // Defence in depth: works from research, before Jan 1917
  s = atWar('1916-10', 'entente');
  s.techs = ['defence-in-depth'];
  s.boxes['l06-g1'].trench = 2;
  const plan = planAttack(s, eco(), { target: 'l06-g1', units: ['fra-03'] });
  applyCombatResult(s, eco(), plan, { a: 1, d: 0, r: false });
  check(unit(s, 'fra-03').steps === 2, 'researched early: +1 attacker loss in October 1916');
  check(techActive(ecoAt('1917-01'), eco(), 'defence-in-depth'), 'free in January 1917');
  // Stormtroop tactics: up to 4 infantry units convert
  s = ecoAt('1917-08');
  s.research = { 'stormtroop-tactics': 9 };
  applyBudget(s, eco(), 'ger', { munitions: 0, research: 1, tech: 'stormtroop-tactics' });
  check(s.units.filter((u) => u.type === 'stormtroopers').length === 4, 'four Stormtroopers');
  // A7V: Germany's one tank
  s = ecoAt('1918-02');
  s.research = { a7v: 10 };
  applyBudget(s, eco(), 'ger', { munitions: 0, research: 2, tech: 'a7v' });
  check(tanksOf(s, 'ger') === 1, 'one German tank');
});

test('economy §19.7: the computer tops up munitions to 3, then ≤3 IP into the cheapest tech', () => {
  let s = ecoAt('1916-08');
  s.resources.ger.munitions = 1;
  let b = autoBudget(s, eco(), 'ger', 3);
  check(b.munitions === 2 && b.research === 2 && b.tech === 'defence-in-depth', JSON.stringify(b));
  s = ecoAt('1918-02');
  s.resources.fra.munitions = 3;
  b = autoBudget(s, eco(), 'fra', 3);
  check(b.munitions === 0 && b.research === 3 && b.tech === 'renault-ft', 'cheapest tech, 3 IP: ' + JSON.stringify(b));
  b = autoBudget(s, eco(), 'fra');
  check(b.research === 6, 'a player\'s Auto-allocate has no 3 IP cap: ' + JSON.stringify(b));
  s.research = { 'renault-ft': 6 };
  check(autoBudget(s, eco(), 'fra').research === 2, 'never more than the tech still needs');
  check(autoBudget(ecoAt('1915-03'), eco(), 'gbr', 3).research === 0, 'nothing to research in 1915');
});

test('economy §19.4: the War Office phase — the computer spends, a player\'s budget waits', () => {
  const s = ecoAt('1916-08', { player: 'entente', level: 'regular' });
  warOfficePhase(s, eco());
  check(s.pendingBudget.join() === 'entente' && s.budget.ger && !s.budget.fra, 'German budget spent, Entente waits');
  check(endPhase(s, eco()) === s, 'End Phase waits for the budget');
  check(newGame(data.scenario, 1, eco(), { player: 'entente', level: 'recruit' }).autoAllocate.entente === true, 'Recruit: Auto-allocate on');
  check(newGame(data.scenario, 1, eco(), { player: 'entente', level: 'regular' }).autoAllocate.entente === false, 'Regular: off');
  check(newGame(data.scenario, 1, eco(), { player: 'both' }).autoAllocate.germany === true, 'hot seat: on');
});

test('economy §19.4: signing the budget carries on with the turn', () => {
  let s = beginGame(newGame(data.scenario, 2, eco(), { player: 'entente', level: 'regular' }), eco());
  check(s.pendingBudget.join() === 'entente' && phaseOf(s, eco()).id === 'germany-move', 'waits before Germany moves');
  let threw = false;
  try { submitBudget(s, eco(), 'entente', { fra: { munitions: 5, research: 0 } }); } catch (e) { threw = true; }
  check(threw, 'a bad budget is refused');
  s = submitBudget(s, eco(), 'entente', { fra: { munitions: 2, research: 0 }, gbr: { munitions: 1, research: 0 } }, { auto: true });
  check(!s.pendingBudget && phaseOf(s, eco()).id === 'entente-move', 'Germany played its turn: ' + phaseOf(s, eco()).id);
  check(s.resources.fra.munitions === 2 && s.autoAllocate.entente, 'stockpile bought, Auto-allocate on');
});

test('economy §19.6: research expected month at this month\'s rate, or its historical date', () => {
  const s = ecoAt('1916-03');
  s.research = { landships: 4 };
  check(expectedMonth(s, eco(), 'landships', 3) === '1916-05', '6 more IP at 3 a month');
  check(expectedMonth(s, eco(), 'landships', 0) === '1916-09', 'no spending: historical date');
  check(expectedMonth(s, eco(), 'heavy-artillery', 0) === null, 'never, without spending');
});

test('economy: German starting Will is 108 (RULES.md §11)', () => {
  check(data.nations.nations.find((n) => n.id === 'ger').startWill === 108, '108');
});

test('saves: a version 4 save gets the war economy (stockpile at most 3)', () => {
  const v4 = copyOf(started());
  v4.version = 4; delete v4.research; delete v4.techs; delete v4.budget; delete v4.autoAllocate;
  v4.resources.ger.munitions = 5;
  const up = migrateState(v4, data.scenario, eco());
  check(up.version === STATE_VERSION && up.resources.ger.munitions === 3 && up.techs.length === 0 && up.autoAllocate.germany,
    JSON.stringify(up.resources.ger));
  check(checkState(up, eco()).length === 0, checkState(up, eco()).join());
});

test('economy: the same seed gives the same war (computer vs computer, a year)', () => {
  const play = () => {
    let s = newGame(data.scenario, 11, eco());
    s.controllers = { germany: 'ai', entente: 'ai' };
    s.aiSkill = { germany: 'standard', entente: 'standard' };
    s = beginGame(s, eco());
    for (let i = 0; i < 400 && currentMonth(s) < '1916-12' && !s.over; i++) s = endPhase(s, eco());
    return s;
  };
  const a = play(); const b = play();
  check(JSON.stringify(a) === JSON.stringify(b), 'identical');
  check(Object.keys(a.research).length > 0, 'the computer researched: ' + JSON.stringify(a.research));
});

// ---------------------------------------------------------------- bug check: a turn-1 attack, start to finish
// Entente, December 1914: three French units stacked in the Somme front line attack
// l06-g1 with a 2-munition barrage. Every seed is tried in order until one takes the box
// and one is repulsed, so both outcomes are checked with fixed seeds.
function turnOneAttack(seed) {
  let s = newGame(data.scenario, seed, eco(), { player: 'entente', level: 'regular' });
  s = beginGame(s, eco());
  s = submitBudget(s, eco(), 'entente', { fra: { munitions: 2, research: 0 }, gbr: { munitions: 1, research: 0 } });
  s = endPhase(s, eco());                                    // Entente move → Entente attack
  const t = copyOf(s);
  const french = t.units.filter((u) => u.nation === 'fra' && ['l07-e1', 'l06-e2'].includes(u.box)).slice(0, 2);
  for (const u of french) u.box = 'l06-e1';                 // stack three in the Somme front line
  return t;
}
function attackOutcome(seed) {
  const s = turnOneAttack(seed);
  const units = eligibleAttackers(s, eco(), 'l06-g1');
  const before = copyOf(s);
  const out = resolveAttack(s, eco(), { target: 'l06-g1', units, munitions: 2 });
  return { before, after: out.state, r: out.result, units };
}

test('bug check: a stacked turn-1 attack resolves fully (taken)', () => {
  let found = null;
  for (let seed = 1; seed < 80 && !found; seed++) { const o = attackOutcome(seed); if (o.r.taken) found = o; }
  check(found, 'some seed takes the box');
  const { before, after, r, units } = found;
  check(units.length === 3 && r.plan.columnLabel === '3:1', 'three units at 3:1: ' + r.plan.columnLabel);
  const steps = (st, ids) => ids.reduce((a, id) => a + ((st.units.find((u) => u.id === id) || {}).steps || 0), 0);
  check(steps(before, units) - steps(after, units) === Object.values(r.attackerLost).reduce((a, b) => a + b, 0), 'attacker losses applied');
  check(after.boxes['l06-g1'].owner === 'entente' && after.boxes['l06-g1'].trench === 0, 'owner changed, trench 0');
  check(r.advanced.length >= 1 && r.advanced.length <= 2 && r.advanced.every((m) => after.units.find((u) => u.id === m.unit).box === 'l06-g1'),
    'up to 2 attackers advanced: ' + JSON.stringify(r.advanced));
  for (const m of r.retreats) check(after.units.find((u) => u.id === m.unit).box === m.to && after.boxes[m.to].owner === 'germany', 'defender fell back to ' + m.to);
  check(!after.units.some((u) => u.nation === 'ger' && u.box === 'l06-g1'), 'no German left in the box');
  check(after.resources.fra.op === before.resources.fra.op - 1 && after.resources.fra.munitions === before.resources.fra.munitions - 2, 'OP and munitions spent');
  check(r.ownerBefore === 'germany' && r.ownerAfter === 'entente', 'owners recorded for the report');
});

test('bug check: a stacked turn-1 attack resolves fully (repulsed)', () => {
  let found = null;
  for (let seed = 1; seed < 80 && !found; seed++) { const o = attackOutcome(seed); if (!o.r.taken) found = o; }
  check(found, 'some seed is repulsed');
  const { after, r } = found;
  check(after.boxes['l06-g1'].owner === 'germany' && r.advanced.length === 0 && r.retreats.length === 0, 'nothing moved');
  check(Object.values(r.defenderLost).reduce((a, b) => a + b, 0) === r.d || r.d > 4, 'defender losses applied');
});

// ---------------------------------------------------------------- explaining attacks (js/engine/explain.js)
test('explain: each roll\'s outcome adds up to the slip\'s chance of taking it', () => {
  const s = turnOneAttack(4);
  const units = eligibleAttackers(s, eco(), 'l06-g1');
  for (const mun of [0, 1, 2]) {
    const order = { target: 'l06-g1', units, munitions: mun };
    const { rolls } = rollOutcomes(s, eco(), order);
    const p = rolls.filter((r) => r.taken).reduce((a, r) => a + r.chance, 0);
    check(rolls.length === 11 && Math.abs(p - oddsPreview(s, eco(), order).pTake) < 1e-9, `barrage ${mun}`);
  }
  const advice = attackAdvice(s, eco(), { target: 'l06-g1', units, munitions: 2 });
  check(advice.rollLine === 'You take it on a roll of 7 or more on two dice (58%).', advice.rollLine);
  check(advice.fixes.some((f) => f.startsWith('Winter -1: winter ends in March')), advice.fixes.join(' | '));
});

test('explain: a dug-in box with 8 steps is 0% and says why', () => {
  const s = atWar('1916-04', 'entente');
  s.boxes['l06-g1'].trench = 3;
  place(s, 'ger-07', 'l06-g1');   // two German units: 8 steps
  place(s, 'fra-04', 'l06-e1');
  const units = eligibleAttackers(s, eco(), 'l06-g1');
  const a = attackAdvice(s, eco(), { target: 'l06-g1', units, munitions: 0 });
  check(a.pTake === 0 && a.rollLine.startsWith('No roll'), a.rollLine);
  check(a.why[0].includes('dug in (trench 3)') && a.why[0].includes('all 8 steps'), a.why[0]);
  check(a.futileLine.includes('loses 3 Will'), 'futile warning: ' + a.futileLine);
});

test('explain: how many more steps reach the next column', () => {
  const s = turnOneAttack(4);
  const one = s.units.find((u) => u.box === 'l06-e1' && u.nation === 'fra').id;
  const a = attackAdvice(s, eco(), { target: 'l06-g1', units: [one], munitions: 0 });
  check(a.fixes.some((f) => f.includes('2 more steps would reach 3:2')), a.fixes.join(' | '));
});

test('explain: Best attacks picks the stacked Somme attack with a full barrage', () => {
  const s = turnOneAttack(4);
  const best = bestAttacks(s, eco(), 'entente');
  check(best.length === 3, 'three suggestions');
  check(best[0].target === 'l06-g1' && best[0].units.length === 3 && best[0].munitions === 2 && best[0].columnLabel === '3:1',
    JSON.stringify(best[0]));
  check(best[0].pTake >= best[1].pTake && best[1].pTake >= best[2].pTake, 'ranked');
});

// ---------------------------------------------------------------- pieces (STYLE.md §5)
test('rule: every unit type has a silhouette for its piece', () => {
  const types = data.unitTypes.types;
  for (const t of types) check(SILHOUETTES[t.symbol], `no silhouette for "${t.symbol}"`);
});

test('rule: each side says which way its soldiers face', () => {
  for (const side of data.nations.sides) check(['left', 'right'].includes(side.faces), `${side.id} has no "faces"`);
});

test('rule: piece shades are palette colours mixed with paper or ink', () => {
  check(mix('#6B6E63', '#2B241C', 0) === '#6B6E63', 'mixing 0 keeps the colour');
  check(mix('#6B6E63', '#2B241C', 1) === '#2B241C', 'mixing 1 gives the other colour');
  check(isDark('#6B6E63') && !isDark('#6F8FAF'), 'field grey is dark, horizon blue is light');
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
    data.events = await loadJson('data/events.json');
    data.ai = await loadJson('data/ai.json');
    data.headlines = await loadJson('data/headlines.json');
    data.economy = await loadJson('data/economy.json');
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
