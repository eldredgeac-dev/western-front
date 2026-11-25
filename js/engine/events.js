// events.js — dated events and reinforcements (RULES.md §4, §10), read from
// data/events.json. They happen in the "Events and reinforcements" phase at the
// start of each month. Choice events (the U-boat decision, the Hindenburg Line)
// wait for the side's answer: the computer answers at once, a human player gets a
// question (state.pendingChoice) and the turn waits for it.
// Every exported function changes the state it is given (turn.js passes a copy),
// except chooseOption(), which returns a new state.

import { currentMonth, addMonths, copyState } from './state.js';
import { unitsIn, stackRoom, sideOfNation, unitType } from './units.js';
import { rearColumn } from './supply.js';
import { addLog, unitLabel } from './moves.js';
import { next as rngNext } from './rng.js';

const monthOfYear = (month) => Number(month.slice(5, 7));
const laneNumber = (data, boxId) => data.map.lanes.find((l) => l.id === data.map.boxes.find((b) => b.id === boxId).lane).number;
const boxesIn = (data, column, lanes) => data.map.boxes
  .filter((b) => b.column === column && (!lanes || lanes.includes(data.map.lanes.find((l) => l.id === b.lane).number)));

// Does an event happen this month?
export function eventDue(event, month) {
  if (event.month) return event.month === month;
  if (event.from && month < event.from) return false;
  if (event.to && month > event.to) return false;
  return !event.months || event.months.includes(monthOfYear(month));
}

// ---------------------------------------------------------------- effects
// Apply one effect. Each `kind` is described in docs/DATA.md.
function applyEffect(state, data, effect) {
  const month = currentMonth(state);
  const k = effect.kind;
  if (k === 'will') {
    if (state.will[effect.nation] !== undefined) state.will[effect.nation] += effect.value;
  } else if (k === 'attack-shift') {
    state.eventShifts.push({ side: effect.side, lanes: effect.lanes || null, shift: effect.shift, uses: effect.uses || 99, label: effect.label });
  } else if (k === 'will-for-turns') {
    state.ongoing.push({ kind: 'will', nation: effect.nation, value: effect.value, left: effect.turns });
    runOngoing(state, true);
  } else if (k === 'usa-entry') {
    state.usaEntry = effect.month;
  } else if (k === 'withdraw') {
    withdraw(state, data, effect);
  } else if (k === 'make-elite') {
    const candidates = state.units.filter((u) => u.nation === effect.nation && u.type === effect.type && u.quality !== 'elite')
      .sort((a, b) => b.steps - a.steps);
    for (const u of candidates.slice(0, effect.count)) { u.quality = 'elite'; delete u.greenUntil; addLog(state, `${unitLabel(data, u)} is now Elite.`); }
  } else if (k === 'convert') {
    const candidates = state.units.filter((u) => u.nation === effect.nation && u.type === effect.from).sort((a, b) => b.steps - a.steps);
    for (const u of candidates.slice(0, effect.count)) u.type = effect.to;
  } else if (k === 'will-if-no-attack') {
    const attacked = (state.attacks || []).some((a) => a.side === effect.side && a.month >= effect.from && a.month <= effect.to);
    if (!attacked && state.will[effect.nation] !== undefined) {
      state.will[effect.nation] += effect.value;
      return true;
    }
    return false;
  }
  void month;
  return true;
}

// Effects that last several turns (the U-boat pressure on Britain).
function runOngoing(state, justStarted = false) {
  for (const o of state.ongoing) {
    if (o.left <= 0) continue;
    if (justStarted && o.applied) continue;
    if (o.kind === 'will' && state.will[o.nation] !== undefined) state.will[o.nation] += o.value;
    o.left -= 1;
    o.applied = true;
  }
  state.ongoing = state.ongoing.filter((o) => o.left > 0);
}

// The Hindenburg Line (pending rule fix 13): units in G1 of the chosen lanes move to
// G2 (or G3 if G2 is full); those G1 boxes become the enemy's at trench 0; G2 in those
// lanes becomes trench 3; extra rail moves this turn.
function withdraw(state, data, effect) {
  const enemy = data.nations.sides.find((s) => s.id !== effect.side).id;
  for (const box of boxesIn(data, effect.from, effect.lanes)) {
    const lane = box.lane;
    const to = data.map.boxes.find((b) => b.lane === lane && b.column === effect.to).id;
    const fallback = data.map.boxes.find((b) => b.lane === lane && b.column === effect.fallback).id;
    for (const u of unitsIn(state, box.id)) {
      if (stackRoom(state, data, to) > 0) u.box = to;
      else if (stackRoom(state, data, fallback) > 0) u.box = fallback;
    }
    // anything that couldn't fit stays and the box is held (rare)
    if (unitsIn(state, box.id).length === 0) {
      state.boxes[box.id].owner = enemy;
      state.boxes[box.id].trench = 0;
    }
    state.boxes[to].trench = Math.max(state.boxes[to].trench, effect.trench);
  }
  for (const [nation, extra] of Object.entries(effect.rail || {})) state.resources[nation].rail += extra;
}

// ---------------------------------------------------------------- reinforcements
// Place one new unit in a rear box of its side with room (pending rule fix 14:
// limited to some lanes for some nations; the box is picked at random through
// rng.js). Returns false if there's no room this turn.
function placeUnit(state, data, nation, type, extra = {}) {
  const side = sideOfNation(data, nation);
  const lanes = (data.events.reinforcements.placeLanes || {})[nation];
  const rear = rearColumn(data.map, side);
  const options = boxesIn(data, rear, lanes).map((b) => b.id)
    .filter((id) => state.boxes[id].owner === side && stackRoom(state, data, id) > 0);
  if (!options.length) return false;
  const { value, rng } = rngNext(state.rng);
  state.rng = rng;
  const box = options[Math.floor(value * options.length)];
  state.arrived = (state.arrived || 0) + 1;
  const unit = { id: `${nation}-n${String(state.arrived).padStart(2, '0')}`, nation, type, box,
    steps: unitType(data, { type }).maxSteps, quality: extra.quality || 'regular', moved: false, railed: false, attacked: false };
  if (extra.greenUntil) unit.greenUntil = extra.greenUntil;
  state.units.push(unit);
  return unit;
}

// All reinforcements due this month, plus any that waited for room.
function reinforcements(state, data) {
  const month = currentMonth(state);
  const r = data.events.reinforcements;
  const due = [...(state.waiting || [])];
  for (const d of r.dated) if (d.month === month) for (let i = 0; i < d.count; i++) due.push({ ...d });
  if (state.usaEntry) {
    for (const d of r.afterEntry) {
      if (addMonths(state.usaEntry, d.after) === month) for (let i = 0; i < d.count; i++) due.push({ ...d });
    }
  }
  state.waiting = [];
  const arrived = {};
  for (const d of due) {
    const type = data.unitTypes.types.find((t) => t.id === d.type);
    // Units that start Green for some turns (US Infantry): Green until then.
    const greenUntil = d.greenUntil || (type.greenTurns ? addMonths(month, type.greenTurns) : null);
    const unit = placeUnit(state, data, d.nation, d.type, { quality: greenUntil ? 'green' : d.quality, greenUntil });
    if (unit) arrived[d.nation] = (arrived[d.nation] || 0) + 1;
    else state.waiting.push(d);
  }
  for (const [nation, n] of Object.entries(arrived)) {
    const name = data.nations.nations.find((x) => x.id === nation);
    addLog(state, `Reinforcements: ${n} ${name.adjective || name.name} unit${n === 1 ? '' : 's'} arrived.`);
  }
}

// Green units become Regular when their time is up (Kitchener's men in Jan 1917,
// US units after their first turns).
function seasoning(state) {
  const month = currentMonth(state);
  for (const u of state.units) {
    if (u.greenUntil && month >= u.greenUntil) { u.quality = 'regular'; delete u.greenUntil; }
  }
}

// The USA enters the war in its declaration month: its Will starts.
function usaEntry(state, data) {
  if (!state.usaEntry || currentMonth(state) !== state.usaEntry) return;
  const usa = data.nations.nations.find((n) => n.entersLater);
  if (usa && state.will[usa.id] === undefined) {
    state.will[usa.id] = usa.startWill;
    addLog(state, `${usa.name} declares war.`);
  }
}

// ---------------------------------------------------------------- the events phase
// Apply an event's effects and log it.
function happen(state, data, event, effects) {
  let logged = true;
  for (const e of effects) logged = applyEffect(state, data, e) !== false && logged;
  if (logged && !event.quiet) addLog(state, `${event.name.toUpperCase()}: ${event.text}`);
}

// Run this month's events. `controllers` says who plays each side ('human' or 'ai');
// a human side's choice waits in state.pendingChoice.
export function runEvents(state, data) {
  if (!data.events) return;
  state.eventShifts = [];
  state.ongoing = state.ongoing || [];
  state.attacks = state.attacks || [];
  const month = currentMonth(state);
  seasoning(state);
  runOngoing(state);
  for (const event of data.events.events) {
    if (!eventDue(event, month) || (state.eventsDone || []).includes(event.id + month)) continue;
    state.eventsDone = [...(state.eventsDone || []), event.id + month];
    if (event.choice) {
      const who = (state.controllers || {})[event.choice.side] || 'human';
      if (who === 'ai') {
        const opt = event.choice.options.find((o) => o.id === event.choice.aiChoice);
        happen(state, data, event, opt.effects);
        addLog(state, `${event.name}: ${opt.label}.`);
      } else {
        state.pendingChoice = { event: event.id, month };
        addLog(state, `${event.name.toUpperCase()}: ${event.text}`);
      }
      continue;
    }
    happen(state, data, event, event.effects);
  }
  usaEntry(state, data);
  reinforcements(state, data);
}

// The pending question, with its options, or null.
export function pendingChoice(state, data) {
  if (!state.pendingChoice) return null;
  const event = data.events.events.find((e) => e.id === state.pendingChoice.event);
  return { event, ...event.choice };
}

// Answer the pending question. Returns a NEW state (the turn then carries on).
export function chooseOption(state, data, optionId) {
  const choice = pendingChoice(state, data);
  if (!choice) throw new Error('There is no question to answer.');
  const option = choice.options.find((o) => o.id === optionId);
  if (!option) throw new Error('No such answer.');
  const next = copyState(state);
  delete next.pendingChoice;
  for (const e of option.effects) applyEffect(next, data, e);
  usaEntry(next, data);
  addLog(next, `${choice.event.name}: ${option.label}. ${option.text}`);
  return next;
}

// Helper for other modules: which lane a box is in.
export { laneNumber };
