// js-par.mjs — tools/js-sim.mjs on every processor core at once (much faster for 200 wars).
//   node tools/js-par.mjs [games=200] [cores=4]
import { Worker, isMainThread, workerData, parentPort } from 'node:worker_threads';
import { playWar, summarise } from './js-sim.mjs';

if (isMainThread) {
  const games = Number(process.argv[2] || 200); const cores = Number(process.argv[3] || 4);
  const t0 = Date.now(); const wars = []; let done = 0;
  for (let c = 0; c < cores; c++) {
    const seeds = []; for (let s = 1 + c; s <= games; s += cores) seeds.push(s);
    const w = new Worker(new URL(import.meta.url), { workerData: seeds });
    w.on('message', (list) => {
      wars.push(...list);
      if (++done < cores) return;
      const r = summarise(wars); const pct = (x) => `${Math.round(x * 100)}%`;
      console.log(`${r.games} wars (standard vs standard), ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      console.log(`Germany ${pct(r.germany)} · Entente ${pct(r.entente)} · draw ${pct(r.draw)}`);
      console.log(`length ${r.turns.toFixed(1)} turns · sudden endings ${pct(r.sudden)} · French mutinies ${pct(r.mutiny)}`);
      console.log(`attacks per war ${r.attacks.toFixed(0)} · captures ${r.captures.toFixed(1)} · final Will ${r.endWill}`);
    });
  }
} else {
  // only what summarise() needs, so the results are small to send back
  parentPort.postMessage(workerData.map((seed) => {
    const s = playWar(seed);
    return { result: s.result, turn: s.turn, mutinies: s.mutinies, attacks: s.attacks, will: s.will,
      log: s.log.filter((l) => l.text.endsWith('was taken.')) };
  }));
}
