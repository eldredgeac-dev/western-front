// systems/supply.js — the supply phase (RULES.md §7 step 4, §9.6): every unit that
// can't trace supply loses 1 step. (The tracing itself is in js/engine/supply.js.)

import { inSupply } from '../supply.js';
import { destroyUnit, recordLoss } from '../units.js';
import { addLog, unitLabel } from '../moves.js';

export function supplyPhase(state, data) {
  const cut = state.units.filter((u) => !inSupply(state, data, u));
  for (const u of cut) {
    u.steps -= 1;
    recordLoss(state, u.nation, 1);
    if (u.steps <= 0) {
      destroyUnit(state, data, u);
      addLog(state, `${unitLabel(data, u)}, cut off, was lost.`);
    } else {
      addLog(state, `${unitLabel(data, u)} is out of supply and lost a step.`);
    }
  }
}
