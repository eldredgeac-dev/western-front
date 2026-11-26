// counters.js — draws a unit as a board-wargame piece (docs/STYLE.md §5): a chunky
// square block in the nation's colour that looks about 2 mm thick (a lighter bevel on
// top, a darker side face, a soft shadow), with a silhouette of the unit type, the
// nation's mark, a quality badge, the military map symbol and a big strength number.
//
// A piece is drawn in "piece units" around (0, 0): the face runs from −14 to +14; the
// side face and shadow reach a little further down and right. map.js scales it.
// Every piece holds two versions: the full one (class "piece-full") and a simple one
// for when the map is zoomed out (class "piece-simple": colour, mark and number only).
// css/style.css shows one or the other.

const SVG_NS = 'http://www.w3.org/2000/svg';
// Palette colours (docs/STYLE.md §2). Only these, and mixes of them, are used.
const INK = '#2B241C';
const PAPER = '#E8DCC0';
const TELEGRAM = '#F1E6C8';
const BRASS = '#B08D57';
const STAMP_RED = '#A3241F';
const RIVER = '#5F7F95';
const HORIZON = '#6F8FAF';
const OCHRE = '#B58B3A';
const FOREST = '#5E6B45';

function el(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

// ---------------------------------------------------------------- colours
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

// Mix colour `a` with `b`: amount 0 = all a, 1 = all b. Used for the bevel (mixed with
// paper) and the side face (mixed with ink), so every shade comes from the palette.
export function mix(a, b, amount) {
  const x = rgb(a); const y = rgb(b);
  return hex(x.map((v, i) => v + (y[i] - v) * amount));
}

// Is a colour dark? Dark pieces get paper-coloured silhouettes, light ones ink.
export function isDark(color) {
  const [r, g, b] = rgb(color);
  return 0.299 * r + 0.587 * g + 0.114 * b < 120;
}

// A five-pointed star path around (x, y).
function star(x, y, r) {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2; const rr = i % 2 ? r * 0.45 : r;
    p.push(`${(x + Math.cos(a) * rr).toFixed(2)},${(y + Math.sin(a) * rr).toFixed(2)}`);
  }
  return 'M' + p.join('L') + 'Z';
}

// ---------------------------------------------------------------- silhouettes
// Flat silhouettes, drawn facing right in a 22 × 22 box (0,0 top left). Pieces of the
// side whose `faces` is "left" in data/nations.json are mirrored, so both armies face
// the enemy. Each is a list of [element, attributes].
const soldierBody = [
  // torso, leaning into the advance
  ['path', { d: 'M8.4,7.4 L12.2,7.2 L13,14 L8.2,14.2 Z' }],
  // pack on the back
  ['path', { d: 'M6.2,8 L8.8,7.8 L8.8,12.6 L6.4,12.6 Z' }],
  // back leg and front leg, mid-stride
  ['path', { d: 'M8.3,13.8 L10.8,13.8 L9.6,18 L8.4,21.8 L6.4,21.8 L7.8,17.6 Z' }],
  ['path', { d: 'M10.4,13.8 L12.9,13.8 L14.2,17.4 L16.4,21.2 L14.4,21.8 L12,18 Z' }],
  // head
  ['circle', { cx: 10.7, cy: 5.2, r: 2 }],
];
// rifle with bayonet, held at the port across the body, and the arms holding it
const rifle = [
  ['path', { d: 'M6.6,15.4 L17.8,6.6 L18.6,7.4 L7.4,16.2 Z' }],
  ['path', { d: 'M18,6.8 L20.2,5 L20.4,5.3 L18.4,7.2 Z' }],
  ['path', { d: 'M11.6,8 L15.2,10.6 L14.4,11.6 L10.8,9.4 Z' }],
];
export const SILHOUETTES = {
  // a soldier in a steel helmet, advancing with fixed bayonet
  infantry: [
    ...soldierBody,
    ['path', { d: 'M7.8,5 L8.6,3.4 Q10.7,1.6 12.8,3.4 L13.6,5 Z' }],
    ...rifle,
  ],
  // the same soldier in the US campaign hat (wide brim, "Montana peak" crown)
  'us-infantry': [
    ...soldierBody,
    ['path', { d: 'M6.8,4.6 L14.6,4.6 L14.6,5.3 L6.8,5.3 Z' }],
    ['path', { d: 'M8.6,4.7 L9.6,1.6 L10.7,2.5 L11.8,1.6 L12.8,4.7 Z' }],
    ...rifle,
  ],
  // a stormtrooper in the 1916 helmet (flared neck guard), throwing a stick grenade
  stormtroopers: [
    ...soldierBody,
    ['path', { d: 'M7.2,6 L8,4.4 Q9.4,2.4 11.4,2.8 Q13.2,3.2 13.4,5 L12,5.2 L11.6,6 L8.6,6.4 Z' }],
    ['path', { d: 'M11.4,8 L14.6,4.4 L15.6,5.2 L12.4,9 Z' }],
    ['path', { d: 'M14.8,4.8 L17.6,1.2 L18.2,1.6 L15.4,5.2 Z' }],
    ['path', { d: 'M17.2,0.2 L19.4,1.6 L18.4,3.2 L16.2,1.8 Z' }],
    ['path', { d: 'M12.4,9.6 L16.6,12.2 L16,13 L11.8,10.6 Z' }],
  ],
  // a British Mark IV tank, side on: the rhomboid hull, a sponson and its gun
  tank: [
    ['path', { d: 'M0.5,15 L4.5,6.5 L16,6.5 L21.5,15 L18.5,19.5 L3,19.5 Z' }],
    ['path', { d: 'M3.6,14.6 L6.2,9 L15,9 L18.8,14.6 L16.8,17.2 L4.6,17.2 Z', 'data-cut': '1' }],
    ['path', { d: 'M8.4,10.8 L13.4,10.8 L13.4,16.6 L8.4,16.6 Z' }],
    ['path', { d: 'M13.2,12.4 L18.8,12.4 L18.8,13.6 L13.2,13.6 Z' }],
    ['path', { d: 'M8.6,4.4 L12.8,4.4 L12.8,6.8 L8.6,6.8 Z' }],
  ],
};

// Draw a silhouette into `g`, centred on (cx, cy), `size` piece units across.
function silhouette(g, kind, cx, cy, size, color, cutColor, mirror) {
  const parts = SILHOUETTES[kind] || SILHOUETTES.infantry;
  const s = size / 22;
  const flip = mirror ? -1 : 1;
  const sg = el('g', { transform: `translate(${cx},${cy}) scale(${flip * s},${s}) translate(-11,-11)`, class: 'silhouette' }, g);
  for (const [tag, attrs] of parts) {
    const { 'data-cut': cut, ...rest } = attrs;
    el(tag, { ...rest, fill: cut ? cutColor : color }, sg);
  }
}

// ---------------------------------------------------------------- marks and badges
// The nation's mark (STYLE.md §5), a circle of radius r around (x, y).
function nationMark(g, nation, x, y, r) {
  const rings = (colours) => colours.forEach((c, i) => el('circle', { cx: x, cy: y, r: r * (1 - i * 0.32), fill: c }, g));
  if (nation === 'fra') rings([STAMP_RED, TELEGRAM, HORIZON]);            // tricolour cockade
  else if (nation === 'gbr') rings([RIVER, TELEGRAM, STAMP_RED]);         // roundel
  else if (nation === 'bel') rings([INK, OCHRE, STAMP_RED]);              // Belgian cockade
  else if (nation === 'usa') {                                            // white star in a blue circle
    el('circle', { cx: x, cy: y, r, fill: RIVER, stroke: TELEGRAM, 'stroke-width': r * 0.12 }, g);
    el('path', { d: star(x, y, r * 0.78), fill: TELEGRAM }, g);
  } else if (nation === 'ger') {                                          // cross pattée, outlined in paper
    // four arms along the axes, narrow at the centre and flaring out to the ends
    const a = r; const e = r * 0.6; const w = r * 0.2;
    const pts = [[-w, -w], [-e, -a], [e, -a], [w, -w], [a, -e], [a, e], [w, w], [e, a], [-e, a], [-w, w], [-a, e], [-a, -e]];
    el('path', {
      d: 'M' + pts.map(([px, py]) => `${(x + px).toFixed(2)},${(y + py).toFixed(2)}`).join('L') + 'Z',
      fill: INK, stroke: TELEGRAM, 'stroke-width': r * 0.24, 'stroke-linejoin': 'round', 'paint-order': 'stroke',
    }, g);
  }
}

// Quality badge, top right: Elite = brass star, Green = a pale chevron.
function badge(g, quality) {
  if (quality === 'elite') el('path', { d: star(9.6, -9.6, 3.6), fill: BRASS, stroke: INK, 'stroke-width': 0.5 }, g);
  if (quality === 'green') {
    el('path', { d: 'M6.4,-11.2 L9.6,-8.4 L12.8,-11.2 L12.8,-9 L9.6,-6.2 L6.4,-9 Z', fill: mix(FOREST, TELEGRAM, 0.55), stroke: INK, 'stroke-width': 0.4 }, g);
  }
}

// The small military map symbol, bottom left (a box with an X; a lozenge for tanks).
function mapSymbol(g, kind, ink) {
  const x = -12.2; const y = 6.6; const w = 6.6; const h = 4.6;
  if (kind === 'tank') {
    el('rect', { x, y: y + 0.4, width: w, height: h - 0.8, rx: 2, fill: 'none', stroke: ink, 'stroke-width': 0.6 }, g);
    return;
  }
  el('rect', { x, y, width: w, height: h, fill: 'none', stroke: ink, 'stroke-width': 0.6 }, g);
  el('path', { d: `M${x},${y}L${x + w},${y + h}M${x + w},${y}L${x},${y + h}`, stroke: ink, 'stroke-width': 0.5 }, g);
}

// The strength number on a paper chip, with a row of pips under it: filled for the
// steps the unit has, hollow for the ones it has lost.
function strength(g, steps, maxSteps, x, y, w, h, font) {
  el('rect', { x, y, width: w, height: h, rx: 1, fill: TELEGRAM, stroke: INK, 'stroke-width': 0.5 }, g);
  const t = el('text', { x: x + w / 2, y: y + h * 0.8, 'text-anchor': 'middle', class: 'piece-strength', 'font-size': font, fill: INK }, g);
  t.textContent = String(steps);
  return t;
}
function pips(g, steps, maxSteps, ink) {
  const gap = 2.3; const start = -0.6 - ((maxSteps - 1) * gap) / 2;
  for (let i = 0; i < maxSteps; i++) {
    el('circle', { cx: start + i * gap, cy: 11.6, r: 0.85, fill: i < steps ? ink : 'none', stroke: ink, 'stroke-width': 0.4 }, g);
  }
}

// ---------------------------------------------------------------- the piece
// The block itself: shadow, side face, top face and bevel.
function block(g, color) {
  el('rect', { x: -12.4, y: -11.4, width: 29, height: 29, rx: 3, fill: INK, opacity: 0.28, class: 'piece-shadow' }, g);
  el('rect', { x: -13.2, y: -13.2, width: 29, height: 29, rx: 2.6, fill: mix(color, INK, 0.42) }, g);   // side face
  el('rect', { x: -14.6, y: -14.6, width: 29, height: 29, rx: 2.4, fill: color, stroke: mix(color, INK, 0.6), 'stroke-width': 0.6 }, g);
  // bevel: a lighter strip along the top and left edges of the face
  el('path', {
    d: 'M-13.4,12.6 L-13.4,-11.2 Q-13.4,-13.4 -11.2,-13.4 L12.6,-13.4 L11.2,-12 L-10.8,-12 Q-12,-12 -12,-10.8 L-12,11.2 Z',
    fill: mix(color, PAPER, 0.45),
  }, g);
}

// One piece as an SVG group centred on (0, 0).
//   unit — { nation, steps, quality, moved, attacked }
//   look — { color, symbol, maxSteps, mirror } from the nation and unit-type data
// A small typed tab on the piece's lower edge saying what it did this turn:
// RAIL (came by rail: can't attack), MOVED, or ATK (attacked). Full pieces only.
function statusTab(g, unit) {
  const text = unit.railed ? 'RAIL' : unit.attacked ? 'ATK' : unit.moved ? 'MOVED' : null;
  if (!text) return;
  const w = text.length * 3.2 + 3;
  const tab = el('g', { class: 'status-tab' }, g);
  el('rect', { x: -w / 2, y: 11.2, width: w, height: 5.6, rx: 0.8, fill: TELEGRAM, stroke: INK, 'stroke-width': 0.45 }, tab);
  const t = el('text', { x: 0, y: 15.4, 'text-anchor': 'middle', 'font-size': 4.6, fill: INK, class: 'status-text' }, tab);
  t.textContent = text;
}

export function counterSvg(unit, look) {
  const g = el('g', { class: 'counter piece' + (unit.moved || unit.attacked ? ' done' : '') });
  block(g, look.color);
  const ink = isDark(look.color) ? TELEGRAM : INK;
  // full version
  const full = el('g', { class: 'piece-full' }, g);
  silhouette(full, look.symbol, look.mirror ? 0 : -1.6, 0.4, 19, ink, look.color, look.mirror);
  nationMark(full, unit.nation, -9.4, -9.4, 3.8);
  badge(full, unit.quality);
  mapSymbol(full, look.symbol, ink);
  strength(full, unit.steps, look.maxSteps, 4.6, 1.6, 8.6, 8.8, 8.6);
  pips(full, unit.steps, look.maxSteps, ink);
  statusTab(full, unit);
  // simple version, for the zoomed-out map
  const simple = el('g', { class: 'piece-simple' }, g);
  nationMark(simple, unit.nation, -5.8, -5.4, 6.2);
  strength(simple, unit.steps, look.maxSteps, 1.6, -1.4, 11, 12.4, 12);
  return g;
}

// A whole stack, drawn as a small tower: each piece a little higher than the one under
// it (bottom first), and a brass tab with the number of pieces if there's more than one.
export const STACK_STEP = 3.4;     // piece units each piece sits above the one below
export function stackSvg(units, lookFor) {
  const g = el('g', { class: 'stack' });
  units.forEach((u, i) => {
    const c = counterSvg(u, lookFor(u));
    c.setAttribute('transform', `translate(${i * 1.2},${-i * STACK_STEP})`);
    g.appendChild(c);
  });
  if (units.length > 1) {
    const top = -(units.length - 1) * STACK_STEP;
    const tab = el('g', { class: 'stack-tab', transform: `translate(${16.4 + (units.length - 1) * 1.2},${top - 12})` }, g);
    el('rect', { x: -4.2, y: -4.4, width: 9.6, height: 8, rx: 1.2, fill: BRASS, stroke: INK, 'stroke-width': 0.5 }, tab);
    const t = el('text', { x: 0.6, y: 1.9, 'text-anchor': 'middle', class: 'piece-count', 'font-size': 6, fill: INK }, tab);
    t.textContent = '×' + units.length;
  }
  return g;
}

// A small standalone <svg> with one piece, for the panel's unit list.
export function counterIcon(unit, look, size = 40) {
  const svg = el('svg', { viewBox: '-16 -16 34 34', width: size, height: size, class: 'counter-icon', 'aria-hidden': 'true' });
  svg.appendChild(counterSvg(unit, look));
  return svg;
}
