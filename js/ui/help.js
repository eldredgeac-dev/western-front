// help.js — the How to Play page: a ledger page (docs/STYLE.md §6) with the rules in
// plain English, from data/help.json, and one small diagram of which territories touch.

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
function svgEl(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

// Three lanes of the front, six columns each (E3 E2 E1 | G1 G2 G3). The middle lane's
// E1 holds your unit: its road moves (up to 2 steps) are outlined in brass, and the one enemy
// territory it can attack in red. No diagonals.
function laneDiagram() {
  const cols = ['E3', 'E2', 'E1', 'G1', 'G2', 'G3'];
  const W = 44; const H = 30; const gap = 10; const top = 16;
  const x = (c) => c * W + (c >= 3 ? gap : 0) + 2;
  const y = (r) => top + r * H;
  const svg = svgEl('svg', { viewBox: `0 0 ${6 * W + gap + 4} ${top + 3 * H + 4}`, class: 'help-diagram', role: 'img',
    'aria-label': 'Your unit in the front line can move by road up to two territories through your own lines, and can attack only the enemy territory straight ahead.' });
  cols.forEach((c, i) => { svgEl('text', { x: x(i) + W / 2, y: 11, 'text-anchor': 'middle', class: 'help-col' }, svg).textContent = c; });
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 6; c++) {
      let cls = c < 3 ? 'help-box own' : 'help-box enemy';
      if (r === 1 && c === 2) cls += ' unit';
      else if (c < 3 && Math.abs(r - 1) + Math.abs(c - 2) <= 2) cls += ' road';   // up to 2 steps
      else if (r === 1 && c === 3) cls += ' target';
      svgEl('rect', { x: x(c), y: y(r), width: W - 2, height: H - 2, class: cls }, svg);
    }
  }
  svgEl('text', { x: x(2) + W / 2 - 1, y: y(1) + H / 2 + 3, 'text-anchor': 'middle', class: 'help-mark' }, svg).textContent = 'YOU';
  svgEl('line', { x1: x(3) - gap / 2 - 1, x2: x(3) - gap / 2 - 1, y1: top - 2, y2: top + 3 * H, class: 'help-front' }, svg);
  const box = el('figure', 'help-figure');
  box.appendChild(svg);
  box.appendChild(el('figcaption', 'ledger-sub',
    'Your unit (YOU) can go by road to the brass territories (up to 2 steps, never diagonally); it can attack only the red one straight ahead. The line in the middle is no-man’s-land.'));
  return box;
}

// Draw the page into `container`. `help` is data/help.json; onClose returns.
export function showHelp(container, help, onClose) {
  const page = el('div', 'ledger-page help-page');
  const top = el('div', 'ledger-top');
  const close = el('button', 'btn btn-small', '‹ Back');
  close.type = 'button';
  close.addEventListener('click', onClose);
  top.append(close, el('p', 'ledger-kicker', 'FIELD MANUAL'));
  page.appendChild(top);
  page.appendChild(el('h2', 'ledger-title', help.title));
  page.appendChild(el('p', 'ledger-line', help.intro));
  for (const s of help.sections) {
    const sec = el('section', 'ledger-section');
    sec.appendChild(el('h3', 'ledger-heading', s.title));
    if (s.diagram === 'lane') sec.appendChild(laneDiagram());
    for (const p of s.paragraphs) sec.appendChild(el('p', 'ledger-line', p));
    page.appendChild(sec);
  }
  container.replaceChildren(page);
}
