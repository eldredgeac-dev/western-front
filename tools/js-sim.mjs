// js-sim.mjs — plays complete computer-vs-computer wars with the real game engine
// (js/engine/), headlessly, with fixed seeds, and reports the results.
//   node tools/js-sim.mjs [games=50] [level=regular] [firstSeed=1]
// Compare the numbers with docs/BALANCE.md (made with tools/wfsim.py).

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newGame, currentMonth } from '../js/engine/state.js';
import { beginGame, endPhase } from '../js/engine/turn.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const json = (f) => JSON.parse(readFileSync(join(root, f), 'utf8'));
export const data = {
  map: json('data/boxes-west.json'), terrain: json('data/terrain.json'), nations: json('data/nations.json'),
  unitTypes: json('data/unit-types.json'), phases: json('data/phases.json'), combat: json('data/combat-table.json'),
  victory: json('data/victory.json'), events: json('data/events.json'), ai: json('data/ai.json'), economy: json('data/economy.json'),
  commanders: json('data/commanders.json'),
};
const scenario = json('data/scenarios/1914-west.json');

// Play one whole war, both sides played by the computer at the given skills.
export function playWar(seed, skills = { germany: 'standard', entente: 'standard' }) {
  let s = newGame(scenario, seed, data);
  s.controllers = { germany: 'ai', entente: 'ai' };
  s.aiSkill = { ...skills };
  s = beginGame(s, data);
  for (let i = 0; i < 2000 && !s.over; i++) s = endPhase(s, data);
  return s;
}

// Sum up a list of finished wars.
export function summarise(wars) {
  const n = wars.length;
  const count = (f) => wars.filter(f).length;
  const mean = (f) => wars.reduce((a, w) => a + f(w), 0) / n;
  return {
    games: n,
    germany: count((w) => w.result.winner === 'germany') / n,
    entente: count((w) => w.result.winner === 'entente') / n,
    draw: count((w) => w.result.winner === 'draw') / n,
    turns: mean((w) => w.turn),
    sudden: count((w) => !w.result.reason.startsWith('The Armistice')) / n,
    mutiny: count((w) => w.mutinies && w.mutinies.fra) / n,
    attacks: mean((w) => (w.attacks || []).length),
    captures: mean((w) => w.log.filter((l) => l.text.endsWith('was taken.')).length),
    endWill: ['ger', 'fra', 'gbr'].map((k) => `${k.toUpperCase()} ${Math.round(mean((w) => w.will[k]))}`).join(', '),
  };
}

if (process.argv[1] && process.argv[1].endsWith('js-sim.mjs')) {
  const games = Number(process.argv[2] || 50);
  const first = Number(process.argv[4] || 1);
  const t0 = Date.now();
  const wars = [];
  for (let i = 0; i < games; i++) wars.push(playWar(first + i));
  const r = summarise(wars);
  const pct = (x) => `${Math.round(x * 100)}%`;
  console.log(`${r.games} computer-vs-computer wars (standard vs standard, seeds ${first}–${first + games - 1}), ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  console.log(`Germany ${pct(r.germany)} · Entente ${pct(r.entente)} · draw ${pct(r.draw)}`);
  console.log(`length ${r.turns.toFixed(1)} turns · sudden endings ${pct(r.sudden)} · French mutinies ${pct(r.mutiny)}`);
  console.log(`attacks per war ${r.attacks.toFixed(0)} · captures ${r.captures.toFixed(1)} · final Will ${r.endWill}`);
  void currentMonth;
}
