// history.js — the War Office's records: a row for every month of the war (each
// nation's Will, strength and steps lost), the running losses for the Butcher's Bill
// (RULES.md §16), and ledger(), which gathers everything the War Office screen shows.
// Nothing here changes how the game plays.

import { currentMonth, addMonths } from './state.js';
import { resourcesFor, applyDifficulty } from './resources.js';
import { armisticeScore } from './systems/will.js';
import { eventDue } from './events.js';

const sum = (list) => list.reduce((a, b) => a + b, 0);
// Total steps of a nation's units on the map.
const stepsOf = (state, nation) => sum(state.units.filter((u) => u.nation === nation).map((u) => u.steps));

// End of a month (turn.js calls this): add its row to state.history and its losses to
// the running totals. Changes `state`.
export function recordMonth(state, data) {
  state.history = state.history || [];
  state.lossesTotal = state.lossesTotal || {};
  const nations = data.nations.nations.map((n) => n.id);
  state.history.push({
    month: currentMonth(state),
    will: { ...state.will },
    steps: Object.fromEntries(nations.map((n) => [n, stepsOf(state, n)])),
    lost: { ...state.lostThisTurn },
  });
  for (const [n, lost] of Object.entries(state.lostThisTurn)) state.lossesTotal[n] = (state.lossesTotal[n] || 0) + lost;
}

// Steps lost → casualties, rounded as RULES.md §16 says. `killed` is about 1 in 5.
export function casualties(data, steps) {
  const b = data.victory.butchersBill;
  const round = (x) => Math.round(x / b.roundTo) * b.roundTo;
  return { casualties: round(steps * b.casualtiesPerStep), killed: round(steps * b.casualtiesPerStep * b.killedShare) };
}

// The commander of a nation this month, by the historical dates in
// data/commanders.json (their effects arrive with the Commander cards milestone).
function commanderOf(data, nation, month) {
  const cards = (data.commanders && data.commanders.cards) || [];
  return cards.find((c) => c.nation === nation && c.from <= month && month <= c.to) || null;
}

// Months from `month` until `later` (both 'YYYY-MM').
const monthsUntil = (month, later) => {
  const [y1, m1] = month.split('-').map(Number); const [y2, m2] = later.split('-').map(Number);
  return (y2 * 12 + m2) - (y1 * 12 + m1);
};

// Everything the War Office ledger shows, worked out from the state and the data.
export function ledger(state, data) {
  const month = currentMonth(state);
  const full = applyDifficulty(resourcesFor(data, month), data, state.resourceMult);
  const last = (state.history || [])[state.history.length - 1] || null;

  // one column per nation that's in the war
  const nations = data.nations.nations.filter((n) => state.will[n.id] !== undefined).map((n) => {
    const lostMonth = state.lostThisTurn[n.id] || 0;
    const lostTotal = ((state.lossesTotal || {})[n.id] || 0) + lostMonth;
    const card = commanderOf(data, n.id, month);
    return {
      id: n.id, name: n.name, side: n.side, color: n.color,
      will: state.will[n.id],
      willStart: n.startWill + ((state.willBonus || {})[n.side] || 0),
      willChange: last && last.will[n.id] !== undefined ? state.will[n.id] - last.will[n.id] : null,
      resources: ['op', 'munitions', 'rp', 'rail'].map((k) => ({ key: k, left: (state.resources[n.id] || {})[k] || 0, of: (full[n.id] || {})[k] || 0 })),
      units: state.units.filter((u) => u.nation === n.id).length,
      steps: stepsOf(state, n.id),
      bill: { month: casualties(data, lostMonth), total: casualties(data, lostTotal) },
      commander: card ? { name: card.name, nickname: card.nickname || null, title: card.title || null } : null,
      cannotAttack: (state.cannotAttack || {})[n.id] || null,
    };
  });

  // each side: the named cities (VP) it holds, and its total strength
  const sides = data.nations.sides.map((s) => ({
    id: s.id, name: s.name, color: s.color,
    cities: data.map.boxes.filter((b) => b.vp > 0 && state.boxes[b.id].owner === s.id)
      .map((b) => ({ name: b.name || b.anchor.town, vp: b.vp })).sort((a, b) => b.vp - a.vp),
    steps: sum(nations.filter((n) => n.side === s.id).map((n) => n.steps)),
  }));

  // what's going on this month
  const done = new Set(state.eventsDone || []);
  const events = (data.events ? data.events.events : [])
    .filter((e) => !e.choice && eventDue(e, month) && done.has(e.id + month))
    .map((e) => ({ name: e.name, text: e.text }));
  const ongoing = (state.ongoing || []).map((o) => ({ nation: o.nation, value: o.value, left: o.left }));
  const shifts = (state.eventShifts || []).filter((x) => x.uses > 0).map((x) => ({ label: x.label, side: x.side, shift: x.shift }));
  const mutinies = Object.entries(state.mutinies || {}).filter(([, m]) => m.left > 0).map(([n, m]) => ({ nation: n, left: m.left }));

  // countdowns
  const countdowns = [];
  const r = data.events ? data.events.reinforcements : null;
  if (r) {
    if (state.usaEntry && r.afterEntry.length) {
      const first = addMonths(state.usaEntry, Math.min(...r.afterEntry.map((d) => d.after)));
      if (first > month) countdowns.push({ key: 'us-troops', label: 'US troops expected', months: monthsUntil(month, first) });
    } else if (!state.usaEntry && r.afterEntry.length) {
      countdowns.push({ key: 'us-troops', label: 'US troops expected', months: null, note: 'after the United States declares war' });
    }
    const next = r.dated.filter((d) => d.month > month).sort((a, b) => (a.month < b.month ? -1 : 1))[0];
    if (next) countdowns.push({ key: 'reinforcements', label: 'Next reinforcements', months: monthsUntil(month, next.month), nation: next.nation, count: next.count });
  }
  countdowns.push({ key: 'war-ends', label: 'The war ends', months: (state.turns || 48) - state.turn });

  // the strength-over-time chart: one point per month, plus this month
  const nationSide = Object.fromEntries(data.nations.nations.map((n) => [n.id, n.side]));
  const point = (m, steps) => ({ month: m, ...Object.fromEntries(data.nations.sides.map((s) =>
    [s.id, sum(Object.entries(steps).filter(([n]) => nationSide[n] === s.id).map(([, v]) => v))])) });
  const series = (state.history || []).map((h) => point(h.month, h.steps));
  series.push(point(month, Object.fromEntries(data.nations.nations.map((n) => [n.id, stepsOf(state, n.id)]))));

  return { month, score: armisticeScore(state, data), margin: data.victory.armistice.margin, nations, sides, events, ongoing, shifts, mutinies, countdowns, series };
}
