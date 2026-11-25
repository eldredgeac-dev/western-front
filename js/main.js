// main.js — starts the app: loads the data files, wires up the buttons,
// and connects the map and the panel.
import { hasSave } from './storage.js';
import { checkMap, indexBoxes, boxName, trenchMax } from './engine/boxes.js';
import { newGame, currentMonth, monthLabel } from './engine/state.js';
import { loadMapSvg, createMapView } from './ui/map.js';
import { enableZoom } from './ui/zoom.js';
import { showPanel } from './ui/panel.js';
import { battleCounts, bigBattles, scarLevel, shortMonth } from './engine/battles.js';
import { applyDemo } from './ui/demo.js';
import { unitsIn, unitType, nationOf } from './engine/units.js';
import { moveTargets, railTargets, moveUnit, railMove, phaseAllows } from './engine/moves.js';
import { beginGame, endPhase, phaseOf } from './engine/turn.js';

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
  const [map, terrainData, nations, scenario, quotes, unitTypes, phases] = await Promise.all([
    loadJson('./data/boxes-west.json'),
    loadJson('./data/terrain.json'),
    loadJson('./data/nations.json'),
    loadJson('./data/scenarios/1914-west.json'),
    loadJson('./data/quotes.json'),
    loadJson('./data/unit-types.json'),
    loadJson('./data/phases.json'),
  ]);
  const problems = checkMap(map, terrainData);
  if (problems.length > 0) throw new Error('The map data has problems: ' + problems.join('; '));
  const mapSvg = await loadMapSvg(map.mapSvg);
  // `engine` is the bundle of data files the game engine (js/engine/) works with.
  const engine = { map, terrain: terrainData, nations, unitTypes, phases };
  return { map, terrainData, nations, scenario, quotes, unitTypes, phases, engine, mapSvg, boxesById: indexBoxes(map) };
}

// Show one screen and hide the other.
function showScreen(screen) {
  titleScreen.hidden = screen !== titleScreen;
  gameScreen.hidden = screen !== gameScreen;
  window.scrollTo(0, 0);
}

// Continue is only usable when a saved game exists.
function updateContinueButton() {
  const saved = hasSave(getStorage());
  continueButton.disabled = !saved;
  continueNote.hidden = saved;
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
  return { color: nationOf(data.engine, unit.nation).color, symbol: type.symbol, maxSteps: type.maxSteps };
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

// The data the engine needs to check orders.
function orderData() {
  return data.engine;
}

// Show the panel for the selected territory (and unit).
function refreshPanel() {
  showPanel(panelArea, selectedBox ? boxInfo(selectedBox) : null, data.terrainData,
    { onUnit: selectUnit, log: state.log, error: orderError });
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
}

// A tap on the map. If a unit is selected and the tapped territory is lit up,
// that's an order to move there (by road if it's next door, otherwise by rail).
// Otherwise it selects the territory.
function tapBox(boxId) {
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
      redraw();
      selectBox(boxId);
      return;
    }
  }
  selectBox(boxId);
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
    zoom = enableZoom(mapView.svg, {
      onTap: tapBox,
      onViewChange: (k) => { mapView.rescale(k); mapView.declutter(); },
      home: mapView.frontBounds,
    });
    $('btn-zoom-in').addEventListener('click', () => zoom.zoomIn());
    $('btn-zoom-out').addEventListener('click', () => zoom.zoomOut());
    $('btn-zoom-fit').addEventListener('click', () => zoom.fit());
  }
  redraw();
  mapView.select(null);
  mapView.showTargets([], []);
  if (demoAttack) mapView.showPlannedAttack(...demoAttack);
  else mapView.clearPlannedAttack();
  zoom.fit();
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
  $('btn-end-phase').disabled = state.over;
}

// End Phase: on to the next phase that needs orders.
function nextPhase() {
  state = endPhase(state, orderData());
  selectedUnit = null;
  mapView.showTargets([], []);
  redraw();
  refreshPanel();
}

// Start a new game and show the map.
function startGame() {
  if (!data) return;
  // The seed only has to be different each game; every roll then goes
  // through the seeded rng.js (from Milestone 5).
  state = newGame(data.scenario, Date.now() % 2147483647, data.engine);
  selectedBox = null;
  selectedUnit = null;
  // "?demo" in the address shows a sample war on the map (js/ui/demo.js).
  demoAttack = new URLSearchParams(window.location.search).has('demo') ? applyDemo(state) : null;
  state = beginGame(state, orderData());
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
  newGameButton.addEventListener('click', startGame);
  // Saved games arrive in Milestone 8; until then Continue starts a fresh game.
  continueButton.addEventListener('click', startGame);
  $('btn-back').addEventListener('click', () => showScreen(titleScreen));
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
