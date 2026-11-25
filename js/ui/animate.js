// animate.js — plays a turn back on the map after COMMIT ORDERS (docs/STYLE.md §8):
// your orders, then the enemy's. Each group of orders first shows its arrows; then
// each order plays out: pieces slide along their arrows, a barrage puffs over the
// target, the dice tumble on a small order slip, losses float up in red, and a
// captured territory's colour cross-fades while the front line redraws.
//
// The rules from STYLE.md §8:
//   - no animation is longer than 1 second;
//   - a tap on the map skips the current one, and SKIP skips the rest of the turn;
//   - "fast mode" (a setting) keeps only the capture cross-fade;
//   - with the phone's Reduce Motion setting on, nothing animates at all.
//
// The engine describes what happened as "actions" (js/engine/orders.js), each with a
// snapshot of the board just after it (`after`). This file only shows them.

const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (t) => t * t * (3 - 2 * t);

//   view — what the playback needs from the game screen:
//     mapView              — js/ui/map.js
//     mapArea              — the map's HTML box (it shakes for a barrage)
//     bar, barLabel, skip  — the playback bar and its SKIP button
//     slip                 — the small order slip for the dice
//     showBoard(snapshot)  — draw the map as it was at that moment
//     lookFor(unit)        — how a unit's piece looks
//     describe(action)     — { title, label, sideName } words for an action
//     fast()               — is fast mode on?
//     focus(boxA, boxB)    — bring these territories into view if they're off screen
export function createPlayback(view) {
  let skipAll = false;
  let skipNow = null;           // finishes the animation running now
  let playing = false;

  view.skip.addEventListener('click', () => { skipAll = true; if (skipNow) skipNow(); });

  // Wait `ms`, unless skipped.
  function wait(ms) {
    if (skipAll || ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => { clearTimeout(timer); skipNow = null; resolve(); };
      const timer = setTimeout(done, ms);
      skipNow = done;
    });
  }
  // Run frame(t) for t from 0 to 1 over `ms` (always ends with frame(1)).
  function tween(ms, frame) {
    if (skipAll || ms <= 0) { frame(1); return Promise.resolve(); }
    return new Promise((resolve) => {
      const start = performance.now();
      let raf = 0;
      const done = () => { cancelAnimationFrame(raf); skipNow = null; frame(1); resolve(); };
      const step = (now) => {
        const t = Math.min(1, (now - start) / ms);
        frame(t);
        if (t >= 1) { skipNow = null; resolve(); return; }
        raf = requestAnimationFrame(step);
      };
      skipNow = done;
      raf = requestAnimationFrame(step);
    });
  }

  // Group the actions: one side's moves, then that side's attacks, and so on.
  function groups(actions) {
    const out = [];
    for (const a of actions) {
      if (a.kind === 'skipped') continue;
      const type = a.kind === 'attack' ? 'attack' : 'move';
      const last = out[out.length - 1];
      if (last && last.side === a.side && last.type === type) last.actions.push(a);
      else out.push({ side: a.side, type, actions: [a] });
    }
    return out;
  }

  // The arrow for an action: from where its lead unit stood, to its target.
  function arrowOf(a, i) {
    if (a.kind === 'attack') {
      const boxes = Object.values(a.from || {});
      return { key: i, kind: 'attack', from: boxes[0], to: a.target, label: view.describe(a).label };
    }
    return { key: i, kind: 'move', from: a.from, to: a.to };
  }

  // ---- one action
  // A move: the piece slides from its old territory to its new one.
  async function playMove(a) {
    if (view.fast()) { view.showBoard(a.after); return; }
    const unit = a.after.units.find((u) => u.id === a.unit);
    // the board just before: as after, but with the unit still where it was
    const before = { ...a.after, units: a.after.units.filter((u) => u.id !== a.unit) };
    view.showBoard(before);
    if (unit) {
      const ghost = view.mapView.ghostPiece(unit, view.lookFor(unit));
      const [x0, y0] = view.mapView.standPoint(a.from); const [x1, y1] = view.mapView.standPoint(a.to);
      await tween(600, (t) => { const e = ease(t); ghost.at(x0 + (x1 - x0) * e, y0 + (y1 - y0) * e); });
      ghost.remove();
    }
    view.showBoard(a.after);
  }

  // An attack: barrage, dice on the slip, losses, and a capture.
  async function playAttack(a) {
    const r = a.result;
    const words = view.describe(a);
    if (!view.fast()) {
      if (a.munitions > 0 && !skipAll) {
        view.mapView.puffs(a.target);
        view.mapArea.classList.add('shake');
        await wait(600);
        view.mapArea.classList.remove('shake');
      }
      await rollDice(r, words);
      await wait(700);                       // a moment to read the result
    }
    // losses float up over the target and over where the attackers stood
    const lostBy = (side) => Object.values(side || {}).reduce((s, v) => s + v, 0);
    const theirs = lostBy(r.defenderLost) + lostBy(r.retreatLost);
    const ours = lostBy(r.attackerLost);
    view.mapView.svg.classList.add('playing');
    view.showBoard(a.after);
    if (!view.fast() && !skipAll) {
      if (theirs) view.mapView.floatText(a.target, `−${theirs}`);
      const from = Object.values(a.from || {})[0];
      if (ours && from) view.mapView.floatText(from, `−${ours}`);
    }
    if (r.taken || !view.fast()) await wait(600);   // the capture cross-fade
    view.mapView.svg.classList.remove('playing');
    view.slip.hidden = true;
  }

  // The small order slip with two dice tumbling, landing on the real roll.
  async function rollDice(r, words) {
    const slip = view.slip;
    slip.hidden = false;
    slip.querySelector('.pb-title').textContent = words.title;
    slip.querySelector('.pb-column').textContent = r.empty ? 'No defenders' : `Column ${r.plan.columnLabel}`;
    const dice = slip.querySelectorAll('.die');
    const result = slip.querySelector('.pb-result');
    const stamp = slip.querySelector('.pb-stamp');
    result.textContent = ''; stamp.textContent = ''; stamp.className = 'pb-stamp';
    if (r.empty) {
      for (const d of dice) d.hidden = true;
    } else {
      for (const d of dice) { d.hidden = false; d.classList.add('rolling'); }
      let last = 0;
      await tween(800, (t) => {
        if (t < 1 && t - last < 0.1) return;
        last = t;
        dice.forEach((d, i) => setFace(d, t >= 1 ? r.dice[i] : 1 + Math.floor(tumble(i, t) * 6)));
      });
      for (const d of dice) d.classList.remove('rolling');
      const steps = (o) => Object.values(o || {}).reduce((s, v) => s + v, 0);
      result.textContent = `${r.dice[0]} + ${r.dice[1]} = ${r.roll} · losses: ours ${steps(r.attackerLost)}, theirs ${steps(r.defenderLost) + steps(r.retreatLost)}`;
    }
    stamp.textContent = r.taken ? 'OBJECTIVE TAKEN' : 'REPULSED';
    if (!r.taken) stamp.classList.add('failed');
  }

  // ---- the whole turn
  // Play `actions` back. When it's over (or skipped) the caller redraws the real state.
  async function play(actions) {
    const list = groups(actions);
    if (!list.length || reduceMotion()) return;
    playing = true; skipAll = false;
    view.bar.hidden = false;
    try {
      for (const g of list) {
        if (skipAll) break;
        const first = g.actions[0];
        view.barLabel.textContent = `${view.describe(first).sideName} ${g.type === 'attack' ? 'attacks' : 'moves'}`;
        // the board just before this group, then its arrows
        const before = g.type === 'move'
          ? { ...first.after, units: first.after.units.map((u) => (u.id === first.unit ? { ...u, box: first.from } : u)) }
          : null;
        if (before) view.showBoard(before);
        const arrows = view.mapView.drawOrders(g.actions.map(arrowOf));
        await wait(view.fast() ? 250 : 600);
        for (const [i, a] of g.actions.entries()) {
          if (skipAll) break;
          view.focus(a.kind === 'attack' ? a.target : a.to, a.kind === 'attack' ? Object.values(a.from || {})[0] : a.from);
          if (arrows[i]) arrows[i].remove();
          if (a.kind === 'attack') await playAttack(a);
          else await playMove(a);
        }
      }
    } finally {
      view.mapView.drawOrders([]);
      view.mapView.clearEffects();
      view.mapView.svg.classList.remove('playing');
      view.mapArea.classList.remove('shake');
      view.slip.hidden = true;
      view.bar.hidden = true;
      playing = false; skipNow = null;
    }
  }

  return {
    play,
    isPlaying: () => playing,
    // a tap on the map while playing: skip the animation running now
    tap() { if (skipNow) skipNow(); },
  };
}

// The pips on a die face (a 3 × 3 grid, numbered 0–8 left to right, top to bottom).
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function setFace(die, n) {
  die.setAttribute('aria-label', String(n));
  die.querySelectorAll('i').forEach((pip, k) => { pip.style.visibility = PIPS[n].includes(k) ? 'visible' : 'hidden'; });
}

// The tumbling faces are just for show (the real roll came from the seeded rng.js),
// so they come from a fixed pattern (CLAUDE.md: every random roll goes through rng.js).
const tumble = (i, t) => ((Math.sin((t * 37 + i * 11) * 12.9898) * 43758.5453) % 1 + 1) % 1;
