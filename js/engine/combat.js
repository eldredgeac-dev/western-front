// combat.js — attacks (RULES.md §9): finding the column, the odds before you
// commit, and rolling and applying the result.
//
// An attack ORDER is { target: boxId, units: [unitId, …], munitions: 0, extraShifts: [] }.
//   extraShifts are shifts from events (e.g. the April 1915 gas attack): [{label, value}].
// Everything the rules need (the table, terrain, traits, costs) is read from the data
// files, so this file never names a nation or a place.
// Every function that changes the game returns a NEW state.

import { copyState, currentMonth } from './state.js';
import { roll2d6 } from './rng.js';
import { indexBoxes, boxName } from './boxes.js';
import { unitsIn, unitType, nationOf, sideOfUnit, findUnit, destroyUnit } from './units.js';
import { inSupply } from './supply.js';
import { phaseAllows, addLog, unitLabel } from './moves.js';
import { scheduleValue } from './resources.js';
import { techResearched } from './systems/economy.js';

// ---------------------------------------------------------------- the table
// "A1 D3 R" → { a: 1, d: 3, r: true }
export function parseResult(text) {
  const a = Number(/A(\d+)/.exec(text)[1]);
  const d = Number(/D(\d+)/.exec(text)[1]);
  return { a, d, r: /\bR\b/.test(text) };
}

// The result for a 2d6 total in a column (0 = 1:2 … 5 = 4:1).
export function tableResult(table, total, column) {
  const row = table.rows.find((r) => total >= r.min && total <= r.max);
  return parseResult(row.results[column]);
}

// The chance of each 2d6 total: P(2) = 1/36 … P(7) = 6/36 … P(12) = 1/36.
export function chance2d6(total) {
  return (6 - Math.abs(total - 7)) / 36;
}

// The highest column the odds reach, or −1 if below 1:2 (no attack allowed).
export function ratioColumn(table, attackSteps, defendSteps) {
  const ratio = attackSteps / defendSteps;
  let col = -1;
  table.columns.forEach((c, i) => { if (ratio >= c.ratio - 1e-9) col = i; });
  return col;
}

// Averages for one column: expected attacker and defender losses, and the chance
// of a retreat (R). RULES.md §9.3 lists these; the tests check them.
export function columnAverages(table, column) {
  let a = 0; let d = 0; let r = 0;
  for (let t = 2; t <= 12; t++) {
    const res = tableResult(table, t, column);
    const p = chance2d6(t);
    a += p * res.a; d += p * res.d; if (res.r) r += p;
  }
  return { a, d, r };
}

// ---------------------------------------------------------------- helpers
const monthNumber = (month) => Number(month.slice(5, 7));
// Does a trait work this month? Between its 'from' and 'to' dates, or earlier if
// it comes from a tech the nation has researched (RULES.md §19.5: Defence in depth).
const active = (trait, month, state = null) => (!trait.to || month <= trait.to) &&
  (!trait.from || trait.from <= month || Boolean(state && trait.tech && techResearched(state, trait.tech)));
const boxesOf = (data) => indexBoxes(data.map);

// The most munitions one attack may use this month (RULES.md §9.1). With `state`
// and the attacking `side`, research counts too: the creeping barrage researched
// early gives the Entente 3 before June 1916 (§19.5).
export function barrageMax(data, month, state = null, side = null) {
  let max = scheduleValue(data.combat.barrage.map((b) => ({ from: b.from, value: b.max })), month);
  if (state && side && data.economy) {
    for (const t of data.economy.techs) {
      if (t.effect.kind === 'barrage-max' && t.effect.side === side && techResearched(state, t.id)) max = Math.max(max, t.effect.max);
    }
  }
  return max;
}

// Defenders that count: tanks alone can't hold a box (pending rule fix 8), so a box
// with only tanks in it counts as empty.
function holdingDefenders(state, data, boxId) {
  const units = unitsIn(state, boxId);
  const holders = units.filter((u) => !unitType(data, u).cannotHoldAlone);
  return holders.length ? units : [];
}

// The nation with the most steps in the attack (it pays and takes the Will cost).
function leadNation(attackers) {
  const steps = {};
  for (const u of attackers) steps[u.nation] = (steps[u.nation] || 0) + u.steps;
  return Object.entries(steps).sort((a, b) => b[1] - a[1])[0][0];
}

// ---------------------------------------------------------------- planning an attack
// Work out everything about an attack without doing it: whether it's allowed (and
// why not), the column, and every shift with a label for the screen.
export function planAttack(state, data, order) {
  const table = data.combat;
  const month = currentMonth(state);
  const boxes = boxesOf(data);
  const target = boxes[order.target];
  const reasons = [];
  const attackers = (order.units || []).map((id) => findUnit(state, id)).filter(Boolean);
  if (!target) return { ok: false, reasons: ['No such territory.'] };
  if (attackers.length === 0) reasons.push('Choose at least one unit to attack with.');
  if (attackers.length !== (order.units || []).length) reasons.push('A chosen unit no longer exists.');
  const side = attackers.length ? sideOfUnit(data, attackers[0]) : null;
  const targetOwner = state.boxes[order.target].owner;

  if (side && targetOwner === side) reasons.push('You can only attack an enemy territory.');
  for (const u of attackers) {
    const label = unitLabel(data, u);
    if (sideOfUnit(data, u) !== side) reasons.push('All attackers must be on the same side.');
    if (!phaseAllows(state, data, u, 'attack')) reasons.push(`It is not the ${side} attack phase.`);
    if (!target.neighbours.includes(u.box)) reasons.push(`${label} is not next to the target.`);
    if (u.attacked) reasons.push(`${label} has already attacked this turn.`);
    if (u.railed) reasons.push(`${label} moved by rail this turn and can't attack.`);
    if (!inSupply(state, data, u)) reasons.push(`${label} is out of supply.`);
    const cannot = (nationOf(data, u.nation).traits || []).find((t) => t.kind === 'cannot-attack');
    if (cannot) reasons.push(`${label} can't attack (${cannot.name}).`);
    if (state.cannotAttack && state.cannotAttack[u.nation]) reasons.push(`${label} can't attack (${state.cannotAttack[u.nation]}).`);
  }

  const defenders = holdingDefenders(state, data, order.target);
  const empty = defenders.length === 0;
  const nations = [...new Set(attackers.map((u) => u.nation))];
  const payer = attackers.length ? leadNation(attackers) : null;
  const opCost = empty ? table.opCost.emptyBox : nations.length > 1 ? table.opCost.coalition : table.opCost.single;
  const munitions = empty ? 0 : (order.munitions || 0);
  if (payer && state.resources[payer] && state.resources[payer].op < opCost) {
    reasons.push(`Not enough Offensive Points (needs ${opCost}).`);
  }
  const maxBarrage = barrageMax(data, month, state, side);
  if (munitions > maxBarrage) reasons.push(`At most ${maxBarrage} munitions per attack this month.`);
  if (payer && munitions > (state.resources[payer] ? state.resources[payer].munitions : 0)) {
    reasons.push('Not enough munitions.');
  }

  const attackSteps = attackers.reduce((s, u) => s + u.steps, 0);
  const defendSteps = defenders.reduce((s, u) => s + u.steps, 0);
  const plan = {
    ok: false, reasons, order, side, payer, nations, opCost, munitions, empty,
    attackers: attackers.map((u) => u.id), defenders: defenders.map((u) => u.id),
    attackSteps, defendSteps, shifts: [], ratioColumn: null, finalColumn: null, columnLabel: null,
  };
  if (empty) {
    plan.columnLabel = 'empty';
    plan.ok = reasons.length === 0;
    return plan;
  }

  // 1. The odds column.
  const col = ratioColumn(table, attackSteps, defendSteps);
  if (col < 0) reasons.push('The odds are below 1:2: you need at least half the defending steps.');
  plan.ratioColumn = col;

  // 2. Every shift, with a label (RULES.md §9.2).
  const shifts = plan.shifts;
  const add = (label, value) => { if (value) shifts.push({ label, value }); };
  const trench = state.boxes[order.target].trench;
  add(`Trench level ${trench}`, table.trenchShiftPerLevel * trench);
  const cancel = attackers.map((u) => unitType(data, u).cancelsTrenchShift || 0).reduce((a, b) => Math.max(a, b), 0);
  if (trench > 0 && cancel) add('Stormtroopers cancel a trench level', Math.min(cancel, trench));
  const terrainTypes = target.terrain.map((id) => data.terrain.types.find((x) => x.id === id));
  for (const t of terrainTypes) {
    const c = t.combat || {};
    if (c.shift && (!c.months || c.months.includes(monthNumber(month)))) add(t.name, c.shift);
  }
  // Tanks: their usual bonus, unless the terrain says otherwise (open ground +2,
  // forest and mountains 0). If two terrains disagree, the smaller bonus counts.
  const tankUnits = attackers.filter((u) => unitType(data, u).attackShift);
  if (tankUnits.length) {
    const terrainSays = terrainTypes.map((t) => (t.combat || {}).tankShift).filter((v) => v !== undefined);
    const usual = Math.max(...tankUnits.map((u) => unitType(data, u).attackShift));
    add('Tanks', terrainSays.length ? Math.min(...terrainSays) : usual);
  }
  if (table.winter.months.includes(monthNumber(month))) add('Winter', table.winter.shift);
  add(`Barrage (${munitions} munition${munitions === 1 ? '' : 's'})`, munitions);
  // National traits (RULES.md §4), read from data/nations.json.
  const defenderUnits = defenders;
  for (const n of data.nations.nations) {
    for (const t of n.traits || []) {
      if (!active(t, month, state)) continue;
      if (t.kind === 'attack-shift' && attackers.some((u) => u.nation === n.id)) add(t.name, t.shift);
      if (t.kind === 'defend-shift' && defenderUnits.some((u) => u.nation === n.id) && n.side !== side &&
        trench <= (t.maxTrench ?? 99)) add(t.name, t.shift);
      if (t.kind === 'enemy-attack-shift' && n.side !== side) add(t.name, t.shift);
    }
  }
  // Unit quality (RULES.md §4).
  for (const q of data.unitTypes.qualities) {
    const qSteps = attackers.filter((u) => u.quality === q.id).reduce((s, u) => s + u.steps, 0);
    if (q.attackShiftIfMajority && qSteps * 2 > attackSteps) add(`${q.name} troops`, q.attackShiftIfMajority);
    if (q.attackShiftIfAny && qSteps > 0) add(`${q.name} troops`, q.attackShiftIfAny);
  }
  for (const e of order.extraShifts || []) add(e.label, e.value);
  // Event shifts this month (data/events.json, e.g. the first gas attack).
  const lane = data.map.lanes.find((l) => l.id === target.lane).number;
  plan.eventShiftsUsed = [];
  (state.eventShifts || []).forEach((e, i) => {
    if (e.side === side && e.uses > 0 && (!e.lanes || e.lanes.includes(lane))) { add(e.label, e.shift); plan.eventShiftsUsed.push(i); }
  });

  // 3. Clamp to the table (1:2 … 4:1).
  const total = shifts.reduce((s, x) => s + x.value, 0);
  plan.finalColumn = Math.max(0, Math.min(table.columns.length - 1, col + total));
  plan.columnLabel = table.columns[plan.finalColumn].label;
  plan.ok = reasons.length === 0;
  return plan;
}

// Extra attacker losses from the defender's traits (Germany's defence in depth).
export function extraAttackerLoss(state, data, plan) {
  const month = currentMonth(state);
  const trench = state.boxes[plan.order.target].trench;
  let extra = 0;
  for (const n of data.nations.nations) {
    for (const t of n.traits || []) {
      if (t.kind !== 'defender-extra-attacker-loss' || !active(t, month, state)) continue;
      const defends = plan.defenders.some((id) => findUnit(state, id).nation === n.id);
      if (defends && n.side !== plan.side && trench >= t.minTrench) extra += t.loss;
    }
  }
  return extra;
}

// The odds before committing (RULES.md §9.1 step 5): the chance of taking the box
// and the expected losses on each side, worked out exactly from the 2d6 odds.
export function oddsPreview(state, data, order) {
  const plan = planAttack(state, data, order);
  if (plan.empty) return { plan, pTake: 1, attackerLoss: 0, defenderLoss: 0 };
  if (plan.finalColumn === null || plan.ratioColumn < 0) return { plan, pTake: 0, attackerLoss: 0, defenderLoss: 0 };
  const dug = state.boxes[order.target].trench >= data.combat.dugInTrench;
  const extra = extraAttackerLoss(state, data, plan);
  let pTake = 0; let attackerLoss = 0; let defenderLoss = 0;
  for (let t = 2; t <= 12; t++) {
    const p = chance2d6(t);
    let { a, d, r } = tableResult(data.combat, t, plan.finalColumn);
    if (dug && r) { d += 1; r = false; }
    a = Math.min(a + extra, plan.attackSteps);
    d = Math.min(d, plan.defendSteps);
    attackerLoss += p * a; defenderLoss += p * d;
    if ((r || d >= plan.defendSteps) && a < plan.attackSteps) pTake += p;
  }
  return { plan, pTake, attackerLoss, defenderLoss };
}

// ---------------------------------------------------------------- applying a result
// Take `n` step losses from a group of units, strongest first, one step at a time
// (pending rule fix 10). Destroyed units go to the rebuild pool (tanks don't).
// Returns the steps actually lost, by nation.
function takeLosses(state, data, unitIds, n) {
  const lost = {};
  for (let i = 0; i < n; i++) {
    const alive = unitIds.map((id) => findUnit(state, id)).filter((u) => u && u.steps > 0);
    if (!alive.length) break;
    const u = alive.reduce((best, x) => (x.steps > best.steps ? x : best));
    u.steps -= 1;
    lost[u.nation] = (lost[u.nation] || 0) + 1;
  }
  for (const id of unitIds) {
    const u = findUnit(state, id);
    if (u && u.steps <= 0) destroy(state, data, u);
  }
  for (const [nat, s] of Object.entries(lost)) state.lostThisTurn[nat] = (state.lostThisTurn[nat] || 0) + s;
  return lost;
}

const destroy = destroyUnit;

// How deep a box is for a side: higher = further behind its own front line.
function depthFor(data, boxId, side) {
  const map = data.map;
  const gap = map.columns.findIndex((c) => c.id === map.frontGapAfterColumn) + 0.5;
  const box = boxesOf(data)[boxId];
  const i = map.columns.findIndex((c) => c.id === box.column);
  const own = map.columns[i].side === side;
  return own ? Math.abs(i - gap) : -Math.abs(i - gap);
}

// Defenders retreat 1 box into a friendly box with room, preferring deeper boxes
// (if two are equally good, the first in the map's list: pending rule fix 9).
// Units that can't retreat are destroyed. Returns steps lost by destruction.
//   moves — optional { retreats: [], cutOff: [] }: where each unit went (for the
//           battle report and the animation), or which units were cut off.
function retreat(state, data, boxId, side, moves = null) {
  const lost = {};
  const target = boxesOf(data)[boxId];
  for (const u of unitsIn(state, boxId)) {
    const options = target.neighbours.filter((n) => state.boxes[n].owner === side &&
      unitsIn(state, n).length < data.unitTypes.stackLimit);
    options.sort((a, b) => depthFor(data, b, side) - depthFor(data, a, side));
    if (options.length) {
      u.box = options[0];
      if (moves) moves.retreats.push({ unit: u.id, from: boxId, to: options[0] });
      addLog(state, `${unitLabel(data, u)} fell back.`);
    } else {
      lost[u.nation] = (lost[u.nation] || 0) + u.steps;
      state.lostThisTurn[u.nation] = (state.lostThisTurn[u.nation] || 0) + u.steps;
      if (moves) moves.cutOff.push(u.id);
      addLog(state, `${unitLabel(data, u)} was cut off and destroyed.`);
      destroy(state, data, u);
    }
  }
  return lost;
}

// Will changes when a named box changes hands (RULES.md §11).
function captureWill(state, data, boxId, captorSide) {
  const box = boxesOf(data)[boxId];
  const rules = data.combat.capture;
  const changes = {};
  const change = (nation, amount) => {
    if (state.will[nation] === undefined || !amount) return;
    state.will[nation] += amount;
    changes[nation] = (changes[nation] || 0) + amount;
  };
  if (box.vp > 0) {
    const r = rules.bySide[captorSide];
    const lane = data.map.lanes.find((l) => l.id === box.lane).number;
    const byLane = (r.loserByLane || []).find((x) => x.lanes.includes(lane));
    change(byLane ? byLane.nation : r.loserDefault, -box.vp);
    for (const g of r.gain) change(g.nation, Math.floor(box.vp * g.share));
  }
  for (const sp of rules.special) {
    if (sp.box === boxId && sp.by === captorSide) for (const [n, v] of Object.entries(sp.will)) change(n, v);
  }
  return changes;
}

// The attacker takes the box: up to 2 surviving attackers move in, strongest first;
// the box changes owner and its trench drops to 0.
//   moves — optional { advanced: [] }: which units moved in, and from where.
function capture(state, data, plan, moves = null) {
  const boxes = boxesOf(data);
  const movers = plan.attackers.map((id) => findUnit(state, id)).filter(Boolean)
    .sort((a, b) => b.steps - a.steps).slice(0, data.combat.advanceMax);
  for (const u of movers) {
    if (moves) moves.advanced.push({ unit: u.id, from: u.box, to: plan.order.target });
    u.box = plan.order.target;
  }
  state.boxes[plan.order.target].owner = plan.side;
  state.boxes[plan.order.target].trench = 0;
  addLog(state, `${boxName(data.map, boxes[plan.order.target])} was taken.`);
  return captureWill(state, data, plan.order.target, plan.side);
}

// An empty record of the pieces that moved after a battle.
const noMoves = () => ({ retreats: [], cutOff: [], advanced: [] });

// Apply a table result { a, d, r } to an attack (the dice have already been rolled).
// Changes `state` in place; resolveAttack() calls it on a fresh copy.
export function applyCombatResult(state, data, plan, cell) {
  const target = plan.order.target;
  const defenderSide = state.boxes[target].owner;
  let { a, d, r } = cell;
  const dug = state.boxes[target].trench >= data.combat.dugInTrench;
  if (dug && r) { d += 1; r = false; }                         // dug in: no retreat
  a += extraAttackerLoss(state, data, plan);                   // defence in depth
  const attackerLost = takeLosses(state, data, plan.attackers, a);
  const defenderLost = takeLosses(state, data, plan.defenders, d);
  const defendersLeft = holdingDefenders(state, data, target).length > 0;
  const attackersLeft = plan.attackers.some((id) => findUnit(state, id));
  let retreatLost = {};
  let taken = false;
  const moves = noMoves();
  // The box falls on an R, or if no defenders can hold it any more (a dug-in box
  // wiped out may still be taken: RULES.md §9.4). Anyone left in it falls back.
  if ((r || !defendersLeft) && attackersLeft) {
    retreatLost = retreat(state, data, target, defenderSide, moves);
    taken = true;
  }
  const will = taken ? capture(state, data, plan, moves) : {};
  const sum = (o) => Object.values(o).reduce((s, x) => s + x, 0);
  const stepsLost = sum(attackerLost) + sum(defenderLost) + sum(retreatLost);
  // A futile attack (RULES.md §9.4): final column 1:1 or worse and the box not taken.
  const worst = data.combat.columns.findIndex((c) => c.label === data.combat.futile.worstColumn);
  let futile = false;
  if (!taken && plan.finalColumn <= worst && state.will[plan.payer] !== undefined) {
    futile = true;
    state.will[plan.payer] -= data.combat.futile.will;
    will[plan.payer] = (will[plan.payer] || 0) - data.combat.futile.will;
  }
  state.battles.push({ box: target, month: currentMonth(state), stepsLost });
  // dugIn: an R was turned into "+1 D, no retreat" (§9.4); moves: who fell back,
  // who was cut off and who advanced (for the battle report)
  return { a, d, retreat: r, dugIn: dug && cell.r, taken, futile, attackerLost, defenderLost, retreatLost, will, stepsLost,
    ownerBefore: defenderSide, ownerAfter: state.boxes[target].owner, ...moves };
}

// Carry out an attack: check it, pay for it, roll the dice and apply the result.
// Returns { state, result }. Throws an Error with the reasons if it isn't allowed.
export function resolveAttack(state, data, order) {
  const plan = planAttack(state, data, order);
  if (!plan.ok) throw new Error(plan.reasons.join(' '));
  const next = copyState(state);
  next.resources[plan.payer].op -= plan.opCost;
  next.resources[plan.payer].munitions -= plan.munitions;
  for (const id of plan.attackers) findUnit(next, id).attacked = true;
  if (!next.attackedBoxes.includes(order.target)) next.attackedBoxes.push(order.target);
  for (const i of plan.eventShiftsUsed || []) next.eventShifts[i].uses -= 1;
  next.attacks = [...(next.attacks || []), { side: plan.side, nations: plan.nations, month: currentMonth(next), box: order.target }];
  const name = boxName(data.map, boxesOf(data)[order.target]);

  if (plan.empty) {
    // An empty enemy box is taken without a roll (pending rule fix 7).
    const moves = noMoves();
    const ownerBefore = next.boxes[order.target].owner;
    retreat(next, data, order.target, ownerBefore, moves);   // tanks alone fall back
    const will = capture(next, data, plan, moves);
    return { state: next, result: { plan, empty: true, taken: true, will, stepsLost: 0,
      attackerLost: {}, defenderLost: {}, retreatLost: {}, ownerBefore, ownerAfter: plan.side, ...moves } };
  }
  const dice = roll2d6(next.rng);
  next.rng = dice.rng;
  const cell = tableResult(data.combat, dice.total, plan.finalColumn);
  addLog(next, `Attack on ${name} at ${plan.columnLabel}: rolled ${dice.total}.`);
  const result = applyCombatResult(next, data, plan, cell);
  return { state: next, result: { plan, roll: dice.total, dice: dice.dice, cell, ...result } };
}

// The units that may attack this territory right now: on the side whose attack
// phase it is, next to the target, in supply, not yet attacked or railed, and of a
// nation that can attack. Returns [] if the target isn't an enemy territory.
export function eligibleAttackers(state, data, targetId) {
  const target = boxesOf(data)[targetId];
  if (!target) return [];
  return state.units.filter((u) => {
    const side = sideOfUnit(data, u);
    if (state.boxes[targetId].owner === side) return false;
    if (!phaseAllows(state, data, u, 'attack')) return false;
    if (!target.neighbours.includes(u.box) || u.attacked || u.railed) return false;
    if ((nationOf(data, u.nation).traits || []).some((t) => t.kind === 'cannot-attack')) return false;
    if (state.cannotAttack && state.cannotAttack[u.nation]) return false;
    return inSupply(state, data, u);
  }).map((u) => u.id);
}
