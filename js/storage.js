// storage.js — saving and loading games (Milestone 8).
//   Auto-save: the game is kept in the browser's localStorage under SAVE_KEY.
//   Export: the save as a JSON file (the real backup). Import: read one back.
// Every save is stamped with the app name and the state's version number. Old saves
// are upgraded (migrateState) and checked (checkState) before they're played.
// Storage and JSON.parse can throw, so every call is wrapped in try/catch, and the
// player gets a friendly message instead of a broken game.

import { migrateState, checkState } from './engine/state.js';

// The localStorage key the game saves under.
export const SAVE_KEY = 'western-front-save';
const APP = 'western-front-1914-18';

// Returns true if a saved game is stored.
// `store` is normally the browser's localStorage, but tests can pass a fake one.
export function hasSave(store) {
  try {
    if (!store) return false;
    return store.getItem(SAVE_KEY) !== null;
  } catch (err) {
    return false;
  }
}

// The save file's text for a state.
export function saveText(state) {
  return JSON.stringify({ app: APP, version: state.version, savedAt: new Date().toISOString(), state });
}

// Store the game. Returns true if it worked (storage may be full or blocked).
export function saveGame(store, state) {
  try {
    if (!store) return false;
    store.setItem(SAVE_KEY, saveText(state));
    return true;
  } catch (err) {
    return false;
  }
}

// Read a save's text back into a playable state.
// Returns { ok: true, state } or { ok: false, error: 'a friendly message' }.
export function readSave(text, scenario, data) {
  let file;
  try {
    file = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: 'That file isn’t a Western Front save (it isn’t valid JSON).' };
  }
  if (!file || file.app !== APP || !file.state) {
    return { ok: false, error: 'That file isn’t a Western Front save.' };
  }
  let state;
  try {
    state = migrateState(file.state, scenario, data);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const problems = checkState(state, data);
  if (problems.length) {
    return { ok: false, error: `That save is damaged (${problems.slice(0, 3).join('; ')}).` };
  }
  return { ok: true, state };
}

// Load the auto-saved game, or { ok: false, error } if there's none or it's broken.
export function loadGame(store, scenario, data) {
  let text = null;
  try {
    text = store ? store.getItem(SAVE_KEY) : null;
  } catch (err) {
    return { ok: false, error: 'The browser won’t let the game read its save.' };
  }
  if (text === null) return { ok: false, error: 'No saved campaign yet.' };
  return readSave(text, scenario, data);
}

// A file name for an export: western-front-1916-02.json
export function exportName(month) {
  return `western-front-${month}.json`;
}
