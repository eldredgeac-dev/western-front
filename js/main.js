// main.js — starts the app: loads the data files, wires up the buttons,
// and connects the map and the panel.
import { hasSave, saveGame, loadGame, readSave, saveText, exportName } from './storage.js';
import { checkMap, indexBoxes, boxName, trenchMax } from './engine/boxes.js';
import { newGame, currentMonth, monthLabel } from './engine/state.js';
import { loadMapSvg, createMapView } from './ui/map.js';
import { enableZoom } from './ui/zoom.js';
import { createLocator } from './ui/locator.js';
import { showPanel } from './ui/panel.js';
import { battleCounts, bigBattles, scarLevel, shortMonth } from './engine/battles.js';
import { applyDemo } from './ui/demo.js';
import { armisticeScore } from './engine/systems/will.js';
import { pendingChoice, chooseOption } from './engine/events.js';
import { unitsIn, unitType, nationOf } from './engine/units.js';
import { moveTargets, railTargets, moveUnit, railMove, phaseAllows } from './engine/moves.js';
import { beginGame, endPhase, phaseOf } from './engine/turn.js';
import { oddsPreview, resolveAttack, eligibleAttackers, barrageMax } from './engine/combat.js';
import { frontBoxes } from './engine/ai.js';
import { threat } from './engine/systems/replacements.js';

// Find the page elements we need once, at start-up.
const $ = (id) => document.getElementById(id);
const titleScreen = $('title-screen');
const gameScreen = $('game-screen');
const newGameButton = $('btn-new-game');
const continueButton = $('btn-continue');
const continueNote = $('continue-note');
const gameTitle = $('game-title');
const mapHolder = $('map-holder');
const panelArea = $('panel-area');
const sheet = $('panel-sheet');
const sheetHandle = $('sheet-handle');

// Everything loaded from data/*.json (and the map picture), filled in by loadData().
let data = null;
// The game being played (null until New Campaign is tapped).
let state = null;
// The drawn map and its zoom controls (made once, on the first New Campaign).
let mapView = null;
let zoom = null;
// The planned attack shown in demo mode, or null.
let demoAttack = null;
// What the player has picked: a territory, and maybe one of its units.
let selectedBox = null;
let selectedUnit = null;
// A message about the last order, if it wasn't allowed.
let orderError = null;
// The attack being planned on the order slip, or null:
// { target, units: [ids], munitions, result: null or [[label, value]…], taken }
let attack = null;

// Get localStorage safely: just reading `window.localStorage` can throw
// when storage is blocked.
function getStorage() {
  try {
    return window.localStorage;
  } catch (err) {
    return null;
  }
}

// Load one JSON file. Throws an Error with a friendly message if it fails.
async function loadJson(path) {
  let response;
  try {
    response = await fetch(path);
  } catch (err) {
    throw new Error(`Couldn't download ${path}. Check your connection.`);
  }
  if (!response.ok) throw new Error(`Couldn't find ${path} (error ${response.status}).`);
  try {
    return await response.json();
  } catch (err) {
    throw new Error(`${path} isn't valid JSON.`);
  }
}

// Load all the data files the game needs, and check the map makes sense.
async function loadData() {
  const [map, terrainData, nations, scenario, quotes, unitTypes, phases, combat, victory, events, ai] = await Promise.all([
    loadJson('./data/boxes-west.json'),
    loadJson('./data/terrain.json'),
    loadJson('./data/nations.json'),
    loadJson('./data/scenarios/1914-west.json'),
    loadJson('./data/quotes.json'),
    loadJson('./data/unit-types.json'),
    loadJson('./data/phases.json'),
    loadJson('./data/combat-table.json'),
    loadJson('./data/victory.json'),
    loadJson('./data/events.json'),
    loadJson('./data/ai.json'),
  ]);
  const problems = checkMap(map, terrainData);
  if (problems.length > 0) throw new Error('The map data has problems: ' + problems.join('; '));
  const mapSvg = await loadMapSvg(map.mapSvg);
  // `engine` is the bundle of data files the game engine (js/engine/) works with.
  const engine = { map, terrain: terrainData, nations, unitTypes, phases, combat, victory, events, ai };
  return { map, terrainData, nations, scenario, quotes, unitTypes, phases, engine, mapSvg, boxesById: indexBoxes(map) };
}

// Show one screen and hide the other.
function showScreen(screen) {
  titleScreen.hidden = screen !== titleScreen;
  gameScreen.hidden = screen !== gameScreen;
  window.scrollTo(0, 0);
}

// Continue and Export are only usable when a saved game exists.
function updateContinueButton() {
  const saved = hasSave(getStorage());
  continueButton.disabled = !saved;
  $('btn-export').disabled = !saved;
  continueNote.hidden = saved;
  if (!saved) continueNote.textContent = 'No saved campaign yet.';
}

// Auto-save (Milestone 8): after every change, so closing the app never loses a move.
function persist() {
  if (demoAttack) return;                  // the ?demo sample war is never saved
  if (state && !saveGame(getStorage(), state)) {
    orderError = 'The game could not be saved on this device (storage is full or blocked). Use Export to keep a copy.';
  }
}

// Continue: load the auto-saved campaign.
function continueGame() {
  if (!data) return;
  const loaded = loadGame(getStorage(), data.scenario, data.engine);
  if (!loaded.ok) { showTitleMessage(loaded.error); return; }
  demoAttack = null;
  playState(loaded.state);
}

// Export: the save as a file. On a phone this opens the share sheet (Save to Files,
// AirDrop, Mail…); elsewhere it downloads the file.
async function exportSave() {
  const loaded = state ? { ok: true, state } : loadGame(getStorage(), data.scenario, data.engine);
  if (!loaded.ok) { showTitleMessage(loaded.error); return; }
  const name = exportName(currentMonth(loaded.state));
  const file = new File([saveText(loaded.state)], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Western Front save' });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;   // the player closed the share sheet
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// Import: read a save file, check it, and play it.
function importSave(fileInput) {
  const file = fileInput.files && fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => showTitleMessage('That file could not be read.');
  reader.onload = () => {
    const r = readSave(String(reader.result), data.scenario, data.engine);
    if (!r.ok) { showTitleMessage(r.error); return; }
    demoAttack = null;
    playState(r.state);
    persist();
  };
  reader.readAsText(file);
}

function showTitleMessage(text) {
  continueNote.hidden = false;
  continueNote.textContent = text;
}

// The title screen shows Sir Edward Grey's words from data/quotes.json.
function showTitleQuote() {
  const quote = data.quotes.quotes.find((q) => q.trigger === 'game_start');
  if (!quote) return;
  $('title-quote-text').textContent = `“${quote.text}”`;
  $('title-quote-who').textContent = `— ${quote.who}, ${quote.when}`;
  $('title-quote').hidden = false;
}

// Gather everything the panel shows about one territory.
function boxInfo(boxId) {
  const { map, terrainData, nations } = data;
  const box = data.boxesById[boxId];
  const lane = map.lanes.find((l) => l.id === box.lane);
  const column = map.columns.find((c) => c.id === box.column);
  const boxState = state.boxes[boxId];
  const side = nations.sides.find((s) => s.id === boxState.owner);
  const month = currentMonth(state);
  return {
    name: boxName(map, box),
    town: box.anchor.town,
    laneNumber: lane.number,
    laneName: lane.name,
    columnLabel: column.label,
    columnName: column.name,
    ownerName: side ? side.name : boxState.owner,
    trench: boxState.trench,
    trenchMax: trenchMax(box, terrainData, month),
    monthLabel: monthLabel(month),
    vp: box.vp,
    terrain: box.terrain.map((id) => terrainData.types.find((t) => t.id === id)),
    units: unitsIn(state, boxId).map((u) => unitInfo(u)),
    selectedUnit,
  };
}

// How a unit looks on a counter: its nation's colour, its symbol and its max steps.
function lookFor(unit) {
  const type = unitType(data.engine, unit);
  const nation = nationOf(data.engine, unit.nation);
  const side = data.nations.sides.find((s) => s.nations.includes(unit.nation));
  return { color: nation.color, symbol: type.symbol, maxSteps: type.maxSteps, mirror: side && side.faces === 'left' };
}

// Everything the panel shows about one unit.
function unitInfo(unit) {
  const type = unitType(data.engine, unit);
  const quality = data.unitTypes.qualities.find((q) => q.id === unit.quality);
  return {
    id: unit.id, unit, look: lookFor(unit),
    title: `${nationOf(data.engine, unit.nation).adjective} ${type.name.toLowerCase()}`,
    steps: unit.steps, maxSteps: type.maxSteps, quality: quality ? quality.name : unit.quality,
    moves: moveTargets(state, orderData(), unit.id).length,
    rails: railTargets(state, orderData(), unit.id).length,
    why: whyNoOrders(unit),
  };
}

// Why a unit has no moves right now, in plain English.
function whyNoOrders(unit) {
  if (state.over) return 'The war is over.';
  if (!phaseAllows(state, orderData(), unit, 'move')) {
    return `It is the ${phaseOf(state, orderData()).name} phase. Units move in their own side's move phase.`;
  }
  if (unit.attacked) return 'This unit attacked this turn.';
  if (unit.moved) return 'This unit has already moved this turn.';
  return 'There is nowhere it can go.';
}

// The state of the war for the panel: each nation's Will, the running Armistice
// Score (RULES.md §11), mutinies, and the result once it's over.
function situation() {
  const score = armisticeScore(state, data.engine);
  const lead = Math.abs(score) <= data.engine.victory.armistice.margin ? 'too close to call'
    : score > 0 ? 'Germany ahead' : 'the Entente ahead';
  const notes = Object.entries(state.cannotAttack || {}).map(([n, why]) => `${nationOf(data.engine, n).name}: no attacks (${why})`);
  return {
    will: Object.entries(state.will).map(([n, w]) => [nationOf(data.engine, n).name, w]),
    score: `${score > 0 ? '+' : ''}${score.toFixed(1)} (${lead})`,
    notes,
    result: state.result ? state.result.reason : null,
  };
}

// Answer an event's question (the U-boat decision, the Hindenburg Line).
function answerChoice(optionId) {
  state = chooseOption(state, orderData(), optionId);
  persist();
  redraw();
  refreshPanel();
}

// The data the engine needs to check orders.
function orderData() {
  return data.engine;
}

// Show the panel for the selected territory (and unit).
function refreshPanel() {
  showPanel(panelArea, selectedBox ? boxInfo(selectedBox) : null, data.terrainData, {
    onUnit: selectUnit, log: state.log, error: orderError, situation: situation(),
    choice: pendingChoice(state, data.engine), onChoose: answerChoice,
    slip: attack ? attackSlip() : null,
    onToggleUnit: toggleAttacker, onMunitions: changeMunitions, onConfirm: confirmAttack, onCancel: closeAttack,
  });
  orderError = null;
}

// Tap a unit in the panel: show where it can move (brass) or go by rail (dashed).
function selectUnit(unitId) {
  selectedUnit = selectedUnit === unitId ? null : unitId;
  if (selectedUnit) {
    mapView.showTargets(moveTargets(state, orderData(), selectedUnit), railTargets(state, orderData(), selectedUnit));
  } else {
    mapView.showTargets([], []);
  }
  refreshPanel();
}

// Folded phone: the panel is a sheet that slides up from the bottom.
function openSheet(open) {
  sheet.classList.toggle('open', open);
  sheetHandle.setAttribute('aria-expanded', String(open));
  $('game-screen').classList.toggle('sheet-open', open);     // hides the locator when folded
}

// A tap on the map. If a unit is selected and the tapped territory is lit up,
// that's an order to move there (by road if it's next door, otherwise by rail).
// Otherwise it selects the territory.
function tapBox(boxId) {
  if (isAttackTarget(boxId)) {
    selectBox(boxId);
    openAttack(boxId);
    refreshPanel();
    return;
  }
  if (attack) closeAttack();
  if (selectedUnit) {
    const near = moveTargets(state, orderData(), selectedUnit);
    const rail = railTargets(state, orderData(), selectedUnit);
    if (near.includes(boxId) || rail.includes(boxId)) {
      try {
        state = near.includes(boxId)
          ? moveUnit(state, orderData(), selectedUnit, boxId)
          : railMove(state, orderData(), selectedUnit, boxId);
      } catch (err) {
        orderError = err.message;
      }
      persist();
      redraw();
      selectBox(boxId);
      return;
    }
  }
  selectBox(boxId);
}

// ---------------------------------------------------------------- attacks
// Is it an attack phase, and is this territory an enemy of the side attacking?
function isAttackTarget(boxId) {
  const phase = phaseOf(state, orderData());
  return !state.over && phase && phase.kind === 'attack' && state.boxes[boxId].owner !== phase.side;
}

// Open the order slip for an attack on this territory, with every unit that can
// attack it already chosen.
function openAttack(boxId) {
  attack = { target: boxId, units: eligibleAttackers(state, orderData(), boxId), munitions: 0, result: null };
  showAttackArrow();
}

// The grease-pencil arrow from the strongest chosen unit to the target.
function showAttackArrow() {
  const chosen = attack.units.map((id) => state.units.find((u) => u.id === id)).filter(Boolean);
  if (attack.result || !chosen.length) { mapView.clearPlannedAttack(); return; }
  const lead = chosen.reduce((a, b) => (b.steps > a.steps ? b : a));
  mapView.showPlannedAttack(lead.box, attack.target);
}

// Everything the order slip shows, worked out by the combat engine.
function attackSlip() {
  const box = data.boxesById[attack.target];
  const order = { target: attack.target, units: attack.units, munitions: attack.munitions };
  const defenders = unitsIn(state, attack.target);
  const defSteps = defenders.reduce((s, u) => s + u.steps, 0);
  const slip = {
    targetName: boxName(data.map, box),
    defenderText: defenders.length
      ? `Held by ${defenders.length} unit${defenders.length === 1 ? '' : 's'} (${defSteps} steps), trench level ${state.boxes[attack.target].trench}.`
      : 'No enemy units hold it.',
    units: eligibleAttackers(state, orderData(), attack.target).map((id) => {
      const u = state.units.find((x) => x.id === id);
      return { ...unitInfo(u), chosen: attack.units.includes(id) };
    }),
    munitions: attack.munitions, munitionsMax: 0, shifts: [], reasons: [],
    result: attack.result, taken: attack.taken,
  };
  if (attack.result || !attack.units.length) {
    slip.ok = false;
    if (!attack.units.length && !attack.result) slip.reasons = ['Choose at least one unit.'];
    return slip;
  }
  const odds = oddsPreview(state, orderData(), order);
  const plan = odds.plan;
  const payer = plan.payer ? nationOf(data.engine, plan.payer) : null;
  slip.ok = plan.ok;
  slip.reasons = plan.reasons;
  slip.empty = plan.empty;
  slip.shifts = plan.shifts || [];
  if (plan.ratioColumn !== null && plan.ratioColumn >= 0) {
    slip.ratioText = `${plan.attackSteps} steps against ${plan.defendSteps} \u2192 ${data.engine.combat.columns[plan.ratioColumn].label}`;
    slip.finalLabel = plan.columnLabel;
    slip.pTake = odds.pTake; slip.attackerLoss = odds.attackerLoss; slip.defenderLoss = odds.defenderLoss;
    // The Recruit advisor (RULES.md §13): warn before a futile attack.
    const level = data.engine.ai.levels.find((l) => l.id === state.level);
    const worst = data.engine.combat.columns.findIndex((c) => c.label === data.engine.combat.futile.worstColumn);
    if (level && level.advisor && plan.finalColumn <= worst) {
      slip.warning = `ADVISOR: This attack will probably fail and cost ${data.engine.combat.futile.will} Will. Attack anyway?`;
    }
  } else if (!plan.empty && plan.ratioColumn !== null) {
    slip.ratioText = `${plan.attackSteps} steps against ${plan.defendSteps} \u2192 below 1:2`;
  }
  if (payer) {
    const left = state.resources[payer.id];
    slip.cost = `${plan.opCost} OP from ${payer.name} (${left.op} left)`;
    slip.munitionsMax = Math.min(barrageMax(data.engine, currentMonth(state)), left.munitions);
  }
  return slip;
}

function toggleAttacker(unitId) {
  attack.units = attack.units.includes(unitId) ? attack.units.filter((x) => x !== unitId) : [...attack.units, unitId];
  showAttackArrow();
  refreshPanel();
}
function changeMunitions(change) {
  attack.munitions = Math.max(0, attack.munitions + change);
  refreshPanel();
}

// CONFIRM ORDER: roll the dice and show what happened on the slip.
function confirmAttack() {
  let out;
  try {
    out = resolveAttack(state, orderData(), { target: attack.target, units: attack.units, munitions: attack.munitions });
  } catch (err) {
    orderError = err.message;
    refreshPanel();
    return;
  }
  state = out.state;
  persist();
  const r = out.result;
  const steps = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
  const lines = [];
  if (r.empty) lines.push(['Result', 'taken without a fight']);
  else {
    lines.push(['Column', r.plan.columnLabel], ['Dice', `${r.dice[0]} + ${r.dice[1]} = ${r.roll}`],
      ['Table', `A${r.cell.a} D${r.cell.d}${r.cell.r ? ' R' : ''}`],
      ['Our losses', `${steps(r.attackerLost)} steps`], ['Their losses', `${steps(r.defenderLost) + steps(r.retreatLost)} steps`]);
    if (r.futile) lines.push(['Futile attack', `\u2212${data.engine.combat.futile.will} Will`]);
  }
  for (const [nat, w] of Object.entries(r.will || {})) {
    if (!r.futile || nat !== r.plan.payer) lines.push([`${nationOf(data.engine, nat).name} Will`, w > 0 ? `+${w}` : `\u2212${-w}`]);
  }
  attack.result = lines;
  attack.taken = r.taken;
  mapView.clearPlannedAttack();
  redraw();
  refreshPanel();
}

function closeAttack() {
  attack = null;
  mapView.clearPlannedAttack();
  refreshPanel();
}

// Called when a territory is selected: highlight it and show its details.
function selectBox(boxId) {
  selectedBox = boxId;
  selectedUnit = null;
  mapView.showTargets([], []);
  mapView.select(boxId);
  refreshPanel();
  openSheet(true);
}

// Draw the map the first time; afterwards just repaint it for the new state.
function showMap() {
  if (!mapView) {
    mapView = createMapView(mapHolder, data.mapSvg, {
      nations: data.nations,
      boxNameFn: (id) => boxName(data.map, data.boxesById[id]),
      // pencil notes use the box's name, or its town if it has none ("Thiepval")
      noteNameFn: (id) => data.boxesById[id].name || data.boxesById[id].anchor.town,
      shortMonthFn: shortMonth,
    });
    const vb = mapView.svg.viewBox.baseVal;
    const mapSize = { w: vb.width, h: vb.height };          // the whole map, in map units
    zoom = enableZoom(mapView.svg, {
      onTap: tapBox,
      onViewChange: (k) => { mapView.declutter(); mapView.layout(k); showLocator(zoom.current()); },
      home: mapView.frontBounds,
      start: startPoint,
    });
    showLocator = createLocator($('locator'), mapSize, (x, y) => zoom.centreOn(x, y));
    $('btn-zoom-in').addEventListener('click', () => zoom.zoomIn());
    $('btn-zoom-out').addEventListener('click', () => zoom.zoomOut());
    $('btn-zoom-fit').addEventListener('click', () => zoom.fit());
  }
  redraw();
  mapView.select(null);
  mapView.showTargets([], []);
  if (demoAttack) mapView.showPlannedAttack(...demoAttack);
  else mapView.clearPlannedAttack();
  zoom.startView();
}

let showLocator = () => {};      // set up in showMap() (js/ui/locator.js)

// Where the map starts: your most threatened front-line territory (RULES.md §14's
// threat score), or the middle of the front when you play both sides.
function startPoint() {
  const humans = Object.entries(state.controllers || {}).filter(([, who]) => who === 'human').map(([side]) => side);
  if (humans.length === 1) {
    const boxes = frontBoxes(state, data.engine, humans[0]);
    if (boxes.length) {
      const worst = boxes.reduce((a, b) => (threat(state, data.engine, b) > threat(state, data.engine, a) ? b : a));
      const t = document.getElementById(worst);
      return [Number(t.dataset.x), Number(t.dataset.y)];
    }
  }
  const b = mapView.frontBounds();
  return b ? [b[0] + b[2] / 2, b[1] + b[3] / 2] : null;
}


// Repaint the map, the top bar and anything that depends on the game state.
function redraw() {
  const month = currentMonth(state);
  const record = { counts: battleCounts(state), big: bigBattles(state), scarLevel };
  mapView.update(state, month, monthLabel(month), record);
  mapView.drawUnits(state.units, lookFor);
  gameTitle.textContent = monthLabel(month);
  const phase = phaseOf(state, orderData());
  $('phase-label').textContent = state.over ? 'The war is over' : (phase ? phase.name : '');
  $('btn-end-phase').disabled = state.over || Boolean(state.pendingChoice);
  if (state.pendingChoice) openSheet(true);
}

// End Phase: on to the next phase that needs orders.
function nextPhase() {
  state = endPhase(state, orderData());
  persist();
  attack = null;
  mapView.clearPlannedAttack();
  selectedUnit = null;
  mapView.showTargets([], []);
  redraw();
  refreshPanel();
}

// New Campaign: show the side and difficulty choices (RULES.md §13).
const setup = { player: 'entente', level: 'regular' };
const LEVEL_NOTES = {
  recruit: 'Recruit: +15 Will for you, the computer has fewer guns and men, and an advisor warns before hopeless attacks.',
  regular: 'Regular: an even fight.',
  veteran: 'Veteran: the computer has +5 Will and 15% more guns and men.',
  'field-marshal': 'Field Marshal: the computer has +10 Will, 30% more guns and men, and plays like an expert.',
};
function showSetup() {
  $('setup').hidden = false;
  document.querySelector('.title-buttons').hidden = true;
  refreshSetup();
}
function refreshSetup() {
  for (const b of document.querySelectorAll('[data-side]')) b.setAttribute('aria-pressed', String(b.dataset.side === setup.player));
  for (const b of document.querySelectorAll('[data-level]')) {
    b.setAttribute('aria-pressed', String(b.dataset.level === setup.level));
    b.disabled = setup.player === 'both';
  }
  $('setup-note').textContent = setup.player === 'both'
    ? 'Two players: you give orders for both sides, passing the phone. Good for learning the rules.'
    : LEVEL_NOTES[setup.level];
}

// Start a new game and show the map.
function startGame() {
  if (!data) return;
  $('setup').hidden = true;
  document.querySelector('.title-buttons').hidden = false;
  // The seed only has to be different each game; every roll then goes
  // through the seeded rng.js (from Milestone 5).
  state = newGame(data.scenario, Date.now() % 2147483647, data.engine, { ...setup });
  selectedBox = null;
  selectedUnit = null;
  attack = null;
  // "?demo" in the address shows a sample war on the map (js/ui/demo.js).
  demoAttack = new URLSearchParams(window.location.search).has('demo') ? applyDemo(state) : null;
  state = beginGame(state, orderData());
  playState(state);
  persist();
}

// Show the game screen for a state (new, continued or imported).
function playState(newState) {
  state = newState;
  selectedBox = null;
  selectedUnit = null;
  attack = null;
  showScreen(gameScreen);
  gameTitle.textContent = monthLabel(currentMonth(state));
  showMap();
  refreshPanel();
  openSheet(false);
}

// If the data can't load, say so on the title screen instead of breaking.
function showLoadError(err) {
  newGameButton.disabled = true;
  continueNote.hidden = false;
  continueNote.textContent = 'The game data failed to load: ' + err.message +
    ' Try reloading the page.';
}

// The sheet handle: tap to open or close, or swipe it up or down.
function wireSheet() {
  let startY = null;
  let swiped = false;   // a swipe also fires a click; ignore that click
  sheetHandle.addEventListener('click', () => {
    if (swiped) { swiped = false; return; }
    openSheet(!sheet.classList.contains('open'));
  });
  sheetHandle.addEventListener('pointerdown', (e) => { startY = e.clientY; });
  sheetHandle.addEventListener('pointerup', (e) => {
    if (startY === null) return;
    const moved = e.clientY - startY;
    if (Math.abs(moved) > 30) { swiped = true; openSheet(moved < 0); }
    startY = null;
  });
}

async function boot() {
  updateContinueButton();
  newGameButton.addEventListener('click', showSetup);
  $('btn-begin').addEventListener('click', startGame);
  for (const b of document.querySelectorAll('[data-side]')) b.addEventListener('click', () => { setup.player = b.dataset.side; refreshSetup(); });
  for (const b of document.querySelectorAll('[data-level]')) b.addEventListener('click', () => { setup.level = b.dataset.level; refreshSetup(); });
  continueButton.addEventListener('click', continueGame);
  $('btn-export').addEventListener('click', exportSave);
  $('btn-import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', (e) => importSave(e.target));
  $('btn-back').addEventListener('click', () => { showScreen(titleScreen); updateContinueButton(); });
  $('btn-end-phase').addEventListener('click', () => { if (state) nextPhase(); });
  wireSheet();

  newGameButton.disabled = true;   // until the data has loaded
  try {
    data = await loadData();
    newGameButton.disabled = false;
    showTitleQuote();
  } catch (err) {
    showLoadError(err);
  }
}

boot();
