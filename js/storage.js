// storage.js — saving and loading games.
// Milestone 1 only needs to know whether a saved game exists, so the title
// screen can grey out "Continue". Full save/load/export comes in Milestone 7.

// The localStorage key the game will save under.
export const SAVE_KEY = 'western-front-save';

// Returns true if a saved game is stored.
// `store` is normally the browser's localStorage, but tests can pass a fake one.
// Storage can throw (for example in some private-browsing modes), so we use
// try/catch and treat any error as "no save".
export function hasSave(store) {
  try {
    if (!store) return false;
    return store.getItem(SAVE_KEY) !== null;
  } catch (err) {
    return false;
  }
}
