# CLAUDE.md — Western Front 1914–18

Read this file at the start of every session. It tells you what this project is, the
rules for how it's built, and how to work with me.

## What this is
A single-player, turn-based strategy game about the WWI Western Front, played on my
iPhone (foldable — works folded and unfolded) in Safari and added to the home screen.
1 turn = 1 month, December 1914 to November 1918 (48 turns). I play Germany or the
Entente; the computer plays the other side.

It's a hobby project. I'm **not an experienced programmer** — I'm learning by building
this with you. Version 1 is the Western Front only. Later versions add an economy, the
Eastern Front, more nations and the naval blockade, so build it to grow.

## Source-of-truth documents (read before changing rules or data)
- `docs/RULES.md` — the game rules in plain English. **The code must match this file.**
  If a rule changes, update RULES.md in the same change.
- `docs/HISTORY.md` — the historical facts behind the scenario data, with sources.
- `docs/MILESTONES.md` — the build plan. We do one milestone at a time.
- `docs/DATA.md` — what goes in each JSON data file (create it in milestone 2).
- `docs/ECONOMY.md` — the design record for the war economy (merged into RULES.md §19).
- `docs/STYLE.md` — the art direction: palette, fonts, map look, motion, sound, tone.
- `docs/PERFORMANCE.md` — speed measurements on a phone-sized, 4× slowed browser, and
  how the map stays fast. Re-measure with `node tools/perf.mjs` after changing the map.
- `docs/BALANCE.md` — results of the balance testing. Numbers tagged [balanced] in
  RULES.md came from `tools/wfsim.py` (a Python simulator of the rules). If a rule
  change touches balance, update the simulator to match and re-run it
  (`python3 tools/levels.py`) before changing the numbers. Tell me what changed.

## Tech rules (do not break these)
- Plain HTML, CSS and JavaScript (ES modules). **No build step, no frameworks, no npm
  runtime libraries.** It must run by being served as static files.
- Hosted on GitHub Pages from this public repo. **Never commit secrets or API keys.**
- Map is drawn in **SVG** (each box is a tappable `<path>` with an id). Panels,
  buttons and the log are normal HTML laid out with CSS grid.
- **Game logic is separate from the screen.** Everything in `js/engine/` takes a state
  and returns a new state. It never touches the page (no `document`, no `window`).
- **All game content lives in `data/*.json`.** The engine never hard-codes "France" or
  "Verdun". Adding a front or nation should be a data change, not a rewrite.
- **Every random roll goes through `js/engine/rng.js`** (seeded). Never use `Math.random()`.
- Saves go to localStorage, stamped with a `version` number, plus Export/Import of a JSON
  file as the real backup. Always wrap `JSON.parse` and storage calls in try/catch.
- File and folder names are **lowercase with hyphens** (GitHub Pages is case-sensitive).
- Use **relative paths** (`./js/main.js`), never paths starting with `/`.
- **Every release, raise the version** in `js/version.js` and the matching `?v=` number in
  `index.html` (stylesheet, import map, main.js), so phones fetch the new files instead
  of keeping old copies. The title screen shows the version. A new `js/` file needs an
  import-map line too (tests/run.mjs checks).

## Phone requirements
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
- Pad for the notch/home bar with `env(safe-area-inset-*)`; use `100dvh`, not `100vh`.
- Layout: map on top and panel below when narrow; side by side at ≥ 700px wide.
  Must re-lay out when I fold/unfold. No hard-coded widths.
- Every tap target at least 44×44px. No hover-only features.
- `touch-action: manipulation` on the map to stop double-tap zoom. (The map itself uses
  `touch-action: none`, because `js/ui/zoom.js` does its own pinch-zoom; that also stops
  double-tap zoom.)
- No service worker (offline mode) until I ask for it.

## Folder layout
```
index.html
css/style.css
js/main.js                 boot, load data, wire up the UI
js/engine/state.js         newGame(scenario, seed), validate, migrate
js/engine/turn.js          phase loop
js/engine/combat.js        combat table, odds preview
js/engine/rng.js           seeded RNG (mulberry32)
js/engine/boxes.js         map checks, box names, trench maximums
js/engine/ai.js            computer opponent (priority scoring)
js/engine/explain.js       plain-English help: roll outcomes, advice, best attacks, battle reports
js/engine/tutorial.js      the guided first turn's plan
js/engine/systems/         supply.js, will.js, economy.js (later: blockade.js)
js/engine/battles.js       the battle record (scars and pencil notes on the map)
js/ui/map.js  zoom.js  panel.js  log.js  demo.js  ledger.js  budget.js  help.js  tutorial.js
js/storage.js              save / load / export / import
data/nations.json  unit-types.json  boxes-west.json  terrain.json  events.json  combat-table.json
data/commanders.json  headlines.json  economy.json  help.json  tutorial.json
data/news.json  quotes.json         (already written: real history, don't change facts without a source)
data/scenarios/1914-west.json
tests/tests.html  tests/tests.js  tests/run.mjs
img/map-west.svg           the campaign map, made by tools/build-map.mjs (+ map-extra.json)
fonts/                     OFL fonts (fonts/CREDITS.md)
docs/RULES.md  HISTORY.md  MILESTONES.md  DATA.md  STYLE.md
```

## How to run and test
- Local: `python3 -m http.server 8000` then open http://localhost:8000
  (ES modules don't work by double-clicking the file).
- Tests: open `tests/tests.html` in a browser (green = pass), or `node tests/run.mjs`.
- **Add or update a test for every rule you implement.** Tests must use a fixed seed.

## How to work with me
Read docs/STYLE.md before building anything the player sees, and check every screen
against its 'Is it cheesy?' checklist before saying a milestone is done.

1. Work on **one milestone at a time** from `docs/MILESTONES.md`. Show me a short plan
   first and wait for my OK before writing code.
2. Keep functions small. Add comments a beginner can follow.
3. When you finish, **explain what you changed in plain English** and list the files you
   touched. Tell me exactly what to tap on my phone to check it works.
4. Run the tests before saying something is done.
5. Commit with a clear message (e.g. "Milestone 3: units and selection") and push, so
   GitHub Pages updates. Remind me it can take about a minute, and that iPhone may need
   a hard refresh.
6. If a rule in RULES.md is unclear or seems broken in play, **ask me** — don't invent a
   new rule quietly. Suggest a fix and the reason.
7. Don't add features that aren't in the current milestone. Put ideas in a
   "Later ideas" list at the bottom of MILESTONES.md instead.
