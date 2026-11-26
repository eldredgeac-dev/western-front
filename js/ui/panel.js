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

// A section that opens with one tap (a <details>), for the advanced numbers: column
// shifts, territory facts, the war situation and so on. The panel is rebuilt after
// every tap, so which sections are open is remembered here by name.
const openSections = new Set();
function more(key, title, ...children) {
  const d = el('details', 'more');
  d.open = openSections.has(key);
  d.addEventListener('toggle', () => { if (d.open) openSections.add(key); else openSections.delete(key); });
  d.appendChild(el('summary', 'more-title', title));
  for (const c of children.filter(Boolean)) d.appendChild(c);
  return d;
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
// Split and merge buttons for the selected piece (RULES.md §8).
function splitMerge(u, actions) {
  const box = el('div', 'split-merge');
  if (u.split && u.split.sizes.length) {
    box.appendChild(el('span', 'split-label', 'Split off:'));
    for (const n of u.split.sizes) {
      const b = el('button', 'btn btn-small', `${n} step${n === 1 ? '' : 's'}`);
      b.type = 'button';
      b.setAttribute('aria-label', `Split ${n} step${n === 1 ? '' : 's'} off into a new piece here`);
      b.addEventListener('click', () => actions.onSplit(u.id, n));
      box.appendChild(b);
    }
  } else if (u.split && u.split.reason) {
    box.appendChild(el('span', 'split-label', `Can't split: ${u.split.reason}`));
  }
  for (const m of u.merge || []) {
    const b = el('button', 'btn btn-small', m.text);
    b.type = 'button';
    b.addEventListener('click', () => actions.onMerge(u.id, m.id));
    box.appendChild(b);
  }
  return box.childNodes.length ? box : null;
}

// The pieces in the territory, as a row of chips to tap (select one to see where it
// can go). Under the row: what the selected piece can do, and Cancel order.
// Split, merge and the unit's rules are one tap away.
function unitChips(info, onUnit, onCancelOrder, actions = {}) {
  const section = el('section', 'unit-list');
  if (!info.units.length) { section.appendChild(el('p', 'unit-hint', 'No units here.')); return section; }
  const row = el('div', 'unit-chips');
  for (const u of info.units) {
    const b = el('button', 'unit-chip');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(info.selectedUnit === u.id));
    b.setAttribute('aria-label', `${u.title}, ${u.steps} of ${u.maxSteps} steps, ${u.quality}${u.status.length ? ', ' + u.status.join(', ') : ''}`);
    b.appendChild(counterIcon(u.unit, u.look, 40));
    const text = el('span', 'chip-text');
    text.appendChild(el('strong', '', `${u.steps}/${u.maxSteps}`));
    if (u.status && u.status.length) text.appendChild(el('span', 'unit-tag', u.status[0].split(' ')[0]));
    b.appendChild(text);
    b.addEventListener('click', () => onUnit(u.id));
    row.appendChild(b);
  }
  section.appendChild(row);
  const u = info.units.find((x) => x.id === info.selectedUnit);
  if (!u) {
    section.appendChild(el('p', 'unit-hint', 'Tap a piece to see where it can go.'));
    return section;
  }
  const hint = u.moves || u.rails
    ? 'Tap brass (road) or dashed blue (rail) to move it, or red to attack.'
    : (u.why || 'This unit can\u2019t move now.');
  const line = el('p', 'unit-hint');
  line.appendChild(el('strong', 'unit-title', `${u.title}, ${u.quality.toLowerCase()}. `));
  line.appendChild(document.createTextNode(u.ordered ? `${u.ordered.text}. ${hint}` : hint));
  section.appendChild(line);
  if (u.ordered && onCancelOrder) {
    const c = el('button', 'btn btn-small', 'Cancel order');
    c.type = 'button';
    c.addEventListener('click', () => onCancelOrder(u.ordered.index));
    section.appendChild(c);
  }
  const sm = actions.onSplit ? splitMerge(u, actions) : null;
  const rule = u.rule ? el('p', 'unit-rule', u.rule) : null;
  if (sm || rule) section.appendChild(more('unit-rules', sm ? 'Split, merge and the rules' : 'The rules for this unit', rule, sm));
  return section;
}

// The war at a glance: Will, the Armistice Score and any special state.
function situationSection(sit) {
  const section = el('section', 'situation');
  section.appendChild(el('h3', 'panel-subtitle', 'The war'));
  if (sit.result) section.appendChild(el('p', 'situation-result', sit.result));
  const dl = el('dl', 'box-facts');
  for (const [name, will] of sit.will) row(dl, `${name} Will`, String(will));
  row(dl, 'Armistice Score', sit.score);
  section.appendChild(dl);
  for (const n of sit.notes) section.appendChild(el('p', 'unit-hint', n));
  return section;
}

// The last few log lines, newest first, typed like dispatches.
function dispatches(log) {
  const section = el('section', 'dispatches');
  section.appendChild(el('h3', 'panel-subtitle', 'Dispatches'));
  const list = el('ul', 'dispatch-list');
  for (const entry of log.slice(-8).reverse()) list.appendChild(el('li', '', entry.text));
  section.appendChild(list);
  return section;
}

// A typed line on the order slip: label …… value
function slipLine(parent, label, value, cls = '') {
  const line = el('div', 'slip-line ' + cls);
  line.appendChild(el('span', 'slip-label', label));
  line.appendChild(el('span', 'slip-dots'));
  line.appendChild(el('span', 'slip-value', value));
  parent.appendChild(line);
}
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `\u2212${-n}` : '0');
const pct = (p) => `${Math.round(p * 100)}%`;

// One side's steps as a row of squares, the lost ones crossed out in red (like the
// casualties set aside in Axis & Allies). `lost` may be an expected number (2.4): it's
// rounded for the picture, and the exact figure is in the words.
function lossStrip(label, steps, lost, words) {
  const row = el('div', 'loss-row');
  row.setAttribute('role', 'img');
  row.setAttribute('aria-label', `${label}: ${words}`);
  row.appendChild(el('span', 'loss-label', label));
  const pips = el('span', 'loss-pips');
  const crossed = Math.min(steps, Math.round(lost));
  for (let i = 0; i < steps; i++) pips.appendChild(el('i', 'loss-pip' + (i >= steps - crossed ? ' lost' : '')));
  row.appendChild(pips);
  row.appendChild(el('span', 'loss-words', words));
  return row;
}
// Both sides: ours and theirs.
function lossTally(ours, theirs, expected) {
  const box = el('div', 'loss-tally');
  const say = (n) => (expected ? `about ${n.toFixed(1)} lost` : `${n} lost`);
  box.appendChild(lossStrip('Ours', ours.steps, ours.lost, say(ours.lost)));
  box.appendChild(lossStrip('Theirs', theirs.steps, theirs.lost, say(theirs.lost)));
  return box;
}

// The explanation under the odds (js/engine/explain.js): the roll needed, a strip
// showing what each roll of two dice would do, why, and what would help.
function adviceBlock(a) {
  const box = el('div', 'slip-advice');
  if (a.rollLine) box.appendChild(el('p', 'slip-roll', a.rollLine));
  if (a.rolls && a.rolls.length) {
    const strip = el('div', 'dice-strip');
    strip.setAttribute('role', 'list');
    strip.setAttribute('aria-label', 'What each roll of two dice would do');
    for (const r of a.rolls) {
      const cell = el('span', 'dice-cell' + (r.taken ? ' taken' : ''));
      cell.setAttribute('role', 'listitem');
      cell.appendChild(el('span', 'dice-roll', String(r.roll)));
      cell.appendChild(el('span', 'dice-res', r.taken ? 'TAKE' : `\u2212${r.d}`));
      cell.setAttribute('aria-label', `Roll ${r.roll}: ${r.taken ? 'taken' : 'held'}; we lose ${r.a}, they lose ${r.d}`);
      strip.appendChild(cell);
    }
    box.appendChild(strip);
    box.appendChild(el('p', 'slip-hint', 'Each square is a roll of two dice: TAKE means the territory falls; otherwise the steps they lose.'));
  }
  for (const w of a.why || []) box.appendChild(el('p', 'slip-why', w));
  if (a.fixes && a.fixes.length) {
    const list = el('ul', 'slip-fixes');
    for (const f of a.fixes) list.appendChild(el('li', '', f));
    box.appendChild(list);
  }
  if (a.futileLine) box.appendChild(el('p', 'slip-note', a.futileLine));
  return box;
}

// The attack order slip (STYLE.md §6): telegram paper, typed lines, every column
// shift listed, the final odds stamped in red, and CONFIRM ORDER.
//   slip    — worked out by main.js (see attackSlip there)
//   actions — onToggleUnit(id), onMunitions(change), onConfirm(), onCancel()
function orderSlip(slip, actions) {
  const card = el('section', 'order-slip');
  card.appendChild(el('p', 'slip-kicker', slip.result ? 'ORDER CARRIED OUT' : 'ORDER OF ATTACK'));
  card.appendChild(el('h3', 'slip-title', `Objective: ${slip.targetName}`));
  card.appendChild(el('p', 'slip-defenders', slip.defenderText));

  if (!slip.result) {
    if (!slip.units.length) card.appendChild(el('p', 'slip-note', 'No unit can attack this territory now.'));
    const row = el('div', 'unit-chips');
    for (const u of slip.units) {
      const b = el('button', 'unit-chip slip-chip');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(u.chosen));
      b.setAttribute('aria-label', `${u.title}, ${u.steps} steps, ${u.chosen ? 'attacking' : 'not attacking'}`);
      b.appendChild(counterIcon(u.unit, u.look, 34));
      b.appendChild(el('strong', 'chip-text', `${u.steps}${u.chosen ? ' \u2713' : ''}`));
      b.addEventListener('click', () => actions.onToggleUnit(u.id));
      row.appendChild(b);
    }
    const mun = el('div', 'slip-munitions');
    const less = el('button', 'btn btn-small slip-step', '\u2212');
    const plus = el('button', 'btn btn-small slip-step', '+');
    less.type = plus.type = 'button';
    less.setAttribute('aria-label', 'One munition less');
    plus.setAttribute('aria-label', 'One munition more');
    less.disabled = slip.munitions <= 0;
    plus.disabled = slip.munitions >= slip.munitionsMax;
    less.addEventListener('click', () => actions.onMunitions(-1));
    plus.addEventListener('click', () => actions.onMunitions(1));
    mun.appendChild(less);
    mun.appendChild(el('span', 'slip-mun-text', `Barrage ${slip.munitions}/${slip.munitionsMax}`));
    mun.appendChild(plus);
    const forces = el('div', 'slip-forces');
    forces.appendChild(row);
    forces.appendChild(mun);
    card.appendChild(forces);
  }

  // The chance, big, with the expected losses: what you need to decide.
  if (slip.empty) {
    card.appendChild(el('p', 'slip-losses', 'No defenders: taken without a fight.'));
  } else if (slip.finalLabel && !slip.result) {
    const odds = el('div', 'slip-odds');
    odds.appendChild(el('span', 'slip-chance', pct(slip.pTake)));
    odds.appendChild(el('span', 'slip-chance-text', 'chance to take it'));
    card.appendChild(odds);
    card.appendChild(lossTally({ steps: slip.attackSteps, lost: slip.attackerLoss }, { steps: slip.defendSteps, lost: slip.defenderLoss }, true));
  }
  if (slip.warning) card.appendChild(el('p', 'slip-warning', slip.warning));
  for (const r of slip.reasons || []) card.appendChild(el('p', 'slip-note', r));
  if (!slip.result) card.appendChild(slipButtons(slip, actions));
  if (slip.cost) card.appendChild(el('p', 'slip-cost', `Cost: ${slip.cost}`));

  // Why these odds, one tap away: the ratio, every column shift, the column, the dice strip.
  if (!slip.empty && slip.ratioText && !slip.result) {
    const lines = el('div', 'slip-lines');
    slipLine(lines, 'Odds', slip.ratioText);
    for (const sh of slip.shifts) slipLine(lines, sh.label, signed(sh.value));
    const stamp = slip.finalLabel ? el('p', 'slip-stamp', `COLUMN ${slip.finalLabel}`) : null;
    card.appendChild(more('slip-why', 'Why these odds', lines, stamp, slip.advice ? adviceBlock(slip.advice) : null));
  }

  if (slip.result) {
    const res = el('div', 'slip-lines');
    for (const [label, value] of slip.result) slipLine(res, label, value);
    card.appendChild(res);
    card.appendChild(el('p', 'slip-stamp' + (slip.taken ? '' : ' failed'), slip.taken ? 'OBJECTIVE TAKEN' : 'REPULSED'));
  }

  if (slip.result) card.appendChild(slipButtons(slip, actions));
  return card;
}

// The slip's buttons: ADD TO ORDERS (until the attack is made) and Cancel / Close.
function slipButtons(slip, actions) {
  const buttons = el('div', 'slip-buttons');
  if (!slip.result) {
    const go = el('button', 'btn btn-primary', slip.confirmLabel || 'Confirm order');
    go.type = 'button';
    go.disabled = !slip.ok;
    go.addEventListener('click', () => actions.onConfirm());
    buttons.appendChild(go);
  }
  const cancel = el('button', 'btn', slip.result ? 'Close' : 'Cancel');
  cancel.type = 'button';
  cancel.addEventListener('click', () => actions.onCancel());
  buttons.appendChild(cancel);
  return buttons;
}

// The queued orders (orders, then commit): one line each, with CANCEL; a tapped
// arrow's order is highlighted. Below: what's left to spend this phase.
function ordersSection(orders, onCancel) {
  const section = el('section', 'orders');
  section.appendChild(el('h3', 'panel-subtitle', `Orders (${orders.list.length}) \u2014 tap COMMIT ORDERS to carry them out`));
  for (const o of orders.list) {
    const r = el('div', 'order-row' + (o.selected ? ' selected' : '') + (o.ok ? '' : ' bad'));
    const t = el('span', 'order-text', `${o.index + 1}. ${o.text}`);
    if (!o.ok) t.appendChild(el('span', 'order-why', `Not possible now: ${o.reason}`));
    r.appendChild(t);
    const b = el('button', 'btn btn-small', 'Cancel');
    b.type = 'button';
    b.setAttribute('aria-label', `Cancel order ${o.index + 1}`);
    b.addEventListener('click', () => onCancel(o.index));
    r.appendChild(b);
    section.appendChild(r);
  }
  if (orders.left) section.appendChild(el('p', 'orders-left', `Left to spend: ${orders.left}`));
  return section;
}

// Best attacks (js/engine/explain.js): the suggestions, each a button that opens
// the order slip with those units and that barrage.
function suggestionsSection(list, onPick) {
  const section = el('section', 'orders');
  section.appendChild(el('h3', 'panel-subtitle', 'Best attacks this phase'));
  if (!list.length) section.appendChild(el('p', 'unit-hint', 'None of your units can attack anything now.'));
  else if (list.every((o) => o.chance < 0.1)) {
    section.appendChild(el('p', 'unit-hint', 'None of these is likely to work. Next move phase, stack up to 3 units in one front territory, then attack from there.'));
  }
  for (const o of list) {
    const b = el('button', 'order-row suggestion', `${o.index + 1}. ${o.text}`);
    b.type = 'button';
    b.addEventListener('click', () => onPick(o.index));
    section.appendChild(b);
  }
  section.appendChild(el('p', 'unit-hint', 'Tap one to open its order slip. The arrows on the map show where each would come from.'));
  return section;
}

// Battle reports (js/engine/explain.js battleReport): one typed card per attack in the
// turn just played, yours and the enemy's.
function reportsSection(reports, onShow, onClose) {
  const section = el('section', 'reports');
  section.appendChild(el('h3', 'panel-subtitle', `Battle reports (${reports.length})`));
  for (const r of reports) {
    const card = el('article', 'order-slip report-card');
    card.appendChild(el('p', 'slip-kicker', 'BATTLE REPORT'));
    card.appendChild(el('h4', 'slip-title', r.title));
    if (r.tally) card.appendChild(lossTally(r.tally.ours, r.tally.theirs, false));
    for (const line of r.lines) card.appendChild(el('p', 'report-line', line));
    card.appendChild(el('p', 'slip-stamp' + (r.taken ? '' : ' failed'), r.taken ? 'OBJECTIVE TAKEN' : 'REPULSED'));
    const show = el('button', 'btn btn-small', 'Show on map');
    show.type = 'button';
    show.addEventListener('click', () => onShow(r.box));
    card.appendChild(show);
    section.appendChild(card);
  }
  const close = el('button', 'btn btn-small', 'Put the reports away');
  close.type = 'button';
  close.addEventListener('click', onClose);
  section.appendChild(close);
  return section;
}

// Show the panel. `info` is null when nothing is selected, or an object with
// everything about the tapped territory, already worked out by main.js.
//   actions.onUnit(id) — a unit in the list was tapped
//   actions.log        — the game log, shown as dispatches
//   actions.error      — a message to show (an order that wasn't allowed)
export function showPanel(container, info, terrainData, actions = {}) {
  const parts = [];
  if (actions.error) parts.push(el('p', 'panel-error', actions.error));
  if (actions.slip) parts.push(orderSlip(actions.slip, actions));
  if (actions.reports && actions.reports.length && !actions.slip) parts.push(reportsSection(actions.reports, actions.onReport, actions.onCloseReports));
  if (actions.suggestions) parts.push(suggestionsSection(actions.suggestions, actions.onSuggestion));
  if (actions.orders) parts.push(ordersSection(actions.orders, actions.onCancelOrder));
  if (!info) {
    parts.push(el('p', 'panel-hint', 'Tap a territory on the map to see its details. Pinch to zoom.'));
  } else if (!actions.slip) {
    // The tray: the name, one line of facts, and the pieces.
    parts.push(el('h2', 'box-title', info.name));
    const facts = [info.ownerName, `trench ${info.trench}`, info.vp > 0 ? `${info.vp} VP` : null,
      ...info.terrain.map((t) => t.name)].filter(Boolean);
    parts.push(el('p', 'tray-facts', facts.join(' \u00b7 ')));
    parts.push(unitChips(info, actions.onUnit || (() => {}), actions.onCancelOrder, actions));
    // Everything else about the territory, one tap away.
    const dl = el('dl', 'box-facts');
    row(dl, 'Near', info.town);
    row(dl, 'Lane', `${info.laneNumber} \u00b7 ${info.laneName}`);
    row(dl, 'Line', `${info.columnLabel} \u2013 ${info.columnName}`);
    row(dl, 'Owner', info.ownerName);
    row(dl, 'Trench', `level ${info.trench} (max ${info.trenchMax} in ${info.monthLabel})`);
    row(dl, 'Victory points', info.vp > 0 ? String(info.vp) : '\u2014');
    const terrainList = el('ul', 'terrain-list');
    if (info.terrain.length === 0) terrainList.appendChild(el('li', '', 'Plain \u2014 no effect'));
    for (const t of info.terrain) {
      const li = el('li');
      li.appendChild(el('strong', '', t.name + ': '));
      li.appendChild(document.createTextNode(t.effect));
      terrainList.appendChild(li);
    }
    row(dl, 'Terrain', terrainList);
    parts.push(more('territory', 'Territory details', dl));
  }
  const extras = [];
  if (actions.situation) extras.push(more('war', 'The war: Will and Armistice Score', situationSection(actions.situation)));
  if (actions.log && actions.log.length) extras.push(more('dispatches', 'Dispatches', dispatches(actions.log)));
  extras.push(more('legend', 'Map key', legend(terrainData)));
  for (const x of extras) x.classList.add('panel-extra');
  parts.push(...extras);
  container.replaceChildren(...parts);
}
