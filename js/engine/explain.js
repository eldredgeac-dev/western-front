// explain.js — plain-English help for attacks. It changes no rules and never touches
// the page: it only works out, from the combat engine, what each roll of the dice
// would do, why an attack's chances are what they are, and which attacks are best.
//
//   rollOutcomes(state, data, order) — what each 2d6 roll (2–12) would do
//   attackAdvice(state, data, order) — the lines the order slip shows
//   bestAttacks(state, data, side)   — the attacks with the best chance this phase

import { planAttack, oddsPreview, tableResult, chance2d6, eligibleAttackers, barrageMax, extraAttackerLoss } from './combat.js';
import { findUnit, nationOf } from './units.js';
import { currentMonth } from './state.js';
import { boxName } from './boxes.js';
import { unitLabel } from './moves.js';
import { queueCheck } from './orders.js';

const pct = (p) => `${Math.round(p * 100)}%`;
const monthNumber = (month) => Number(month.slice(5, 7));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

// What each roll of two dice (2 to 12) would do to this attack:
//   [{ roll, chance, a, d, taken, dugIn }] — a/d are steps lost by attacker/defender.
// The same rules as oddsPreview() and applyCombatResult() in combat.js:
//   - dug in (trench 2+): an R becomes "+1 D, no retreat";
//   - the box falls on an R, or if every defending step is destroyed,
//     as long as some attacker is left.
export function rollOutcomes(state, data, order) {
  const plan = planAttack(state, data, order);
  if (plan.empty || plan.finalColumn === null || plan.ratioColumn < 0) return { plan, rolls: [] };
  const dug = state.boxes[order.target].trench >= data.combat.dugInTrench;
  const extra = extraAttackerLoss(state, data, plan);   // Defence in depth
  const rolls = [];
  for (let t = 2; t <= 12; t++) {
    let { a, d, r } = tableResult(data.combat, t, plan.finalColumn);
    const dugIn = dug && r;
    if (dugIn) { d += 1; r = false; }
    a = Math.min(a + extra, plan.attackSteps);
    d = Math.min(d, plan.defendSteps);
    const taken = (r || d >= plan.defendSteps) && a < plan.attackSteps;
    rolls.push({ roll: t, chance: chance2d6(t), a, d, retreat: r, dugIn, taken });
  }
  return { plan, rolls };
}

// The first month after `month` that isn't winter.
function springAfter(data, month) {
  const winter = data.combat.winter.months;
  let m = monthNumber(month);
  for (let i = 0; i < 12 && winter.includes(m); i++) m = (m % 12) + 1;
  return MONTHS[m - 1];
}

// How many more attacking steps would reach the next odds column (before shifts).
function stepsToNextColumn(data, plan) {
  const cols = data.combat.columns;
  const next = cols[plan.ratioColumn + 1];
  if (!next) return null;
  const need = Math.ceil(next.ratio * plan.defendSteps - 1e-9) - plan.attackSteps;
  return need > 0 ? { steps: need, label: next.label } : null;
}

// The order slip's explanation of an attack, in plain English:
//   { rollLine, why: [..], fixes: [..], futileLine, pTake, rolls }
export function attackAdvice(state, data, order) {
  const { plan, rolls } = rollOutcomes(state, data, order);
  const out = { rollLine: '', why: [], fixes: [], futileLine: '', pTake: 0, rolls, plan };
  if (!plan.ok && !(plan.ratioColumn !== null && plan.ratioColumn < 0)) return out;
  if (plan.empty) { out.rollLine = 'No one holds it: it is taken without a roll.'; out.pTake = 1; return out; }
  if (plan.ratioColumn < 0) {
    const need = Math.ceil(0.5 * plan.defendSteps) - plan.attackSteps;
    out.rollLine = 'Not allowed: the odds are below 1:2.';
    out.why.push(`You have ${plan.attackSteps} steps against ${plan.defendSteps}. You need at least half their steps: ${need} more.`);
    return out;
  }
  // 1. The roll needed.
  const winning = rolls.filter((r) => r.taken);
  out.pTake = winning.reduce((s, r) => s + r.chance, 0);
  if (!winning.length) out.rollLine = 'No roll of the dice takes it (0%).';
  else if (winning.length === 11) out.rollLine = 'Any roll takes it (100%).';
  else if (winning.every((r, i) => i === 0 || r.roll === winning[i - 1].roll + 1) && winning[winning.length - 1].roll === 12) {
    out.rollLine = `You take it on a roll of ${winning[0].roll} or more on two dice (${pct(out.pTake)}).`;
  } else {
    out.rollLine = `You take it on a roll of ${winning.map((r) => r.roll).join(', ')} (${pct(out.pTake)}).`;
  }

  // 2. Why: the dug-in rule is the usual reason for 0%.
  const trench = state.boxes[order.target].trench;
  const dug = trench >= data.combat.dugInTrench;
  const bestKill = Math.max(...rolls.map((r) => r.d));
  if (!winning.length && dug) {
    out.why.push(`0%: they're dug in (trench ${trench}). Retreat results can't make them fall back, so you'd have to destroy all ${plan.defendSteps} steps in one attack, and the best roll destroys ${bestKill}.`);
    out.fixes.push('Wear them down: each attack still destroys steps, and a box with fewer steps can be wiped out. Or attack a territory with trench 0–1.');
  } else if (!winning.length) {
    out.why.push(`0%: at column ${plan.columnLabel} the table never makes them retreat, and the best roll destroys only ${bestKill} of their ${plan.defendSteps} steps.`);
  } else if (dug) {
    out.why.push(`They're dug in (trench ${trench}): retreat results don't count, so only rolls that destroy all ${plan.defendSteps} steps take it.`);
  } else {
    out.why.push(`At column ${plan.columnLabel}, rolls with an R make them retreat${bestKill >= plan.defendSteps ? ', and rolls that destroy all their steps take it too' : ''}.`);
  }

  // 3. What's holding the attack back, biggest first, with what you can do about it.
  const month = currentMonth(state);
  const negatives = plan.shifts.filter((s) => s.value < 0).sort((a, b) => a.value - b.value);
  const payer = plan.payer ? state.resources[plan.payer] : null;
  const maxBarrage = Math.min(barrageMax(data, month, state, plan.side), payer ? payer.munitions : 0);
  for (const s of negatives) {
    const v = `${s.label} \u2212${-s.value}`;
    if (s.label.startsWith('Winter')) out.fixes.push(`${v}: winter ends in ${springAfter(data, month)}.`);
    else if (s.label.startsWith('Trench')) {
      out.fixes.push((order.munitions || 0) < maxBarrage
        ? `${v}: a barrage gives +1 per munition (you can use ${maxBarrage} here).`
        : `${v}: your barrage is already as big as it can be (${maxBarrage}).`);
    } else out.fixes.push(`${v}: this is the ground or the enemy's strength. Another territory may be easier.`);
  }
  const next = stepsToNextColumn(data, plan);
  if (next && plan.attackers.length < 3) out.fixes.push(`Odds ${plan.attackSteps} to ${plan.defendSteps}: ${next.steps} more step${next.steps === 1 ? '' : 's'} would reach ${next.label} (up to 3 units can stand in one territory).`);

  // 4. The cost of failing at bad odds (RULES.md §9.4).
  const worst = data.combat.columns.findIndex((c) => c.label === data.combat.futile.worstColumn);
  if (plan.finalColumn <= worst && plan.payer) {
    out.futileLine = `If it fails at ${plan.columnLabel} (1:1 or worse), ${nationOf(data, plan.payer).name} loses ${data.combat.futile.will} Will.`;
  }
  return out;
}

// The best attacks the side can make now, after its queued orders:
//   [{ target, units, munitions, pTake, columnLabel, attackerLoss, defenderLoss }]
// For each enemy territory it tries each nation's eligible units on their own and
// all of them together, with every barrage it can afford, and keeps the best.
// Ranked by the chance of taking it, then by losses (theirs minus ours).
export function bestAttacks(state, data, side, n = 3) {
  const s = queueCheck(state, data).state;
  const month = currentMonth(s);
  const found = [];
  const score = (o) => o.pTake * 100 + (o.defenderLoss - o.attackerLoss);
  for (const box of data.map.boxes) {
    if (s.boxes[box.id].owner === side) continue;
    const ids = eligibleAttackers(s, data, box.id);
    if (!ids.length) continue;
    const groups = {};
    for (const id of ids) { const nat = findUnit(s, id).nation; (groups[nat] = groups[nat] || []).push(id); }
    const options = Object.values(groups);
    if (options.length > 1) options.push(ids);
    let best = null;
    for (const units of options) {
      for (let mun = 0; mun <= barrageMax(data, month, s, side); mun++) {
        const order = { target: box.id, units, munitions: mun };
        const odds = oddsPreview(s, data, order);
        if (!odds.plan.ok) continue;
        const o = { target: box.id, units, munitions: mun, pTake: odds.pTake, columnLabel: odds.plan.columnLabel,
          attackerLoss: odds.attackerLoss, defenderLoss: odds.defenderLoss };
        // a better chance wins; equal chances: fewer munitions
        if (!best || score(o) > score(best) + 1e-9) best = o;
      }
    }
    if (best) found.push(best);
  }
  return found.sort((a, b) => score(b) - score(a)).slice(0, n);
}

// ---------------------------------------------------------------- the phase guide
// What the player can do right now, in one or two sentences, with what's left to
// spend. Returns '' when it's the computer's phase.
export function phaseGuide(state, data) {
  if (state.over) return 'The war is over.';
  if (state.pendingBudget) return 'War Office: divide this month’s Industry, then sign the estimates.';
  if (state.pendingChoice) return 'A decision is waiting: answer it below.';
  const phase = data.phases.phases[state.phase];
  if (!phase || phase.auto || (state.controllers || {})[phase.side] === 'ai') return '';
  const side = data.nations.sides.find((s) => s.id === phase.side);
  const nations = data.nations.nations.filter((n) => n.side === phase.side && state.will[n.id] !== undefined &&
    !(n.traits || []).some((t) => t.kind === 'cannot-attack'));
  const left = (key) => nations.map((n) => `${n.name} ${(state.resources[n.id] || {})[key] || 0}`).join(' · ');
  if (phase.kind === 'move') {
    return `${side.name} move: tap a unit, then a territory: brass = road, blue = rail (left: ${left('rail')}). ` +
      'Stack up to 3 in one front territory to attack. Then COMMIT.';
  }
  return `${side.name} attack: tap a territory outlined in red. OP: ${left('op')}. Munitions: ${left('munitions')}. Then COMMIT.`;
}

// The territories a side can attack right now (after its queued orders).
export function attackableBoxes(state, data, side) {
  const s = queueCheck(state, data).state;
  return data.map.boxes.filter((b) => s.boxes[b.id].owner !== side && eligibleAttackers(s, data, b.id).length > 0).map((b) => b.id);
}

// ---------------------------------------------------------------- battle reports
// A plain-English report of one attack after it happened, for the panel's "Battle
// reports". `action` is a recorded attack (js/engine/orders.js / ai.js):
// { side, target, result, after }. Returns { box, title, lines: [..], taken }.
export function battleReport(data, action) {
  const r = action.result;
  const nation = (id) => data.nations.nations.find((n) => n.id === id);
  const side = data.nations.sides.find((s) => s.id === action.side);
  const only = side && side.nations.length === 1 ? nation(side.nations[0]) : null;
  const sideName = only ? only.adjective : side ? side.name : action.side;
  const place = (id) => boxName(data.map, data.map.boxes.find((b) => b.id === id));
  const unitAfter = (id) => action.after.units.find((u) => u.id === id);
  const labelOf = (id) => { const u = unitAfter(id); return u ? unitLabel(data, u) : 'a unit'; };
  const byNation = (o) => Object.entries(o || {}).filter(([, v]) => v > 0).map(([n, v]) => `${nation(n).name} ${v}`).join(', ');
  const total = (o) => Object.values(o || {}).reduce((s, v) => s + v, 0);
  const lines = [];
  if (r.empty) lines.push('No one held it: taken without a fight.');
  else {
    lines.push(`Rolled ${r.dice[0]} + ${r.dice[1]} = ${r.roll} on column ${r.plan.columnLabel}` +
      `${r.plan.munitions ? ` (barrage of ${r.plan.munitions})` : ''}.`);
    const theirs = { ...r.defenderLost };
    for (const [n, v] of Object.entries(r.retreatLost || {})) theirs[n] = (theirs[n] || 0) + v;
    lines.push(`Steps lost: attackers ${total(r.attackerLost)}${total(r.attackerLost) ? ` (${byNation(r.attackerLost)})` : ''}, ` +
      `defenders ${total(theirs)}${total(theirs) ? ` (${byNation(theirs)})` : ''}.`);
    if (r.dugIn) lines.push('They were dug in (trench 2+): the retreat became one more loss, and they held their ground.');
  }
  // who moved
  const groups = {};
  for (const m of r.retreats || []) (groups[m.to] = groups[m.to] || []).push(labelOf(m.unit));
  for (const [to, names] of Object.entries(groups)) lines.push(`Fell back to ${place(to)}: ${names.join(', ')}.`);
  if ((r.cutOff || []).length) lines.push(`Cut off and destroyed: ${r.cutOff.length} unit${r.cutOff.length === 1 ? '' : 's'} with nowhere to fall back.`);
  if ((r.advanced || []).length) lines.push(`Advanced into ${place(action.target)}: ${r.advanced.map((m) => labelOf(m.unit)).join(', ')}.`);
  // the front line
  if (r.taken) lines.push(`The front line moved: ${place(action.target)} now belongs to the ${side ? side.name : sideName}.`);
  else lines.push('The line held.');
  const will = Object.entries(r.will || {}).filter(([, v]) => v);
  if (r.futile) lines.push(`A futile attack at bad odds: ${nation(r.plan.payer).name} −${data.combat.futile.will} Will.`);
  if (will.length) lines.push(`Will: ${will.map(([n, v]) => `${nation(n).name} ${v > 0 ? '+' : '−'}${Math.abs(v)}`).join(', ')}.`);
  return { box: action.target, title: `${sideName} attack on ${place(action.target)}`, lines, taken: Boolean(r.taken) };
}
