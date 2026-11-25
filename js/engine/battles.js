// battles.js — reading the record of battles kept in the game state.
// From Milestone 5, every combat adds { box, month, stepsLost } to state.battles.
// The map uses this to show battle scars and pencil notes (docs/STYLE.md §13).
// Pure functions only: no page, no randomness.

// A battle this big (steps lost in one territory) earns a pencil note on the map.
export const BIG_BATTLE_STEPS = 6;

// The list of battles so far (an empty list for a game that has none yet).
function battlesOf(state) {
  return Array.isArray(state.battles) ? state.battles : [];
}

// How many times each territory has been fought over: { boxId: count }.
export function battleCounts(state) {
  const counts = {};
  for (const b of battlesOf(state)) counts[b.box] = (counts[b.box] || 0) + 1;
  return counts;
}

// How churned-up a territory looks: 0 = untouched, 1 = one battle,
// 2 = two or three battles, 3 = four or more.
export function scarLevel(count) {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  return 3;
}

// The big battles, grouped by territory, oldest first:
// [{ box, months: ['1916-02', '1916-10'] }, …]
export function bigBattles(state, minSteps = BIG_BATTLE_STEPS) {
  const byBox = new Map();
  for (const b of battlesOf(state)) {
    if (b.stepsLost < minSteps) continue;
    if (!byBox.has(b.box)) byBox.set(b.box, []);
    const months = byBox.get(b.box);
    if (!months.includes(b.month)) months.push(b.month);
  }
  const out = [];
  for (const [box, months] of byBox) out.push({ box, months: months.sort() });
  return out.sort((a, b) => (a.months[0] < b.months[0] ? -1 : 1));
}

// A month like "1916-02" written short: "Feb 1916".
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function shortMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return `${SHORT[m - 1]} ${y}`;
}
