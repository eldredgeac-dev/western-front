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
import { feature } from 'topojson-client';
import polygonClipping from 'polygon-clipping';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const map = readJson(join(root, 'data/boxes-west.json'));
const terrainData = readJson(join(root, 'data/terrain.json'));
const extra = readJson(join(here, 'map-extra.json'));
const countries = readJson(join(here, 'node_modules/world-atlas/countries-10m.json'));

// ---------------------------------------------------------------- settings
const WIDTH = 1000;                 // SVG width in map units; height follows the shape
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
const [south, west, north, east] = extra.frame.bounds;
// The four corners plus edge middles (curved edges bulge on a conic projection).
const frameGeo = {
  type: 'MultiPoint',
  coordinates: [[west, south], [east, south], [east, north], [west, north],
    [(west + east) / 2, south], [(west + east) / 2, north]],
};
const projection = geoConicConformal()
  .parallels([48, 50.5]).rotate([-4.9, 0]).center([0, 49.4])
  .fitWidth(WIDTH, frameGeo);
// [lat, lon] (how our data files write points) → [x, y] on the map
const P = ([lat, lon]) => projection([lon, lat]);
// Height = the projected frame's bottom edge.
const frameRing = [];
for (let i = 0; i <= 40; i++) frameRing.push(P([south, west + (east - west) * i / 40]));
for (let i = 0; i <= 40; i++) frameRing.push(P([south + (north - south) * i / 40, east]));
for (let i = 0; i <= 40; i++) frameRing.push(P([north, east - (east - west) * i / 40]));
for (let i = 0; i <= 40; i++) frameRing.push(P([north - (north - south) * i / 40, west]));
const HEIGHT = Math.ceil(Math.max(...frameRing.map((p) => p[1])));
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
      if (x >= 0 && y >= 0 && x < GW && y < GH) seedS[y * GW + x] = i + t;
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
  const nx = Math.ceil(WIDTH / wavelength) + 2; const ny = Math.ceil(HEIGHT / wavelength) + 2;
  const g = Array.from({ length: nx * ny }, () => rnd() * 2 - 1);
  const ease = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / wavelength; const fy = y / wavelength;
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
const outerNoise = [noise2d('outer1', 60), noise2d('outer2', 20)];
function classify(s, d, side, x, y) {
  if (d > 6) s -= tiltAt(s, side) * (d - 6);
  const k = laneOf(s);
  if (k < 0) return -1;
  // Column lines on this side, nearest the front first: 2,1,0 (Entente) or 4,5,6 (German).
  const lines = side > 0 ? [2, 1, 0] : [4, 5, 6];
  const columns = side > 0 ? [2, 1, 0] : [3, 4, 5];
  for (let n = 0; n < 2; n++) if (d < depthAt(lines[n], s)) return k * NC + columns[n];
  const rag = 1 + 0.18 * outerNoise[0](x, y) + 0.06 * outerNoise[1](x, y);
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
    const gx = Math.max(0, Math.min(GW - 1, Math.floor(qx / RES)));
    const gy = Math.max(0, Math.min(GH - 1, Math.floor(qy / RES)));
    const j = gy * GW + gx;
    label[i] = classify(nearS[j], nearD[j], sideOf([qx, qy], exact.nearS[j]), px, py);
  }
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

// Join each box's borders into one outline.
const rings = {};
const ringProblems = [];
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
  if (ringSelfCrosses(ring)) ringProblems.push(`${box.id}'s outline crosses itself`);
  rings[box.id] = ring;
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

// ---------------------------------------------------------------- terrain textures
// One <pattern> per texture name used in terrain.json. Drawn in map units.
const TEXTURES = {
  water: (c) => `<path d="M0,4 q2,-2 4,0 t4,0 M4,10 q2,-2 4,0 t4,0" fill="none" stroke="${c}" stroke-width="0.9" stroke-linecap="round"/>`,
  hachure: (c) => `<path d="M-1,1 l2,-2 M0,8 l8,-8 M7,9 l2,-2" stroke="${c}" stroke-width="0.9" opacity="0.7"/>`,
  dabs: (c) => `<path d="M1.5,2.5 h2.5 M6,6.5 h2.5 M2,10 h2" stroke="${c}" stroke-width="1" stroke-linecap="round" opacity="0.55"/>`,
  stipple: (c) => `<circle cx="2" cy="2" r="0.55" fill="${c}"/><circle cx="7" cy="5" r="0.5" fill="${c}"/><circle cx="4" cy="9" r="0.55" fill="${c}"/><circle cx="10" cy="10" r="0.45" fill="${c}"/>`,
  grass: (c) => `<path d="M3,8 l1,-2 l1,2 M9,3 l1,-2 l1,2" fill="none" stroke="${c}" stroke-width="0.7" stroke-linejoin="round" opacity="0.8"/>`,
  trees: (c) => `<g fill="${c}" opacity="0.55"><circle cx="3" cy="3.5" r="2"/><circle cx="9" cy="9" r="2.2"/><rect x="2.6" y="5" width="0.8" height="1.6"/><rect x="8.6" y="10.8" width="0.8" height="1.6"/></g>`,
  peaks: (c) => `<path d="M1,6 l3,-4 l3,4 M6,11 l3,-4 l3,4" fill="none" stroke="${c}" stroke-width="0.8" stroke-linejoin="round" opacity="0.6"/>`,
};
const TEX_SIZE = { water: 12, hachure: 8, dabs: 12, stipple: 12, grass: 12, trees: 12, peaks: 12 };
function patternDefs() {
  const out = [];
  for (const t of terrainData.types) {
    const tex = t.draw.texture;
    if (!tex) continue;
    if (!TEXTURES[tex]) throw new Error(`terrain.json: unknown texture "${tex}" for ${t.id}`);
    const s = TEX_SIZE[tex];
    out.push(`<pattern id="pat-${t.id}" patternUnits="userSpaceOnUse" width="${s}" height="${s}">${TEXTURES[tex](t.draw.color)}</pattern>`);
  }
  return out.join('\n');
}
const terrainType = (id) => terrainData.types.find((t) => t.id === id);
function groundFor(box) {
  let best = null;
  for (const id of box.terrain) {
    const t = terrainType(id);
    if (t.draw.ground && (!best || t.draw.priority > best.draw.priority)) best = t;
  }
  return best ? best.draw.ground : terrainData.plainGround;
}

// ---------------------------------------------------------------- rivers
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
    out.push(`<text class="river-label" transform="translate(${f(at[0])},${f(at[1])}) rotate(${f(ang)})" dy="-2.5">${esc(name)}</text>`);
  }
  return out;
}

// ---------------------------------------------------------------- write the SVG
const rivers = await riverLines();
const out = [];
out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" class="map-svg">`);
out.push('<!-- Made by tools/build-map.mjs. Do not edit by hand: change the data and re-run it. -->');
out.push('<!-- Geography: Natural Earth (public domain), plus lines hand-traced in tools/map-extra.json. -->');
out.push(`<defs>
<style>
.sea{fill:#a9c0c4}
.land{fill:#d9cfb1;stroke:#8f8366;stroke-width:0.7}
.land.neutral{fill:#cfc9b5}
.land.england{fill:#d4ccb0}
.ground{stroke:none}
.texture{pointer-events:none}
.river{fill:none;stroke:#4d7d9a;stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round}
.river-label{font:italic 7.5px Georgia,serif;fill:#2e5d7a;text-anchor:middle;paint-order:stroke;stroke:#e9e2cc;stroke-width:2px;stroke-opacity:.7}
.border-1871{fill:none;stroke:#6e1e14;stroke-width:1.6;stroke-dasharray:5 2 1.5 2;opacity:.85}
.territory{fill:transparent;stroke:none}
.edge{fill:none;stroke:#3b3426;stroke-width:0.7;stroke-opacity:.55;stroke-linejoin:round;pointer-events:none}
.country-label{font:600 13px Georgia,serif;letter-spacing:3px;fill:#6b604a;text-anchor:middle;opacity:.75}
.country-label.small{font-size:9px;letter-spacing:2px}
.sea-label{font:italic 13px Georgia,serif;letter-spacing:3px;fill:#557280;text-anchor:middle}
.city-icon{fill:#2a2418;stroke:#f4ecd4;stroke-width:1}
.fort-icon{fill:#f2e6c4;stroke:#2a2418;stroke-width:1}
.town-dot{fill:#2a2418}
.label{font-family:Georgia,serif;fill:#1d1910;paint-order:stroke;stroke:#f4ecd4;stroke-width:2.6px;stroke-linejoin:round;text-anchor:middle;pointer-events:none}
.label.city{font-size:10.5px;font-weight:bold}
.label.vp{font-size:7.5px;font-weight:normal;fill:#6e1e14}
.label.town{font-size:6.5px}
.label.town.other{font-style:italic;fill:#4a4232}
.town-dot.other{fill:#4a4232}
</style>
${patternDefs()}
</defs>`);

// Sea, then every country.
out.push(`<rect class="sea" x="0" y="0" width="${WIDTH}" height="${HEIGHT}"/>`);
out.push('<g id="countries">');
for (const [k, shape] of Object.entries(countryShapes)) {
  const cls = k === 'gbr' ? 'land england' : (k === 'nld' || k === 'che') ? 'land neutral' : 'land';
  out.push(`<path class="${cls}" data-country="${k}" d="${multiD(shape)}"/>`);
}
out.push('</g>');

// Each territory's outline, stored once and reused below with <use>.
out.push('<defs id="shapes">');
for (const box of map.boxes) out.push(`<path id="shape-${box.id}" d="${polyD(shapes[box.id])}"/>`);
out.push('</defs>');

// Each territory's ground colour and terrain textures (static).
out.push('<g id="terrain">');
for (const box of map.boxes) {
  out.push(`<use class="ground" href="#shape-${box.id}" fill="${groundFor(box)}"/>`);
  for (const id of box.terrain) {
    if (terrainType(id).draw.texture) out.push(`<use class="texture" href="#shape-${box.id}" fill="url(#pat-${id})"/>`);
  }
}
out.push('</g>');

// Rivers.
out.push('<g id="rivers">');
for (const r of rivers) out.push(`<path class="river" data-river="${esc(r.name)}" d="${lineD(thin(r.pts, 0.8))}"/>`);
out.push(...riverLabels(rivers));
out.push('</g>');

// Territories: the tap targets. map.js tints them by owner.
out.push('<g id="territories">');
for (const box of map.boxes) {
  out.push(`<use ${attrs({ id: box.id, class: 'territory', 'data-box': box.id, href: '#shape-' + box.id })}/>`);
}
out.push('</g>');

// Shared borders between neighbours. map.js makes the ones between enemies the front line.
out.push('<g id="edges">');
for (const key of [...wanted].sort()) {
  const [a, b] = key.split('|');
  const d = chain(shared.get(key)).map(lineD).join('');
  out.push(`<path ${attrs({ class: 'edge', 'data-a': a, 'data-b': b, d })}/>`);
}
out.push('</g>');

// The 1871–1918 Franco-German frontier.
out.push(`<path class="border-1871" d="${lineD(extra.border1871.points.map(P))}"/>`);

// Country and sea names.
out.push('<g id="place-names">');
for (const l of extra.placeNames.list) {
  const [x, y] = P(l.at);
  out.push(`<text class="${l.cls}" x="${f(x)}" y="${f(y)}">${esc(l.text)}</text>`);
}
out.push('</g>');

// Towns: city icons for named (victory point) boxes, a dot for every other anchor.
out.push('<g id="towns">');
for (const box of map.boxes) {
  const [x, y] = P([box.anchor.lat, box.anchor.lon]);
  const fortress = box.terrain.includes('fortress');
  if (box.name) {
    const r = 2.2 + Math.sqrt(box.vp) * 0.7;
    if (fortress) {
      out.push(`<path class="fort-icon" d="M${f(x)},${f(y - r - 1)} l${f(r + 1)},${f(r * 0.75)} l${f(-r * 0.4)},${f(r * 1.25)} h${f(-r * 1.2)} l${f(-r * 0.4)},${f(-r * 1.25)} Z"/>`);
    } else {
      out.push(`<rect class="city-icon" x="${f(x - r)}" y="${f(y - r)}" width="${f(2 * r)}" height="${f(2 * r)}" transform="rotate(45 ${f(x)} ${f(y)})"/>`);
    }
    out.push(`<text class="label city" data-box="${box.id}" x="${f(x)}" y="${f(y - r - 3.5)}">${esc(box.short && box.name.length > 14 ? box.short : box.name)}</text>`);
    out.push(`<text class="label vp" x="${f(x)}" y="${f(y + r + 8)}">${box.vp} VP</text>`);
  } else {
    out.push(`<circle class="town-dot" cx="${f(x)}" cy="${f(y)}" r="1.2"/>`);
    out.push(`<text class="label town" data-box="${box.id}" x="${f(x)}" y="${f(y - 3)}">${esc(box.anchor.town)}</text>`);
  }
}
// Other towns, just for orientation (not part of the game).
for (const t of extra.otherTowns.list) {
  const [x, y] = P(t.at);
  out.push(`<circle class="town-dot other" cx="${f(x)}" cy="${f(y)}" r="1"/>`);
  out.push(`<text class="label town other" x="${f(x)}" y="${f(y - 2.6)}">${esc(t.name)}</text>`);
}
out.push('</g>');
out.push('</svg>');

mkdirSync(join(root, 'img'), { recursive: true });
const svgText = out.join('\n') + '\n';
writeFileSync(join(root, 'img/map-west.svg'), svgText);
console.log(`Wrote img/map-west.svg (${WIDTH}×${HEIGHT}, ${(svgText.length / 1024).toFixed(0)} KB). ` +
  `${map.boxes.length} territories, ${wanted.size} borders, all checks passed.`);
