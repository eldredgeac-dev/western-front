// main.js — starts the app: loads the data files, wires up the buttons,
// and connects the map and the panel.
import { hasSave } from './storage.js';
import { checkMap, indexBoxes, boxName, trenchMax } from './engine/boxes.js';
import { newGame, currentMonth, monthLabel } from './engine/state.js';
import { drawMap } from './ui/map.js';
import { showPanel } from './ui/panel.js';

// Find the page elements we need once, at start-up.
const titleScreen = document.getElementById('title-screen');
const gameScreen = document.getElementById('game-screen');
const newGameButton = document.getElementById('btn-new-game');
const continueButton = document.getElementById('btn-continue');
const continueNote = document.getElementById('continue-note');
const backButton = document.getElementById('btn-back');
const gameTitle = document.getElementById('game-title');
const mapArea = document.getElementById('map-area');
const panelArea = document.getElementById('panel-area');

// Everything loaded from data/*.json, filled in by loadData().
let data = null;
// The game being played (null until New Game is tapped).
let state = null;
// Lets us highlight a box on the drawn map.
let mapView = null;

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
  const [map, terrainData, nations, scenario] = await Promise.all([
    loadJson('./data/boxes-west.json'),
    loadJson('./data/terrain.json'),
    loadJson('./data/nations.json'),
    loadJson('./data/scenarios/1914-west.json'),
  ]);
  const problems = checkMap(map, terrainData);
  if (problems.length > 0) throw new Error('The map data has problems: ' + problems.join('; '));
  return { map, terrainData, nations, scenario, boxesById: indexBoxes(map) };
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

// Gather everything the panel shows about one box.
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
  };
}

// Called when a box is tapped: highlight it and show its details.
function selectBox(boxId) {
  mapView.select(boxId);
  showPanel(panelArea, boxInfo(boxId), data.terrainData);
}

// Start a new game and draw the map.
function startGame() {
  if (!data) return;
  // The seed only has to be different each game; every roll then goes
  // through the seeded rng.js (from Milestone 5).
  state = newGame(data.scenario, Date.now() % 2147483647);
  showScreen(gameScreen);
  gameTitle.textContent = monthLabel(currentMonth(state));
  mapView = drawMap(mapArea, {
    map: data.map,
    terrainData: data.terrainData,
    nations: data.nations,
    state,
    boxNameFn: (box) => boxName(data.map, box),
    onSelect: selectBox,
  });
  showPanel(panelArea, null, data.terrainData);
}

// If the data can't load, say so on the title screen instead of breaking.
function showLoadError(err) {
  newGameButton.disabled = true;
  continueNote.hidden = false;
  continueNote.textContent = 'The game data failed to load: ' + err.message +
    ' Try reloading the page.';
}

async function boot() {
  updateContinueButton();
  newGameButton.addEventListener('click', startGame);
  // Saved games arrive in Milestone 7; until then Continue starts a fresh game.
  continueButton.addEventListener('click', startGame);
  backButton.addEventListener('click', () => showScreen(titleScreen));

  newGameButton.disabled = true;   // until the data has loaded
  try {
    data = await loadData();
    newGameButton.disabled = false;
  } catch (err) {
    showLoadError(err);
  }
}

boot();
