// main.js — starts the app: loads the data files, wires up the buttons,
// and connects the map and the panel.
import { VERSION, VERSION_LABEL } from './version.js';
import { hasSave, saveGame, loadGame, readSave, saveText, exportName } from './storage.js';
import { checkMap, indexBoxes, boxName, trenchMax } from './engine/boxes.js';
import { newGame, currentMonth, monthLabel } from './engine/state.js';
import { loadMapSvg, createMapView } from './ui/map.js';
import { enableZoom } from './ui/zoom.js';
import { createLocator } from './ui/locator.js';
import { buildBoardSvg, BOARD_PREFIX, BOARD_PIECE } from './ui/board.js';
import { showPanel } from './ui/panel.js';
import { battleCounts, bigBattles, scarLevel, shortMonth } from './engine/battles.js';
import { applyDemo } from './ui/demo.js';
import { armisticeScore } from './engine/systems/will.js';
import { unseenTelegrams, markSeen, openQuestion } from './engine/telegrams.js';
import { showTelegram, hideTelegram, showTelegramLog } from './ui/telegram.js';
import { unitsIn, unitType, nationOf } from './engine/units.js';
import { moveTargets, railTargets, phaseAllows, splitUnit, splitReason, mergeUnits, mergeReason } from './engine/moves.js';
import { beginGame, endPhase, phaseOf, submitBudget, answerEvent, answerCommander } from './engine/turn.js';
import { onceShift, cardById, cardFacts, currentCard, unseenCardNews, markCardSeen, sackReason, sackCommander, successors, sideOfHolder } from './engine/commanders.js';
import { showCardNews, showCardQuestion, hideCardScreen, commanderSection } from './ui/commander.js';
import { oddsPreview, eligibleAttackers, barrageMax } from './engine/combat.js';
import { frontBoxes } from './engine/ai.js';
import { queueCheck, addOrder, cancelOrder, commitOrders, snapshot, attackBoard, stagingBox, ordersPhase } from './engine/orders.js';
import { createPlayback } from './ui/animate.js';
import { ledger } from './engine/history.js';
import { attackAdvice, bestAttacks, phaseGuide, phaseSummary, attackableBoxes, battleReport } from './engine/explain.js';
import { showLedger } from './ui/ledger.js';
import { showBudget } from './ui/budget.js';
import { showHelp } from './ui/help.js';
import { createCoach } from './ui/tutorial.js';
import { tutorialPlan } from './engine/tutorial.js';
import { threat } from './engine/systems/replacements.js';
import { inSupply } from './engine/supply.js';

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
// The two views of the war (made once, on the first New Campaign): the board
// (js/ui/board.js) and the campaign map. `viewName` says which is on screen.
// `mapView` and `zoom` always mean the one on screen: they pass every call on to it,
// so the playback, the tutorial and the arrows follow the Board | Map switch.
const views = {};
let viewName = null;
let mapView = null;
let zoom = null;
// The planned attack shown in demo mode, or null.
let demoAttack = null;
// What the player has picked: a territory, and maybe one of its units.
let selectedBox = null;
let selectedUnit = null;
// A message about the last order, if it wasn't allowed.
let orderError = null;
// The attack being set up on the order slip, or null: { target, units: [ids], munitions }
let attack = null;
// The queued order whose arrow was tapped (its place in state.orders), or null.
let selectedOrder = null;
// Plays a committed turn back on the map (js/ui/animate.js); made in showMap().
let playback = null;
// Settings kept on this phone: { fast: true } for fast mode (STYLE.md §8).
const SETTINGS_KEY = 'western-front-settings';
let settings = readSettings();
function readSettings() {
  try {
    return JSON.parse(getStorage()?.getItem(SETTINGS_KEY) || '{}') || {};
  } catch (err) {
    return {};
  }
}
function saveSettings() {
  try { getStorage()?.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (err) { /* not saved: fine */ }
}

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
    response = await fetch(`${path}?v=${VERSION}`);     // the version stamp: no stale copies
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
  // The map picture is the biggest download: start it as soon as boxes-west.json says
  // where it is, alongside the other files, not after them all (docs/PERFORMANCE.md).
  const mapFile = loadJson('./data/boxes-west.json');
  const mapPicture = mapFile.then((m) => loadMapSvg(`${m.mapSvg}?v=${VERSION}`));
  mapPicture.catch(() => {});      // a failure is reported below, where it's awaited
  const [map, terrainData, nations, scenario, quotes, unitTypes, phases, combat, victory, events, ai, commanders, economy, help, tutorial] = await Promise.all([
    mapFile,
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
    loadJson('./data/commanders.json'),
    loadJson('./data/economy.json'),
    loadJson('./data/help.json'),
    loadJson('./data/tutorial.json'),
  ]);
  const problems = checkMap(map, terrainData);
  if (problems.length > 0) throw new Error('The map data has problems: ' + problems.join('; '));
  const mapSvg = await mapPicture;
  // `engine` is the bundle of data files the game engine (js/engine/) works with.
  const engine = { map, terrain: terrainData, nations, unitTypes, phases, combat, victory, events, ai, commanders, economy };
  return { map, terrainData, nations, scenario, quotes, unitTypes, phases, engine, mapSvg, help, tutorial, boxesById: indexBoxes(map) };
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
    moves: moveTargets(previewFor(unit.id), orderData(), unit.id).length,
    rails: railTargets(previewFor(unit.id), orderData(), unit.id).length,
    why: whyNoOrders(unit),
    status: unitStatus(unit),
    split: splitInfo(unit),
    merge: mergeInfo(unit),
    rule: unitRule(unit),
    ordered: queuedMove(unit.id) ? { index: queuedMove(unit.id).index, text: `Ordered to ${placeName(queuedMove(unit.id).order.to)}` } : null,
  };
}

// Splitting (RULES.md §8): which sizes can split off this piece now, or why not.
// Only shown in the piece's own move phase.
function splitInfo(unit) {
  if (!humanPhase() || !phaseAllows(state, orderData(), unit, 'move')) return null;
  const why = splitReason(state, orderData(), unit.id);
  return { reason: why, sizes: why ? [] : Array.from({ length: unit.steps - 1 }, (_, i) => i + 1) };
}
// Merging: the other pieces in this territory it can merge with now.
function mergeInfo(unit) {
  if (!humanPhase() || !phaseAllows(state, orderData(), unit, 'move')) return [];
  return unitsIn(state, unit.box).filter((o) => o.id !== unit.id && !mergeReason(state, orderData(), unit.id, o.id))
    .map((o) => ({ id: o.id, text: `Merge with the ${o.steps}-step piece` }));
}
// Split `steps` off the selected piece: the new piece stays here; the old one stays selected.
function splitSelected(unitId, steps) {
  try { state = splitUnit(state, orderData(), unitId, steps).state; } catch (err) { orderError = err.message; }
  persist();
  selectedUnit = null;
  redraw();
  selectUnit(unitId);
}
// Merge another piece into the selected one.
function mergeSelected(unitId, otherId) {
  try { state = mergeUnits(state, orderData(), unitId, otherId); } catch (err) { orderError = err.message; }
  persist();
  selectedUnit = null;
  redraw();
  selectUnit(unitId);
}

// Short marks for what a unit has done this turn (the unit list and its piece).
function unitStatus(unit) {
  const out = [];
  if (unit.railed) out.push('RAIL \u00b7 can\u2019t attack');
  else if (unit.moved) out.push('MOVED');
  if (unit.attacked) out.push('ATTACKED');
  if (!inSupply(state, orderData(), unit)) out.push('NO SUPPLY');
  return out;
}

// The rule that matters for this unit right now, in one line.
function unitRule(unit) {
  const phase = humanPhase();
  if (!phase || !phaseAllows(state, orderData(), unit, phase.kind)) return null;
  const nation = nationOf(data.engine, unit.nation);
  if (phase.kind === 'move') {
    const rail = (state.resources[unit.nation] || {}).rail || 0;
    return `Road: up to 2 territories through your own lines (3 pieces at most where it stops). Rail: any distance through your own ` +
      `connected territory; ${nation.name} has ${rail} rail move${rail === 1 ? '' : 's'} left, and a unit that goes by rail can\u2019t attack this turn. ` +
      'You can also split a piece to leave a few steps behind, or merge two pieces.' +
      (ordersPhase(state, orderData()) ? ' Attack: tap an enemy territory outlined in red; if the unit has to step up first, ' +
        'that road move is ordered for you. All moves happen before the attacks.' : '');
  }
  if (unit.railed) return 'It came by rail this turn, so it can\u2019t attack until next month.';
  if (unit.attacked) return 'It has already attacked this turn.';
  if (!inSupply(state, orderData(), unit)) return 'It is out of supply, so it can\u2019t attack.';
  return 'Attack phase: tap an enemy territory next to this unit (outlined in red). Each unit attacks once a turn.';
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

// Answer an event's question (the U-boat decision, the Hindenburg Line), from the
// buttons on its telegram.
// The turn then carries on (the commanders and the War Office budget still come this
// month), and anything the computer does next is played back, as after COMMIT.
async function answerChoice(optionId) {
  const asked = openQuestion(state);
  const actions = [];
  state = answerEvent(state, orderData(), optionId, { record: (action, s) => actions.push({ ...action, after: snapshot(s) }) });
  if (asked) state = markSeen(state, asked.n);
  persist();
  if (actions.length) await playTurn(actions);
  else { redraw(); refreshPanel(); }
}

// ---------------------------------------------------------------- commander cards
// (RULES.md §15, js/ui/commander.js) The card screen shows, in this order: a question
// waiting for your answer ("Replace Joffre with Nivelle?"), then any card that has
// arrived since you last looked (yours or the enemy's). Never during a playback.
const holderColor = (key) => {
  const n = data.engine.nations.nations.find((x) => x.id === key);
  return n ? n.color : (data.engine.nations.sides.find((x) => x.id === key) || {}).color;
};
const holderName = (key) => {
  const n = data.engine.nations.nations.find((x) => x.id === key);
  return n ? n.name : (data.engine.nations.sides.find((x) => x.id === key) || {}).name;
};
const cardOf = (id) => ({ facts: cardFacts(data.engine, id), color: holderColor(cardFacts(data.engine, id).key) });
let cardShown = null;   // what's on the card screen ('q fra 25' or 'n 3'), so a redraw doesn't rebuild it
function showCommanders() {
  const host = $('commander-screen');
  const busy = !state || state.over || gameScreen.hidden || (playback && playback.isPlaying());
  const ask = busy ? null : (state.pendingCommander || [])[0];
  if (ask) {
    const key = `q ${ask.key} ${state.turn}`;
    if (cardShown === key && !host.hidden) return;
    cardShown = key;
    const cur = cardById(data.engine, ask.current);
    const names = ask.offers.map((id) => cardById(data.engine, id).name);
    const rules = data.engine.commanders.rules;
    showCardQuestion(host, {
      month: currentMonth(state),
      heading: `Replace ${cur.name} with ${names.join(' or ')}?`,
      sub: `${holderName(ask.key)}: ${cur.name}'s time in command has passed.`,
      offers: ask.offers.map(cardOf),
      current: cardOf(ask.current),
      keepText: `${rules.keepOldCommanderWill} ${holderName(ask.key)} Will now; you'll be asked again in ${rules.askAgainEveryTurns} months.`,
    }, { monthName: monthLabel, onChoose: (choice) => answerCard(ask.key, choice) });
    return;
  }
  const news = busy ? [] : unseenCardNews(state);
  if (news.length) {
    const x = news[0];
    const key = `n ${x.n}`;
    if (cardShown === key && !host.hidden) return;
    cardShown = key;
    const card = cardById(data.engine, x.card);
    const old = x.replaced ? cardById(data.engine, x.replaced) : null;
    const sideName = (data.engine.nations.sides.find((sd) => sd.id === sideOfHolder(data.engine, x.key)) || {}).name;
    showCardNews(host, {
      month: x.month, facts: cardFacts(data.engine, x.card), color: holderColor(x.key),
      heading: old ? `${card.name} replaces ${old.name}` : `${card.name} takes command`,
      sub: `${holderName(x.key)}${sideName && sideName !== holderName(x.key) ? ` (${sideName})` : ''}${x.how === 'sacked' ? '' : ''}.`,
      place: { index: 1, count: news.length },
    }, { monthName: monthLabel, onClose: () => { state = markCardSeen(state, x.n); persist(); cardShown = null; showCommanders(); showTelegrams(); } });
    return;
  }
  if (!host.hidden) hideCardScreen(host);
  cardShown = null;
}
// Your answer to a commander question; the turn then carries on.
async function answerCard(key, choice) {
  const actions = [];
  try {
    state = answerCommander(state, orderData(), key, choice, { record: (action, s) => actions.push({ ...action, after: snapshot(s) }) });
  } catch (err) {
    orderError = err.message;
    return;
  }
  cardShown = null;
  hideCardScreen($('commander-screen'));
  persist();
  if (actions.length) await playTurn(actions);
  else { redraw(); refreshPanel(); }
}
// The commander section of a nation's page on the Nations screen: its card, any card
// added alongside it (Foch for the Entente), and the sack control for your own.
function commandersFor(nationId) {
  const own = currentCard(state, data.engine, nationId);
  if (!own) return null;
  const side = nationOf(data.engine, nationId).side;
  const cards = [cardOf(own.id)];
  const alongside = currentCard(state, data.engine, side);
  if (alongside) cards.push(cardOf(alongside.id));
  let sack = null;
  if (state.controllers[side] === 'human' && !own.cannotBeSacked && (own.next || []).length) {
    const why = sackReason(state, data.engine, nationId);
    sack = why ? { reason: why }
      : { cost: data.engine.commanders.rules.sackWill, options: successors(state, data.engine, nationId).map((id) => ({ id, name: cardById(data.engine, id).name })) };
  }
  return commanderSection(cards, sack, { monthName: monthLabel, onSack: (newId) => {
    try { state = sackCommander(state, orderData(), nationId, newId); } catch (err) { orderError = err.message; return; }
    persist();
    openWarOffice(true);
    const page = document.getElementById(`nation-${nationId}`);   // back to the same nation's page
    if (page) page.scrollIntoView({ block: 'nearest', inline: 'start' });
    redraw();
    refreshPanel();
  } });
}

// ---------------------------------------------------------------- event telegrams
// Show the next telegram the player hasn't read (STYLE.md §6), one at a time. Never
// while a turn is playing back: they wait until it's your turn again.
let telegramShown = null;   // the number of the telegram on screen (null: none)
let telegramIndex = 0;      // its place in this batch, for "1 of 3"
function showTelegrams() {
  const host = $('telegram');
  // a question only counts while the turn is really waiting for its answer
  const list = state ? unseenTelegrams(state).filter((t) => !(t.choice && !t.choice.answer && !state.pendingChoice)) : [];
  if (!list.length || gameScreen.hidden || (playback && playback.isPlaying()) || !$('commander-screen').hidden) {
    hideTelegram(host); telegramShown = null; telegramIndex = 0; return;
  }
  const t = list[0];
  if (telegramShown === t.n && !host.hidden) return;
  const still = telegramShown !== null;          // the first of a batch slides up; the rest replace it
  telegramIndex = still ? telegramIndex + 1 : 1;
  telegramShown = t.n;
  showTelegram(host, t, {
    place: { index: telegramIndex, count: telegramIndex + list.length - 1 },
    monthName: monthLabel, still,
    question: Boolean(t.choice && !t.choice.answer),
    onDismiss: () => { state = markSeen(state, t.n); persist(); showTelegrams(); },
    onChoose: answerChoice,
  });
}

// The brass Nations button on the map shows the running Armistice Score (RULES.md
// §11): one tap opens the Nations screen.
function refreshNationsButton() {
  const score = armisticeScore(state, data.engine);
  $('nations-score').textContent = `${score > 0 ? '+' : score < 0 ? '−' : '±'}${Math.abs(score).toFixed(1)}`;
  $('btn-nations').setAttribute('aria-label', `Nations: Armistice Score ${score.toFixed(1)}. Open the Nations screen`);
}

// The Telegrams log in the ☰ menu: every telegram so far.
function openTelegramLog() {
  if (!state || (playback && playback.isPlaying())) return;
  const box = $('telegram-log');
  showTelegramLog(box, state.telegrams || [], { monthName: monthLabel, onClose: () => { box.hidden = true; } });
  box.hidden = false;
  box.scrollTop = 0;
}

// The data the engine needs to check orders.
function orderData() {
  return data.engine;
}

// The queued orders, checked (js/engine/orders.js): { checks, state }, where `state`
// is the board as it will be after the queued moves (and with the attacks and munitions
// for the queued attacks set aside).
function planned() {
  return queueCheck(state, orderData());
}
// The board as a unit's new order would find it: after every queued order except
// that unit's own move (a new move order for it replaces the old one).
function previewFor(unitId) {
  const others = (state.orders || []).filter((o) => !(o.kind === 'move' && o.unit === unitId));
  return queueCheck(state, orderData(), others).state;
}
// The queued move for a unit, and its place in the queue, or null.
function queuedMove(unitId) {
  const i = (state.orders || []).findIndex((o) => o.kind === 'move' && o.unit === unitId);
  return i < 0 ? null : { index: i, order: state.orders[i] };
}
const placeName = (boxId) => boxName(data.map, data.boxesById[boxId]);

// Show the panel for the selected territory (and unit).
function refreshPanel() {
  showPanel(panelArea, selectedBox ? boxInfo(selectedBox) : null, data.terrainData, {
    onUnit: selectUnit, log: state.log, error: orderError, situation: situation(),
    onSplit: splitSelected, onMerge: mergeSelected,
    slip: attack ? attackSlip() : null,
    onToggleUnit: toggleAttacker, onMunitions: changeMunitions, onCardShift: toggleCardShift, onConfirm: confirmAttack, onCancel: closeAttack,
    orders: ordersInfo(), onCancelOrder: dropOrder, onShowOrder: showOrder,
    suggestions: suggestionsInfo(), onSuggestion: useSuggestion,
    reports, onReport: (box) => { selectBox(box); focusOn(box); }, onCloseReports: () => { reports = []; refreshPanel(); },
  });
  orderError = null;
}

// Tap a unit in the panel: show where it can move (brass) or go by rail (blue, dashed).
function selectUnit(unitId) {
  selectedUnit = selectedUnit === unitId ? null : unitId;
  refreshTargets();
  refreshPanel();
}

// Can the player give attack orders now: in their attack phase, or in one orders
// phase (moves and attacks together, RULES.md §7)?
function attackOrdersNow(phase = humanPhase()) {
  return Boolean(phase) && (phase.kind === 'attack' || ordersPhase(state, orderData()));
}
// The board the next attack order would find (after the queued moves, in the attack phase).
const attackState = () => attackBoard(state, orderData());

// ---------------------------------------------------------------- what the map outlines
// The human side whose orders phase it is, or null.
function humanPhase() {
  const phase = phaseOf(state, orderData());
  if (!state || state.over || state.pendingBudget || state.pendingChoice || state.pendingCommander || !phase || phase.auto) return null;
  return (state.controllers || {})[phase.side] === 'ai' ? null : phase;
}
// Outline what you can do: with a unit selected, where it can go (road brass, rail
// blue); otherwise, in your attack phase, the enemy territories you can attack.
function refreshTargets() {
  if (!mapView) return;
  if (selectedUnit) {
    const pv = previewFor(selectedUnit);
    mapView.showTargets(moveTargets(pv, orderData(), selectedUnit), railTargets(pv, orderData(), selectedUnit), unitAttackTargets(selectedUnit));
    return;
  }
  const phase = humanPhase();
  mapView.showTargets([], [], attackOrdersNow(phase) ? attackableBoxes(state, orderData(), phase.side) : []);
}
// The enemy territories a unit could attack this turn: from where it stands (after its
// queued move), or after stepping up by road (C1: move into an enemy territory to attack).
function unitAttackTargets(unitId) {
  const phase = humanPhase();
  if (!attackOrdersNow(phase)) return [];
  const board = attackState();
  const pv = previewFor(unitId);
  return data.map.boxes.filter((b) => state.boxes[b.id].owner !== phase.side &&
    (eligibleAttackers(board, orderData(), b.id).includes(unitId) || stagingBox(pv, orderData(), unitId, b.id)))
    .map((b) => b.id);
}

// ---------------------------------------------------------------- Best attacks
// The suggestions on show (js/engine/explain.js bestAttacks), or null.
let suggestions = null;
function toggleBest() {
  const phase = humanPhase();
  if (suggestions || !phase) { clearSuggestions(); refreshPanel(); return; }
  if (!attackOrdersNow(phase)) {
    orderError = 'Best attacks works in your attack phase. Now, in the move phase, stack up to 3 units in one front territory: more steps mean better odds.';
    refreshPanel(); openSheet(true);
    return;
  }
  suggestions = bestAttacks(state, orderData(), phase.side, 3);
  const pct = (p) => `${Math.round(p * 100)}%`;
  mapView.showSuggestions(suggestions.map((o) => {
    const lead = o.units.map((id) => state.units.find((u) => u.id === id)).reduce((a, b) => (b.steps > a.steps ? b : a));
    return { from: lead.box, to: o.target, label: `${o.columnLabel} · ${pct(o.pTake)}` };
  }));
  $('btn-best').setAttribute('aria-pressed', 'true');
  if (suggestions.length) focusOn(...suggestions.map((o) => o.target));   // bring the arrows into view
  refreshPanel();
  openSheet(true);
}
function clearSuggestions() {
  suggestions = null;
  if (mapView) mapView.showSuggestions([]);
  $('btn-best').setAttribute('aria-pressed', 'false');
}
// Tap a suggestion: open the order slip with its units and barrage.
function useSuggestion(i) {
  const o = suggestions[i];
  clearSuggestions();
  selectBox(o.target);
  attack = { target: o.target, units: [...o.units], munitions: o.munitions };
  showAttackArrow();
  refreshPanel();
}
// What the panel lists about the suggestions.
function suggestionsInfo() {
  if (!suggestions) return null;
  return suggestions.map((o, i) => ({
    index: i, chance: o.pTake,
    text: `${placeName(o.target)}: ${o.units.length} unit${o.units.length === 1 ? '' : 's'}, barrage ${o.munitions} → ${o.columnLabel}, ${Math.round(o.pTake * 100)}% to take it`,
  }));
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
  if (playback && playback.isPlaying()) { playback.tap(); return; }   // a tap skips the animation
  selectedOrder = null;
  if (isAttackTarget(boxId)) {
    if (selectedUnit) stepUpFor(selectedUnit, boxId);
    selectBox(boxId);
    openAttack(boxId);
    refreshPanel();
    return;
  }
  if (attack) closeAttack();
  if (selectedUnit) {
    const pv = previewFor(selectedUnit);
    if (moveTargets(pv, orderData(), selectedUnit).includes(boxId) || railTargets(pv, orderData(), selectedUnit).includes(boxId)) {
      // Orders, then commit: the move is queued as a dashed arrow, not made yet.
      try {
        state = addOrder(state, orderData(), { kind: 'move', unit: selectedUnit, to: boxId });
      } catch (err) {
        orderError = err.message;
      }
      persist();
      const from = selectedBox;
      selectedUnit = null;
      refreshTargets();
      redraw();
      selectBox(from);
      return;
    }
  }
  selectBox(boxId);
}

// ---------------------------------------------------------------- attacks
// Is it an attack phase, and is this territory an enemy of the side attacking?
// In one orders phase it must have units that can attack it, or the selected unit
// must be able to step up to it (C1).
function isAttackTarget(boxId) {
  const phase = humanPhase();
  if (!attackOrdersNow(phase) || state.boxes[boxId].owner === phase.side) return false;
  if (phase.kind === 'attack') return true;
  if (eligibleAttackers(attackState(), orderData(), boxId).length) return true;
  return Boolean(selectedUnit && stagingBox(previewFor(selectedUnit), orderData(), selectedUnit, boxId));
}
// C1, move in to attack: if the selected unit isn't next to the target yet, queue the
// road move that brings it next to it (it can be changed or cancelled like any order).
function stepUpFor(unitId, target) {
  if (eligibleAttackers(attackState(), orderData(), target).includes(unitId)) return;
  const pv = previewFor(unitId);
  const stage = stagingBox(pv, orderData(), unitId, target);
  if (!stage) return;
  const queued = queuedMove(unitId);
  try {
    if (stage === pv.units.find((u) => u.id === unitId).box) {
      if (queued) state = cancelOrder(state, queued.index);       // stay put: drop its move away
    } else {
      state = addOrder(state, orderData(), { kind: 'move', unit: unitId, to: stage });
    }
  } catch (err) {
    orderError = err.message;
  }
  persist();
  redraw();
}

// Open the order slip for an attack on this territory, with every unit that can
// attack it already chosen.
function openAttack(boxId) {
  attack = { target: boxId, units: eligibleAttackers(attackState(), orderData(), boxId), munitions: 0 };
  showAttackArrow();
}

// The grease-pencil arrow from the strongest chosen unit to the target.
function showAttackArrow() {
  const chosen = attack.units.map((id) => state.units.find((u) => u.id === id)).filter(Boolean);
  if (!chosen.length) { mapView.clearPlannedAttack(); return; }
  const lead = chosen.reduce((a, b) => (b.steps > a.steps ? b : a));
  mapView.showPlannedAttack(lead.box, attack.target);
}

// Everything the order slip shows, worked out by the combat engine.
function attackSlip() {
  const pv = attackState();            // after the queued orders (attacks and munitions set aside), in the attack phase
  const box = data.boxesById[attack.target];
  const order = { target: attack.target, units: attack.units, munitions: attack.munitions, cardShift: Boolean(attack.cardShift) };
  const defenders = unitsIn(state, attack.target);
  const defSteps = defenders.reduce((s, u) => s + u.steps, 0);
  const slip = {
    targetName: boxName(data.map, box),
    defenderText: defenders.length
      ? `Held by ${defenders.length} unit${defenders.length === 1 ? '' : 's'} (${defSteps} steps), trench level ${state.boxes[attack.target].trench}.`
      : 'No enemy units hold it.',
    units: eligibleAttackers(pv, orderData(), attack.target).map((id) => {
      const u = state.units.find((x) => x.id === id);
      return { ...unitInfo(u), chosen: attack.units.includes(id) };
    }),
    munitions: attack.munitions, munitionsMax: 0, shifts: [], reasons: [],
    confirmLabel: 'Add to orders',
  };
  if (!attack.units.length) {
    slip.ok = false;
    slip.reasons = ['Choose at least one unit.'];
    return slip;
  }
  const odds = oddsPreview(pv, orderData(), order);
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
    slip.attackSteps = plan.attackSteps; slip.defendSteps = plan.defendSteps;
    // the plain-English explanation: roll needed, why, what would help (explain.js)
    slip.advice = attackAdvice(pv, orderData(), order);
    // The Recruit advisor (RULES.md §13): warn before a futile attack.
    const level = data.engine.ai.levels.find((l) => l.id === state.level);
    const worst = data.engine.combat.columns.findIndex((c) => c.label === data.engine.combat.futile.worstColumn);
    if (level && level.advisor && plan.finalColumn <= worst) {
      slip.warning = `ADVISOR: This attack will probably fail and cost ${data.engine.combat.futile.will} Will. Attack anyway?`;
    }
  } else if (!plan.empty && plan.ratioColumn !== null) {
    slip.ratioText = `${plan.attackSteps} steps against ${plan.defendSteps} \u2192 below 1:2`;
    slip.advice = attackAdvice(pv, orderData(), order);
  }
  // the commander's once-only bonus (the Nivelle Method, RULES.md §15), offered on the slip
  const shift = payer && !plan.empty ? onceShift(pv, data.engine, payer.id) : null;
  if (shift) {
    const card = cardById(data.engine, shift.card);
    const flaw = card.flaw ? ` If it fails to take the territory: ${card.flaw.text.replace(/^If that \+\d attack fails to take its box, /, '')}` : '';
    slip.cardShift = { on: Boolean(attack.cardShift), name: shift.name, value: shift.value,
      text: `${card.name}'s once-only bonus.${flaw}` };
  }
  if (payer) {
    // V2c: the attack's own IP comes out of the stockpile first, then the barrage
    // (RULES.md §9.1). `left` is what the payer has after the orders already queued.
    const left = pv.resources[payer.id];
    slip.cost = attackCostText(plan, payer, left);
    slip.munitionsMax = Math.max(0, Math.min(barrageMax(data.engine, currentMonth(state), state, payer.side), left.munitions - plan.ipCost));
  }
  return slip;
}

// "1 IP from France's stockpile (4 in stock) + barrage 2 · attack 1 of 3 left this month"
function attackCostText(plan, payer, left) {
  const barrage = plan.munitions ? ` + ${plan.munitions} for the barrage` : '';
  const attacks = left.attacks === 1 ? 'the last attack' : `${left.attacks} attacks`;
  return `${plan.ipCost} IP for the attack${barrage}, from ${payer.name}'s stockpile (${left.munitions} in stock). ` +
    `${payer.name} has ${attacks} left this month.`;
}

function toggleAttacker(unitId) {
  attack.units = attack.units.includes(unitId) ? attack.units.filter((x) => x !== unitId) : [...attack.units, unitId];
  showAttackArrow();
  refreshPanel();
}
function toggleCardShift() {
  attack.cardShift = !attack.cardShift;
  refreshPanel();
}
function changeMunitions(change) {
  attack.munitions = Math.max(0, attack.munitions + change);
  refreshPanel();
}

// ADD TO ORDERS: queue the attack (a red arrow with its odds). The dice are rolled
// when the orders are committed.
function confirmAttack() {
  try {
    state = addOrder(state, orderData(), { kind: 'attack', target: attack.target, units: attack.units, munitions: attack.munitions, cardShift: Boolean(attack.cardShift) });
  } catch (err) {
    orderError = err.message;
    refreshPanel();
    return;
  }
  persist();
  attack = null;
  mapView.clearPlannedAttack();
  redraw();
  refreshPanel();
}

// ---------------------------------------------------------------- queued orders
// What the panel lists about the queued orders, and what's left to spend.
function ordersInfo() {
  const orders = state.orders || [];
  if (!orders.length) return null;
  const { checks, state: pv } = planned();
  const phase = phaseOf(state, orderData());
  const list = orders.map((o, i) => ({ index: i, text: orderText(o, checks[i]), ok: checks[i].ok, reason: checks[i].reason, selected: i === selectedOrder }));
  const left = phase ? data.engine.nations.nations.filter((n) => n.side === phase.side && pv.resources[n.id] && (state.will[n.id] !== undefined))
    .map((n) => `${n.name} ${pv.resources[n.id].attacks} attack${pv.resources[n.id].attacks === 1 ? '' : 's'}, ${pv.resources[n.id].munitions} IP of munitions`) : [];
  return { list, left: attackOrdersNow() ? left.join(' \u00b7 ') : '' };
}
// One order in plain words.
function orderText(o, check) {
  if (o.kind === 'move') {
    const u = state.units.find((x) => x.id === o.unit);
    return `Move ${u ? unitTitle(u) : 'a unit'} from ${u ? placeName(u.box) : '?'} to ${placeName(o.to)}`;
  }
  const odds = check && check.ok && check.odds ? ` at ${check.plan.columnLabel || 'no odds'}, ${Math.round(check.odds.pTake * 100)}% to take it` : '';
  return `Attack ${placeName(o.target)} with ${o.units.length} unit${o.units.length === 1 ? '' : 's'}${o.munitions ? `, barrage of ${o.munitions}` : ''}${odds}`;
}
const unitTitle = (u) => `${nationOf(data.engine, u.nation).adjective} ${unitType(data.engine, u).name.toLowerCase()}`;

// Draw the queued orders as arrows: dashed for moves, red with the odds for attacks.
function drawOrderArrows() {
  const orders = state.orders || [];
  const { checks } = planned();
  mapView.drawOrders(orders.map((o, i) => {
    const c = checks[i];
    if (o.kind === 'move') {
      const u = state.units.find((x) => x.id === o.unit);
      return { index: i, kind: 'move', from: u ? u.box : o.to, to: o.to, bad: !c.ok };
    }
    const lead = o.units.map((id) => state.units.find((x) => x.id === id)).filter(Boolean).sort((a, b) => b.steps - a.steps)[0];
    const label = c.ok && c.odds ? (c.plan.empty ? 'empty' : `${c.plan.columnLabel} \u00b7 ${Math.round(c.odds.pTake * 100)}%`) : '';
    return { index: i, kind: 'attack', from: lead ? lead.box : o.target, to: o.target, label, bad: !c.ok };
  }));
}
// An arrow was tapped: show that order (with CANCEL ORDER) in the panel.
function showOrder(i) {
  if (playback && playback.isPlaying()) { playback.tap(); return; }
  selectedOrder = i;
  refreshPanel();
  openSheet(true);
}
// CANCEL ORDER.
function dropOrder(i) {
  state = cancelOrder(state, i);
  selectedOrder = null;
  persist();
  redraw();
  refreshPanel();
}
function toggleFast() {
  settings.fast = !settings.fast;
  saveSettings();
  refreshMenu();
}

// ---------------------------------------------------------------- the menu
// The menu under the three brass rules: War Office, How to play, settings, title screen.
function openMenu(open) {
  $('game-menu').hidden = !open;
  $('btn-menu').setAttribute('aria-expanded', String(open));
  if (open) refreshMenu();
}
// The sides you give orders for (one, or both when two players share the phone).
function humanSides() {
  return Object.entries((state && state.controllers) || {}).filter(([, who]) => who === 'human').map(([side]) => side);
}
// Show the settings as they are now on the menu's buttons.
function refreshMenu() {
  const auto = state ? humanSides().every((side) => (state.autoAllocate || {})[side]) : true;
  $('btn-auto').textContent = `Auto budget: ${auto ? 'on' : 'off'}`;
  $('btn-auto').setAttribute('aria-pressed', String(auto));
  $('btn-fast').textContent = `Fast mode: ${settings.fast ? 'on' : 'off'}`;
  $('btn-fast').setAttribute('aria-pressed', String(Boolean(settings.fast)));
}
// Auto-allocate (RULES.md §19.4): on, the War Office spends your Industry for you;
// off, the budget page appears in months when there's research to choose. It takes
// effect from next month's budget.
function toggleAuto() {
  if (!state) return;
  const on = !humanSides().every((side) => (state.autoAllocate || {})[side]);
  state = { ...state, autoAllocate: { ...(state.autoAllocate || {}), ...Object.fromEntries(humanSides().map((side) => [side, on])) } };
  persist();
  refreshMenu();
}
// The phase guide strip: tap the one-line summary to open or close the full sentence.
function toggleGuide(open = $('phase-guide').hidden) {
  $('phase-guide').hidden = !open || !$('phase-guide').textContent;
  $('btn-guide').setAttribute('aria-expanded', String(!$('phase-guide').hidden));
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
  refreshTargets();
  mapView.select(boxId);
  refreshPanel();
  openSheet(true);
  focusOn(boxId);              // keep it in view above the sheet
}

// Draw the map the first time; afterwards just repaint it for the new state.
function showMap() {
  if (!mapView) {
    viewName = settings.view === 'map' ? 'map' : 'board';
    mapView = new Proxy({}, { get: (_, key) => views[viewName].view[key] });
    zoom = new Proxy({}, { get: (_, key) => views[viewName].zoom[key] });
    makeView('map');                 // first, so the locator's <use> finds the map's layers
    makeView('board');
    showLocator = createLocator($('locator'), views.map.size, jumpTo);
    playback = createPlayback({
      mapView, mapArea: $('map-area'), bar: $('playback'), barLabel: $('playback-label'), skip: $('btn-skip'),
      slip: $('playback-slip'), showBoard, lookFor, describe: describeAction, fast: () => Boolean(settings.fast),
      focus: focusOn,
    });
    $('btn-zoom-in').addEventListener('click', () => zoom.zoomIn());
    $('btn-zoom-out').addEventListener('click', () => zoom.zoomOut());
    $('btn-zoom-fit').addEventListener('click', () => zoom.fit());
    $('btn-view').addEventListener('click', () => setView(viewName === 'map' ? 'board' : 'map'));
    showActiveView();
  }
  redraw();
  mapView.select(null);
  refreshTargets();
  if (demoAttack) mapView.showPlannedAttack(...demoAttack);
  else mapView.clearPlannedAttack();
  for (const v of Object.values(views)) v.zoom.startView();
}

// Make one view ('map' or 'board') in its own layer of the map area, with its zoom.
function makeView(name) {
  const holder = document.createElement('div');
  holder.className = 'view-holder';
  mapHolder.appendChild(holder);
  const board = name === 'board';
  const svg = board ? buildBoardSvg(data.map, data.terrainData, data.mapSvg) : data.mapSvg;
  const view = createMapView(holder, svg, {
    nations: data.nations,
    boxNameFn: (id) => boxName(data.map, data.boxesById[id]),
    // pencil notes use the box's name, or its town if it has none ("Thiepval")
    noteNameFn: (id) => data.boxesById[id].name || data.boxesById[id].anchor.town,
    shortMonthFn: shortMonth,
    prefix: board ? BOARD_PREFIX : '',
    pieceSize: board ? BOARD_PIECE : null,
  });
  const vb = view.svg.viewBox.baseVal;
  const size = { w: vb.width, h: vb.height };            // the whole view, in map units
  const z = enableZoom(view.svg, {
    onTap: tapBox,
    onTapOrder: showOrder,
    // settled after a pan or zoom: tidy the labels and pieces (once, not every frame).
    // The view not on screen waits until it's shown (setView).
    onViewChange: (k) => {
      if (name !== viewName) { if (views[name]) views[name].untidy = k; return; }
      view.declutter(); view.layout(k); showLocator(locatorArea());
    },
    // every frame of a drag: only the locator's outline moves
    onMove: () => { if (name === viewName && views[name]) showLocator(locatorArea()); },
    // a finger is down on a territory: light it up at once (not while a turn plays)
    onPress: (id) => { if (!(playback && playback.isPlaying())) view.press(id); },
    home: view.frontBounds,
    start: () => startPoint(view),
    startZoom: board ? 0 : undefined,                    // the board starts filling the width
  });
  views[name] = { view, zoom: z, holder, size };
}

// Board | Map: show the chosen view (remembered on this phone).
function setView(name) {
  if (!views[name] || name === viewName || (playback && playback.isPlaying())) return;
  // tidy the old view: its arrows and outlines would be stale when it comes back
  clearSuggestions();
  mapView.clearPlannedAttack();
  mapView.showTargets([], []);
  mapView.drawOrders([]);
  viewName = name;
  settings.view = name;
  saveSettings();
  showActiveView();
  // tidy its labels and pieces now if it moved while hidden
  if (views[name].untidy) { views[name].view.declutter(); views[name].view.layout(views[name].untidy); views[name].untidy = null; }
  redraw();
  mapView.select(selectedBox);
  if (attack) showAttackArrow();
  if (selectedBox) focusOn(selectedBox);
  showLocator(locatorArea());
}
function showActiveView() {
  for (const [n, v] of Object.entries(views)) v.holder.classList.toggle('inactive', n !== viewName);
  // the button offers the other view
  $('btn-view').textContent = viewName === 'map' ? 'Board' : 'Map';
  $('btn-view').setAttribute('aria-label', viewName === 'map' ? 'Show the board' : 'Show the campaign map');
}

// The locator always shows the campaign map. On the board, it outlines where on the
// real map the squares on screen are.
function locatorArea() {
  const area = zoom.current();
  if (viewName === 'map') return area;
  const [x, y, w, h] = area;
  const board = views.board.view; const map = views.map.view;
  const seen = board.boxIds().filter((id) => { const [ax, ay] = board.anchorOf(id); return ax >= x && ax <= x + w && ay >= y && ay <= y + h; });
  if (!seen.length) return [0, 0, 0, 0];
  const pts = seen.map((id) => map.anchorOf(id));
  const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]); const pad = 25;
  const x0 = Math.min(...xs) - pad; const y0 = Math.min(...ys) - pad;
  return [x0, y0, Math.max(...xs) + pad - x0, Math.max(...ys) + pad - y0];
}
// A tap on the locator (a point on the campaign map): go there. On the board, go to
// the square of the nearest territory.
function jumpTo(x, y) {
  if (viewName === 'map') { zoom.centreOn(x, y); return; }
  const map = views.map.view;
  const dist = (id) => { const [ax, ay] = map.anchorOf(id); return (ax - x) ** 2 + (ay - y) ** 2; };
  const nearest = map.boxIds().reduce((a, b) => (dist(b) < dist(a) ? b : a));
  zoom.centreOn(...views.board.view.anchorOf(nearest));
}

let showLocator = () => {};      // set up in showMap() (js/ui/locator.js)

// Where a view starts: your most threatened front-line territory (RULES.md §14's
// threat score), or the middle of the front when you play both sides.
function startPoint(view) {
  const humans = Object.entries(state.controllers || {}).filter(([, who]) => who === 'human').map(([side]) => side);
  if (humans.length === 1) {
    const boxes = frontBoxes(state, data.engine, humans[0]);
    if (boxes.length) {
      const worst = boxes.reduce((a, b) => (threat(state, data.engine, b) > threat(state, data.engine, a) ? b : a));
      return view.anchorOf(worst);
    }
  }
  const b = view.frontBounds();
  return b ? [b[0] + b[2] / 2, b[1] + b[3] / 2] : null;
}


// Repaint the map, the top bar and anything that depends on the game state.
function redraw() {
  const month = currentMonth(state);
  const record = { counts: battleCounts(state), big: bigBattles(state), scarLevel };
  mapView.update(state, month, monthLabel(month), record);
  mapView.drawUnits(state.units, lookFor);
  // the locator shows the campaign map, so keep its colours and front line up to date
  if (viewName !== 'map') views.map.view.update(state, month, monthLabel(month), null);
  gameTitle.textContent = monthLabel(month);
  const phase = phaseOf(state, orderData());
  $('phase-label').textContent = state.over ? 'The war is over'
    : (phase ? (phase.ordersName && humanPhase() ? phase.ordersName : phase.name) : '');
  const n = (state.orders || []).length;
  $('commit-count').textContent = n ? String(n) : '';
  $('btn-end-phase').disabled = state.over || Boolean(state.pendingChoice) || Boolean(state.pendingBudget) || Boolean(state.pendingCommander) ||
    Boolean(playback && playback.isPlaying());
  drawOrderArrows();
  $('phase-summary').textContent = phaseSummary(state, orderData());
  $('phase-guide').textContent = phaseGuide(state, orderData());
  toggleGuide(!$('phase-guide').hidden);
  const human = humanPhase();
  $('btn-best').hidden = !attackOrdersNow(human);   // it only helps when you can attack
  if (!attackOrdersNow(human)) clearSuggestions();
  refreshTargets();
  showPendingBudget();
  showCommanders();
  showTelegrams();
  refreshNationsButton();
  if (coach) coach.update(state, Boolean(playback && playback.isPlaying()));
}

// ---------------------------------------------------------------- the War Office budget
// Which budget is on screen ("side month"), so a redraw doesn't reset the sliders.
let budgetShown = null;
// If a budget waits for you (RULES.md §19.4), show the budget page over the map.
function showPendingBudget() {
  const box = $('budget');
  const side = (state.pendingBudget || [])[0];
  if (!side || state.over || (playback && playback.isPlaying())) { box.hidden = true; budgetShown = null; return; }
  const key = `${side} ${state.turn}`;
  if (budgetShown === key && !box.hidden) return;
  budgetShown = key;
  const month = currentMonth(state);
  showBudget(box, state, data.engine, side, month, {
    nameOf: (id) => nationOf(data.engine, id).name,
    shortOf: (id) => nationOf(data.engine, id).short,
    monthName: monthLabel,
  }, (budgets, auto) => signBudget(side, budgets, auto));
  box.hidden = false;
  box.scrollTop = 0;
}
// SIGN THE ESTIMATES: spend the budget and carry on with the turn (the computer's
// moves that follow are played back, as after COMMIT).
async function signBudget(side, budgets, auto) {
  const actions = [];
  try {
    state = submitBudget(state, orderData(), side, budgets,
      { auto, record: (action, s) => actions.push({ ...action, after: snapshot(s) }) });
  } catch (err) {
    // the page checks the budget first, so this is rare: say why on the page
    const note = document.createElement('p');
    note.className = 'ledger-line ledger-warn';
    note.textContent = err.message;
    $('budget').querySelector('.ledger-page').appendChild(note);
    return;
  }
  $('budget').hidden = true;
  budgetShown = null;
  persist();
  if (actions.length) await playTurn(actions);
  else { redraw(); refreshPanel(); }
}

// COMMIT ORDERS: carry out the queued orders, run on to the next phase that needs
// your orders (the computer plays its side on the way), then play it all back.
async function commit() {
  if (!state || state.over || state.pendingChoice || state.pendingBudget || state.pendingCommander || (playback && playback.isPlaying())) return;
  clearSuggestions();
  const out = commitOrders(state, orderData());
  const actions = [...out.actions];
  state = endPhase(out.state, orderData(), { record: (action, s) => actions.push({ ...action, after: snapshot(s) }) });
  persist();                       // saved before the playback, so closing the app loses nothing
  attack = null; selectedUnit = null; selectedOrder = null;
  mapView.clearPlannedAttack();
  refreshTargets();
  await playTurn(actions);
}
// The battle reports of the last turn played back (explain.js battleReport): kept
// until the next commit, shown in the panel.
let reports = [];
// Play actions back, then show the real state.
async function playTurn(actions) {
  reports = actions.filter((a) => a.kind === 'attack' && a.result).map((a) => battleReport(data.engine, a));
  openSheet(false);
  $('btn-end-phase').disabled = true;
  $('commit-count').textContent = '';
  // the guide strip says what's happening, not the phase that just ended
  $('phase-summary').textContent = 'The turn is playing out: tap the map to hurry it';
  $('phase-guide').textContent = '';
  toggleGuide(false);
  $('btn-best').hidden = true;
  mapView.drawOrders([]);
  // the panel would give the results away: show a short note while the turn plays
  const note = document.createElement('p');
  note.className = 'panel-hint';
  note.textContent = 'The orders are being carried out. Tap the map to hurry one along, or SKIP to see the outcome at once.';
  panelArea.replaceChildren(note);
  gameScreen.classList.add('playing-back');
  await playback.play(actions);
  gameScreen.classList.remove('playing-back');
  redraw();
  refreshPanel();
  if (reports.length) openSheet(true);
}
// Draw the map as it was partway through a turn (a snapshot from js/engine/orders.js).
function showBoard(snap) {
  const view = { ...state, boxes: snap.boxes, units: snap.units };
  mapView.update(view, snap.month, monthLabel(snap.month), null);
  mapView.drawUnits(snap.units, lookFor);
  gameTitle.textContent = monthLabel(snap.month);
}
// If a territory is off screen (or hidden under the sheet on a folded phone), move
// the map so it sits in the part of the map you can see.
function focusOn(...ids) {
  const [x, y, w, h] = zoom.current();
  const area = $('map-area').getBoundingClientRect();
  // how much of the map's height the open sheet covers (none when unfolded: the panel is beside it)
  const sheetTop = sheet.classList.contains('open') && getComputedStyle(sheet).position === 'fixed'
    ? window.innerHeight - sheet.offsetHeight : Infinity;
  const covered = Math.max(0, Math.min(area.height, area.bottom - sheetTop)) / area.height;
  const seenH = h * (1 - covered);                 // the visible part, in map units
  const pts = ids.filter(Boolean).map((id) => mapView.anchorOf(id));
  const margin = 0.15;
  const seen = (p) => p[0] > x + w * margin && p[0] < x + w * (1 - margin) && p[1] > y + seenH * margin && p[1] < y + seenH * (1 - margin);
  if (!pts.length || pts.every(seen)) return;
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length; const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  zoom.centreOn(cx, cy + (h - seenH) / 2);         // the middle of the visible part
}

// Words for an action, for the playback bar and slip.
function describeAction(a) {
  const side = data.nations.sides.find((x) => x.id === a.side);
  // "German" for a one-nation side, otherwise the side's name ("Entente")
  const only = side && side.nations.length === 1 ? nationOf(data.engine, side.nations[0]) : null;
  const sideName = only ? only.adjective : side ? side.name : '';
  if (a.kind !== 'attack') return { sideName, title: '', label: '' };
  return { sideName, title: `Attack on ${placeName(a.target)}`, label: a.result && !a.result.empty ? a.result.plan.columnLabel : '' };
}

// The War Office ledger (STYLE.md §6): every figure from ledger() in history.js.
// keepScroll === true re-draws it where it was (after sacking a commander).
function openWarOffice(keepScroll) {
  if (!state || (playback && playback.isPlaying())) return;
  const box = $('war-office');
  showLedger(box, ledger(state, data.engine), {
    monthName: monthLabel,
    nameOf: (id) => nationOf(data.engine, id).name,
    adjectiveOf: (id) => nationOf(data.engine, id).adjective || nationOf(data.engine, id).name,
    onClose: () => { box.hidden = true; },
    commanders: data.engine.commanders ? commandersFor : null,
  });
  box.hidden = false;
  if (keepScroll !== true) box.scrollTop = 0;
}

// How to Play (data/help.json): a page over whichever screen is showing.
function openHelp() {
  if (!data || (playback && playback.isPlaying())) return;
  const box = $('help');
  showHelp(box, data.help, () => { box.hidden = true; });
  box.hidden = false;
  box.scrollTop = 0;
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

// The guided first turn's coach (js/ui/tutorial.js), or null.
let coach = null;

// Start a new game and show the map. With `guided`, the guided first turn
// (data/tutorial.json): the Entente on Regular, a fixed seed and Auto-allocate on.
async function startGame(guided = false) {
  if (!data) return;
  if (coach) coach.stop();
  if (guided) { setup.player = data.tutorial.side; setup.level = data.tutorial.level; }
  $('setup').hidden = true;
  document.querySelector('.title-buttons').hidden = false;
  // The seed only has to be different each game; every roll then goes
  // through the seeded rng.js (from Milestone 5).
  state = newGame(data.scenario, guided ? data.tutorial.seed : Date.now() % 2147483647, data.engine, { ...setup });
  if (guided) state.autoAllocate[setup.player] = true;
  selectedBox = null;
  selectedUnit = null;
  attack = null;
  // "?demo" in the address shows a sample war on the map (js/ui/demo.js).
  demoAttack = new URLSearchParams(window.location.search).has('demo') ? applyDemo(state) : null;
  const opening = [];
  state = beginGame(state, orderData(), { record: (action, s) => opening.push({ ...action, after: snapshot(s) }) });
  playState(state);
  persist();
  if (opening.length && !demoAttack) await playTurn(opening);
  if (guided) startCoach();
}

// Begin coaching, with territories picked from the board as it is now.
function startCoach() {
  const plan = tutorialPlan(state, data.engine);
  if (!plan) { orderError = 'The guided turn could not find a good attack this time. Try How to Play instead.'; refreshPanel(); return; }
  if (!coach) {
    coach = createCoach({
      strip: $('coach'), mapView,
      names: { place: placeName },
      phaseId: (s) => (phaseOf(s, orderData()) || {}).id,
      onEnd: () => { redraw(); },
      focus: (a, b) => focusOn(a, b),
    });
  }
  coach.start(data.tutorial.steps, plan);
  coach.update(state);
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
  $('version-note').textContent = VERSION_LABEL;
  updateContinueButton();
  newGameButton.addEventListener('click', showSetup);
  $('btn-begin').addEventListener('click', () => startGame(false));
  $('btn-tutorial').addEventListener('click', () => startGame(true));
  for (const b of document.querySelectorAll('[data-side]')) b.addEventListener('click', () => { setup.player = b.dataset.side; refreshSetup(); });
  for (const b of document.querySelectorAll('[data-level]')) b.addEventListener('click', () => { setup.level = b.dataset.level; refreshSetup(); });
  continueButton.addEventListener('click', continueGame);
  $('btn-export').addEventListener('click', exportSave);
  $('btn-import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', (e) => importSave(e.target));
  $('btn-back').addEventListener('click', () => { if (coach) coach.stop(); $('war-office').hidden = true; $('telegram-log').hidden = true; hideTelegram($('telegram')); telegramShown = null; $('budget').hidden = true; budgetShown = null; hideCardScreen($('commander-screen')); cardShown = null; showScreen(titleScreen); updateContinueButton(); });
  $('btn-end-phase').addEventListener('click', () => { if (state) commit(); });
  $('btn-war-office').addEventListener('click', openWarOffice);
  $('btn-nations').addEventListener('click', openWarOffice);
  $('btn-telegrams').addEventListener('click', openTelegramLog);
  $('btn-best').addEventListener('click', () => { if (state) toggleBest(); });
  $('btn-help').addEventListener('click', openHelp);
  $('btn-auto').addEventListener('click', toggleAuto);
  $('btn-fast').addEventListener('click', toggleFast);
  $('btn-guide').addEventListener('click', () => toggleGuide());
  $('btn-menu').addEventListener('click', () => openMenu($('game-menu').hidden));
  // a choice in the menu closes it (except the two settings, so you see them change)
  for (const id of ['btn-war-office', 'btn-telegrams', 'btn-help', 'btn-back']) $(id).addEventListener('click', () => openMenu(false));
  // so does a tap anywhere outside it
  document.addEventListener('pointerdown', (e) => {
    if (!$('game-menu').hidden && !e.target.closest('#game-menu, #btn-menu')) openMenu(false);
  });
  $('btn-title-help').addEventListener('click', openHelp);
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
