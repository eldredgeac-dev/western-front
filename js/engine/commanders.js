// commanders.js — commander cards (RULES.md §15). The cards, their dates, their
// Strengths and Flaws live in data/commanders.json; this file never names a commander.
//
// Each "holder" has one card at a time. A holder is a nation (fra, gbr, ger, usa) or,
// for a card "added alongside" the national ones (Foch), a side (entente).
//   state.commanders = { fra: { card: 'joffre', since: 1, askAt: null, shiftUsed: false }, … }
//     card      — the card in command
//     since     — the turn it took command (no sacking in its first 3 turns)
//     askAt     — after "keep the old commander": the turn the question comes back
//     shiftUsed — its once-only attack shift has been used (the Nivelle Method)
//   state.pendingCommander = [{ key, current, offers: [cardId, …] }] — questions a
//     player must answer before the turn goes on (turn.js answerCommander)
//   state.cardNews = [{ n, month, key, card, replaced, how }] — cards that arrived, for
//     the full-screen card (RULES.md §15.3); state.cardNewsSeen counts the ones read.
//
// What the cards do is written as "effects" in the data. Each effect may be limited to
// some months of the year ('months': [3, 4 …]) or a span ('from', 'to': 'YYYY-MM').
// The other engine files ask this one:
//   cardValue()      — the sum of an effect's values (OP, rail, Manpower, Industry …)
//   cardLimit()      — the smallest limit (Pétain's 1 attack a month, Falkenhayn's rail max 2)
//   cardEffects()    — the effects of a kind that are on now
// Every exported function that takes a state and returns one returns a NEW state,
// except those turn.js and the other engine files call on a copy (they say so).

import { currentMonth, copyState } from './state.js';
import { addLog } from './moves.js';

const monthOfYear = (month) => Number(month.slice(5, 7));
const cardsOf = (data) => (data.commanders && data.commanders.cards) || [];
const rulesOf = (data) => (data.commanders && data.commanders.rules) || {};

// The card record with this id, or null.
export const cardById = (data, id) => cardsOf(data).find((c) => c.id === id) || null;

// The holders in the data: every nation or side that has cards.
const holdersOf = (data) => [...new Set(cardsOf(data).map((c) => c.nation))];

// The side a holder belongs to ('entente' is itself a side).
export function sideOfHolder(data, key) {
  const n = data.nations.nations.find((x) => x.id === key);
  return n ? n.side : key;
}

// Is a holder in the war? A nation needs National Will (the USA only once it has
// declared war); a side is always in it.
function inWar(state, data, key) {
  const n = data.nations.nations.find((x) => x.id === key);
  return n ? state.will[key] !== undefined : true;
}

// The card in command for a holder, or null.
export function currentCard(state, data, key) {
  const c = (state.commanders || {})[key];
  return c ? cardById(data, c.card) : null;
}

// Does an effect work this month?
function effectOn(effect, month) {
  if (effect.months && !effect.months.includes(monthOfYear(month))) return false;
  if (effect.from && month < effect.from) return false;
  if (effect.to && month > effect.to) return false;
  return true;
}

// Every effect of a kind on the cards in command now (Strengths and Flaws).
//   filter(effect) — optional, to pick out a nation
export function cardEffects(state, data, kind, filter = () => true, month = currentMonth(state)) {
  const out = [];
  for (const key of Object.keys(state.commanders || {})) {
    const card = currentCard(state, data, key);
    if (!card) continue;
    for (const part of [card.strength, card.flaw]) {
      for (const e of (part && part.effects) || []) {
        if (e.kind === kind && effectOn(e, month) && filter(e)) out.push({ ...e, card: card.id, key, part: part.name });
      }
    }
  }
  return out;
}

// The sum of a kind's values for a nation (e.g. extra attacks this month).
export function cardValue(state, data, kind, nationId, month) {
  return cardEffects(state, data, kind, (e) => e.nation === nationId, month).reduce((s, e) => s + e.value, 0);
}

// The smallest limit of a kind for a nation, or null if there's none.
export function cardLimit(state, data, kind, nationId, month) {
  const list = cardEffects(state, data, kind, (e) => e.nation === nationId, month);
  return list.length ? Math.min(...list.map((e) => e.value)) : null;
}

// ---------------------------------------------------------------- appointments
// Can this card be appointed this month (as a successor)? Nivelle only in his dates
// ('onlyBetween'); a card that's "also available" instead of the usual successor (Pétain
// instead of Nivelle) only from that date.
export function availableNow(card, month, alternative = false) {
  if (card.onlyBetween && (month < card.onlyBetween[0] || month > card.onlyBetween[1])) return false;
  if (alternative && card.alsoAvailableFrom && month < card.alsoAvailableFrom) return false;
  return true;
}

// The cards that could replace a holder's commander this month, in the order of
// succession (RULES.md §15.2).
export function successors(state, data, key, month = currentMonth(state)) {
  const card = currentCard(state, data, key);
  if (!card) return [];
  return (card.next || []).map((id, i) => ({ card: cardById(data, id), alternative: i > 0 }))
    .filter((x) => x.card && availableNow(x.card, month, x.alternative)).map((x) => x.card.id);
}

// Put a card in command (changes `state`). `how` says why, for the news and the log:
//   'start' (the opening cards), 'arrives' (on its date, no choice), 'history' (the
//   computer follows history), 'chosen' (a player's answer), 'sacked'.
function appoint(state, data, key, cardId, how) {
  const old = currentCard(state, data, key);
  const card = cardById(data, cardId);
  state.commanders = { ...(state.commanders || {}), [key]: { card: cardId, since: state.turn, askAt: null, shiftUsed: false } };
  // the Old Contemptibles: named units become Elite (Elite is permanent, pending rule fix 12)
  for (const e of (card.strength && card.strength.effects) || []) {
    if (e.kind !== 'elite-units') continue;
    for (const u of state.units) if (e.units.includes(u.id)) { u.quality = 'elite'; delete u.greenUntil; }
  }
  if (how === 'start') return;
  addLog(state, old ? `COMMAND: ${card.name} replaces ${old.name}.` : `COMMAND: ${card.name} takes command.`);
  // a card the player didn't pick themselves arrives full screen (RULES.md §15.3)
  if (how !== 'chosen') {
    state.cardNews = state.cardNews || [];
    state.cardNews.push({ n: state.cardNews.length + 1, month: currentMonth(state), key, card: cardId, replaced: old ? old.id : null, how });
  }
}

// The card a holder starts with, or gets on its date without a choice: the first card
// in its succession whose dates include this month ('usa-entry' = once in the war).
function historicalCard(data, key, month) {
  const order = (data.commanders.succession || {})[key] || [];
  const cards = order.map((id) => cardById(data, id)).filter(Boolean);
  return cards.find((c) => (c.from === 'usa-entry' || c.from <= month) && (!c.to || month <= c.to)) ||
    [...cards].reverse().find((c) => c.from === 'usa-entry' || c.from <= month) || null;
}

// The cards in command at this date, by history (changes `state`): for a saved game
// from before commander cards (state.js migrateState).
export function historicalCommanders(state, data) {
  if (!data.commanders) return;
  const month = currentMonth(state);
  state.commanders = state.commanders || {};
  for (const key of holdersOf(data)) {
    if (state.commanders[key] || !inWar(state, data, key)) continue;
    const card = historicalCard(data, key, month);
    if (card) appoint(state, data, key, card.id, 'start');
  }
}

// Is the "Replace X with Y?" question due for a holder this month? Once the card's
// historical end date has passed: the first month after it, then every 3 turns after
// "keep", and also in a month when a successor's own historical date arrives (if you
// skip Nivelle, Pétain is offered in May 1917).
export function questionDue(state, data, key, month = currentMonth(state)) {
  const card = currentCard(state, data, key);
  if (!card || !card.to || month <= card.to) return false;
  const offers = successors(state, data, key, month);
  if (!offers.length) return false;
  const c = state.commanders[key];
  if (c.askAt === null || c.askAt === undefined) return true;
  if (state.turn >= c.askAt) return true;
  return offers.some((id) => cardById(data, id).from === month);
}

// The card the computer appoints: the first successor whose historical date has come.
function historicalChoice(data, offers, month) {
  return offers.find((id) => cardById(data, id).from <= month) || offers[0];
}

const isHuman = (state, data, key) => ((state.controllers || {})[sideOfHolder(data, key)] || 'human') === 'human';

// The commanders phase (RULES.md §15), straight after events. Changes `state`
// (turn.js passes a copy):
//   1. Cards that arrive on their dates without a choice (the opening cards, Foch, Pershing).
//   2. Historical changes: the computer follows history; a player is asked (the turn
//      then waits in state.pendingCommander).
//   3. With no questions waiting, this month's resources change (applyCardResources).
export function commandersPhase(state, data) {
  if (!data.commanders) return;
  const month = currentMonth(state);
  state.commanders = state.commanders || {};
  const asks = [];
  for (const key of holdersOf(data)) {
    if (!inWar(state, data, key)) continue;
    if (!state.commanders[key]) {
      const card = historicalCard(data, key, month);
      if (card) appoint(state, data, key, card.id, state.turn === 1 ? 'start' : 'arrives');
      continue;
    }
    if (!questionDue(state, data, key, month)) continue;
    const offers = successors(state, data, key, month);
    if (isHuman(state, data, key)) asks.push({ key, current: state.commanders[key].card, offers });
    else appoint(state, data, key, historicalChoice(data, offers, month), 'history');
  }
  if (asks.length) { state.pendingCommander = asks; return; }
  applyCardResources(state, data);
}

// This month's attack limit, Manpower (RP) and rail moves from the cards in command
// (changes `state`). Industry is added in systems/economy.js (industryParts). Limits
// (Pétain's 1 attack a month, Falkenhayn's 2 rail moves) come after the bonuses.
export function applyCardResources(state, data) {
  const month = currentMonth(state);
  for (const [id, r] of Object.entries(state.resources || {})) {
    r.attacks += cardValue(state, data, 'attacks', id, month);
    r.rp = Math.max(0, r.rp + cardValue(state, data, 'rp', id, month));
    r.rail += cardValue(state, data, 'rail', id, month);
    const attacksMax = cardLimit(state, data, 'attacks-max', id, month);
    if (attacksMax !== null) r.attacks = Math.min(r.attacks, attacksMax);
    const railMax = cardLimit(state, data, 'rail-max', id, month);
    if (railMax !== null) r.rail = Math.min(r.rail, railMax);
    if (!data.economy) r.munitions += cardValue(state, data, 'industry', id, month);
  }
}

// ---------------------------------------------------------------- choices
// A player answers a commander question (turn.js calls this on a copy and then carries
// on with the turn). `choice` is a card id from the offers, or 'keep'.
//   Keep: −3 Will now, and the question comes back in 3 turns (RULES.md §15.2).
export function answerQuestion(state, data, key, choice) {
  const ask = (state.pendingCommander || []).find((a) => a.key === key);
  if (!ask) throw new Error('There is no question about this commander.');
  const r = rulesOf(data);
  if (choice === 'keep') {
    const card = currentCard(state, data, key);
    state.will[key] += r.keepOldCommanderWill;
    state.commanders[key].askAt = state.turn + r.askAgainEveryTurns;
    addLog(state, `COMMAND: ${card.name} stays in command (${r.keepOldCommanderWill} Will).`);
  } else {
    if (!ask.offers.includes(choice)) throw new Error('That commander can’t be appointed now.');
    appoint(state, data, key, choice, 'chosen');
  }
  state.pendingCommander = state.pendingCommander.filter((a) => a.key !== key);
  if (!state.pendingCommander.length) { delete state.pendingCommander; applyCardResources(state, data); }
}

// Why a player can't sack this commander now, or null if they can (RULES.md §15.2):
// not in its first 3 turns, never Foch or Pershing, and only with a successor available.
export function sackReason(state, data, key) {
  const card = currentCard(state, data, key);
  if (!card) return 'There is no commander to sack.';
  if (state.over) return 'The war is over.';
  if (!isHuman(state, data, key)) return 'The computer follows history.';
  if (state.pendingCommander || state.pendingChoice || state.pendingBudget) return 'Answer the waiting question first.';
  if (card.cannotBeSacked) return `${card.name} can't be sacked.`;
  const r = rulesOf(data);
  const served = state.turn - state.commanders[key].since;
  if (served < r.noSackingFirstTurns) return `A commander can't be sacked in their first ${r.noSackingFirstTurns} months (${card.name}: ${r.noSackingFirstTurns - served} more).`;
  if (!successors(state, data, key).length) return 'No successor is available yet.';
  return null;
}

// Sack a commander and appoint a successor (−5 Will). Returns a NEW state. The new
// card's Will flaws and combat rules work at once; its attack limit, Manpower, Industry and rail
// change from next month (this month's were already handed out).
export function sackCommander(state, data, key, newCardId) {
  const why = sackReason(state, data, key);
  if (why) throw new Error(why);
  if (!successors(state, data, key).includes(newCardId)) throw new Error('That commander can’t be appointed now.');
  const next = copyState(state);
  const old = currentCard(next, data, key);
  const cost = rulesOf(data).sackWill;
  next.will[key] += cost;
  addLog(next, `COMMAND: ${old.name} is sacked (${cost} Will).`);
  appoint(next, data, key, newCardId, 'chosen');
  return next;
}

// ---------------------------------------------------------------- effects in play
// The once-only attack shift (the Nivelle Method) a nation can still use, or null:
// { value, name, card }.
export function onceShift(state, data, nationId) {
  const e = cardEffects(state, data, 'once-attack-shift', (x) => x.nation === nationId)[0];
  if (!e || (state.commanders[e.key] || {}).shiftUsed) return null;
  return { value: e.value, name: e.part, card: e.card, key: e.key };
}

// Combat rules from the cards for an attack by these nations (combat.js planAttack):
//   reasons  — why the attack isn't allowed (Prickly ally, No amalgamation)
//   ipCost   — the coalition attack's IP cost if a card changes it (Foch), else null
export function cardCombatRules(state, data, side, nations, month = currentMonth(state)) {
  const reasons = [];
  const nameOf = (id) => { const n = data.nations.nations.find((x) => x.id === id); return n ? n.adjective || n.name : id; };
  if (nations.length > 1) {
    for (const e of cardEffects(state, data, 'no-coalition-with', () => true, month)) {
      if (nations.includes(e.nation) && nations.includes(e.with)) reasons.push(`${nameOf(e.nation)} units can't join ${nameOf(e.with)} attacks (${e.part}).`);
    }
    for (const e of cardEffects(state, data, 'no-coalition', () => true, month)) {
      if (nations.includes(e.nation)) reasons.push(`${nameOf(e.nation)} units can't join coalition attacks yet (${e.part}).`);
    }
  }
  // Foch: a coalition attack costs this many IP instead of the usual 2
  const cost = cardEffects(state, data, 'coalition-ip-cost', (e) => e.side === side, month);
  return { reasons, ipCost: cost.length ? Math.min(...cost.map((e) => e.value)) : null };
}

// Will from the cards at the end of the month (systems/will.js calls this before
// mutinies; changes `state`):
//   will-if-no-attack    — no attack by the nation this month (Joffre, H&L)
//   extra-will-per-steps — steps a nation lost defending a box (Falkenhayn's "Bleed them white")
export function cardWill(state, data) {
  const month = currentMonth(state);
  for (const e of cardEffects(state, data, 'will-if-no-attack')) {
    if (state.will[e.nation] === undefined) continue;
    const attacked = (state.attacks || []).some((a) => a.month === month && (a.nations || []).includes(e.nation));
    if (!attacked) { state.will[e.nation] += e.value; addLog(state, `${e.part}: no attack this month (${e.value} Will).`); }
  }
  for (const e of cardEffects(state, data, 'extra-will-per-steps')) {
    const lost = ((state.lostDefending || {})[e.box] || {})[e.nation] || 0;
    const drop = Math.floor(lost / e.steps) * e.value;
    if (drop && state.will[e.nation] !== undefined) { state.will[e.nation] += drop; addLog(state, `${e.part}: ${drop} Will.`); }
  }
}

// ---------------------------------------------------------------- the screen
// Everything a card screen shows about a card, with its dates in words supplied by
// the caller (STYLE.md §10). Pure: reads only the data.
export function cardFacts(data, id) {
  const c = cardById(data, id);
  if (!c) return null;
  return { id: c.id, name: c.name, nickname: c.nickname || null, title: c.title || null, key: c.nation,
    from: c.from, to: c.to, strength: c.strength, flaw: c.flaw, history: c.history, cannotBeSacked: Boolean(c.cannotBeSacked) };
}

// Cards that arrived and haven't been shown yet (oldest first).
export function unseenCardNews(state) {
  return (state.cardNews || []).filter((x) => x.n > (state.cardNewsSeen || 0));
}
// The player has seen the card news up to number `n`. Returns a NEW state.
export function markCardSeen(state, n) {
  const next = copyState(state);
  next.cardNewsSeen = Math.max(next.cardNewsSeen || 0, n);
  return next;
}
