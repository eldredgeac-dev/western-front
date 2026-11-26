// ai.js — the computer opponent (RULES.md §14). It uses the same rules and the same
// orders as a player. It mirrors the AI in tools/wfsim.py, where the game was
// balance-tested, with its weights in data/ai.json.
//   1. Repair: replacements already go to the weakest units in the most threatened
//      boxes (systems/replacements.js).
//   2. Defend (move phase): fill the most threatened front boxes (ranked once), by road, then rail.
//   3. Attack (attack phase): score every possible attack and make the best ones while
//      the score is above 0, at 2:1 or better, until expected losses pass RP + 2.
//   Questions (U-boats, the Hindenburg Line) are answered in events.js.
// Every function changes the state it is given (turn.js passes a copy).

import { currentMonth, copyState } from './state.js';
import { unitsIn, stackRoom, sideOfNation, nationOf, unitType } from './units.js';
import { indexBoxes } from './boxes.js';
import { moveUnit, railMove, railTargets, moveTargets, mergeUnits, mergeReason } from './moves.js';
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
// `record(action, state)` is optional: called after each move so the screen can play
// the computer's turn back (js/engine/orders.js describes actions). It only watches;
// it never changes what the computer decides.
export function aiMove(state, data, side, record = null) {
  const cfg = data.ai.move;
  const boxes = boxesOf(data);
  const front = new Set(frontBoxes(state, data, side));
  const mine = state.units.filter((u) => sideOfNation(data, u.nation) === side &&
    !(nationOf(data, u.nation).traits || []).some((t) => t.kind === 'cannot-attack'));
  aiMerge(state, data, side, record);
  // Rank the front by threat ONCE, at the start of the move phase, as tools/wfsim.py
  // does (DECISIONS.md 127–128). Reserves then go down this list, so they gather in the
  // most threatened territories (up to 3 pieces) instead of spreading one per territory.
  // (Each territory's threat is still checked live before a piece goes there.)
  const ranked = [...front].sort((a, b) => threat(state, data, b) - threat(state, data, a));
  for (const unitRef of mine) {
    const u = state.units.find((x) => x.id === unitRef.id);
    if (!u || u.moved) continue;
    const here = u.box;
    // a unit in a front box stays unless it has company and the box is quiet
    if (front.has(here) && (unitsIn(state, here).length <= 1 || threat(state, data, here) > cfg.keepThreatAbove)) continue;
    const target = ranked.find((b) => b !== here && stackRoom(state, data, b) > 0 && threat(state, data, b) > cfg.fillThreatAbove);
    if (!target) continue;
    const note = (kind, to) => { if (record) record({ kind, side, unit: u.id, from: here, to }, state); };
    const road = moveTargets(state, data, u.id);       // up to 2 territories (RULES.md §8)
    if (road.includes(target)) { if (apply(state, (s) => moveUnit(s, data, u.id, target))) note('move', target); continue; }
    if (railTargets(state, data, u.id).includes(target)) { if (apply(state, (s) => railMove(s, data, u.id, target))) note('rail', target); continue; }
    // otherwise as far along the way as a road move goes
    const path = pathTowards(state, data, here, target, side) || [];
    const step = [...path].reverse().find((b) => road.includes(b));
    if (step && apply(state, (s) => moveUnit(s, data, u.id, step))) note('move', step);
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
      if ((spent[nation] || 0) > res.rp + skill.stopLoss) continue;
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
