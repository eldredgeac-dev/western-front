// telegram.js — event telegrams on the screen (docs/STYLE.md §6): a strip of telegram
// paper that slides up from the bottom, with "TELEGRAM — URGENT", the date, what
// happened and what it means. Tap to dismiss; a question (the U-boat decision) shows a
// button for each answer instead. Also the Telegrams log (every past telegram).
// The telegrams themselves come from js/engine/telegrams.js.

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// The typed body of a telegram: date, headline, what happened, what it means.
function body(t, monthName) {
  const parts = [];
  parts.push(el('p', 'tg-date', monthName(t.month).toUpperCase()));
  parts.push(el('h2', 'tg-title', t.title));
  parts.push(el('p', 'tg-text', t.text));
  if (t.meaning) {
    const p = el('p', 'tg-meaning');
    p.appendChild(el('strong', '', 'WHAT THIS MEANS: '));
    p.appendChild(document.createTextNode(t.meaning));
    parts.push(p);
  }
  return parts;
}

// Show one telegram in `host` (an empty element fixed to the bottom of the screen).
//   t        — the telegram
//   place    — { index, count }: "1 of 3" when several arrived together
//   monthName(month) — "1917-02" → "February 1917"
//   onDismiss()      — tapped (not offered for an unanswered question)
//   onChoose(id)     — an answer button was tapped
//   question         — who's asked: true if this player must answer
export function showTelegram(host, t, { place, monthName, onDismiss, onChoose, question, still }) {
  const strip = el('section', 'telegram');
  strip.setAttribute('role', question ? 'dialog' : 'status');
  strip.setAttribute('aria-label', `Telegram: ${t.title}`);
  const head = el('p', 'tg-head');
  head.appendChild(el('span', 'tg-kicker', 'TELEGRAM'));
  head.appendChild(el('span', 'tg-urgent', 'URGENT'));
  if (place.count > 1) head.appendChild(el('span', 'tg-count', `${place.index} of ${place.count}`));
  strip.appendChild(head);
  strip.append(...body(t, monthName));
  if (question) {
    strip.appendChild(el('p', 'tg-question', t.choice.question));
    for (const o of t.choice.options) {
      const b = el('button', 'btn btn-primary tg-choice');
      b.type = 'button';
      b.appendChild(el('strong', 'tg-choice-label', o.label));
      b.appendChild(el('span', 'tg-choice-text', o.text));
      b.addEventListener('click', (e) => { e.stopPropagation(); onChoose(o.id); });
      strip.appendChild(b);
    }
  } else {
    strip.appendChild(el('p', 'tg-dismiss', place.index < place.count ? 'Tap for the next telegram' : 'Tap to close'));
    strip.tabIndex = 0;
    strip.addEventListener('click', onDismiss);
    strip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); onDismiss(); } });
  }
  // slide up (transform only, STYLE.md §8); 'still' skips it (Reduce Motion, or the
  // next telegram in a queue, which simply replaces the last)
  if (!still) strip.classList.add('tg-arrive');
  host.replaceChildren(strip);
  host.hidden = false;
  if (!question) strip.focus({ preventScroll: true });
}

// Hide the telegram strip.
export function hideTelegram(host) {
  host.hidden = true;
  host.replaceChildren();
}

// The Telegrams log: every telegram of the war, newest first, on ledger paper.
export function showTelegramLog(container, telegrams, { monthName, onClose }) {
  const page = el('div', 'ledger-page');
  const top = el('div', 'ledger-top');
  const close = el('button', 'btn btn-small', '‹ The map');
  close.type = 'button';
  close.addEventListener('click', onClose);
  top.appendChild(close);
  top.appendChild(el('p', 'ledger-kicker', 'TELEGRAMS'));
  page.appendChild(top);
  page.appendChild(el('h2', 'ledger-title', 'Telegrams received'));
  if (!telegrams.length) page.appendChild(el('p', 'ledger-line', 'No telegrams yet. They arrive when something happens in the war: gas, the blockade, the U-boats, the Americans.'));
  for (const t of [...telegrams].reverse()) {
    const card = el('section', 'telegram telegram-filed');
    card.append(...body(t, monthName));
    if (t.choice) {
      const chosen = t.choice.options.find((o) => o.id === t.choice.answer);
      card.appendChild(el('p', 'tg-answer', chosen ? `ANSWERED: ${chosen.label}. ${t.answerText || ''}`.trim() : 'AWAITING YOUR ANSWER'));
    }
    page.appendChild(card);
  }
  container.replaceChildren(page);
}
