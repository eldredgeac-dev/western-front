// systems/will.js — National Will and victory (RULES.md §11, §10 mutinies).
//   Each turn, every nation loses 1 Will per N steps lost (N from nations.json:
//   3 or 2), rounded down, worked out
//   fresh each turn (pending rule fix 15). a nation with no Will of its own (Belgium) counts against another,
//   worked out separately.
//   The first time a nation with a "mutiny" drops below its threshold, its
//   units can't attack for some turns, then it gains Will back. Happens once.
//   If the USA's Will is 0, US units can't attack (pending rule fix 16).
//   Then the victory check: sudden victory, or the Armistice Score after the last turn.

import { addLog } from '../moves.js';
import { sendTelegram } from '../telegrams.js';
import { cardLimit, cardWill } from '../commanders.js';

const nationsOf = (data) => data.nations.nations;

// Will lost from this turn's step losses.
function lossWill(state, data) {
  for (const n of nationsOf(data)) {
    const lost = state.lostThisTurn[n.id] || 0;
    if (!lost) continue;
    const target = state.will[n.id] !== undefined ? n.id : n.willCountsAgainst;
    if (!target || state.will[target] === undefined) continue;
    // a commander may change the rate for the nation's own losses (Pétain: 1 per 3)
    const rate = (target === n.id && cardLimit(state, data, 'steps-per-will', n.id)) || n.stepsPerWill || 2;
    const drop = Math.floor(lost / rate);
    if (drop) state.will[target] -= drop;
  }
}

// Start a nation's mutinies now (RULES.md §10; also Nivelle's failed attack, §15).
// They happen only once. Changes `state`; returns true if they started.
//   why — optional words for the log ("The Nivelle Method failed")
export function startMutiny(state, data, nationId, why = '') {
  const n = nationsOf(data).find((x) => x.id === nationId);
  state.mutinies = state.mutinies || {};
  state.cannotAttack = state.cannotAttack || {};
  if (!n || !n.mutiny || state.mutinies[n.id]) return false;
  const turns = mutinyLength(state, data, n);
  state.mutinies[n.id] = { left: turns, served: 0, month: state.turn };
  state.cannotAttack[n.id] = n.mutiny.name;
  addLog(state, `${n.mutiny.name.toUpperCase()}: ${why ? `${why}. ` : ''}${n.adjective || n.name} units refuse to attack for ${turns} turns.`);
  if (n.mutiny.telegram) sendTelegram(state, 'mutiny-start', n.mutiny.telegram.start, { ...n.mutiny, turns, willAfter: mutinyWill(state, data, n) });
  return true;
}

// How many turns a nation's mutinies last, and the Will it gets back after: the data's
// numbers, unless the commander changes them (Pétain: 2 turns, then +15).
const mutinyLength = (state, data, n) => cardLimit(state, data, 'mutiny-length', n.id) || n.mutiny.turns;
const mutinyWill = (state, data, n) => cardLimit(state, data, 'mutiny-end-will', n.id) || n.mutiny.willAfter;

// Mutinies (RULES.md §10): start the first time Will drops below the threshold. Each
// Will phase after they start counts one turn served; they end when the turns served
// reach the length under the commander in command then.
function mutinies(state, data) {
  state.mutinies = state.mutinies || {};
  state.cannotAttack = state.cannotAttack || {};
  for (const n of nationsOf(data)) {
    if (!n.mutiny || state.will[n.id] === undefined) continue;
    const m = state.mutinies[n.id];
    if (m && m.left > 0) {
      // (saves from before version 7 kept only the turns left)
      m.served = (m.served ?? (n.mutiny.turns - m.left)) + 1;
      m.left = Math.max(0, mutinyLength(state, data, n) - m.served);
      if (m.left === 0) {
        const will = mutinyWill(state, data, n);
        state.will[n.id] += will;
        delete state.cannotAttack[n.id];
        addLog(state, `The ${n.mutiny.name} are over. ${n.name} gains ${will} Will.`);
        if (n.mutiny.telegram) sendTelegram(state, 'mutiny-end', n.mutiny.telegram.end, { ...n.mutiny, willAfter: will });
      }
    } else if (!m && state.will[n.id] < n.mutiny.belowWill) {
      startMutiny(state, data, n.id);
    }
  }
}

// US units can't attack while US Will is 0 or less.
function zeroWillNoAttack(state, data) {
  for (const n of nationsOf(data)) {
    if (!n.entersLater || state.will[n.id] === undefined) continue;
    if (state.will[n.id] <= 0) state.cannotAttack[n.id] = 'no Will left';
    else if (state.cannotAttack[n.id] === 'no Will left') delete state.cannotAttack[n.id];
  }
}

// VP of named boxes that started on one side and are now owned by the other.
// A box's starting side is the side of its column (E boxes Entente, G boxes Germany).
export function capturedVp(state, data, bySide) {
  const sideOfColumn = Object.fromEntries(data.map.columns.map((c) => [c.id, c.side]));
  let vp = 0;
  for (const box of data.map.boxes) {
    if (box.vp > 0 && sideOfColumn[box.column] !== bySide && state.boxes[box.id].owner === bySide) vp += box.vp;
  }
  return vp;
}

// The running Armistice Score (RULES.md §11): positive = Germany ahead.
export function armisticeScore(state, data) {
  const a = data.victory.armistice;
  const avg = a.minusAverage.reduce((s, n) => s + (state.will[n] || 0), 0) / a.minusAverage.length;
  return (state.will[a.plus] || 0) - avg + capturedVp(state, data, a.aboveMargin) - capturedVp(state, data, a.belowMargin);
}

// Sudden victory (end of any turn).
export function suddenVictory(state, data) {
  for (const rule of data.victory.sudden) {
    if (rule.if === 'will-zero' && state.will[rule.nation] !== undefined && state.will[rule.nation] <= 0) return rule;
    if (rule.if === 'owns' && state.boxes[rule.box].owner === rule.side) return rule;
  }
  return null;
}

// End the war with a result.
function finish(state, winner, reason) {
  state.over = true;
  state.result = { winner, reason };
  addLog(state, reason);
}

// The National Will phase: losses, mutinies, then the victory check.
export function willPhase(state, data) {
  lossWill(state, data);
  if (data.commanders) cardWill(state, data);   // Joffre, Falkenhayn, Hindenburg & Ludendorff (§15)
  mutinies(state, data);
  zeroWillNoAttack(state, data);
  const sudden = suddenVictory(state, data);
  if (sudden) { finish(state, sudden.winner, sudden.reason); return; }
  if (state.turn >= state.turns) {
    const a = data.victory.armistice;
    const score = armisticeScore(state, data);
    state.finalScore = score;
    if (score > a.margin) finish(state, a.aboveMargin, `The Armistice: a peace on German terms (score ${score.toFixed(1)}).`);
    else if (score < -a.margin) finish(state, a.belowMargin, `The Armistice: an Entente victory (score ${score.toFixed(1)}).`);
    else finish(state, 'draw', `The Armistice: a stalemate peace (score ${score.toFixed(1)}).`);
  }
}
