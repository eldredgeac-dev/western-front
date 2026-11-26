// telegrams.js — event telegrams (docs/STYLE.md §6): whenever something in RULES.md
// §10 happens, a telegram is added to state.telegrams with the date, what happened and,
// in plain English, what it means. The screen (js/ui/telegram.js) shows the ones the
// player hasn't seen yet, one after another, and keeps them all in a Telegrams log.
// The wording lives in the data files (a `telegram` on each event in
// data/events.json, and on the USA and the French mutinies in data/nations.json).
// Telegrams never change how the game plays.
//
// A telegram is a plain object:
//   { n, month, key, title, text, meaning, choice? }
//   n       — 1, 2, 3 … in the order they were sent
//   month   — 'YYYY-MM'
//   key     — what sent it (an event id, 'usa-entry', 'mutiny-start' …)
//   choice  — only for a question the player must answer:
//             { side, question, options: [{ id, label, text }], answer: null | id }

import { currentMonth, copyState } from './state.js';

// Fill {placeholders} in a line of text: fill('for {turns} turns', { turns: 3 }).
export function fill(text, values = {}) {
  return String(text || '').replace(/\{(\w+)\}/g, (all, k) => (values[k] !== undefined ? String(values[k]) : all));
}

// Add a telegram to the state (changes `state`). Returns the telegram.
export function sendTelegram(state, key, message, values = {}, extra = {}) {
  state.telegrams = state.telegrams || [];
  const t = {
    n: state.telegrams.length + 1,
    month: currentMonth(state),
    key,
    title: fill(message.title, values),
    text: fill(message.text, values),
    meaning: fill(message.meaning, values),
    ...extra,
  };
  state.telegrams.push(t);
  return t;
}

// Has a telegram with this key been sent already (in any month)?
export function sentBefore(state, key) {
  return (state.telegrams || []).some((t) => t.key === key);
}

// The telegrams the player hasn't seen yet, oldest first. A question that hasn't
// been answered always counts as unseen, so it can't be missed.
export function unseenTelegrams(state) {
  const seen = state.telegramsSeen || 0;
  return (state.telegrams || []).filter((t) => t.n > seen || (t.choice && !t.choice.answer));
}

// The player has read every telegram up to number `n`. Returns a NEW state.
export function markSeen(state, n) {
  const next = copyState(state);
  next.telegramsSeen = Math.max(next.telegramsSeen || 0, n);
  return next;
}

// The unanswered question's telegram, or null.
export function openQuestion(state) {
  const list = state.telegrams || [];
  for (let i = list.length - 1; i >= 0; i--) if (list[i].choice && !list[i].choice.answer) return list[i];
  return null;
}

// A question for the player, as a telegram with a button for each answer.
export function questionTelegram(state, event) {
  const c = event.choice;
  const message = event.telegram || { title: event.name.toUpperCase(), text: event.text, meaning: '' };
  return sendTelegram(state, event.id, message, {}, {
    choice: { side: c.side, question: c.question, answer: null,
      options: c.options.map((o) => ({ id: o.id, label: o.label, text: (o.telegram && o.telegram.meaning) || o.text })) },
  });
}
