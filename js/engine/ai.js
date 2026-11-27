// ai.js — the computer opponent (RULES.md §14). It uses the same rules and the same
// orders as a player. It mirrors the AI in tools/wfsim.py, where the game was
// balance-tested, with its weights in data/ai.json.
//   1. Repair: replacements already go to the weakest units in the most threatened
//      boxes (systems/replacements.js).
//   2. Defend (move phase): fill the most threatened front boxes, in two passes as
//      tools/wfsim.py does: a step next door, else rail, else a step along the way.
//   3. Attack (attack phase): score every possible attack and make the best ones while
//      the score is above 0, at 2:1 or better, until expected losses pass RP + 2.
//   Questions (U-boats, the Hindenburg Line) are answered in events.js.
// Every function changes the state it is given (turn.js passes a copy).

import { currentMonth, copyState } from './state.js';
import { unitsIn, stackRoom, sideOfNation, nationOf, unitType } from './units.js';
import { indexBoxes } from './boxes.js';
import { moveUnit, railMove, railTargets, mergeUnits, mergeReason } from './moves.js';
import { threat } from './systems/replacements.js';
import { eligibleAttackers, oddsPreview, resolveAttack, barrageMax } from './combat.js';
import { next as rngNext } from './rng.js';
import { onceShift, cardById } from './commanders.js';

const boxesOf = (data) => indexBoxes(data.map);

// Boxes a side owns that touch an enemy box.
export function frontBoxes(state, data, side) {
  const boxes = boxesOf(data);
  return Object.keys(state.boxes).filter((id) => state.boxes[id].owner === side &&
    boxes[id].neighbours.some((n) => state.boxes[n].owner !== side));
}

// Apply an order function to a copy and bring the result back into `state`
// (the engine's order functions return new states).
function apply(state, fn) {
  try {
    const next = fn(copyState(state));
    Object.assign(state, next);
    return true;
  } catch (err) {
    return false;
  }
}

// The path through friendly boxes from `from` to `to` (not including `from`), or null.
function pathTowards(state, data, from, to, side) {
  const boxes = boxesOf(data);
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length) {
    const b = queue.shift();
    if (b === to) break;
    for (const n of boxes[b].neighbours) {
      if (!(n in prev) && state.boxes[n].owner === side) { prev[n] = b; queue.push(n); }
    }
  }
  if (!(to in prev)) return null;
  const path = [];
  for (let b = to; b !== from; b = prev[b]) { if (b === null) return null; path.unshift(b); }
  return path;
}

// Merge damaged pieces (RULES.md §14): in each territory, two of the side's pieces of
// the same nation and type whose steps fit in one become one. The computer never splits.
function aiMerge(state, data, side, record) {
  for (let guard = 0; guard < 40; guard++) {
    const mine = state.units.filter((u) => sideOfNation(data, u.nation) === side && u.steps < unitType(data, u).maxSteps);
    let pair = null;
    for (const a of mine) {
      const b = mine.find((x) => x !== a && !mergeReason(state, data, a.id, x.id));
      if (b) { pair = a.steps >= b.steps ? [a, b] : [b, a]; break; }
    }
    if (!pair) return;
    if (!apply(state, (s) => mergeUnits(s, data, pair[0].id, pair[1].id))) return;
    if (record) record({ kind: 'merge', side, unit: pair[0].id, other: pair[1].id }, state);
  }
}

// Where each of these units is (for recording an attack: which box it came from).
const unitsAt = (state, ids) => Object.fromEntries(ids.map((id) => [id, state.units.find((u) => u.id === id).box]));

// ---------------------------------------------------------------- 2. defend
// The move phase copies tools/wfsim.py's ai_move exactly (DECISIONS.md 137), because a
// different move made the game's computer fight about half as many battles as the
// simulator's, and fewer still the more pieces it had (DECISIONS.md 101, 136):
//   - two passes; at the start of each, rank the front by threat (most threatened first)
//   - each piece, in each pass: stay if it's in a front box alone or a threatened one;
//     otherwise pick the first box on the list with room and threat above
//     fillThreatAbove, and step 1 territory into it if it's next door, else go by rail
//     (if it hasn't stepped yet and the nation has a rail move left), else step 1
//     territory along the way.
// The passes are worked out on a scratch copy of the board. Then each piece gets ONE
// real order from where it started: a road move (its two steps make one move of up to 2
// territories, RULES.md §8) or a rail move.

// Work out the two passes on `plan` (a copy of the state). Returns, in the order the
// pieces last moved, { id, from, to, rail }.
function planMoves(plan, data, side) {
  const cfg = data.ai.move;
  const boxes = boxesOf(data);
  const front = new Set(frontBoxes(plan, data, side));
  const ids = plan.units.filter((u) => sideOfNation(data, u.nation) === side &&
    !(nationOf(data, u.nation).traits || []).some((t) => t.kind === 'cannot-attack')).map((u) => u.id);
  const moves = new Map();                               // unit id → { id, from, to, rail }
  const stepped = new Set();                             // pieces that took a road step
  const note = (u, from, rail) => {
    const m = moves.get(u.id) || { id: u.id, from, rail };
    moves.delete(u.id);                                  // re-add so the order is "last moved"
    moves.set(u.id, { ...m, to: u.box, rail });
  };
  for (let pass = 0; pass < 2; pass++) {
    const ranked = [...front].sort((a, b) => threat(plan, data, b) - threat(plan, data, a));
    for (const id of ids) {
      const u = plan.units.find((x) => x.id === id);
      if (!u || u.moved || u.railed) continue;           // moved before the phase, or by rail
      const here = u.box;
      if (front.has(here) && (unitsIn(plan, here).length <= 1 || threat(plan, data, here) > cfg.keepThreatAbove)) continue;
      const target = ranked.find((b) => b !== here && stackRoom(plan, data, b) > 0 && threat(plan, data, b) > cfg.fillThreatAbove);
      if (!target) continue;
      if (boxes[here].neighbours.includes(target)) {     // next door: step in
        u.box = target; stepped.add(id); note(u, here, false); continue;
      }
      if (!stepped.has(id) && railTargets(plan, data, id).includes(target)) {
        plan.resources[u.nation].rail -= 1;               // the rail move itself is made later
        u.box = target; u.railed = true; note(u, here, true); continue;
      }
      const path = pathTowards(plan, data, here, target, side);
      if (path && path.length && stackRoom(plan, data, path[0]) > 0) {
        u.box = path[0]; stepped.add(id); note(u, here, false);
      }
    }
  }
  return [...moves.values()].filter((m) => m.to !== m.from);
}

// `record(action, state)` is optional: called after each move so the screen can play
// the computer's turn back (js/engine/orders.js describes actions). It only watches;
// it never changes what the computer decides.
export function aiMove(state, data, side, record = null) {
  aiMerge(state, data, side, record);
  let todo = planMoves(copyState(state), data, side);
  // Give the real orders. A box can still be full for a moment (a piece that left it in
  // the plan hasn't left yet), so anything that fails is tried again after the rest.
  for (let round = 0; round < 3 && todo.length; round++) {
    const left = [];
    for (const m of todo) {
      const order = m.rail ? (s) => railMove(s, data, m.id, m.to) : (s) => moveUnit(s, data, m.id, m.to);
      if (apply(state, order)) { if (record) record({ kind: m.rail ? 'rail' : 'move', side, unit: m.id, from: m.from, to: m.to }, state); }
      else left.push(m);
    }
    if (left.length === todo.length) break;
    todo = left;
  }
}

// ---------------------------------------------------------------- 3. attack
// How far past the attacker's own front column a box lies (0.5 VP per column).
function depthPast(data, boxId, side) {
  const cols = data.map.columns;
  const gap = cols.findIndex((c) => c.id === data.map.frontGapAfterColumn);
  const ownFront = side === cols[gap].side ? gap : gap + 1;
  const i = cols.findIndex((c) => c.id === boxesOf(data)[boxId].column);
  return Math.abs(i - ownFront);
}

// Historical urges (RULES.md §14 step 4).
function urge(data, side, nation, boxId, month) {
  const lane = data.map.lanes.find((l) => l.id === boxesOf(data)[boxId].lane).number;
  let bonus = 0;
  for (const u of data.ai.urges) {
    if ((u.side && u.side !== side) || (u.nation && u.nation !== nation)) continue;
    if (month < u.from || month > u.to) continue;
    if (u.box && u.box !== boxId) continue;
    if (u.lanes && !u.lanes.includes(lane)) continue;
    bonus += u.bonus;
  }
  return bonus;
}

// Score one possible attack (RULES.md §14 step 3). Returns null if not worth a look.
function scoreAttack(state, data, side, nation, target, units, munitions, skill, cardShift = false) {
  const odds = oddsPreview(state, data, { target, units, munitions, cardShift });
  if (!odds.plan.ok) return null;
  const minCol = data.combat.columns.findIndex((c) => c.label === skill.minColumn);
  if (!odds.plan.empty && odds.plan.finalColumn < minCol) return null;
  const box = boxesOf(data)[target];
  let value = box.vp > 0 ? box.vp : 1;
  value += 0.5 * depthPast(data, target, side);
  if (skill.nearbyVpShare) {
    for (const n of box.neighbours) {
      if (state.boxes[n].owner !== side && boxesOf(data)[n].vp > 0) value += boxesOf(data)[n].vp * skill.nearbyVpShare;
    }
  }
  const month = currentMonth(state);
  // Will lost: expected steps lost ÷ each nation's steps-per-Will.
  const defNation = (unitsIn(state, target)[0] || {}).nation;
  const enemyRate = defNation ? (nationOf(data, defNation).stepsPerWill || 2) : 2;
  const ownRate = nationOf(data, nation).stepsPerWill || 2;
  const willSwing = odds.defenderLoss / enemyRate - odds.attackerLoss / ownRate;
  const score = odds.pTake * (value + urge(data, side, nation, target, month)) + skill.attackWill * willSwing * 3 -
    skill.lossWeight * odds.attackerLoss - skill.munitionCost * munitions;
  return { score, odds };
}

// `record` as for aiMove: called after each attack with its result.
export function aiAttack(state, data, side, record = null) {
  const skill = data.ai.skills[(state.aiSkill || {})[side] || 'standard'];
  const month = currentMonth(state);
  const spent = {};
  for (let guard = 0; guard < 60; guard++) {
    let best = null;
    const targets = new Set();
    for (const b of frontBoxes(state, data, side)) for (const n of boxesOf(data)[b].neighbours) if (state.boxes[n].owner !== side) targets.add(n);
    for (const nation of data.nations.nations.filter((n) => n.side === side).map((n) => n.id)) {
      const res = state.resources[nation];
      if (!res || res.op < 1) continue;
      // stop at this month's Manpower + 2: the full Manpower, before any went to a
      // new unit (RULES.md §19.9), as tools/wfsim.py counts it
      if ((spent[nation] || 0) > res.rp + (res.unitMP || 0) + skill.stopLoss) continue;
      // A once-only commander shift (the Nivelle Method): the computer follows history
      // and uses it in the card's last month (April 1917), as tools/wfsim.py does.
      const shift = onceShift(state, data, nation);
      const cardShift = Boolean(shift && month >= cardById(data, shift.card).to);
      for (const target of targets) {
        const units = eligibleAttackers(state, data, target).filter((id) => state.units.find((u) => u.id === id).nation === nation);
        if (!units.length) continue;
        const maxMun = Math.min(res.munitions, barrageMax(data, month, state, side));
        for (let mun = 0; mun <= maxMun; mun++) {
          const s = scoreAttack(state, data, side, nation, target, units, mun, skill, cardShift);
          if (!s) continue;
          const { value: r, rng } = rngNext(state.rng);
          state.rng = rng;
          const noisy = s.score * (1 + (r * 2 - 1) * skill.noise);
          if (!best || noisy > best.score) best = { score: noisy, nation, target, units, mun, cardShift, loss: s.odds.attackerLoss };
        }
      }
    }
    if (!best || best.score <= 0) break;
    const before = record ? unitsAt(state, best.units) : null;
    const out = resolveAttack(state, data, { target: best.target, units: best.units, munitions: best.mun, cardShift: best.cardShift });
    Object.assign(state, out.state);
    if (record) record({ kind: 'attack', side, target: best.target, units: best.units, munitions: best.mun, from: before, result: out.result }, state);
    spent[best.nation] = (spent[best.nation] || 0) + best.loss;
    if (state.over) break;
  }
}
