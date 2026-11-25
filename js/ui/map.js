// map.js — shows the campaign map (img/map-west.svg, made by tools/build-map.mjs)
// and paints the game onto it: who owns each territory, the front line, trenches,
// the selected territory and the date. The look follows docs/STYLE.md §4.
//
// The SVG file already holds the geography. Each territory is an element whose id
// is the box id (like "l07-e3"), and every border between two neighbours is a
// <path class="edge" data-a="…" data-b="…">.

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

// Points every `step` map units along a path piece, with the direction there.
function samplePath(tempPath, d, step) {
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

// ---------------------------------------------------------------- the map view
// Put the map into `container` and return an object to update it.
//   svg            — from loadMapSvg()
//   nations        — data/nations.json (owner colours)
//   boxNameFn(id)  — the box's full name, for screen readers
//   onSelect(id)   — called when a territory is tapped (zoom.js does the tapping)
export function createMapView(container, svg, { nations, boxNameFn }) {
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.classList.add('map-svg');
  svg.setAttribute('role', 'group');
  container.replaceChildren(svg);

  const sideColor = {};
  for (const s of nations.sides) sideColor[s.id] = s.color;
  const layer = (id) => svg.querySelector('#' + id);
  const territories = [...svg.querySelectorAll('.territory')];
  const edges = [...svg.querySelectorAll('.edge')];
  // A hidden path we use to measure along borders.
  const ruler = svgEl('path', { visibility: 'hidden' });
  svg.appendChild(ruler);

  for (const t of territories) {
    t.setAttribute('tabindex', '0');
    t.setAttribute('role', 'button');
    t.setAttribute('aria-label', boxNameFn(t.id));
  }

  // Paint everything that depends on the game state.
  //   month — "YYYY-MM", monthName — e.g. "December 1914"
  function update(state, month, monthName) {
    const owner = (id) => state.boxes[id].owner;
    for (const t of territories) t.style.fill = sideColor[owner(t.id)];

    const noMansLand = layer('nomansland'); const front = layer('front'); const trenches = layer('trenches');
    noMansLand.replaceChildren(); front.replaceChildren(); trenches.replaceChildren();
    for (const edge of edges) {
      const a = edge.dataset.a; const b = edge.dataset.b;
      if (owner(a) === owner(b)) continue;            // not a front-line border
      const d = edge.getAttribute('d');
      noMansLand.appendChild(svgEl('path', { d, class: 'no-mans-land' }));
      front.appendChild(svgEl('path', { d, class: 'front-line' }));
      let wire = ''; let zig = '';
      for (const piece of pieces(d)) {
        const samples = samplePath(ruler, piece, 1.8);
        wire += wireTicks(samples);
        for (const id of [a, b]) {
          const level = state.boxes[id].trench;
          if (level > 0) zig += trenchZigzags(samples, id === edge.dataset.left ? 1 : -1, level);
        }
      }
      front.appendChild(svgEl('path', { d: wire, class: 'front-wire' }));
      if (zig) trenches.appendChild(svgEl('path', { d: zig, class: 'trench' }));
    }

    // Flanders mud shows in September, October and November (RULES.md §3).
    const m = Number(month.slice(5, 7));
    svg.classList.toggle('autumn', m >= 9 && m <= 11);
    const date = svg.querySelector('#map-date');
    if (date) date.textContent = monthName;
  }

  // Outline the selected territory in brass (or clear it with null).
  function select(boxId) {
    const sel = layer('selection');
    sel.replaceChildren();
    if (boxId) sel.appendChild(svgEl('use', { href: '#shape-' + boxId, class: 'selected-outline' }));
  }

  // Hide any name that would overlap a more important one (call after zooming).
  // Order: cities (most VP first), then the game's other towns, then the rest.
  const depthRank = (label) => ({ 1: 0, 2: 1, 3: 2 })[label.dataset.box.slice(-1)] ?? 3;
  const vpOf = (label) => Number(label.parentNode.querySelector('.vp-text')?.textContent || 0);
  const labels = [
    ...[...svg.querySelectorAll('.label.city')].sort((a, b) => vpOf(b) - vpOf(a)),
    // the game's other towns: front line (E1, G1) first, then support, then rear
    ...[...svg.querySelectorAll('.label.town:not(.other)')].sort((a, b) => depthRank(a) - depthRank(b)),
    ...svg.querySelectorAll('.label.town.other'),
    ...svg.querySelectorAll('.river-label'),
  ];
  function declutter() {
    const placed = [];
    for (const label of labels) {
      label.style.visibility = '';
      const r = label.getBoundingClientRect();
      if (r.width === 0) continue;                      // not shown at this zoom
      const hit = placed.some((p) => r.left < p.right + 2 && r.right > p.left - 2 &&
        r.top < p.bottom + 1 && r.bottom > p.top - 1);
      if (hit) label.style.visibility = 'hidden';
      else placed.push(r);
    }
  }

  // The area (map units) the front line covers: [x, y, width, height].
  function frontBounds() {
    const b = layer('front').getBBox();
    return b.width > 0 ? [b.x, b.y, b.width, b.height] : null;
  }

  return { svg, update, select, declutter, frontBounds };
}
