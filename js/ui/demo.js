// demo.js — a sample war, so the living map (battle scars, pencil notes, seasons,
// planned-attack arrows; docs/STYLE.md §13) can be seen before combat exists.
// Open the game with ?demo at the end of the address to use it. Not part of a real
// game: from Milestone 5, real battles are recorded as they happen.

// Battles in the sample, as combat will record them: territory, month, steps lost.
export const DEMO_BATTLES = [
  { box: 'l04-e1', month: '1915-05', stepsLost: 7 },   // Artois
  { box: 'l09-g1', month: '1915-09', stepsLost: 8 },   // Champagne
  { box: 'l03-g1', month: '1915-09', stepsLost: 6 },   // Loos
  { box: 'l11-e1', month: '1916-02', stepsLost: 9 },   // Verdun
  { box: 'l11-e1', month: '1916-03', stepsLost: 5 },
  { box: 'l11-e1', month: '1916-06', stepsLost: 4 },
  { box: 'l11-e1', month: '1916-10', stepsLost: 7 },
  { box: 'l06-g1', month: '1916-07', stepsLost: 12 },  // the Somme
  { box: 'l06-g1', month: '1916-09', stepsLost: 6 },
  { box: 'l06-g2', month: '1916-11', stepsLost: 3 },
  { box: 'l06-e1', month: '1916-07', stepsLost: 4 },
  { box: 'l04-g1', month: '1917-04', stepsLost: 6 },   // Vimy and Arras
  { box: 'l05-g1', month: '1917-04', stepsLost: 5 },
  { box: 'l08-g1', month: '1917-04', stepsLost: 10 },  // Chemin des Dames
  { box: 'l02-g1', month: '1915-04', stepsLost: 4 },   // Ypres
  { box: 'l02-g1', month: '1917-07', stepsLost: 6 },
  { box: 'l02-g1', month: '1917-10', stepsLost: 8 },
];

// Turn a fresh game into the sample: November 1917, with the battles above, and
// one attack planned (Cambrai). Returns the planned attack as [from, to].
export function applyDemo(state) {
  state.turn = 36;                    // December 1914 + 35 months = November 1917
  state.battles = DEMO_BATTLES.map((b) => ({ ...b }));
  // By late 1917 the trenches are deep: level 2 in the Flanders lanes (1–3), 3 elsewhere.
  for (const [id, box] of Object.entries(state.boxes)) {
    if (box.trench > 0) box.trench = Number(id.slice(1, 3)) <= 3 ? 2 : 3;
  }
  return ['l05-e1', 'l05-g1'];
}
