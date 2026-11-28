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
const COL_W = 61;          // a territory's usual width (west to east)
const LANE_H = 70;         // a lane's usual height (north to south)
const SIDE = 19;           // the margin left and right (the region names stand there)
const TOP = 54;            // the sea and the Netherlands above lane 1
const BOTTOM = 40;         // Switzerland below the last lane
export const BOARD_PIECE = 38;   // a piece's width (map.js pieceSize)

// The shape of the front (Axis & Allies style: real geography, stretched so every
// territory is big enough to tap). North is at the top, the Entente on the left.
// `bow` bends a lane's borders east (+) or west (−): the Ypres salient pushes into the
// German side; the Noyon salient (the "Germans at Noyon", 80 km from Paris) and the
// St-Mihiel salient push into the French side. `shift` moves a whole lane boundary,
// so the front runs in a gentle S like the real one. Lanes are matched by number.
const BOW = { 2: 16, 3: 4, 6: -4, 7: -18, 8: -6, 9: 4, 11: -14 };
// Lane heights (× LANE_H): wider sectors are a little taller, so the shapes vary.
const HEIGHT = { 1: 0.92, 2: 1.02, 3: 0.96, 4: 1.0, 5: 0.94, 6: 1.08, 7: 1.1, 8: 1.0, 9: 1.02, 10: 0.92, 11: 1.08, 12: 0.96 };
const SHIFT = [6, 4, 2, 0, -2, -6, -10, -6, 0, 6, 8, 4, 0];

// Region names, lettered faintly down the margins like a period map. They stand
// outside the territories, so they never cover a piece or a name. `lanes` is the
// first and last lane (by number); `side` is the margin (west = French side).
const REGIONS = [
  { name: 'FLANDERS', lanes: [1, 3], side: 'west' },
  { name: 'ARTOIS', lanes: [4, 5], side: 'west' },
  { name: 'PICARDY', lanes: [6, 8], side: 'west' },
  { name: 'CHAMPAGNE', lanes: [9, 9], side: 'west' },
  { name: 'ARGONNE', lanes: [10, 10], side: 'west' },
  { name: 'LORRAINE', lanes: [11, 12], side: 'west' },
  { name: 'ALSACE', lanes: [12, 12], side: 'east' },
];

// Rivers drawn across lanes (thin blue lines, under the pieces). `at` is how far down
// the lane (0 = top, 1 = bottom); `from`/`to` are column indexes (0 = E3 … 5 = G3).
const RIVERS = [
  { lane: 1, at: 0.82, from: 1.6, to: 2.9, name: 'Yser' },
  { lane: 6, at: 0.86, from: 0, to: 6, name: 'Somme' },
  { lane: 8, at: 0.84, from: 0.6, to: 6, name: 'Aisne' },
  { lane: 9, at: 0.88, from: 0, to: 2.2, name: 'Marne' },
];

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

// A repeatable "random" number from −1 to 1 for a key (so the board looks the same
// every time). This is only for drawing, never for the game: game rolls use rng.js.
function wobble(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 2001) / 1000 - 1;
}
const r1 = (v) => Math.round(v * 10) / 10;

// A gently wavy line from point a to point b: `bow` bends its middle sideways, and two
// small waves make it look hand-drawn. Returns a list of points.
function wavyLine(a, b, bow, key) {
  const n = 10;
  const dx = b[0] - a[0]; const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len; const ny = dx / len;           // sideways, at right angles
  const p1 = wobble(key + 'p') * Math.PI; const p2 = wobble(key + 'q') * Math.PI;
  const amp = 2.6;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const ends = Math.sin(Math.PI * t);                 // 0 at both ends, so corners meet
    const off = bow * ends + amp * ends * (Math.sin(2 * Math.PI * t + p1) * 0.7 + Math.sin(5 * Math.PI * t + p2) * 0.3);
    pts.push([r1(a[0] + dx * t + nx * off), r1(a[1] + dy * t + ny * off)]);
  }
  return pts;
}
const toPath = (pts) => 'M' + pts.map((p) => p.join(',')).join('L');

// How much a column border bends in a lane: the front (between E1 and G1) bends fully,
// the borders next to it a little less, so no territory gets squeezed.
function bowFor(laneNumber, colBorder, nCols) {
  const fromFront = Math.abs(colBorder - nCols / 2);   // 0 on the front, 3 at the edge
  const share = [1, 0.8, 0.6, 0.4][fromFront] ?? 0.4;
  return (BOW[laneNumber] || 0) * share;
}

// The whole board's geometry: the corner points, every border as a wavy line, and
// each territory's outline and anchor (where its piece stands).
export function boardLayout(map) {
  const nL = map.lanes.length; const nC = map.columns.length;
  const width = SIDE * 2 + nC * COL_W;
  // where each lane border is (north to south)
  const laneY = [TOP];
  map.lanes.forEach((lane) => laneY.push(laneY[laneY.length - 1] + LANE_H * (HEIGHT[lane.number] || 1)));
  const height = laneY[nL] + BOTTOM;
  // corner[i][j]: where lane border i (0 = top of lane 1) meets column border j
  const corner = [];
  for (let i = 0; i <= nL; i++) {
    corner.push([]);
    for (let j = 0; j <= nC; j++) {
      const outer = j === 0 || j === nC;               // keep the outside edge steady
      const jx = outer ? wobble(`x${i}-${j}`) * 1 : wobble(`x${i}-${j}`) * 8;
      const jy = i === 0 || i === nL ? wobble(`y${i}-${j}`) * 3 : wobble(`y${i}-${j}`) * 9;
      const shift = outer ? 0 : (SHIFT[i] || 0);       // the outside edge stays straight
      corner[i].push([r1(SIDE + j * COL_W + shift + jx), r1(laneY[i] + jy)]);
    }
  }
  // The coast: lane 1's top border dips towards the sea on the west (Dunkirk, Calais).
  for (let j = 0; j <= nC; j++) corner[0][j][1] = r1(corner[0][j][1] + (nC - j) * 2.2);

  // every border, drawn once and shared by the two territories on either side
  const vert = {};   // `${lane}-${j}`: the border on column border j, north to south
  const horiz = {};  // `${i}-${col}`: the border on lane border i, west to east
  map.lanes.forEach((lane, li) => {
    for (let j = 0; j <= nC; j++) {
      const outer = j === 0 || j === nC;
      vert[`${li}-${j}`] = wavyLine(corner[li][j], corner[li + 1][j], outer ? 0 : -bowFor(lane.number, j, nC), `v${li}-${j}`);
    }
  });
  for (let i = 0; i <= nL; i++) {
    for (let c = 0; c < nC; c++) {
      horiz[`${i}-${c}`] = wavyLine(corner[i][c], corner[i][c + 1], 0, `h${i}-${c}`);
    }
  }

  const laneIndex = Object.fromEntries(map.lanes.map((l, i) => [l.id, i]));
  const colIndex = Object.fromEntries(map.columns.map((c, i) => [c.id, i]));
  const cells = {};
  for (const b of map.boxes) {
    const li = laneIndex[b.lane]; const ci = colIndex[b.column];
    // walk round the outline: top (west→east), east side (north→south),
    // bottom (east→west), west side (south→north)
    const top = horiz[`${li}-${ci}`]; const east = vert[`${li}-${ci + 1}`];
    const bottom = [...horiz[`${li + 1}-${ci}`]].reverse(); const west = [...vert[`${li}-${ci}`]].reverse();
    const ring = [...top, ...east.slice(1), ...bottom.slice(1), ...west.slice(1, -1)];
    // the anchor: halfway between the west and east borders at their middles, and
    // halfway between the top and bottom borders (then a little lower: the name is above)
    const wm = vert[`${li}-${ci}`][5]; const em = vert[`${li}-${ci + 1}`][5];
    const tm = horiz[`${li}-${ci}`][5]; const bm = horiz[`${li + 1}-${ci}`][5];
    const cx = (wm[0] + em[0]) / 2;
    const cy = (tm[1] + bm[1]) / 2;
    const topY = (top[0][1] + top[top.length - 1][1]) / 2;
    cells[b.id] = { lane: li, col: ci, ring, cx: r1(cx), cy: r1(cy + 6), topY: r1(topY), top };
  }
  return { cells, corner, vert, horiz, width, height, nL, nC };
}

// The border between two neighbouring territories, as a path, and which box is on its
// "left" (map.js draws each side's trenches on that box's side; walking along the
// path, the left box is on your left). Null if they don't touch on the board.
export function boardEdge(L, a, b) {
  if (a.lane === b.lane && Math.abs(a.col - b.col) === 1) {
    const [w, e] = a.col < b.col ? [a, b] : [b, a];
    // drawn from north to south: the east territory is on the left
    return { d: toPath(L.vert[`${w.lane}-${w.col + 1}`]), left: e };
  }
  if (a.col === b.col && Math.abs(a.lane - b.lane) === 1) {
    const [n, s] = a.lane < b.lane ? [a, b] : [b, a];
    // drawn from west to east: the north territory is on the left
    return { d: toPath(L.horiz[`${s.lane}-${n.col}`]), left: n };
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

// The sea, the neutral countries and the rivers round the territories (scenery only).
function drawScenery(svg, L) {
  const g = el('g', { class: 'board-scenery' }, svg);
  const top = L.horiz; const nC = L.nC;
  // the coastline: along the top of lane 1, west of Bruges–Ghent's eastern edge
  const coast = [];
  for (let c = 0; c < nC; c++) coast.push(...(c ? top[`0-${c}`].slice(1) : top[`0-${c}`]));
  const splitX = L.corner[0][nC - 1][0];               // the Dutch border, north of G3
  const sea = coast.filter((p) => p[0] <= splitX + 0.1);
  const west = L.vert['0-0'];                          // Channel Ports' west side: the coast
  const seaPath = toPath([[0, 0], [splitX + 22, 0], [splitX, 18], ...sea.reverse(), ...west.slice(1), [0, west[west.length - 1][1] + 6]]) + 'Z';
  el('path', { d: seaPath, class: 'board-sea' }, g);
  el('path', { d: seaPath, fill: `url(#${P}pat-sea)`, class: 'board-sea-hatch' }, g);
  const dutch = coast.filter((p) => p[0] >= splitX - 0.1);
  el('path', { d: toPath([[splitX + 22, 0], [L.width, 0], ...dutch.reverse(), [splitX, 18]]) + 'Z', class: 'board-neutral' }, g);
  text(g, 70, 22, 'NORTH SEA', { class: 'board-sea-name' });
  text(g, L.width - 8, 16, 'NETHERLANDS', { class: 'board-neutral-name', 'text-anchor': 'end' });
  text(g, L.width - 8, 26, '(neutral)', { class: 'board-neutral-note', 'text-anchor': 'end' });
  // Switzerland, below the last lane
  const last = [];
  for (let c = 0; c < nC; c++) last.push(...(c ? top[`${L.nL}-${c}`].slice(1) : top[`${L.nL}-${c}`]));
  el('path', { d: toPath([[0, last[0][1]], ...last, [L.width, last[last.length - 1][1]], [L.width, L.height], [0, L.height]]) + 'Z', class: 'board-neutral' }, g);
  text(g, L.width / 2, L.height - 14, 'SWITZERLAND (neutral)', { class: 'board-neutral-name', 'text-anchor': 'middle' });
}

// The region names down the margins (see REGIONS).
function drawRegions(svg, L, map) {
  const g = el('g', { class: 'board-regions' }, svg);
  const yOf = (n) => L.corner[map.lanes.findIndex((l) => l.number === n)];
  for (const r of REGIONS) {
    const top = yOf(r.lanes[0]); const bottom = yOf(r.lanes[1] + 1) || L.corner[L.nL];
    if (!top) continue;
    const y0 = top[0][1]; const y1 = bottom[0][1];
    const mid = (y0 + y1) / 2; const room = y1 - y0 - 14;
    const x = r.side === 'west' ? SIDE / 2 + 4.4 : L.width - SIDE / 2 - 4.4;
    const t = text(g, r1(x), r1(mid), r.name, {
      class: 'board-region', 'text-anchor': 'middle',
      transform: `rotate(${r.side === 'west' ? -90 : 90} ${r1(x)} ${r1(mid)})`,
    });
    if (r.name.length * 11.5 > room) {              // squeeze a long name into its lanes
      t.setAttribute('textLength', r1(room));
      t.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    }
  }
}

// Rivers as thin blue wavy lines across their lane.
function drawRivers(svg, L, map) {
  const g = el('g', { class: 'board-rivers' }, svg);
  for (const r of RIVERS) {
    const li = map.lanes.findIndex((l) => l.number === r.lane);
    if (li < 0) continue;
    const at = (col) => {                       // a point on the lane at column position col
      const j = Math.min(Math.floor(col), L.nC - 1); const f = col - j;
      const a = L.corner[li][j]; const b = L.corner[li][j + 1];
      const c = L.corner[li + 1][j]; const d = L.corner[li + 1][j + 1];
      const x = (a[0] * (1 - f) + b[0] * f) * (1 - r.at) + (c[0] * (1 - f) + d[0] * f) * r.at;
      const y = (a[1] * (1 - f) + b[1] * f) * (1 - r.at) + (c[1] * (1 - f) + d[1] * f) * r.at;
      return [x, y];
    };
    const pts = [];
    for (let k = 0; k <= 24; k++) {
      const [x, y] = at(r.from + ((r.to - r.from) * k) / 24);
      pts.push([r1(x), r1(y + Math.sin(k * 1.3 + r.lane) * 1.6)]);
    }
    el('path', { d: toPath(pts), class: 'board-river' }, g);
    const mid = pts[Math.round(pts.length * 0.3)];
    text(g, mid[0], mid[1] - 2.5, r.name, { class: 'board-river-name', 'text-anchor': 'middle' });
  }
}

// Build the board's <svg>. `mapSvg` is the campaign map (for its patterns).
export function buildBoardSvg(map, terrainData, mapSvg) {
  const L = boardLayout(map);
  const svg = el('svg', { viewBox: `0 0 ${L.width} ${L.height}`, class: 'board-svg', 'aria-label': 'Board' });
  const defs = el('defs', {}, svg);
  copyPatterns(mapSvg, defs);
  const terrainOf = Object.fromEntries(terrainData.types.map((t) => [t.id, t]));

  // the shapes (one outline per territory) and their clip paths (for the owner's band)
  for (const b of map.boxes) {
    el('path', { id: `${P}shape-${b.id}`, d: toPath(L.cells[b.id].ring) + 'Z' }, defs);
    const clip = el('clipPath', { id: `${P}clip-${b.id}` }, defs);
    el('use', { href: `#${P}shape-${b.id}` }, clip);
  }

  // the paper, then the sea and the neutral countries
  el('rect', { width: L.width, height: L.height, class: 'board-paper' }, svg);
  el('rect', { width: L.width, height: L.height, fill: `url(#${P}pat-paper)`, class: 'board-grain' }, svg);
  drawScenery(svg, L);
  drawRegions(svg, L, map);

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
    const q = L.cells[b.id];
    el('use', { id: P + b.id, class: 'territory', 'data-box': b.id, 'data-x': q.cx, 'data-y': q.cy, href: `#${P}shape-${b.id}` }, terr);
  }
  el('g', { id: 'region-edges' }, svg);
  drawRivers(svg, L, map);
  // a firm ink border round every territory, like a board game's map
  const grid = el('g', { class: 'board-grid' }, svg);
  for (const b of map.boxes) el('use', { href: `#${P}shape-${b.id}`, class: 'board-cell' }, grid);

  // every border between neighbours (map.js draws the front line and trenches on them)
  const edges = el('g', { id: 'edges' }, svg);
  for (const b of map.boxes) {
    for (const n of b.neighbours) {
      if (b.id > n) continue;                                  // each border once
      const e = boardEdge(L, L.cells[b.id], L.cells[n]);
      if (!e) continue;
      const left = e.left === L.cells[b.id] ? b.id : n;
      el('path', { class: 'edge', 'data-a': b.id, 'data-b': n, 'data-left': left, d: e.d }, edges);
    }
  }
  el('g', { id: 'trenches' }, svg);
  el('g', { id: 'front' }, svg);
  el('g', { id: 'plans' }, svg);
  el('g', { id: 'selection' }, svg);

  // names (centred near the top, in small capitals), VP roundels and fortress marks
  const towns = el('g', { id: 'towns' }, svg);
  for (const b of map.boxes) {
    const q = L.cells[b.id];
    // the name and (for a city) its VP roundel, centred together near the top
    const room = COL_W - 12 - (b.vp ? 15 : 0);              // the most the name may take
    const width = Math.min(room, nameOf(b).length * 5.6);   // about how wide it is
    const total = width + (b.vp ? 15 : 0);
    const nx = q.cx - total / 2; const ny = q.topY + 14;
    const name = text(towns, r1(nx + width / 2), ny, nameOf(b), { class: 'board-name' + (b.vp ? ' city' : ''), 'data-box': b.id, 'text-anchor': 'middle' });
    if (nameOf(b).length * 5.6 > room) {                    // squeeze a long name to fit
      name.setAttribute('textLength', r1(room));
      name.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    }
    if (b.vp) {
      const vx = nx + width + 8.5; const vy = ny - 3.4;
      el('circle', { cx: r1(vx), cy: r1(vy), r: 6.4, class: 'board-vp' }, towns);
      text(towns, r1(vx), r1(vy + 2.9), String(b.vp), { class: 'board-vp-text', 'text-anchor': 'middle' });
    }
    if (b.terrain.some((id) => terrainOf[id] && terrainOf[id].draw.badge)) {
      el('path', { d: starFort(q.cx - 22, q.cy + 16, 5), class: 'board-fort' }, towns);
    }
  }
  el('g', { id: 'notes' }, svg);
  return svg;
}
