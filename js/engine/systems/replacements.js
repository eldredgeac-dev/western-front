// systems/replacements.js — spending Replacement Points (RULES.md §9.6, §14 step 1).
//   1 RP adds +1 step to an in-supply unit.
//   2 RP rebuild a destroyed unit at 1 step in a rear box (pending rule fix 11: as the
//   nation's basic infantry, Regular).
// For now RP are spent automatically for both sides, the way the computer does it:
// the weakest units in the most threatened boxes first, then rebuilds.

import { inSupply, supplySources } from '../supply.js';
import { unitType, unitsIn, sideOfNation, stackRoom } from '../units.js';
import { indexBoxes } from '../boxes.js';
import { addLog, unitLabel } from '../moves.js';

// How threatened a box is (RULES.md §14 step 2): adjacent enemy steps − own steps
// − 2 × trench + 0.3 × VP, +6 if it's empty.
export function threat(state, data, boxId) {
  const boxes = indexBoxes(data.map);
  const box = boxes[boxId];
  const side = state.boxes[boxId].owner;
  let enemy = 0;
  for (const n of box.neighbours) {
    if (state.boxes[n].owner !== side) enemy += unitsIn(state, n).reduce((s, u) => s + u.steps, 0);
  }
  const own = unitsIn(state, boxId).reduce((s, u) => s + u.steps, 0);
  return enemy - own - 2 * state.boxes[boxId].trench + 0.3 * box.vp + (own === 0 ? 6 : 0);
}

// The basic infantry type a nation rebuilds as (US Infantry for the USA).
function basicType(data, nationId) {
  const n = data.nations.nations.find((x) => x.id === nationId);
  return n.rebuildType || 'infantry';
}

// Spend one nation's RP. `rp` is how many it has (it may differ from the table:
// difficulty levels and commanders change it).
export function spendReplacements(state, data, nationId, rp) {
  let left = rp;
  // 1. Repair: +1 step at a time to the weakest unit in the most threatened box.
  while (left > 0) {
    const damaged = state.units.filter((u) => u.nation === nationId && u.steps < unitType(data, u).maxSteps &&
      inSupply(state, data, u));
    if (!damaged.length) break;
    damaged.sort((a, b) => (threat(state, data, b.box) - threat(state, data, a.box)) || (a.steps - b.steps));
    damaged[0].steps += 1;
    left -= 1;
  }
  // 2. Rebuild: 2 RP bring back a destroyed unit at 1 step in a rear box with room.
  const side = sideOfNation(data, nationId);
  while (left >= 2 && (state.pool[nationId] || 0) > 0) {
    const rear = supplySources(data, nationId).filter((id) => state.boxes[id].owner === side && stackRoom(state, data, id) > 0);
    if (!rear.length) break;
    rear.sort((a, b) => threat(state, data, b) - threat(state, data, a));
    state.rebuilt = (state.rebuilt || 0) + 1;
    const unit = { id: `${nationId}-r${String(state.rebuilt).padStart(2, '0')}`, nation: nationId, type: basicType(data, nationId),
      box: rear[0], steps: 1, quality: 'regular', moved: false, railed: false, attacked: false };
    state.units.push(unit);
    state.pool[nationId] -= 1;
    left -= 2;
    addLog(state, `${unitLabel(data, unit)} was rebuilt.`);
  }
  return rp - left;
}

// The replacements phase: every nation spends this turn's RP.
export function replacementsPhase(state, data) {
  for (const n of data.nations.nations) {
    const rp = state.resources[n.id] ? state.resources[n.id].rp : 0;
    if (rp > 0 && (state.will[n.id] !== undefined || n.willCountsAgainst)) spendReplacements(state, data, n.id, rp);
  }
}
