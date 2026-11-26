// tutorial.js — the guided first turn's coach: a strip of telegram paper over the map
// with one instruction at a time (data/tutorial.json), pencil arrows showing what to
// do, and SKIP TUTORIAL. Which territories it uses comes from js/engine/tutorial.js.
// Each step waits until the game state shows the player did it.

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

//   strip   — the coach's HTML element (hidden when not coaching)
//   mapView — js/ui/map.js (for the coach arrows)
//   names   — { place(boxId) → "Somme front line" }
//   phaseId(state) — the id of the phase the game is in
//   onEnd() — called when the tutorial finishes or is skipped
//   focus(a, b) — bring these territories into view
export function createCoach({ strip, mapView, names, phaseId, onEnd, focus = () => {} }) {
  let steps = null;
  let plan = null;
  let i = 0;
  let lastState = null;

  // A role in the plan ("front", "support"…) as a territory id.
  const boxOf = (role) => (typeof plan[role] === 'string' ? plan[role] : plan[role].box);
  const fill = (text) => text.replace(/\{(\w+)\}/g, (_, role) => (plan[role] ? names.place(boxOf(role)) : role));

  // Has the player done what this step waits for?
  function done(step, state) {
    const w = step.waitFor;
    const orders = state.orders || [];
    if (w.kind === 'move') {
      const unit = plan[w.unit].unit; const to = boxOf(w.to);
      const u = state.units.find((x) => x.id === unit);
      return orders.some((o) => o.kind === 'move' && o.unit === unit && o.to === to) || Boolean(u && u.box === to);
    }
    if (w.kind === 'phase') return phaseId(state) === w.phase || state.turn > 1;
    if (w.kind === 'attack') {
      return orders.some((o) => o.kind === 'attack' && o.target === plan.target && (o.munitions || 0) >= w.munitions) ||
        state.turn > 1 || (state.attacks || []).some((a) => a.box === plan.target);
    }
    if (w.kind === 'played') return state.turn > 1;
    return false;   // 'next': only the button moves on
  }

  function end() {
    steps = null;
    strip.hidden = true;
    document.body.classList.remove('coaching');
    mapView.showCoach([]);
    onEnd();
  }

  function draw() {
    const step = steps[i];
    strip.replaceChildren();
    // the buttons come first, so they stay in reach when the panel covers the strip's foot
    const row = el('div', 'coach-buttons');
    row.appendChild(el('span', 'coach-kicker', `GUIDED FIRST TURN \u00b7 ${i + 1} OF ${steps.length}`));
    if (step.waitFor.kind === 'next') {
      const next = el('button', 'btn btn-small btn-primary', step.waitFor.label || 'Next \u203a');
      next.type = 'button';
      next.addEventListener('click', advance);
      row.appendChild(next);
    } else {
      const skipStep = el('button', 'btn btn-small', 'Skip step');
      skipStep.type = 'button';
      skipStep.addEventListener('click', advance);
      row.appendChild(skipStep);
    }
    const skip = el('button', 'btn btn-small', 'End tutorial');
    skip.type = 'button';
    skip.addEventListener('click', end);
    row.appendChild(skip);
    strip.appendChild(row);
    strip.appendChild(el('p', 'coach-title', step.title));
    strip.appendChild(el('p', 'coach-text', fill(step.text)));
    mapView.showCoach(step.arrow ? [{ from: boxOf(step.arrow.from), to: boxOf(step.arrow.to), kind: step.arrow.kind }] : []);
    if (step.arrow) focus(boxOf(step.arrow.from), boxOf(step.arrow.to));   // bring the arrow into view
  }

  function advance() {
    i += 1;
    if (i >= steps.length) { end(); return; }
    draw();
    if (lastState) update(lastState);
  }

  // Start coaching with the steps from data/tutorial.json and a plan from
  // js/engine/tutorial.js.
  function start(tutorialSteps, tutorialPlan) {
    steps = tutorialSteps; plan = tutorialPlan; i = 0;
    strip.hidden = false;
    document.body.classList.add('coaching');
    draw();
  }

  // Called after every redraw: move on past any steps the player has done.
  //   playing — true while a turn is being played back (the strip waits)
  function update(state, playing = false) {
    lastState = state;
    if (!steps) return;
    strip.hidden = playing;
    if (playing) return;
    let moved = false;
    while (steps && i < steps.length && steps[i].waitFor.kind !== 'next' && done(steps[i], state)) { i += 1; moved = true; }
    if (!steps) return;
    if (i >= steps.length) { end(); return; }
    if (moved) draw();
  }

  return { start, update, stop: () => { if (steps) end(); }, active: () => Boolean(steps) };
}
