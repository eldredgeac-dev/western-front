// resources.js — each nation's Offensive Points, munitions, replacements and rail
// moves for a month (RULES.md §6, §8). The numbers live in data/nations.json.
// Unused points are lost: they are worked out fresh at the start of every turn.

// The value of a schedule [{from: 'YYYY-MM', value}, …] in a given month: the
// latest entry that has started. "YYYY-MM" strings compare correctly as text.
export function scheduleValue(schedule, month) {
  let value = 0;
  for (const entry of schedule) if (entry.from <= month) value = entry.value;
  return value;
}

// { nationId: { op, munitions, rp, rail } } for a month.
export function resourcesFor(data, month) {
  const out = {};
  for (const n of data.nations.nations) {
    const r = n.resources || {};
    out[n.id] = {
      op: scheduleValue(r.op || [], month),
      munitions: scheduleValue(r.munitions || [], month),
      rp: scheduleValue(r.rp || [], month),
      rail: n.railMoves || 0,
    };
  }
  return out;
}
