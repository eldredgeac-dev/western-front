// units.js — facts about units: what type they are, where they are, and how many
// fit in a box. Pure functions only: no page, no randomness.
// `data` is the bundle of data files: { map, unitTypes, nations, ... }.

// The unit type record (data/unit-types.json) for a unit.
export function unitType(data, unit) {
  return data.unitTypes.types.find((t) => t.id === unit.type);
}

// The nation record (data/nations.json) for a nation id, and the side it's on.
export function nationOf(data, nationId) {
  return data.nations.nations.find((n) => n.id === nationId);
}
export function sideOfNation(data, nationId) {
  return nationOf(data, nationId).side;
}
export function sideOfUnit(data, unit) {
  return sideOfNation(data, unit.nation);
}

// All units in a box, in the order they were placed (bottom of the stack first).
export function unitsIn(state, boxId) {
  return state.units.filter((u) => u.box === boxId);
}

// Total steps in a box (attack and defence strength both equal steps, RULES.md §5).
export function stepsIn(state, boxId) {
  return unitsIn(state, boxId).reduce((sum, u) => sum + u.steps, 0);
}

// How many more units fit in a box (RULES.md §5: at most 3).
export function stackRoom(state, data, boxId) {
  return data.unitTypes.stackLimit - unitsIn(state, boxId).length;
}

// Find a unit by id.
export function findUnit(state, unitId) {
  return state.units.find((u) => u.id === unitId);
}

// Take a unit off the map: it was destroyed. It goes to its nation's rebuild pool
// (RULES.md §9.4), unless its type can't be rebuilt (tanks).
export function destroyUnit(state, data, unit) {
  state.units = state.units.filter((u) => u.id !== unit.id);
  if (unitType(data, unit).rebuild) state.pool[unit.nation] = (state.pool[unit.nation] || 0) + 1;
}

// Count steps lost this turn (for National Will, RULES.md §11).
export function recordLoss(state, nationId, steps) {
  state.lostThisTurn[nationId] = (state.lostThisTurn[nationId] || 0) + steps;
}
