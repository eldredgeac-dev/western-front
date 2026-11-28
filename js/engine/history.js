// history.js — the War Office's records: a row for every month of the war (each
// nation's Will, strength and steps lost), the running losses for the Butcher's Bill
// (RULES.md §16), and ledger(), which gathers everything the War Office screen shows.
// Nothing here changes how the game plays.

import { currentMonth, addMonths } from './state.js';
import { resourcesFor, applyDifficulty } from './resources.js';
import { armisticeScore, capturedVp } from './systems/will.js';
import { eventDue, monthName } from './events.js';
import { hasEconomy, manpower, industry, cityEffects, researchProgress, expectedMonth, production, purchased, buyOptions } from './systems/economy.js';

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
    // the war economy (RULES.md §19.6): this month's Manpower and Industry
    manpower: Object.fromEntries(Object.entries(state.budget || {}).map(([n, b]) => [n, b.manpower])),
    industry: Object.fromEntries(Object.entries(state.budget || {}).map(([n, b]) => [n, b.industry])),
  });
  for (const [n, lost] of Object.entries(state.lostThisTurn)) state.lossesTotal[n] = (state.lossesTotal[n] || 0) + lost;
}

// Steps lost → casualties, rounded as RULES.md §16 says. `killed` is about 1 in 5.
export function casualties(data, steps) {
  const b = data.victory.butchersBill;
  const round = (x) => Math.round(x / b.roundTo) * b.roundTo;
  return { casualties: round(steps * b.casualtiesPerStep), killed: round(steps * b.casualtiesPerStep * b.killedShare) };
}

// The commander card in command for a nation (js/engine/commanders.js). Older states
// without cards (some tests) fall back to the historical one for the date.
function commanderOf(state, data, nation, month) {
  const cards = (data.commanders && data.commanders.cards) || [];
  const now = (state.commanders || {})[nation];
  if (now) return cards.find((c) => c.id === now.card) || null;
  return cards.find((c) => c.nation === nation && c.from <= month && (!c.to || month <= c.to)) || null;
}

// A nation's war economy for the War Office (RULES.md §19.6): Manpower and Industry
// this month and their change since last month, the stockpile, and research.
function economyOf(state, data, nationId, last) {
  const b = (state.budget || {})[nationId];
  const mp = b && b.month === currentMonth(state) ? b.manpower : manpower(state, data, nationId);
  const ip = b && b.month === currentMonth(state) ? b.industry : industry(state, data, nationId);
  const before = (key) => (last && last[key] && last[key][nationId] !== undefined ? last[key][nationId] : null);
  const research = data.economy.techs.filter((t) => t.nations.includes(nationId) && researchProgress(state, t.id) > 0 &&
    !(state.techs || []).includes(t.id) && !(t.historical && currentMonth(state) >= t.historical))
    .map((t) => {
      const rate = b && b.tech === t.id ? b.research : 0;
      return { id: t.id, name: t.name, progress: researchProgress(state, t.id), cost: t.cost, expected: expectedMonth(state, data, t.id, rate) };
    });
  return {
    manpower: mp, manpowerChange: before('manpower') === null ? null : mp - before('manpower'),
    industry: ip, industryChange: before('industry') === null ? null : ip - before('industry'),
    stock: (state.resources[nationId] || {}).munitions || 0, stockCap: data.economy.stockCap,
    research,
    researched: (state.techs || []).filter((id) => data.economy.techs.find((t) => t.id === id).nations.includes(nationId))
      .map((id) => data.economy.techs.find((t) => t.id === id).name),
    units: unitsOf(state, data, nationId),
  };
}

// New units (RULES.md §19.9) for the War Office: the one being paid for, those on
// their way, and how many of each type have been bought out of the war's limit.
function unitsOf(state, data, nationId) {
  const u = data.economy.units;
  if (!u) return null;
  const limits = u.limits[nationId] || {};
  if (!Object.values(limits).some((n) => n > 0)) return null;
  const prod = production(state, nationId);
  const saving = buyOptions(state, data, nationId).find((o) => o.type === prod.type) || null;
  const boxName = (id) => (id ? data.map.boxes.find((b) => b.id === id).name : null);
  return {
    saving: saving ? { type: saving.type, progress: Math.min(prod.progress, saving.ip), cost: saving.ip } : null,
    ordered: (state.ordered || []).filter((o) => o.nation === nationId).map((o) => ({ type: o.type, month: o.month, city: boxName(o.box) })),
    bought: Object.entries(limits).filter(([, n]) => n > 0).map(([type, of]) => ({ type, n: purchased(state, nationId, type), of })),
  };
}

// Months from `month` until `later` (both 'YYYY-MM').
const monthsUntil = (month, later) => {
  const [y1, m1] = month.split('-').map(Number); const [y2, m2] = later.split('-').map(Number);
  return (y2 * 12 + m2) - (y1 * 12 + m1);
};

// Is a dated trait on now ('active'), still to come ('coming') or over ('ended')?
// A trait that research can bring early (its `tech`) is active once researched.
function traitStatus(state, trait, month) {
  if (trait.tech && (state.techs || []).includes(trait.tech) && !(trait.to && month > trait.to)) return 'active';
  if (trait.from && month < trait.from) return 'coming';
  if (trait.to && month > trait.to) return 'ended';
  return 'active';
}

// Lane numbers as place names for players: [2] → "the Ypres sector".
function sectorNames(data, lanes) {
  const names = lanes.map((n) => (data.map.lanes.find((l) => l.number === n) || { name: `sector ${n}` }).name);
  return `the ${names.join(' and ')} sector${names.length > 1 ? 's' : ''}`;
}

// The name of a lasting effect: the event whose option started it (the U-boats).
function ongoingName(data, o) {
  const events = data.events ? data.events.events : [];
  const source = events.find((e) => e.choice && e.choice.options.some((op) => (op.effects || []).some((x) => x.kind === 'will-for-turns' && x.nation === o.nation)));
  return source ? source.name : 'Lasting effect';
}

// Everything affecting one nation now, each with a one-line explanation, for its page
// on the Nations screen: its national traits (on, coming or over), repeating events
// that drain its Will (the blockade), lasting effects (U-boats), mutinies and
// event attack bonuses (gas).  Each: { name, text, status }.
export function effectsOf(state, data, nation, month) {
  const list = [];
  const events = data.events ? data.events.events : [];
  // repeating Will drains running this month (the blockade, the Turnip Winter, hunger)
  for (const e of events) {
    if (!e.from || !e.to || month < e.from || month > e.to) continue;
    const drain = (e.effects || []).find((x) => x.kind === 'will' && x.nation === nation.id);
    if (drain) list.push({ name: e.name, text: (e.telegram && e.telegram.meaning) || e.text, status: 'active' });
  }
  for (const o of state.ongoing || []) {
    if (o.nation !== nation.id || o.left <= 0) continue;
    list.push({ name: ongoingName(data, o),
      text: `${o.value > 0 ? '+' : '−'}${Math.abs(o.value)} Will a month for ${o.left} more month${o.left === 1 ? '' : 's'}.`, status: 'active' });
  }
  const m = (state.mutinies || {})[nation.id];
  if (m && m.left > 0 && nation.mutiny) {
    list.push({ name: nation.mutiny.name, text: `Can't attack for ${m.left} more month${m.left === 1 ? '' : 's'}, then +${nation.mutiny.willAfter} Will.`, status: 'active' });
  } else if (m && nation.mutiny) {
    list.push({ name: nation.mutiny.name, text: 'Over. They can happen only once.', status: 'ended' });
  }
  const why = (state.cannotAttack || {})[nation.id];
  if (why && !(m && m.left > 0)) list.push({ name: 'No attacks', text: `Can't attack: ${why}.`, status: 'active' });
  for (const x of state.eventShifts || []) {
    if (x.uses > 0 && x.side === nation.side) list.push({ name: x.label, text: `${x.shift > 0 ? '+' : '−'}${Math.abs(x.shift)} column for the next attack${x.lanes ? ` in ${sectorNames(data, x.lanes)}` : ''} this month.`, status: 'active' });
  }
  for (const t of nation.traits || []) list.push({ name: t.name, text: t.text, status: traitStatus(state, t, month) });
  return list;
}

// One line on who's winning and why (RULES.md §11): the biggest part of the
// Armistice Score — Will, or cities taken from the enemy.
export function scoreReason(state, data, score) {
  const a = data.victory.armistice;
  const nameOf = (id) => data.nations.nations.find((n) => n.id === id);
  // "the Entente" / "Germany", with a capital at the start of a sentence
  const sideName = (id) => { const sd = data.nations.sides.find((x) => x.id === id); const n = sd.theName || sd.name; return n[0].toUpperCase() + n.slice(1); };
  const avg = a.minusAverage.reduce((t, n) => t + (state.will[n] || 0), 0) / a.minusAverage.length;
  const willPart = (state.will[a.plus] || 0) - avg;
  const cityPart = capturedVp(state, data, a.aboveMargin) - capturedVp(state, data, a.belowMargin);
  const plus = nameOf(a.plus);
  const each = a.minusAverage.map((n) => `${nameOf(n).name} ${state.will[n] || 0}`).join(', ');
  const willLine = `${plus.adjective} Will ${state.will[a.plus] || 0} against an average of ${Math.round(avg)} (${each})`;
  if (Math.abs(score) <= a.margin) return `Too close to call: ${willLine}.`;
  const leader = score > 0 ? a.aboveMargin : a.belowMargin;
  const sign = score > 0 ? 1 : -1;
  const cityMain = cityPart * sign > willPart * sign;
  if (cityMain) {
    const held = data.map.boxes.filter((b) => b.vp > 0 && state.boxes[b.id].owner === leader &&
      data.map.columns.find((c) => c.id === b.column).side !== leader).map((b) => b.name || b.anchor.town);
    return `${sideName(leader)} is ahead, mainly because it holds ${held.join(', ')} (${Math.abs(cityPart)} VP taken from the enemy).`;
  }
  if (score > 0) {
    // name the weakest nation on the other side
    const weakest = a.minusAverage.reduce((w, n) => ((state.will[n] || 0) < (state.will[w] || 0) ? n : w));
    return `${sideName(leader)} is ahead, mainly because ${nameOf(weakest).adjective} Will (${state.will[weakest] || 0}) is low: ${willLine}.`;
  }
  return `${sideName(leader)} is ahead, mainly because ${plus.adjective} Will (${state.will[a.plus] || 0}) is low: ${willLine}.`;
}

// Countdowns from events: the Kaiserschlacht deadline (an event that costs Will if a
// side makes no attack in a span of months), mutinies and lasting effects.
function eventCountdowns(state, data, month) {
  const out = [];
  for (const e of data.events ? data.events.events : []) {
    const x = (e.effects || []).find((f) => f.kind === 'will-if-no-attack');
    if (!x || month > e.month || month < addMonths(x.from, -3)) continue;
    const attacked = (state.attacks || []).some((at) => at.side === x.side && at.month >= x.from && at.month <= x.to);
    const sideName = data.nations.sides.find((s) => s.id === x.side).name;
    if (attacked) out.push({ key: e.id, label: e.name, months: null, note: `${sideName} has attacked: no penalty` });
    else if (month < x.from) out.push({ key: e.id, label: e.name, months: null, note: `${sideName} must attack between ${monthName(x.from)} and ${monthName(x.to)}, or lose ${-x.value} Will` });
    else if (month <= x.to) out.push({ key: e.id, label: e.name, months: monthsUntil(month, x.to), note: `${sideName} must attack by ${monthName(x.to)}, or lose ${-x.value} Will` });
  }
  for (const n of data.nations.nations) {
    const m = (state.mutinies || {})[n.id];
    if (m && m.left > 0) out.push({ key: `mutiny-${n.id}`, label: `${n.mutiny.name} end`, months: m.left });
  }
  for (const o of state.ongoing || []) {
    const n = data.nations.nations.find((x) => x.id === o.nation);
    if (o.left > 0 && n) out.push({ key: `ongoing-${n.id}`, label: `${ongoingName(data, o)}: ${n.name} stops losing Will`, months: o.left });
  }
  return out;
}

// Everything the War Office ledger shows, worked out from the state and the data.
export function ledger(state, data) {
  const month = currentMonth(state);
  const full = applyDifficulty(resourcesFor(data, month), data, state.resourceMult);
  const last = (state.history || [])[state.history.length - 1] || null;

  // one column per nation that's in the war
  const nations = data.nations.nations.filter((n) => state.will[n.id] !== undefined).map((n) => {
    const lostMonth = state.lostThisTurn[n.id] || 0;
    const lostTotal = ((state.lossesTotal || {})[n.id] || 0) + lostMonth;
    const card = commanderOf(state, data, n.id, month);
    return {
      id: n.id, name: n.name, side: n.side, color: n.color,
      will: state.will[n.id],
      willStart: n.startWill + ((state.willBonus || {})[n.side] || 0),
      willChange: last && last.will[n.id] !== undefined ? state.will[n.id] - last.will[n.id] : null,
      resources: ['op', 'munitions', 'rp', 'rail'].map((k) => ({ key: k, left: (state.resources[n.id] || {})[k] || 0,
        of: k === 'munitions' && hasEconomy(data) ? data.economy.stockCap : (full[n.id] || {})[k] || 0 })),
      units: state.units.filter((u) => u.nation === n.id).length,
      steps: stepsOf(state, n.id),
      bill: { month: casualties(data, lostMonth), total: casualties(data, lostTotal) },
      commander: card ? { id: card.id, name: card.name, nickname: card.nickname || null, title: card.title || null } : null,
      cannotAttack: (state.cannotAttack || {})[n.id] || null,
      economy: hasEconomy(data) ? economyOf(state, data, n.id, last) : null,
      effects: effectsOf(state, data, n, month),
      willSeries: [...(state.history || []).filter((h) => h.will[n.id] !== undefined).map((h) => ({ month: h.month, will: h.will[n.id] })),
        { month, will: state.will[n.id] }],
    };
  });
  // Belgium has no Will of its own, but still gets a page (its losses count against another nation)
  const others = data.nations.nations.filter((n) => state.will[n.id] === undefined && n.willCountsAgainst).map((n) => ({
    id: n.id, name: n.name, side: n.side, color: n.color, will: null, countsAgainst: n.willCountsAgainst,
    units: state.units.filter((u) => u.nation === n.id).length, steps: stepsOf(state, n.id),
    bill: { month: casualties(data, state.lostThisTurn[n.id] || 0),
      total: casualties(data, ((state.lossesTotal || {})[n.id] || 0) + (state.lostThisTurn[n.id] || 0)) },
    effects: effectsOf(state, data, n, month), cannotAttack: (state.cannotAttack || {})[n.id] || null,
  }));

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
  countdowns.push(...eventCountdowns(state, data, month));
  countdowns.push({ key: 'war-ends', label: 'The war ends', months: (state.turns || 48) - state.turn });

  // the strength-over-time chart: one point per month, plus this month
  const nationSide = Object.fromEntries(data.nations.nations.map((n) => [n.id, n.side]));
  const point = (m, steps) => ({ month: m, ...Object.fromEntries(data.nations.sides.map((s) =>
    [s.id, sum(Object.entries(steps).filter(([n]) => nationSide[n] === s.id).map(([, v]) => v))])) });
  const series = (state.history || []).map((h) => point(h.month, h.steps));
  series.push(point(month, Object.fromEntries(data.nations.nations.map((n) => [n.id, stepsOf(state, n.id)]))));

  // industrial cities held and lost, with their effect on Industry (RULES.md §19.3, §19.6)
  const industrialCities = cityEffects(state, data);

  const score = armisticeScore(state, data);
  return { month, score, margin: data.victory.armistice.margin, reason: scoreReason(state, data, score), nations, others, sides, events, ongoing, shifts, mutinies, countdowns, series, industrialCities };
}
