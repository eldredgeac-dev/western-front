// counters.js — draws a unit counter, styled like a real wargame piece
// (docs/STYLE.md §5): a rounded square in the nation's colour with a small shadow,
// a military map symbol, strength pips, a quality badge and the nation's mark.
// Counters are drawn 30 × 30 "counter units" around (0, 0); the map scales them.

const SVG_NS = 'http://www.w3.org/2000/svg';
const INK = '#2B241C';
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

// Is a colour dark? Dark counters get paper-coloured symbols, light ones ink.
function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255;
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

// The nation's mark, top left (STYLE.md §5).
function nationMark(g, nation) {
  const x = -9.5; const y = -9.5;
  const rings = (colours) => colours.forEach((c, i) => el('circle', { cx: x, cy: y, r: 3.4 - i * 1.1, fill: c }, g));
  if (nation === 'fra') rings([STAMP_RED, TELEGRAM, HORIZON]);            // tricolour cockade
  else if (nation === 'gbr') rings([RIVER, TELEGRAM, STAMP_RED]);         // roundel
  else if (nation === 'bel') rings([INK, OCHRE, STAMP_RED]);              // Belgian cockade
  else if (nation === 'usa') {                                            // white star in a blue circle
    el('circle', { cx: x, cy: y, r: 3.4, fill: RIVER }, g);
    el('path', { d: star(x, y, 2.6), fill: TELEGRAM }, g);
  } else if (nation === 'ger') {                                          // cross pattée
    el('path', {
      d: `M${x - 3.4},${y - 3.4}L${x},${y - 1.2}L${x + 3.4},${y - 3.4}L${x + 1.2},${y}L${x + 3.4},${y + 3.4}` +
        `L${x},${y + 1.2}L${x - 3.4},${y + 3.4}L${x - 1.2},${y}Z`,
      fill: INK, stroke: TELEGRAM, 'stroke-width': 0.6,
    }, g);
  }
}

// The military map symbol in the middle (STYLE.md §5).
function symbol(g, kind, ink) {
  const box = { x: -7.5, y: -5.5, w: 15, h: 9.5 };
  const sw = 1.1;
  if (kind === 'tank') {
    el('rect', { x: box.x, y: box.y + 1, width: box.w, height: box.h - 2, rx: 4.2, fill: 'none', stroke: ink, 'stroke-width': sw }, g);
    return;
  }
  el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, fill: 'none', stroke: ink, 'stroke-width': sw }, g);
  el('path', {
    d: `M${box.x},${box.y}L${box.x + box.w},${box.y + box.h}M${box.x + box.w},${box.y}L${box.x},${box.y + box.h}`,
    stroke: ink, 'stroke-width': sw * 0.8,
  }, g);
  if (kind === 'stormtroopers') {
    el('path', { d: 'M9.5,-9 l-2.4,3.6 h1.8 l-1.8,3.4 l3.6,-4.4 h-1.8 l1.4,-2.6z', fill: BRASS, stroke: INK, 'stroke-width': 0.3 }, g);
  }
  if (kind === 'us-infantry') el('path', { d: star(0, -0.75, 2.4), fill: ink }, g);
}

// Strength pips along the bottom: filled for current steps, hollow for lost ones.
function pips(g, steps, maxSteps, ink) {
  const gap = 4.4; const start = -((maxSteps - 1) * gap) / 2;
  for (let i = 0; i < maxSteps; i++) {
    el('circle', {
      cx: start + i * gap, cy: 9.6, r: 1.5,
      fill: i < steps ? ink : 'none', stroke: ink, 'stroke-width': 0.6,
    }, g);
  }
}

// Quality badge, top right: Elite = brass star, Green = a small green dot.
function badge(g, quality) {
  if (quality === 'elite') el('path', { d: star(9.5, -9.5, 3.4), fill: BRASS, stroke: INK, 'stroke-width': 0.4 }, g);
  if (quality === 'green') el('circle', { cx: 9.5, cy: -9.5, r: 2.4, fill: FOREST, stroke: TELEGRAM, 'stroke-width': 0.6 }, g);
}

// One counter as an SVG group centred on (0, 0).
//   unit — { nation, steps, quality, moved, attacked }
//   look — { color, symbol, maxSteps } from the nation and unit-type data
export function counterSvg(unit, look) {
  const g = el('g', { class: 'counter' + (unit.moved || unit.attacked ? ' done' : '') });
  el('rect', { x: -13.5, y: -13.5, width: 29, height: 29, rx: 4, fill: INK, opacity: 0.3 }, g);   // shadow
  el('rect', { x: -15, y: -15, width: 29, height: 29, rx: 4, fill: look.color, stroke: INK, 'stroke-width': 0.9 }, g);
  const ink = isDark(look.color) ? TELEGRAM : INK;
  nationMark(g, unit.nation);
  badge(g, unit.quality);
  symbol(g, look.symbol, ink);
  pips(g, unit.steps, look.maxSteps, ink);
  return g;
}

// A whole stack, offset 4 up and right per counter (STYLE.md §5), bottom first.
export function stackSvg(units, lookFor) {
  const g = el('g', { class: 'stack' });
  units.forEach((u, i) => {
    const c = counterSvg(u, lookFor(u));
    c.setAttribute('transform', `translate(${i * 4},${-i * 4})`);
    g.appendChild(c);
  });
  return g;
}

// A small standalone <svg> with one counter, for the panel's unit list.
export function counterIcon(unit, look, size = 40) {
  const svg = el('svg', { viewBox: '-17 -17 34 34', width: size, height: size, class: 'counter-icon', 'aria-hidden': 'true' });
  svg.appendChild(counterSvg(unit, look));
  return svg;
}
