# Decisions and questions (overnight work)

**Summary:**
- Milestones 3 (units and selection) and 4 (turn loop, movement, rail) are built,
  with their screens.
- The combat engine of Milestone 5 is built, with no screens yet.
- So are `data/commanders.json` and `data/headlines.json`.
- 82 tests pass. The combat table test reproduces the RULES.md §9.3 averages exactly.
- The three questions for you are under **Questions for you**. The things to try on the
  phone are in **Check on my phone** at the end.

While you were away I worked through Milestones 3 and 4 and the combat engine of
Milestone 5 on the branch `claude/laughing-faraday-6gey0m`. Wherever the rules or your
instructions left something open, I made the most reasonable choice and wrote it down
here. Nothing tagged [balanced] in RULES.md was changed.

Each entry says **what** I chose and **why**. If you disagree, tell me the number and
I'll change it.

## Decisions

### Process
1. **One pull request.** This branch already had pull request #4 (the map). GitHub only
   allows one open pull request per branch, so I updated #4 to cover all of tonight's work
   instead of opening a second one.
2. **Milestone 2 isn't ticked** in MILESTONES.md, because you haven't checked it on the
   phone yet. Milestones 3–5 are built but also not ticked, for the same reason.

### Milestone 3: units and selection
3. **Starting quality.** All starting units are Regular. Sir John French's "Old
   Contemptibles" make the 2 British units Elite, but that's a commander card (Milestone
   11). It will switch on then.
4. **Rail moves for the USA and Belgium are 0.** RULES.md §8 only lists GER 3, FRA 2 and
   GBR 1.
5. **France's munitions in December 1914 are 2.** RULES.md §6 lists 2 / 3 / 4 / 5 for
   1915–18 but nothing for the single 1914 turn, so I used the 1915 value.
6. **Counters scale with zoom.** Zoomed out, each territory shows one small marker in the
   colour of its top unit, with the number of units. From mid zoom you see the real
   counters (STYLE.md §5), which stay about 30px on screen when fully zoomed in. Taps go
   through counters to the territory underneath, so a tap always selects a territory.
   Its units are then listed in the panel.
7. **Unit names** use an adjective ("French infantry"), so `nations.json` gained an
   `adjective` field.

### Milestone 4: turn loop, movement and rail
8. **You give orders for both sides for now.** Until the computer opponent arrives
   (Milestone 9), End Phase steps through German move → German attack → Entente move →
   Entente attack. In each phase you can move that side's units: hot-seat, so you can test
   both.
9. **Phases that belong to later milestones are already in the list** (`data/phases.json`)
   but do nothing yet: events and reinforcements (9), supply losses, replacements and Will
   (7), newspaper (12). Reinforcements are in RULES.md §10 with the events, so they come
   with Milestone 9.
10. **One move per unit per turn:** either a normal move or a rail move, not both.
    RULES.md doesn't say whether a unit can do both; one move is simpler and matches
    `tools/wfsim.py`.
11. **A rail move can end anywhere joined by friendly boxes**, including next door (it
    just uses a rail move). Rail doesn't check supply.
12. **How to move:** select a unit in the panel, then tap a brass-outlined territory. If
    the territory is next door, it's a normal move; otherwise a rail move, which uses one
    of the nation's rail moves.
13. **Turn 48 (November 1918):** after its last phase the game shows "The war is over",
    and End Phase is greyed out. The Armistice Score and victory check come with
    Milestone 7.
14. **Dispatches:** the log shows the last 8 lines in the panel, newest first, in the
    typewriter font.

### Milestone 5: the combat engine (no screens yet)
15. **Built to RULES.md.** The combat table is copied from RULES.md §9.3, and a test checks
    it reproduces the §9.3 averages exactly (1:2 → 2.75 / 0.86 / 0% … 4:1 → 0.58 / 3.28 /
    83%). See question 1 about the simulator.
16. **The pending rule fixes in MILESTONES.md** that combat needs are built as suggested
    there:
    - French 75s count if any French unit defends (fix 5).
    - An empty box is taken with no roll for 1 OP (fix 7).
    - Tanks alone count as empty and fall back (fix 8).
    - Retreats go to the deepest friendly box with room, first in the list if equal
      (fix 9).
    - Losses come off the strongest unit first, automatically (fix 10).
17. **Who pays.** The nation with the most attacking steps pays the OP (1, or 2 for a
    coalition) and the munitions, and takes the 3 Will if the attack is futile. This
    matches pending fix 6. RULES.md doesn't say whose OP a coalition spends.
18. **The attacker advances automatically** with its 2 strongest surviving units. RULES.md
    says "may advance up to 2". Choosing which units (or not advancing) can come with the
    attack screen.
19. **Paris and the Channel Ports.** Their extra Will (FRA −25 and GER +10; GBR −15) is
    added on top of the normal VP change, as `tools/wfsim.py` does.
20. **Tanks on two terrains.** If a box had two terrains that change the tank bonus, the
    smaller bonus counts. No box has that today.
21. **Supply in combat.** Attackers must be in supply (`supply.js`). Losing steps for
    being out of supply comes with Milestone 7.
22. **Not yet built (later milestones):**
    - Will from step losses each month, Will on capture of unnamed boxes (none in the
      rules), and the victory check (Milestone 7).
    - Event shifts like the April 1915 gas attack (Milestone 9). The engine already
      accepts them as `extraShifts`.
    - Commander effects (Milestone 11).
    - The attack screen and its animations (Milestones 5–6).

### Side jobs: commanders and headlines (data only, no code yet)
23. **`data/commanders.json`** holds all nine §15 cards.
    - Each Strength and Flaw has machine-readable `effects` for Milestone 11, and each card
      has a short history note taken from HISTORY.md.
    - Foch's card is marked as "added alongside" the national cards, and Pershing's start
      date is "when the USA enters".
24. **`data/headlines.json`** has 2–3 versions of every §17 headline type, each with a
    headline and a line under it.
    - Where it matters, there are "ours" and "theirs" versions, so your own paper can spin
      bad news ("LINE ADJUSTED AT the Somme").
    - All the wording is in English, including for the German paper (DIE KRIEGSZEITUNG),
      because the game is in English.

## Questions for you
1. **The simulator's combat table is different from RULES.md.** `tools/wfsim.py`
   (`TABLE0`) doesn't match RULES.md §9.3. For example, at 1:2 on a roll of 2–4 the
   simulator has A3 D0 where RULES.md has A4 D0, and its 1:2 averages come out at about
   2.39 / 1.00 instead of 2.75 / 0.86. RULES.md's own averages match its own table, so I
   built the game to RULES.md. **Which one was the balance testing done with?** If it was
   the simulator's, the [balanced] numbers may need re-checking against the real table.
2. **The simulator's starting German Will is 80** (`DEFAULT['will']`), but RULES.md §11
   says 105. I used 105. Perhaps `levels.py` overrides it; worth a look when the balance is
   re-run.
3. **Commander and headline wording.** I wrote the headline templates and the card
   nicknames ("The healer", "Black Jack"…) myself, in a 1916 newspaper tone. Do they fit
   what you had in mind?

## Check on my phone
- [ ] **Counters.** Start a New Campaign and zoom in with **+** three times. Each front
      territory should show a small counter with a cockade, roundel or cross in the top
      left, an X-in-a-box symbol and 4 dots. Zoomed out, you should see small numbered
      squares instead.
- [ ] **Selecting a unit.** Tap Verdun. The sheet lists "French infantry, 4 of 4 steps ·
      Regular". Tap that row: it gets a brass border, and the map outlines 3 territories
      in solid brass and many more in dashed brass. Tap the row again to clear it.
- [ ] **Top bar.** It shows the date with the phase underneath ("German move") and a brass
      **END PHASE** button on the right. It should fit on the folded phone without
      squashing the date.
- [ ] **Moving.** In "German move", tap a German territory, tap its unit, close the sheet
      (swipe it down) and tap a brass-outlined territory next door. The counter moves, and
      "Dispatches" in the panel says so. Try a dashed one too (a rail move).
- [ ] **Counter details.** At full zoom: is the German cross pattée (top-left mark) clear
      enough? It's small and dark on field grey. Counters also sit over their own town's
      name. Tell me if you'd rather they sat beside it.
- [ ] **End Phase.** Tap **END PHASE** four times: the label should go German attack →
      Entente move → Entente attack → back to German move, and the date to January 1915.
