// tutorial.js — the guided first turn's plan (the screen part is js/ui/tutorial.js).
// After Germany's December 1914 moves, it picks territories that teach the core idea:
//   1. two units go by ROAD into one front territory (with the one already there: 3);
//   2. a reserve goes by RAIL to fill the gap one of them left;
//   3. the three attack the German territory straight ahead with a 1-munition barrage
//      (the attack itself takes the other IP in the stockpile, RULES.md §9.1).
// It only reads the state. Returns null if no lane works (then the tutorial is skipped).

import { unitsIn, sideOfUnit } from './units.js';
import { moveTargets, railTargets } from './moves.js';
import { indexBoxes } from './boxes.js';

// One unit of `nation` standing in `boxId`, or null.
const unitOf = (state, boxId, nation) => unitsIn(state, boxId).find((u) => u.nation === nation) || null;

// Shifts from the ground of a territory (ridges, forest…) this month: 0 is best.
function groundShift(data, box) {
  return box.terrain.reduce((s, id) => s + Math.min(0, ((data.terrain.types.find((t) => t.id === id) || {}).combat || {}).shift || 0), 0);
}

// The plan: { target, front, support: {unit, box}, side: {unit, box}, reserve: {unit, box} }
//   target  — the German front territory to attack
//   front   — your front territory straight across from it (one unit already there)
//   support — the unit behind `front` that moves up by road
//   side    — the unit next to `front` in the front line that moves across by road
//   reserve — a unit that goes by rail to fill the gap `side` leaves
export function tutorialPlan(state, data, nation = 'fra') {
  const boxes = indexBoxes(data.map);
  const options = [];
  for (const front of data.map.boxes.filter((b) => b.column === 'e1' && state.boxes[b.id].owner === 'entente')) {
    if (unitsIn(state, front.id).length !== 1 || !unitOf(state, front.id, nation)) continue;
    const target = front.neighbours.map((id) => boxes[id]).find((b) => state.boxes[b.id].owner === 'germany');
    if (!target || unitsIn(state, target.id).length !== 1 || groundShift(data, target) < 0) continue;
    const behind = front.neighbours.map((id) => boxes[id]).find((b) => b.column === 'e2');
    const support = behind && unitOf(state, behind.id, nation);
    if (!support || !moveTargets(state, data, support.id).includes(front.id)) continue;
    for (const sideBox of front.neighbours.map((id) => boxes[id]).filter((b) => b.column === 'e1')) {
      const side = unitOf(state, sideBox.id, nation);
      if (!side || unitsIn(state, sideBox.id).length !== 1 || !moveTargets(state, data, side.id).includes(front.id)) continue;
      // a reserve in a support or rear territory elsewhere that can rail into the gap
      // (the gap will be empty, so it has room)
      const reserve = state.units.find((u) => u.nation === nation && sideOfUnit(data, u) === 'entente' &&
        u.id !== support.id && ['e2', 'e3'].includes(boxes[u.box].column) && u.box !== behind.id &&
        railTargets(state, data, u.id).length > 0 &&
        !moveTargets(state, data, u.id).includes(sideBox.id));   // too far by road: it needs the rail
      if (!reserve) continue;
      options.push({ target: target.id, front: front.id, support: { unit: support.id, box: behind.id },
        side: { unit: side.id, box: sideBox.id }, reserve: { unit: reserve.id, box: reserve.box },
        steps: unitsIn(state, target.id)[0].steps, lane: front.lane });
    }
  }
  // the weakest target first; then the lane nearest the middle of the front (lane 6)
  const laneNo = (id) => data.map.lanes.find((l) => l.id === id).number;
  options.sort((a, b) => (a.steps - b.steps) || (Math.abs(laneNo(a.lane) - 6) - Math.abs(laneNo(b.lane) - 6)));
  return options[0] || null;
}
