// commander.js — commander cards on the screen (RULES.md §15, docs/STYLE.md §6).
// A card is cream card stock: a portrait oval with a silhouette and the commander's
// monogram (never a photograph), the name in IM Fell, the dates, and the Strength and
// Flaw in two boxes labelled with small brass ribbons, then a short history note.
// Three places use it:
//   showCardNews()     — a card that has just arrived, full screen (§15.3)
//   showCardQuestion() — "Replace Joffre with Nivelle?" with a button for each answer
//   cardElement()      — the card on its nation's page of the Nations screen
// The facts come from cardFacts() in js/engine/commanders.js.

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

// The initials for the monogram: "Hindenburg & Ludendorff" → "H·L", "Sir John French" → "F".
function monogram(name) {
  if (name.includes('&')) return name.split('&').map((p) => p.trim()[0]).join('·');
  const words = name.split(' ').filter((w) => !['Sir', 'John'].includes(w));
  return words[words.length - 1][0];
}

// The portrait: an oval in the nation's colour with a head-and-shoulders silhouette
// in ink, and the monogram on a paper band beneath (flat colours, no gradients).
function portrait(facts, color) {
  const svg = svgEl('svg', { viewBox: '0 0 80 100', class: 'card-portrait', 'aria-hidden': 'true' });
  svgEl('ellipse', { cx: 40, cy: 46, rx: 34, ry: 42, fill: color, stroke: 'currentColor', 'stroke-width': 1.5 }, svg);
  // shoulders and tunic, then the head and a peaked cap
  svgEl('path', { d: 'M12 84 C14 66 26 60 40 60 C54 60 66 66 68 84 Z', class: 'card-silhouette' }, svg);
  svgEl('circle', { cx: 40, cy: 42, r: 13, class: 'card-silhouette' }, svg);
  svgEl('path', { d: 'M25 34 C27 22 53 22 55 34 L60 36 L20 36 Z', class: 'card-silhouette' }, svg);
  svgEl('rect', { x: 14, y: 80, width: 52, height: 16, rx: 2, class: 'card-band' }, svg);
  const t = svgEl('text', { x: 40, y: 92.5, 'text-anchor': 'middle', class: 'card-monogram' }, svg);
  t.textContent = monogram(facts.name);
  return svg;
}

// "December 1914 – November 1916", "from May 1917", "from America's entry".
function dates(facts, monthName) {
  const when = (m) => (m === 'usa-entry' ? 'America’s entry into the war' : monthName(m));
  return facts.to ? `${when(facts.from)} – ${when(facts.to)}` : `from ${when(facts.from)}`;
}

// A Strength or Flaw box with its brass ribbon label.
function quality(kind, part) {
  const box = el('div', `card-box card-${kind}`);
  box.appendChild(el('span', 'card-ribbon', kind === 'strength' ? 'STRENGTH' : 'FLAW'));
  if (!part) { box.appendChild(el('p', 'card-text', 'None.')); return box; }
  box.appendChild(el('p', 'card-quality-name', part.name));
  box.appendChild(el('p', 'card-text', part.text));
  return box;
}

// One commander card.
//   facts — from cardFacts()
//   opts  — { monthName, color, compact } (compact leaves out the history note)
export function cardElement(facts, { monthName, color, compact = false }) {
  const card = el('article', `commander-card${compact ? ' compact' : ''}`);
  card.setAttribute('aria-label', `Commander card: ${facts.name}`);
  const head = el('div', 'card-head');
  head.appendChild(portrait(facts, color));
  const who = el('div', 'card-who');
  who.appendChild(el('h3', 'card-name', facts.name));
  if (facts.nickname) who.appendChild(el('p', 'card-nickname', `“${facts.nickname}”`));
  if (facts.title) who.appendChild(el('p', 'card-title', facts.title));
  who.appendChild(el('p', 'card-dates', dates(facts, monthName)));
  head.appendChild(who);
  card.appendChild(head);
  card.appendChild(quality('strength', facts.strength));
  card.appendChild(quality('flaw', facts.flaw));
  if (!compact && facts.history) card.appendChild(el('p', 'card-history', facts.history));
  return card;
}

// The full-screen page the cards sit on (the leather desk), with a kicker and heading.
function screen(host, kicker, heading, sub) {
  const page = el('div', 'card-screen');
  page.appendChild(el('p', 'card-kicker', kicker));
  page.appendChild(el('h2', 'card-heading', heading));
  if (sub) page.appendChild(el('p', 'card-sub', sub));
  host.replaceChildren(page);
  host.hidden = false;
  host.scrollTop = 0;
  return page;
}

// A card that has just arrived (RULES.md §15.3), full screen.
//   news — { month, heading, facts, color, place: { index, count } }
//   onClose() — the brass button
export function showCardNews(host, news, { monthName, onClose }) {
  const count = news.place && news.place.count > 1 ? ` · ${news.place.index} of ${news.place.count}` : '';
  const page = screen(host, `GENERAL HEADQUARTERS · ${monthName(news.month).toUpperCase()}${count}`, news.heading, news.sub);
  page.appendChild(cardElement(news.facts, { monthName, color: news.color }));
  const b = el('button', 'btn btn-primary card-button', news.place && news.place.index < news.place.count ? 'Next' : 'To the map');
  b.type = 'button';
  b.addEventListener('click', onClose);
  page.appendChild(b);
  b.focus({ preventScroll: true });
}

// "Replace Joffre with Nivelle?" (RULES.md §15.2): the new card(s) in full, each with
// its Appoint button, then the old card small with "Keep".
//   q — { month, heading, offers: [{ facts, color }], current: { facts, color }, keepText }
//   onChoose(cardId | 'keep')
export function showCardQuestion(host, q, { monthName, onChoose }) {
  const page = screen(host, `THE WAR CABINET · ${monthName(q.month).toUpperCase()}`, q.heading, q.sub);
  for (const o of q.offers) {
    page.appendChild(cardElement(o.facts, { monthName, color: o.color }));
    const b = el('button', 'btn btn-primary card-button', `Appoint ${o.facts.name}`);
    b.type = 'button';
    b.addEventListener('click', () => onChoose(o.facts.id));
    page.appendChild(b);
  }
  page.appendChild(el('p', 'card-sub card-keep-head', `Or keep ${q.current.facts.name}:`));
  page.appendChild(cardElement(q.current.facts, { monthName, color: q.current.color, compact: true }));
  const keep = el('button', 'btn card-button card-keep', `Keep ${q.current.facts.name}`);
  keep.type = 'button';
  keep.appendChild(el('span', 'card-keep-text', q.keepText));
  keep.addEventListener('click', () => onChoose('keep'));
  page.appendChild(keep);
}

export function hideCardScreen(host) {
  host.hidden = true;
  host.replaceChildren();
}

// The Nations screen's commander section for one nation: its card (and any card
// added alongside, like Foch), and the sack control when the player may use it.
//   cards — [{ facts, color }]
//   sack  — null, or { reason } (why not), or { options: [{ id, name }], cost }
//   onSack(cardId)
export function commanderSection(cards, sack, { monthName, onSack }) {
  const box = el('section', 'ledger-section card-section');
  box.appendChild(el('h4', 'ledger-heading', cards.length > 1 ? 'Commanders' : 'Commander'));
  for (const c of cards) box.appendChild(cardElement(c.facts, { monthName, color: c.color, compact: true }));
  if (sack && sack.options) {
    for (const o of sack.options) {
      const b = el('button', 'btn card-button card-sack', `Sack ${cards[0].facts.name}: appoint ${o.name}`);
      b.type = 'button';
      b.appendChild(el('span', 'card-keep-text', `${sack.cost} Will now. ${o.name} takes command at once; the new card's OP, Manpower, Industry and rail count from next month.`));
      // a sack costs Will, so it takes two taps: the first asks to confirm
      b.addEventListener('click', () => {
        if (b.dataset.armed) { onSack(o.id); return; }
        b.dataset.armed = '1';
        b.firstChild.textContent = `Confirm: sack ${cards[0].facts.name} (${sack.cost} Will)`;
      });
      box.appendChild(b);
    }
  } else if (sack && sack.reason) {
    box.appendChild(el('p', 'ledger-line card-sack-note', `Sacking: ${sack.reason}`));
  }
  return box;
}
