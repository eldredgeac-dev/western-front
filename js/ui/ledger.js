// ledger.js — the War Office's Nations screen (docs/STYLE.md §6): a ledger page with
// ruled lines and Courier figures. At the top the Armistice Score, who's winning and
// why, and the countdowns. Then one page per nation (swipe sideways): Will (an ink
// gauge, its trend and a small chart), Manpower, Industry and the stockpile, OP and
// rail moves, units and strength, VP cities, the Butcher's Bill, the commander, and
// everything in effect with a one-line explanation. Then the strength chart, the
// cities, the industrial cities and what's happening this month.
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
  // drawn full width and squeezed with a transform (animating width is slow on a phone)
  fill.style.transform = `scaleX(${Math.max(0, Math.min(1, n.will / Math.max(n.willStart, n.will, 1))).toFixed(4)})`;
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

// One nation's page: a ruled table of its figures (Will with its gauge and chart,
// the economy, OP and rail, units, cities, casualties, commander), then everything
// affecting it now, each with a one-line explanation.
function nationPage(n, l, monthName, nameOf) {
  const page = el('section', 'nation-page');
  page.id = `nation-${n.id}`;
  page.setAttribute('role', 'tabpanel');
  page.setAttribute('aria-label', n.name);
  page.appendChild(el('h3', 'nation-name', n.name));
  const table = el('table', 'ledger-table nation-table');
  const row = (label, cell) => {
    const tr = el('tr');
    tr.appendChild(el('th', 'ledger-rowhead', label));
    tr.appendChild(cell instanceof Node ? cell : el('td', 'ledger-num', cell));
    table.appendChild(tr);
  };
  const side = l.sides.find((x) => x.id === n.side);
  if (n.will !== null) {
    row('National Will', willCell(n));
    // the Will chart gets a whole row, so it's big enough to read on a phone
    const tr = el('tr');
    const td = el('td', 'will-chart-cell');
    td.colSpan = 2;
    td.appendChild(willChart(n.willSeries, monthName));
    tr.appendChild(td);
    table.appendChild(tr);
    if (n.economy) {
      row('Manpower (MP)', figureWithTrend(n.economy.manpower, n.economy.manpowerChange));
      row('Industry (IP)', figureWithTrend(n.economy.industry, n.economy.industryChange));
      const td = el('td', 'ledger-num');
      td.appendChild(shellIcons(n.economy.stock, n.economy.stockCap));
      td.appendChild(el('span', 'ledger-sub', `${n.economy.stock} of ${n.economy.stockCap}`));
      row('Munitions stockpile', td);
    }
    for (const key of n.economy ? ['op', 'rail'] : ['op', 'munitions', 'rp', 'rail']) {
      const r = n.resources.find((x) => x.key === key);
      row(RESOURCE_NAMES[key], `${r.left} left of ${r.of}`);
    }
    if (n.economy) row('Research', researchCell(n.economy, monthName));
  } else {
    row('National Will', el('td', 'ledger-text', `None of its own: its losses count against ${nameOf(n.countsAgainst)}.`));
  }
  row('Units', String(n.units));
  row('Strength (steps)', String(n.steps));
  if (side) {
    const total = side.cities.reduce((t, c) => t + c.vp, 0);
    const td = el('td', 'ledger-text');
    td.appendChild(el('span', 'ledger-num', `${total} VP`));
    td.appendChild(el('span', 'ledger-sub', `${side.name}: ${side.cities.map((c) => `${c.name} ${c.vp}`).join(' · ') || 'none'}`));
    row('VP cities held', td);
  }
  row('Casualties this month', thousands(n.bill.month.casualties));
  row('Casualties, whole war', thousands(n.bill.total.casualties));
  row('of whom killed (about 1 in 5)', thousands(n.bill.total.killed));
  if (n.commander) {
    const td = el('td', 'ledger-text', n.commander.name);
    if (n.commander.nickname) td.appendChild(el('span', 'ledger-sub', `“${n.commander.nickname}”`));
    row('Commander', td);
  }
  row('Orders from the front', n.cannotAttack ? el('td', 'ledger-text ledger-warn', `No attacks: ${n.cannotAttack}`) : el('td', 'ledger-text', 'Can attack'));
  page.appendChild(table);
  page.appendChild(effectsList(n.effects));
  return page;
}

// Everything affecting a nation now: on first, then still to come, then over.
const STATUS = { active: 'NOW', coming: 'COMING', ended: 'OVER' };
function effectsList(effects) {
  const box = el('div', 'nation-effects');
  box.appendChild(el('h4', 'nation-effects-head', 'In effect'));
  const order = ['active', 'coming', 'ended'];
  const sorted = [...effects].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  if (!sorted.length) box.appendChild(el('p', 'ledger-line', 'Nothing out of the ordinary.'));
  for (const x of sorted) {
    const p = el('p', `ledger-line effect effect-${x.status}`);
    p.appendChild(el('span', 'effect-tag', STATUS[x.status]));
    p.appendChild(el('strong', '', `${x.name}. `));
    p.appendChild(document.createTextNode(x.text));
    box.appendChild(p);
  }
  return box;
}

// A small Will-over-time chart for one nation: an ink line, the start and the end
// labelled. Tap it to read a month (in the line under it).
function willChart(series, monthName) {
  const wrap = el('div', 'will-chart-wrap');
  const W = 300; const H = 84; const pad = { l: 26, r: 8, t: 8, b: 16 };
  const max = Math.max(10, ...series.map((p) => p.will));
  const yMax = Math.ceil(max / 20) * 20;
  const yMin = Math.min(0, ...series.map((p) => p.will));
  const x = (i) => pad.l + (series.length > 1 ? (i / (series.length - 1)) * (W - pad.l - pad.r) : (W - pad.l - pad.r));
  const y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'will-chart', role: 'img', 'aria-label': 'National Will, month by month' });
  for (const v of [yMin, yMax]) {
    svgEl('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'chart-grid' }, svg);
    svgEl('text', { x: pad.l - 3, y: y(v) + 3, class: 'chart-tick', 'text-anchor': 'end' }, svg).textContent = String(v);
  }
  svgEl('text', { x: pad.l, y: H - 2, class: 'chart-tick' }, svg).textContent = monthName(series[0].month);
  if (series.length > 1) svgEl('text', { x: W - pad.r, y: H - 2, class: 'chart-tick', 'text-anchor': 'end' }, svg).textContent = monthName(series[series.length - 1].month);
  const d = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.will).toFixed(1)}`).join('');
  svgEl('path', { d, class: 'chart-line', stroke: INK }, svg);
  const last = series[series.length - 1];
  svgEl('circle', { cx: x(series.length - 1), cy: y(last.will), r: 3, fill: INK }, svg);
  svgEl('text', { x: x(series.length - 1) - 4, y: y(last.will) - 6, class: 'chart-label', 'text-anchor': 'end' }, svg).textContent = String(last.will);
  const readout = el('span', 'ledger-sub will-readout', 'Will, month by month. Tap the chart to read a month.');
  const show = (evt) => {
    const r = svg.getBoundingClientRect();
    const px = ((evt.clientX - r.left) / r.width) * W;
    const i = series.length > 1 ? Math.max(0, Math.min(series.length - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (series.length - 1)))) : 0;
    readout.textContent = `${monthName(series[i].month)}: Will ${series[i].will}`;
  };
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointermove', show);
  wrap.append(svg, readout);
  return wrap;
}

// The nation pages: a row of name tabs and the pages side by side, swiped sideways
// (CSS scroll-snap). Tapping a tab scrolls to its page; the tab of the page in view
// is underlined.
function nationPages(l, monthName, nameOf) {
  const box = el('section', 'ledger-section nations');
  const nations = [...l.nations, ...(l.others || [])];
  const tabs = el('div', 'nation-tabs');
  tabs.setAttribute('role', 'tablist');
  const strip = el('div', 'nation-strip');
  const buttons = [];
  for (const n of nations) {
    const b = el('button', 'btn btn-small nation-tab', n.name);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', `nation-${n.id}`);
    b.addEventListener('click', () => {
      const page = strip.querySelector(`#nation-${n.id}`);
      strip.scrollTo({ left: page.offsetLeft - strip.offsetLeft, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
    buttons.push(b);
    tabs.appendChild(b);
    strip.appendChild(nationPage(n, l, monthName, nameOf));
  }
  // underline the tab of the page in view, and fit the strip to that page's height
  // (otherwise a short page sits above a gap as tall as the longest page)
  const mark = () => {
    const i = Math.min(buttons.length - 1, Math.round(strip.scrollLeft / Math.max(1, strip.clientWidth)));
    buttons.forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
    const page = strip.children[i];
    if (page && page.offsetHeight) strip.style.height = `${page.offsetHeight}px`;
  };
  let queued = false;
  strip.addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; mark(); }); } }, { passive: true });
  box.append(tabs, strip);
  requestAnimationFrame(mark);   // once the page is on screen and has a height
  // folding or unfolding the phone changes the pages' heights: fit again
  if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(() => mark()); for (const p of strip.children) ro.observe(p); }
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

// The Armistice Score, who's winning and why, and what it means (RULES.md §11).
function scoreSection(l) {
  const s = el('section', 'ledger-section');
  s.appendChild(el('h3', 'ledger-heading', 'Armistice Score'));
  s.appendChild(el('p', 'ledger-big', `${l.score > 0 ? '+' : l.score < 0 ? '−' : '±'}${Math.abs(l.score).toFixed(1)}`));
  s.appendChild(el('p', 'ledger-line ledger-reason', l.reason));
  s.appendChild(el('p', 'ledger-line ledger-sub', `If the war ended now: above +${l.margin} Germany wins, below −${l.margin} the Entente wins, in between a stalemate peace. The score is German Will minus the average of French and British Will, plus the VP of cities taken from the enemy.`));
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

// Countdowns: "US troops expected: 7 months", the Kaiserschlacht deadline …
function countdownSection(l, adjectiveOf) {
  const s = el('section', 'ledger-section');
  s.appendChild(el('h3', 'ledger-heading', 'Countdowns'));
  for (const c of l.countdowns) {
    let when = c.months === null ? c.note
      : c.months <= 0 ? 'this month' : `${c.months} month${c.months === 1 ? '' : 's'}`;
    if (c.months !== null && c.note) when = `${when} (${c.note})`;
    if (c.key === 'reinforcements') when += ` (${c.count} ${adjectiveOf(c.nation)} unit${c.count === 1 ? '' : 's'})`;
    const p = el('p', 'ledger-line');
    p.appendChild(el('strong', '', `${c.label}: `));
    p.appendChild(el('span', 'ledger-num', when));
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
  top.appendChild(el('p', 'ledger-kicker', 'WAR OFFICE · NATIONS'));
  page.appendChild(top);
  page.appendChild(el('h2', 'ledger-title', `The state of the war, ${monthName(l.month)}`));
  page.appendChild(scoreSection(l));
  page.appendChild(countdownSection(l, adjectiveOf));
  page.appendChild(nationPages(l, monthName, nameOf));
  page.appendChild(strengthChart(l, l.sides, monthName));
  page.appendChild(citiesSection(l));
  if (l.industrialCities && l.industrialCities.length) page.appendChild(industrySection(l, nameOf));
  page.appendChild(eventsSection(l, nameOf));
  container.replaceChildren(page);
}
