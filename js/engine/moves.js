// moves.js — moving units (RULES.md §8).
//   Normal move: 1 box into an adjacent friendly box, within stacking.
//   Rail move: any distance through connected friendly boxes; each nation has a
//   number of rail moves per turn. A unit that rail-moves can't attack this turn.
// Each unit moves once per turn (normal or rail), and units that attacked can't move.
// Every function returns a NEW state; the one passed in is never changed.

import { findUnit, sideOfUnit, stackRoom } from './units.js';
import { copyState, currentMonth } from './state.js';
import { indexBoxes, boxName } from './boxes.js';

// A lookup { boxId: box } for the map, made once per map.
const boxIndex = new WeakMap();
function boxesOf(data) {
  if (!boxIndex.has(data.map)) boxIndex.set(data.map, indexBoxes(data.map));
  return boxIndex.get(data.map);
}

// The phase we're in (data/phases.json), or null if phases aren't loaded.
export function currentPhase(state, data) {
  return data.phases ? data.phases.phases[state.phase] : null;
}

// May this unit be given an order of this kind ("move" or "attack") right now?
// Only in its own side's phase of that kind.
export function phaseAllows(state, data, unit, kind) {
  const phase = currentPhase(state, data);
  if (!phase) return true;                      // no phase data: allow (used by tests)
  return !state.over && !state.pendingChoice && phase.kind === kind && phase.side === sideOfUnit(data, unit);
}

// Why this unit can't move at all right now, or null if it can.
function cannotMoveReason(state, data, unit) {
  if (!phaseAllows(state, data, unit, 'move')) return 'It is not this side’s move phase.';
  if (unit.attacked) return 'This unit has attacked this turn.';
  if (unit.moved || unit.railed) return 'This unit has already moved this turn.';
  return null;
}

// Boxes the unit can reach with a normal move.
export function moveTargets(state, data, unitId) {
  const unit = findUnit(state, unitId);
  if (!unit || cannotMoveReason(state, data, unit)) return [];
  const side = sideOfUnit(data, unit);
  const here = boxesOf(data)[unit.box];
  return here.neighbours.filter((id) => state.boxes[id].owner === side && stackRoom(state, data, id) > 0);
}

// Boxes the unit can reach by rail: any friendly box with room that is joined to
// its box by a chain of friendly boxes (found by a breadth-first search).
export function railTargets(state, data, unitId) {
  const unit = findUnit(state, unitId);
  if (!unit || cannotMoveReason(state, data, unit)) return [];
  if (!state.resources[unit.nation] || state.resources[unit.nation].rail <= 0) return [];
  const side = sideOfUnit(data, unit);
  const boxes = boxesOf(data);
  const seen = new Set([unit.box]);
  const queue = [unit.box];
  while (queue.length) {
    const id = queue.shift();
    for (const n of boxes[id].neighbours) {
      if (!seen.has(n) && state.boxes[n].owner === side) { seen.add(n); queue.push(n); }
    }
  }
  seen.delete(unit.box);
  return [...seen].filter((id) => stackRoom(state, data, id) > 0);
}

// Add a line to the game log.
export function addLog(state, text) {
  state.log.push({ turn: state.turn, month: currentMonth(state), text });
}

// A short description of a unit for the log: "French infantry (fra-03)".
export function unitLabel(data, unit) {
  const nation = data.nations.nations.find((n) => n.id === unit.nation);
  const type = data.unitTypes.types.find((t) => t.id === unit.type);
  return `${nation.adjective || nation.name} ${type.name.toLowerCase()}`;
}

// Normal move. Throws an Error (with a plain-English message) if it isn't allowed.
export function moveUnit(state, data, unitId, toBox) {
  const unit = findUnit(state, unitId);
  if (!unit) throw new Error('No such unit.');
  const reason = cannotMoveReason(state, data, unit);
  if (reason) throw new Error(reason);
  if (!moveTargets(state, data, unitId).includes(toBox)) {
    throw new Error('A normal move goes 1 box into a friendly box with room.');
  }
  const next = copyState(state);
  const u = findUnit(next, unitId);
  const from = u.box;
  u.box = toBox;
  u.moved = true;
  addLog(next, `${unitLabel(data, u)} moved from ${boxName(data.map, boxesOf(data)[from])} to ${boxName(data.map, boxesOf(data)[toBox])}.`);
  return next;
}

// Rail move. Throws an Error if it isn't allowed.
export function railMove(state, data, unitId, toBox) {
  const unit = findUnit(state, unitId);
  if (!unit) throw new Error('No such unit.');
  const reason = cannotMoveReason(state, data, unit);
  if (reason) throw new Error(reason);
  if (!state.resources[unit.nation] || state.resources[unit.nation].rail <= 0) {
    throw new Error('No rail moves left for this nation this turn.');
  }
  if (!railTargets(state, data, unitId).includes(toBox)) {
    throw new Error('A rail move needs a chain of friendly boxes and room at the end.');
  }
  const next = copyState(state);
  const u = findUnit(next, unitId);
  const from = u.box;
  u.box = toBox;
  u.moved = true;
  u.railed = true;
  next.resources[u.nation].rail -= 1;
  addLog(next, `${unitLabel(data, u)} went by rail from ${boxName(data.map, boxesOf(data)[from])} to ${boxName(data.map, boxesOf(data)[toBox])}.`);
  return next;
}
