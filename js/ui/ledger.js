// ledger.js — the War Office (docs/STYLE.md §6, "Nations screen"): a ledger page with
// ruled lines and Courier figures. For each nation: Will (an ink gauge and its trend),
// this turn's OP, munitions, replacements and rail moves, units and strength, the
// Butcher's Bill and the commander. Then the cities each side holds, the Armistice
// Score, what's happening this month, countdowns, and a small strength chart.
// Every figure comes from ledger() in js/engine/history.js.

import { shellIcons, progressBar } from './budget.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const INK = '#2B241C';
const HORIZON = '#6F8FAF';

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
function svgEl(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
const thousands = (n) => n.toLocaleString('en-GB');
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');
const RESOURCE_NAMES = { op: 'Offensive Points (OP)', munitions: 'Munitions', rp: 'Replacements (RP)', rail: 'Rail moves' };

// The Will gauge: an ink bar that drains (STYLE.md §6), with the number and trend.
function willCell(n) {
  const td = el('td', 'ledger-will');
  const gauge = el('span', 'will-gauge');
  const fill = el('span', 'will-fill');
  fill.style.width = `${Math.max(0, Math.min(100, (n.will / Math.max(n.willStart, n.will, 1)) * 100))}%`;
  gauge.appendChild(fill);
  td.appendChild(el('span', 'ledger-num', String(n.will)));
  td.appendChild(gauge);
  if (n.willChange !== null) {
    const trend = n.willChange > 0 ? '▲' : n.willChange < 0 ? '▼' : '–';
    td.appendChild(el('span', 'will-trend', n.willChange === 0 ? 'no change since last month' : `${trend} ${signed(n.willChange)} since last month`));
  }
  return td;
}

// A figure with an arrow comparing it to last month (▲ up, ▼ down).
function figureWithTrend(value, change) {
  const td = el('td', 'ledger-num');
  td.appendChild(el('span', 'ledger-num', String(value)));
  if (change !== null && change !== undefined) {
    const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '–';
    td.appendChild(el('span', 'will-trend', change === 0 ? 'same as last month' : `${arrow} ${signed(change)} since last month`));
  }
  return td;
}

// Research in progress (a bar and the month it's expected) and techs already done.
function researchCell(e, monthName) {
  const td = el('td', 'ledger-text');
  for (const r of e.research) {
    td.appendChild(el('span', 'ledger-line-tight', r.name));
    td.appendChild(progressBar(r.progress, r.cost, `${r.name}: ${r.progress} of ${r.cost}`));
    td.appendChild(el('span', 'ledger-sub', `${r.progress} / ${r.cost} IP · ${r.expected ? `expected ${monthName(r.expected)}` : 'not expected'}`));
  }
  if (e.researched.length) td.appendChild(el('span', 'ledger-sub', `Done: ${e.researched.join(', ')}`));
  if (!e.research.length && !e.researched.length) td.appendChild(el('span', 'ledger-sub', 'None in progress'));
  return td;
}

// The nations table: one column per nation, one ruled row per figure.
function nationsTable(l, monthName) {
  const wrap = el('div', 'ledger-scroll');
  const table = el('table', 'ledger-table');
  const head = el('tr');
  head.appendChild(el('th', 'ledger-rowhead', ''));
  for (const n of l.nations) head.appendChild(el('th', 'ledger-nation', n.name));
  table.appendChild(head);
  const row = (label, cell) => {
    const tr = el('tr');
    tr.appendChild(el('th', 'ledger-rowhead', label));
    for (const n of l.nations) { const c = cell(n); tr.appendChild(c instanceof Node ? c : el('td', 'ledger-num', c)); }
    table.appendChild(tr);
  };
  row('National Will', willCell);
  const eco = l.nations.some((n) => n.economy);
  if (eco) {
    // the war economy (RULES.md §19.6): Manpower and Industry with their trend
    row('Manpower (MP)', (n) => figureWithTrend(n.economy.manpower, n.economy.manpowerChange));
    row('Industry (IP)', (n) => figureWithTrend(n.economy.industry, n.economy.industryChange));
  }
  for (const key of ['op', 'munitions', 'rp', 'rail']) {
    if (key === 'munitions' && eco) {
      row('Munitions stockpile', (n) => {
        const td = el('td', 'ledger-num');
        td.appendChild(shellIcons(n.economy.stock, n.economy.stockCap));
        td.appendChild(el('span', 'ledger-sub', `${n.economy.stock} of ${n.economy.stockCap}`));
        return td;
      });
      continue;
    }
    row(RESOURCE_NAMES[key], (n) => { const r = n.resources.find((x) => x.key === key); return `${r.left} / ${r.of}`; });
  }
  if (eco) row('Research', (n) => researchCell(n.economy, monthName));
  row('Units', (n) => String(n.units));
  row('Strength (steps)', (n) => String(n.steps));
  row('Casualties this month', (n) => thousands(n.bill.month.casualties));
  row('Casualties, whole war', (n) => thousands(n.bill.total.casualties));
  row('of whom killed (about 1 in 5)', (n) => thousands(n.bill.total.killed));
  row('Commander', (n) => {
    if (!n.commander) return '—';
    const td = el('td', 'ledger-text', n.commander.name);
    if (n.commander.nickname) td.appendChild(el('span', 'ledger-sub', `“${n.commander.nickname}”`));
    return td;
  });
  row('Orders from the front', (n) => (n.cannotAttack ? el('td', 'ledger-text ledger-warn', `No attacks: ${n.cannotAttack}`) : el('td', 'ledger-text', 'Can attack')));
  wrap.appendChild(table);
  const note = el('p', 'ledger-line ledger-sub', eco
    ? 'OP, replacements and rail moves: left to spend / this month\u2019s allowance. Manpower and Industry: this month\u2019s budget. Casualties: 85,000 for every step lost.'
    : 'OP, munitions, replacements and rail moves: left to spend / this month\u2019s allowance. Casualties: 85,000 for every step lost.');
  const box = el('div');
  box.append(wrap, note);
  return box;
}

// The cities (VP) each side holds.
function citiesSection(l) {
  const s = el('section', 'ledger-section');
  s.appendChild(el('h3', 'ledger-heading', 'Cities held'));
  for (const side of l.sides) {
    const p = el('p', 'ledger-line');
    const total = side.cities.reduce((a, c) => a + c.vp, 0);
    p.appendChild(el('strong', '', `${side.name} (${total} VP): `));
    p.appendChild(document.createTextNode(side.cities.map((c) => `${c.name} ${c.vp}`).join(' · ') || 'none'));
    s.appendChild(p);
  }
  return s;
}

// The industrial cities (RULES.md §19.3): held or lost, and what that does to Industry.
function industrySection(l, nameOf) {
  const s = el('section', 'ledger-section');
  s.appendChild(el('h3', 'ledger-heading', 'Industrial cities'));
  for (const c of l.industrialCities) {
    const p = el('p', 'ledger-line');
    const effect = Object.entries(c.effects).map(([n, v]) => `${nameOf(n)} ${signed(v)} IP`).join(', ');
    p.appendChild(el('strong', c.lost ? 'ledger-warn' : '', `${c.name}: ${c.lost ? 'LOST' : 'held'}. `));
    p.appendChild(document.createTextNode(c.lost ? `${effect} a month.` : `If lost: ${effect} a month.`));
    s.appendChild(p);
  }
  return s;
}

// The Armistice Score and what it means (RULES.md §11).
function scoreSection(l) {
  const s = el('section', 'ledger-section');
  s.appendChild(el('h3', 'ledger-heading', 'Armistice Score'));
  const lead = Math.abs(l.score) <= l.margin ? 'Too close to call: if the war ended now, it would be a stalemate.'
    : l.score > 0 ? 'Germany is ahead: if the war ended now, Germany would win.' : 'The Entente is ahead: if the war ended now, the Entente would win.';
  s.appendChild(el('p', 'ledger-big', `${l.score > 0 ? '+' : ''}${l.score.toFixed(1)}`));
  s.appendChild(el('p', 'ledger-line', `${lead} The score is German Will minus the average of French and British Will, plus the VP of cities taken from the enemy. Above +${l.margin}, Germany wins; below −${l.margin}, the Entente wins.`));
  return s;
}

// What's going on: events this month, lasting effects, mutinies, attack bonuses.
function eventsSection(l, nameOf) {
  const s = el('section', 'ledger-section');
  s.appendChild(el('h3', 'ledger-heading', 'This month'));
  const lines = [];
  for (const e of l.events) lines.push(`${e.name}: ${e.text}`);
  for (const o of l.ongoing) lines.push(`${nameOf(o.nation)}: ${signed(o.value)} Will a month for ${o.left} more month${o.left === 1 ? '' : 's'}.`);
  for (const m of l.mutinies) lines.push(`${nameOf(m.nation)}: mutinies, ${m.left} more month${m.left === 1 ? '' : 's'} without attacks.`);
  for (const x of l.shifts) lines.push(`${x.label}: ${signed(x.shift)} column for ${(l.sides.find((sd) => sd.id === x.side) || {}).name || x.side} attacks.`);
  if (!lines.length) lines.push('Nothing out of the ordinary.');
  for (const t of lines) s.appendChild(el('p', 'ledger-line', t));
  return s;
}

// Countdowns.
function countdownSection(l, adjectiveOf) {
  const s = el('section', 'ledger-section');
  s.appendChild(el('h3', 'ledger-heading', 'Expected'));
  for (const c of l.countdowns) {
    let when = c.months === null ? c.note : c.months <= 0 ? 'this month' : `in ${c.months} month${c.months === 1 ? '' : 's'}`;
    if (c.key === 'reinforcements') when += ` (${c.count} ${adjectiveOf(c.nation)} unit${c.count === 1 ? '' : 's'})`;
    const p = el('p', 'ledger-line');
    p.appendChild(el('strong', '', `${c.label}: `));
    p.appendChild(document.createTextNode(when));
    s.appendChild(p);
  }
  return s;
}

// The strength chart: total steps per side, month by month. Two lines, labelled at
// their ends, with a legend; Germany dashed as well as darker, so it never relies on
// colour alone. Tap or hover to read a month.
function strengthChart(l, sides, monthName) {
  const s = el('section', 'ledger-section');
  s.appendChild(el('h3', 'ledger-heading', 'Strength on the Western Front (steps)'));
  const W = 320; const H = 150; const pad = { l: 30, r: 62, t: 10, b: 22 };
  const pts = l.series;
  const max = Math.max(10, ...pts.flatMap((p) => sides.map((x) => p[x.id] || 0)));
  const yMax = Math.ceil(max / 20) * 20;
  const x = (i) => pad.l + (pts.length > 1 ? (i / (pts.length - 1)) * (W - pad.l - pad.r) : (W - pad.l - pad.r) / 2);
  const y = (v) => pad.t + (1 - v / yMax) * (H - pad.t - pad.b);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ledger-chart', role: 'img', 'aria-label': 'Strength of each side, month by month' });
  // recessive grid and axis
  for (let v = 0; v <= yMax; v += yMax / 4) {
    svgEl('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'chart-grid' }, svg);
    svgEl('text', { x: pad.l - 4, y: y(v) + 3, class: 'chart-tick', 'text-anchor': 'end' }, svg).textContent = String(v);
  }
  const first = pts[0]; const lastP = pts[pts.length - 1];
  svgEl('text', { x: x(0), y: H - 6, class: 'chart-tick', 'text-anchor': 'start' }, svg).textContent = monthName(first.month);
  if (pts.length > 1) svgEl('text', { x: x(pts.length - 1), y: H - 6, class: 'chart-tick', 'text-anchor': 'end' }, svg).textContent = monthName(lastP.month);
  // the lines, each labelled at its end
  // first side: horizon blue, solid; second: ink, dashed (STYLE.md palette)
  const LOOKS = [{ stroke: HORIZON, dash: '' }, { stroke: INK, dash: '5 3' }];
  const lookOf = (side) => LOOKS[sides.indexOf(side) % LOOKS.length];
  for (const side of sides) {
    const look = lookOf(side);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[side.id] || 0).toFixed(1)}`).join('');
    svgEl('path', { d, class: 'chart-line', stroke: look.stroke, 'stroke-dasharray': look.dash }, svg);
    if (pts.length === 1) svgEl('circle', { cx: x(0), cy: y(lastP[side.id] || 0), r: 4, fill: look.stroke }, svg);
    svgEl('text', { x: x(pts.length - 1) + 6, y: y(lastP[side.id] || 0) + 4, class: 'chart-label' }, svg).textContent = `${side.name} ${lastP[side.id] || 0}`;
  }
  // tap / hover read-out: a rule at the nearest month and its figures
  const rule = svgEl('line', { y1: pad.t, y2: H - pad.b, class: 'chart-rule', visibility: 'hidden' }, svg);
  const readout = el('p', 'ledger-line chart-readout', 'Tap the chart to read a month.');
  const show = (evt) => {
    const r = svg.getBoundingClientRect();
    const px = ((evt.clientX - r.left) / r.width) * W;
    const i = pts.length > 1 ? Math.max(0, Math.min(pts.length - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (pts.length - 1)))) : 0;
    rule.setAttribute('x1', x(i)); rule.setAttribute('x2', x(i)); rule.setAttribute('visibility', 'visible');
    readout.textContent = `${monthName(pts[i].month)}: ` + sides.map((sd) => `${sd.name} ${pts[i][sd.id] || 0}`).join(' · ') + ' steps';
  };
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerdown', show);
  // legend (always present for two series)
  const legend = el('p', 'chart-legend');
  for (const side of sides) {
    const look = lookOf(side);
    const key = svgEl('svg', { viewBox: '0 0 24 8', width: 24, height: 8, 'aria-hidden': 'true' });
    svgEl('line', { x1: 0, x2: 24, y1: 4, y2: 4, stroke: look.stroke, 'stroke-width': 2, 'stroke-dasharray': look.dash }, key);
    const item = el('span', 'chart-key');
    item.appendChild(key);
    item.appendChild(document.createTextNode(side.name));
    legend.appendChild(item);
  }
  s.appendChild(legend);
  s.appendChild(svg);
  s.appendChild(readout);
  return s;
}

// Draw the War Office into `container`.
//   l          — ledger() from js/engine/history.js
//   monthName  — "1916-03" → "March 1916"
//   nameOf(id), adjectiveOf(id) — a nation's name ("France") and adjective ("French")
export function showLedger(container, l, { monthName, nameOf, adjectiveOf, onClose }) {
  const page = el('div', 'ledger-page');
  const top = el('div', 'ledger-top');
  const close = el('button', 'btn btn-small', '‹ The map');
  close.type = 'button';
  close.addEventListener('click', onClose);
  top.appendChild(close);
  top.appendChild(el('p', 'ledger-kicker', 'WAR OFFICE'));
  page.appendChild(top);
  page.appendChild(el('h2', 'ledger-title', `The state of the war, ${monthName(l.month)}`));
  page.appendChild(nationsTable(l, monthName));
  page.appendChild(scoreSection(l));
  page.appendChild(strengthChart(l, l.sides, monthName));
  page.appendChild(citiesSection(l));
  if (l.industrialCities && l.industrialCities.length) page.appendChild(industrySection(l, nameOf));
  page.appendChild(eventsSection(l, nameOf));
  page.appendChild(countdownSection(l, adjectiveOf));
  container.replaceChildren(page);
}
