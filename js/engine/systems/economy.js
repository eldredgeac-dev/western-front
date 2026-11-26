// systems/economy.js — the war economy (RULES.md §19). The numbers live in
// data/economy.json and data/nations.json.
//
// Each month every nation in the war gets two resources:
//   Manpower (MP) — fresh men. It all goes to Replacements (state.resources[n].rp).
//   Industry (IP) — factories. It buys munitions for the stockpile (1 IP each, up to
//                   3 in stock) or goes into research. Anything not spent is lost.
// The munitions stockpile IS state.resources[n].munitions: it carries over from month
// to month (turn.js keeps it), barrages spend it (combat.js), and the War Office
// budget adds to it here.
//
// The budget is spent in the "War Office" phase at the start of each month
// (warOfficePhase below). The computer, and a player with Auto-allocate on, spend it
// automatically; otherwise the turn waits (state.pendingBudget) for the player to
// fill in the budget screen, and submitBudget() in turn.js carries on.

import { currentMonth, addMonths } from '../state.js';
import { scheduleValue } from '../resources.js';
import { placeUnit, applyEffect } from '../events.js';
import { addLog } from '../moves.js';
import { cardValue } from '../commanders.js';

const nationOf = (data, id) => data.nations.nations.find((n) => n.id === id);
const techOf = (data, id) => data.economy.techs.find((t) => t.id === id);

// Is the economy switched on? (Some tests pass only part of the data.)
export const hasEconomy = (data) => Boolean(data && data.economy);

// Is a nation in the war (it has National Will)? Belgium and the USA before it
// declares war have no budget.
export const atWar = (state, nationId) => state.will[nationId] !== undefined;

// The nations of a side that have a budget this month.
export function budgetNations(state, data, sideId) {
  return data.nations.nations.filter((n) => n.side === sideId && atWar(state, n.id)).map((n) => n.id);
}

// ---------------------------------------------------------------- research
// Has a tech been researched (paid for) in this game?
export const techResearched = (state, techId) => (state.techs || []).includes(techId);

// Does a tech's effect work this month? Yes once researched, or once its historical
// date arrives (it comes free then, §19.5).
export function techActive(state, data, techId, month = currentMonth(state)) {
  if (techResearched(state, techId)) return true;
  const t = hasEconomy(data) ? techOf(data, techId) : null;
  return Boolean(t && t.historical && month >= t.historical);
}

// IP put into a tech so far (it carries over between months).
export const researchProgress = (state, techId) => (state.research || {})[techId] || 0;

// The techs a nation can put IP into this month: its own, not yet researched, not
// before their earliest date, and not after they've arrived historically.
export function researchOptions(state, data, nationId, month = currentMonth(state)) {
  if (!hasEconomy(data)) return [];
  return data.economy.techs.filter((t) => t.nations.includes(nationId) && !techResearched(state, t.id) &&
    month >= t.earliest && !(t.historical && month >= t.historical));
}

// A tech is finished: record it, log it and do what it does (§19.5). Effects that
// last (a bigger barrage, Defence in depth, +1 IP) are checked with techActive();
// one-off effects (new units, Stormtroopers) happen now.
function completeTech(state, data, tech) {
  state.techs = [...(state.techs || []), tech.id];
  addLog(state, `RESEARCH: ${tech.name} is ready. ${tech.text}`);
  const e = tech.effect;
  if (e.kind === 'reinforce') {
    for (let i = 0; i < e.count; i++) {
      // no room in the rear: it waits a turn, like any reinforcement (events.js)
      if (!placeUnit(state, data, e.nation, e.type)) state.waiting = [...(state.waiting || []), { nation: e.nation, type: e.type }];
    }
  } else if (e.kind === 'convert') {
    applyEffect(state, data, e);
  }
}

// ---------------------------------------------------------------- income
// The industrial cities (§19.3): each with whether it's lost (held by the other
// side) and what that does to each nation's Industry.
export function cityEffects(state, data) {
  if (!hasEconomy(data)) return [];
  return data.economy.cities.map((c) => {
    const box = data.map.boxes.find((b) => b.id === c.box);
    const owner = state.boxes[c.box].owner;
    return { box: c.box, name: box.name, holder: c.holder, owner, lost: owner !== c.holder, effects: c.effects, note: c.note };
  });
}

// Manpower this month (§19.1): the nation's replacements schedule, times the
// difficulty multiplier (§13), rounded, then the commander's change (§15: Hindenburg &
// Ludendorff +1, Haig −1 in Jan–Apr 1918), never below 0.
export function manpower(state, data, nationId, month = currentMonth(state)) {
  const n = nationOf(data, nationId);
  const mult = (state.resourceMult || {})[n.side] || 1;
  return Math.max(0, Math.round(scheduleValue((n.resources || {}).rp || [], month) * mult) + cardValue(state, data, 'rp', nationId, month));
}

// Industry this month (§19.2), piece by piece:
//   base     — the munitions schedule in nations.json × the difficulty multiplier
//   bonus    — the war-economy bonus (not multiplied)
//   cities   — industrial cities lost or taken (§19.3)
//   research — techs that add Industry (the Heavy artillery programme)
//   commander — the commander card's change (§15: Nivelle +1)
//   total    — the sum, never below 0
export function industryParts(state, data, nationId, month = currentMonth(state)) {
  const n = nationOf(data, nationId);
  const mult = (state.resourceMult || {})[n.side] || 1;
  const base = Math.round(scheduleValue((n.resources || {}).munitions || [], month) * mult);
  const bonus = scheduleValue(data.economy.industryBonus[nationId] || [], month);
  let cities = 0;
  for (const c of cityEffects(state, data)) if (c.lost) cities += c.effects[nationId] || 0;
  let research = 0;
  for (const t of data.economy.techs) {
    if (t.effect.kind === 'industry' && t.effect.nation === nationId && techResearched(state, t.id)) research += t.effect.value;
  }
  const commander = cardValue(state, data, 'industry', nationId, month);
  return { base, bonus, cities, research, commander, total: Math.max(0, base + bonus + cities + research + commander) };
}
export const industry = (state, data, nationId, month) => industryParts(state, data, nationId, month).total;

// Munitions in the stockpile now.
export const stockpile = (state, nationId) => (state.resources[nationId] || {}).munitions || 0;

// ---------------------------------------------------------------- spending
// A budget for one nation: { munitions, research, tech }.
//   munitions — IP spent on shells (1 each), added to the stockpile
//   research  — IP put into `tech` (a tech id, or null)

// Check a budget. Returns a list of problems in plain English (empty = fine).
export function checkBudget(state, data, nationId, budget) {
  const problems = [];
  const ip = industry(state, data, nationId);
  const mun = budget.munitions || 0;
  const res = budget.research || 0;
  const cost = data.economy.munitionCost;
  if (!Number.isInteger(mun) || !Number.isInteger(res) || mun < 0 || res < 0) problems.push('Amounts must be whole numbers, 0 or more.');
  if (mun * cost + res > ip) problems.push(`That spends more than this month’s ${ip} Industry.`);
  if (stockpile(state, nationId) + mun > data.economy.stockCap) problems.push(`The stockpile holds at most ${data.economy.stockCap} munitions.`);
  if (res > 0) {
    const tech = researchOptions(state, data, nationId).find((t) => t.id === budget.tech);
    if (!tech) problems.push('Choose a tech that can be researched this month.');
    else if (res > tech.cost - researchProgress(state, tech.id)) problems.push(`${tech.name} needs only ${tech.cost - researchProgress(state, tech.id)} more IP.`);
  }
  return problems;
}

// Spend a budget (changes `state`). The rest of the Industry is lost. Throws an
// Error if the budget breaks the rules.
export function applyBudget(state, data, nationId, budget) {
  const problems = checkBudget(state, data, nationId, budget);
  if (problems.length) throw new Error(problems.join(' '));
  const ip = industry(state, data, nationId);
  const mun = budget.munitions || 0;
  const res = budget.research || 0;
  state.resources[nationId].munitions += mun;
  const tech = res > 0 ? techOf(data, budget.tech) : null;
  if (tech) {
    state.research = { ...(state.research || {}), [tech.id]: researchProgress(state, tech.id) + res };
    if (state.research[tech.id] >= tech.cost) completeTech(state, data, tech);
  }
  // this month's budget, for the War Office dashboard
  state.budget = state.budget || {};
  state.budget[nationId] = { month: currentMonth(state), manpower: state.resources[nationId].rp, industry: ip,
    munitions: mun, research: res, tech: tech ? tech.id : null, unspent: ip - mun * data.economy.munitionCost - res };
}

// The automatic budget (§19.4, §19.7): top the stockpile up to 3, then put IP into
// the cheapest tech on offer (at most `researchCap` a month — the computer uses 3,
// Auto-allocate for a player has no cap). Anything left over is lost.
export function autoBudget(state, data, nationId, researchCap = Infinity) {
  const e = data.economy;
  let ip = industry(state, data, nationId);
  const munitions = Math.max(0, Math.min(e.stockCap - stockpile(state, nationId), Math.floor(ip / e.munitionCost)));
  ip -= munitions * e.munitionCost;
  // the cheapest tech first; ties go to the one listed first in data/economy.json
  const options = [...researchOptions(state, data, nationId)].sort((a, b) => a.cost - b.cost);
  const tech = options[0] || null;
  const research = tech ? Math.max(0, Math.min(ip, researchCap, tech.cost - researchProgress(state, tech.id))) : 0;
  return { munitions, research, tech: research > 0 ? tech.id : null };
}

// Who spends a side's budget automatically: the computer, or a player who has
// Auto-allocate on.
export function autoSpends(state, sideId) {
  return (state.controllers || {})[sideId] === 'ai' || Boolean((state.autoAllocate || {})[sideId]);
}

// Is there a real choice in a side's budget this month (§19.4)? Only if one of its
// nations has Industry to spend AND a tech it could research. Otherwise the only
// sensible use of Industry is munitions, so there's nothing to ask the player.
export function budgetChoice(state, data, sideId) {
  return budgetNations(state, data, sideId)
    .some((n) => industry(state, data, n) > 0 && researchOptions(state, data, n).length > 0);
}

// The War Office phase (§19.4): every side with an automatic budget spends it now.
// A player's budget with Auto-allocate off waits (state.pendingBudget, a list of
// sides) only when there's a real choice to make; otherwise it's spent automatically.
export function warOfficePhase(state, data) {
  if (!hasEconomy(data)) return;
  const waiting = [];
  for (const side of data.nations.sides) {
    const nations = budgetNations(state, data, side.id);
    if (!nations.length) continue;
    if (!autoSpends(state, side.id) && budgetChoice(state, data, side.id)) { waiting.push(side.id); continue; }
    const cap = (state.controllers || {})[side.id] === 'ai' ? data.economy.aiResearchCap : Infinity;
    for (const n of nations) applyBudget(state, data, n, autoBudget(state, data, n, cap));
  }
  if (waiting.length) state.pendingBudget = waiting;
}

// The month a tech in progress is expected (§19.6): at this month's rate of
// spending, or its historical date if that's sooner. Null if it won't come.
export function expectedMonth(state, data, techId, perMonth) {
  const t = techOf(data, techId);
  const month = currentMonth(state);
  const left = t.cost - researchProgress(state, techId);
  let when = perMonth > 0 ? addMonths(month, Math.ceil(left / perMonth)) : null;
  if (t.historical && (!when || t.historical < when)) when = t.historical;
  return when;
}
