// supply.js — is a unit in supply? (RULES.md §9.6)
// A unit is in supply if it can trace a chain of friendly boxes to its side's rear
// column (E3 for the Entente, G3 for Germany). Some nations trace to particular
// boxes instead (GBR: the Channel Ports or Hazebrouck; data/nations.json).
// Out-of-supply units can't attack (Milestone 5) and lose steps (Milestone 7).

import { nationOf, sideOfUnit } from './units.js';
import { indexBoxes } from './boxes.js';

// The rear column of a side: of that side's columns, the one furthest from the front.
export function rearColumn(map, side) {
  const gap = map.columns.findIndex((c) => c.id === map.frontGapAfterColumn) + 0.5;
  const own = map.columns.map((c, i) => ({ c, i })).filter(({ c }) => c.side === side);
  own.sort((a, b) => Math.abs(b.i - gap) - Math.abs(a.i - gap));
  return own[0].c.id;
}

// The boxes a unit of this nation traces supply to.
export function supplySources(data, nationId) {
  const nation = nationOf(data, nationId);
  if (nation.supplySources) return nation.supplySources;
  const rear = rearColumn(data.map, nation.side);
  return data.map.boxes.filter((b) => b.column === rear).map((b) => b.id);
}

// True if the unit can trace friendly boxes from where it stands to a source.
export function inSupply(state, data, unit) {
  const side = sideOfUnit(data, unit);
  const sources = new Set(supplySources(data, unit.nation).filter((id) => state.boxes[id].owner === side));
  if (state.boxes[unit.box].owner !== side) return false;
  const boxes = indexBoxes(data.map);
  const seen = new Set([unit.box]);
  const queue = [unit.box];
  while (queue.length) {
    const id = queue.shift();
    if (sources.has(id)) return true;
    for (const n of boxes[id].neighbours) {
      if (!seen.has(n) && state.boxes[n].owner === side) { seen.add(n); queue.push(n); }
    }
  }
  return false;
}
