// build-map.mjs — makes img/map-west.svg, the campaign map the game shows.
//
// Run it only after changing the map data (anchor towns, terrain, the front line):
//     cd tools && npm install && node build-map.mjs
// The game never runs this file and never loads these npm packages: it just
// loads the finished SVG picture. See docs/DATA.md ("img/map-west.svg").
//
// How it works, in short:
//  1. Project every lat/long onto a flat map (Lambert conformal conic, north up).
//  2. The 72 boxes are a 12 × 6 grid (RULES.md §2). We keep that grid but "bend" it
//     onto real geography: the grid corners on the E1|G1 line sit on the real front
//     line, and the other corners sit between the four towns around them.
//  3. Every border is made wiggly (seeded, so it's the same every run) so the
//     territories look like real regions, then clipped to the coast and the
//     Dutch and Swiss borders.
//  4. CHECK: each territory must contain its own town, and share a border with
//     exactly its neighbours from boxes-west.json. If not, nothing is written.
//  5. Write the SVG: sea, countries, terrain textures, rivers, borders, the
//     territories (tappable, id = box id), the shared borders and the labels.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoConicConformal } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import { deflateSync } from 'node:zlib';
import polygonClipping from 'polygon-clipping';
import { loadElevation } from './elevation.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const map = readJson(join(root, 'data/boxes-west.json'));
const terrainData = readJson(join(root, 'data/terrain.json'));
const extra = readJson(join(here, 'map-extra.json'));
const countries = readJson(join(here, 'node_modules/world-atlas/countries-10m.json'));

// ---------------------------------------------------------------- settings
const INNER_WIDTH = 1000;           // width of the detailed area round the front, in map units
const MIN_SHARED = 3;               // a real border must be at least this long (map units)
const COUNTRY = { fra: '250', bel: '056', lux: '442', deu: '276', nld: '528', che: '756', gbr: '826' };
const PLAYABLE = [COUNTRY.fra, COUNTRY.bel, COUNTRY.lux, COUNTRY.deu];

// ---------------------------------------------------------------- Natural Earth rivers
// Downloaded once from the official Natural Earth repository (public domain) and
// kept in tools/cache/ (not committed).
const NE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
async function naturalEarth(name) {
  const file = join(here, 'cache', name + '.geojson');
  if (!existsSync(file)) {
    mkdirSync(join(here, 'cache'), { recursive: true });
    console.log('Downloading ' + name + ' …');
    const res = await fetch(NE_URL + name + '.geojson');
    if (!res.ok) throw new Error('Download failed: ' + name + ' ' + res.status);
    writeFileSync(file, await res.text());
  }
  return readJson(file);
}

// ---------------------------------------------------------------- projection
// The detailed area round the front (frame.bounds) is INNER_WIDTH map units wide. The
// map itself shows a wider area (frame.scenery) at the same scale, so there's scenery
// to pan around beyond the playing area.
const [iSouth, iWest, iNorth, iEast] = extra.frame.bounds;
const [south, west, north, east] = extra.frame.scenery || extra.frame.bounds;
const cornersOf = (s0, w0, n0, e0) => ({
  type: 'MultiPoint',
  coordinates: [[w0, s0], [e0, s0], [e0, n0], [w0, n0], [(w0 + e0) / 2, s0], [(w0 + e0) / 2, n0]],
});
const projection = geoConicConformal()
  .parallels([48, 50.5]).rotate([-4.9, 0]).center([0, 49.4])
  .fitWidth(INNER_WIDTH, cornersOf(iSouth, iWest, iNorth, iEast));
// The outline of a lat/long box, projected (its edges bulge on a conic projection).
function ringOf(s0, w0, n0, e0) {
  const r = [];
  for (let i = 0; i <= 40; i++) r.push(projection([w0 + (e0 - w0) * i / 40, s0]));
  for (let i = 0; i <= 40; i++) r.push(projection([e0, s0 + (n0 - s0) * i / 40]));
  for (let i = 0; i <= 40; i++) r.push(projection([e0 - (e0 - w0) * i / 40, n0]));
  for (let i = 0; i <= 40; i++) r.push(projection([w0, n0 - (n0 - s0) * i / 40]));
  return r;
}
// The detailed area's height before the shift (what the map was before the scenery).
const INNER_HEIGHT = Math.ceil(Math.max(...ringOf(iSouth, iWest, iNorth, iEast).map((p) => p[1])));
// Shift the map so the scenery frame starts at (0, 0). The shift is a whole number of
// map units, so the territory shapes (whose wobble noise is worked out in the
// unshifted coordinates, see noise2d) come out the same as before the scenery.
const SHIFT = (() => {
  const r = ringOf(south, west, north, east);
  return [Math.ceil(-Math.min(...r.map((p) => p[0]))), Math.ceil(-Math.min(...r.map((p) => p[1])))];
})();
{
  const [tx, ty] = projection.translate();
  projection.translate([tx + SHIFT[0], ty + SHIFT[1]]);
}
const frameRing = ringOf(south, west, north, east);
const WIDTH = Math.ceil(Math.max(...frameRing.map((p) => p[0])));
const HEIGHT = Math.ceil(Math.max(...frameRing.map((p) => p[1])));
// The detailed area, in map units: [x0, y0, x1, y1].
const innerRing = ringOf(iSouth, iWest, iNorth, iEast);
const INNER = [Math.min(...innerRing.map((p) => p[0])), Math.min(...innerRing.map((p) => p[1])),
  Math.max(...innerRing.map((p) => p[0])), Math.max(...innerRing.map((p) => p[1]))];
// [lat, lon] (how our data files write points) → [x, y] on the map
const P = ([lat, lon]) => projection([lon, lat]);
// The visible map is simply the SVG rectangle.
const VIEW = [[[0, 0], [WIDTH, 0], [WIDTH, HEIGHT], [0, HEIGHT], [0, 0]]];

// ---------------------------------------------------------------- small geometry helpers
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const dist = (a, b) => len(sub(a, b));
const avg = (pts) => mul(pts.reduce(add, [0, 0]), 1 / pts.length);

function ringArea(ring) {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return s / 2;
}
function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInPolygon(pt, poly) {   // poly = [outer, hole, hole…]
  if (!pointInRing(pt, poly[0])) return false;
  return !poly.slice(1).some((h) => pointInRing(pt, h));
}
// Do segments ab and cd cross (not counting shared end points)?
function segmentsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
function ringSelfCrosses(ring) {
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true;
    }
  }
  return false;
}
function polylineLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
}

// Writing numbers and shapes as SVG path text.
const R2 = (n) => Math.round(n * 100) / 100;
const f = (n) => String(Math.round(n * 10) / 10);   // 0.1 map unit ≈ 50 m is plenty
const ringD = (ring) => 'M' + ring.slice(0, -1).map((p) => f(p[0]) + ',' + f(p[1])).join('L') + 'Z';
const polyD = (poly) => poly.map(ringD).join('');
const multiD = (multi) => multi.map(polyD).join('');
const lineD = (pts) => 'M' + pts.map((p) => f(p[0]) + ',' + f(p[1])).join('L');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const attrs = (o) => Object.entries(o).map(([k, v]) => `${k}="${esc(v)}"`).join(' ');

// A small seeded random number generator (mulberry32), so every build is identical.
function rngFrom(text) {
  let h = 1779033703;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 3432918353) >>> 0;
  let a = h;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- the land we can play on
function countryPolys(id) {
  const geom = feature(countries, countries.objects.countries).features.find((f) => f.id === id).geometry;
  const multi = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  // Keep only the parts near the map (France has overseas islands, for example).
  const near = multi.filter((poly) => poly[0].some(([lon, lat]) =>
    lon > west - 3 && lon < east + 3 && lat > south - 3 && lat < north + 3));
  const projected = near.map((poly) => poly.map((ring) => ring.map(([lon, lat]) => projection([lon, lat]))));
  return polygonClipping.intersection(projected, VIEW);
}
const countryShapes = {};
for (const [k, id] of Object.entries(COUNTRY)) countryShapes[k] = countryPolys(id);
const playable = polygonClipping.union(...PLAYABLE.map((id) =>
  countryShapes[Object.keys(COUNTRY).find((k) => COUNTRY[k] === id)]));

// ---------------------------------------------------------------- the bent grid
const lanes = map.lanes.map((l) => l.id);
const cols = map.columns.map((c) => c.id);
const FRONT_COL = cols.indexOf(map.frontGapAfterColumn) + 1;   // grid line between E1 and G1 (= 3)
const boxAt = (k, c) => map.boxes.find((b) => b.lane === lanes[k] && b.column === cols[c]);
const A = lanes.map((_, k) => cols.map((_, c) => {
  const a = boxAt(k, c).anchor;
  return P([a.lat, a.lon]);
}));
const NK = lanes.length; const NC = cols.length;

// The front line, pushed a little out to sea at the top and into Switzerland at the
// bottom, so clipping gives clean ends. Then re-spaced to one point per map unit,
// so we can measure distance along it ("s").
const rawFront = extra.front.points.map(P);
const extend = (p, q, k) => add(p, mul(sub(p, q), k / dist(p, q)));
// Long straight run-outs at both ends (PAD map units): only used so the smoothing
// below works right up to the ends. The map itself starts START_OUT units out to sea
// and ends END_OUT units into Switzerland.
const PAD = 400; const START_OUT = 60; const END_OUT = 50;
rawFront.unshift(extend(rawFront[0], rawFront[1], PAD));
rawFront.push(extend(rawFront[rawFront.length - 1], rawFront[rawFront.length - 2], PAD));
const front = [rawFront[0]];
for (let i = 1; i < rawFront.length; i++) {
  const a = rawFront[i - 1]; const b = rawFront[i];
  const n = Math.max(1, Math.round(dist(a, b)));
  for (let t = 1; t <= n; t++) front.push(add(a, mul(sub(b, a), t / n)));
}
const FN = front.length;
const REAL_START = PAD; const REAL_END = FN - 1 - PAD;

// Where each anchor town is compared with the front: s = how far along the front
// its nearest point is, d = how far from the front it is (positive on its own side).
function frontCoords(p) {
  let best = REAL_START;
  for (let i = REAL_START; i <= REAL_END; i++) if (dist(p, front[i]) < dist(p, front[best])) best = i;
  const i0 = Math.max(0, best - 1); const i1 = Math.min(FN - 1, best + 1);
  const t = sub(front[i1], front[i0]);
  const side = Math.sign(t[0] * (p[1] - front[best][1]) - t[1] * (p[0] - front[best][0]));
  return { s: best, d: dist(p, front[best]), side };   // side +1 = right of travel = Entente
}

// Lane breaks → index of the nearest front point.
const breakIdx = [REAL_START - START_OUT];
for (const pt of extra.laneBreaks.points) breakIdx.push(frontCoords(P(pt)).s);
breakIdx.push(REAL_END + END_OUT);
for (let i = 1; i < breakIdx.length; i++) {
  if (breakIdx[i] <= breakIdx[i - 1]) throw new Error('laneBreaks must run north to south along the front');
}

// How deep (distance from the front) each column line lies, lane by lane, worked
// out from the anchor towns: halfway between the towns on either side of it.
// Lines 0 and 6 are the back edges of the map (clipped off by the frame).
const coords = A.map((row) => row.map(frontCoords));
const GAP = 1.5;   // a line keeps at least this far from any town
function laneDepths(k) {
  const d = coords[k].map((c) => c.d);
  const between = (inner, outerD) => {
    const lo = inner + GAP; const hi = outerD - GAP;
    return hi > lo ? (inner + outerD) / 2 : Math.max(lo, (inner + outerD) / 2);
  };
  const depth = [];
  depth[2] = between(d[2], d[1]);
  depth[1] = between(Math.max(d[1], depth[2] + GAP), d[0]);
  depth[0] = Math.max(d[0] * 1.5 + 40, depth[1] + 25);
  depth[4] = between(d[3], d[4]);
  depth[5] = between(Math.max(d[4], depth[4] + GAP), d[5]);
  depth[6] = Math.max(d[5] * 1.5 + 40, depth[5] + 25);
  depth[3] = 0;
  for (const n of (extra.depthOverrides?.list || [])) if (n.lane === k + 1) depth[n.line] = n.depth;
  return depth;
}
const laneDepth = lanes.map((_, k) => laneDepths(k));
// Depth of column line j at front position s: each lane keeps its own depth,
// blending into the next lane only close to the lane boundary.
const BLEND = 25;
function depthAt(j, s) {
  let k = 0;
  while (k < NK - 1 && s >= breakIdx[k + 1]) k++;
  const toNext = breakIdx[k + 1] - s; const fromPrev = s - breakIdx[k];
  const ease = (t) => t * t * (3 - 2 * t);
  if (k < NK - 1 && toNext < BLEND) {
    const t = 0.5 - 0.5 * (toNext / BLEND);
    return laneDepth[k][j] * (1 - ease(t)) + laneDepth[k + 1][j] * ease(t);
  }
  if (k > 0 && fromPrev < BLEND) {
    const t = 0.5 - 0.5 * (fromPrev / BLEND);
    return laneDepth[k][j] * (1 - ease(t)) + laneDepth[k - 1][j] * ease(t);
  }
  return laneDepth[k][j];
}

// ---------------------------------------------------------------- territories as a "Voronoi of the front"
// Every point of the map belongs to the lane whose stretch of front line is nearest
// to it, and to the column band its distance from the front falls in. A partition
// like that can't fold or tangle. To make the borders irregular, like real regions,
// we gently warp the space (seeded noise) before measuring, everywhere except right
// at the front, so the E1|G1 border stays exactly on the traced front line.
//
// Steps: 1) a fine grid of pixels: distance to the front + nearest front point,
// 2) give each pixel a box, 3) trace the borders between boxes as lines,
// 4) smooth them and join them into one outline per box.

const RES = 0.5;                                  // pixel size in map units
const GW = Math.ceil(WIDTH / RES); const GH = Math.ceil(HEIGHT / RES);
// The detailed area in grid pixels: [x0, y0, x1, y1].
const SEED_BOX = [SHIFT[0] / RES, SHIFT[1] / RES, (SHIFT[0] + INNER_WIDTH) / RES, (SHIFT[1] + INNER_HEIGHT) / RES];
const WARP_MAX = 6;                               // largest warp, map units (kept gentle
                                                  // enough that it can never fold space over)

// 1) Distance transform (Felzenszwalb & Huttenlocher) that also remembers which
//    point of a curve is nearest. Seeds = the curve drawn into the pixel grid.
const INF = 1e20;
function edt1d(f, n, outD, outArg) {
  const v = new Int32Array(n); const z = new Float64Array(n + 1);
  let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    if (f[q] >= INF) continue;
    if (f[v[0]] >= INF) { v[0] = q; continue; }
    let s;
    while (true) {
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      if (s <= z[k] && k > 0) k--; else break;
    }
    if (s <= z[k] && k === 0) { v[0] = q; z[1] = INF; continue; }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    outD[q] = f[v[k]] >= INF ? INF : (q - v[k]) * (q - v[k]) + f[v[k]];
    outArg[q] = v[k];
  }
}
function distanceField(curve) {
  const seedS = new Float32Array(GW * GH).fill(-1);
  for (let i = 0; i < curve.length - 1; i++) {
    for (let t = 0; t < 1; t += 0.125) {
      const p = add(curve[i], mul(sub(curve[i + 1], curve[i]), t));
      const x = Math.floor(p[0] / RES); const y = Math.floor(p[1] / RES);
      // only the part of the curve inside the detailed area counts (as before the scenery)
      if (x >= SEED_BOX[0] && y >= SEED_BOX[1] && x < SEED_BOX[2] && y < SEED_BOX[3]) seedS[y * GW + x] = i + t;
    }
  }
  // Pass 1, down each column: squared distance to the nearest seed in that column.
  const colD = new Float64Array(GW * GH);
  const colSeed = new Int32Array(GW * GH);
  let f = new Float64Array(GH); let d = new Float64Array(GH); let a = new Int32Array(GH);
  for (let x = 0; x < GW; x++) {
    for (let y = 0; y < GH; y++) f[y] = seedS[y * GW + x] >= 0 ? 0 : INF;
    edt1d(f, GH, d, a);
    for (let y = 0; y < GH; y++) { colD[y * GW + x] = d[y]; colSeed[y * GW + x] = a[y]; }
  }
  // Pass 2, along each row: combine the columns.
  const nearS = new Float32Array(GW * GH);        // s of the nearest point
  const nearD = new Float32Array(GW * GH);        // distance to it (map units)
  f = new Float64Array(GW); d = new Float64Array(GW); a = new Int32Array(GW);
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) f[x] = colD[y * GW + x];
    edt1d(f, GW, d, a);
    for (let x = 0; x < GW; x++) {
      const sx = a[x]; const sy = colSeed[y * GW + sx];
      nearS[y * GW + x] = seedS[sy * GW + sx];
      nearD[y * GW + x] = Math.sqrt(d[x]) * RES;
    }
  }
  return { nearS, nearD };
}
// Exact distances use the real front. "Which lane" uses a smoothed front once you
// are a few km back, so salients and bulges don't squeeze the rear areas.
const SMOOTH = 40;
const smoothCurve = front.map((_, i) => {
  const a = Math.max(0, i - SMOOTH); const b = Math.min(FN - 1, i + SMOOTH);
  return avg(front.slice(a, b + 1));
});
const exact = distanceField(front);
const smooth = distanceField(smoothCurve);
const nearD = exact.nearD;
const nearS = new Float32Array(GW * GH);
for (let i = 0; i < GW * GH; i++) {
  const t = Math.max(0, Math.min(1, (nearD[i] - 10) / 30));
  nearS[i] = exact.nearS[i] * (1 - t) + smooth.nearS[i] * t;
}

// Which side of the front a point is on: +1 Entente (right of travel), −1 German.
function sideOf(p, s) {
  const i = Math.round(s);
  const t = sub(front[Math.min(FN - 1, i + 3)], front[Math.max(0, i - 3)]);
  const r = sub(p, front[i]);
  return t[0] * r[1] - t[1] * r[0] >= 0 ? 1 : -1;
}

// Smooth random 2-D noise for the warp (seeded, so every build is the same).
function noise2d(key, wavelength) {
  const rnd = rngFrom(key);
  // the noise grid covers the detailed area, in its unshifted coordinates
  const nx = Math.ceil(INNER_WIDTH / wavelength) + 2; const ny = Math.ceil(INNER_HEIGHT / wavelength) + 2;
  const g = Array.from({ length: nx * ny }, () => rnd() * 2 - 1);
  const ease = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x - SHIFT[0]) / wavelength; const fy = (y - SHIFT[1]) / wavelength;
    const ix = Math.max(0, Math.min(nx - 2, Math.floor(fx))); const iy = Math.max(0, Math.min(ny - 2, Math.floor(fy)));
    const tx = ease(fx - ix); const ty = ease(fy - iy);
    const a = g[iy * nx + ix] * (1 - tx) + g[iy * nx + ix + 1] * tx;
    const b = g[(iy + 1) * nx + ix] * (1 - tx) + g[(iy + 1) * nx + ix + 1] * tx;
    return a * (1 - ty) + b * ty;
  };
}
const warpX = [noise2d('wx1', 100), noise2d('wx2', 30)];
const warpY = [noise2d('wy1', 100), noise2d('wy2', 30)];

// 2) Give each pixel a box number (k * NC + c), or −1 for "no territory here".
function laneOf(s) {
  if (s < breakIdx[0] || s >= breakIdx[NK]) return -1;
  let k = 0;
  while (s >= breakIdx[k + 1]) k++;
  return k;
}
// Optional tilt of a lane boundary (laneBreaks [lat, lon, tiltEntente, tiltGerman]):
// far from the front, the boundary leans by `tilt` front-units per unit of depth.
const tilts = extra.laneBreaks.points.map((p, i) => ({ s: breakIdx[i + 1], e: p[2] || 0, g: p[3] || 0 }));
function tiltAt(s, side) {
  let t = 0;
  for (const b of tilts) {
    const w = Math.exp(-(((s - b.s) / 20) ** 2));
    t += w * (side > 0 ? b.e : b.g);
  }
  return t;
}
// The back edge of the map (beyond E3 / G3) gets a ragged, hand-drawn look.
const outerNoise = [noise2d('outer1', 90), noise2d('outer2', 35)];
function classify(s, d, side, x, y) {
  if (d > 6) s -= tiltAt(s, side) * (d - 6);
  const k = laneOf(s);
  if (k < 0) return -1;
  // Column lines on this side, nearest the front first: 2,1,0 (Entente) or 4,5,6 (German).
  const lines = side > 0 ? [2, 1, 0] : [4, 5, 6];
  const columns = side > 0 ? [2, 1, 0] : [3, 4, 5];
  for (let n = 0; n < 2; n++) if (d < depthAt(lines[n], s)) return k * NC + columns[n];
  const rag = 1 + 0.12 * outerNoise[0](x, y) + 0.025 * outerNoise[1](x, y);
  if (d < depthAt(lines[2], s) * rag) return k * NC + columns[2];
  return -1;
  return -1;
}
const label = new Int16Array(GW * GH);
for (let y = 0; y < GH; y++) {
  for (let x = 0; x < GW; x++) {
    const i = y * GW + x;
    const px = (x + 0.5) * RES; const py = (y + 0.5) * RES;
    // Warp less near the front (none at the front itself).
    const amp = Math.min(WARP_MAX, nearD[i] * 0.15);
    const qx = px + amp * (warpX[0](px, py) + 0.25 * warpX[1](px, py));
    const qy = py + amp * (warpY[0](px, py) + 0.25 * warpY[1](px, py));
    const gx = Math.max(SEED_BOX[0], Math.min(SEED_BOX[2] - 1, Math.floor(qx / RES)));
    const gy = Math.max(SEED_BOX[1], Math.min(SEED_BOX[3] - 1, Math.floor(qy / RES)));
    const j = gy * GW + gx;
    // Territories stay inside the detailed area (frame.bounds), exactly as they were
    // before the scenery was added; the edge of that area fades out softly (see
    // innerFade). The land beyond is scenery, not territory.
    const outsideInner = x < SEED_BOX[0] || y < SEED_BOX[1] || x >= SEED_BOX[2] || y >= SEED_BOX[3];
    label[i] = outsideInner ? -1 : classify(nearS[j], nearD[j], sideOf([qx, qy], exact.nearS[j]), px, py);
  }
}
if (process.env.DUMP) {
  const ow = INNER_WIDTH / RES; const oh = Math.floor(INNER_HEIGHT / RES);
  const crop = new Int16Array(ow * oh); const cs = new Float32Array(ow * oh); const cd = new Float32Array(ow * oh);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) { const j = (y + SEED_BOX[1]) * GW + x + SEED_BOX[0]; crop[y * ow + x] = label[j]; cs[y*ow+x] = nearS[j]; cd[y*ow+x]=nearD[j]; }
  writeFileSync(process.env.DUMP, Buffer.concat([Buffer.from(crop.buffer), Buffer.from(cs.buffer), Buffer.from(cd.buffer)]));
}
const boxOfLabel = (l) => boxAt(Math.floor(l / NC), l % NC);
const labelAt = (x, y) => (x < 0 || y < 0 || x >= GW || y >= GH ? -1 : label[y * GW + x]);

// 3) Trace borders. Pixel corners are (x, y) with 0 ≤ x ≤ GW, 0 ≤ y ≤ GH.
// A corner touching 3 or more boxes (or a checkerboard) is a "node"; a border line
// ("chain") runs between two nodes and separates exactly two labels.
const CW = GW + 1;
const cid = (x, y) => y * CW + x;
// Edges around corner (x, y): right, down, left, up. An edge is a border if the two
// pixels on either side of it differ.
function edgeLabels(x, y, dir) {
  if (dir === 0) return [labelAt(x, y - 1), labelAt(x, y)];       // → between pixel above & below
  if (dir === 1) return [labelAt(x, y), labelAt(x - 1, y)];       // ↓ between right & left
  if (dir === 2) return [labelAt(x - 1, y), labelAt(x - 1, y - 1)]; // ←
  return [labelAt(x - 1, y - 1), labelAt(x, y - 1)];              // ↑
}
const DX = [1, 0, -1, 0]; const DY = [0, 1, 0, -1];
function isBorder(x, y, dir) {
  const nx = x + DX[dir]; const ny = y + DY[dir];
  if (nx < 0 || ny < 0 || nx > GW || ny > GH) return false;
  const [a, b] = edgeLabels(x, y, dir);
  return a !== b;
}
function cornerInfo(x, y) {
  const around = [labelAt(x - 1, y - 1), labelAt(x, y - 1), labelAt(x, y), labelAt(x - 1, y)];
  let degree = 0;
  for (let dir = 0; dir < 4; dir++) if (isBorder(x, y, dir)) degree++;
  const distinct = new Set(around).size;
  return { degree, node: degree >= 3 || (degree === 4 && distinct === 2) || distinct >= 3 };
}
// Visited marks per corner and direction.
const visited = new Uint8Array(CW * (GH + 1));
const markEdge = (x, y, dir) => {
  visited[cid(x, y)] |= 1 << dir;
  visited[cid(x + DX[dir], y + DY[dir])] |= 1 << ((dir + 2) % 4);
};
const chains = [];   // { a, b, n1, n2, pts: [[x, y] corners] }
function walk(x0, y0, dir0) {
  const [a, b] = edgeLabels(x0, y0, dir0);
  const pts = [[x0, y0]];
  let x = x0; let y = y0; let dir = dir0;
  while (true) {
    markEdge(x, y, dir);
    x += DX[dir]; y += DY[dir];
    pts.push([x, y]);
    if (x === x0 && y === y0) break;                    // closed loop
    if (cornerInfo(x, y).node) break;
    // carry on along the one other border edge at this corner
    let next = -1;
    for (let d = 0; d < 4; d++) {
      if (d === (dir + 2) % 4) continue;
      if (isBorder(x, y, d)) { next = d; break; }
    }
    if (next < 0) break;
    dir = next;
  }
  chains.push({ a: Math.min(a, b), b: Math.max(a, b), n1: cid(x0, y0), n2: cid(x, y), pts });
}
// Start from every node first, then pick up loops that have no node.
const nodes = new Set();
for (let y = 0; y <= GH; y++) {
  for (let x = 0; x <= GW; x++) {
    // quick skip: a corner can only matter if its four pixels differ
    const l0 = labelAt(x - 1, y - 1);
    if (l0 === labelAt(x, y - 1) && l0 === labelAt(x, y) && l0 === labelAt(x - 1, y)) continue;
    if (cornerInfo(x, y).node) nodes.add(cid(x, y));
  }
}
for (const n of nodes) {
  const x = n % CW; const y = Math.floor(n / CW);
  for (let dir = 0; dir < 4; dir++) {
    if (isBorder(x, y, dir) && !(visited[n] & (1 << dir))) walk(x, y, dir);
  }
}
for (let y = 0; y <= GH; y++) {
  for (let x = 0; x <= GW; x++) {
    for (let dir = 0; dir < 4; dir++) {
      if (isBorder(x, y, dir) && !(visited[cid(x, y)] & (1 << dir))) { nodes.add(cid(x, y)); walk(x, y, dir); }
    }
  }
}

// Node positions in map units (we may move some nodes below).
const nodePos = new Map();
for (const n of nodes) nodePos.set(n, [(n % CW) * RES, Math.floor(n / CW) * RES]);
const isNeighbourPair = (a, b) => {
  if (a < 0 || b < 0) return true;
  return boxOfLabel(a).neighbours.includes(boxOfLabel(b).id);
};
// Where four boxes meet, the pixels sometimes make a tiny border between two
// diagonal boxes. Shrink each of those to a single point.
const nodeAlias = new Map();
const findNode = (n) => { while (nodeAlias.has(n)) n = nodeAlias.get(n); return n; };
for (const ch of chains) {
  if (isNeighbourPair(ch.a, ch.b) || ch.pts.length > 21) continue;   // up to 10 map units
  const n1 = findNode(ch.n1); const n2 = findNode(ch.n2);
  if (n1 !== n2) {
    nodePos.set(n1, avg([nodePos.get(n1), nodePos.get(n2)]));
    nodeAlias.set(n2, n1);
  }
  ch.dropped = true;
}
let liveChains = chains.filter((c) => !c.dropped);
for (const ch of liveChains) { ch.n1 = findNode(ch.n1); ch.n2 = findNode(ch.n2); }

// 4) Smooth each border (keeping its ends fixed) and turn it into map units.
// The border between a lane's E1 and G1 is replaced by the exact traced front line.
function chaikin(pts, rounds) {
  for (let r = 0; r < rounds; r++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i]; const q = pts[i + 1];
      out.push(add(mul(p, 0.75), mul(q, 0.25)), add(mul(p, 0.25), mul(q, 0.75)));
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}
function simplify(pts, tol) {   // Douglas–Peucker
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    const a = pts[i]; const b = pts[j]; const ab = sub(b, a); const L = len(ab) || 1e-9;
    let best = -1; let bestD = tol;
    for (let m = i + 1; m < j; m++) {
      const dd = Math.abs(ab[0] * (pts[m][1] - a[1]) - ab[1] * (pts[m][0] - a[0])) / L;
      if (dd > bestD) { bestD = dd; best = m; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([i, best], [best, j]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const frontPair = (ch) => ch.a >= 0 && ch.a % NC === 2 && ch.b === ch.a + 1;   // lane k E1 + G1
for (const ch of liveChains) {
  if (frontPair(ch)) {
    const k = Math.floor(ch.a / NC);
    const p1 = nodePos.get(ch.n1); const p2 = nodePos.get(ch.n2);
    let line = front.slice(breakIdx[k], breakIdx[k + 1] + 1);
    if (dist(p1, line[0]) + dist(p2, line[line.length - 1]) > dist(p1, line[line.length - 1]) + dist(p2, line[0])) line = line.reverse();
    nodePos.set(ch.n1, line[0]); nodePos.set(ch.n2, line[line.length - 1]);
    ch.frontLine = line;
  }
}
for (const ch of liveChains) {
  if (ch.frontLine) { ch.xy = ch.frontLine; continue; }
  let pts = ch.pts.map(([x, y]) => [x * RES, y * RES]);
  pts[0] = nodePos.get(ch.n1); pts[pts.length - 1] = nodePos.get(ch.n2);
  if (ch.n1 === ch.n2 && pts.length > 3) {      // a closed loop: smooth it all round
    pts = simplify(chaikin(pts, 3), 0.15);
  } else {
    pts = simplify(chaikin(pts, 3), 0.15);
    pts[0] = nodePos.get(ch.n1); pts[pts.length - 1] = nodePos.get(ch.n2);
  }
  ch.xy = pts;
}

// Hand-drawn wobble (STYLE.md §13): nudge every border sideways by a smooth, tiny,
// seeded amount, as if drawn with a pen. The ends stay put, so borders still meet,
// and the checks below still prove every box touches exactly its neighbours.
function handWobble(pts, key, amp) {
  if (pts.length < 2) return pts;
  // re-space the line to one point every 1.2 units
  const even = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]; const b = pts[i]; const n = Math.max(1, Math.round(dist(a, b) / 1.2));
    for (let t = 1; t <= n; t++) even.push(add(a, mul(sub(b, a), t / n)));
  }
  const rnd = rngFrom('wobble' + key);
  const knots = Array.from({ length: Math.ceil(even.length / 5) + 2 }, () => rnd() * 2 - 1);
  const noise = (i) => {
    const x = i / 5; const k = Math.floor(x); const t = x - k; const e = t * t * (3 - 2 * t);
    return knots[k] * (1 - e) + knots[k + 1] * e;
  };
  const last = even.length - 1;
  return even.map((p, i) => {
    if (i === 0 || i === last) return p;
    const q = even[Math.min(last, i + 1)]; const r = even[Math.max(0, i - 1)];
    const d = sub(q, r); const L = len(d) || 1;
    const taper = Math.min(1, i / 8, (last - i) / 8);          // calm near the ends
    return add(p, mul([-d[1] / L, d[0] / L], amp * taper * noise(i)));
  });
}
liveChains.forEach((ch, i) => {
  ch.plain = ch.xy;                                             // kept in case we must undo it
  if (ch.n1 === ch.n2) return;                                  // leave closed loops alone
  ch.xy = simplify(handWobble(ch.xy, i, 0.32), 0.05);
});

// Join each box's borders into one outline.
let rings = {};
let ringProblems = [];
let tangled = [];
function assembleRings() {
rings = {}; ringProblems = []; tangled = [];
for (let l = 0; l < NK * NC; l++) {
  const mine = liveChains.filter((c) => c.a === l || c.b === l);
  const box = boxOfLabel(l);
  if (mine.length === 0) { ringProblems.push(`${box.id} has no area on the map`); continue; }
  const unused = new Set(mine);
  const loops = [];
  while (unused.size) {
    const first = unused.values().next().value; unused.delete(first);
    const loop = first.xy.slice();
    let end = first.n2; const start = first.n1;
    while (end !== start) {
      const next = [...unused].find((c) => c.n1 === end || c.n2 === end);
      if (!next) break;
      unused.delete(next);
      const pts = next.n1 === end ? next.xy : next.xy.slice().reverse();
      loop.push(...pts.slice(1));
      end = next.n1 === end ? next.n2 : next.n1;
    }
    loop.push(loop[0]);
    loops.push(loop);
  }
  loops.sort((p, q) => Math.abs(ringArea(q)) - Math.abs(ringArea(p)));
  const ring = loops[0];
  if (ringArea(ring) < 0) ring.reverse();
  if (loops.length > 1 && Math.abs(ringArea(loops[1])) > 4) ringProblems.push(`${box.id} is in ${loops.length} pieces`);
  if (ringSelfCrosses(ring)) { ringProblems.push(`${box.id}'s outline crosses itself`); tangled.push(l); }
  rings[box.id] = ring;
}
}
// Where the wobble made an outline cross itself (tight corners), take the wobble
// off that box's borders and try again.
assembleRings();
for (let tries = 0; tries < 3 && tangled.length; tries++) {
  for (const ch of liveChains) if (tangled.includes(ch.a) || tangled.includes(ch.b)) ch.xy = ch.plain;
  assembleRings();
}

// A picture of the raw result (tools/cache/debug.svg), handy when tuning.
function writeDebug() {
  const o = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}"><rect width="100%" height="100%" fill="#fff"/>`];
  o.push(`<path d="${multiD(playable)}" fill="#eee" stroke="#999"/>`);
  for (const [id, ring] of Object.entries(rings)) {
    const b = map.boxes.find((x) => x.id === id);
    const hue = (map.lanes.findIndex((l) => l.id === b.lane) * 67) % 360;
    const light = 45 + map.columns.findIndex((c) => c.id === b.column) * 8;
    o.push(`<path d="${lineD(ring)}Z" fill="hsla(${hue},60%,${light}%,.45)" stroke="#333" stroke-width="0.4"/>`);
  }
  for (const b of map.boxes) {
    const [x, y] = P([b.anchor.lat, b.anchor.lon]);
    o.push(`<circle cx="${f(x)}" cy="${f(y)}" r="1.5"/><text x="${f(x)}" y="${f(y - 2)}" font-size="5">${b.id.slice(1)}</text>`);
  }
  o.push(`<path d="${lineD(front.slice(REAL_START, REAL_END + 1))}" fill="none" stroke="red" stroke-width="1"/>`);
  o.push('</svg>');
  mkdirSync(join(here, 'cache'), { recursive: true });
  writeFileSync(join(here, 'cache/debug.svg'), o.join('\n'));
}
writeDebug();
// Which box a lat/long point falls in (for tuning; also used by the checks below).
function boxAtPoint(lat, lon) {
  const [x, y] = P([lat, lon]);
  const l = labelAt(Math.floor(x / RES), Math.floor(y / RES));
  return l < 0 ? 'none' : boxOfLabel(l).id;
}
if (process.env.REGIONS) {
  const sum = {};
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const l = label[y * GW + x]; if (l < 0) continue;
    (sum[l] ||= [0, 0, 0]); sum[l][0] += x; sum[l][1] += y; sum[l][2]++;
  }
  for (const [l, [sx, sy, n]] of Object.entries(sum)) {
    const [lon, lat] = projection.invert([sx / n * RES, sy / n * RES]);
    console.log(`  region ${boxOfLabel(+l).id}: centre ${lat.toFixed(3)},${lon.toFixed(3)} area ${(n * RES * RES).toFixed(0)}`);
  }
}
if (process.env.PROBE) {
  for (const item of process.env.PROBE.split(';')) {
    const [name, lat, lon] = item.split(',');
    console.log(`  probe ${name}: ${boxAtPoint(+lat, +lon)}`);
  }
}

// ---------------------------------------------------------------- clip to land and check
const pkey = (p) => R2(p[0]) + ',' + R2(p[1]);
const shapes = {};
const problems = [...ringProblems];
for (const box of map.boxes) {
  if (!rings[box.id]) continue;
  const clipped = polygonClipping.intersection([rings[box.id]], playable);
  if (clipped.length === 0) { problems.push(`${box.id} is entirely outside the land`); continue; }
  // Keep the main piece; drop tiny bits (like a sandbank cut off by the coast).
  clipped.sort((p, q) => Math.abs(ringArea(q[0])) - Math.abs(ringArea(p[0])));
  const main = clipped[0];
  for (const extraPiece of clipped.slice(1)) {
    if (Math.abs(ringArea(extraPiece[0])) > 0.05 * Math.abs(ringArea(main[0]))) {
      problems.push(`${box.id} is split into separate pieces by the coastline`);
    }
  }
  shapes[box.id] = main;
  const a = box.anchor;
  if (!pointInPolygon(P([a.lat, a.lon]), main)) problems.push(`${box.id} does not contain its town ${a.town} (it is in ${boxAtPoint(a.lat, a.lon)})`);
}

// Which boxes really share a border? Look for line segments two shapes have in common.
function segments(poly) {
  const out = [];
  for (const ring of poly) for (let i = 0; i < ring.length - 1; i++) out.push([ring[i], ring[i + 1]]);
  return out;
}
const segOwners = new Map();   // "x,y|x,y" → { a, b, boxes: Set }
for (const [id, poly] of Object.entries(shapes)) {
  for (const [p, q] of segments(poly)) {
    const k1 = pkey(p); const k2 = pkey(q);
    const key = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1;
    if (!segOwners.has(key)) segOwners.set(key, { p, q, boxes: new Set() });
    segOwners.get(key).boxes.add(id);
  }
}
const shared = new Map();      // "idA|idB" → list of [p, q] segments
for (const { p, q, boxes } of segOwners.values()) {
  if (boxes.size !== 2) continue;
  const [a, b] = [...boxes].sort();
  const key = a + '|' + b;
  if (!shared.has(key)) shared.set(key, []);
  shared.get(key).push([p, q]);
}
const sharedLength = (key) => (shared.get(key) || []).reduce((s, [p, q]) => s + dist(p, q), 0);

const wanted = new Set();
for (const box of map.boxes) for (const n of box.neighbours) wanted.add([box.id, n].sort().join('|'));
for (const key of wanted) {
  if (sharedLength(key) < MIN_SHARED) problems.push(`neighbours ${key.replace('|', ' and ')} don't share a border on the map`);
}
for (const key of shared.keys()) {
  if (!wanted.has(key) && sharedLength(key) > 0.01) problems.push(`${key.replace('|', ' and ')} share a border but are not neighbours (${sharedLength(key).toFixed(1)} units)`);
}
if (problems.length) {
  console.error('The map failed its checks, so nothing was written:\n  ' + problems.join('\n  '));
  process.exit(1);
}

// Join a pair's shared segments into continuous lines (nicer corners when drawn bold).
function chain(segs) {
  const lines = [];
  const left = segs.map(([p, q]) => [p, q]);
  while (left.length) {
    const line = left.pop();
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const [p, q] = left[i];
        const head = line[0]; const tail = line[line.length - 1];
        if (pkey(p) === pkey(tail)) line.push(q);
        else if (pkey(q) === pkey(tail)) line.push(p);
        else if (pkey(q) === pkey(head)) line.unshift(p);
        else if (pkey(p) === pkey(head)) line.unshift(q);
        else continue;
        left.splice(i, 1); grew = true; break;
      }
    }
    lines.push(line);
  }
  return lines;
}

// ---------------------------------------------------------------- SVG writing helpers

// Drop points closer together than `tol`, to keep the file small.
function thin(pts, tol) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) if (dist(pts[i], out[out.length - 1]) >= tol) out.push(pts[i]);
  out.push(pts[pts.length - 1]);
  return out;
}

// ---------------------------------------------------------------- the look (docs/STYLE.md)
// Palette, STYLE.md §2. The map uses only these colours.
const C = {
  paper: '#E8DCC0', paperDark: '#D6C7A3', ink: '#2B241C', inkFaded: '#6E6253',
  river: '#5F7F95', forest: '#5E6B45', ridge: '#8A7454', frontRed: '#8E1B1B',
  leather: '#221D18', telegram: '#F1E6C8', brass: '#B08D57',
};
const FONT = {
  place: "'IM Fell English SC', 'IM Fell English', Georgia, serif",
  fell: "'IM Fell English', Georgia, serif",
  title: "'Playfair Display', Georgia, serif",
};

// Terrain textures (STYLE.md §4.4), one <pattern> per texture name in terrain.json.
const TEXTURES = {
  // flooded: blue diagonal hatch
  diagonal: (c) => `<path d="M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2" stroke="${c}" stroke-width="0.7"/>`,
  // ridge: short hachure strokes
  hachure: (c) => `<path d="M1,2 v2.6 M4.5,5.5 v2.6 M8,1.5 v2.6 M2.5,9 v2.6 M9.5,8.5 v2.6" stroke="${c}" stroke-width="0.55" stroke-linecap="round" opacity="0.8"/>`,
  // mud: a darker, blotchy wash (only shown in autumn)
  blotch: (c) => `<g fill="${c}" opacity="0.11"><path d="M1,4c1,-3 5,-3 6,-1s-1,4 -3,3.5s-3.5,0 -3,-2.5z"/><path d="M11,9c1.5,-2 5,-1.5 5,0.5s-2,3 -3.5,2.5s-2.5,-1 -1.5,-3z"/><path d="M4,13.5c1,-1 3,-1 3.4,0.4s-1.4,1.8 -2.4,1.4s-1.6,-0.8 -1,-1.8z"/><circle cx="15.5" cy="3" r="0.9"/><circle cx="9" cy="16.5" r="0.7"/></g>`,
  // forest: stippled tree dots
  trees: (c) => `<g fill="${c}"><circle cx="1.5" cy="1.8" r="0.75"/><circle cx="4.6" cy="3.6" r="0.6"/><circle cx="2.6" cy="5.4" r="0.7"/><circle cx="6.2" cy="0.9" r="0.55"/><circle cx="5.6" cy="6.3" r="0.5"/></g>`,
  // mountains: little hill strokes
  hills: (c) => `<path d="M1,6 q2.5,-3.2 5,0 M7,12 q2.5,-3.2 5,0" fill="none" stroke="${c}" stroke-width="0.6" stroke-linecap="round"/>`,
};
const TEX_SIZE = { diagonal: 6, hachure: 12, blotch: 18, trees: 7, hills: 12 };
function patternDefs() {
  const out = [];
  for (const t of terrainData.types) {
    const tex = t.draw.texture;
    if (!tex) continue;
    if (!TEXTURES[tex]) throw new Error(`terrain.json: unknown texture "${tex}" for ${t.id}`);
    const sz = TEX_SIZE[tex];
    out.push(`<pattern id="pat-${t.id}" patternUnits="userSpaceOnUse" width="${sz}" height="${sz}">${TEXTURES[tex](t.draw.color)}</pattern>`);
  }
  // The sea: old-map horizontal hatch.
  out.push(`<pattern id="pat-sea" patternUnits="userSpaceOnUse" width="8" height="2.6"><path d="M0,1.3 h8" stroke="${C.river}" stroke-width="0.45" opacity="0.7"/></pattern>`);
  // No-man's land: crater stipple (map.js draws it along the front line).
  out.push(`<pattern id="pat-craters" patternUnits="userSpaceOnUse" width="9" height="9"><g fill="none" stroke="${C.inkFaded}" stroke-width="0.35"><circle cx="2" cy="2.2" r="0.9"/><circle cx="6.5" cy="4" r="1.2"/><circle cx="3.4" cy="7" r="0.7"/><circle cx="8" cy="8" r="0.5"/></g><g fill="${C.inkFaded}"><circle cx="5" cy="1" r="0.3"/><circle cx="1" cy="5" r="0.3"/><circle cx="7.4" cy="6.6" r="0.25"/></g></pattern>`);
  return out.join('\n');
}
const terrainType = (id) => terrainData.types.find((t) => t.id === id);
function groundFor(box) {
  let best = null;
  for (const id of box.terrain) {
    const t = terrainType(id);
    if (t.draw.ground && (!best || t.draw.priority > best.draw.priority)) best = t;
  }
  return best ? best.draw : null;
}

// Paper grain: a small seamless tile of soft noise, written as a PNG inside the SVG.
function crc32(buf) {
  let c; const table = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = table[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function paperGrainPng(size) {
  const rnd = rngFrom('paper');
  // periodic value noise at a few scales, so the tile repeats without seams
  const octave = (cells) => {
    const g = Array.from({ length: cells * cells }, () => rnd());
    return (x, y) => {
      const fx = (x / size) * cells; const fy = (y / size) * cells;
      const ix = Math.floor(fx); const iy = Math.floor(fy); const tx = fx - ix; const ty = fy - iy;
      const at = (i, j) => g[((j % cells) * cells) + (i % cells)];
      const e = (t) => t * t * (3 - 2 * t);
      const a = at(ix, iy) * (1 - e(tx)) + at(ix + 1, iy) * e(tx);
      const b = at(ix, iy + 1) * (1 - e(tx)) + at(ix + 1, iy + 1) * e(tx);
      return a * (1 - e(ty)) + b * e(ty);
    };
  };
  const oct = [octave(4), octave(16), octave(64)];
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 2);   // filter byte, then grey + alpha per pixel
    for (let x = 0; x < size; x++) {
      const n = 0.5 * oct[0](x, y) + 0.3 * oct[1](x, y) + 0.2 * oct[2](x, y) + (rnd() - 0.5) * 0.12;
      row[1 + x * 2] = 0x6E;                                        // ink-faded grey
      row[2 + x * 2] = Math.max(0, Math.min(255, Math.round((n - 0.35) * 70)));
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 4; // grey+alpha
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })), pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return 'data:image/png;base64,' + png.toString('base64');
}

// ---------------------------------------------------------------- coast, borders, rivers
const land = readJson(join(here, 'node_modules/world-atlas/land-10m.json'));
const inFrame = ([lon, lat]) => lon > west - 0.5 && lon < east + 0.5 && lat > south - 0.5 && lat < north + 0.5;
// Keep only the runs of a line that are on (or near) the map.
function framedLines(lines) {
  const out = [];
  for (const line of lines) {
    let run = [];
    for (const pt of line) {
      if (inFrame(pt)) run.push(projection(pt));
      else { if (run.length > 1) out.push(run); run = []; }
    }
    if (run.length > 1) out.push(run);
  }
  return out;
}
const coastLines = framedLines(mesh(land, land.objects.land).coordinates);
// International borders, except today's Franco-German border on the Rhine: in 1914
// the border was the 1871 frontier, drawn separately from map-extra.json.
const borderLines = framedLines(mesh(countries, countries.objects.countries, (a, b) =>
  a !== b && !((a.id === COUNTRY.fra && b.id === COUNTRY.deu) || (a.id === COUNTRY.deu && b.id === COUNTRY.fra))).coordinates);

async function riverLines() {
  const out = [];
  const keep = extra.riverNames;
  for (const name of ['ne_10m_rivers_lake_centerlines', 'ne_10m_rivers_europe']) {
    const g = await naturalEarth(name);
    for (const ft of g.features) {
      if (!ft.geometry || !keep[ft.properties.name]) continue;
      const lines = ft.geometry.type === 'LineString' ? [ft.geometry.coordinates] : ft.geometry.coordinates;
      for (const line of lines) {
        if (!line.some(([lon, lat]) => lon > west && lon < east && lat > south && lat < north)) continue;
        out.push({ name: keep[ft.properties.name], pts: line.map(([lon, lat]) => projection([lon, lat])) });
      }
    }
  }
  for (const r of extra.rivers.list) out.push({ name: r.name, pts: r.points.map(P), traced: true });
  return out;
}
// Put each river's name once, near the middle of its visible part, turned to follow it.
function riverLabels(rivers) {
  const byName = {};
  for (const r of rivers) {
    const inside = r.pts.filter((p) => p[0] > 20 && p[0] < WIDTH - 20 && p[1] > 20 && p[1] < HEIGHT - 20);
    if (inside.length < 2) continue;
    if (!byName[r.name] || polylineLength(inside) > polylineLength(byName[r.name])) byName[r.name] = inside;
  }
  const out = [];
  for (const [name, pts] of Object.entries(byName)) {
    const mid = (extra.riverLabelAt?.[name]) ?? 0.5;
    const i = Math.max(1, Math.min(pts.length - 1, Math.floor(pts.length * mid)));
    const d = sub(pts[i], pts[i - 1]);
    let ang = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
    if (ang > 90) ang -= 180;
    if (ang < -90) ang += 180;
    const at = pts[i];
    out.push(`<text class="river-label map-label" transform="translate(${f(at[0])},${f(at[1])}) rotate(${f(ang)})" dy="-2">${esc(name)}</text>`);
  }
  return out;
}

// ---------------------------------------------------------------- relief (STYLE.md §4.3)
// Ridge crests from map-extra.json: a soft hillshade band plus hachure strokes
// running down both slopes, like a 1916 staff map.
function reliefSvg() {
  const out = [];
  for (const ridge of extra.ridges.list) {
    const pts = ridge.points.map(P);
    out.push(`<path class="hillshade" d="${lineD(pts)}" stroke-width="${ridge.width || 12}"/>`);
    // walk along the crest and draw a tick to each side every 1.6 units
    const ticks = [];
    const half = (ridge.width || 12) * 0.38;
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]; const b = pts[i]; const L = dist(a, b);
      const u = mul(sub(b, a), 1 / L); const nrm = [-u[1], u[0]];
      for (let t = carry; t < L; t += 1.6) {
        const c = add(a, mul(u, t));
        const k = 0.55 + 0.45 * Math.abs(Math.sin((i * 7 + t) * 1.7));   // uneven lengths
        for (const side of [1, -1]) {
          const p1 = add(c, mul(nrm, side * 0.9)); const p2 = add(c, mul(nrm, side * half * k));
          ticks.push(`M${f(p1[0])},${f(p1[1])}L${f(p2[0])},${f(p2[1])}`);
        }
        carry = t + 1.6 - L;
      }
    }
    out.push(`<path class="hachures" d="${ticks.join('')}"/>`);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- map furniture (STYLE.md §4.10)
function cartouche() {
  const x = WIDTH - 262; const y = 14; const w = 248; const h = 76;
  return `<g id="cartouche">
<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.paper}" stroke="${C.ink}" stroke-width="1.4"/>
<rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" fill="none" stroke="${C.ink}" stroke-width="0.5"/>
<path d="M${x + 4},${y + 14} l10,-10 M${x + w - 4},${y + 14} l-10,-10 M${x + 4},${y + h - 14} l10,10 M${x + w - 4},${y + h - 14} l-10,10" stroke="${C.ink}" stroke-width="0.5"/>
<text class="cartouche-small" x="${x + w / 2}" y="${y + 24}">THEATRE OF OPERATIONS</text>
<text class="cartouche-title" x="${x + w / 2}" y="${y + 46}">WESTERN FRONT</text>
<path d="M${x + 60},${y + 53} h${w - 120}" stroke="${C.ink}" stroke-width="0.5"/>
<text id="map-date" class="cartouche-date" x="${x + w / 2}" y="${y + 66}">December 1914</text>
</g>`;
}
function compassRose(cx, cy, r) {
  const pt = (ang, rad) => [cx + Math.sin(ang) * rad, cy - Math.cos(ang) * rad];
  const star = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4; const big = i % 2 === 0;
    const tip = pt(a, big ? r : r * 0.6);
    const l = pt(a - Math.PI / 8, r * 0.17); const rr = pt(a + Math.PI / 8, r * 0.17);
    star.push(`<path d="M${f(cx)},${f(cy)}L${f(l[0])},${f(l[1])}L${f(tip[0])},${f(tip[1])}Z" fill="${C.ink}"/>`,
      `<path d="M${f(cx)},${f(cy)}L${f(rr[0])},${f(rr[1])}L${f(tip[0])},${f(tip[1])}Z" fill="${C.paper}" stroke="${C.ink}" stroke-width="0.4"/>`);
  }
  const n = pt(0, r + 7);
  return `<g id="compass"><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.78)}" fill="none" stroke="${C.ink}" stroke-width="0.5"/>${star.join('')}<text class="compass-n" x="${f(n[0])}" y="${f(n[1])}">N</text></g>`;
}
function scaleBar(x, y) {
  // How many map units is 1 km here? Measure 0.5° of latitude (55.6 km) at the map's middle.
  const a = P([49.2, 4.5]); const b = P([49.7, 4.5]);
  const perKm = dist(a, b) / 55.6;
  const km = 50; const miles = 30; const wKm = km * perKm; const wMi = miles * 1.609 * perKm;
  const segs = [];
  for (let i = 0; i < 5; i++) segs.push(`<rect x="${f(x + (i * wKm) / 5)}" y="${y}" width="${f(wKm / 5)}" height="2.4" fill="${i % 2 ? C.paper : C.ink}" stroke="${C.ink}" stroke-width="0.4"/>`);
  for (let i = 0; i < 3; i++) segs.push(`<rect x="${f(x + (i * wMi) / 3)}" y="${y + 2.4}" width="${f(wMi / 3)}" height="2.4" fill="${i % 2 ? C.ink : C.paper}" stroke="${C.ink}" stroke-width="0.4"/>`);
  return `<g id="scale-bar">${segs.join('')}
<text class="scale-text" x="${x}" y="${y - 2.5}">0</text><text class="scale-text" x="${f(x + wKm)}" y="${y - 2.5}">${km} km</text>
<text class="scale-text" x="${f(x + wMi)}" y="${y + 11}">${miles} miles</text></g>`;
}

// City symbols (STYLE.md §4.9): a church for a VP town, a bigger star for the capital
// (the box with the most VP), a star-fort outline for fortresses.
function churchSymbol(x, y) {
  return `<path class="sym" d="M${f(x)},${f(y - 2.2)}v-3.2M${f(x - 1.2)},${f(y - 4.4)}h2.4"/><circle class="sym-fill" cx="${f(x)}" cy="${f(y)}" r="1.9"/>`;
}
function starPath(x, y, r1, r2, points) {
  const p = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (i * Math.PI) / points - Math.PI / 2; const r = i % 2 ? r2 : r1;
    p.push(`${f(x + Math.cos(a) * r)},${f(y + Math.sin(a) * r)}`);
  }
  return 'M' + p.join('L') + 'Z';
}
const capitalVp = Math.max(...map.boxes.map((b) => b.vp));

// ---------------------------------------------------------------- detail pass (STYLE.md §13)
// Every detail is tagged with the zoom level it appears at: "lod-mid" (mid zoom and
// closer) or "lod-near" (fully zoomed). css/style.css hides them further out.

// Contour lines from real elevation data (tools/elevation.mjs): every 50 m up to
// 500 m, then every 100 m; every 200 m is an "index" contour, drawn a little bolder.
async function contourSvg() {
  // Only in the detailed area round the front: the scenery beyond has none.
  const height = await loadElevation(join(here, 'cache/terrain'), [iSouth - 0.1, iWest - 0.1, iNorth + 0.1, iEast + 0.1]);
  const ox = Math.floor(INNER[0]); const oy = Math.floor(INNER[1]);
  const gw = Math.ceil(INNER[2]) - ox + 1; const gh = Math.ceil(INNER[3]) - oy + 1;   // one sample per map unit
  let g = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const [lon, lat] = projection.invert([x + ox, y + oy]);
      g[y * gw + x] = height(lon, lat);
    }
  }
  // Soften the data a little (two 3×3 blurs) so lines flow like a draughtsman's.
  for (let pass = 0; pass < 2; pass++) {
    const b = new Float32Array(gw * gh);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        let sum = 0; let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < gw && yy < gh) { sum += g[yy * gw + xx]; n++; }
        }
        b[y * gw + x] = sum / n;
      }
    }
    g = b;
  }
  let top = 0;
  for (const v of g) top = Math.max(top, v);
  const levels = [];
  for (let L = 50; L <= top; L += L < 500 ? 50 : 100) levels.push(L);

  const at = (x, y) => g[y * gw + x];
  const out = [];
  for (const L of levels) {
    // Marching squares: for each grid cell, which of its edges does the level cross?
    // An edge crossing is named by its edge ("h x,y" = top edge of cell x,y).
    const point = new Map(); const links = new Map();
    const cross = (key, x1, y1, x2, y2) => {
      if (!point.has(key)) {
        const a = at(x1, y1); const b = at(x2, y2); const t = (L - a) / (b - a);
        point.set(key, [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
      }
      return key;
    };
    const link = (k1, k2) => {
      if (!links.has(k1)) links.set(k1, []); if (!links.has(k2)) links.set(k2, []);
      links.get(k1).push(k2); links.get(k2).push(k1);
    };
    for (let y = 0; y < gh - 1; y++) {
      for (let x = 0; x < gw - 1; x++) {
        const tl = at(x, y) >= L; const tr = at(x + 1, y) >= L; const br = at(x + 1, y + 1) >= L; const bl = at(x, y + 1) >= L;
        const c = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
        if (c === 0 || c === 15) continue;
        const T = () => cross(`h${x},${y}`, x, y, x + 1, y);
        const R = () => cross(`v${x + 1},${y}`, x + 1, y, x + 1, y + 1);
        const B = () => cross(`h${x},${y + 1}`, x, y + 1, x + 1, y + 1);
        const Lf = () => cross(`v${x},${y}`, x, y, x, y + 1);
        switch (c) {
          case 1: case 14: link(Lf(), B()); break;
          case 2: case 13: link(B(), R()); break;
          case 3: case 12: link(Lf(), R()); break;
          case 4: case 11: link(T(), R()); break;
          case 6: case 9: link(T(), B()); break;
          case 7: case 8: link(Lf(), T()); break;
          case 5: link(Lf(), T()); link(B(), R()); break;
          case 10: link(T(), R()); link(Lf(), B()); break;
          default: break;
        }
      }
    }
    // Walk the links into lines.
    const seen = new Set();
    for (const startKey of links.keys()) {
      if (seen.has(startKey)) continue;
      // start from a loose end if there is one, so open lines come out whole
      let s0 = startKey;
      const visitedProbe = new Set([s0]);
      let prev = null;
      while (true) {
        const nb = links.get(s0).filter((k) => k !== prev && !visitedProbe.has(k));
        if (links.get(s0).length < 2 || nb.length === 0) break;
        prev = s0; s0 = nb[0]; visitedProbe.add(s0);
        if (s0 === startKey) break;
      }
      const line = []; let cur = s0; let before = null;
      while (cur && !seen.has(cur)) {
        seen.add(cur); line.push(point.get(cur));
        const next = links.get(cur).find((k) => k !== before && !seen.has(k));
        before = cur; cur = next;
      }
      if (line.length < 4 || polylineLength(line) < 18) continue;
      const smooth = simplify(chaikin(line, 2), 0.55).map(([x, y]) => [x + ox, y + oy]);
      out.push({ level: L, pts: smooth });
    }
  }
  const index = out.filter((c) => c.level % 200 === 0);
  const plain = out.filter((c) => c.level % 200 !== 0);
  return `<g ${FADE_MASK}><g id="contours" class="lod-near">` +
    `<path class="contour" d="${plain.map((c) => lineD(c.pts)).join('')}"/>` +
    `<path class="contour index" d="${index.map((c) => lineD(c.pts)).join('')}"/></g></g>`;
}

// Railways: classic black-and-white tick line.
function railwaySvg() {
  const d = extra.railways.list.map((r) => lineD(simplify(handWobble(r.points.map(P), 'rail' + r.id, 0.15), 0.08))).join('');
  return `<g id="railways" class="lod-mid"><defs><path id="line-rail" d="${d}"/></defs><use class="rail-base" href="#line-rail"/><use class="rail-ticks" href="#line-rail"/></g>`;
}
// Main roads: a thin cased (double) ink line, with names at full zoom.
function roadSvg() {
  const lines = extra.roads.list.map((r, i) => ({ name: r.name, pts: handWobble(r.points.map(P), 'road' + i, 0.15) }));
  const d = lines.map((r) => lineD(r.pts)).join('');
  const labels = lines.map((r) => {
    const i = Math.floor(r.pts.length / 2); const a = r.pts[Math.max(0, i - 2)]; const b = r.pts[Math.min(r.pts.length - 1, i + 2)];
    let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    return `<text class="road-label map-label lod-near" transform="translate(${f(r.pts[i][0])},${f(r.pts[i][1])}) rotate(${f(ang)})" dy="-1.6">${esc(r.name)}</text>`;
  });
  return `<g id="roads" class="lod-mid"><defs><path id="line-roads" d="${d}"/></defs><use class="road-case" href="#line-roads"/><use class="road-fill" href="#line-roads"/></g>` + labels.join('');
}
// Villages: a small ink circle and a name (full zoom only).
function villageSvg() {
  const outv = ['<g id="villages" class="lod-near">'];
  for (const v of extra.villages.list) {
    const [x, y] = P(v.at);
    outv.push(`<circle class="village-dot" cx="${f(x)}" cy="${f(y)}" r="0.6"/><text class="label village map-label" x="${f(x)}" y="${f(y - 1.6)}">${esc(v.name)}</text>`);
  }
  outv.push('</g>');
  return outv.join('');
}
// Landmarks: small ink symbols by kind, labelled in italic (full zoom only).
function landmarkSvg() {
  const outl = ['<g id="landmarks" class="lod-near">'];
  for (const l of extra.landmarks.list) {
    const [x, y] = P(l.at);
    let sym = '';
    if (l.kind === 'fort') sym = `<path class="lm-fort" d="${starPath(x, y, 2.6, 1.6, 5)}"/>`;
    else if (l.kind === 'hill') sym = `<path class="lm-hill" d="M${f(x)},${f(y - 1.6)}l1.5,2.6h-3z"/><text class="lm-height" x="${f(x + 2.2)}" y="${f(y + 1)}">${l.height}</text>`;
    else if (l.kind === 'wood') sym = `<g class="lm-wood"><circle cx="${f(x - 1.2)}" cy="${f(y)}" r="1.1"/><circle cx="${f(x + 1.2)}" cy="${f(y)}" r="1.1"/><circle cx="${f(x)}" cy="${f(y - 1.5)}" r="1.1"/></g>`;
    else sym = `<path class="lm-ridge" d="M${f(x - 3)},${f(y)}q3,-2.2 6,0M${f(x - 2)},${f(y - 0.6)}l-0.4,1.4M${f(x)},${f(y - 1.1)}v1.5M${f(x + 2)},${f(y - 0.6)}l0.4,1.4"/>`;
    outl.push(sym + `<text class="label landmark map-label" x="${f(x)}" y="${f(y - 3.2)}">${esc(l.name)}</text>`);
  }
  outl.push('</g>');
  return outl.join('');
}
// Battle scars: crater stipple in three densities (map.js picks one per territory).
function scarPatterns() {
  const pats = [];
  [10, 22, 40].forEach((count, i) => {
    const rnd = rngFrom('scar' + i); const parts = [];
    for (let n = 0; n < count; n++) {
      const x = rnd() * 24; const y = rnd() * 24; const r = 0.3 + rnd() * (0.6 + i * 0.25);
      parts.push(rnd() < 0.6
        ? `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="none" stroke="${C.inkFaded}" stroke-width="0.3"/>`
        : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.45)}" fill="${C.inkFaded}"/>`);
    }
    pats.push(`<pattern id="pat-scar${i + 1}" patternUnits="userSpaceOnUse" width="24" height="24">${parts.join('')}</pattern>`);
  });
  // Snow: sparse flecks for the winter wash.
  const rnd = rngFrom('snow'); const flecks = [];
  for (let n = 0; n < 14; n++) flecks.push(`<circle cx="${f(rnd() * 16)}" cy="${f(rnd() * 16)}" r="${f(0.25 + rnd() * 0.3)}" fill="${C.paperDark}"/>`);
  pats.push(`<pattern id="pat-snow" patternUnits="userSpaceOnUse" width="16" height="16">${flecks.join('')}</pattern>`);
  return pats.join('\n');
}
// A coffee ring and foxing (age spots) near the bottom-left corner.
function ageMarks() {
  const rnd = rngFrom('age'); const o = ['<g id="age-marks">'];
  const cx = 175; const cy = HEIGHT - 135; const r = 38;
  // the ring: several broken arcs of uneven weight, and a faint stain inside
  o.push(`<circle cx="${cx}" cy="${cy}" r="${r - 1}" fill="${C.ridge}" fill-opacity="0.05"/>`);
  for (let k = 0; k < 5; k++) {
    const a0 = rnd() * Math.PI * 2; const a1 = a0 + Math.PI * (0.6 + rnd() * 1.1); const rr = r + (rnd() - 0.5) * 2.2;
    const p0 = [cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr]; const p1 = [cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr];
    o.push(`<path d="M${f(p0[0])},${f(p0[1])}A${f(rr)},${f(rr)} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${f(p1[0])},${f(p1[1])}" fill="none" stroke="${C.ridge}" stroke-opacity="${f(0.12 + rnd() * 0.14)}" stroke-width="${f(0.8 + rnd() * 1.8)}" stroke-linecap="round"/>`);
  }
  // foxing: soft brown spots clustered towards the corner
  for (let n = 0; n < 34; n++) {
    const x = 10 + Math.pow(rnd(), 1.6) * 260; const y = HEIGHT - 10 - Math.pow(rnd(), 1.6) * 230;
    const rr = 0.6 + rnd() * 3.2;
    o.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(rr)}" fill="${rnd() < 0.5 ? C.ridge : C.paperDark}" fill-opacity="${f(0.1 + rnd() * 0.18)}"/>`);
  }
  o.push('</g>');
  return o.join('');
}

// The detailed area (territories, terrain, contours, roads and railways) fades out
// softly at its edge, so it blends into the scenery instead of stopping in a straight
// line. A mask: white inside, fading to black over FADE map units at the edge.
function innerFade() {
  const FADE = 36;
  const [x0, y0] = SHIFT; const x1 = x0 + INNER_WIDTH; const y1 = y0 + INNER_HEIGHT;
  const g = (id, x1g, y1g, x2g, y2g) => `<linearGradient id="${id}" x1="${x1g}" y1="${y1g}" x2="${x2g}" y2="${y2g}"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>`;
  const corner = `<radialGradient id="fade-c"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>`;
  const r = (x, y, w, h, fill) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"/>`;
  const c = (cx, cy) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${FADE}" fill="url(#fade-c)"/>`;
  return `${g('fade-l', 0, 0, 1, 0)}${g('fade-r', 1, 0, 0, 0)}${g('fade-t', 0, 0, 0, 1)}${g('fade-b', 0, 1, 0, 0)}${corner}` +
    `<mask id="inner-fade" maskUnits="userSpaceOnUse" x="0" y="0" width="${WIDTH}" height="${HEIGHT}">` +
    r(x0 + FADE, y0 + FADE, x1 - x0 - 2 * FADE, y1 - y0 - 2 * FADE, '#fff') +
    r(x0, y0 + FADE, FADE, y1 - y0 - 2 * FADE, 'url(#fade-l)') + r(x1 - FADE, y0 + FADE, FADE, y1 - y0 - 2 * FADE, 'url(#fade-r)') +
    r(x0 + FADE, y0, x1 - x0 - 2 * FADE, FADE, 'url(#fade-t)') + r(x0 + FADE, y1 - FADE, x1 - x0 - 2 * FADE, FADE, 'url(#fade-b)') +
    `<g clip-path="url(#fade-corners)">${c(x0 + FADE, y0 + FADE)}${c(x1 - FADE, y0 + FADE)}${c(x0 + FADE, y1 - FADE)}${c(x1 - FADE, y1 - FADE)}</g></mask>` +
    `<clipPath id="fade-corners">${r(x0, y0, FADE, FADE)}${r(x1 - FADE, y0, FADE, FADE)}${r(x0, y1 - FADE, FADE, FADE)}${r(x1 - FADE, y1 - FADE, FADE, FADE)}</clipPath>`;
}
const FADE_MASK = 'mask="url(#inner-fade)"';

// ---------------------------------------------------------------- write the SVG
const rivers = await riverLines();
const contours = await contourSvg();
const out = [];
out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" class="map-svg">`);
out.push('<!-- Made by tools/build-map.mjs. Do not edit by hand: change the data and re-run it. -->');
out.push('<!-- Geography: Natural Earth (public domain); elevation: Terrarium tiles (AWS Open Data, Mapzen; SRTM and others); lines hand-traced in tools/map-extra.json. Look: docs/STYLE.md. -->');
out.push(`<defs>
<style>
.sea{fill:${C.paper}}
.sea-hatch{fill:url(#pat-sea)}
.land{fill:${C.paper}}
.land.neutral{fill:${C.paperDark}}
.coast-ink{fill:none;stroke:${C.river};stroke-width:0.8;stroke-linejoin:round}
.border-ink{fill:none;stroke:${C.inkFaded};stroke-width:0.8;stroke-dasharray:5 1.6 1 1.6}
.border-1871{fill:none;stroke:${C.ink};stroke-width:1.1;stroke-dasharray:6 1.8 1.2 1.8}
.river-ink{fill:none;stroke:${C.river};stroke-width:0.9;stroke-linecap:round;stroke-linejoin:round}
.bleed{fill:none;stroke-width:2.4;stroke-opacity:.13;stroke-linecap:round;stroke-linejoin:round}
.bleed.river{stroke:${C.river}} .bleed.coast{stroke:${C.river}} .bleed.border{stroke:${C.inkFaded};stroke-width:2}
.hillshade{fill:none;stroke:${C.ridge};stroke-opacity:.16;stroke-linecap:round;stroke-linejoin:round}
.hachures{fill:none;stroke:${C.ridge};stroke-width:0.45;stroke-linecap:round;opacity:.85}
.contour{fill:none;stroke:${C.inkFaded};stroke-width:0.28;stroke-opacity:.55;stroke-linejoin:round}
.contour.index{stroke-width:0.5;stroke-opacity:.7}
.rail-base{fill:none;stroke:${C.ink};stroke-width:1.05;stroke-opacity:.85;stroke-linejoin:round}
.rail-ticks{fill:none;stroke:${C.paper};stroke-width:0.5;stroke-dasharray:2.2 2.2;stroke-linejoin:round}
.road-case{fill:none;stroke:${C.ink};stroke-width:1.25;stroke-opacity:.8;stroke-linecap:round;stroke-linejoin:round}
.road-fill{fill:none;stroke:${C.paper};stroke-width:0.6;stroke-linecap:round;stroke-linejoin:round}
.road-label{font-family:${FONT.fell};font-style:italic;font-size:4.5px;fill:${C.ink};text-anchor:middle}
.river-label{font-family:${FONT.fell};font-style:italic;font-size:7px;fill:${C.river};text-anchor:middle;letter-spacing:.06em}
.territory{fill:transparent;stroke:none}
.edge{fill:none;stroke:${C.ink};stroke-width:0.45;stroke-dasharray:2.2 1.4;stroke-opacity:.75;pointer-events:none}
.country-label{font-family:${FONT.place};font-size:15px;letter-spacing:.32em;fill:${C.inkFaded};text-anchor:middle}
.country-label.small{font-size:9px;letter-spacing:.24em}
.sea-label{font-family:${FONT.fell};font-style:italic;font-size:14px;letter-spacing:.3em;fill:${C.river};text-anchor:middle}
.sym{fill:none;stroke:${C.ink};stroke-width:0.7;stroke-linecap:round}
.sym-fill{fill:${C.ink}}
.fort{fill:${C.paper};stroke:${C.ink};stroke-width:0.8}
.capital{fill:${C.ink};stroke:${C.paper};stroke-width:0.5}
.town-dot{fill:${C.ink}}
.town-dot.other{fill:${C.inkFaded}}
.village-dot{fill:none;stroke:${C.ink};stroke-width:0.35}
.lm-fort{fill:none;stroke:${C.ink};stroke-width:0.45}
.lm-hill{fill:${C.ink}}
.lm-height{font-family:${FONT.fell};font-style:italic;font-size:3.6px;fill:${C.ink}}
.lm-wood circle{fill:${C.forest};fill-opacity:.8}
.lm-ridge{fill:none;stroke:${C.ridge};stroke-width:0.5;stroke-linecap:round}
.map-label{pointer-events:none;paint-order:stroke;stroke:${C.paper};stroke-width:2.2px;stroke-linejoin:round;stroke-opacity:.85}
.label{font-family:${FONT.place};fill:${C.ink};text-anchor:middle;letter-spacing:.08em}
.label.city{font-size:10px}
.label.town{font-size:6.5px}
.label.town.other{fill:${C.inkFaded}}
.label.village{font-size:4.2px;letter-spacing:.04em}
.label.landmark{font-family:${FONT.fell};font-style:italic;font-size:4.6px;letter-spacing:.02em}
.vp-ring{fill:${C.paper};stroke:${C.ink};stroke-width:0.6}
.vp-text{font-family:${FONT.fell};font-size:5px;fill:${C.ink};text-anchor:middle;pointer-events:none}
.cartouche-small{font-family:${FONT.place};font-size:9px;letter-spacing:.3em;fill:${C.ink};text-anchor:middle}
.cartouche-title{font-family:${FONT.place};font-size:20px;letter-spacing:.2em;fill:${C.ink};text-anchor:middle}
.cartouche-date{font-family:${FONT.fell};font-style:italic;font-size:9.5px;fill:${C.ink};text-anchor:middle}
.compass-n{font-family:${FONT.place};font-size:9px;fill:${C.ink};text-anchor:middle}
.scale-text{font-family:${FONT.fell};font-size:6px;fill:${C.ink};text-anchor:middle}
.mud-wash,.season-snow,.season-spring{opacity:0;transition:opacity .6s}
.map-svg.autumn .mud-wash,.map-svg.winter .season-snow,.map-svg.spring .season-spring{opacity:1}
</style>
<linearGradient id="fold-v" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${C.paperDark}" stop-opacity="0"/><stop offset=".48" stop-color="${C.paperDark}" stop-opacity=".6"/><stop offset=".5" stop-color="${C.telegram}" stop-opacity=".75"/><stop offset="1" stop-color="${C.telegram}" stop-opacity="0"/></linearGradient>
<linearGradient id="fold-h" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${C.paperDark}" stop-opacity="0"/><stop offset=".48" stop-color="${C.paperDark}" stop-opacity=".55"/><stop offset=".5" stop-color="${C.telegram}" stop-opacity=".65"/><stop offset="1" stop-color="${C.telegram}" stop-opacity="0"/></linearGradient>
<radialGradient id="vignette" cx=".5" cy=".5" r=".72"><stop offset=".62" stop-color="${C.leather}" stop-opacity="0"/><stop offset="1" stop-color="${C.leather}" stop-opacity=".42"/></radialGradient>
<pattern id="pat-paper" patternUnits="userSpaceOnUse" width="96" height="96"><image href="${paperGrainPng(160)}" width="96" height="96"/></pattern>
${patternDefs()}
${scarPatterns()}
<clipPath id="map-frame"><rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}"/></clipPath>
${innerFade()}
</defs>`);
// Everything is drawn on one sheet of paper: nothing spills past its edge.
out.push('<g id="sheet" clip-path="url(#map-frame)">');

// The sheet of paper: sea hatch, then the land.
out.push(`<rect class="sea" x="0" y="0" width="${WIDTH}" height="${HEIGHT}"/>`);
out.push(`<rect class="sea-hatch" x="0" y="0" width="${WIDTH}" height="${HEIGHT}"/>`);
out.push('<g id="countries">');
for (const [k, shape] of Object.entries(countryShapes)) {
  const cls = (k === 'nld' || k === 'che') ? 'land neutral' : 'land';
  out.push(`<path class="${cls}" data-country="${k}" d="${multiD(shape)}"/>`);
}
out.push('</g>');

// Each territory's outline, stored once and reused below with <use>.
out.push('<defs id="shapes">');
for (const box of map.boxes) out.push(`<path id="shape-${box.id}" d="${polyD(shapes[box.id])}"/>`);
// Each territory as a clip, so map.js can paint an owner-coloured band just inside
// its border (the coloured region edges of a campaign map).
for (const box of map.boxes) out.push(`<clipPath id="clip-${box.id}"><use href="#shape-${box.id}"/></clipPath>`);
out.push('</defs>');

// Terrain (static): ground tones, then textures. Mud only shows in autumn (map.js
// adds the "autumn" class in September–November).
out.push(`<g id="terrain" ${FADE_MASK}>`);
for (const box of map.boxes) {
  const g = groundFor(box);
  if (g) out.push(`<use class="ground" href="#shape-${box.id}" fill="${g.ground}" fill-opacity="${g.groundOpacity ?? 1}"/>`);
  for (const id of box.terrain) {
    const t = terrainType(id);
    if (!t.draw.texture) continue;
    const cls = t.draw.season === 'autumn' ? 'texture mud-wash' : 'texture';
    out.push(`<use class="${cls}" href="#shape-${box.id}" fill="url(#pat-${id})"/>`);
  }
}
out.push('</g>');
// Seasons (map.js sets "winter" Dec–Feb and "spring" Mar–May).
out.push(`<g class="season-snow"><rect width="${WIDTH}" height="${HEIGHT}" fill="${C.telegram}" fill-opacity="0.32"/><rect width="${WIDTH}" height="${HEIGHT}" fill="url(#pat-snow)"/></g>`);
out.push(`<rect class="season-spring" width="${WIDTH}" height="${HEIGHT}" fill="${C.forest}" fill-opacity="0.07"/>`);
// Battle scars and owner-coloured region edges go here (map.js).
out.push(`<g id="scars" ${FADE_MASK}></g><g id="region-edges" ${FADE_MASK}></g>`);

// Relief: contours (full zoom), then ridge shading and hachures.
out.push(contours);
out.push(`<g id="relief" ${FADE_MASK}>`, reliefSvg(), '</g>');

// Water and borders, hand-wobbled, each with a faint ink bleed underneath.
const wobbled = (pts, key) => simplify(handWobble(thin(pts, 0.6), key, 0.22), 0.12);
const coastD = coastLines.map((l, i) => lineD(wobbled(l, 'coast' + i))).join('');
const riverD = rivers.map((r, i) => lineD(wobbled(r.pts, 'river' + i))).join('');
const borderD = borderLines.map((l, i) => lineD(wobbled(l, 'border' + i))).join('');
// Each line is stored once (in <defs>) and drawn twice with <use>: bleed, then ink.
out.push(`<defs><path id="line-coast" d="${coastD}"/><path id="line-rivers" d="${riverD}"/><path id="line-borders" d="${borderD}"/></defs>`);
out.push('<use class="bleed coast" href="#line-coast"/><use class="coast-ink" href="#line-coast"/>');
out.push('<g id="rivers"><use class="bleed river" href="#line-rivers"/><use class="river-ink" href="#line-rivers"/></g>');
out.push('<use class="bleed border" href="#line-borders"/><use class="border-ink" href="#line-borders"/>');
out.push(`<path class="border-1871" d="${lineD(handWobble(extra.border1871.points.map(P), '1871', 0.3))}"/>`);
// Roads and railways (mid zoom and closer).
out.push(`<g ${FADE_MASK}>`, roadSvg(), railwaySvg(), '</g>');

// Territories: the tap targets. map.js tints them by owner (30%, STYLE.md §4.5).
// data-x / data-y is the anchor town, used for arrows and pencil notes.
out.push(`<g id="territories" ${FADE_MASK}>`);
for (const box of map.boxes) {
  const [ax, ay] = P([box.anchor.lat, box.anchor.lon]);
  out.push(`<use ${attrs({ id: box.id, class: 'territory', 'data-box': box.id, 'data-x': f(ax), 'data-y': f(ay), href: '#shape-' + box.id })}/>`);
}
out.push('</g>');

// Shared borders between neighbours (thin dashed ink). map.js draws the front line
// along the ones between enemies.
out.push('<g id="edges">');
for (const key of [...wanted].sort()) {
  const [a, b] = key.split('|');
  const lines = chain(shared.get(key));
  const d = lines.map(lineD).join('');
  // Which box lies on the LEFT of the line as drawn? (map.js uses it to draw trench
  // zigzags on the inside of a box.) Test a point just left of the longest segment.
  let best = null;
  for (const line of lines) for (let i = 1; i < line.length; i++) {
    if (!best || dist(line[i - 1], line[i]) > dist(best[0], best[1])) best = [line[i - 1], line[i]];
  }
  const u = mul(sub(best[1], best[0]), 1 / dist(best[0], best[1]));
  const probe = add(avg(best), mul([u[1], -u[0]], 0.3));
  const left = pointInPolygon(probe, shapes[a]) ? a : b;
  out.push(`<path ${attrs({ class: 'edge', 'data-a': a, 'data-b': b, 'data-left': left, d })}/>`);
}
out.push('</g>');
// map.js fills these: trenches, the front line, plans, the selection, pencil notes.
out.push('<g id="trenches"></g><g id="front"></g><g id="plans"></g><g id="selection"></g>');

// Villages and landmarks (full zoom).
out.push(villageSvg());
out.push(landmarkSvg());

// Names of seas, countries and rivers (river names from mid zoom).
out.push('<g id="place-names">');
for (const l of extra.placeNames.list) {
  const [x, y] = P(l.at);
  out.push(`<text class="${l.cls}" x="${f(x)}" y="${f(y)}">${esc(l.text)}</text>`);
}
out.push(...riverLabels(rivers).map((t) => t.replace('class="river-label map-label"', 'class="river-label map-label lod-mid"')));
out.push('</g>');

// Towns: symbols and names. Named boxes get a VP number in a small circle (mid zoom).
out.push('<g id="towns">');
for (const t of extra.otherTowns.list) {
  const [x, y] = P(t.at);
  out.push(`<circle class="town-dot other lod-mid" cx="${f(x)}" cy="${f(y)}" r="0.9"/>`);
  out.push(`<text class="label town other map-label lod-mid" x="${f(x)}" y="${f(y - 2.4)}">${esc(t.name)}</text>`);
}
for (const t of (extra.sceneryTowns?.list || [])) {
  const [x, y] = P(t.at);
  if (x < 4 || y < 4 || x > WIDTH - 4 || y > HEIGHT - 4) continue;
  out.push(`<circle class="town-dot other" cx="${f(x)}" cy="${f(y)}" r="1.1"/>`);
  out.push(`<text class="label town other scenery map-label" x="${f(x)}" y="${f(y - 2.6)}">${esc(t.name)}</text>`);
}
for (const box of map.boxes) {
  const [x, y] = P([box.anchor.lat, box.anchor.lon]);
  if (box.name) {
    if (box.terrain.includes('fortress')) out.push(`<path class="fort" d="${starPath(x, y, 4.2, 2.6, 8)}"/>`);
    else if (box.vp === capitalVp) out.push(`<path class="capital" d="${starPath(x, y, 6, 2.6, 5)}"/>`);
    else out.push(churchSymbol(x, y));
    const name = box.short && box.name.length > 14 ? box.short : box.name;
    out.push(`<g class="city-label" data-box="${box.id}" transform="translate(${f(x)},${f(y)})">` +
      `<text class="label city map-label" y="-7">${esc(name)}</text>` +
      `<circle class="vp-ring lod-mid" cx="0" cy="8.5" r="3.4"/><text class="vp-text lod-mid" y="10.2">${box.vp}</text></g>`);
  } else {
    out.push(`<circle class="town-dot" cx="${f(x)}" cy="${f(y)}" r="1"/>`);
    out.push(`<text class="label town map-label lod-mid" data-box="${box.id}" x="${f(x)}" y="${f(y - 2.6)}">${esc(box.anchor.town)}</text>`);
  }
}
out.push('</g>');
// Pencil notes from the staff officer (map.js).
out.push('<g id="notes"></g>');

// Furniture and the paper itself, on top: grain, age marks, fold creases, vignette.
out.push(compassRose(46, HEIGHT - 70, 24));
out.push(scaleBar(86, HEIGHT - 30));
out.push(cartouche());
out.push(`<rect class="paper-grain" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#pat-paper)"/>`);
out.push(ageMarks());
out.push(`<rect class="fold" x="${WIDTH / 2 - 7}" y="0" width="14" height="${HEIGHT}" fill="url(#fold-v)"/>`);
out.push(`<rect class="fold" x="0" y="${HEIGHT / 2 - 7}" width="${WIDTH}" height="14" fill="url(#fold-h)"/>`);
out.push(`<rect class="vignette" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#vignette)"/>`);
out.push('</g>');
out.push('</svg>');

mkdirSync(join(root, 'img'), { recursive: true });
const svgText = out.join('\n') + '\n';
writeFileSync(join(root, 'img/map-west.svg'), svgText);
console.log(`Wrote img/map-west.svg (${WIDTH}×${HEIGHT}, ${(svgText.length / 1024).toFixed(0)} KB). ` +
  `${map.boxes.length} territories, ${wanted.size} borders, all checks passed.`);
