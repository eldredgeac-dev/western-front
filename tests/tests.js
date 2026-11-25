// tests.js — the game's tests. They run in the browser (tests.html) and in
// Node (run.mjs). Each test is a name plus a function that throws if it fails.
import { hasSave, SAVE_KEY } from '../js/storage.js';

export const tests = [];

// Register a test.
function test(name, fn) {
  tests.push({ name, fn });
}

// Fail the test unless `condition` is true.
function check(condition, message) {
  if (!condition) throw new Error(message || 'check failed');
}

// A pretend localStorage, so tests don't touch the real one.
function fakeStorage(items = {}) {
  return {
    getItem: (key) => (key in items ? items[key] : null),
  };
}

// ---------- storage.js ----------
test('hasSave: false when nothing is saved', () => {
  check(hasSave(fakeStorage()) === false);
});

test('hasSave: true when a save exists', () => {
  check(hasSave(fakeStorage({ [SAVE_KEY]: '{"version":1}' })) === true);
});

test('hasSave: false (no crash) when storage throws', () => {
  const broken = { getItem: () => { throw new Error('blocked'); } };
  check(hasSave(broken) === false);
});

test('hasSave: false when there is no storage at all', () => {
  check(hasSave(null) === false);
});

// Run every test and return the results.
export async function runAll() {
  const results = [];
  for (const t of tests) {
    try {
      await t.fn();
      results.push({ name: t.name, ok: true });
    } catch (err) {
      results.push({ name: t.name, ok: false, error: err.message });
    }
  }
  return results;
}
