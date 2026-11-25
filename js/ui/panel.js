// panel.js — the information panel beside (or sliding up under) the map:
// details of the tapped territory, and the terrain legend.

import { counterIcon } from './counters.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Make an HTML element with optional class and text.
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// A small square showing how a terrain type looks on the map. It reuses the map's
// own textures (url(#pat-forest) etc.), so the legend always matches the map.
function swatch(t, terrainData) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 22');
  svg.setAttribute('class', 'legend-swatch');
  svg.setAttribute('aria-hidden', 'true');
  const add = (tag, attrs) => {
    const e = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    svg.appendChild(e);
  };
  const rect = { x: 0, y: 0, width: 32, height: 22 };
  add('rect', { ...rect, fill: terrainData.plainGround });
  if (t.draw.ground) add('rect', { ...rect, fill: t.draw.ground, 'fill-opacity': t.draw.groundOpacity ?? 1 });
  if (t.draw.texture) add('rect', { ...rect, fill: `url(#pat-${t.id})` });
  if (t.draw.badge) {
    // the star-fort symbol used for fortresses on the map
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8 - Math.PI / 2; const r = i % 2 ? 4.3 : 7;
      pts.push(`${16 + Math.cos(a) * r},${11 + Math.sin(a) * r}`);
    }
    add('path', { d: 'M' + pts.join('L') + 'Z', fill: terrainData.plainGround, stroke: t.draw.color, 'stroke-width': 1.2 });
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
    const note = t.draw.season === 'autumn' ? ' (shown Sep–Nov)' : '';
    li.appendChild(el('span', '', t.name + note));
    list.appendChild(li);
  }
  box.appendChild(list);
  return box;
}

// One "label: value" row in the territory details.
function row(list, label, value) {
  list.appendChild(el('dt', '', label));
  const dd = el('dd');
  if (typeof value === 'string') dd.textContent = value;
  else dd.appendChild(value);
  list.appendChild(dd);
}

// The units in the territory: one button each (tap to select and see its moves).
function unitList(info, onUnit) {
  const section = el('section', 'unit-list');
  section.appendChild(el('h3', 'panel-subtitle', info.units.length ? 'Units here' : 'No units here'));
  for (const u of info.units) {
    const b = el('button', 'unit-row');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(info.selectedUnit === u.id));
    b.appendChild(counterIcon(u.unit, u.look));
    const text = el('span', 'unit-text');
    text.appendChild(el('strong', '', u.title));
    text.appendChild(el('span', 'unit-detail', `${u.steps} of ${u.maxSteps} steps · ${u.quality}`));
    b.appendChild(text);
    b.addEventListener('click', () => onUnit(u.id));
    section.appendChild(b);
    if (info.selectedUnit === u.id) {
      const hint = u.moves || u.rails
        ? `Can move to ${u.moves} territor${u.moves === 1 ? 'y' : 'ies'} (brass outline) or go by rail to ${u.rails} (dashed).`
        : 'This unit can\u2019t move now.';
      section.appendChild(el('p', 'unit-hint', hint));
    }
  }
  return section;
}

// Show the panel. `info` is null when nothing is selected, or an object with
// everything about the tapped territory, already worked out by main.js.
//   actions.onUnit(id) — a unit in the list was tapped
export function showPanel(container, info, terrainData, actions = {}) {
  const parts = [];
  if (!info) {
    parts.push(el('p', 'panel-hint', 'Tap a territory on the map to see its details. Pinch to zoom.'));
  } else {
    parts.push(el('h2', 'box-title', info.name));
    const dl = el('dl', 'box-facts');
    row(dl, 'Near', info.town);
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
    parts.push(unitList(info, actions.onUnit || (() => {})));
    parts.push(dl);
  }
  parts.push(legend(terrainData));
  container.replaceChildren(...parts);
}
