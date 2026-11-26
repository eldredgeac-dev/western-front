// budget.js — the War Office budget (RULES.md §19.4, docs/STYLE.md §6): a ledger page
// with brass sliders, shown at the start of a month when a player's budget waits.
// For each of the side's nations:
//   Manpower — goes to Replacements by itself (just shown).
//   Industry — a brass slider splits it between Munitions (into the stockpile, max 3)
//              and the rest. When a nation can both research and buy units, a second
//              slider splits the rest between Research (the tech you pick) and New
//              units (§19.9: the unit and the rear city you pick). What isn't spent is lost.
// Below that, the research ledger: every tech, its progress bar, its dates and a
// one-line history note. Every figure comes from js/engine/systems/economy.js.

import { manpower, industryParts, stockpile, researchOptions, researchProgress, autoBudget,
  checkBudget, techResearched, techActive, buyOptions, production, depotsFor } from '../engine/systems/economy.js';
import { addMonths } from '../engine/state.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

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
const signed = (n) => (n > 0 ? `+${n}` : `−${-n}`);

// The stockpile as shell icons (STYLE.md: ink drawings, no clip art): `have` filled
// shells, then `adding` outlined in brass, then empty outlines up to `cap`.
export function shellIcons(have, cap, adding = 0) {
  const svg = svgEl('svg', { viewBox: `0 0 ${cap * 14} 26`, width: cap * 14, height: 26, class: 'shells', role: 'img',
    'aria-label': `${have + adding} of ${cap} munitions in the stockpile` });
  for (let i = 0; i < cap; i++) {
    const kind = i < have ? 'shell-full' : i < have + adding ? 'shell-new' : 'shell-empty';
    const x = i * 14 + 3;
    // a shell: a round-nosed body on a short brass case
    svgEl('path', { d: `M${x} 22 V9 Q${x + 4} 1 ${x + 8} 9 V22 Z`, class: `shell ${kind}` }, svg);
    svgEl('line', { x1: x, x2: x + 8, y1: 17, y2: 17, class: 'shell-band' }, svg);
  }
  return svg;
}

// A progress bar drawn as an ink-filled ruled bar.
export function progressBar(done, total, label) {
  const bar = el('span', 'research-bar');
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(total));
  bar.setAttribute('aria-valuenow', String(done));
  if (label) bar.setAttribute('aria-label', label);
  const fill = el('span', 'research-fill');
  fill.style.width = `${Math.min(100, (done / total) * 100)}%`;
  bar.appendChild(fill);
  return bar;
}

// What a plan spends: { munitions, research, tech, build, buildType, city, lost }.
// After munitions, the rest goes to research (at most `plan.research`, and never more
// than the tech still needs), then to the new unit (never more than it still needs).
// Anything left over is lost.
function spending(state, data, nationId, plan) {
  const ip = industryParts(state, data, nationId).total;
  const rest = ip - plan.munitions;
  const tech = researchOptions(state, data, nationId).find((t) => t.id === plan.tech) || null;
  const buy = buyOptions(state, data, nationId).find((o) => o.type === plan.buildType) || null;
  const wanted = buy ? plan.research : rest;           // no unit to buy: all the rest to research
  const research = tech ? Math.max(0, Math.min(wanted, rest, tech.cost - researchProgress(state, tech.id))) : 0;
  const build = buy ? Math.max(0, Math.min(rest - research, buy.ip - production(state, nationId).progress)) : 0;
  return { munitions: plan.munitions, research, tech: research > 0 ? tech.id : null,
    build, buildType: buy ? buy.type : null, city: buy ? plan.city : null, lost: rest - research - build };
}

const boxNameOf = (data, id) => { const b = data.map.boxes.find((x) => x.id === id); return b.short || b.name; };
const typeName = (type) => (type === 'tanks' ? 'Tanks' : 'Infantry');

// A row of radio buttons in the ledger style (techs, unit types, cities).
function radioGroup(label) {
  const list = el('div', 'tech-pick');
  list.setAttribute('role', 'radiogroup');
  list.setAttribute('aria-label', label);
  return list;
}
function radioButton(className, onPick) {
  const b = el('button', className);
  b.type = 'button';
  b.setAttribute('role', 'radio');
  b.addEventListener('click', onPick);
  return b;
}

// One nation's budget: its Manpower line, its Industry, the sliders, the tech picker
// and the new units.
//   plan — { munitions, research, tech, buildType, city }, changed as the player
//          moves a slider or picks something.
// The card is built once; moving a slider only updates its figures (so the slider
// isn't redrawn under the player's finger).
function nationCard(state, data, nationId, plan, names, monthNow) {
  const card = el('section', 'budget-card');
  const ip = industryParts(state, data, nationId);
  const stock = stockpile(state, nationId);
  const cap = data.economy.stockCap;
  const options = researchOptions(state, data, nationId);
  const buys = buyOptions(state, data, nationId);
  const prod = production(state, nationId);
  const mpNow = (state.resources[nationId] || {}).rp || 0;
  card.appendChild(el('h3', 'ledger-heading', names.nameOf(nationId)));

  const mp = el('p', 'ledger-line');
  mp.appendChild(el('strong', '', `Manpower ${manpower(state, data, nationId)} MP`));
  mp.appendChild(document.createTextNode(buys.length
    ? ' — goes to Replacements (1 MP = 1 step, 2 MP rebuild a unit), unless a new unit takes its men first.'
    : ' — goes to Replacements (1 MP = 1 step, 2 MP rebuild a unit).'));
  card.appendChild(mp);

  const ipLine = el('p', 'ledger-line');
  ipLine.appendChild(el('strong', '', `Industry ${ip.total} IP`));
  const parts = [`${ip.base} from factories`];
  if (ip.bonus) parts.push(`${signed(ip.bonus)} war economy`);
  if (ip.cities) parts.push(`${signed(ip.cities)} cities`);
  if (ip.research) parts.push(`${signed(ip.research)} research`);
  if (ip.commander) parts.push(`${signed(ip.commander)} commander`);
  ipLine.appendChild(document.createTextNode(` (${parts.join(', ')})`));
  card.appendChild(ipLine);

  // A brass slider with a figure at each end.
  function splitRow(leftName, rightName, aria) {
    const row = el('div', 'budget-split');
    const slider = el('input', 'budget-slider');
    slider.type = 'range'; slider.min = '0'; slider.step = '1';
    slider.setAttribute('aria-label', `${names.nameOf(nationId)}: ${aria}`);
    const left = el('span', 'ledger-num');
    const right = el('span', 'ledger-num');
    const l = el('p', 'budget-figure');
    l.append(el('span', 'budget-figure-name', leftName), left);
    const r = el('p', 'budget-figure budget-figure-right');
    r.append(el('span', 'budget-figure-name', rightName), right);
    row.append(l, slider, r);
    return { row, slider, left, right };
  }

  // Slider 1: how much Industry goes to munitions; the rest is for research and units.
  const room = Math.max(0, Math.min(cap - stock, Math.floor(ip.total / data.economy.munitionCost)));
  const restName = options.length && buys.length ? 'The rest' : buys.length ? 'New units' : 'Research';
  const first = splitRow('Munitions', restName, 'Industry spent on munitions');
  first.slider.max = String(room);
  first.slider.value = String(plan.munitions);
  first.slider.disabled = room === 0;
  card.appendChild(first.row);
  const stockLine = el('p', 'ledger-line budget-stock');
  card.appendChild(stockLine);

  // Slider 2 (only when both are possible): the rest between research and new units.
  const second = options.length && buys.length ? splitRow('Research', 'New units', 'the rest between research and new units') : null;
  if (second) card.appendChild(second.row);
  const lostLine = el('p', 'ledger-line ledger-warn');
  card.appendChild(lostLine);

  // The tech picker: one row per tech on offer, with its progress bar.
  const buttons = [];
  if (!options.length) {
    card.appendChild(el('p', 'ledger-line ledger-sub', 'Nothing can be researched this month.'));
  } else {
    card.appendChild(el('p', 'ledger-line budget-sub-heading', 'Research'));
    const list = radioGroup(`${names.nameOf(nationId)}: research`);
    for (const t of options) {
      const b = radioButton('tech-option', () => { plan.tech = t.id; refresh(); });
      b.dataset.tech = t.id;
      const done = researchProgress(state, t.id);
      b.appendChild(el('span', 'tech-name', t.name));
      b.appendChild(progressBar(done, t.cost, `${t.name}: ${done} of ${t.cost}`));
      b.appendChild(el('span', 'tech-figures ledger-num', `${done} / ${t.cost} IP`));
      buttons.push(b);
      list.appendChild(b);
    }
    card.appendChild(list);
  }

  // New units (§19.9): which unit, and which rear city it arrives in.
  const typeButtons = [];
  const cityButtons = [];
  const unitLine = el('p', 'ledger-line');
  if (buys.length) {
    card.appendChild(el('p', 'ledger-line budget-sub-heading', 'New units'));
    card.appendChild(el('p', 'ledger-line ledger-sub', 'IP carries over until a unit is paid for. Then its men come from this month’s Manpower, and it arrives the month after.'));
    const list = radioGroup(`${names.nameOf(nationId)}: new unit`);
    for (const o of buys) {
      const b = radioButton('tech-option', () => { plan.buildType = o.type; refresh(); });
      b.dataset.type = o.type;
      const done = Math.min(prod.progress, o.ip);
      b.appendChild(el('span', 'tech-name', `${typeName(o.type)} · ${o.steps} steps`));
      b.appendChild(progressBar(done, o.ip, `${typeName(o.type)}: ${done} of ${o.ip}`));
      b.appendChild(el('span', 'tech-figures ledger-num', `${o.ip} IP + ${o.mp} MP · ${o.left} left`));
      typeButtons.push(b);
      list.appendChild(b);
    }
    card.appendChild(list);
    const cities = depotsFor(state, data, nationId);
    if (cities.length) {
      card.appendChild(el('p', 'ledger-line ledger-sub', 'Arrives at:'));
      const where = radioGroup(`${names.nameOf(nationId)}: where the new unit arrives`);
      where.classList.add('city-pick');
      for (const id of cities) {
        const b = radioButton('tech-option city-option', () => { plan.city = id; refresh(); });
        b.dataset.city = id;
        b.appendChild(el('span', 'tech-name', boxNameOf(data, id)));
        cityButtons.push(b);
        where.appendChild(b);
      }
      card.appendChild(where);
    }
    card.appendChild(unitLine);
  }

  // What the new unit's money does this month, in one line.
  function unitStatus(spend) {
    const o = buys.find((x) => x.type === spend.buildType);
    if (!o) return '';
    const total = prod.progress + spend.build;
    if (total < o.ip) return `${typeName(o.type)}: ${total} of ${o.ip} IP paid. ${o.ip - total} more to go.`;
    if (mpNow < o.mp) return `${typeName(o.type)}: paid for, but it needs ${o.mp} MP and there ${mpNow === 1 ? 'is' : 'are'} only ${mpNow} this month. It waits.`;
    const city = spend.city ? boxNameOf(data, spend.city) : 'a rear city';
    return `${typeName(o.type)}: paid for. It takes ${o.mp} MP from Replacements now and arrives at ${city} in ${names.monthName(addMonths(monthNow, data.economy.units.arriveAfter))}.`;
  }

  // Bring the figures up to date with the plan.
  function refresh() {
    const rest = ip.total - plan.munitions;
    if (second) {
      second.slider.max = String(Math.max(0, rest));
      plan.research = Math.min(plan.research, rest);
      second.slider.value = String(plan.research);
      second.slider.disabled = rest === 0;
    }
    const spend = spending(state, data, nationId, plan);
    first.left.textContent = `${spend.munitions} IP`;
    first.right.textContent = `${spend.research + spend.build} IP`;
    if (second) { second.left.textContent = `${spend.research} IP`; second.right.textContent = `${spend.build} IP`; }
    stockLine.replaceChildren(shellIcons(stock, cap, spend.munitions),
      document.createTextNode(` Stockpile ${stock + spend.munitions} of ${cap}${stock + spend.munitions >= cap ? ' (full)' : ''}`));
    lostLine.textContent = spend.lost > 0 ? `${spend.lost} IP unspent: it will be lost.` : '';
    lostLine.hidden = spend.lost <= 0;
    unitLine.textContent = unitStatus(spend);
    for (const b of buttons) b.setAttribute('aria-checked', String(b.dataset.tech === plan.tech));
    for (const b of typeButtons) b.setAttribute('aria-checked', String(b.dataset.type === plan.buildType));
    for (const b of cityButtons) b.setAttribute('aria-checked', String(b.dataset.city === plan.city));
  }
  first.slider.addEventListener('input', () => { plan.munitions = Number(first.slider.value); refresh(); });
  if (second) second.slider.addEventListener('input', () => { plan.research = Number(second.slider.value); refresh(); });
  refresh();
  return card;
}

// The research ledger (§19.5): every tech the side can research, with its state.
function researchLedger(state, data, nationIds, names) {
  const s = el('section', 'ledger-section');
  s.appendChild(el('h3', 'ledger-heading', 'Research ledger'));
  s.appendChild(el('p', 'ledger-line ledger-sub',
    'Every tech arrives free on its historical date. Research brings it sooner, but not before its earliest date.'));
  for (const t of data.economy.techs.filter((x) => x.nations.some((n) => nationIds.includes(n)))) {
    const row = el('div', 'tech-row');
    const head = el('p', 'tech-head');
    head.appendChild(el('strong', '', t.name));
    head.appendChild(document.createTextNode(` · ${t.nations.map((n) => names.shortOf(n)).join(' & ')}`));
    row.appendChild(head);
    const done = researchProgress(state, t.id);
    let status;
    if (techResearched(state, t.id)) status = 'Researched.';
    else if (techActive(state, data, t.id)) status = 'Arrived on its historical date.';
    else status = `${done} of ${t.cost} IP.`;
    row.appendChild(progressBar(techActive(state, data, t.id) ? t.cost : done, t.cost, `${t.name}: ${status}`));
    const when = `${t.historical ? `Historically ${names.monthName(t.historical)}` : 'Never happened historically'}` +
      ` · earliest ${names.monthName(t.earliest)} · cost ${t.cost} IP`;
    row.appendChild(el('p', 'ledger-line', `${status} ${t.text}`));
    row.appendChild(el('p', 'ledger-line ledger-sub', when));
    row.appendChild(el('p', 'ledger-line tech-note', t.note));
    s.appendChild(row);
  }
  return s;
}

// Draw the budget for one side into `container`.
//   names — { nameOf(id), shortOf(id), monthName(m) }
//   onSign(budgets, auto) — the player signs; budgets is { nationId: budget }
export function showBudget(container, state, data, sideId, month, names, onSign) {
  const nationIds = data.nations.nations.filter((n) => n.side === sideId && state.will[n.id] !== undefined).map((n) => n.id);
  // start from the automatic budget (top up munitions, then the cheapest tech)
  const plans = Object.fromEntries(nationIds.map((n) => {
    const auto = autoBudget(state, data, n);
    const first = researchOptions(state, data, n).sort((a, b) => a.cost - b.cost)[0];
    // the new unit: the one already being paid for, else the automatic choice; the
    // city: the one already chosen if still held, else the first rear city held
    const prod = production(state, n);
    const buys = buyOptions(state, data, n);
    const buildType = (buys.find((o) => o.type === prod.type) || {}).type || auto.buildType;
    const cities = depotsFor(state, data, n);
    const city = cities.includes(prod.city) ? prod.city : (cities[0] || null);
    return [n, { munitions: auto.munitions, research: auto.research, tech: auto.tech || (first ? first.id : null), buildType, city }];
  }));
  const page = el('div', 'ledger-page budget-page');
  const top = el('div', 'ledger-top');
  top.appendChild(el('p', 'ledger-kicker', 'WAR OFFICE'));
  page.appendChild(top);
  page.appendChild(el('h2', 'ledger-title', `Estimates for ${names.monthName(month)}`));
  page.appendChild(el('p', 'ledger-line',
    'Men go to the depots by themselves. Divide the factories’ output between shells for the stockpile, research and new units. What you don’t spend is lost.'));
  for (const n of nationIds) page.appendChild(nationCard(state, data, n, plans[n], names, month));

  const autoRow = el('label', 'budget-auto');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = Boolean((state.autoAllocate || {})[sideId]);
  autoRow.append(box, el('span', '', 'Auto-allocate every month: top up the stockpile, then the cheapest research, then new units (a tank first).'));
  page.appendChild(autoRow);
  const error = el('p', 'ledger-line ledger-warn');
  error.hidden = true;
  const sign = el('button', 'btn btn-primary budget-sign', 'SIGN THE ESTIMATES');
  sign.type = 'button';
  sign.addEventListener('click', () => {
    // France and Britain share the creeping barrage: the second nation only puts in
    // what the first one left it needing.
    const added = {};
    const budgets = Object.fromEntries(nationIds.map((n) => {
      const { munitions, research: wanted, tech, buildType, city } = spending(state, data, n, plans[n]);
      const t = tech ? data.economy.techs.find((x) => x.id === tech) : null;
      const research = t ? Math.max(0, Math.min(wanted, t.cost - researchProgress(state, t.id) - (added[t.id] || 0))) : 0;
      if (t) added[t.id] = (added[t.id] || 0) + research;
      // what research didn't use still goes to the new unit, up to what it needs
      const ip = industryParts(state, data, n).total;
      const o = buyOptions(state, data, n).find((x) => x.type === buildType);
      const build = o ? Math.max(0, Math.min(ip - munitions - research, o.ip - production(state, n).progress)) : 0;
      return [n, { munitions, research, tech: research > 0 ? tech : null, build, buildType: o ? buildType : null, city: o ? city : null }];
    }));
    const problems = Object.entries(budgets).flatMap(([n, b]) => checkBudget(state, data, n, b).map((p) => `${names.nameOf(n)}: ${p}`));
    if (problems.length) { error.textContent = problems.join(' '); error.hidden = false; return; }
    onSign(budgets, box.checked);
  });
  page.append(error, sign, researchLedger(state, data, nationIds, names));
  container.replaceChildren(page);
}
