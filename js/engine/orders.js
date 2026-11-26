// orders.js — orders, then commit (docs/STYLE.md §6, like Axis & Allies). In a phase
// the player queues orders (moves, or attacks) instead of carrying them out at once.
// The queue lives in state.orders. COMMIT ORDERS then carries them out, in order.
//
// One orders phase (RULES.md §7, milestone 10f): a move phase can name the attack
// phase that goes with it (data/phases.json "attackPhase"). Then the player queues
// moves AND attacks in the move phase, like an Axis & Allies combat move. The moves
// always come first in the queue and are carried out first; then the side's attack
// phase begins and the attacks are carried out. So the rules are the same as moving,
// then attacking; there's just one COMMIT.
//
// An order is one of:
//   { kind: 'move', unit, to }                     — a move, by road or by rail
//   { kind: 'attack', target, units, munitions }   — an attack (js/engine/combat.js)
//
// What happened is described as a list of "actions" the screen plays back:
//   { kind: 'move' | 'rail', side, unit, from, to, after }
//   { kind: 'attack', side, target, units, munitions, from: {unitId: box}, result, after }
// where `after` is a snapshot() of the board just after it.
//   { kind: 'skipped', order, reason }
// The computer's turn produces the same actions (see ai.js and turn.js).
// Every exported function returns NEW data and never changes the state it's given.

import { copyState, currentMonth } from './state.js';
import { findUnit, sideOfUnit } from './units.js';
import { moveUnit, railMove, moveTargets, addLog } from './moves.js';
import { planAttack, oddsPreview, resolveAttack } from './combat.js';

// The attack phase that goes with the phase we're in (its index in data/phases.json),
// or -1 if this isn't a move phase with one.
export function attackPhaseFor(state, data) {
  const phases = (data.phases && data.phases.phases) || [];
  const phase = phases[state.phase];
  if (!phase || phase.kind !== 'move' || !phase.attackPhase) return -1;
  return phases.findIndex((p) => p.id === phase.attackPhase);
}
// Is this phase one orders phase (moves and attacks together)?
export const ordersPhase = (state, data) => attackPhaseFor(state, data) >= 0;
// Put a COPY of the state into the attack phase that goes with its move phase (if any).
function intoAttackPhase(s, data) {
  const i = attackPhaseFor(s, data);
  if (i >= 0) s.phase = i;
  return s;
}

// The board as the queued attacks will find it: after the queued moves, with the
// resources and units the queued attacks use taken off, and (in one orders phase)
// already in the attack phase. Use it to check or preview a new attack.
export function attackBoard(state, data, orders = state.orders || []) {
  return intoAttackPhase(queueCheck(state, data, orders).state, data);
}

// Where a unit should step to (by road) to attack `target` this turn, or null.
// Its own territory if that's next to the target; otherwise the territory next to the
// target, within a road move, with the most of its side's steps already there (they
// attack together). Pass the board as the unit's new order would find it.
export function stagingBox(state, data, unitId, target) {
  const unit = findUnit(state, unitId);
  if (!unit || unit.railed || unit.attacked) return null;
  const near = (data.map.boxes.find((b) => b.id === target) || { neighbours: [] }).neighbours;
  if (near.includes(unit.box)) return unit.box;
  const side = sideOfUnit(data, unit);
  const steps = (box) => state.units.filter((u) => u.box === box && sideOfUnit(data, u) === side).reduce((t, u) => t + u.steps, 0);
  const options = moveTargets(state, data, unitId).filter((b) => near.includes(b));
  if (!options.length) return null;
  return options.reduce((a, b) => (steps(b) > steps(a) ? b : a));
}

// Carry out one move order on `state` (a copy), by road if the box is next door,
// otherwise by rail. Returns { state, action } or throws if it isn't possible.
function doMove(state, data, order) {
  const unit = findUnit(state, order.unit);
  if (!unit) throw new Error('That unit no longer exists.');
  const from = unit.box;
  const byRoad = moveTargets(state, data, order.unit).includes(order.to);
  const next = byRoad ? moveUnit(state, data, order.unit, order.to) : railMove(state, data, order.unit, order.to);
  return { state: next, action: { kind: byRoad ? 'move' : 'rail', side: sideOfUnit(data, unit), unit: order.unit, from, to: order.to } };
}

// Check the queued orders in turn, as if each earlier one had been carried out.
// Moves are played on a copy (they're certain); attacks can't be (they need dice), so
// each attack instead "uses up" its OP and munitions and its units, so later attacks
// see what's left.
// Returns { checks: [{ ok, reason, odds }], state } — `state` is the board after the
// queued moves, with the resources the queued attacks will use already taken off.
export function queueCheck(state, data, orders = state.orders || []) {
  let s = copyState(state);
  const checks = [];
  const startPhase = s.phase;
  for (const order of orders) {
    if (order.kind === 'move') {
      try {
        s = doMove(s, data, order).state;
        checks.push({ ok: true });
      } catch (err) {
        checks.push({ ok: false, reason: err.message });
      }
      continue;
    }
    intoAttackPhase(s, data);              // one orders phase: the attacks come after the moves
    const plan = planAttack(s, data, order);
    if (!plan.ok) { checks.push({ ok: false, reason: plan.reasons.join(' '), plan }); continue; }
    const odds = oddsPreview(s, data, order);
    checks.push({ ok: true, odds, plan });
    s.resources[plan.payer].op -= plan.opCost;
    s.resources[plan.payer].munitions -= plan.munitions;
    for (const id of plan.attackers) findUnit(s, id).attacked = true;
  }
  s.phase = startPhase;                    // the board after the moves, still in this phase
  return { checks, state: s };
}

// Add an order to the queue, if it's possible after the orders already queued.
// A new move for a unit that already has one replaces it. Returns a NEW state, or
// throws an Error saying why not.
// Moves always go before the attacks (they're carried out first).
export function addOrder(state, data, order) {
  const kept = (state.orders || []).filter((o) => !(order.kind === 'move' && o.kind === 'move' && o.unit === order.unit));
  const firstAttack = kept.findIndex((o) => o.kind === 'attack');
  const at = order.kind === 'move' && firstAttack >= 0 ? firstAttack : kept.length;
  const orders = [...kept.slice(0, at), order, ...kept.slice(at)];
  const { checks } = queueCheck(state, data, orders);
  if (!checks[at].ok) throw new Error(checks[at].reason);
  const next = copyState(state);
  next.orders = orders;
  return next;
}

// Cancel queued order number `index`. Returns a NEW state. Later orders that are no
// longer possible stay in the queue, marked by queueCheck(), and are skipped at commit.
export function cancelOrder(state, index) {
  const next = copyState(state);
  next.orders = (next.orders || []).filter((_, i) => i !== index);
  return next;
}

// COMMIT ORDERS: carry out the queued orders in turn. Returns { state, actions }.
// An order that's no longer possible (its units were lost, say) is skipped with a
// line in the dispatches. In one orders phase, the moves are carried out, then the
// side's attack phase begins and the attacks are carried out; the state is left in
// that attack phase (End Phase then moves on), even if no attack was ordered.
export function commitOrders(state, data) {
  let s = copyState(state);
  const actions = [];
  const queue = state.orders || [];
  const combined = ordersPhase(s, data);
  // moves first (addOrder keeps them first; this also sorts an older saved queue)
  const sorted = combined ? [...queue.filter((o) => o.kind === 'move'), ...queue.filter((o) => o.kind !== 'move')] : queue;
  for (const order of sorted) {
    if (order.kind !== 'move' && combined) intoAttackPhase(s, data);
    try {
      if (order.kind === 'move') {
        const out = doMove(s, data, order);
        s = out.state;
        actions.push({ ...out.action, after: snapshot(s) });
      } else {
        const from = Object.fromEntries(order.units.map((id) => [id, (findUnit(s, id) || {}).box]));
        const out = resolveAttack(s, data, order);
        s = out.state;
        actions.push({ kind: 'attack', side: out.result.plan.side, target: order.target, units: order.units,
          munitions: order.munitions || 0, from, result: out.result, after: snapshot(s) });
      }
    } catch (err) {
      addLog(s, `An order was cancelled: ${err.message}`);
      actions.push({ kind: 'skipped', order, reason: err.message });
    }
  }
  if (combined) intoAttackPhase(s, data);
  s.orders = [];
  return { state: s, actions };
}

// A light copy of the board (the month, owners, trenches, units and Will) for the
// screen to show partway through playing back a turn.
export function snapshot(state) {
  return { month: currentMonth(state), boxes: JSON.parse(JSON.stringify(state.boxes)),
    units: JSON.parse(JSON.stringify(state.units)), will: { ...state.will } };
}
