// moves.js — moving units (RULES.md §8).
//   Road move: up to 2 boxes (data/unit-types.json "roadDistance"), each step to a
//   neighbour, every box on the way friendly; only the end box needs room.
//   Rail move: any distance through connected friendly boxes; each nation has a
//   number of rail moves per turn. A unit that rail-moves can't attack this turn.
// Each unit moves once per turn (normal or rail), and units that attacked can't move.
// Splitting a piece in two, and merging two pieces into one, are here too (§8).
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
  return !state.over && !state.pendingChoice && !state.pendingBudget && phase.kind === kind && phase.side === sideOfUnit(data, unit);
}

// Why this unit can't move at all right now, or null if it can.
function cannotMoveReason(state, data, unit) {
  if (!phaseAllows(state, data, unit, 'move')) return 'It is not this side’s move phase.';
  if (unit.attacked) return 'This unit has attacked this turn.';
  if (unit.moved || unit.railed) return 'This unit has already moved this turn.';
  return null;
}

// Boxes the unit can reach with a road move: up to `roadDistance` steps (2), each to
// a neighbouring friendly box, found by a breadth-first search. A box on the way may be
// full; only the box where the unit stops needs room.
export function moveTargets(state, data, unitId) {
  const unit = findUnit(state, unitId);
  if (!unit || cannotMoveReason(state, data, unit)) return [];
  const side = sideOfUnit(data, unit);
  const boxes = boxesOf(data);
  const reach = data.unitTypes.roadDistance || 1;
  const dist = { [unit.box]: 0 };
  const queue = [unit.box];
  while (queue.length) {
    const id = queue.shift();
    if (dist[id] >= reach) continue;
    for (const n of boxes[id].neighbours) {
      if (!(n in dist) && state.boxes[n].owner === side) { dist[n] = dist[id] + 1; queue.push(n); }
    }
  }
  delete dist[unit.box];
  return Object.keys(dist).filter((id) => stackRoom(state, data, id) > 0);
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
    throw new Error(`A road move goes up to ${data.unitTypes.roadDistance || 1} territories through your own lines, into one with room.`);
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

// ---------------------------------------------------------------- splitting and merging
// RULES.md §8: in its own move phase, a piece of a type with "canSplit" and 2+ steps
// can split in two; two pieces of the same nation and type in one territory can merge
// if their steps fit in one. Neither uses up a move.

// Why this piece can't split now, or null if it can.
export function splitReason(state, data, unitId) {
  const u = findUnit(state, unitId);
  if (!u) return 'No such unit.';
  const type = data.unitTypes.types.find((t) => t.id === u.type);
  if (!phaseAllows(state, data, u, 'move')) return 'Pieces split in their own move phase.';
  if (!type.canSplit) return `${type.name} can't be split.`;
  if (u.attacked) return 'It has attacked this turn.';
  if (u.steps < 2) return 'It has only 1 step.';
  if (stackRoom(state, data, u.box) < 1) return `There's no room for another piece here (${data.unitTypes.stackLimit} at most).`;
  return null;
}

// Split `steps` off a piece into a new piece in the same territory. The new piece has
// the same nation, type, quality and Green date; if the old piece had moved (or gone
// by rail) this turn, so has the new one. Returns { state, newId }.
export function splitUnit(state, data, unitId, steps) {
  const why = splitReason(state, data, unitId);
  if (why) throw new Error(why);
  const unit = findUnit(state, unitId);
  if (!Number.isInteger(steps) || steps < 1 || steps >= unit.steps) throw new Error(`Split off 1 to ${unit.steps - 1} steps.`);
  const next = copyState(state);
  const u = findUnit(next, unitId);
  next.splitCount = (next.splitCount || 0) + 1;
  const piece = { ...u, id: `${u.nation}-s${String(next.splitCount).padStart(2, '0')}`, steps };
  u.steps -= steps;
  next.units.push(piece);
  addLog(next, `${unitLabel(data, u)} split: ${steps} step${steps === 1 ? '' : 's'} formed a new piece in ${boxName(data.map, boxesOf(data)[u.box])}.`);
  return { state: next, newId: piece.id };
}

// Why these two pieces can't merge now, or null if they can.
export function mergeReason(state, data, keepId, otherId) {
  const a = findUnit(state, keepId); const b = findUnit(state, otherId);
  if (!a || !b || a.id === b.id) return 'Choose two different pieces.';
  const type = data.unitTypes.types.find((t) => t.id === a.type);
  if (!phaseAllows(state, data, a, 'move')) return 'Pieces merge in their own move phase.';
  if (a.box !== b.box) return 'They must be in the same territory.';
  if (a.nation !== b.nation || a.type !== b.type) return 'Only pieces of the same nation and type can merge.';
  if (!type.canSplit) return `${type.name} can't be merged.`;
  if (a.attacked || b.attacked) return 'A piece that attacked this turn can’t merge.';
  if (a.steps + b.steps > type.maxSteps) return `Together they would have ${a.steps + b.steps} steps; a piece holds ${type.maxSteps}.`;
  return null;
}

// Merge piece `otherId` into piece `keepId`. The merged piece takes the lower quality
// (and the later Green date), and counts as moved or railed if either was. The other
// piece is gone: it does NOT go to the rebuild pool. Its queued orders are dropped.
export function mergeUnits(state, data, keepId, otherId) {
  const why = mergeReason(state, data, keepId, otherId);
  if (why) throw new Error(why);
  const next = copyState(state);
  const a = findUnit(next, keepId); const b = findUnit(next, otherId);
  const rank = (q) => (data.unitTypes.qualities.find((x) => x.id === q) || {}).rank ?? 1;
  a.steps += b.steps;
  if (rank(b.quality) < rank(a.quality)) a.quality = b.quality;
  if (b.greenUntil && (!a.greenUntil || b.greenUntil > a.greenUntil)) a.greenUntil = b.greenUntil;
  a.moved = a.moved || b.moved;
  a.railed = a.railed || b.railed;
  next.units = next.units.filter((u) => u.id !== otherId);
  next.orders = (next.orders || []).filter((o) => o.unit !== otherId && !(o.units || []).includes(otherId));
  addLog(next, `Two ${unitLabel(data, a)} pieces merged in ${boxName(data.map, boxesOf(data)[a.box])} (${a.steps} steps).`);
  return next;
}
