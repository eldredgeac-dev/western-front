// rng.js — the game's only source of chance. Every dice roll comes from here.
// It is "seeded": the same seed always gives the same rolls, so a game can be
// replayed exactly and tests can check results. (Never use Math.random.)
//
// The generator is mulberry32: a tiny, well-known 32-bit random number generator.
// Its whole memory is one number, which we keep in the game state (state.rng),
// so saving and loading a game carries on the same sequence.

// The next random number in [0, 1), and the generator's new memory.
export function next(rngState) {
  let a = (rngState + 0x6D2B79F5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, rng: a };
}

// Roll one six-sided die: { roll: 1–6, rng: new memory }.
export function rollD6(rngState) {
  const { value, rng } = next(rngState);
  return { roll: 1 + Math.floor(value * 6), rng };
}

// Roll two dice and add them (2d6): { total, dice: [a, b], rng }.
export function roll2d6(rngState) {
  const first = rollD6(rngState);
  const second = rollD6(first.rng);
  return { total: first.roll + second.roll, dice: [first.roll, second.roll], rng: second.rng };
}

// Pick one item from a list at random: { item, rng }.
export function pick(rngState, list) {
  const { value, rng } = next(rngState);
  return { item: list[Math.floor(value * list.length)], rng };
}
