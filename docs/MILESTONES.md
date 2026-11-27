# Milestones — Western Front 1914–18, Version 1

Do one milestone per Claude Code session. For each one:
1. Start in **plan mode** (Shift+Tab in Claude Code), read the plan, approve it.
2. Let it build, then ask: *"Explain what you changed and why, in plain English."*
3. Test it on your phone using the checklist.
4. If it passes, say: *"Commit and push milestone N."* Tick the box here.

---

- [x] **1. Skeleton and deploy**
  - A title screen ("Western Front 1914–18", New Game and Continue buttons) loads at
    `https://<username>.github.io/<repo>/` in Safari.
  - It fits folded and unfolded, and nothing hides under the notch or home bar.
  - The README explains how to turn on GitHub Pages and how to run it locally.

- [x] **2. Map from data**
  - All 72 boxes in `data/boxes-west.json` (12 lanes × 6 depth columns, RULES.md §2)
    are drawn as an SVG map, from the coast in the north to Switzerland in the south.
    Each box has an id like `l07-e3` (lane 7, column E3) and an explicit list of
    neighbours, so later fronts don't have to be a grid.
  - Tapping a box highlights it and shows its name, owner, terrain, trench level and
    victory points.
  - Each terrain type from RULES.md §3 (flooded, ridge, mud, chalk, open, forest,
    mountains, fortress) has its own colour or pattern, plus a small legend.
  - Small boxes are still easy to tap. Fold/unfold re-lays out the screen correctly.
  - `docs/DATA.md` describes every data file. A test checks that box adjacency goes
    both ways and every id exists.

- [x] **3. Units and selection**
  - The 1914 scenario places all starting units, shown as counters with strength.
  - Tapping a box lists its units. Selecting a unit highlights the boxes it can
    move into.
  - Stacking limit from RULES.md is enforced.

- [x] **4. Turn loop, movement and rail**
  - You can give move and rail orders, then press "End Phase" to step through the
    phases in RULES.md.
  - The turn number and date (Dec 1914, Jan 1915…, 48 turns to Nov 1918) go up. The log shows what happened.
  - Trenches dig in on boxes that weren't attacked, up to the current maximum.

- [x] **5. Combat**
  - Attacks spend offensive points (and munitions for barrages), resolve on the 2d6
    combat table, and change unit strength and box ownership.
  - Before committing an attack, the screen shows the column, the chance of taking the
    box, expected losses, and every shift that applied (terrain, national traits, unit
    quality, trench, winter).
  - Terrain and national traits (RULES.md §3–4) all work. The averages table in §9.3 is a
    passing test.
  - `tests/tests.html` is all green, including "same seed gives the same result".
  - Every battle is recorded in the state as `battles` (territory, month, steps lost), so
    the map can show battle scars and pencil notes (docs/STYLE.md §13). The order screen
    shows the planned attack as a grease-pencil arrow.

- [ ] **6. Feel and sound**
  - The animations in docs/STYLE.md §8 that the UI overhaul (milestone 10) doesn't
    already cover: the Will gauge draining and the end-turn date flip. (Barrage, dice,
    losses and capture, skipping, fast mode and Reduce Motion are built in milestone 10.)
  - The sounds in docs/STYLE.md §9 (public domain or CC0, each under 100 KB, sources in
    `sounds/CREDITS.md`). Sound is on by default with a toggle on the top bar, and it
    respects the silent switch.
  - The interface details in docs/STYLE.md §13:
    - the desk lit by a warm lamp from the top left (a soft vignette);
    - commander cards sealed with a wax seal in the nation's colour;
    - drop caps and old-style numbers in the newspaper;
    - brass map pins marking your selected territory.

- [x] **7. Supply, replacements, national will**
  - Out-of-supply units can't attack and lose strength.
  - Replacement points rebuild steps. National will changes as RULES.md says, and is
    shown as a bar for each nation.

- [x] **8. Save, export, import**
  - Auto-saves at the end of every turn. Closing and reopening the app resumes the game.
  - Export makes a file (share sheet or download). Import restores it exactly.
  - A bad file shows a friendly error instead of breaking the game.

- [ ] **9. Events and computer opponent**
  - Dated events from `data/events.json` fire on time (gas, tanks, US entry, Russia
    leaves the war…) and appear in the log as a pop-up.
  - The computer side moves, attacks, repairs units and stops attacking at bad odds.
  - A full game can be played to an end condition from RULES.md, as either side.
  - The New Game screen offers the 4 difficulty levels (RULES.md §13) and a side choice.
    The Recruit advisor warnings work.
  - The running Armistice Score shows on the main screen. A "Nations" screen lists each
    nation's traits.
  - *Still to do (everything else here is built and checked):* the event pop-up
    (telegram) and the "Nations" screen with each nation's traits (it can become a page
    of the War Office in milestone 10).

- [ ] **10. UI overhaul** (built in this order)
  1. **Board-game pieces.** Counters become chunky, slightly 3D pieces (top bevel and
     shadow) with a silhouette per unit type in the nation colour, a clear strength
     number and quality badges. Stacks show as a small tower with a count. Pieces sit
     beside town names, never on top. The German cross is clear at every zoom.
  2. **A bigger map to explore.** More scenery drawn around the playing area (the same
     72 territories and neighbours). The map always fills the screen, starts zoomed in
     on the front, and has a small locator map.
  3. **Orders, then commit.** Moves and attacks are queued as grease-pencil arrows
     (dashed = move, red = attack with its odds); tap an arrow to cancel it. COMMIT
     ORDERS plays them out with animation: pieces slide, barrage flashes, dice roll,
     losses tick off, territories change colour, the front line redraws. The enemy's
     turn plays the same way. Every animation can be skipped, there's a fast mode, and
     the phone's Reduce Motion setting is honoured (STYLE.md §8).
  4. **The War Office.** A ledger screen (STYLE.md §6) with, for each nation: Will
     (gauge and trend), OP, munitions, replacements and rail this turn, units and
     strength, VP cities held, the Butcher's Bill (month and total), the current
     commander; plus the Armistice Score, active events, countdowns and a small
     strength-over-time chart.

- [x] **10b. The war economy** (RULES.md §19, Version 1.3, from docs/ECONOMY.md)
  - Manpower goes to replacements; Industry buys munitions (a stockpile of up to 3) or
    research. Unspent points are lost.
  - The War Office budget page at the start of each month: brass slider, research picker
    with progress bars, Auto-allocate (on by default on Recruit).
  - Research brings 7 techs early (2 that never happened); industrial cities change
    Industry when captured.
  - The War Office dashboard shows Manpower and Industry with trends, the stockpile as
    shells, research in progress with its expected month, and industrial cities.
  - German starting Will 108. The simulator includes the economy and was re-run.

- [x] **10c. Clearer play** (no rule changes)
  - The order slip explains itself: the roll needed on two dice, a strip showing what
    every roll would do, why the chance is what it is (e.g. dug in), and what would help.
  - BEST ATTACKS shows the three best attacks this phase on the map.
  - After each turn, a battle report for every attack; retreats and advances slide on
    the map.
  - A phase guide under the date; road moves outlined in brass, rail in blue, attackable
    enemy territories in red; MOVED / RAIL / ATK marks on pieces.
  - How to Play page, and a guided first turn (road move, rail move, stacked attack).

- [x] **10d. Road moves of 2, split and merge** (RULES.md Version 1.4)
  - A road move goes up to 2 territories through your own lines.
  - In your move phase, split a piece (leave a 1–2 step picket) or merge two pieces of the
    same nation and type. The computer merges its damaged pieces but never splits.

- [x] **10e. Phone layout** (no rule changes except when the budget page appears)
  - The top of the screen is two slim rows: a ☰ menu, the date and phase, and COMMIT;
    then a one-line phase guide (tap it for the full sentence). How to Play, the War
    Office, Auto-allocate, Fast mode and the title screen live in the ☰ menu.
  - Tapping a territory shows a compact tray: its name, one line of facts, and a row of
    its pieces to tap. The map stays visible above it. Territory details, column shifts,
    the dice strip, the war situation, dispatches and the map key are one tap away
    ("Details", "Why these odds") instead of always on screen.
  - The attack slip leads with a big "62% to take it" and the expected losses.
  - Each territory shows one big piece (at least 44 px when zoomed in) with the total
    steps and a ×N badge for the number of pieces, like an Axis & Allies stack.
  - Auto-allocate is on by default at every level. With it off, the budget page only
    appears in months when there is a real choice (research is open). RULES.md §19.4.
  - The phase guide no longer shows stale text while a turn plays back.

- [x] **10f. Board view, attack by moving in, A&A-style results**
  - **Board view** is the main playing view: the same 72 territories drawn as chunky,
    outlined regions that roughly follow the front (each at least 55–60 px on a phone),
    with the city name, a VP badge and one stack of pieces. It follows docs/STYLE.md
    (paper, ink, brass; a General Staff board, not a cartoon).
  - The historical map stays: a toggle switches between Board and Map, and the
    historical map is the zoomed-out overview, the locator and the background.
  - **C1: move into an enemy territory to attack.** In your turn, dragging or tapping
    units into an enemy territory queues an attack instead of a move (Axis & Allies
    "combat move"). Run `tools/levels.py` to confirm balance is unchanged and report
    any difference before changing RULES.md §8–9.
  - **C5: results the A&A way.** Keep the combat table engine. The attack slip and
    battle reports show the chance as one big number and the expected/actual losses
    as crossed-out pieces on each side.

- [ ] **11. Playtest and polish**
  - You play 3–4 full games (both sides, more than one difficulty).
  - We list everything that was boring or confusing, then fix it.
  - Every screen passes the "Is it cheesy?" checklist in docs/STYLE.md §11.

- [ ] **12. Commander cards** (built in Version 11.0; tick after the phone checks)
  - Each nation shows its current commander card (silhouette portrait, name, Strength,
    Flaw) on the Nations screen.
  - All the effects in RULES.md §15 work, each with a test.
  - Historical changes ask "Replace X with Y?". Sacking works, with its Will cost. The
    computer follows history.

- [ ] **13. Newspaper, Butcher's Bill and Real Voices**
  - A newspaper front page appears at the end of every turn: the masthead for your side,
    a generated headline (with `data/headlines.json` templates), propaganda spin, the
    Butcher's Bill line, and 2–3 real headlines from `data/news.json`.
  - Butcher's Bill totals on the Nations screen, with milestone headlines.
  - Quotes from `data/quotes.json` appear once each when triggered.
  - The Newspaper Archive keeps the last 12 papers.
  - An end-of-game report card compares your war with history.
  - Styling: aged paper, a serif headline font, a column layout that fits folded and
    unfolded.

- [ ] **14. Home-screen polish**
  - A manifest and icon let it launch full screen from the home screen.
  - A short second scenario (Spring 1918, about 9 turns) added using **only data files**
    — proof the design can grow.

---

## Version 2 and later (don't build yet)
- V2: The Axis & Allies turn. Each is a separate milestone with its own simulator
  re-run (`tools/wfsim.py`, `python3 tools/levels.py`) and a report on what changed:
  - **V2a (C2): Buy units with Industry.** A purchase step in the War Office; new units
    are placed in your rear cities. *(Built in Version 11.1, RULES.md §19.9; not ticked
    until it's checked on the phone. The computer Entente buys tanks only: DECISIONS.md 137.)* Part 1 of the economy (Manpower, Industry, munitions
    stockpile, research, industrial cities) is milestone 10b.
  - **V2b (C3): Income from territory.** Every named city pays Industry each month to
    whoever holds it (extending the industrial cities of §19.3), so taking ground pays.
  - **V2c (C4): Fewer kinds of points.** For example, an attack costs Industry instead
    of a separate Offensive Point, so there's one less number to track.
- V3: Eastern Front and Russia, so Germany fights on two fronts.
- V4: More nations (Austria-Hungary, Italy, Ottomans), naval blockade and U-boats.

## Pending rule fixes
Gaps in RULES.md found in the first session. Each has a suggested fix that matches
`tools/wfsim.py` where the simulator covers it. **Not agreed yet:** when we reach the
milestone in brackets, confirm the fix, then update RULES.md and the code together.

4. **[5, 12] Commander bonuses stack.** *(Built in milestone 12, RULES.md §15.2a.)* Haig's "+1 OP from 1916" and Hindenburg &
   Ludendorff's "+1 RP" are added on top of the §6 table (so GBR has 3 OP in 1916–17).
5. **[5] Mixed stacks and the French 75s.** The trait applies if any French unit is in
   the defending box.
6. **[5] Futile attacks in a coalition attack.** The nation with the most steps in the
   attack pays the 3 Will.
7. **[5] Empty enemy box.** No dice roll: it's captured automatically, still costs 1 OP,
   and needs an adjacent in-supply unit.
8. **[5] Tanks alone in a box.** The box counts as empty. If it's attacked, the tanks
   retreat, or are destroyed if they can't.
9. **[5] Retreats** respect the 3-unit stacking limit. If two boxes are equally deep, the
   player picks (the computer picks the first).
10. **[5] Taking losses.** Automatic in v1, strongest unit first. Choosing by hand is a
    later idea.
11. **[7] Rebuilt units (2 RP)** come back as the nation's basic infantry (US Infantry for
    the USA), Regular quality, in a rear box the player picks. Elite and Stormtrooper
    status is lost.
12. **[9] Elite is permanent** until the unit is destroyed. That covers the Old
    Contemptibles after Sir John French leaves, and the Dominion corps.
13. **[9] Hindenburg Line.** Units in G1 of lanes 5–8 move to G2 (or to G3 if G2 is
    full). Those G1 boxes become Entente-owned at trench 0. No Will change.
14. **[9] Reinforcements** go in a rear box of the player's choice with room (the computer
    picks at random). GBR goes in lanes 1–6 and the USA in lanes 9–12. If there's no room,
    the unit waits a turn.
15. **[7] Will rounding.** "1 per N steps, rounded down" is worked out each turn and the
    remainder is dropped. Belgian losses are counted separately against FRA.
16. **[7] USA Will reaching 0.** Nothing sudden happens, but US units can't attack while
    US Will is 0.
17. **[9, 12] Match RULES.md to the simulator.**
    - The AI stops attacking at "this turn's RP + 2", not next turn's.
    - The Kaiserschlacht gamble (now −20) and H&L's "last gamble" (−3 a month) both apply in
      1918. *(Built in milestone 12; the simulator now really applies the gamble,
      DECISIONS.md 121.)*

## Later ideas
- Let the player choose which unit takes each step loss (see pending fix 10).
- Let the player choose where their own RP go (repairs and rebuilds) on the Nations
  screen. For now they're spent automatically, as the computer does (DECISIONS.md 30).
- Let the player choose where reinforcements arrive, and which units become
  stormtroopers (DECISIONS.md 47, 50).
- The Recruit advisor also highlights weak friendly front boxes (RULES.md §13).
- A separate Research page reachable from the War Office at any time (for now the
  research ledger is at the bottom of the budget page, and progress is on the dashboard).
- A guided first turn as Germany too (the coach and its data already allow it).
- Find the rest of the gap between the game's computer and the simulator (DECISIONS.md
  98–101): in 1915–16 the game's computer attacks about half as often.
- With Auto-allocate on, a one-line notice when research first opens (Jan 1916), so a
  new player learns it exists without the budget page interrupting (milestone 10e).
- Some pieces with no room in a thin territory get pushed outside it on the campaign map
  (the Belgian piece on the Yser stands in the sea). The board (10f) gives every square a
  fixed spot; the map could get the same from tools/build-map.mjs.
- On a folded phone the locator covers the board's top-left square until you scroll;
  it could shrink or tuck away on the board.
- While a commander question or budget waits, the phase label shows the next phase
  ("War Office budget") rather than "Commanders"; it could name the question instead.
- Commander cards in the newspaper ("NIVELLE OUT — PÉTAIN TAKES COMMAND") come with
  milestone 13, and the wax seal on the cards with milestone 6.
- Bought units could be Green for their first month or two, like Kitchener's men
  (V2a keeps them Regular; it would need a balance re-run).
- A tap on a rear city tab could flash that city on the map, so you can see where it is.
- Find why extra pieces make the game's computer attack less (DECISIONS.md 101, 136),
  then let the computer Entente buy infantry again (delete `units.computerBuys`).
(Claude Code: add ideas here instead of building them.)
