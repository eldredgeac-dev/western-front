// map.js — shows the campaign map (img/map-west.svg, made by tools/build-map.mjs)
// and paints the game onto it: who owns each territory, the front line, trenches,
// the selected territory and the date. The look follows docs/STYLE.md §4.
//
// The SVG file already holds the geography. Each territory is an element with
// data-box set to the box id (like "l07-e3"), and every border between two neighbours
// is a <path class="edge" data-a="…" data-b="…">. The same view also draws the board
// (js/ui/board.js), which builds an SVG with the same layers; its shapes and patterns
// have ids starting "b-" so the two can sit on the page together.

import { stackSvg, STACK_STEP } from './counters.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Make an SVG element with some attributes.
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// Download the map picture and turn it into a live <svg> element.
export async function loadMapSvg(url) {
  let text;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error();
    text = await response.text();
  } catch (err) {
    throw new Error(`Couldn't load the map picture (${url}).`);
  }
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.nodeName !== 'svg') throw new Error('The map picture is damaged.');
  return document.importNode(svg, true);
}

// ---------------------------------------------------------------- front line
// Split a path's "d" into its separate pieces (each starts with M).
function pieces(d) {
  return d.split(/(?=M)/).filter((p) => p.trim().length > 0);
}

// A border made only of straight lines ("M x,y L x,y …", as tools/build-map.mjs and
// js/ui/board.js write them), as a list of points; null if it has curves.
function polyline(d) {
  if (/[^ML0-9.,\s-]/.test(d)) return null;
  const nums = d.match(/-?\d*\.?\d+/g) || [];
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([Number(nums[i]), Number(nums[i + 1])]);
  return pts.length >= 2 ? pts : null;
}

// The point `s` map units along a polyline (like SVG's getPointAtLength), given the
// running length at each corner. Done in plain JavaScript: asking the browser for each
// point is far slower on a phone (docs/PERFORMANCE.md).
function pointAlong(pts, acc, s) {
  let lo = 1; let hi = pts.length - 1;          // find the first corner at or past s
  while (lo < hi) { const mid = (lo + hi) >> 1; if (acc[mid] < s) lo = mid + 1; else hi = mid; }
  const i = lo;
  const seg = acc[i] - acc[i - 1] || 1;
  const t = Math.max(0, Math.min(1, (s - acc[i - 1]) / seg));
  return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t };
}

// Points every `step` map units along a path piece, with the direction there.
function samplePath(tempPath, d, step) {
  const pts = polyline(d);
  if (pts) {
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = acc[acc.length - 1];
    const out = [];
    for (let s = 0; s <= total; s += step) {
      const p = pointAlong(pts, acc, s);
      const q = pointAlong(pts, acc, Math.min(total, s + 0.5));
      const r = pointAlong(pts, acc, Math.max(0, s - 0.5));
      const dx = q.x - r.x; const dy = q.y - r.y; const len = Math.hypot(dx, dy) || 1;
      out.push({ x: p.x, y: p.y, ux: dx / len, uy: dy / len });
    }
    return out;
  }
  tempPath.setAttribute('d', d);
  const total = tempPath.getTotalLength();
  const out = [];
  for (let s = 0; s <= total; s += step) {
    const p = tempPath.getPointAtLength(s);
    const q = tempPath.getPointAtLength(Math.min(total, s + 0.5));
    const r = tempPath.getPointAtLength(Math.max(0, s - 0.5));
    const dx = q.x - r.x; const dy = q.y - r.y; const len = Math.hypot(dx, dy) || 1;
    out.push({ x: p.x, y: p.y, ux: dx / len, uy: dy / len });
  }
  return out;
}

// Small barbed-wire crosses along the front line (STYLE.md §4.7).
function wireTicks(samples) {
  let d = '';
  samples.forEach((p, i) => {
    if (i % 2) return;
    const a = 0.9;
    d += `M${p.x - a},${p.y - a}L${p.x + a},${p.y + a}M${p.x - a},${p.y + a}L${p.x + a},${p.y - a}`;
  });
  return d;
}

// Trench zigzags along the inside of a box edge: one line per trench level
// (STYLE.md §4.8). `side` is +1 for the box on the left of the line, −1 for the right.
function trenchZigzags(samples, side, level) {
  let d = '';
  for (let n = 0; n < level; n++) {
    const offset = 2.4 + n * 1.7;
    samples.forEach((p, i) => {
      const wobble = i % 2 ? 0.55 : -0.55;
      // the "left" of the line, matching tools/build-map.mjs (data-left)
      const nx = p.uy; const ny = -p.ux;
      const x = p.x + nx * side * (offset + wobble);
      const y = p.y + ny * side * (offset + wobble);
      d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2);
    });
  }
  return d;
}

// The full trench network for one side of a front border, as on a 1917 trench map
// (STYLE.md §13). `side` is +1 for the box on the left of the line, −1 for the right.
//   fire trench — a square "traverse" pattern just behind the front line
//   support (level 2+) and reserve (level 3) trenches further back
//   communication trenches — zigzags running back every ~10 map units
function trenchNetwork(samples, side, level) {
  const at = (p, off) => [p.x + p.uy * side * off, p.y - p.ux * side * off];
  const pt = ([x, y]) => x.toFixed(2) + ',' + y.toFixed(2);
  let fire = ''; let support = ''; let comms = '';
  // fire trench: square traverses — a bay, a step back, a bay — like a crenellation
  let lastOff = null;
  samples.forEach((p, i) => {
    const off = Math.floor(i / 2) % 2 ? 1.5 : 2.1;
    if (lastOff === null) fire += 'M' + pt(at(p, off));
    else if (off !== lastOff) fire += 'L' + pt(at(p, lastOff)) + 'L' + pt(at(p, off));
    else fire += 'L' + pt(at(p, off));
    lastOff = off;
  });
  // support and reserve trenches: plain lines further back, gently following the front
  const backLines = level >= 3 ? [4.6, 7.4] : level >= 2 ? [4.6] : [];
  for (const base of backLines) {
    samples.forEach((p, i) => { support += (i === 0 ? 'M' : 'L') + pt(at(p, base)); });
  }
  // communication trenches: a few short, clean zigzags joining the lines
  const reach = backLines.length ? backLines[backLines.length - 1] : 4.6;
  for (let i = 8; i < samples.length - 8; i += 22) {
    const p = samples[i];
    for (let d = 2.1, n = 0; d <= reach + 0.01; d += 0.8, n++) {
      const sway = n % 2 ? 0.45 : -0.45;
      const q = at(p, d);
      comms += (n === 0 ? 'M' : 'L') + (q[0] + p.ux * sway).toFixed(2) + ',' + (q[1] + p.uy * sway).toFixed(2);
    }
  }
  return { fire, support, comms };
}

// ---------------------------------------------------------------- the map view
// Put the map into `container` and return an object to update it.
//   svg            — from loadMapSvg(), or the board from js/ui/board.js
//   nations        — data/nations.json (owner colours)
//   boxNameFn(id)  — the territory's full name, for screen readers
//   noteNameFn(id) — the place name used in pencil notes (e.g. "Verdun")
//   shortMonthFn(m)— "1916-02" → "Feb 1916"
//   prefix         — what the ids of shapes, clips and patterns start with ("b-" on the board)
//   pieceSize      — the board only: a piece's width in map units (it grows and shrinks
//                    with the board and stands in the middle of its square)
export function createMapView(container, svg, { nations, boxNameFn, noteNameFn, shortMonthFn, prefix = '', pieceSize = null }) {
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.classList.add('map-svg');
  svg.setAttribute('role', 'group');
  container.replaceChildren(svg);

  const sideColor = {};
  for (const s of nations.sides) sideColor[s.id] = s.color;
  const layer = (id) => svg.querySelector('#' + id);
  const territories = [...svg.querySelectorAll('.territory')];
  const boxOf = (t) => t.dataset.box;
  const byId = Object.fromEntries(territories.map((t) => [boxOf(t), t]));
  const shapeRef = (id) => `#${prefix}shape-${id}`;      // href of a territory's shape
  const edges = [...svg.querySelectorAll('.edge')];
  // A hidden path we use to measure along borders.
  const ruler = svgEl('path', { visibility: 'hidden' });
  svg.appendChild(ruler);
  // Measuring along a path is slow, and the borders never change shape, so each
  // border's sample points are measured once and kept (docs/PERFORMANCE.md).
  const sampleCache = new Map();
  const samplesOf = (d, step) => {
    const key = step + ' ' + d;
    if (!sampleCache.has(key)) sampleCache.set(key, samplePath(ruler, d, step));
    return sampleCache.get(key);
  };
  // Where a territory's anchor town is (map units).
  const anchor = (id) => [Number(byId[id].dataset.x), Number(byId[id].dataset.y)];

  for (const t of territories) {
    t.setAttribute('tabindex', '0');
    t.setAttribute('role', 'button');
    t.setAttribute('aria-label', boxNameFn(boxOf(t)));
  }

  // The front line, the simple trench marks (far/mid zoom) and the full trench
  // network (near zoom), along every border between enemies.
  function drawFront(state) {
    const owner = (id) => state.boxes[id].owner;
    const front = layer('front'); const trenches = layer('trenches');
    front.replaceChildren(); trenches.replaceChildren();
    for (const edge of edges) {
      const a = edge.dataset.a; const b = edge.dataset.b;
      if (owner(a) === owner(b)) continue;            // not a front-line border
      const d = edge.getAttribute('d');
      front.appendChild(svgEl('path', { d, class: 'front-bleed' }));
      front.appendChild(svgEl('path', { d, class: 'front-line' }));
      let wire = ''; let zig = '';
      const net = {};
      for (const piece of pieces(d)) {
        const samples = samplesOf(piece, 1.8);
        const fine = samplesOf(piece, 0.9);
        wire += wireTicks(samples);
        for (const id of [a, b]) {
          const level = state.boxes[id].trench;
          if (level <= 0) continue;
          const side = id === edge.dataset.left ? 1 : -1;
          zig += trenchZigzags(samples, side, level);
          const n = trenchNetwork(fine, side, level);
          const k = owner(id);
          net[k] = net[k] || { fire: '', support: '', comms: '' };
          net[k].fire += n.fire; net[k].support += n.support; net[k].comms += n.comms;
        }
      }
      front.appendChild(svgEl('path', { d: wire, class: 'front-wire' }));
      if (zig) trenches.appendChild(svgEl('path', { d: zig, class: 'trench trench-simple' }));
      for (const [k, n] of Object.entries(net)) {
        trenches.appendChild(svgEl('path', { d: n.fire, class: `trench-net ${k}` }));
        if (n.support) trenches.appendChild(svgEl('path', { d: n.support, class: `trench-net support ${k}` }));
        if (n.comms) trenches.appendChild(svgEl('path', { d: n.comms, class: `trench-net comms ${k}` }));
      }
    }
  }

  // A band of the owner's colour just inside every territory's border, so regions
  // read clearly when zoomed out (like a campaign map's coloured borders).
  function drawRegionEdges(owner) {
    const g = layer('region-edges');
    g.replaceChildren();
    g.setAttribute('class', 'lod-far');                      // only when zoomed out
    for (const t of territories) {
      g.appendChild(svgEl('use', {
        href: shapeRef(boxOf(t)), 'clip-path': `url(#${prefix}clip-${boxOf(t)})`, class: 'region-edge',
        stroke: sideColor[owner(boxOf(t))],
      }));
    }
  }

  // Battle scars: more crater stipple each time a territory is fought over.
  function drawScars(counts, scarLevelFn) {
    const scars = layer('scars');
    scars.replaceChildren();
    for (const [id, count] of Object.entries(counts)) {
      const level = scarLevelFn(count);
      if (level > 0 && byId[id]) {
        scars.appendChild(svgEl('use', { href: shapeRef(id), fill: `url(#${prefix}pat-scar${level})`, class: 'scar' }));
      }
    }
  }

  // Pencil notes for the big battles, written beside the spot with a leader line.
  // Each note tries a few places round the spot and takes the first free one.
  function drawNotes(big) {
    const notes = layer('notes');
    notes.replaceChildren();
    notes.setAttribute('class', 'lod-mid');                // shown from mid zoom
    const taken = [];
    const tries = [[14, -14], [14, 16], [-14, -14], [-14, 16], [22, 2], [-22, 2], [6, -26], [6, 28]];
    for (const { box, months } of big) {
      if (!byId[box]) continue;
      const [x, y] = anchor(box);
      const when = months.length > 1
        ? `${shortMonthFn(months[0])}, ${shortMonthFn(months[months.length - 1])}`
        : shortMonthFn(months[0]);
      const text = `${noteNameFn(box)} — ${when}`;
      const w = text.length * 3.4; const h = 8;              // rough size in map units
      let spot = tries[0];
      for (const t of tries) {
        const left = t[0] >= 0 ? x + t[0] : x + t[0] - w;
        const r = { l: left, r: left + w, t: y + t[1] - h, b: y + t[1] + 2 };
        if (!taken.some((o) => r.l < o.r && r.r > o.l && r.t < o.b && r.b > o.t)) { spot = t; taken.push(r); break; }
      }
      const tx = x + spot[0]; const ty = y + spot[1];
      notes.appendChild(svgEl('path', { d: `M${x},${y}Q${(x + tx) / 2 + 2},${(y + ty) / 2 - 2} ${tx},${ty - 1}`, class: 'pencil-lead' }));
      const label = svgEl('text', {
        x: tx, y: ty, class: 'pencil-note',
        'text-anchor': spot[0] >= 0 ? 'start' : 'end',
        transform: `rotate(${spot[0] >= 0 ? -4 : 3} ${tx} ${ty})`,
      });
      label.textContent = text;
      notes.appendChild(label);
    }
  }

  // Paint everything that depends on the game state.
  //   month — "YYYY-MM", monthName — e.g. "December 1914"
  //   record — { counts, big, scarLevel } from js/engine/battles.js
  // Each layer is only redrawn when what it shows has changed (a "key" made from its
  // inputs): most updates change a piece or two, not the front line (PERFORMANCE.md).
  const drawnKeys = {};
  const changed = (name, key) => { if (drawnKeys[name] === key) return false; drawnKeys[name] = key; return true; };
  function update(state, month, monthName, record) {
    const owner = (id) => state.boxes[id].owner;
    const owners = territories.map((t) => owner(boxOf(t))).join(',');
    if (changed('owners', owners)) {
      for (const t of territories) t.style.fill = sideColor[owner(boxOf(t))];
      drawRegionEdges(owner);
    }
    const trenchKey = territories.map((t) => state.boxes[boxOf(t)].trench).join(',');
    if (changed('front', owners + '|' + trenchKey)) drawFront(state);
    if (record) {
      if (changed('scars', JSON.stringify(record.counts))) drawScars(record.counts, record.scarLevel);
      if (changed('notes', JSON.stringify(record.big))) drawNotes(record.big);
    }
    // Seasons: snow Dec–Feb, spring green Mar–May, Flanders mud Sep–Nov.
    const m = Number(month.slice(5, 7));
    svg.classList.toggle('winter', m === 12 || m <= 2);
    svg.classList.toggle('spring', m >= 3 && m <= 5);
    svg.classList.toggle('autumn', m >= 9 && m <= 11);
    const date = svg.querySelector('#map-date');
    if (date) date.textContent = monthName;
  }

  // Outline the selected territory in brass (or clear it with null).
  // It's drawn in a thin see-through SVG laid over the map (js/ui/zoom.js moves it with
  // the map), so its slow pulse fades that whole layer, which the phone's graphics chip
  // does without redrawing the map underneath (docs/PERFORMANCE.md).
  const pulseSvg = svgEl('svg', { class: 'map-svg zoomable overlay-svg', 'aria-hidden': 'true', viewBox: svg.getAttribute('viewBox') });
  container.appendChild(pulseSvg);
  function select(boxId) {
    pulseSvg.replaceChildren();
    press(null);
    if (boxId) pulseSvg.appendChild(svgEl('use', { href: shapeRef(boxId), class: 'selected-outline' }));
    pulseSvg.classList.toggle('pulsing', Boolean(boxId));
  }
  // Instant feedback while a finger is down on a territory (js/ui/zoom.js onPress): the
  // brass outline goes on at once, before the tap is decided; null takes it off again.
  let pressMark = null;
  function press(boxId) {
    if (pressMark) { pressMark.remove(); pressMark = null; }
    if (!boxId || !byId[boxId]) return;
    pressMark = svgEl('use', { href: shapeRef(boxId), class: 'selected-outline press' });
    layer('selection').appendChild(pressMark);
  }

  // The shape of a grease-pencil arrow from inside `fromId` into `toId`, crossing
  // their shared border (or, for a rail move, straight across the map). Returns the
  // path for the main stroke, a fainter second stroke, and the middle point.
  function arrowShape(fromId, toId) {
    const [a, b] = [fromId, toId].sort();
    const edge = svg.querySelector(`.edge[data-a="${a}"][data-b="${b}"]`);
    const A = anchor(fromId); const B = anchor(toId);
    let mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    if (edge) {
      ruler.setAttribute('d', pieces(edge.getAttribute('d'))[0]);
      const p = ruler.getPointAtLength(ruler.getTotalLength() / 2);
      mid = [p.x, p.y];
    }
    // From inside the attacker's territory, across the border, into the target;
    // at least 22 map units long so it reads as an arrow even where towns are close.
    let dirX = B[0] - A[0]; let dirY = B[1] - A[1];
    const dl = Math.hypot(dirX, dirY) || 1; dirX /= dl; dirY /= dl;
    const half = Math.max(11, dl * 0.45);
    const start = [mid[0] - dirX * half, mid[1] - dirY * half];
    const end = [mid[0] + dirX * half * 0.85, mid[1] + dirY * half * 0.85];
    const dx = end[0] - start[0]; const dy = end[1] - start[1]; const L = Math.hypot(dx, dy) || 1;
    const bend = [(start[0] + end[0]) / 2 - (dy / L) * L * 0.12, (start[1] + end[1]) / 2 + (dx / L) * L * 0.12];
    const curve = (o) => `M${start[0] + o},${start[1] - o}Q${bend[0]},${bend[1]} ${end[0]},${end[1]}`;
    // arrowhead: two strokes back from the tip, along the curve's last direction
    const ux = end[0] - bend[0]; const uy = end[1] - bend[1]; const ul = Math.hypot(ux, uy) || 1;
    const head = (ang) => {
      const c = Math.cos(ang); const s = Math.sin(ang); const hx = -(ux / ul) * 6; const hy = -(uy / ul) * 6;
      return `M${end[0]},${end[1]}l${hx * c - hy * s},${hx * s + hy * c}`;
    };
    const top = [(start[0] + 2 * bend[0] + end[0]) / 4, (start[1] + 2 * bend[1] + end[1]) / 4];
    return { main: curve(0) + head(0.5) + head(-0.5), second: curve(0.6) + head(0.42), mid: top };
  }
  // Draw one arrow into `parent`. kind: 'attack' (front-red) or 'move' (dashed ink).
  function drawArrow(parent, fromId, toId, kind, extra = {}) {
    if (!byId[fromId] || !byId[toId] || fromId === toId) return null;
    const shape = arrowShape(fromId, toId);
    const g = svgEl('g', { class: `arrow ${kind}${extra.bad ? ' bad' : ''}` });
    if (extra.index !== undefined) g.setAttribute('data-order', String(extra.index));
    // a wide invisible stroke, so the arrow is easy to tap (44 px)
    if (extra.index !== undefined) g.appendChild(svgEl('path', { d: shape.main, class: 'arrow-hit' }));
    g.appendChild(svgEl('path', { d: shape.main, class: 'plan-arrow' }));
    g.appendChild(svgEl('path', { d: shape.second, class: 'plan-arrow second' }));
    if (extra.label) {
      const t = svgEl('text', { x: shape.mid[0], y: shape.mid[1], class: 'arrow-label' });
      t.textContent = extra.label;
      g.appendChild(t);
    }
    parent.appendChild(g);
    return g;
  }

  // The arrow for an attack being set up on the order slip (not yet added to orders).
  function showPlannedAttack(fromId, toId) {
    const plans = layer('plans');
    plans.replaceChildren();
    drawArrow(plans, fromId, toId, 'attack');
  }
  function clearPlannedAttack() { layer('plans').replaceChildren(); }

  // The queued orders, as grease-pencil arrows you can tap (data-order = the order's
  // place in the queue). list: [{ index, kind: 'move' | 'attack', from, to, label, bad }]
  const ordersLayer = svgEl('g', { id: 'orders' });
  layer('plans').after(ordersLayer);
  function drawOrders(list) {
    ordersLayer.replaceChildren();
    const out = {};
    for (const o of list) out[o.key ?? o.index] = drawArrow(ordersLayer, o.from, o.to, o.kind, o);
    return out;
  }

  // Hide any name that would overlap a more important one (call after zooming).
  // Order: cities (most VP first), pencil notes, the game's other towns (front line
  // first), orientation towns, landmarks, villages, then river and road names.
  const depthRank = (label) => ({ 1: 0, 2: 1, 3: 2 })[label.dataset.box.slice(-1)] ?? 3;
  const vpOf = (label) => Number(label.parentNode.querySelector('.vp-text')?.textContent || 0);
  const labels = () => [
    ...[...svg.querySelectorAll('.label.city')].sort((a, b) => vpOf(b) - vpOf(a)),
    ...svg.querySelectorAll('.pencil-note'),
    ...[...svg.querySelectorAll('.label.town:not(.other)')].sort((a, b) => depthRank(a) - depthRank(b)),
    ...svg.querySelectorAll('.label.town.other'),
    ...svg.querySelectorAll('.label.landmark'),
    ...svg.querySelectorAll('.label.village'),
    ...svg.querySelectorAll('.river-label'),
    ...svg.querySelectorAll('.road-label'),
  ];
  // All the sizes are read first and all the changes made after: reading a size
  // straight after a change makes the phone lay the whole map out again each time.
  // (A hidden label keeps its size, so hiding doesn't change what we read.)
  function declutter() {
    const list = labels();
    const rects = list.map((label) => label.getBoundingClientRect());
    const placed = [];
    const hide = rects.map((r) => {
      if (r.width === 0) return false;                  // not shown at this zoom
      const hit = placed.some((p) => r.left < p.right + 2 && r.right > p.left - 2 &&
        r.top < p.bottom + 1 && r.bottom > p.top - 1);
      if (!hit) placed.push(r);
      return hit;
    });
    list.forEach((label, i) => {
      const v = hide[i] ? 'hidden' : '';
      if (label.style.visibility !== v) label.style.visibility = v;
    });
  }

  // The area (map units) the front line covers: [x, y, width, height].
  function frontBounds() {
    const b = layer('front').getBBox();
    return b.width > 0 ? [b.x, b.y, b.width, b.height] : null;
  }

  // ---- units (docs/STYLE.md §5)
  // Each territory's pieces stand as one stack beside its town. Pieces keep a steady
  // size on screen, and layout() moves each stack to a spot where it doesn't cover a
  // town name, town symbol, VP ring or pencil note (or another stack).
  const unitsLayer = svgEl('g', { id: 'units' });
  svg.appendChild(unitsLayer);                     // on top of everything, even the folds
  const targetsLayer = svgEl('g', { id: 'targets' });
  layer('selection').before(targetsLayer);
  let zoomK = 1;                                   // screen pixels per map unit
  let lastScale = 0.3; let lastOffset = [8, 0];    // the latest piece size and offset (for ghosts)
  const PIECE_PX = { far: 30, mid: 44, near: 48 }; // a piece's width on screen (44 px: a finger)

  //   units      — the game's units
  //   lookFor(u) — { color, symbol, maxSteps, mirror } for a unit (from the data files)
  // Only the stacks that changed are drawn again (a piece is a lot of SVG); a stack
  // whose units are just as before is kept. If nothing changed, nothing is done.
  const stacks = new Map();                        // boxId → { key, el }
  let unitsKey = null;
  function drawUnits(units, lookFor) {
    const byBox = new Map();
    for (const u of units) {
      if (!byBox.has(u.box)) byBox.set(u.box, []);
      byBox.get(u.box).push(u);
    }
    const keys = new Map();
    for (const [boxId, list] of byBox) keys.set(boxId, JSON.stringify(list.map((u) => [u, lookFor(u)])));
    const allKey = [...keys].map(([b, k]) => b + k).join('|');
    if (allKey === unitsKey) return;
    unitsKey = allKey;
    for (const [boxId, old] of stacks) if (!keys.has(boxId)) { old.el.remove(); stacks.delete(boxId); }
    for (const [boxId, list] of byBox) {
      if (!byId[boxId]) continue;
      const old = stacks.get(boxId);
      if (old && old.key === keys.get(boxId)) { unitsLayer.appendChild(old.el); continue; }   // kept, in order
      if (old) old.el.remove();
      const [x, y] = anchor(boxId);
      const at = svgEl('g', { class: 'unit-spot', transform: `translate(${x},${y})`, 'data-box': boxId, 'data-count': list.length });
      const holder = svgEl('g', { class: 'piece-holder' });
      holder.appendChild(stackSvg(list, lookFor));
      at.appendChild(holder);
      unitsLayer.appendChild(at);
      stacks.set(boxId, { key: keys.get(boxId), el: at });
    }
    layout();
  }

  // The box round a stack of n pieces, in piece units: [left, top, right, bottom]
  // (see counters.js: the face is −14.6…14.4, the side face and shadow reach 17.6, the
  // edges of the pieces underneath sit STACK_STEP lower each; the brass tab sticks out top right).
  function stackBox(n) {
    const edge = (n - 1) * STACK_STEP;
    return n > 1 ? [-14.6, -16.4, 21.8, 17.6 + edge] : [-14.6, -14.6, 16.6, 17.6];
  }

  // Where a stack may go, next to its town (screen pixels from the town dot to the
  // stack box's nearest edge or centre). Tried in this order; the first free one wins.
  function candidates(w, h) {
    const g = 5;
    return [
      [g, -h * 0.25],              // right of the town, a little below the name
      [g, -h * 0.5],               // right, centred on the town
      [-w - g, -h * 0.25],         // left
      [-w / 2, g + 4],             // below
      [g, -h - g],                 // above right
      [-w - g, -h - g],            // above left
      [-w / 2, g + 16],            // further below
      [g + 14, -h * 0.25],         // further right
      [-w - g - 14, -h * 0.25],    // further left
      [-w / 2, -h - 18],           // well above
      [g + 28, -h * 0.5],          // far right
      [-w - g - 28, -h * 0.5],     // far left
    ];
  }

  // Screen rectangles of what a piece must not cover: town names and symbols, VP rings
  // and pencil notes ("hard"); village and landmark names ("soft": a piece may cover
  // one if there's no other room, and that name is then hidden).
  const visibleRects = (selector) => [...svg.querySelectorAll(selector)]
    .filter((t) => t.style.visibility !== 'hidden')
    .map((t) => ({ el: t, r: t.getBoundingClientRect() }))
    .filter((o) => o.r.width > 0);
  const hardThings = () => visibleRects('#towns text, #towns circle, #towns path, #notes text').map((o) => o.r);
  const softThings = () => visibleRects('#villages text, #landmarks text');
  const overlapArea = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  // Size the pieces for the zoom and move every stack to a free spot beside its town.
  function layout(k) {
    if (k) zoomK = k;
    if (pieceSize) { layoutBoard(); return; }
    const level = svg.classList.contains('near') ? 'near' : svg.classList.contains('far') ? 'far' : 'mid';
    const px = PIECE_PX[level] / 30;              // screen pixels per piece unit
    const scale = px / zoomK;                     // map units per piece unit
    lastScale = scale;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    // Read every size first (see declutter: reads and writes mixed are slow) ...
    const blocked = hardThings();
    const soft = softThings();
    const spots = [...unitsLayer.querySelectorAll('.unit-spot')];
    const ownRects = spots.map((spot) => {
      const own = svg.querySelector(`#towns [data-box="${spot.dataset.box}"]`);
      return own && own.style.visibility !== 'hidden' ? own.getBoundingClientRect() : null;
    });
    const writes = [];
    const toHide = new Set();
    spots.forEach((spot, n) => {
      const [x, y] = anchor(spot.dataset.box);
      const sx = ctm.a * x + ctm.e; const sy = ctm.d * y + ctm.f;     // the town on screen
      const [L, T, R, B] = stackBox(Number(spot.dataset.count));
      const w = (R - L) * px; const h = (B - T) * px;
      // also try just past either end of the territory's own name, level with it
      const ownR = ownRects[n];
      const extra = ownR && ownR.width > 0
        ? [[ownR.right - sx + 4, ownR.top - sy], [ownR.left - sx - w - 4, ownR.top - sy],
          [ownR.right - sx + 4, ownR.bottom - sy - h], [ownR.left - sx - w - 4, ownR.bottom - sy - h]]
        : [];
      const spotsHere = [...candidates(w, h).slice(0, 4), ...extra, ...candidates(w, h).slice(4)].map(([cx, cy]) => [cx, cy, { left: sx + cx, top: sy + cy, right: sx + cx + w, bottom: sy + cy + h }]);
      // Only things near this town can be in the way: test those, not the whole map.
      const near = spotsHere.reduce((a, c) => ({ left: Math.min(a.left, c[2].left), top: Math.min(a.top, c[2].top),
        right: Math.max(a.right, c[2].right), bottom: Math.max(a.bottom, c[2].bottom) }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
      const hardNear = blocked.filter((o) => overlaps(o, near));
      const softNear = soft.filter((o) => overlaps(o.r, near));
      // Take the first spot that covers nothing; if every spot covers something, the one
      // that covers least (names and symbols count a hundred times more than village names).
      // A stack must stand in its own territory: a spot whose middle is outside it is
      // never used if there's another, and corners sticking out cost a little.
      const shape = svg.getElementById(`${prefix}shape-${spot.dataset.box}`);
      const inside = (px2, py2) => { const p = svg.createSVGPoint(); p.x = (px2 - ctm.e) / ctm.a; p.y = (py2 - ctm.f) / ctm.d; return shape.isPointInFill(p); };
      const outside = (rect) => {
        if (!shape || !shape.isPointInFill) return 0;
        let c = inside((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2) ? 0 : 1e6;
        for (const [qx, qy] of [[rect.left, rect.top], [rect.right, rect.top], [rect.left, rect.bottom], [rect.right, rect.bottom]]) if (!inside(qx, qy)) c += 150;
        return c;
      };
      const cost = (rect) => hardNear.reduce((t, o) => t + 100 * overlapArea(rect, o), 0) +
        softNear.reduce((t, o) => t + overlapArea(rect, o.r), 0);
      let chosen = null; let best = Infinity;
      spotsHere.forEach((c, i) => {
        const cheap = cost(c[2]) + i * 0.5;
        if (cheap >= best) return;                // can't win: skip the slow inside test
        const v = cheap + outside(c[2]);
        if (v < best) { best = v; chosen = c; }
      });
      for (const o of softNear) if (overlaps(chosen[2], o.r)) toHide.add(o.el);
      blocked.push(chosen[2]);                    // later stacks keep clear of this one
      // the stack's own origin, in map units from the town
      const ox = (chosen[0] - L * px) / zoomK; const oy = (chosen[1] - T * px) / zoomK;
      spotOffset[spot.dataset.box] = [ox, oy]; lastOffset = [ox, oy];
      writes.push([spot.firstChild, `translate(${ox.toFixed(2)},${oy.toFixed(2)}) scale(${scale.toFixed(4)})`]);
    });
    // ... then make all the changes at once.
    for (const el of toHide) el.style.visibility = 'hidden';
    for (const [g, t] of writes) if (g.getAttribute('transform') !== t) g.setAttribute('transform', t);
  }

  // The board: every stack is the same size (pieceSize map units wide) and stands
  // centred on its territory's anchor, the middle of its square (js/ui/board.js).
  function layoutBoard() {
    const scale = pieceSize / 29;                 // map units per piece unit (the face is 29 wide)
    lastScale = scale;
    for (const spot of unitsLayer.querySelectorAll('.unit-spot')) {
      const [L, T, R, B] = stackBox(Number(spot.dataset.count));
      const ox = -((L + R) / 2) * scale; const oy = -((T + B) / 2) * scale;
      spotOffset[spot.dataset.box] = [ox, oy]; lastOffset = [ox, oy];
      spot.firstChild.setAttribute('transform', `translate(${ox.toFixed(2)},${oy.toFixed(2)}) scale(${scale.toFixed(4)})`);
    }
  }

  // Outline where things can happen: moveIds by road (brass), railIds by rail (river
  // blue, dashed), attackIds the enemy territories you can attack (front-red, dashed).
  function showTargets(moveIds, railIds, attackIds = []) {
    targetsLayer.replaceChildren();
    for (const id of attackIds) targetsLayer.appendChild(svgEl('use', { href: shapeRef(id), class: 'target attackable' }));
    for (const id of railIds) if (!moveIds.includes(id)) targetsLayer.appendChild(svgEl('use', { href: shapeRef(id), class: 'target rail' }));
    for (const id of moveIds) targetsLayer.appendChild(svgEl('use', { href: shapeRef(id), class: 'target move' }));
  }

  // The Best attacks helper: an arrow with its odds for each suggestion.
  //   list: [{ from, to, label }]
  const suggestLayer = svgEl('g', { id: 'suggestions' });
  ordersLayer.after(suggestLayer);
  function showSuggestions(list) {
    suggestLayer.replaceChildren();
    for (const o of list) drawArrow(suggestLayer, o.from, o.to, 'attack suggest', { label: o.label });
  }

  // The guided first turn's arrows: what the coach wants you to do next.
  //   list: [{ from, to, kind: 'move' | 'attack' }]
  const coachLayer = svgEl('g', { id: 'coach-arrows' });
  suggestLayer.after(coachLayer);
  function showCoach(list) {
    coachLayer.replaceChildren();
    for (const o of list) drawArrow(coachLayer, o.from, o.to, `${o.kind} coach`);
  }

  // ---- playing a turn back (js/ui/animate.js uses these)
  // Where a territory's stack stands now (map units): its town plus the stack's offset.
  const spotOffset = {};
  function standPoint(boxId) {
    const [x, y] = anchor(boxId);
    const o = spotOffset[boxId] || lastOffset;
    return [x + o[0], y + o[1]];
  }
  // A loose piece on top of the map, for sliding along a move arrow. It's drawn in its
  // own small layer above the map and slid with a CSS transform, so the phone's
  // graphics chip moves it without redrawing the map underneath (PERFORMANCE.md).
  const ghostLayer = document.createElement('div');
  ghostLayer.className = 'ghost-layer';
  container.appendChild(ghostLayer);
  function ghostPiece(unit, look) {
    const ctm = svg.getScreenCTM();
    const box = container.getBoundingClientRect();
    const zoom = ctm ? ctm.a : zoomK;                       // screen pixels per map unit
    const level = ['far', 'mid', 'near'].find((l) => svg.classList.contains(l)) || 'mid';
    const div = document.createElement('div');
    div.className = 'ghost';
    const pieceSvg = svgEl('svg', { class: `ghost-svg ${level}${pieceSize ? ' on-board' : ''}`, width: '1', height: '1' });
    const g = svgEl('g', { transform: `scale(${(lastScale * zoom).toFixed(4)})` });
    g.appendChild(stackSvg([unit], () => look));
    pieceSvg.appendChild(g);
    div.appendChild(pieceSvg);
    ghostLayer.appendChild(div);
    return {
      at(x, y) {
        const sx = ctm ? ctm.a * x + ctm.e - box.left : x; const sy = ctm ? ctm.d * y + ctm.f - box.top : y;
        div.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
      },
      remove() { div.remove(); },
    };
  }
  // Short-lived marks over a territory: barrage puffs, and a "−2" that floats up.
  // They animate with CSS and remove themselves.
  const effects = svgEl('g', { id: 'effects' });
  // Grease pencil goes on top of everything, like on the acetate over a staff map:
  // the planned attack, the queued orders, then the effects.
  svg.appendChild(layer('plans'));
  svg.appendChild(ordersLayer);
  svg.appendChild(effects);
  function puffs(boxId) {
    const [x, y] = anchor(boxId);
    const g = svgEl('g', { class: 'puffs', transform: `translate(${x},${y}) scale(${(1 / zoomK).toFixed(4)})` });
    [[-14, -6, 0], [10, -10, 0.12], [0, 8, 0.22], [16, 6, 0.3], [-8, 12, 0.4]].forEach(([dx, dy, delay]) => {
      g.appendChild(svgEl('circle', { cx: dx, cy: dy, r: 7, class: 'puff', style: `animation-delay:${delay}s` }));
    });
    effects.appendChild(g);
    setTimeout(() => g.remove(), 900);
  }
  function floatText(boxId, text) {
    const [x, y] = standPoint(boxId);
    const t = svgEl('text', { class: 'float-loss', transform: `translate(${x},${y}) scale(${(1 / zoomK).toFixed(4)})` });
    t.textContent = text;
    effects.appendChild(t);
    setTimeout(() => t.remove(), 700);
  }
  function clearEffects() { effects.replaceChildren(); ghostLayer.replaceChildren(); }

  return { svg, update, select, press, declutter, frontBounds, showPlannedAttack, clearPlannedAttack,
    drawUnits, layout, showTargets, showSuggestions, showCoach, drawOrders, standPoint, ghostPiece, puffs, floatText, clearEffects,
    anchorOf: anchor, boxIds: () => Object.keys(byId) };
}
