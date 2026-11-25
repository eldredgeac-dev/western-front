// main.js — starts the app and wires up the buttons.
import { hasSave } from './storage.js';

// Find the page elements we need once, at start-up.
const titleScreen = document.getElementById('title-screen');
const gameScreen = document.getElementById('game-screen');
const newGameButton = document.getElementById('btn-new-game');
const continueButton = document.getElementById('btn-continue');
const continueNote = document.getElementById('continue-note');
const backButton = document.getElementById('btn-back');

// Get localStorage safely: just reading `window.localStorage` can throw
// when storage is blocked.
function getStorage() {
  try {
    return window.localStorage;
  } catch (err) {
    return null;
  }
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

function boot() {
  updateContinueButton();
  newGameButton.addEventListener('click', () => showScreen(gameScreen));
  continueButton.addEventListener('click', () => showScreen(gameScreen));
  backButton.addEventListener('click', () => showScreen(titleScreen));
}

boot();
