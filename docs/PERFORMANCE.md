# Performance

How quick the game feels on a phone, measured before and after the performance pass
(release 10.8). No rules or gameplay changed.

## How it was measured

`tools/perf.mjs` opens the game in headless Chromium at iPhone size (390 × 844, touch,
3× pixels) with the CPU **slowed down 4×** (Chrome DevTools' "4× slowdown", roughly a
mid-range phone). It starts an Entente game at Regular on a fixed seed, waits for the
opening playback to finish, then measures. Each number is the middle of 3 runs.

```bash
python3 -m http.server 8123 &
node tools/perf.mjs            # or: node tools/perf.mjs map   (one view only)
```

What each row means:

- **First playable map**: page start → title screen ready, plus BEGIN → map and pieces
  drawn.
- **Pan / pinch fps**: frames per second while one finger drags (or two fingers pinch)
  for about 1.5 seconds. "Worst frame" is the longest single frame.
- **Tap feedback**: finger down on a territory → the frame that shows the brass outline.
  The test holds the finger down for 60 ms, like a quick tap. Before, the outline only
  came when the finger lifted, so those 60 ms are part of the "before" number.
- **Commit → playback**: COMMIT ORDERS → the playback starts. This covers the rules,
  the computer's turn and saving.
- **Playback**: the whole turn played back, and its frame rate. Most of the time is
  deliberate pauses (STYLE.md §8).
- **AI turn**: the computer's whole turn on its own (`commitOrders` + `endPhase`), with
  no drawing.

Caveat: this is Chromium on a Linux server, not Safari on an iPhone. The CPU is slowed,
but graphics are drawn in software, so absolute numbers will differ on the phone. The
before/after comparison is the useful part.

## Results (4× CPU slowdown)

| | Board before | Board after | Map before | Map after | Target |
|---|---:|---:|---:|---:|---|
| Title screen ready | 985 ms | 942 ms | 883 ms | 960 ms | |
| BEGIN → map drawn | 1251 ms | 890 ms | 1623 ms | 1089 ms | |
| **First playable map** | 2268 ms | **1847 ms** | 2505 ms | **2049 ms** | < 2 s |
| **Pan** | 50 fps | **60 fps** | 22 fps | **56 fps** | ≥ 30 fps throttled |
| Pan, worst frame | 50 ms | 17 ms | 233 ms | 83 ms | |
| **Pinch zoom** | 16 fps | **54 fps** | 19 fps | **53 fps** | ≥ 30 fps throttled |
| Pinch, worst frame | 233 ms | 100 ms | 483 ms | 183 ms | |
| **Tap feedback** | 143 ms | **26 ms** | 235 ms | **23 ms** | < 100 ms |
| Commit → playback | 144 ms | 120 ms | 357 ms | 144 ms | |
| Playback (whole turn) | 16.2 s | 14.7 s | 20.9 s | 15.3 s | |
| Playback frame rate | 48 fps | 56 fps | 36 fps | 52 fps | |
| **AI turn** | 78 ms | 99 ms | 70 ms | 71 ms | < 1 s |

The board and the map views are measured separately (the Map / Board button).

Every target is met except one: the campaign map's first load is 2.05 s, just over the
2 s target. The rest of that time is the browser laying out the 1 MB map picture for
the first time (see "Not done" below). The AI turn was already fast, and it hasn't
changed (70–100 ms is run-to-run noise).

## What was slow, and what changed

1. **The whole map was redrawn on every frame of a drag or pinch.** Pan and zoom changed
   the SVG's `viewBox`, so the browser redrew the 1 MB map every frame. After every frame
   the game also re-measured every label (to hide ones that overlap) and re-placed every
   stack of pieces. That placement alone took about 4 seconds of CPU per pan on the map.
   *Now* (`js/ui/zoom.js`) the map is drawn once, a quarter of the screen bigger on every
   side. A drag or pinch just slides and stretches that picture with a CSS transform
   (`translate3d` / `scale`, `will-change: transform`), which the graphics chip does
   for free. The SVG is redrawn and the labels and pieces tidied **once**, when the
   finger lifts. It also redraws mid-gesture if you drag past the extra margin or zoom
   a long way, so the edge never stays empty. The small locator map still follows every
   frame, because it's cheap.

2. **The front line was re-measured on every redraw.** The trench marks are spaced along
   each border using the browser's `getPointAtLength`, thousands of calls on every
   redraw, including every step of the playback. *Now* (`js/ui/map.js`) the points are
   worked out in plain JavaScript (borders are straight-line paths) and kept, because
   borders never change shape. The results match the browser's to within 0.01 map
   units.

3. **Every update redrew every layer.** *Now* each layer remembers what it last drew
   (owners, trench levels, battle scars, pencil notes) and is only redrawn when that
   changes. Piece stacks are only rebuilt for territories whose units changed.

4. **Piece placement was slow, and reads and writes were mixed.** Placing each stack
   checked it against every label on the map, and wrote changes in between reading
   sizes, which makes the browser lay out the page again each time. *Now* each stack
   only checks things near its own town, and all sizes are read before any change is
   made. Label tidying (`declutter`) works the same way. Pieces end up in the same
   places as before.

5. **The selected territory's pulse redrew the whole map 60 times a second** for as long
   as anything was selected, because it animated the outline's `stroke-opacity` inside
   the big SVG. *Now* the outline is in a thin see-through SVG over the map, and the
   pulse fades that layer's `opacity`, which the graphics chip does without redrawing
   the map. It looks the same.

6. **Taps waited for the finger to lift.** *Now* the brass outline appears on finger
   down (`onPress`). If the touch turns into a drag, the outline goes away again. What a
   tap *does* still happens when the finger lifts, as before.

7. **Sliding pieces in the playback redrew the map every frame.** *Now* a moving piece
   is drawn in its own small layer over the map and slid with a CSS transform.

8. **The hidden view did work nobody could see.** Labels and pieces on the view that
   isn't on screen (Board or Map) are now tidied when you switch to it.

9. **Loading.** The map picture (the biggest file) now starts downloading as soon as
   `boxes-west.json` says where it is, not after all 15 data files. The fonts the first
   screens need are preloaded (`<link rel="preload">` in `index.html`). All the fonts
   were cut down to the characters the game uses (468 KB → 347 KB, fonts/CREDITS.md).

10. **Animations.** The Will gauge in the War Office used to animate its `width`; it
    now uses `transform: scaleX`. The other animations already used only
    transform/opacity: the panel sheet, telegrams, dice, shake, barrage puffs and the
    loss numbers. The one exception is the captured territory's colour cross-fade
    (`fill`, 0.6 s), which was kept because it's short and only runs on a capture.

## Checked and fine as it was

- **SVG filters**: the map has none (no feTurbulence, blur or drop-shadow).
  The map does use masks to fade the territories, terrain and relief into the paper at
  the edge of the theatre. A mask is costly to draw, but the map is now only redrawn
  when a gesture ends or the war changes, not while it moves.
- **Static layers**: the map's geography, labels and paper texture are no longer
  redrawn while panning or zooming. During a gesture the graphics chip reuses the
  picture it already drew, which is what pre-drawing them into an image would give.
  Baking them into one bitmap would have blurred the fine contour lines and trench
  lines when zoomed right in, so they stay vector and are just drawn less often.
- **300 ms tap delay**: none. The viewport tag (`width=device-width`) and
  `touch-action: manipulation` (buttons) / `none` (map) remove it.
- **Passive listeners**: there are no touch listeners; the map uses pointer events,
  which can't block scrolling. The one `wheel` listener must stay non-passive, because
  it stops the page scrolling while you zoom with a mouse or trackpad.
- **AI turn**: 70–100 ms at 4× slowdown, far under 1 s. A Web Worker or chunking isn't
  needed. The computer's orders are already shown as arrows, group by group, as they
  play back.
- **Memory leaks**: each screen's listeners are on elements that are replaced when it
  closes (panel, War Office, budget, help, telegrams), so they're freed with them. The
  map views, zoom and playback are made once per page and reused. The puff and float
  timers remove their own elements. The animation loops (glide, playback) stop
  themselves.
- **Images and sounds**: there are no sounds. The only image is the map SVG (1 MB, about
  370 KB as sent by GitHub Pages, which compresses it). The title screen shows it with
  `decoding="async"`.

## Not done (ideas for later)

- The campaign map's first load (2.05 s) is mostly the browser laying out the 1 MB SVG,
  about 260 territory shapes and 400 KB of contour lines. To get it under 2 s,
  `tools/build-map.mjs` could write fewer points per line (simplify the contours and
  coastlines), or split the near-zoom-only contours into a file loaded later.
- If the playback ever feels heavy on an older phone, the capture colour cross-fade
  could become an opacity fade of a copy of the territory.

## The board as a map of territories (Version 11.3, 28 November 2026)
The board's squares became wavy, shaped territories (milestone 10g). Its borders now have
10 segments each instead of 1, which gives the front line and trenches more points to
draw. Measured with `node tools/perf.mjs board` (3 rounds, medians), old (main) and new
on the same machine:

| Board | Before (squares) | After (territories) | Target |
|---|---:|---:|---|
| **First playable board** | 1727 ms | **1856 ms** | < 2 s |
| Pan | 60 fps | 60 fps | ≥ 30 fps throttled |
| Pinch zoom | 56 fps | 56 fps | ≥ 30 fps throttled |
| **Tap feedback** | 31 ms | **22 ms** | < 100 ms |
| Commit → playback | 106 ms | 104 ms | |
| Playback frame rate | 56 fps | 57 fps | |
| **AI turn** | 54 ms | 58 ms | < 1 s |

Every target is met. First load is about 0.13 s slower, with about 0.15 s to spare. If a
later change pushes it over 2 s, cut each border from 10 segments to 6 (`wavyLine` in
`js/ui/board.js`).
