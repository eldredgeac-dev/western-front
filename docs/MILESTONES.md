# Milestones — Western Front 1914–18, Version 1

Do one milestone per Claude Code session. For each one:
1. Start in **plan mode** (Shift+Tab in Claude Code), read the plan, approve it.
2. Let it build, then ask: *"Explain what you changed and why, in plain English."*
3. Test it on your phone using the checklist.
4. If it passes, say: *"Commit and push milestone N."* Tick the box here.

---

- [ ] **1. Skeleton and deploy**
  - A title screen ("Western Front 1914–18", New Game and Continue buttons) loads at
    `https://<username>.github.io/<repo>/` in Safari.
  - It fits folded and unfolded, and nothing hides under the notch or home bar.
  - The README explains how to turn on GitHub Pages and how to run it locally.

- [ ] **2. Map from data**
  - All sectors in `data/sectors-west.json` are drawn as an SVG map, from the coast in
    the north to Switzerland in the south.
  - Tapping a sector highlights it and shows its name, owner, terrain, trench level and
    victory points.
  - Each terrain type from RULES.md §3 (flooded, ridge, mud, chalk, open, forest,
    mountains, fortress) has its own colour or pattern, plus a small legend.
  - Small sectors are still easy to tap. Fold/unfold re-lays out the screen correctly.
  - `docs/DATA.md` describes every data file. A test checks that sector adjacency goes
    both ways and every id exists.

- [ ] **3. Units and selection**
  - The 1914 scenario places all starting units, shown as counters with strength.
  - Tapping a sector lists its units. Selecting a unit highlights the sectors it can
    move into.
  - Stacking limit from RULES.md is enforced.

- [ ] **4. Turn loop, movement and rail**
  - You can give move and rail orders, then press "End Phase" to step through the
    phases in RULES.md.
  - The turn number and date (Aug 1914, Sep 1914…) go up. The log shows what happened.
  - Trenches dig in on sectors that weren't attacked, up to the current maximum.

- [ ] **5. Combat**
  - Attacks spend offensive points (and munitions for barrages), resolve on the 2d6
    combat table, and change unit strength and sector ownership.
  - Before committing an attack, the screen shows the column, the chance of taking the
    box, expected losses, and every shift that applied (terrain, national traits, unit
    quality, trench, winter).
  - Terrain and national traits (RULES.md §3–4) all work. The averages table in §9.3 is a
    passing test.
  - `tests/tests.html` is all green, including "same seed gives the same result".

- [ ] **6. Supply, replacements, national will**
  - Out-of-supply units can't attack and lose strength.
  - Replacement points rebuild steps. National will changes as RULES.md says, and is
    shown as a bar for each nation.

- [ ] **7. Save, export, import**
  - Auto-saves at the end of every turn. Closing and reopening the app resumes the game.
  - Export makes a file (share sheet or download). Import restores it exactly.
  - A bad file shows a friendly error instead of breaking the game.

- [ ] **8. Events and computer opponent**
  - Dated events from `data/events.json` fire on time (gas, tanks, US entry, Russia
    leaves the war…) and appear in the log as a pop-up.
  - The computer side moves, attacks, repairs units and stops attacking at bad odds.
  - A full game can be played to an end condition from RULES.md, as either side.
  - The New Game screen offers the 4 difficulty levels (RULES.md §13) and a side choice.
    The Recruit advisor warnings work.
  - The running Armistice Score shows on the main screen. A "Nations" screen lists each
    nation's traits.

- [ ] **9. Commander cards**
  - Each nation shows its current commander card (silhouette portrait, name, Strength,
    Flaw) on the Nations screen.
  - All the effects in RULES.md §15 work, each with a test.
  - Historical changes ask "Replace X with Y?". Sacking works, with its Will cost. The
    computer follows history.

- [ ] **10. Newspaper, Butcher's Bill and Real Voices**
  - A newspaper front page appears at the end of every turn: the masthead for your side,
    a generated headline (with `data/headlines.json` templates), propaganda spin, the
    Butcher's Bill line, and 2–3 real headlines from `data/news.json`.
  - Butcher's Bill totals on the Nations screen, with milestone headlines.
  - Quotes from `data/quotes.json` appear once each when triggered.
  - The Newspaper Archive keeps the last 12 papers.
  - An end-of-game report card compares your war with history.
  - Styling: aged paper, a serif headline font, a column layout that fits folded and
    unfolded.

- [ ] **11. Home-screen polish**
  - A manifest and icon let it launch full screen from the home screen.
  - A short second scenario (Spring 1918, about 9 turns) added using **only data files**
    — proof the design can grow.

---

## Version 2 and later (don't build yet)
- V2: Economy — spend production points on new units (Axis & Allies style).
- V3: Eastern Front and Russia, so Germany fights on two fronts.
- V4: More nations (Austria-Hungary, Italy, Ottomans), naval blockade and U-boats.

## Later ideas
(Claude Code: add ideas here instead of building them.)
