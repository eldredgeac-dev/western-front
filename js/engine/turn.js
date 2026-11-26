// turn.js — the turn loop (RULES.md §7). A turn is one month; its phases are listed
// in data/phases.json. Move and attack phases wait for orders; the others run by
// themselves when End Phase reaches them. Every function returns a NEW state.

import { copyState, currentMonth, monthLabel } from './state.js';
import { resourcesFor, applyDifficulty } from './resources.js';
import { aiMove, aiAttack } from './ai.js';
import { trenchMax, indexBoxes } from './boxes.js';
import { unitsIn } from './units.js';
import { addLog } from './moves.js';
import { supplyPhase } from './systems/supply.js';
import { replacementsPhase } from './systems/replacements.js';
import { willPhase } from './systems/will.js';
import { runEvents } from './events.js';
import { recordMonth } from './history.js';
import { hasEconomy, warOfficePhase, applyBudget } from './systems/economy.js';
import { commandersPhase, answerQuestion } from './commanders.js';
import { chooseOption } from './events.js';

// Clear what units did last turn and hand out this month's resources.
// With the war economy (RULES.md §19) munitions aren't handed out: the stockpile
// carries over, and the War Office phase adds to it (systems/economy.js).
function startOfTurn(state, data) {
  for (const u of state.units) { u.moved = false; u.railed = false; u.attacked = false; }
  state.attackedBoxes = [];
  state.lostDefending = {};             // steps lost defending each box (Falkenhayn, commanders.js)
  for (const id of Object.keys(state.lostThisTurn)) state.lostThisTurn[id] = 0;
  const fresh = applyDifficulty(resourcesFor(data, currentMonth(state)), data, state.resourceMult);
  if (hasEconomy(data)) {
    for (const [id, r] of Object.entries(fresh)) r.munitions = (state.resources[id] || {}).munitions || 0;
  }
  state.resources = fresh;
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
  events: runEvents,
  commanders: commandersPhase,
  'war-office': warOfficePhase,
  supply: supplyPhase,
  'dig-in': digIn,
  replacements: replacementsPhase,
  will: (state, data) => { if (data.victory) willPhase(state, data); },
};

const phasesOf = (data) => data.phases.phases;

// Run automatic phases until we reach one that needs orders (or the game ends).
// Passing the last phase ends the month and starts the next one.
//   record — optional: passed to the computer's moves and attacks (see ai.js)
function settle(state, data, record = null) {
  const phases = phasesOf(data);
  let guard = 0;
  while (!state.over && guard++ < 1000) {
    if (state.phase >= phases.length) {
      recordMonth(state, data);            // the War Office's records (history.js)
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
    if (!phase.auto) {
      // The computer plays its own side's phases; a person's phase waits for orders.
      if (!data.ai || (state.controllers || {})[phase.side] !== 'ai') return state;
      if (phase.kind === 'move') aiMove(state, data, phase.side, record);
      if (phase.kind === 'attack') aiAttack(state, data, phase.side, record);
      if (state.over) return state;
      state.phase += 1;
      continue;
    }
    if (AUTO[phase.id]) AUTO[phase.id](state, data);
    if (state.over) return state;          // someone won
    state.phase += 1;
    if (state.pendingChoice) return state; // a question for the player waits (events.js)
    if (state.pendingBudget) return state; // a War Office budget waits (systems/economy.js)
    if (state.pendingCommander) return state; // a commander question waits (commanders.js)
  }
  return state;
}

// Start a fresh game: run the opening automatic phases so it waits at the first
// phase that needs orders (the German move).
export function beginGame(state, data, options = {}) {
  const next = copyState(state);
  addLog(next, `${monthLabel(currentMonth(next))} begins.`);
  return settle(next, data, options.record || null);
}

// The player presses End Phase: move on to the next phase that needs orders,
// running any automatic phases (and the end of the month) on the way.
//   options.record(action, state) — optional, see ai.js (the screen uses it to play
//   the computer's turn back). Queued orders that weren't committed are dropped.
export function endPhase(state, data, options = {}) {
  if (state.over || state.pendingChoice || state.pendingBudget || state.pendingCommander) return state;
  const next = copyState(state);
  next.phase += 1;
  next.orders = [];
  return settle(next, data, options.record || null);
}

// The current phase record from data/phases.json.
export function phaseOf(state, data) {
  return phasesOf(data)[state.phase] || null;
}

// The player signs a side's War Office budget (RULES.md §19.4). Returns a NEW state,
// and carries on with the turn (the computer may move next).
//   budgets — { nationId: { munitions, research, tech } } for each of the side's nations
//   options.auto — true/false turns Auto-allocate on or off for later months
//   options.record — as for endPhase
// Throws an Error if a budget breaks the rules (nothing is changed then).
export function submitBudget(state, data, sideId, budgets, options = {}) {
  if (!(state.pendingBudget || []).includes(sideId)) throw new Error('No budget is waiting for this side.');
  const next = copyState(state);
  for (const [nationId, budget] of Object.entries(budgets)) applyBudget(next, data, nationId, budget);
  if (options.auto !== undefined) next.autoAllocate = { ...(next.autoAllocate || {}), [sideId]: Boolean(options.auto) };
  next.pendingBudget = next.pendingBudget.filter((s) => s !== sideId);
  if (next.pendingBudget.length) return next;
  delete next.pendingBudget;
  return settle(next, data, options.record || null);
}

// The player answers an event's question (the U-boats, the Hindenburg Line). Returns a
// NEW state, and carries on with the turn from the phase after the events (so the
// commanders and the War Office budget still happen this month).
//   options.record — as for endPhase
export function answerEvent(state, data, optionId, options = {}) {
  const next = chooseOption(state, data, optionId);
  return settle(next, data, options.record || null);
}

// The player answers "Replace X with Y?" (RULES.md §15.2) for a holder (a nation, or
// a side for a card like Foch's). `choice` is a card id, or 'keep'. Returns a NEW
// state and carries on with the turn once no commander question is left.
// Throws an Error if the answer isn't allowed (nothing is changed then).
export function answerCommander(state, data, key, choice, options = {}) {
  const next = copyState(state);
  answerQuestion(next, data, key, choice);
  if (next.pendingCommander) return next;
  return settle(next, data, options.record || null);
}
