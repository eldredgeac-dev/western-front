// count.mjs — the counting tool (DECISIONS.md 82) for the game's own engine. Plays
// computer-vs-computer wars and reports, per year, averaged per month at the start of
// the Entente attack phase: French units (and steps) in the front line, German
// territories French units could attack, how many of those reach 2:1 or better with
// the best barrage France can afford, French OP, and French attacks actually made.
// The same count for the simulator: python3 tools/count.py
//   node tools/count.mjs [games=50] [firstSeed=1]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { data } from './js-sim.mjs';
import { newGame, currentMonth } from '../js/engine/state.js';
import { beginGame, endPhase } from '../js/engine/turn.js';
import { frontBoxes } from '../js/engine/ai.js';
import { eligibleAttackers, planAttack, barrageMax } from '../js/engine/combat.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scenario = JSON.parse(readFileSync(join(root, 'data/scenarios/1914-west.json'), 'utf8'));
const MIN_COLUMN = data.combat.columns.findIndex((c) => c.label === data.ai.skills.standard.minColumn);

// One look at the board, just before the Entente's attacks.
function look(tot, state) {
  const year = currentMonth(state).slice(0, 4);
  const t = tot[year] = tot[year] || { months: 0, front: 0, frontSteps: 0, targets: 0, ok: 0, attacks: 0, op: 0, asteps: 0, dsteps: 0, ratio: 0, trench: 0, final: 0 };
  t.months += 1;
  const front = new Set(frontBoxes(state, data, 'entente'));
  const fra = state.units.filter((u) => u.nation === 'fra' && front.has(u.box));
  t.front += fra.length;
  t.frontSteps += fra.reduce((s, u) => s + u.steps, 0);
  t.op += state.resources.fra.attacks;          // attacks left (V2c; it was OP)
  if ((state.cannotAttack || {}).fra) return;
  const mun = Math.max(0, Math.min(state.resources.fra.munitions - data.combat.attackCost.single, barrageMax(data, currentMonth(state), state, 'entente')));
  const targets = new Set();
  for (const b of front) for (const n of data.map.boxes.find((x) => x.id === b).neighbours) if (state.boxes[n].owner !== 'entente') targets.add(n);
  for (const target of targets) {
    const units = eligibleAttackers(state, data, target).filter((id) => state.units.find((u) => u.id === id).nation === 'fra');
    if (!units.length) continue;
    t.targets += 1;
    const plan = planAttack(state, data, { target, units, munitions: mun });
    if (plan.empty || (plan.ratioColumn >= 0 && plan.finalColumn >= MIN_COLUMN)) t.ok += 1;
    t.asteps += plan.attackSteps; t.dsteps += plan.defendSteps; t.trench += state.boxes[target].trench;
    t.ratio += plan.empty ? 5 : plan.ratioColumn;
    t.final += plan.empty ? 5 : plan.ratioColumn < 0 ? -1 : plan.finalColumn;
  }
}

export function countWars(games, first = 1) {
  const tot = {};
  for (let seed = first; seed < first + games; seed++) {
    let s = newGame(scenario, seed, data);
    s.controllers = { germany: 'ai', entente: 'ai' };
    s.aiSkill = { germany: 'standard', entente: 'standard' };
    const probe = (st, side) => { if (side === 'entente') look(tot, st); };
    s = beginGame(s, data, { probe });
    for (let i = 0; i < 2000 && !s.over; i++) s = endPhase(s, data, { probe });
    for (const a of s.attacks || []) if (a.side === 'entente' && a.nations.includes('fra')) tot[a.month.slice(0, 4)].attacks += 1;
  }
  return tot;
}

if (process.argv[1] && process.argv[1].endsWith('count.mjs')) {
  const tot = countWars(Number(process.argv[2] || 50), Number(process.argv[3] || 1));
  console.log('year | French units in front | their steps | targets in reach | at 2:1+ | French OP | French attacks  (per month)');
  for (const y of Object.keys(tot).sort()) {
    const t = tot[y]; const m = Math.max(1, t.months);
    console.log(`${y} | ${(t.front / m).toFixed(1)} | ${(t.frontSteps / m).toFixed(1)} | ${(t.targets / m).toFixed(1)} | ${(t.ok / m).toFixed(2)} | ${(t.op / m).toFixed(1)} | ${(t.attacks / m).toFixed(2)}`);
  }
  console.log('per target in reach: year | French steps next to it | defending steps | trench | odds column before shifts | after shifts  (0 = 1:2 … 3 = 2:1 … 5 = 4:1)');
  for (const y of Object.keys(tot).sort()) {
    const t = tot[y]; const c = Math.max(1, t.targets);
    console.log(`${y} | ${(t.asteps / c).toFixed(1)} | ${(t.dsteps / c).toFixed(1)} | ${(t.trench / c).toFixed(2)} | ${(t.ratio / c).toFixed(2)} | ${(t.final / c).toFixed(2)}`);
  }
}
