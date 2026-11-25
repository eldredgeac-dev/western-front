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
//   svg            — from loadMapSvg()
//   nations        — data/nations.json (owner colours)
//   boxNameFn(id)  — the territory's full name, for screen readers
//   noteNameFn(id) — the place name used in pencil notes (e.g. "Verdun")
//   shortMonthFn(m)— "1916-02" → "Feb 1916"
export function createMapView(container, svg, { nations, boxNameFn, noteNameFn, shortMonthFn }) {
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.classList.add('map-svg');
  svg.setAttribute('role', 'group');
  container.replaceChildren(svg);

  const sideColor = {};
  for (const s of nations.sides) sideColor[s.id] = s.color;
  const layer = (id) => svg.querySelector('#' + id);
  const territories = [...svg.querySelectorAll('.territory')];
  const byId = Object.fromEntries(territories.map((t) => [t.id, t]));
  const edges = [...svg.querySelectorAll('.edge')];
  // A hidden path we use to measure along borders.
  const ruler = svgEl('path', { visibility: 'hidden' });
  svg.appendChild(ruler);
  // Where a territory's anchor town is (map units).
  const anchor = (id) => [Number(byId[id].dataset.x), Number(byId[id].dataset.y)];

  for (const t of territories) {
    t.setAttribute('tabindex', '0');
    t.setAttribute('role', 'button');
    t.setAttribute('aria-label', boxNameFn(t.id));
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
        const samples = samplePath(ruler, piece, 1.8);
        const fine = samplePath(ruler, piece, 0.9);
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
        href: '#shape-' + t.id, 'clip-path': `url(#clip-${t.id})`, class: 'region-edge',
        stroke: sideColor[owner(t.id)],
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
        scars.appendChild(svgEl('use', { href: '#shape-' + id, fill: `url(#pat-scar${level})`, class: 'scar' }));
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
  function update(state, month, monthName, record) {
    const owner = (id) => state.boxes[id].owner;
    for (const t of territories) t.style.fill = sideColor[owner(t.id)];
    drawRegionEdges(owner);
    drawFront(state);
    if (record) {
      drawScars(record.counts, record.scarLevel);
      drawNotes(record.big);
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
  function select(boxId) {
    const sel = layer('selection');
    sel.replaceChildren();
    if (boxId) sel.appendChild(svgEl('use', { href: '#shape-' + boxId, class: 'selected-outline' }));
  }

  // A grease-pencil arrow for an attack that's planned but not yet confirmed.
  // It starts inside `fromId`, crosses the shared border and ends inside `toId`.
  function showPlannedAttack(fromId, toId) {
    const plans = layer('plans');
    plans.replaceChildren();
    if (!byId[fromId] || !byId[toId]) return;
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
    const width = 'max(1.4px, calc(3.4px * var(--u)))';
    plans.appendChild(svgEl('path', { d: curve(0) + head(0.5) + head(-0.5), class: 'plan-arrow', style: `stroke-width:${width}` }));
    plans.appendChild(svgEl('path', { d: curve(0.6) + head(0.42), class: 'plan-arrow second', style: 'stroke-width:max(0.8px, calc(1.6px * var(--u)))' }));
  }
  function clearPlannedAttack() { layer('plans').replaceChildren(); }

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
  function declutter() {
    const placed = [];
    for (const label of labels()) {
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

  return { svg, update, select, declutter, frontBounds, showPlannedAttack, clearPlannedAttack };
}
