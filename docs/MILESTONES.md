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

- [ ] **2. Map from data**
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

- [ ] **3. Units and selection**
  - The 1914 scenario places all starting units, shown as counters with strength.
  - Tapping a box lists its units. Selecting a unit highlights the boxes it can
    move into.
  - Stacking limit from RULES.md is enforced.

- [ ] **4. Turn loop, movement and rail**
  - You can give move and rail orders, then press "End Phase" to step through the
    phases in RULES.md.
  - The turn number and date (Dec 1914, Jan 1915…, 48 turns to Nov 1918) go up. The log shows what happened.
  - Trenches dig in on boxes that weren't attacked, up to the current maximum.

- [ ] **5. Combat**
  - Attacks spend offensive points (and munitions for barrages), resolve on the 2d6
    combat table, and change unit strength and box ownership.
  - Before committing an attack, the screen shows the column, the chance of taking the
    box, expected losses, and every shift that applied (terrain, national traits, unit
    quality, trench, winter).
  - Terrain and national traits (RULES.md §3–4) all work. The averages table in §9.3 is a
    passing test.
  - `tests/tests.html` is all green, including "same seed gives the same result".

- [ ] **6. Feel and sound**
  - The animations in docs/STYLE.md §8: barrage, dice, losses, capture, Will change and
    the end-turn date flip. None is longer than 1 second, every one can be skipped by
    tapping, and they're all off when the phone's Reduce Motion setting is on. A "fast
    mode" toggle removes everything except captures.
  - The sounds in docs/STYLE.md §9 (public domain or CC0, each under 100 KB, sources in
    `sounds/CREDITS.md`). Sound is on by default with a toggle on the top bar, and it
    respects the silent switch.

- [ ] **7. Supply, replacements, national will**
  - Out-of-supply units can't attack and lose strength.
  - Replacement points rebuild steps. National will changes as RULES.md says, and is
    shown as a bar for each nation.

- [ ] **8. Save, export, import**
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

- [ ] **10. Playtest and polish**
  - You play 3–4 full games (both sides, more than one difficulty).
  - We list everything that was boring or confusing, then fix it.
  - Every screen passes the "Is it cheesy?" checklist in docs/STYLE.md §11.

- [ ] **11. Commander cards**
  - Each nation shows its current commander card (silhouette portrait, name, Strength,
    Flaw) on the Nations screen.
  - All the effects in RULES.md §15 work, each with a test.
  - Historical changes ask "Replace X with Y?". Sacking works, with its Will cost. The
    computer follows history.

- [ ] **12. Newspaper, Butcher's Bill and Real Voices**
  - A newspaper front page appears at the end of every turn: the masthead for your side,
    a generated headline (with `data/headlines.json` templates), propaganda spin, the
    Butcher's Bill line, and 2–3 real headlines from `data/news.json`.
  - Butcher's Bill totals on the Nations screen, with milestone headlines.
  - Quotes from `data/quotes.json` appear once each when triggered.
  - The Newspaper Archive keeps the last 12 papers.
  - An end-of-game report card compares your war with history.
  - Styling: aged paper, a serif headline font, a column layout that fits folded and
    unfolded.

- [ ] **13. Home-screen polish**
  - A manifest and icon let it launch full screen from the home screen.
  - A short second scenario (Spring 1918, about 9 turns) added using **only data files**
    — proof the design can grow.

---

## Version 2 and later (don't build yet)
- V2: Economy — spend production points on new units (Axis & Allies style).
- V3: Eastern Front and Russia, so Germany fights on two fronts.
- V4: More nations (Austria-Hungary, Italy, Ottomans), naval blockade and U-boats.

## Pending rule fixes
Gaps in RULES.md found in the first session. Each has a suggested fix that matches
`tools/wfsim.py` where the simulator covers it. **Not agreed yet:** when we reach the
milestone in brackets, confirm the fix, then update RULES.md and the code together.

4. **[5, 11] Commander bonuses stack.** Haig's "+1 OP from 1916" and Hindenburg &
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
17. **[9, 11] Match RULES.md to the simulator.**
    - The AI stops attacking at "this turn's RP + 2", not next turn's.
    - The Kaiserschlacht gamble (−15) and H&L's "last gamble" (−3 a month) both apply in
      Mar–Jul 1918.

## Later ideas
- Let the player choose which unit takes each step loss (see pending fix 10).
(Claude Code: add ideas here instead of building them.)
