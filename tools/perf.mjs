// perf.mjs — measures how quick the game feels on a phone (docs/PERFORMANCE.md).
//
// It opens the game in a headless Chromium the size of an iPhone, slows the CPU
// down 4× (Chrome DevTools' "4× slowdown", roughly a mid-range phone), and times:
//   1. load    — page start → title screen ready, and BEGIN → map drawn and playable
//   2. pan/zoom — frames per second while a finger drags and pinches the map
//   3. tap     — finger down on a territory → its outline drawn
//   4. commit  — COMMIT ORDERS → playback starts (the rules engine and the computer's
//                turn), then the whole playback with its frame rate
//   5. ai      — the computer's turn alone (js/engine/turn.js endPhase), in the page
//
// Dev tool only (the game never loads it). Run, with the game served on port 8123:
//   python3 -m http.server 8123 &
//   node tools/perf.mjs            (add "map" to measure the campaign map view only)
// Playwright comes pre-installed in the cloud session; elsewhere: npm i -g playwright.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const URL = process.env.WF_URL || 'http://localhost:8123/index.html';
const THROTTLE = Number(process.env.WF_THROTTLE || 4);
const ROUNDS = Number(process.env.WF_ROUNDS || 3);
const views = process.argv.slice(2).length ? process.argv.slice(2) : ['board', 'map'];

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const r0 = (x) => Math.round(x);

// Code run inside the page before anything else: a fixed seed (Date.now), and a
// frame recorder (every requestAnimationFrame time stamp) we can start and stop.
const INIT = `
  (() => {
    Date.now = () => 1700000000000;     // the new game's seed comes from the clock
    window.__frames = null;
    const tick = (t) => { if (window.__frames) window.__frames.push(t); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    window.__startFrames = () => { window.__frames = []; };
    window.__stopFrames = () => { const f = window.__frames || []; window.__frames = null; return f; };
  })();
`;

// Frame stats from rAF time stamps: average fps, and the share of frames slower than 50 ms.
function frameStats(f) {
  if (f.length < 2) return { fps: 0, worst: 0, janky: 1 };
  const gaps = f.slice(1).map((t, i) => t - f[i]);
  const secs = (f[f.length - 1] - f[0]) / 1000;
  return { fps: (f.length - 1) / secs, worst: Math.max(...gaps), janky: gaps.filter((g) => g > 50).length / gaps.length };
}

async function newPage(browser, view) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  });
  await context.addInitScript(INIT);
  await context.addInitScript(`try { localStorage.setItem('western-front-settings', JSON.stringify({ view: '${view}' })); } catch (e) {}`);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  return { context, page, cdp };
}

// 1. Load: navigation start → title ready (the New Campaign button enabled and the
// data loaded), then BEGIN → the map drawn (the frame after the game screen shows).
async function measureLoad(page) {
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'commit' });
  await page.waitForFunction(() => !document.getElementById('btn-new-game').disabled &&
    document.getElementById('version-note').textContent.length > 0, null, { timeout: 60000 });
  const title = await page.evaluate(() => performance.now());
  await page.click('#btn-new-game');
  // time from BEGIN to the first frame with the map on screen, measured in the page
  const begin = await page.evaluate(() => new Promise((resolve) => {
    const t = performance.now();
    document.getElementById('btn-begin').click();
    // the click runs startGame synchronously (or nearly): wait for a painted frame
    const wait = () => {
      if (!document.getElementById('game-screen').hidden && document.querySelector('#units .unit-spot')) {
        requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - t), 0));
      } else setTimeout(wait, 5);
    };
    wait();
  }));
  // close anything that pops up over the map at the start (telegram, budget), and let
  // the opening playback (the computer's first moves) finish before measuring more
  await settle(page);
  return { wall: Date.now() - t0, title, begin, total: title + begin };
}

async function settle(page) {
  for (let i = 0; i < 3; i++) {
    await page.waitForFunction(() => !document.getElementById('game-screen').classList.contains('playing-back'), null, { timeout: 120000 });
    await dismissPopups(page);
    await page.waitForTimeout(300);
  }
}

async function dismissPopups(page) {
  for (let i = 0; i < 8; i++) {
    const did = await page.evaluate(() => {
      const visible = (el) => el && !el.hidden && el.offsetParent !== null;
      const tg = document.getElementById('telegram');
      if (visible(tg)) { const b = tg.querySelector('button'); if (b) { b.click(); return true; } }
      const bud = document.getElementById('budget');
      if (visible(bud)) { const b = [...bud.querySelectorAll('button')].find((x) => /sign/i.test(x.textContent)); if (b) { b.click(); return true; } }
      return false;
    });
    if (!did) return;
    await page.waitForTimeout(400);
  }
}

// The middle of the map area on screen.
async function mapCentre(page) {
  return page.evaluate(() => { const r = document.getElementById('map-area').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
}

// 2. Pan: one finger drags across the map and back (60 moves, as fast as the page takes them).
async function measurePan(page, cdp) {
  const [cx, cy] = await mapCentre(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
  await page.evaluate(() => window.__startFrames());
  const steps = 90;
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + Math.sin(a) * 120, y: cy + Math.sin(a * 2) * 60, id: 1 }] });
    await new Promise((r) => setTimeout(r, 16));             // a finger reports ~60 times a second
  }
  await page.waitForTimeout(50);
  const f = await page.evaluate(() => window.__stopFrames());
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(800);                            // let any glide finish
  return frameStats(f);
}

// 2b. Pinch: two fingers spread apart and back together.
async function measurePinch(page, cdp) {
  const [cx, cy] = await mapCentre(page);
  const pts = (d) => [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(40) });
  await page.evaluate(() => window.__startFrames());
  const steps = 90;
  for (let i = 1; i <= steps; i++) {
    const d = 40 + Math.sin((i / steps) * Math.PI) * 110;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d) });
    await new Promise((r) => setTimeout(r, 16));
  }
  await page.waitForTimeout(50);
  const f = await page.evaluate(() => window.__stopFrames());
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  return frameStats(f);
}

// 3. Tap: finger down on a territory → the frame that shows its outline. Measured in the
// page from the pointerdown's time stamp to the next frame after the outline appears.
async function measureTap(page, cdp) {
  // a territory near the middle of the screen that a tap can reach
  const spot = await page.evaluate(() => {
    const holder = [...document.querySelectorAll('.view-holder')].find((h) => !h.classList.contains('inactive'));
    const area = document.getElementById('map-area').getBoundingClientRect();
    for (const t of holder.querySelectorAll('.territory')) {
      const r = t.getBoundingClientRect();
      const x = r.left + r.width / 2; const y = r.top + r.height / 2;
      if (x < area.left + 40 || x > area.right - 40 || y < area.top + 120 || y > area.bottom - 120) continue;
      const hit = document.elementFromPoint(x, y);
      if (hit && hit.closest('[data-box]') && hit.closest('.view-holder') === holder) return { x, y, box: t.dataset.box };
    }
    return null;
  });
  if (!spot) return null;
  await page.evaluate(() => {
    window.__tap = null;
    document.addEventListener('pointerdown', (e) => { window.__tap = { down: e.timeStamp }; }, { capture: true, once: true });
    const sels = [...document.querySelectorAll('#selection')];
    const mo = new MutationObserver(() => {
      if (!window.__tap || window.__tap.drawn) return;
      const t = performance.now();
      window.__tap.changed = t;
      requestAnimationFrame(() => { window.__tap.drawn = performance.now(); mo.disconnect(); });
    });
    for (const s of sels) mo.observe(s, { childList: true, attributes: true, subtree: true });
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: spot.x, y: spot.y, id: 1 }] });
  await page.waitForTimeout(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => window.__tap && window.__tap.drawn, null, { timeout: 10000 });
  const t = await page.evaluate(() => window.__tap);
  // close the sheet again so the next measurement sees the map
  await page.evaluate(() => { const s = document.getElementById('panel-sheet'); if (s.classList.contains('open')) document.getElementById('sheet-handle').click(); });
  await page.waitForTimeout(400);
  return { feedback: t.drawn - t.down };
}

// 4. Commit: COMMIT ORDERS → playback begins (the rules and the computer's turn), and
// the playback from start to finish, with its frame rate.
async function measureCommit(page) {
  const out = await page.evaluate(() => new Promise((resolve) => {
    const gs = document.getElementById('game-screen');
    const t = performance.now();
    let started = null;
    window.__startFrames();
    const mo = new MutationObserver(() => {
      if (started === null && gs.classList.contains('playing-back')) started = performance.now();
      if (started !== null && !gs.classList.contains('playing-back')) {
        mo.disconnect();
        const f = window.__stopFrames();
        resolve({ compute: started - t, playback: performance.now() - started, frames: f });
      }
    });
    mo.observe(gs, { attributes: true, attributeFilter: ['class'] });
    document.getElementById('btn-end-phase').click();
  }));
  const fs = frameStats(out.frames);
  await settle(page);
  return { compute: out.compute, playback: out.playback, fps: fs.fps, worst: fs.worst };
}

// 5. The computer's turn alone: the engine's endPhase on the saved game, in the page.
async function measureAi(page) {
  return page.evaluate(async () => {
    const v = (await import('./js/version.js')).VERSION;
    const turn = await import(`./js/engine/turn.js`);
    const storage = await import('./js/storage.js');
    const raw = localStorage.getItem([...Array(localStorage.length).keys()].map((i) => localStorage.key(i)).find((k) => /save/.test(k)));
    const files = ['boxes-west', 'terrain', 'nations', 'unit-types', 'phases', 'combat-table', 'victory', 'events', 'ai', 'commanders', 'economy'];
    const got = await Promise.all(files.map((f) => fetch(`./data/${f}.json?v=${v}`).then((r) => r.json())));
    const [map, terrain, nations, unitTypes, phases, combat, victory, events, ai, commanders, economy] = got;
    const engine = { map, terrain, nations, unitTypes, phases, combat, victory, events, ai, commanders, economy };
    const saved = JSON.parse(raw);
    const state = saved.state || saved;
    if (state.pendingBudget || state.pendingChoice) return { ms: null, why: 'waiting for a budget or choice' };
    const orders = await import('./js/engine/orders.js');
    // exactly what COMMIT does (js/main.js commit()), without the screen
    const t = performance.now();
    const out = orders.commitOrders(state, engine);
    const actions = [...out.actions];
    turn.endPhase(out.state, engine, { record: (a, s) => actions.push({ ...a, after: orders.snapshot(s) }) });
    return { ms: performance.now() - t, actions: actions.length };
  });
}

async function run() {
  const browser = await playwright.chromium.launch();
  const results = {};
  for (const view of views) {
    const rows = [];
    for (let round = 0; round < ROUNDS; round++) {
      const { context, page, cdp } = await newPage(browser, view);
      page.on('pageerror', (e) => console.error('page error:', e.message));
      const load = await measureLoad(page);
      await page.waitForTimeout(500);
      const pan = await measurePan(page, cdp);
      const pinch = await measurePinch(page, cdp);
      const tap = await measureTap(page, cdp);
      let ai = null;
      try { await dismissPopups(page); ai = await measureAi(page); if (ai.ms === null) { console.error('ai:', ai.why); ai = null; } else ai = ai.ms; } catch (e) { console.error('ai:', e.message); }
      const commit = await measureCommit(page);
      rows.push({ load, pan, pinch, tap, commit, ai });
      await context.close();
      process.stderr.write(`${view} round ${round + 1}: ${JSON.stringify({ load: r0(load.total), pan: r0(pan.fps), pinch: r0(pinch.fps), tap: tap && r0(tap.feedback), commit: r0(commit.compute), ai: ai && r0(ai) })}\n`);
    }
    results[view] = {
      titleReady: r0(median(rows.map((r) => r.load.title))),
      beginToMap: r0(median(rows.map((r) => r.load.begin))),
      firstPlayable: r0(median(rows.map((r) => r.load.total))),
      panFps: r0(median(rows.map((r) => r.pan.fps))),
      panWorstFrame: r0(median(rows.map((r) => r.pan.worst))),
      pinchFps: r0(median(rows.map((r) => r.pinch.fps))),
      pinchWorstFrame: r0(median(rows.map((r) => r.pinch.worst))),
      tapFeedback: r0(median(rows.filter((r) => r.tap).map((r) => r.tap.feedback))),
      commitToPlayback: r0(median(rows.map((r) => r.commit.compute))),
      playback: r0(median(rows.map((r) => r.commit.playback))),
      playbackFps: r0(median(rows.map((r) => r.commit.fps))),
      aiTurn: r0(median(rows.filter((r) => r.ai !== null).map((r) => r.ai))),
    };
  }
  await browser.close();
  console.log(JSON.stringify({ throttle: THROTTLE, rounds: ROUNDS, results }, null, 2));
}

run().catch((e) => { console.error(e); process.exit(1); });
