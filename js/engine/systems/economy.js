// systems/economy.js — the war economy (RULES.md §19). The numbers live in
// data/economy.json and data/nations.json.
//
// Each month every nation in the war gets two resources:
//   Manpower (MP) — fresh men. It all goes to Replacements (state.resources[n].rp).
//   Industry (IP) — factories. It buys munitions for the stockpile (1 IP each, up to
//                   3 in stock), goes into research, or pays for new units (§19.9).
//                   Anything not spent is lost.
// The munitions stockpile IS state.resources[n].munitions: it carries over from month
// to month (turn.js keeps it), barrages spend it (combat.js), and the War Office
// budget adds to it here.
//
// The budget is spent in the "War Office" phase at the start of each month
// (warOfficePhase below). The computer, and a player with Auto-allocate on, spend it
// automatically; otherwise the turn waits (state.pendingBudget) for the player to
// fill in the budget screen, and submitBudget() in turn.js carries on.

import { currentMonth, addMonths, monthLabel } from '../state.js';
import { scheduleValue } from '../resources.js';
import { placeUnit, applyEffect } from '../events.js';
import { addLog, unitLabel } from '../moves.js';
import { cardValue } from '../commanders.js';
import { sideOfNation, stackRoom } from '../units.js';
import { next as rngNext } from '../rng.js';

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

// ---------------------------------------------------------------- buying units (§19.9)
// Industry can pay for new units. IP put towards the next unit carries over from month
// to month, like research (state.production[nation] = { progress, type, city }). When
// it's paid in full, the Manpower is taken from this month's replacements, and the
// unit arrives the month after in a rear city (state.ordered). Each nation can buy only
// so many units in the war (data/economy.json "limits", counted in state.purchased).

const unitsRules = (data) => (hasEconomy(data) && data.economy.units) || null;
const nameOfBox = (data, id) => data.map.boxes.find((b) => b.id === id).name;

// How many units of a type a nation has bought so far, and may still buy.
export const purchased = (state, nationId, type) => ((state.purchased || {})[nationId] || {})[type] || 0;
export function purchasesLeft(state, data, nationId, type) {
  const u = unitsRules(data);
  const limit = u ? ((u.limits[nationId] || {})[type] || 0) : 0;
  return Math.max(0, limit - purchased(state, nationId, type));
}

// The order a nation is saving towards: { progress, type, city }.
export function production(state, nationId) {
  return { progress: 0, type: null, city: null, ...((state.production || {})[nationId] || {}) };
}

// The unit types a nation can order this month: from the start month, under its war
// limit, and (for tanks) once its tank research is done or has arrived historically.
// Each is { type, ip, mp, steps, note, left }.
export function buyOptions(state, data, nationId, month = currentMonth(state)) {
  const u = unitsRules(data);
  if (!u || month < u.from) return [];
  return u.types
    .filter((t) => purchasesLeft(state, data, nationId, t.type) > 0)
    .filter((t) => !t.needsTech || (t.needsTech[nationId] && techActive(state, data, t.needsTech[nationId], month)))
    .map((t) => ({ ...t, left: purchasesLeft(state, data, nationId, t.type) }));
}

// The rear cities a nation's new units can arrive in now: its depots that its side
// holds. `withRoom` also drops the ones already full (3 units).
export function depotsFor(state, data, nationId, withRoom = false) {
  const u = unitsRules(data);
  if (!u) return [];
  const side = sideOfNation(data, nationId);
  return (u.depots[nationId] || [])
    .filter((id) => state.boxes[id].owner === side && (!withRoom || stackRoom(state, data, id) > 0));
}

// The order is paid in full: if this month's Manpower covers it, take the men and
// send the unit on its way. Otherwise it waits for a month with enough Manpower.
function placeOrder(state, data, nationId) {
  const prod = production(state, nationId);
  const t = buyOptions(state, data, nationId).find((o) => o.type === prod.type);
  if (!t || prod.progress < t.ip) return;
  const r = state.resources[nationId];
  if (!r || r.rp < t.mp) {
    addLog(state, `NEW UNIT: ${nationOf(data, nationId).name}'s ${t.type === 'tanks' ? 'tanks are' : 'new corps is'} paid for, but it needs ${t.mp} Manpower; it waits.`);
    return;
  }
  r.rp -= t.mp;
  r.unitMP = (r.unitMP || 0) + t.mp;      // remembered: the computer's stop-loss counts this month's full Manpower (ai.js)
  state.production = { ...(state.production || {}), [nationId]: { ...prod, progress: prod.progress - t.ip } };
  const mine = { ...((state.purchased || {})[nationId] || {}) };
  mine[t.type] = (mine[t.type] || 0) + 1;
  state.purchased = { ...(state.purchased || {}), [nationId]: mine };
  const arrives = addMonths(currentMonth(state), unitsRules(data).arriveAfter);
  const where = prod.city ? ` at ${nameOfBox(data, prod.city)}` : '';
  state.ordered = [...(state.ordered || []), { nation: nationId, type: t.type, steps: t.steps, month: arrives, box: prod.city || null }];
  addLog(state, `NEW UNIT: ${nationOf(data, nationId).name} orders ${t.type === 'tanks' ? 'a Tank unit' : 'an Infantry unit'} (${t.ip} IP, ${t.mp} MP). It arrives${where} in ${monthLabel(arrives)}.`);
}

// Put a new unit on the map: in the city chosen for it if that's still held and has
// room, otherwise in a random one of the nation's rear cities with room.
function placeBought(state, data, order) {
  const options = depotsFor(state, data, order.nation, true);
  if (!options.length) return null;
  let box = options.includes(order.box) ? order.box : null;
  if (!box) {
    const { value, rng } = rngNext(state.rng);
    state.rng = rng;
    box = options[Math.floor(value * options.length)];
  }
  state.bought = (state.bought || 0) + 1;
  const unit = { id: `${order.nation}-b${String(state.bought).padStart(2, '0')}`, nation: order.nation, type: order.type, box,
    steps: order.steps, quality: 'regular', moved: false, railed: false, attacked: false };
  state.units.push(unit);
  addLog(state, `NEW UNIT: ${unitLabel(data, unit)} arrives at ${nameOfBox(data, box)}.`);
  return unit;
}

// Units ordered last month (or earlier, if they waited for room) arrive.
export function deliverUnits(state, data) {
  const month = currentMonth(state);
  const keep = [];
  for (const order of state.ordered || []) {
    if (order.month > month || !placeBought(state, data, order)) keep.push(order);
  }
  state.ordered = keep;
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
// A budget for one nation: { munitions, research, tech, build, buildType, city }.
//   munitions — IP spent on shells (1 each), added to the stockpile
//   research  — IP put into `tech` (a tech id, or null)
//   build     — IP put towards a new unit of `buildType` ('infantry' or 'tanks', §19.9)
//   city      — the rear city it should arrive in (a box id, or null for any)

// Check a budget. Returns a list of problems in plain English (empty = fine).
export function checkBudget(state, data, nationId, budget) {
  const problems = [];
  const ip = industry(state, data, nationId);
  const mun = budget.munitions || 0;
  const res = budget.research || 0;
  const build = budget.build || 0;
  const cost = data.economy.munitionCost;
  if (![mun, res, build].every((x) => Number.isInteger(x) && x >= 0)) problems.push('Amounts must be whole numbers, 0 or more.');
  if (mun * cost + res + build > ip) problems.push(`That spends more than this month’s ${ip} Industry.`);
  if (build > 0 || budget.buildType) {
    const t = buyOptions(state, data, nationId).find((o) => o.type === budget.buildType);
    if (!t) problems.push('Choose a unit that can be bought this month.');
    else if (build > Math.max(0, t.ip - production(state, nationId).progress)) problems.push(`That unit needs only ${Math.max(0, t.ip - production(state, nationId).progress)} more IP.`);
  }
  if (budget.city && !depotsFor(state, data, nationId).includes(budget.city)) problems.push('New units can only arrive in a rear city you hold.');
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
  const build = budget.build || 0;
  const mpBefore = state.resources[nationId].rp;
  state.resources[nationId].munitions += mun;
  const tech = res > 0 ? techOf(data, budget.tech) : null;
  if (tech) {
    state.research = { ...(state.research || {}), [tech.id]: researchProgress(state, tech.id) + res };
    if (state.research[tech.id] >= tech.cost) completeTech(state, data, tech);
  }
  // a new unit (§19.9): the IP carries over until it's paid in full
  if (build > 0 || budget.buildType) {
    const prod = production(state, nationId);
    state.production = { ...(state.production || {}), [nationId]: { progress: prod.progress + build,
      type: budget.buildType || prod.type, city: budget.city !== undefined ? budget.city : prod.city } };
  }
  placeOrder(state, data, nationId);
  // this month's budget, for the War Office dashboard
  state.budget = state.budget || {};
  state.budget[nationId] = { month: currentMonth(state), manpower: mpBefore, industry: ip,
    munitions: mun, research: res, tech: tech ? tech.id : null, build, buildType: budget.buildType || null,
    unitMP: mpBefore - state.resources[nationId].rp,
    unspent: ip - mun * data.economy.munitionCost - res - build };
}

// The automatic budget (§19.4, §19.7): top the stockpile up to 3, then put IP into
// the cheapest tech on offer (at most `researchCap` a month — the computer uses 3,
// Auto-allocate for a player has no cap), then the rest towards a new unit (§19.9: a
// tank if the nation can buy one, otherwise infantry; it arrives in any rear city).
// Anything left over is lost.
export function autoBudget(state, data, nationId, researchCap = Infinity) {
  const e = data.economy;
  let ip = industry(state, data, nationId);
  const munitions = Math.max(0, Math.min(e.stockCap - stockpile(state, nationId), Math.floor(ip / e.munitionCost)));
  ip -= munitions * e.munitionCost;
  // the cheapest tech first; ties go to the one listed first in data/economy.json
  const options = [...researchOptions(state, data, nationId)].sort((a, b) => a.cost - b.cost);
  const tech = options[0] || null;
  const research = tech ? Math.max(0, Math.min(ip, researchCap, tech.cost - researchProgress(state, tech.id))) : 0;
  ip -= research;
  const buy = autoUnit(state, data, nationId);
  const build = buy ? Math.max(0, Math.min(ip, buy.ip - production(state, nationId).progress)) : 0;
  return { munitions, research, tech: research > 0 ? tech.id : null, build, buildType: buy ? buy.type : null, city: null };
}

// The unit Auto-allocate and the computer save towards: a tank if possible. The
// computer only buys the types data/economy.json allows it for that nation
// ("computerBuys": the Entente computer buys tanks only, DECISIONS.md 137).
export function autoUnit(state, data, nationId) {
  const side = sideOfNation(data, nationId);
  const only = (state.controllers || {})[side] === 'ai' ? (unitsRules(data).computerBuys || {})[nationId] : null;
  const options = buyOptions(state, data, nationId).filter((o) => !only || only.includes(o.type));
  return options.find((o) => o.type === 'tanks') || options[0] || null;
}

// Who spends a side's budget automatically: the computer, or a player who has
// Auto-allocate on.
export function autoSpends(state, sideId) {
  return (state.controllers || {})[sideId] === 'ai' || Boolean((state.autoAllocate || {})[sideId]);
}

// Is there a real choice in a side's budget this month (§19.4)? Only if one of its
// nations has Industry to spend AND a tech it could research or a unit it could buy.
// Otherwise the only sensible use of Industry is munitions, so there's nothing to ask.
export function budgetChoice(state, data, sideId) {
  return budgetNations(state, data, sideId).some((n) => industry(state, data, n) > 0 &&
    (researchOptions(state, data, n).length > 0 || buyOptions(state, data, n).length > 0));
}

// The War Office phase (§19.4): every side with an automatic budget spends it now.
// A player's budget with Auto-allocate off waits (state.pendingBudget, a list of
// sides) only when there's a real choice to make; otherwise it's spent automatically.
export function warOfficePhase(state, data) {
  if (!hasEconomy(data)) return;
  deliverUnits(state, data);             // last month's new units arrive (§19.9)
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
