// board.js — the board view: the same territories as the campaign map, drawn as a
// clean grid of squares, like a General Staff sector diagram or a board game's board
// (docs/MILESTONES.md 10f, docs/STYLE.md §4). Each lane is a row from north (top) to
// south, and each depth column a square from west (Entente rear) to east (German rear).
//
// It builds an SVG with the same structure as the campaign map (img/map-west.svg):
// territories with data-box and an anchor point, an .edge path for every border, and
// the same layers. So js/ui/map.js can draw the game on it exactly as on the map:
// owners, front line, trenches, arrows, pieces, playback. Its shape, clip and pattern
// ids start with "b-", so the board and the map can both be on the page.
//
// Everything comes from the data: data/boxes-west.json (lanes, columns, boxes and
// their neighbours) and data/terrain.json. A new front is a new data file.

const SVG_NS = 'http://www.w3.org/2000/svg';
export const BOARD_PREFIX = 'b-';
const P = BOARD_PREFIX;

// Sizes in board units. At "fill the width" on a phone, 1 unit ≈ 1 screen pixel.
const SQUARE_W = 64;       // a territory square's width
const SQUARE_H = 62;       // and height
const LANE_HEAD = 13;      // the strip above each lane with its name
const TOP = 16;            // the strip at the top with the column names
const PAD = 6;             // the margin round the board
export const BOARD_PIECE = 38;   // a piece's width (map.js pieceSize)

function el(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function text(parent, x, y, content, attrs = {}) {
  const t = el('text', { x, y, ...attrs }, parent);
  t.textContent = content;
  return t;
}

// Where each box's square is: { x, y, w, h } (board units), from its lane and column.
export function boardLayout(map) {
  const laneIndex = Object.fromEntries(map.lanes.map((l, i) => [l.id, i]));
  const colIndex = Object.fromEntries(map.columns.map((c, i) => [c.id, i]));
  const laneTop = (i) => TOP + PAD + i * (LANE_HEAD + SQUARE_H);
  const squares = {};
  for (const b of map.boxes) {
    const li = laneIndex[b.lane]; const ci = colIndex[b.column];
    squares[b.id] = { x: PAD + ci * SQUARE_W, y: laneTop(li) + LANE_HEAD, w: SQUARE_W, h: SQUARE_H, lane: li, col: ci };
  }
  return {
    squares, laneTop,
    width: PAD * 2 + map.columns.length * SQUARE_W,
    height: TOP + PAD * 2 + map.lanes.length * (LANE_HEAD + SQUARE_H),
  };
}

// The border between two neighbouring squares, as a path, and which box is on its
// "left" (map.js draws each side's trenches on that box's side; walking along the
// path, the left box is on your left). Null if they don't touch on the board.
export function boardEdge(a, b) {
  if (a.lane === b.lane && Math.abs(a.col - b.col) === 1) {
    const [w, e] = a.col < b.col ? [a, b] : [b, a];
    const x = w.x + w.w;                                      // drawn from north to south:
    return { d: `M${x},${w.y}L${x},${w.y + w.h}`, left: e };  // the east box is on the left
  }
  if (a.col === b.col && Math.abs(a.lane - b.lane) === 1) {
    const [n, s] = a.lane < b.lane ? [a, b] : [b, a];
    const y = s.y - LANE_HEAD / 2;                            // in the lane-name strip
    return { d: `M${n.x},${y}L${n.x + n.w},${y}`, left: n };  // west to east: the north box is on the left
  }
  return null;
}

// Copy the campaign map's patterns (paper, terrain textures, battle scars) with the
// board's prefix, so the board draws with the very same textures.
function copyPatterns(mapSvg, defs) {
  for (const pat of mapSvg.querySelectorAll('pattern[id^="pat-"]')) {
    const copy = pat.cloneNode(true);
    copy.id = P + pat.id;
    // references inside the pattern (to other patterns or shapes) take the prefix too
    for (const node of [copy, ...copy.querySelectorAll('*')]) {
      for (const attr of ['fill', 'stroke', 'href', 'mask', 'clip-path']) {
        const v = node.getAttribute(attr);
        if (v && v.includes('#')) node.setAttribute(attr, v.replace(/#(?!b-)/g, '#' + P));
      }
    }
    defs.appendChild(copy);
  }
}

// The star-fort symbol for a fortress, in the square's bottom-left corner.
function starFort(x, y, r) {
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8 - Math.PI / 2; const rr = i % 2 ? r * 0.62 : r;
    pts.push(`${(x + Math.cos(a) * rr).toFixed(2)},${(y + Math.sin(a) * rr).toFixed(2)}`);
  }
  return 'M' + pts.join('L') + 'Z';
}

// A territory's name on the board: its short name, else its name, else its town.
const nameOf = (box) => box.short || box.name || box.anchor.town;

// Build the board's <svg>. `mapSvg` is the campaign map (for its patterns).
export function buildBoardSvg(map, terrainData, mapSvg) {
  const L = boardLayout(map);
  const svg = el('svg', { viewBox: `0 0 ${L.width} ${L.height}`, class: 'board-svg', 'aria-label': 'Board' });
  const defs = el('defs', {}, svg);
  copyPatterns(mapSvg, defs);
  const terrainOf = Object.fromEntries(terrainData.types.map((t) => [t.id, t]));

  // the shapes (one rectangle per square) and their clip paths (for the owner's band)
  for (const b of map.boxes) {
    const q = L.squares[b.id];
    el('path', { id: `${P}shape-${b.id}`, d: `M${q.x},${q.y}h${q.w}v${q.h}h${-q.w}Z` }, defs);
    const clip = el('clipPath', { id: `${P}clip-${b.id}` }, defs);
    el('use', { href: `#${P}shape-${b.id}` }, clip);
  }

  // the paper
  el('rect', { width: L.width, height: L.height, class: 'board-paper' }, svg);
  el('rect', { width: L.width, height: L.height, fill: `url(#${P}pat-paper)`, class: 'board-grain' }, svg);

  // the column names along the top, and the lane names above each row
  const heads = el('g', { class: 'board-heads' }, svg);
  map.columns.forEach((c, i) => {
    text(heads, PAD + i * SQUARE_W + SQUARE_W / 2, TOP + 1, c.label, { class: 'board-col', 'text-anchor': 'middle' });
  });
  map.lanes.forEach((lane, i) => {
    text(heads, PAD + 2, L.laneTop(i) + LANE_HEAD - 3.5, `${lane.number} · ${lane.name}`, { class: 'board-lane' });
  });

  // terrain textures, under the owners' colours (the same classes as on the map)
  const terrain = el('g', { id: 'terrain' }, svg);
  for (const b of map.boxes) {
    for (const id of b.terrain) {
      const t = terrainOf[id];
      if (!t) continue;
      const href = `#${P}shape-${b.id}`;
      if (t.draw.ground) el('use', { href, fill: t.draw.ground, 'fill-opacity': t.draw.groundOpacity ?? 1, class: 'ground' }, terrain);
      if (t.draw.texture) el('use', { href, fill: `url(#${P}pat-${t.id})`, class: t.draw.season === 'autumn' ? 'texture mud-wash' : 'texture' }, terrain);
    }
  }
  el('g', { id: 'scars' }, svg);

  // the territories themselves (map.js fills them with the owner's colour)
  const terr = el('g', { id: 'territories' }, svg);
  for (const b of map.boxes) {
    const q = L.squares[b.id];
    // the anchor: where the piece stands, the middle of the square below its name
    el('use', { id: P + b.id, class: 'territory', 'data-box': b.id, 'data-x': q.x + q.w / 2, 'data-y': q.y + q.h / 2 + 5, href: `#${P}shape-${b.id}` }, terr);
  }
  el('g', { id: 'region-edges' }, svg);
  // a thin ink rule round every square
  const grid = el('g', { class: 'board-grid' }, svg);
  for (const b of map.boxes) el('use', { href: `#${P}shape-${b.id}`, class: 'board-cell' }, grid);

  // every border between neighbours (map.js draws the front line and trenches on them)
  const edges = el('g', { id: 'edges' }, svg);
  for (const b of map.boxes) {
    for (const n of b.neighbours) {
      if (b.id > n) continue;                                  // each border once
      const e = boardEdge(L.squares[b.id], L.squares[n]);
      if (!e) continue;
      const left = e.left === L.squares[b.id] ? b.id : n;
      el('path', { class: 'edge', 'data-a': b.id, 'data-b': n, 'data-left': left, d: e.d }, edges);
    }
  }
  el('g', { id: 'trenches' }, svg);
  el('g', { id: 'front' }, svg);
  el('g', { id: 'plans' }, svg);
  el('g', { id: 'selection' }, svg);

  // names, VP badges and fortress marks
  const towns = el('g', { id: 'towns' }, svg);
  for (const b of map.boxes) {
    const q = L.squares[b.id];
    const room = q.w - 8 - (b.vp ? 13 : 0);
    const name = text(towns, q.x + 4, q.y + 11, nameOf(b), { class: 'board-name' + (b.vp ? ' city' : ''), 'data-box': b.id });
    if (nameOf(b).length * 4.7 > room) {                       // squeeze a long name to fit
      name.setAttribute('textLength', room);
      name.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    }
    if (b.vp) {
      el('circle', { cx: q.x + q.w - 8.5, cy: q.y + 8.5, r: 6.2, class: 'board-vp' }, towns);
      text(towns, q.x + q.w - 8.5, q.y + 11.4, String(b.vp), { class: 'board-vp-text', 'text-anchor': 'middle' });
    }
    if (b.terrain.some((id) => terrainOf[id] && terrainOf[id].draw.badge)) {
      el('path', { d: starFort(q.x + 8, q.y + q.h - 8, 5), class: 'board-fort' }, towns);
    }
  }
  el('g', { id: 'notes' }, svg);
  return svg;
}
