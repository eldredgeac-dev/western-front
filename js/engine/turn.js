// turn.js — the turn loop (RULES.md §7). A turn is one month; its phases are listed
// in data/phases.json. Move and attack phases wait for orders; the others run by
// themselves when End Phase reaches them. Every function returns a NEW state.

import { copyState, currentMonth, monthLabel } from './state.js';
import { resourcesFor } from './resources.js';
import { trenchMax, indexBoxes } from './boxes.js';
import { unitsIn } from './units.js';
import { addLog } from './moves.js';
import { supplyPhase } from './systems/supply.js';
import { replacementsPhase } from './systems/replacements.js';
import { willPhase } from './systems/will.js';

// Clear what units did last turn and hand out this month's resources.
function startOfTurn(state, data) {
  for (const u of state.units) { u.moved = false; u.railed = false; u.attacked = false; }
  state.attackedBoxes = [];
  for (const id of Object.keys(state.lostThisTurn)) state.lostThisTurn[id] = 0;
  state.resources = resourcesFor(data, currentMonth(state));
}

// Dig in (RULES.md §7 step 5): every box with units that was not attacked this turn
// gains +1 trench, up to the maximum for its terrain and the month (§9.5).
export function digIn(state, data) {
  const month = currentMonth(state);
  const boxes = indexBoxes(data.map);
  let deepened = 0;
  for (const [id, box] of Object.entries(state.boxes)) {
    if (unitsIn(state, id).length === 0 || state.attackedBoxes.includes(id)) continue;
    const max = trenchMax(boxes[id], data.terrain, month);
    if (box.trench < max) { box.trench += 1; deepened += 1; }
  }
  if (deepened) addLog(state, `Trenches were deepened in ${deepened} territor${deepened === 1 ? 'y' : 'ies'}.`);
}

// What each automatic phase does. Phases not listed here only exist as a step in
// the turn until their milestone arrives (see "until" in data/phases.json).
const AUTO = {
  supply: supplyPhase,
  'dig-in': digIn,
  replacements: replacementsPhase,
  will: (state, data) => { if (data.victory) willPhase(state, data); },
};

const phasesOf = (data) => data.phases.phases;

// Run automatic phases until we reach one that needs orders (or the game ends).
// Passing the last phase ends the month and starts the next one.
function settle(state, data) {
  const phases = phasesOf(data);
  let guard = 0;
  while (!state.over && guard++ < 1000) {
    if (state.phase >= phases.length) {
      if (state.turn >= state.turns) {
        if (!state.over) { state.over = true; addLog(state, 'The armistice: the war is over.'); }
        return state;
      }
      state.turn += 1;
      state.phase = 0;
      startOfTurn(state, data);
      addLog(state, `${monthLabel(currentMonth(state))} begins.`);
    }
    const phase = phases[state.phase];
    if (!phase.auto) return state;          // waits for orders
    if (AUTO[phase.id]) AUTO[phase.id](state, data);
    if (state.over) return state;          // someone won
    state.phase += 1;
  }
  return state;
}

// Start a fresh game: run the opening automatic phases so it waits at the first
// phase that needs orders (the German move).
export function beginGame(state, data) {
  const next = copyState(state);
  addLog(next, `${monthLabel(currentMonth(next))} begins.`);
  return settle(next, data);
}

// The player presses End Phase: move on to the next phase that needs orders,
// running any automatic phases (and the end of the month) on the way.
export function endPhase(state, data) {
  if (state.over) return state;
  const next = copyState(state);
  next.phase += 1;
  return settle(next, data);
}

// The current phase record from data/phases.json.
export function phaseOf(state, data) {
  return phasesOf(data)[state.phase] || null;
}
