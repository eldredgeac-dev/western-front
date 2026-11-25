// map.js — draws the map as an SVG picture, built entirely from the data files.
// Each box is a tappable <path> whose id is the box id (like "l07-e3").
// Coast (lane 1) is at the top, Switzerland (lane 12) at the bottom,
// the Entente rear (E3) on the left and the German rear (G3) on the right.

const SVG_NS = 'http://www.w3.org/2000/svg';

// Sizes in SVG "map units". The whole picture is scaled to fit the screen.
const BOX_W = 100;      // width of one box
const BOX_H = 90;       // height of one box
const LABEL_W = 34;     // strip on the left for lane numbers
const HEADER_H = 34;    // strip on top for column names
const GAP_W = 18;       // "no man's land" between the two front lines
const MIN_BOX_PX = 48;  // a box is never drawn shorter than this on screen (easy tapping)

// Make an SVG element with some attributes.
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// Where a box's top-left corner is, in map units.
// `draw.x` is the column (0–5) and `draw.y` the row (0–11), from the data.
function boxCorner(map, box) {
  const gapColumn = map.columns.findIndex((c) => c.id === map.frontGapAfterColumn);
  const x = LABEL_W + box.draw.x * BOX_W + (box.draw.x > gapColumn ? GAP_W : 0);
  const y = HEADER_H + box.draw.y * BOX_H;
  return { x, y };
}

// A rectangle written as a path ("M = move to, h/v = line across/down, Z = close").
function rectPath(x, y, w, h) {
  return `M${x},${y} h${w} v${h} h${-w} Z`;
}

// The single fill colour for a box: the highest-priority "fill" terrain it has.
export function fillFor(box, terrainData) {
  let best = null;
  for (const id of box.terrain) {
    const t = terrainData.types.find((tt) => tt.id === id);
    if (t && t.draw.kind === 'fill' && (!best || t.draw.priority > best.draw.priority)) best = t;
  }
  return best ? best.draw.color : terrainData.plainFill;
}

// SVG <pattern>s for the "pattern" terrains (ridge hatching, open-ground waves).
// The legend in the panel reuses these by id, e.g. url(#pat-ridge).
function makePatterns(terrainData) {
  const defs = svgEl('defs');
  for (const t of terrainData.types) {
    if (t.draw.kind !== 'pattern') continue;
    const p = svgEl('pattern', {
      id: 'pat-' + t.id, patternUnits: 'userSpaceOnUse', width: 14, height: 14,
    });
    if (t.draw.pattern === 'hatch') {
      // diagonal lines
      p.appendChild(svgEl('path', {
        d: 'M-2,2 l4,-4 M0,14 l14,-14 M12,16 l4,-4',
        stroke: t.draw.color, 'stroke-width': 2.2, opacity: 0.75,
      }));
    } else {
      // gentle waves for open rolling ground
      p.appendChild(svgEl('path', {
        d: 'M0,10 q3.5,-5 7,0 t7,0', fill: 'none',
        stroke: t.draw.color, 'stroke-width': 1.8, opacity: 0.8,
      }));
    }
    defs.appendChild(p);
  }
  return defs;
}

// Draw one box: base shape (the tap target), then terrain overlays and labels.
function drawBox(map, box, terrainData, ownerColor) {
  const { x, y } = boxCorner(map, box);
  const g = svgEl('g', { class: 'map-box' });

  // The tappable base. Everything drawn on top ignores taps (CSS pointer-events),
  // so a tap anywhere in the box lands here.
  const base = svgEl('path', {
    id: box.id, d: rectPath(x, y, BOX_W, BOX_H), fill: fillFor(box, terrainData),
    class: 'box-base', tabindex: 0, role: 'button', 'data-box': box.id,
  });
  g.appendChild(base);

  for (const id of box.terrain) {
    const t = terrainData.types.find((tt) => tt.id === id);
    if (!t) continue;
    if (t.draw.kind === 'pattern') {
      g.appendChild(svgEl('path', { d: rectPath(x, y, BOX_W, BOX_H), fill: `url(#pat-${t.id})`, class: 'box-deco' }));
    } else if (t.draw.kind === 'badge') {
      // heavy inner border plus a symbol in the top-right corner
      g.appendChild(svgEl('path', {
        d: rectPath(x + 4, y + 10, BOX_W - 8, BOX_H - 14), fill: 'none',
        stroke: t.draw.color, 'stroke-width': 3, class: 'box-deco',
      }));
      const star = svgEl('text', { x: x + BOX_W - 8, y: y + 32, 'text-anchor': 'end', class: 'box-badge box-deco', fill: t.draw.color });
      star.textContent = t.draw.symbol;
      g.appendChild(star);
    }
  }

  // Owner strip along the top of the box.
  g.appendChild(svgEl('path', { d: rectPath(x, y, BOX_W, 7), fill: ownerColor, class: 'box-deco box-owner' }));

  // Named boxes show their (short) name and victory points.
  if (box.name) {
    const label = svgEl('text', { x: x + BOX_W / 2, y: y + BOX_H / 2 + 6, 'text-anchor': 'middle', class: 'box-label box-deco' });
    label.textContent = box.short || box.name;
    g.appendChild(label);
    const vp = svgEl('text', { x: x + BOX_W / 2, y: y + BOX_H - 12, 'text-anchor': 'middle', class: 'box-vp box-deco' });
    vp.textContent = box.vp + ' VP';
    g.appendChild(vp);
  }
  return g;
}

// Lane numbers down the left, column names along the top.
function drawLabels(map, svg) {
  for (const box of map.boxes) {
    const { x, y } = boxCorner(map, box);
    if (box.draw.x === 0) {
      const lane = map.lanes.find((l) => l.id === box.lane);
      const t = svgEl('text', { x: LABEL_W / 2, y: y + BOX_H / 2 + 7, 'text-anchor': 'middle', class: 'map-lane-label' });
      t.textContent = lane.number;
      svg.appendChild(t);
    }
    if (box.draw.y === 0) {
      const column = map.columns.find((c) => c.id === box.column);
      const t = svgEl('text', { x: x + BOX_W / 2, y: HEADER_H - 10, 'text-anchor': 'middle', class: 'map-col-label' });
      t.textContent = column.label;
      svg.appendChild(t);
    }
  }
}

// Build the whole map inside `container`.
//   map, terrainData, nations — the data files
//   state — the game state (who owns each box)
//   boxNameFn — gives the full name of a box (for screen readers)
//   onSelect(boxId) — called when a box is tapped
// Returns { select(boxId) } so other code can highlight a box.
export function drawMap(container, { map, terrainData, nations, state, boxNameFn, onSelect }) {
  const width = LABEL_W + map.columns.length * BOX_W + GAP_W;
  const rows = Math.max(...map.boxes.map((b) => b.draw.y)) + 1;
  const height = HEADER_H + rows * BOX_H;
  const sideColor = {};
  for (const s of nations.sides) sideColor[s.id] = s.color;

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, class: 'map-svg', role: 'group', 'aria-label': map.name });
  svg.appendChild(makePatterns(terrainData));
  for (const box of map.boxes) {
    const g = drawBox(map, box, terrainData, sideColor[state.boxes[box.id].owner]);
    g.querySelector('.box-base').setAttribute('aria-label', boxNameFn(box));
    svg.appendChild(g);
  }
  drawLabels(map, svg);

  // The highlight is one outline drawn last, so neighbours never cover it.
  const highlight = svgEl('path', { class: 'map-highlight', d: '' });
  svg.appendChild(highlight);

  container.replaceChildren(svg);

  function select(boxId) {
    const box = map.boxes.find((b) => b.id === boxId);
    if (!box) { highlight.setAttribute('d', ''); return; }
    const { x, y } = boxCorner(map, box);
    highlight.setAttribute('d', rectPath(x + 2, y + 2, BOX_W - 4, BOX_H - 4));
  }

  // One listener for the whole map: find which box was tapped.
  svg.addEventListener('click', (event) => {
    const target = event.target.closest('[data-box]');
    if (target) onSelect(target.dataset.box);
  });
  // Keyboard users: Enter or Space on a focused box selects it.
  svg.addEventListener('keydown', (event) => {
    const target = event.target.closest('[data-box]');
    if (target && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onSelect(target.dataset.box);
    }
  });

  // Size the picture: fit the map area if boxes stay big enough to tap,
  // otherwise keep boxes at least MIN_BOX_PX tall and let the map area scroll.
  // Re-runs whenever the map area changes size (fold/unfold, rotate).
  function fit() {
    const style = getComputedStyle(container);
    const availW = container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availH = container.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    if (availW <= 0) return;
    const fitWidth = availW / width;
    const fitBoth = Math.min(fitWidth, availH / height);
    const scale = Math.min(fitWidth, Math.max(fitBoth, MIN_BOX_PX / BOX_H));
    svg.style.width = Math.floor(width * scale) + 'px';
    svg.style.height = Math.floor(height * scale) + 'px';
  }
  new ResizeObserver(fit).observe(container);
  fit();

  return { select };
}
