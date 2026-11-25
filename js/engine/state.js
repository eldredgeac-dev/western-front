// state.js — creating the game state.
// The state is a plain object that can be saved as JSON. Everything that changes
// during a game lives here; everything that never changes lives in data/*.json.

import { resourcesFor } from './resources.js';

// Bump this whenever the shape of the state changes, so old saves can be
// recognised and upgraded (Milestone 8).
//   1: owners and trenches only (Milestone 2)
//   2: units, Will, resources, the dice, the phase and the log (Milestones 3–5)
export const STATE_VERSION = 2;

// Build a brand-new game from a scenario (data/scenarios/*.json).
//   seed — any whole number; it drives every dice roll (js/engine/rng.js)
//   data — the data files: { nations, unitTypes, phases, ... } (optional pieces are
//          skipped, so older tests that only pass a scenario still work)
export function newGame(scenario, seed, data = {}) {
  const boxes = {};
  for (const [id, start] of Object.entries(scenario.boxes)) {
    // Copy each box so changing the game never changes the scenario data.
    boxes[id] = { owner: start.owner, trench: start.trench };
  }
  const units = (scenario.units || []).map((u) => {
    const type = data.unitTypes ? data.unitTypes.types.find((t) => t.id === u.type) : null;
    return {
      id: u.id, nation: u.nation, type: u.type, box: u.box,
      steps: u.steps ?? (type ? type.maxSteps : 4),
      quality: u.quality || 'regular',
      // what the unit has done this turn (cleared at the start of each turn)
      moved: false, railed: false, attacked: false,
    };
  });
  const state = {
    version: STATE_VERSION,
    scenario: scenario.id,
    seed,
    rng: seed >>> 0,          // the dice generator's memory (js/engine/rng.js)
    turn: 1,
    turns: scenario.turns,
    startMonth: scenario.startMonth,
    phase: 0,                 // index into data/phases.json
    over: false,
    boxes,
    units,
    pool: {},                 // destroyed units waiting to be rebuilt, per nation
    will: {},                 // National Will per nation (RULES.md §11)
    resources: {},            // this turn's OP, munitions, RP and rail moves per nation
    attackedBoxes: [],        // boxes attacked this turn (they don't dig in)
    lostThisTurn: {},         // steps lost this turn per nation
    battles: [],              // the battle record (js/engine/battles.js)
    log: [],
  };
  if (data.nations) {
    for (const n of data.nations.nations) {
      if (n.startWill !== null && n.startWill !== undefined && !n.entersLater) state.will[n.id] = n.startWill;
      state.pool[n.id] = 0;
      state.lostThisTurn[n.id] = 0;
    }
    state.resources = resourcesFor(data, currentMonth(state));
  }
  return state;
}

// The month ("YYYY-MM") of the current turn. Turn 1 is the scenario's start month.
export function currentMonth(state) {
  return addMonths(state.startMonth, state.turn - 1);
}

// A month plus some months: addMonths("1914-12", 1) = "1915-01".
export function addMonths(month, n) {
  const [year, m] = month.split('-').map(Number);
  const total = year * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

// A month like "1914-12" as words: "December 1914".
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
export function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

// A deep copy of the state. Engine functions never change the state they are
// given; they copy it, change the copy and return that.
export function copyState(state) {
  return JSON.parse(JSON.stringify(state));
}

// ---------------------------------------------------------------- saved games
// Bring a saved state up to the current version (RULES.md has nothing on this;
// it's housekeeping). Returns a new state, or throws an Error if it can't.
//   saved    — the state as read from a save
//   scenario — the scenario it was started from
//   data     — the data files (as for newGame)
export function migrateState(saved, scenario, data) {
  if (!saved || typeof saved !== 'object') throw new Error('This isn’t a saved game.');
  const version = saved.version;
  if (typeof version !== 'number') throw new Error('This saved game has no version number.');
  if (version > STATE_VERSION) throw new Error('This game was saved by a newer version of the game. Reload the page and try again.');
  let state = copyState(saved);
  if (version < 2) {
    // Version 1 only knew owners and trenches. Start the rest fresh from the
    // scenario, keeping the month, the owners and the trenches.
    const fresh = newGame(scenario, state.seed || 1, data);
    fresh.turn = state.turn || 1;
    for (const [id, box] of Object.entries(state.boxes || {})) if (fresh.boxes[id]) fresh.boxes[id] = { ...box };
    // drop starting units that would now stand in enemy territory
    const sideOf = (nation) => data.nations.nations.find((n) => n.id === nation).side;
    fresh.units = fresh.units.filter((u) => fresh.boxes[u.box].owner === sideOf(u.nation));
    fresh.migratedFrom = 1;
    state = fresh;
  }
  state.version = STATE_VERSION;
  return state;
}

// Check a state makes sense before playing it. Returns a list of problems in plain
// English (empty = fine).
export function checkState(state, data) {
  const problems = [];
  if (!state || typeof state !== 'object') return ['not a game'];
  if (state.version !== STATE_VERSION) problems.push(`version ${state.version}, expected ${STATE_VERSION}`);
  if (!Number.isInteger(state.turn) || state.turn < 1 || state.turn > (state.turns || 48)) problems.push(`turn ${state.turn} is out of range`);
  const sides = new Set(data.nations.sides.map((s) => s.id));
  for (const box of data.map.boxes) {
    const b = state.boxes && state.boxes[box.id];
    if (!b) { problems.push(`${box.id} is missing`); continue; }
    if (!sides.has(b.owner)) problems.push(`${box.id} has an unknown owner`);
    if (!Number.isInteger(b.trench) || b.trench < 0 || b.trench > 3) problems.push(`${box.id} has a bad trench level`);
  }
  if (!Array.isArray(state.units)) problems.push('units are missing');
  else {
    const nations = new Set(data.nations.nations.map((n) => n.id));
    const ids = new Set();
    for (const u of state.units) {
      const type = data.unitTypes.types.find((t) => t.id === u.type);
      if (ids.has(u.id)) problems.push(`unit ${u.id} appears twice`);
      ids.add(u.id);
      if (!nations.has(u.nation)) problems.push(`unit ${u.id} has an unknown nation`);
      if (!type) problems.push(`unit ${u.id} has an unknown type`);
      else if (!Number.isInteger(u.steps) || u.steps < 1 || u.steps > type.maxSteps) problems.push(`unit ${u.id} has bad steps`);
      if (!state.boxes || !state.boxes[u.box]) problems.push(`unit ${u.id} is in an unknown box`);
    }
  }
  if (!Number.isFinite(state.rng)) problems.push('the dice are missing');
  return problems;
}
