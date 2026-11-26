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
function unitList(info, onUnit, onCancelOrder) {
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
    if (u.status && u.status.length) {
      const tags = el('span', 'unit-tags');
      for (const t of u.status) tags.appendChild(el('span', 'unit-tag', t));
      text.appendChild(tags);
    }
    b.appendChild(text);
    if (u.ordered) text.appendChild(el('span', 'unit-detail', u.ordered.text));
    b.addEventListener('click', () => onUnit(u.id));
    section.appendChild(b);
    if (info.selectedUnit === u.id) {
      const hint = u.moves || u.rails
        ? `By road to ${u.moves} territor${u.moves === 1 ? 'y' : 'ies'} (brass outline), or by rail to ${u.rails} (blue dashed).`
        : (u.why || 'This unit can\u2019t move now.');
      section.appendChild(el('p', 'unit-hint', u.ordered ? `${hint} Tap one to change its order.` : hint));
      if (u.rule) section.appendChild(el('p', 'unit-rule', u.rule));
      if (u.ordered && onCancelOrder) {
        const c = el('button', 'btn btn-small', 'Cancel order');
        c.type = 'button';
        c.addEventListener('click', () => onCancelOrder(u.ordered.index));
        section.appendChild(c);
      }
    }
  }
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
    card.appendChild(el('p', 'slip-section', 'Attacking units (tap to add or remove):'));
    if (!slip.units.length) card.appendChild(el('p', 'slip-note', 'No unit can attack this territory now.'));
    for (const u of slip.units) {
      const b = el('button', 'slip-unit');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(u.chosen));
      b.appendChild(counterIcon(u.unit, u.look, 34));
      b.appendChild(el('span', '', `${u.title} \u00b7 ${u.steps} steps ${u.chosen ? '\u2014 ATTACKING' : ''}`));
      b.addEventListener('click', () => actions.onToggleUnit(u.id));
      card.appendChild(b);
    }
    const mun = el('div', 'slip-munitions');
    const less = el('button', 'btn btn-small slip-step', '\u2212');
    const more = el('button', 'btn btn-small slip-step', '+');
    less.type = more.type = 'button';
    less.setAttribute('aria-label', 'One munition less');
    more.setAttribute('aria-label', 'One munition more');
    less.disabled = slip.munitions <= 0;
    more.disabled = slip.munitions >= slip.munitionsMax;
    less.addEventListener('click', () => actions.onMunitions(-1));
    more.addEventListener('click', () => actions.onMunitions(1));
    mun.appendChild(less);
    mun.appendChild(el('span', 'slip-mun-text', `Barrage: ${slip.munitions} munition${slip.munitions === 1 ? '' : 's'} (up to ${slip.munitionsMax})`));
    mun.appendChild(more);
    card.appendChild(mun);
  }

  const lines = el('div', 'slip-lines');
  if (slip.empty) {
    slipLine(lines, 'Defenders', 'none \u2014 taken without a fight');
  } else if (slip.ratioText) {
    slipLine(lines, 'Odds', slip.ratioText);
    for (const sh of slip.shifts) slipLine(lines, sh.label, signed(sh.value));
  }
  if (slip.cost) slipLine(lines, 'Cost', slip.cost);
  card.appendChild(lines);

  if (slip.finalLabel && !slip.result) {
    const stamp = el('p', 'slip-stamp', `COLUMN ${slip.finalLabel}`);
    card.appendChild(stamp);
    const odds = el('div', 'slip-lines');
    slipLine(odds, 'Chance of taking it', pct(slip.pTake));
    slipLine(odds, 'Expected losses, ours', `${slip.attackerLoss.toFixed(1)} steps`);
    slipLine(odds, 'Expected losses, theirs', `${slip.defenderLoss.toFixed(1)} steps`);
    card.appendChild(odds);
  }
  if (slip.advice && !slip.result) card.appendChild(adviceBlock(slip.advice));
  if (slip.warning) card.appendChild(el('p', 'slip-warning', slip.warning));
  for (const r of slip.reasons || []) card.appendChild(el('p', 'slip-note', r));

  if (slip.result) {
    const res = el('div', 'slip-lines');
    for (const [label, value] of slip.result) slipLine(res, label, value);
    card.appendChild(res);
    card.appendChild(el('p', 'slip-stamp' + (slip.taken ? '' : ' failed'), slip.taken ? 'OBJECTIVE TAKEN' : 'REPULSED'));
  }

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
  card.appendChild(buttons);
  return card;
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

// Settings kept on this phone: fast mode (STYLE.md §8).
function settingsSection(settings, onFast) {
  const section = el('section', 'settings');
  section.appendChild(el('h3', 'panel-subtitle', 'Settings'));
  const b = el('button', 'btn btn-small', settings.fast ? 'Fast mode: on' : 'Fast mode: off');
  b.type = 'button';
  b.setAttribute('aria-pressed', String(Boolean(settings.fast)));
  b.addEventListener('click', onFast);
  section.appendChild(b);
  section.appendChild(el('p', 'unit-hint', 'Fast mode plays turns back with only the capture animation. With Reduce Motion on in your phone\u2019s settings, nothing animates.'));
  return section;
}

// A decision an event asks for (RULES.md §10). The turn waits until it's answered.
function choiceCard(choice, onChoose) {
  const card = el('section', 'order-slip choice-card');
  card.appendChild(el('p', 'slip-kicker', 'DECISION REQUIRED'));
  card.appendChild(el('h3', 'slip-title', choice.event.name));
  card.appendChild(el('p', 'slip-defenders', choice.question));
  for (const o of choice.options) {
    const b = el('button', 'btn slip-choice');
    b.type = 'button';
    b.appendChild(el('strong', '', o.label));
    b.appendChild(el('span', '', ' \u2014 ' + o.text));
    b.addEventListener('click', () => onChoose(o.id));
    card.appendChild(b);
  }
  return card;
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
  if (actions.choice) parts.push(choiceCard(actions.choice, actions.onChoose));
  if (actions.reports && actions.reports.length && !actions.slip) parts.push(reportsSection(actions.reports, actions.onReport, actions.onCloseReports));
  if (actions.suggestions) parts.push(suggestionsSection(actions.suggestions, actions.onSuggestion));
  if (actions.orders) parts.push(ordersSection(actions.orders, actions.onCancelOrder));
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
    parts.push(unitList(info, actions.onUnit || (() => {}), actions.onCancelOrder));
    parts.push(dl);
  }
  if (actions.situation) parts.push(situationSection(actions.situation));
  if (actions.log && actions.log.length) parts.push(dispatches(actions.log));
  if (actions.settings) parts.push(settingsSection(actions.settings, actions.onFast));
  parts.push(legend(terrainData));
  container.replaceChildren(...parts);
}
