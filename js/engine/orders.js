// orders.js — orders, then commit (docs/STYLE.md §6, like Axis & Allies). In a phase
// the player queues orders (moves, or attacks) instead of carrying them out at once.
// The queue lives in state.orders. COMMIT ORDERS then carries them out, in order.
//
// An order is one of:
//   { kind: 'move', unit, to }                     — a move, by road or by rail
//   { kind: 'attack', target, units, munitions }   — an attack (js/engine/combat.js)
//
// What happened is described as a list of "actions" the screen plays back:
//   { kind: 'move' | 'rail', side, unit, from, to }
//   { kind: 'attack', side, target, units, munitions, from: {unitId: box}, result }
//   { kind: 'skipped', order, reason }
// The computer's turn produces the same actions (see ai.js and turn.js).
// Every exported function returns NEW data and never changes the state it's given.

import { copyState } from './state.js';
import { findUnit, sideOfUnit } from './units.js';
import { moveUnit, railMove, moveTargets, addLog } from './moves.js';
import { planAttack, oddsPreview, resolveAttack } from './combat.js';

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
    const plan = planAttack(s, data, order);
    if (!plan.ok) { checks.push({ ok: false, reason: plan.reasons.join(' '), plan }); continue; }
    const odds = oddsPreview(s, data, order);
    checks.push({ ok: true, odds, plan });
    s.resources[plan.payer].op -= plan.opCost;
    s.resources[plan.payer].munitions -= plan.munitions;
    for (const id of plan.attackers) findUnit(s, id).attacked = true;
  }
  return { checks, state: s };
}

// Add an order to the queue, if it's possible after the orders already queued.
// A new move for a unit that already has one replaces it. Returns a NEW state, or
// throws an Error saying why not.
export function addOrder(state, data, order) {
  const kept = (state.orders || []).filter((o) => !(order.kind === 'move' && o.kind === 'move' && o.unit === order.unit));
  const { checks } = queueCheck(state, data, [...kept, order]);
  const last = checks[checks.length - 1];
  if (!last.ok) throw new Error(last.reason);
  const next = copyState(state);
  next.orders = [...kept, order];
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
// line in the dispatches.
export function commitOrders(state, data) {
  let s = copyState(state);
  const actions = [];
  for (const order of state.orders || []) {
    try {
      if (order.kind === 'move') {
        const out = doMove(s, data, order);
        s = out.state;
        actions.push(out.action);
      } else {
        const from = Object.fromEntries(order.units.map((id) => [id, (findUnit(s, id) || {}).box]));
        const out = resolveAttack(s, data, order);
        s = out.state;
        actions.push({ kind: 'attack', side: out.result.plan.side, target: order.target, units: order.units,
          munitions: order.munitions || 0, from, result: out.result });
      }
    } catch (err) {
      addLog(s, `An order was cancelled: ${err.message}`);
      actions.push({ kind: 'skipped', order, reason: err.message });
    }
  }
  s.orders = [];
  return { state: s, actions };
}

// A light copy of the board (owners, trenches and units) for the screen to show
// partway through playing back a turn.
export function snapshot(state) {
  return { boxes: JSON.parse(JSON.stringify(state.boxes)), units: JSON.parse(JSON.stringify(state.units)), will: { ...state.will } };
}
