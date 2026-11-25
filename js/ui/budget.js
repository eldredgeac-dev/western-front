// budget.js — the War Office budget (RULES.md §19.4, docs/STYLE.md §6): a ledger page
// with brass sliders, shown at the start of a month when a player's budget waits.
// For each of the side's nations:
//   Manpower — goes to Replacements by itself (just shown).
//   Industry — a brass slider splits it between Munitions (into the stockpile, max 3)
//              and Research (into the tech you pick). What isn't spent is lost.
// Below that, the research ledger: every tech, its progress bar, its dates and a
// one-line history note. Every figure comes from js/engine/systems/economy.js.

import { manpower, industryParts, stockpile, researchOptions, researchProgress, autoBudget,
  checkBudget, techResearched, techActive } from '../engine/systems/economy.js';

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

// What a plan spends: { munitions, research, tech, lost }. Research is capped at what
// the chosen tech still needs; anything left over is lost.
function spending(state, data, nationId, plan) {
  const ip = industryParts(state, data, nationId).total;
  const tech = researchOptions(state, data, nationId).find((t) => t.id === plan.tech) || null;
  const research = tech ? Math.max(0, Math.min(ip - plan.munitions, tech.cost - researchProgress(state, tech.id))) : 0;
  return { munitions: plan.munitions, research, tech: research > 0 ? tech.id : null, lost: ip - plan.munitions - research };
}

// One nation's budget: its Manpower line, its Industry, the slider and the tech picker.
//   plan — { munitions, tech }, changed as the player moves the slider or picks a tech.
// The card is built once; moving the slider only updates its figures (so the slider
// isn't redrawn under the player's finger).
function nationCard(state, data, nationId, plan, names) {
  const card = el('section', 'budget-card');
  const ip = industryParts(state, data, nationId);
  const stock = stockpile(state, nationId);
  const cap = data.economy.stockCap;
  const options = researchOptions(state, data, nationId);
  card.appendChild(el('h3', 'ledger-heading', names.nameOf(nationId)));

  const mp = el('p', 'ledger-line');
  mp.appendChild(el('strong', '', `Manpower ${manpower(state, data, nationId)} MP`));
  mp.appendChild(document.createTextNode(' — goes to Replacements (1 MP = 1 step, 2 MP rebuild a unit).'));
  card.appendChild(mp);

  const ipLine = el('p', 'ledger-line');
  ipLine.appendChild(el('strong', '', `Industry ${ip.total} IP`));
  const parts = [`${ip.base} from factories`];
  if (ip.bonus) parts.push(`${signed(ip.bonus)} war economy`);
  if (ip.cities) parts.push(`${signed(ip.cities)} cities`);
  if (ip.research) parts.push(`${signed(ip.research)} research`);
  ipLine.appendChild(document.createTextNode(` (${parts.join(', ')})`));
  card.appendChild(ipLine);

  // The brass slider: how much Industry goes to munitions; the rest is research.
  const room = Math.max(0, Math.min(cap - stock, Math.floor(ip.total / data.economy.munitionCost)));
  const row = el('div', 'budget-split');
  const slider = el('input', 'budget-slider');
  slider.type = 'range'; slider.min = '0'; slider.max = String(room); slider.step = '1';
  slider.value = String(plan.munitions);
  slider.disabled = room === 0;
  slider.setAttribute('aria-label', `${names.nameOf(nationId)}: Industry spent on munitions`);
  const munFigure = el('span', 'ledger-num');
  const resFigure = el('span', 'ledger-num');
  const munLabel = el('p', 'budget-figure');
  munLabel.append(el('span', 'budget-figure-name', 'Munitions'), munFigure);
  const resLabel = el('p', 'budget-figure budget-figure-right');
  resLabel.append(el('span', 'budget-figure-name', 'Research'), resFigure);
  row.append(munLabel, slider, resLabel);
  card.appendChild(row);
  const stockLine = el('p', 'ledger-line budget-stock');
  const lostLine = el('p', 'ledger-line ledger-warn');
  card.append(stockLine, lostLine);

  // The tech picker: one row per tech on offer, with its progress bar.
  const buttons = [];
  if (!options.length) {
    card.appendChild(el('p', 'ledger-line ledger-sub', 'Nothing can be researched this month.'));
  } else {
    const list = el('div', 'tech-pick');
    list.setAttribute('role', 'radiogroup');
    list.setAttribute('aria-label', `${names.nameOf(nationId)}: research`);
    for (const t of options) {
      const b = el('button', 'tech-option');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.tech = t.id;
      const done = researchProgress(state, t.id);
      b.appendChild(el('span', 'tech-name', t.name));
      b.appendChild(progressBar(done, t.cost, `${t.name}: ${done} of ${t.cost}`));
      b.appendChild(el('span', 'tech-figures ledger-num', `${done} / ${t.cost} IP`));
      b.addEventListener('click', () => { plan.tech = t.id; refresh(); });
      buttons.push(b);
      list.appendChild(b);
    }
    card.appendChild(list);
  }

  // Bring the figures up to date with the plan.
  function refresh() {
    const spend = spending(state, data, nationId, plan);
    munFigure.textContent = `${spend.munitions} IP`;
    resFigure.textContent = `${spend.research} IP`;
    stockLine.replaceChildren(shellIcons(stock, cap, spend.munitions),
      document.createTextNode(` Stockpile ${stock + spend.munitions} of ${cap}${stock + spend.munitions >= cap ? ' (full)' : ''}`));
    lostLine.textContent = spend.lost > 0 ? `${spend.lost} IP unspent: it will be lost.` : '';
    lostLine.hidden = spend.lost <= 0;
    for (const b of buttons) b.setAttribute('aria-checked', String(b.dataset.tech === plan.tech));
  }
  slider.addEventListener('input', () => { plan.munitions = Number(slider.value); refresh(); });
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
    return [n, { munitions: auto.munitions, tech: auto.tech || (first ? first.id : null) }];
  }));
  const page = el('div', 'ledger-page budget-page');
  const top = el('div', 'ledger-top');
  top.appendChild(el('p', 'ledger-kicker', 'WAR OFFICE'));
  page.appendChild(top);
  page.appendChild(el('h2', 'ledger-title', `Estimates for ${names.monthName(month)}`));
  page.appendChild(el('p', 'ledger-line',
    'Men go to the depots by themselves. Divide the factories’ output between shells for the stockpile and research. What you don’t spend is lost.'));
  for (const n of nationIds) page.appendChild(nationCard(state, data, n, plans[n], names));

  const autoRow = el('label', 'budget-auto');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = Boolean((state.autoAllocate || {})[sideId]);
  autoRow.append(box, el('span', '', 'Auto-allocate every month: top up the stockpile, the rest to the cheapest research.'));
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
      const { munitions, research: wanted, tech } = spending(state, data, n, plans[n]);
      const t = tech ? data.economy.techs.find((x) => x.id === tech) : null;
      const research = t ? Math.max(0, Math.min(wanted, t.cost - researchProgress(state, t.id) - (added[t.id] || 0))) : 0;
      if (t) added[t.id] = (added[t.id] || 0) + research;
      return [n, { munitions, research, tech: research > 0 ? tech : null }];
    }));
    const problems = Object.entries(budgets).flatMap(([n, b]) => checkBudget(state, data, n, b).map((p) => `${names.nameOf(n)}: ${p}`));
    if (problems.length) { error.textContent = problems.join(' '); error.hidden = false; return; }
    onSign(budgets, box.checked);
  });
  page.append(error, sign, researchLedger(state, data, nationIds, names));
  container.replaceChildren(page);
}
