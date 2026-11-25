// panel.js — the information panel next to (or under) the map:
// details of the tapped box, and the terrain legend.

// Make an HTML element with optional class and text.
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// A small coloured square showing how a terrain type looks on the map.
// It reuses the map's patterns (url(#pat-ridge) etc.), so they always match.
function swatch(t, terrainData) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 28 20');
  svg.setAttribute('class', 'legend-swatch');
  svg.setAttribute('aria-hidden', 'true');
  const add = (attrs) => {
    const r = document.createElementNS(ns, 'rect');
    for (const [k, v] of Object.entries({ x: 0, y: 0, width: 28, height: 20, ...attrs })) r.setAttribute(k, v);
    svg.appendChild(r);
  };
  if (t.draw.kind === 'fill') add({ fill: t.draw.color });
  else add({ fill: terrainData.plainFill });
  if (t.draw.kind === 'pattern') add({ fill: `url(#pat-${t.id})` });
  if (t.draw.kind === 'badge') {
    add({ x: 2, y: 2, width: 24, height: 16, fill: 'none', stroke: t.draw.color, 'stroke-width': 2 });
  }
  return svg;
}

// The terrain legend: one line per terrain type in data/terrain.json.
function legend(terrainData) {
  const box = el('section', 'legend');
  box.appendChild(el('h3', 'legend-title', 'Terrain'));
  const list = el('ul', 'legend-list');
  for (const t of terrainData.types) {
    const li = el('li', 'legend-item');
    li.appendChild(swatch(t, terrainData));
    li.appendChild(el('span', '', t.name + (t.draw.kind === 'badge' ? ' ' + t.draw.symbol : '')));
    list.appendChild(li);
  }
  const plain = el('li', 'legend-item');
  plain.appendChild(swatch({ id: 'plain', draw: { kind: 'fill', color: terrainData.plainFill } }, terrainData));
  plain.appendChild(el('span', '', 'Plain (no terrain effect)'));
  list.appendChild(plain);
  box.appendChild(list);
  return box;
}

// One "label: value" row in the box details.
function row(list, label, value) {
  list.appendChild(el('dt', '', label));
  const dd = el('dd');
  if (typeof value === 'string') dd.textContent = value;
  else dd.appendChild(value);
  list.appendChild(dd);
}

// Show the panel. `info` is null when nothing is selected, or an object with
// everything about the tapped box, already worked out by main.js.
export function showPanel(container, info, terrainData) {
  const parts = [];
  if (!info) {
    parts.push(el('p', 'panel-hint', 'Tap a box on the map to see its details.'));
  } else {
    parts.push(el('h2', 'box-title', info.name));
    const dl = el('dl', 'box-facts');
    row(dl, 'Lane', `${info.laneNumber} · ${info.laneName}`);
    row(dl, 'Line', `${info.columnLabel} – ${info.columnName}`);
    row(dl, 'Owner', info.ownerName);
    row(dl, 'Trench', `level ${info.trench} (max ${info.trenchMax} in ${info.monthLabel})`);
    row(dl, 'Victory points', info.vp > 0 ? String(info.vp) : '—');
    const terrainList = el('ul', 'terrain-list');
    if (info.terrain.length === 0) terrainList.appendChild(el('li', '', 'Plain — no effect'));
    for (const t of info.terrain) {
      const li = el('li');
      li.appendChild(el('strong', '', t.name + ': '));
      li.appendChild(document.createTextNode(t.effect));
      terrainList.appendChild(li);
    }
    row(dl, 'Terrain', terrainList);
    parts.push(dl);
  }
  parts.push(legend(terrainData));
  container.replaceChildren(...parts);
}
