// state.js — creating the game state.
// The state is a plain object that can be saved as JSON. Milestone 2 only
// needs who owns each box and its trench level; units arrive in Milestone 3.

// Bump this whenever the shape of the state changes, so old saves can be
// recognised and upgraded (Milestone 7).
export const STATE_VERSION = 1;

// Build a brand-new game from a scenario (data/scenarios/*.json).
// `seed` will drive every dice roll (through rng.js) from Milestone 5 on.
export function newGame(scenario, seed) {
  const boxes = {};
  for (const [id, start] of Object.entries(scenario.boxes)) {
    // Copy each box so changing the game never changes the scenario data.
    boxes[id] = { owner: start.owner, trench: start.trench };
  }
  return {
    version: STATE_VERSION,
    scenario: scenario.id,
    seed,
    turn: 1,
    startMonth: scenario.startMonth,
    boxes,
  };
}

// The month ("YYYY-MM") of the current turn. Turn 1 is the scenario's start month.
export function currentMonth(state) {
  const [year, month] = state.startMonth.split('-').map(Number);
  const total = year * 12 + (month - 1) + (state.turn - 1);
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

// A month like "1914-12" as words: "December 1914".
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
export function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
